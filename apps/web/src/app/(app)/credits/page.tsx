"use client";

import { useEffect, useState } from "react";
import type { TransactionListResponse, WalletDto } from "@rendervid/shared";
import { PACKS } from "./packs";

export default function CreditsPage() {
  const [wallet, setWallet] = useState<WalletDto | null>(null);
  const [history, setHistory] = useState<TransactionListResponse | null>(null);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const [w, t] = await Promise.all([fetch("/api/credits/wallet").then((r) => r.json()), fetch("/api/credits/transactions").then((r) => r.json())]);
    setWallet(w as WalletDto);
    setHistory(t as TransactionListResponse);
  }

  useEffect(() => {
    void load();
  }, []);

  async function buy(packId: string) {
    setBuying(packId);
    setNotice(null);
    try {
      const res = await fetch("/api/billing/checkout/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const body = await res.json();
      if (res.ok && body.checkoutUrl) {
        window.location.href = body.checkoutUrl;
        return;
      }
      setNotice(body?.error?.message ?? "Payments are not configured yet.");
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-white">Credits</h1>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Available" value={wallet?.availableCredits ?? "—"} />
        <Stat label="Paid" value={wallet?.paidCredits ?? "—"} />
        <Stat label="Bonus" value={wallet?.bonusCredits ?? "—"} />
        <Stat label="Reserved" value={wallet?.reservedCredits ?? "—"} />
      </div>

      {notice && <p className="mt-6 rounded-xl border border-ink-800 bg-ink-900 p-4 text-sm text-fog-200">{notice}</p>}

      <h2 className="mt-12 text-xl font-semibold text-white">Top up</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {PACKS.map((p) => (
          <div key={p.id} className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
            <div className="text-lg font-semibold text-white">{(p.credits + p.bonusCredits).toLocaleString()}</div>
            <div className="text-sm text-fog-400">credits</div>
            <button
              onClick={() => buy(p.id)}
              disabled={buying !== null}
              className="mt-4 w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-50"
            >
              {buying === p.id ? "Redirecting…" : `$${(p.priceUsdCents / 100).toFixed(0)}`}
            </button>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-xl font-semibold text-white">History</h2>
      <div className="mt-4 divide-y divide-ink-800 rounded-2xl border border-ink-800 bg-ink-900">
        {history?.items.length === 0 && <div className="p-5 text-fog-400">No transactions yet.</div>}
        {history?.items.map((t) => (
          <div key={t.id} className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm text-white">{t.description}</div>
              <div className="text-xs text-fog-400">{new Date(t.createdAt).toLocaleString()}</div>
            </div>
            <div className={`text-sm font-semibold ${t.amount > 0 ? "text-emerald-400" : "text-white"}`}>
              {t.amount > 0 ? "+" : ""}
              {t.amount !== 0 ? t.amount : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4">
      <div className="text-xs uppercase tracking-wider text-fog-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}
