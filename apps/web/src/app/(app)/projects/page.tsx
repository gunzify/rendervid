"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProjectDto } from "@rendervid/shared";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectDto[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(Array.isArray(d) ? d : []))
      .catch(() => setProjects([]));
  }, []);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const p = (await res.json()) as ProjectDto;
        setProjects((prev) => [p, ...(prev ?? [])]);
        setName("");
        setShowForm(false);
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Projects</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink-950"
        >
          New project
        </button>
      </div>

      {showForm && (
        <div className="mt-6 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Luxury Watch Campaign"
            className="flex-1 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-white placeholder-fog-400 outline-none focus:border-fog-400"
          />
          <button onClick={create} disabled={creating} className="rounded-xl bg-white px-5 py-3 font-semibold text-ink-950 disabled:opacity-50">
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {projects && projects.length === 0 && (
        <div className="mt-16 text-center">
          <p className="text-fog-300">Your creative workspace is empty.</p>
          <Link href="/create" className="mt-4 inline-block rounded-xl bg-white px-6 py-3 font-semibold text-ink-950">
            Create your first asset
          </Link>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects?.map((p) => (
          <div key={p.id} className="rounded-2xl border border-ink-800 bg-ink-900 p-5 transition hover:border-ink-700">
            <div className="text-lg font-medium text-white">{p.name}</div>
            <div className="mt-1 text-sm text-fog-400">{p.assetCount} assets</div>
            <div className="mt-4 text-xs text-fog-400">{new Date(p.createdAt).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
