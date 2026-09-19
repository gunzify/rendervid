"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { EstimateResponse, CreateGenerationResponse, GenerationDto } from "@rendervid/shared";

const MODES = [
  { id: "auto", title: "Auto", desc: "Best balance of quality, speed and cost." },
  { id: "quality", title: "Quality", desc: "Prioritize maximum quality." },
  { id: "economy", title: "Economy", desc: "Prioritize lower generation cost." },
] as const;

const EXAMPLE_PROMPTS = [
  "A cinematic 10-second TikTok ad for my luxury black watch, dark studio lighting",
  "Product photo of a perfume bottle on marble in a Parisian hotel at sunrise",
  "YouTube thumbnail: dramatic neon city at night, bold contrast",
];

export default function CreatePage() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"auto" | "quality" | "economy">("auto");
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [generation, setGeneration] = useState<GenerationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshEstimate = useCallback(async () => {
    if (prompt.trim().length < 3) {
      setEstimate(null);
      return;
    }
    setEstimating(true);
    try {
      const res = await fetch("/api/generations/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode, assetIds: [] }),
      });
      const body = await res.json();
      if (res.ok) setEstimate(body as EstimateResponse);
    } finally {
      setEstimating(false);
    }
  }, [prompt, mode]);

  // Debounced live estimate.
  useEffect(() => {
    const t = setTimeout(refreshEstimate, 700);
    return () => clearTimeout(t);
  }, [refreshEstimate]);

  // Poll while a generation is active.
  useEffect(() => {
    if (!generation || ["succeeded", "failed", "refunded", "canceled"].includes(generation.status)) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/generations/${generation.id}`);
      if (res.ok) setGeneration((await res.json()) as GenerationDto);
    }, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [generation]);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mode,
          assetIds: [],
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Could not start the creation");
      setGeneration(body as CreateGenerationResponse as unknown as GenerationDto);
      void refreshEstimate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the creation");
    } finally {
      setCreating(false);
    }
  }

  /* ---------------- result / progress view ---------------- */

  if (generation) {
    const done = generation.status === "succeeded";
    const failed = ["failed", "refunded", "canceled"].includes(generation.status);
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-white">
          {done ? "Your creation is ready." : failed ? "We couldn't complete that creation." : "Creating your…"}
        </h1>
        <p className="mt-1 text-fog-400">{generation.contentType}</p>

        {!done && !failed && (
          <div className="mt-10 space-y-3">
            {(["understanding", "building", "generating", "finalizing"] as const).map((stage, i) => {
              const order = ["understanding", "building", "generating", "finalizing"];
              const current = order.indexOf(generation.stage);
              const state = i < current ? "done" : i === current ? "active" : "todo";
              return (
                <div key={stage} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                      state === "done"
                        ? "border-white bg-white text-ink-950"
                        : state === "active"
                          ? "border-white text-white"
                          : "border-ink-700 text-fog-400"
                    }`}
                  >
                    {state === "done" ? "✓" : i + 1}
                  </span>
                  <span className={state === "todo" ? "text-fog-400" : "text-white"}>
                    {stage === "understanding" && "Understanding request"}
                    {stage === "building" && "Building creative"}
                    {stage === "generating" && "Generating"}
                    {stage === "finalizing" && "Finalizing"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {done && generation.assets.length > 0 && (
          <div className="mt-8 space-y-4">
            {generation.assets.map((a) =>
              a.type === "video" ? (
                <video key={a.id} src={a.url} controls className="w-full rounded-2xl border border-ink-800" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.id} src={a.url} alt={generation.prompt} className="w-full rounded-2xl border border-ink-800" />
              ),
            )}
          </div>
        )}

        {failed && (
          <div className="mt-8 rounded-2xl border border-ink-800 bg-ink-900 p-5">
            <p className="text-fog-200">{generation.failureMessage ?? "Something went wrong."}</p>
            {generation.refundedCredits ? (
              <p className="mt-2 text-sm text-fog-400">
                Your {generation.refundedCredits} credits have been returned.
              </p>
            ) : null}
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => {
                  setGeneration(null);
                  setPrompt(generation.prompt);
                }}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-950"
              >
                Try again
              </button>
              <Link href="/credits" className="rounded-xl border border-ink-700 px-4 py-2 text-sm text-fog-200">
                Add credits
              </Link>
            </div>
          </div>
        )}

        {done && (
          <div className="mt-6 flex flex-wrap gap-3">
            {generation.assets[0] && (
              <a
                href={generation.assets[0].url}
                download
                className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-ink-950"
              >
                Download
              </a>
            )}
            <button
              onClick={() => {
                setPrompt(`Variation: ${generation.prompt}`);
                setGeneration(null);
              }}
              className="rounded-xl border border-ink-700 px-5 py-2.5 text-sm text-fog-200"
            >
              Create variation
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ---------------- composer view ---------------- */

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-white">What do you want to create?</h1>
      <p className="mt-1 text-fog-400">One sentence is enough. The studio handles the rest.</p>

      <div className="mt-8 rounded-2xl border border-ink-800 bg-ink-900 p-4 transition focus-within:border-fog-400">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="Describe your creation — e.g. a cinematic 10-second ad for my luxury watch, dark studio, moody lighting"
          className="w-full resize-none bg-transparent text-lg text-white placeholder-fog-400 outline-none"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-fog-400">
          <span>{estimating ? "Estimating…" : estimate ? `${estimate.contentType} · ${estimate.quality} quality` : "Auto · Quality · Economy"}</span>
          <span>{prompt.length}/4000</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              mode === m.id
                ? "border-white bg-ink-900"
                : "border-ink-800 bg-ink-900/50 hover:border-ink-700"
            }`}
          >
            <div className="text-sm font-medium text-white">{m.title}</div>
            <div className="mt-0.5 text-xs text-fog-400">{m.desc}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => setPrompt(p)}
            className="rounded-full border border-ink-800 bg-ink-900 px-3 py-1.5 text-xs text-fog-300 hover:border-fog-400 hover:text-white"
          >
            {p.length > 44 ? `${p.slice(0, 44)}…` : p}
          </button>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between rounded-2xl border border-ink-800 bg-ink-900 p-4">
        <div>
          {estimate ? (
            <>
              <div className="text-sm text-fog-300">
                Estimated usage: <span className="font-semibold text-white">{estimate.estimatedCredits} credits</span>
              </div>
              <div className="mt-0.5 text-xs text-fog-400">
                Balance after: {estimate.remainingAfter.toLocaleString()} credits
                {!estimate.affordable && " — add credits to continue"}
              </div>
            </>
          ) : (
            <div className="text-sm text-fog-400">Start typing to see your credit estimate</div>
          )}
        </div>
        <button
          onClick={handleCreate}
          disabled={!estimate?.affordable || creating || prompt.trim().length < 3}
          className="rounded-xl bg-white px-8 py-3 font-semibold text-ink-950 transition hover:bg-fog-100 disabled:opacity-40"
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      <details className="mt-4 text-sm text-fog-400">
        <summary className="cursor-pointer select-none">Why this amount?</summary>
        <div className="mt-2 rounded-2xl border border-ink-800 bg-ink-900 p-4">
          {estimate?.breakdown.map((line) => (
            <div key={line.label} className="flex items-center justify-between py-1">
              <span>{line.label}</span>
              <span className="text-fog-200">{line.credits > 0 ? `${line.credits} credits` : "Free"}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
