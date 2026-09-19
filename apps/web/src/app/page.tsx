import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-ink-950 text-fog-100">
      <Nav />
      <Hero />
      <HowItWorks />
      <FinalCta />
      <footer className="border-t border-ink-800 py-10 text-center text-sm text-fog-400">
        © {new Date().getFullYear()} RenderVid — Create anything. Without knowing how.
      </footer>
    </main>
  );
}

function Nav() {
  return (
    <header className="flex items-center justify-between px-6 py-5 lg:px-12">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        RenderVid
      </Link>
      <nav className="flex items-center gap-6 text-sm text-fog-300">
        <Link href="/pricing" className="hover:text-white">
          Pricing
        </Link>
        <Link href="/signin" className="hover:text-white">
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-xl bg-white px-4 py-2 font-medium text-ink-950 transition hover:bg-fog-100"
        >
          Start creating
        </Link>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24 pt-20 text-center lg:pt-28">
      <p className="mb-5 inline-block rounded-full border border-ink-700 bg-ink-900 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-fog-300">
        AI creative studio
      </p>
      <h1 className="mx-auto max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight text-white lg:text-7xl">
        Create anything.
        <br />
        <span className="text-fog-400">Without knowing how.</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-lg text-fog-300">
        Describe what you want — images, videos, ads. RenderVid handles the models, the
        workflows and the details behind the scenes.
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/signup"
          className="w-full rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-ink-950 transition hover:bg-fog-100 sm:w-auto"
        >
          Start creating
        </Link>
        <Link
          href="/pricing"
          className="w-full rounded-xl border border-ink-700 px-8 py-3.5 text-base font-medium text-fog-100 transition hover:border-fog-400 sm:w-auto"
        >
          Explore pricing
        </Link>
      </div>

      {/* Product glimpse: prompt → result */}
      <div className="mx-auto mt-20 max-w-3xl rounded-2xl border border-ink-800 bg-ink-900 p-6 text-left shadow-2xl">
        <div className="rounded-xl border border-ink-700 bg-ink-850 p-4 text-fog-200">
          “Create a cinematic 10-second ad for my luxury black watch.”
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-fog-400">
          <span>Video · High quality · 9:16 · 10s</span>
          <span className="rounded-full bg-ink-800 px-3 py-1">≈ 420 credits</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {["Dark studio. Slow orbit.", "Light sweep on the dial.", "Logo reveal. CTA."].map((t, i) => (
            <div key={t} className="rounded-xl border border-ink-800 bg-ink-850 p-3 text-xs text-fog-300">
              <div className="mb-2 h-16 rounded-lg bg-gradient-to-br from-ink-700 to-ink-800" />
              {t}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Describe it", d: "One sentence is enough. No prompts, no settings." },
    { n: "02", t: "AI Director plans it", d: "Content type, quality, length and cost are decided for you." },
    { n: "03", t: "Receive it", d: "Your creation lands in your library, ready to download." },
  ];
  return (
    <section className="border-t border-ink-800 bg-ink-900/40 px-6 py-24">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n}>
            <div className="text-sm text-fog-400">{s.n}</div>
            <h3 className="mt-2 text-xl font-semibold text-white">{s.t}</h3>
            <p className="mt-2 text-fog-300">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-6 py-24 text-center">
      <h2 className="text-3xl font-semibold text-white lg:text-4xl">Your first creation is 100 credits on us.</h2>
      <p className="mx-auto mt-3 max-w-md text-fog-300">No card required. Takes about a minute.</p>
      <Link
        href="/signup"
        className="mt-8 inline-block rounded-xl bg-white px-8 py-3.5 font-semibold text-ink-950 transition hover:bg-fog-100"
      >
        Start creating
      </Link>
    </section>
  );
}
