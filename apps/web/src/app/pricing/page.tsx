import Link from "next/link";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    credits: "100 credits",
    features: ["Standard quality", "Watermarked results", "1 GB storage"],
  },
  {
    id: "creator",
    name: "Creator",
    price: "$19",
    credits: "2,000 credits / mo",
    features: ["No watermark", "Commercial use", "Unlimited projects", "Asset library"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$49",
    credits: "6,000 credits / mo",
    features: ["Priority generation", "Maximum quality", "Brand kit basics", "100 GB storage"],
  },
  {
    id: "studio",
    name: "Studio",
    price: "$99",
    credits: "15,000 credits / mo",
    features: ["Team workspace", "Campaign workflows", "Priority queue", "500 GB storage"],
  },
  {
    id: "agency",
    name: "Agency",
    price: "$249",
    credits: "40,000 credits / mo",
    features: ["Multiple workspaces", "Client management", "Usage analytics", "2 TB storage"],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-ink-950 px-6 py-16 text-fog-100">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-lg font-semibold text-white">
          RenderVid
        </Link>
        <h1 className="mt-10 text-4xl font-semibold tracking-tight text-white lg:text-5xl">
          Simple credits. Serious output.
        </h1>
        <p className="mt-3 max-w-xl text-fog-300">
          Every plan uses the same studio. Higher tiers add quality, speed and scale.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {PLANS.map((p) => (
            <div key={p.id} className="rounded-2xl border border-ink-800 bg-ink-900 p-6">
              <div className="text-sm uppercase tracking-wider text-fog-400">{p.name}</div>
              <div className="mt-2 text-3xl font-semibold text-white">
                {p.price}
                {p.id !== "free" && <span className="text-sm font-normal text-fog-400">/mo</span>}
              </div>
              <div className="mt-1 text-sm text-fog-300">{p.credits}</div>
              <ul className="mt-4 space-y-1.5 text-xs text-fog-400">
                {p.features.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/signup"
            className="inline-block rounded-xl bg-white px-8 py-3.5 font-semibold text-ink-950 transition hover:bg-fog-100"
          >
            Start creating
          </Link>
        </div>
      </div>
    </main>
  );
}
