"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AssetDto } from "@rendervid/shared";

export default function AssetsPage() {
  const [assets, setAssets] = useState<AssetDto[] | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  async function load(fav: boolean) {
    setAssets(null);
    const res = await fetch(`/api/assets${fav ? "?favorite=true" : ""}`);
    const data = await res.json();
    setAssets(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void load(favoritesOnly);
  }, [favoritesOnly]);

  async function toggleFav(a: AssetDto) {
    await fetch(`/api/assets/${a.id}/favorite`, { method: "POST" });
    void load(favoritesOnly);
  }

  async function remove(a: AssetDto) {
    await fetch(`/api/assets/${a.id}`, { method: "DELETE" });
    void load(favoritesOnly);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Assets</h1>
        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`rounded-xl border px-4 py-2 text-sm transition ${
            favoritesOnly ? "border-white bg-ink-900 text-white" : "border-ink-800 text-fog-300"
          }`}
        >
          ★ Favorites
        </button>
      </div>

      {assets && assets.length === 0 && (
        <div className="mt-16 text-center">
          <p className="text-fog-300">Your creative workspace is empty.</p>
          <Link href="/create" className="mt-4 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-ink-950">
            Create your first asset
          </Link>
        </div>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {assets?.map((a) => (
          <div key={a.id} className="group relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-900">
            <div className="aspect-square w-full bg-ink-850">
              {a.type === "video" ? (
                <video src={a.url} className="h-full w-full object-cover" muted playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-transparent p-3 opacity-0 transition group-hover:opacity-100">
              <div className="flex gap-2">
                <a href={a.url} download className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-ink-950">
                  Download
                </a>
                <button onClick={() => toggleFav(a)} className="rounded-lg border border-white/30 px-3 py-1.5 text-xs text-white">
                  {a.favorite ? "★" : "☆"}
                </button>
                <button onClick={() => remove(a)} className="rounded-lg border border-white/30 px-3 py-1.5 text-xs text-white">
                  Delete
                </button>
              </div>
            </div>
            <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] uppercase text-white">
              {a.type}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
