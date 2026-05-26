"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  KeyRound,
  ShieldAlert,
  FileCheck2,
  MessageSquareCode,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/secrets", label: "Secret Scanner", icon: KeyRound },
  { href: "/vulnerabilities", label: "Vulnerability Intelligence", icon: ShieldAlert },
  { href: "/compliance", label: "Compliance Monitor", icon: FileCheck2 },
  { href: "/chat", label: "Agent Chat", icon: MessageSquareCode },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-coral-border bg-coral-elevated lg:w-60">
      <div className="flex items-center gap-2.5 border-b border-coral-border px-4 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-600/15 ring-1 ring-red-500/30">
          <Shield className="h-4 w-4 text-red-400" aria-hidden />
        </div>
        <p className="truncate text-sm font-semibold tracking-tight text-slate-100">
          CoralSec Copilot
        </p>
      </div>

      <nav className="flex-1 space-y-0.5 p-3" aria-label="Primary">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-slate-800/80 text-slate-100"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              <Icon
                className={cn("h-4 w-4 shrink-0", active && "text-red-400")}
                aria-hidden
              />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
