"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<{
    user: { id: string; email: string; displayName: string; onboardingCompleted: boolean };
    plan: { planId: string; watermarkEnabled: boolean };
    wallet: { availableCredits: number };
  } | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => undefined);
  }, []);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-white">Settings</h1>

      <div className="mt-8 space-y-4">
        <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
          <div className="text-xs uppercase tracking-wider text-fog-400">Name</div>
          <div className="mt-1 text-white">{me?.user.displayName ?? "…"}</div>
        </div>
        <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
          <div className="text-xs uppercase tracking-wider text-fog-400">Email</div>
          <div className="mt-1 text-white">{me?.user.email ?? "…"}</div>
        </div>
        <div className="rounded-2xl border border-ink-800 bg-ink-900 p-5">
          <div className="text-xs uppercase tracking-wider text-fog-400">Plan</div>
          <div className="mt-1 capitalize text-white">{me?.plan.planId ?? "…"}</div>
        </div>
      </div>

      <button
        onClick={signOut}
        className="mt-8 rounded-xl border border-ink-700 px-5 py-2.5 text-sm text-fog-200 hover:border-fog-400"
      >
        Sign out
      </button>
    </div>
  );
}
