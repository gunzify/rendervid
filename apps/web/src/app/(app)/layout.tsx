import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getProfile, getWalletState, resolvePlan, walletToDto } from "@rendervid/core";
import { ACCESS_COOKIE } from "@/lib/session";
import { verifyAccessToken } from "@rendervid/core";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) redirect("/signin");

  let userId: string;
  try {
    userId = (await verifyAccessToken(token)).userId;
  } catch {
    redirect("/signin");
  }

  const [profile, plan, wallet] = await Promise.all([
    getProfile(userId),
    resolvePlan(userId),
    getWalletState(userId),
  ]);
  if (!profile) redirect("/signin");

  const nav = [
    { href: "/create", label: "Create" },
    { href: "/projects", label: "Projects" },
    { href: "/assets", label: "Assets" },
    { href: "/credits", label: "Credits" },
    { href: "/billing", label: "Billing" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <div className="flex min-h-screen bg-ink-950">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-800 p-6 md:flex">
        <Link href="/create" className="text-lg font-semibold tracking-tight text-white">
          RenderVid
        </Link>
        <nav className="mt-10 flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-2 text-sm text-fog-300 transition hover:bg-ink-900 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-ink-800 bg-ink-900 p-4">
          <div className="text-xs uppercase tracking-wider text-fog-400">Credits</div>
          <div className="mt-1 text-xl font-semibold text-white">
            {walletToDto(wallet).availableCredits.toLocaleString()}
          </div>
          <div className="mt-1 text-xs capitalize text-fog-400">
            {plan.planId} plan
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-ink-800 px-6 py-4 md:hidden">
          <Link href="/create" className="font-semibold text-white">
            RenderVid
          </Link>
          <span className="rounded-full bg-ink-900 px-3 py-1 text-sm text-fog-200">
            {walletToDto(wallet).availableCredits.toLocaleString()} cr
          </span>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
