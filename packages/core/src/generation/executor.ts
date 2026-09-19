/**
 * Generation executor (PRD §32, §34, §37, §89, §92).
 *
 * submit → poll → settle:
 *   success: download outputs to storage, create assets, consume reservation
 *   failure: refund reservation, never silently
 * State transitions are validated; financial ops dedupe via ledger keys.
 */
import { getDb } from "../db/client.js";
import { generations, generationJobs, assets, models } from "../db/schema.js";
import { and, desc, eq, inArray } from "drizzle-orm";
import { assertTransition } from "@rendervid/shared";
import { getProvider, isRetryableProviderError } from "../providers/index.js";
import { consumeReservation, refundReservation } from "../credits/wallet.js";
import { getStorage, outputKey } from "../storage/storage.js";
import { enqueue } from "../jobs/queue.js";
import { trackEvent } from "../security/audit.js";
import { DomainError } from "../credits/errors.js";

const POLL_BASE_MS = 2_500;
const POLL_MAX_MS = 15_000;
const MAX_POLLS = 240; // ~30–60 min ceiling
const MAX_SUBMIT_ATTEMPTS = 3;

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function loadGeneration(generationId: string) {
  const db = getDb();
  const rows = await db.select().from(generations).where(eq(generations.id, generationId)).limit(1);
  const gen = rows[0];
  if (!gen) throw new DomainError("not_found", "Generation not found");
  return gen;
}

async function loadJob(generationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.generationId, generationId))
    .orderBy(desc(generationJobs.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export async function executeGeneration(generationId: string): Promise<void> {
  const db = getDb();
  const gen = await loadGeneration(generationId);
  const job = await loadJob(generationId);
  if (!job) throw new DomainError("internal_error", "Generation job row missing");

  if (!["credits_reserved", "queued", "created"].includes(gen.status)) {
    return; // already running/terminal — idempotent re-entry
  }

  const provider = getProvider();
  const modelRows = gen.modelId
    ? await db.select().from(models).where(eq(models.id, gen.modelId)).limit(1)
    : [];
  const model = modelRows[0];
  if (!model) {
    await failGeneration(generationId, "internal_error", "Selected model is no longer available", false);
    return;
  }

  // Resolve input image URLs for image-conditioned workflows (image-to-video etc.).
  let inputImageUrls: string[] = [];
  if (gen.inputAssetIds.length > 0) {
    const inputAssets = await db
      .select()
      .from(assets)
      .where(and(eq(assets.userId, gen.userId), inArray(assets.id, gen.inputAssetIds)));
    inputImageUrls = await Promise.all(
      inputAssets.map((a) => getStorage().signedUrl(a.storageKey, 3600)),
    );
  }

  const attempt = job.attempt;
  try {
    const handle = await provider.submit({
      providerModelId: model.providerModelId,
      endpointPath: model.endpointPath,
      prompt: gen.normalizedPrompt,
      inputImageUrls,
      durationSeconds: gen.durationSeconds,
      aspectRatio: gen.aspectRatio ?? "1:1",
    });

    await db
      .update(generationJobs)
      .set({
        status: "submitted",
        providerRequestId: handle.providerRequestId,
        statusUrl: handle.statusUrl,
        cancelUrl: handle.cancelUrl,
        lastPolledAt: new Date(),
      })
      .where(eq(generationJobs.id, job.id));

    await db
      .update(generations)
      .set({
        status: handle.initialStatus === "in_progress" ? "processing" : "submitted",
        providerRequestId: handle.providerRequestId,
        providerStatus: handle.initialStatus,
        startedAt: gen.startedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(generations.id, generationId));

    await schedulePoll(generationId, 0);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    let code = "provider_error";
    let retryable = false;
    try {
      const parsed = JSON.parse(raw) as { code?: string; status?: number; retryable?: boolean };
      if (parsed.code) code = parsed.code;
      if (typeof parsed.status === "number") retryable = isRetryableProviderError(parsed.status);
      if (parsed.retryable === true) retryable = true;
    } catch {
      /* non-JSON error */
    }

    if (retryable && attempt < MAX_SUBMIT_ATTEMPTS) {
      await db
        .update(generationJobs)
        .set({ attempt: attempt + 1, status: "pending", errorMessage: raw.slice(0, 500), retryable: true })
        .where(eq(generationJobs.id, job.id));
      const backoffMs = 5_000 * Math.pow(3, attempt - 1); // 5s, 15s, 45s
      await enqueue("generation", "execute", { generationId }, { delayMs: backoffMs });
      return;
    }
    await failGeneration(generationId, code, "The studio couldn't complete this creation. Please try again.", retryable);
  }
}

/* ------------------------------------------------------------------ */
/* Polling                                                             */
/* ------------------------------------------------------------------ */

export async function schedulePoll(generationId: string, pollIndex: number): Promise<void> {
  await enqueue("generation", "poll", { generationId, pollIndex }, { delayMs: pollIndex === 0 ? POLL_BASE_MS : undefined });
}

export async function pollGeneration(generationId: string, pollIndex: number): Promise<void> {
  const db = getDb();
  const gen = await loadGeneration(generationId);
  if (["succeeded", "failed", "canceled", "refunded"].includes(gen.status)) return;

  const job = await loadJob(generationId);
  if (!job?.providerRequestId) {
    await failGeneration(generationId, "internal_error", "Lost track of the provider job", false);
    return;
  }

  const provider = getProvider();
  let result;
  try {
    result = await provider.status(job.providerRequestId);
  } catch (err) {
    // Polling transport error — retry a few times before giving up.
    if (pollIndex < 10) {
      await enqueue("generation", "poll", { generationId, pollIndex: pollIndex + 1 }, { delayMs: POLL_BASE_MS * 2 });
      return;
    }
    await failGeneration(generationId, "provider_unavailable", "Lost connection to the studio while creating.", true);
    return;
  }

  await db
    .update(generationJobs)
    .set({ lastPolledAt: new Date(), status: "polling", outputs: null })
    .where(eq(generationJobs.id, job.id));

  switch (result.providerStatus) {
    case "completed": {
      if (result.outputs.length === 0) {
        await failGeneration(generationId, "empty_output", "The creation finished without output.", true);
        return;
      }
      await settleSuccess(gen, result.outputs);
      return;
    }
    case "failed":
    case "nsfw": {
      const userMessage =
        result.providerStatus === "nsfw"
          ? "This request was declined by content safety checks."
          : "The studio couldn't complete this creation.";
      await failGeneration(generationId, result.errorCode ?? result.providerStatus, userMessage, result.retryable);
      return;
    }
    case "canceled": {
      await failGeneration(generationId, "canceled", "The creation was canceled.", false);
      return;
    }
    case "queued":
    case "in_progress":
    default: {
      if (pollIndex >= MAX_POLLS) {
        await failGeneration(generationId, "timeout", "This creation took too long and was canceled.", true);
        return;
      }
      if (gen.status !== "processing") {
        await db
          .update(generations)
          .set({ status: "processing", providerStatus: result.providerStatus, updatedAt: new Date() })
          .where(eq(generations.id, generationId));
      }
      const delay = Math.min(POLL_BASE_MS * Math.pow(1.3, pollIndex), POLL_MAX_MS);
      await enqueue("generation", "poll", { generationId, pollIndex: pollIndex + 1 }, { delayMs: Math.round(delay) });
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Settlement                                                          */
/* ------------------------------------------------------------------ */

function extFor(kind: string): string {
  if (kind === "video") return "mp4";
  if (kind === "audio") return "mp3";
  return "png";
}

async function fetchOutput(url: string): Promise<{ data: Buffer; contentType: string }> {
  if (url.startsWith("mock://")) {
    // Dev placeholder content for the mock provider.
    return { data: TINY_PNG, contentType: "image/png" };
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`output_download_failed:${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

async function settleSuccess(
  gen: typeof generations.$inferSelect,
  outputs: Array<{ kind: string; url: string }>,
): Promise<void> {
  const db = getDb();
  const storage = getStorage();

  const created: Array<{ id: string }> = [];
  let index = 0;
  for (const out of outputs) {
    const { data, contentType } = await fetchOutput(out.url);
    const key = outputKey(gen.userId, gen.id, index, extFor(out.kind));
    await storage.put(key, data, contentType);
    const assetRows = await db
      .insert(assets)
      .values({
        userId: gen.userId,
        projectId: gen.projectId,
        type: out.kind === "video" ? "video" : out.kind === "audio" ? "audio" : "image",
        mimeType: contentType,
        storageKey: key,
        source: "generation",
        generationId: gen.id,
        fileSize: data.length,
      })
      .returning({ id: assets.id });
    if (assetRows[0]) created.push(assetRows[0]);
    index += 1;
  }

  await consumeReservation({
    userId: gen.userId,
    generationId: gen.id,
    reservedAmount: gen.reservedCredits,
    dedupeKey: `gen-charge:${gen.id}`,
    description: `Creation ${gen.contentType.toLowerCase()} — ${gen.reservedCredits} credits`,
  });

  const current = await loadGeneration(gen.id);
  assertTransition(current.status, "succeeded");
  await db
    .update(generations)
    .set({
      status: "succeeded",
      chargedCredits: gen.reservedCredits,
      completedAt: new Date(),
      updatedAt: new Date(),
      providerStatus: "completed",
    })
    .where(eq(generations.id, gen.id));

  await trackEvent(gen.userId, "generation_completed", { contentType: gen.contentType }, gen.id);
}

export async function failGeneration(
  generationId: string,
  errorCode: string,
  userMessage: string,
  _retryable: boolean,
): Promise<void> {
  const db = getDb();
  const gen = await loadGeneration(generationId);

  const current = await loadGeneration(generationId);
  if (["succeeded", "failed", "canceled", "refunded"].includes(current.status)) return;

  assertTransition(current.status, "failed");
  await db
    .update(generations)
    .set({
      status: "failed",
      errorcode: errorCode.slice(0, 100),
      errorMessage: userMessage,
      failureMessage: userMessage,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(generations.id, generationId));

  // Refund reserved credits (dedupeKey makes replays impossible) — PRD §89.
  if (gen.reservedCredits > 0 && gen.chargedCredits === null) {
    assertTransition("failed", "refunding");
    await db
      .update(generations)
      .set({ status: "refunding", updatedAt: new Date() })
      .where(eq(generations.id, generationId));

    await refundReservation({
      userId: gen.userId,
      generationId: gen.id,
      amount: gen.reservedCredits,
      dedupeKey: `gen-refund:${gen.id}`,
      description: `Refund — creation failed (${gen.reservedCredits} credits returned)`,
    });

    await db
      .update(generations)
      .set({
        status: "refunded",
        refundedCredits: gen.reservedCredits,
        completedAt: gen.completedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(generations.id, generationId));
  }

  await trackEvent(gen.userId, "generation_failed", { errorCode }, gen.id);
}

export async function cancelGeneration(generationId: string): Promise<void> {
  const db = getDb();
  const gen = await loadGeneration(generationId);
  if (["succeeded", "failed", "canceled", "refunded"].includes(gen.status)) return;

  const job = await loadJob(generationId);
  if (job?.providerRequestId) {
    const provider = getProvider();
    await provider.cancel(job.providerRequestId);
  }
  await failGeneration(generationId, "canceled", "You canceled this creation.", false);
}
