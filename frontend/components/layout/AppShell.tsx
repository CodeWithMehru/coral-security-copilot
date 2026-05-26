"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Shield } from "lucide-react";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { cn } from "@/lib/utils";

const MOBILE_NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/secrets", label: "Secrets" },
  { href: "/vulnerabilities", label: "Vulns" },
  { href: "/compliance", label: "Compliance" },
  { href: "/chat", label: "Chat" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)]">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 flex md:hidden"
          role="dialog"
          aria-modal
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div className="relative z-50 h-full">
            <Sidebar />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-coral-border bg-coral-elevated px-4 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-slate-400 hover:bg-slate-800"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Shield className="h-4 w-4 text-red-400" />
          <span className="text-sm font-semibold text-slate-200">CoralSec Copilot</span>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto border-b border-coral-border px-2 py-1 md:hidden"
          aria-label="Mobile sections"
        >
          {MOBILE_NAV.map(({ href, label }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium",
                  active
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </div>
  );
}
