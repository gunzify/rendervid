"use client";

import { useEffect, useState } from "react";
import type { BillingDto, PlanDto } from "@rendervid/shared";

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingDto | null>(null);
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/billing").then((r) => r.json()), fetch("/api/billing/plans").then((r) => r.json())])
      .then(([b, p]) => {
        setBilling(b as BillingDto);
        setPlans((p as { plans: PlanDto[] }).plans ?? []);
      })
      .catch(() => undefined);
  }, []);

  async function subscribe(planId: string) {
    setBusy(planId);
    setNotice(null);
    try {
      const res = await fetch("/api/billing/checkout/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const body = await res.json();
      if (res.ok && body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
        return;
      }
      setNotice(body?.error?.message ?? "Payments are not configured yet.");
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const body = await res.json();
    if (res.ok && body.portalUrl) window.location.href = body.portalUrl;
    else setNotice(body?.error?.message ?? "Portal unavailable.");
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Billing</h1>
        {billing?.plan && billing.plan.id !== "free" && (
          <button onClick={openPortal} className="rounded-xl border border-ink-700 px-4 py-2 text-sm text-fog-200">
            Manage subscription
          </button>
        )}
      </div>

      {notice && <p className="mt-6 rounded-xl border border-ink-800 bg-ink-900 p-4 text-sm text-fog-200">{notice}</p>}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card title="Current plan" value={billing?.plan?.name ?? "Free"} />
        <Card title="Monthly credits" value={billing?.plan?.monthlyCredits?.toLocaleString() ?? "100"} />
        <Card title="Available credits" value={billing?.wallet.availableCredits.toLocaleString() ?? "—"} />
      </div>

      <h2 className="mt-12 text-xl font-semibold text-white">Plans</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {plans.map((p) => (
          <div
            key={p.id}
            className={`rounded-2xl border p-5 ${
              p.current ? "border-white bg-ink-900" : "border-ink-800 bg-ink-900/60"
            }`}
          >
            <div className="text-sm uppercase tracking-wider text-fog-400">{p.name}</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {p.monthlyPriceUsdCents === 0 ? "Free" : `$${p.monthlyPriceUsdCents / 100}`}
              <span className="text-sm font-normal text-fog-400">{p.monthlyPriceUsdCents > 0 ? "/mo" : ""}</span>
            </div>
            <div className="mt-1 text-sm text-fog-300">{p.monthlyCredits.toLocaleString()} credits/mo</div>
            <ul className="mt-4 space-y-1.5 text-xs text-fog-400">
              {p.features.slice(0, 4).map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
            {p.id !== "free" && !p.current && (
              <button
                onClick={() => subscribe(p.id)}
                disabled={busy !== null}
                className="mt-4 w-full rounded-xl bg-white py-2 text-sm font-semibold text-ink-950 disabled:opacity-50"
              >
                {busy === p.id ? "Redirecting…" : "Choose"}
              </button>
            )}
            {p.current && <div className="mt-4 text-center text-xs text-fog-400">Current plan</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
      <div className="text-xs uppercase tracking-wider text-fog-400">{title}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}
