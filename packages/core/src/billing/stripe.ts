/**
 * Stripe billing (PRD §30–31, §121–122).
 * Credits are granted ONLY from verified webhooks — never from success_url.
 * Every grant dedupes on the Stripe event id.
 */
import Stripe from "stripe";
import { getDb } from "../db/client.js";
import { plans, payments, subscriptions, profiles, users, creditWallets } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { env } from "../env.js";
import { grantCreditsTx, grantCredits } from "../credits/wallet.js";
import { DEFAULT_CREDIT_PACKS } from "../config.js";
import { audit } from "../security/audit.js";
import { ensureLocalUser } from "../auth/auth.js";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = env.stripe().secretKey;
    if (!key) {
      throw new Error("Stripe is not configured. Set STRIPE_SECRET_KEY (see .env.example).");
    }
    stripe = new Stripe(key);
  }
  return stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(env.stripe().secretKey);
}

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */

export async function createCreditsCheckout(userId: string, packId: string): Promise<string> {
  const pack = DEFAULT_CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error(`Unknown credit pack: ${packId}`);

  const profile = await ensureStripeCustomer(userId);
  const client = getStripe();
  const session = await client.checkout.sessions.create({
    mode: "payment",
    ...(profile.stripeCustomerId ? { customer: profile.stripeCustomerId } : {}),
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: pack.priceUsdCents,
          product_data: { name: `RenderVid ${pack.name} — ${pack.credits + pack.bonusCredits} credits` },
        },
        quantity: 1,
      },
    ],
    metadata: {
      kind: "credits",
      userId,
      packId: pack.id,
      credits: String(pack.credits),
      bonusCredits: String(pack.bonusCredits),
    },
    success_url: `${env.appUrl()}/credits?status=success`,
    cancel_url: `${env.appUrl()}/credits?status=canceled`,
  });
  return session.url!;
}

export async function createSubscriptionCheckout(userId: string, planId: string): Promise<string> {
  const client = getStripe();
  const priceId = priceIdFor(planId);
  const profile = await ensureStripeCustomer(userId);
  const session = await client.checkout.sessions.create({
    mode: "subscription",
    ...(profile.stripeCustomerId ? { customer: profile.stripeCustomerId } : {}),
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: { metadata: { userId, planId } },
    metadata: { kind: "subscription", userId, planId },
    success_url: `${env.appUrl()}/billing?status=success`,
    cancel_url: `${env.appUrl()}/billing?status=canceled`,
  });
  return session.url!;
}

export async function createPortalSession(userId: string): Promise<string> {
  const profile = await ensureStripeCustomer(userId);
  if (!profile.stripeCustomerId) throw new Error("No Stripe customer for user");
  const client = getStripe();
  const session = await client.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${env.appUrl()}/billing`,
  });
  return session.url;
}

function priceIdFor(planId: string): string {
  const s = env.stripe();
  switch (planId) {
    case "creator":
      return s.priceCreator;
    case "pro":
      return s.pricePro;
    case "studio":
      return s.priceStudio;
    case "agency":
      return s.priceAgency;
    default:
      throw new Error(`Plan ${planId} has no Stripe price configured`);
  }
}

async function ensureStripeCustomer(userId: string): Promise<{ stripeCustomerId: string | null }> {
  const db = getDb();
  const rows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const profile = rows[0];
  if (!profile) throw new Error("Profile not found");
  if (profile.stripeCustomerId) return { stripeCustomerId: profile.stripeCustomerId };

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) throw new Error("User not found");

  const client = getStripe();
  const customer = await client.customers.create({
    ...(user.email ? { email: user.email } : {}),
    metadata: { userId },
  });
  await db.update(profiles).set({ stripeCustomerId: customer.id, updatedAt: new Date() }).where(eq(profiles.userId, userId));
  return { stripeCustomerId: customer.id };
}

/* ------------------------------------------------------------------ */
/* Webhooks (idempotent)                                               */
/* ------------------------------------------------------------------ */

export async function handleStripeWebhook(rawBody: Buffer, signature: string): Promise<{ handled: true }> {
  const client = getStripe();
  const whSecret = env.stripe().webhookSecret;
  if (!whSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

  const event = await client.webhooks.constructEventAsync(rawBody, signature, whSecret);

  // Idempotency: if we've seen this event, stop.
  const db = getDb();
  const seen = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, `evt:${event.id}`))
    .limit(1);
  if (seen.length > 0) return { handled: true };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await recordPaymentRow(event.id, session);
      if (session.metadata?.kind === "credits") {
        await grantFromCheckout(session);
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      await grantFromSubscriptionInvoice(event.id, invoice);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await markSubscriptionPastDue(invoice);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await upsertSubscriptionRow(event.data.object as unknown as Stripe.Subscription);
      break;
    }
    case "charge.refunded": {
      // Refund accounting is manual/support-driven in Phase 1; recorded as audit only.
      await audit({ actor: "system", action: "stripe_charge_refunded", targetType: "stripe_event", targetId: event.id });
      break;
    }
    default:
      break;
  }
  return { handled: true };
}

async function recordPaymentRow(eventId: string, session: Stripe.Checkout.Session): Promise<void> {
  const db = getDb();
  const userId = session.metadata?.userId;
  if (!userId) return;
  await db
    .insert(payments)
    .values({
      userId,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      stripeCheckoutSessionId: session.id,
      kind: session.metadata?.kind ?? "unknown",
      amountUsdCents: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      status: "paid",
      metadata: { eventId },
    })
    .onConflictDoNothing();
}

async function grantFromCheckout(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  if (!userId) return;
  const credits = Number(session.metadata?.credits ?? 0);
  const bonus = Number(session.metadata?.bonusCredits ?? 0);
  if (!Number.isFinite(credits) || credits <= 0) return;

  await ensureLocalUser({
    id: userId,
    ...(session.customer_details?.email ? { email: session.customer_details.email } : {}),
  });

  if (credits > 0) {
    await grantCredits({
      userId,
      amount: credits,
      pool: "paid",
      type: "PURCHASE",
      description: `Purchased ${credits} credits`,
      dedupeKey: `stripe:${session.id}:credits`,
    });
  }
  if (bonus > 0) {
    await grantCredits({
      userId,
      amount: bonus,
      pool: "bonus",
      type: "BONUS",
      description: `Bonus ${bonus} credits with purchase`,
      dedupeKey: `stripe:${session.id}:bonus`,
    });
  }
  await audit({
    actor: "system",
    action: "credits_purchased",
    targetType: "user",
    targetId: userId,
    metadata: { credits, bonus, sessionId: session.id },
  });
}

async function grantFromSubscriptionInvoice(eventId: string, invoice: Stripe.Invoice): Promise<void> {
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subId) return;

  const db = getDb();
  const subRows = await db.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, subId)).limit(1);
  const sub = subRows[0];
  if (!sub) return;

  const planRows = await db.select().from(plans).where(eq(plans.id, sub.planId)).limit(1);
  const plan = planRows[0];
  if (!plan) return;

  await grantCredits({
    userId: sub.userId,
    amount: plan.monthlyCredits,
    pool: "bonus",
    type: "SUBSCRIPTION",
    description: `${plan.name} plan — monthly credits`,
    dedupeKey: `stripe:${invoice.id}:subscription`,
  });
  await audit({ actor: "system", action: "subscription_credits_granted", targetType: "user", targetId: sub.userId, metadata: { planId: plan.id } });
}

async function markSubscriptionPastDue(invoice: Stripe.Invoice): Promise<void> {
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subId) return;
  const db = getDb();
  await db
    .update(subscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, subId));
}

async function upsertSubscriptionRow(subscription: Stripe.Subscription): Promise<void> {
  const db = getDb();
  const userId = subscription.metadata?.userId;
  const planId = subscription.metadata?.planId;
  if (!userId || !planId) return;

  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
    .limit(1);

  const values = {
    userId,
    planId,
    status: subscription.status,
    stripeSubscriptionId: subscription.id,
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.stripeSubscriptionId, subscription.id));
  } else {
    await db.insert(subscriptions).values(values);
  }

  // Keep watermark flag in profile in sync with plan.
  const planRows = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (planRows[0]) {
    await db
      .update(profiles)
      .set({ watermarkEnabled: planRows[0].watermarkEnabled, updatedAt: new Date() })
      .where(eq(profiles.userId, userId));
  }
  await audit({ actor: "system", action: "subscription_synced", targetType: "user", targetId: userId, metadata: { planId, status: subscription.status } });
}
