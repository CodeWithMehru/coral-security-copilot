"use client";

import { Circle } from "lucide-react";
import { useEffect, useState } from "react";

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setLive(!c.isDemo))
      .catch(() => setLive(true));
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-coral-border bg-coral-elevated/80 px-4 backdrop-blur-sm lg:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold tracking-tight text-slate-100">
          {title}
        </h1>
        {subtitle ? (
          <p className="truncate text-xs text-slate-500">{subtitle}</p>
        ) : null}
      </div>

      {live !== null ? (
        <div
          className={
            live
              ? "flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1"
              : "flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-1"
          }
        >
          <Circle
            className={
              live
                ? "h-2 w-2 fill-emerald-400 text-emerald-400"
                : "h-2 w-2 fill-amber-400 text-amber-400"
            }
          />
          <span
            className={
              live
                ? "text-[10px] font-semibold uppercase tracking-wide text-emerald-400"
                : "text-[10px] font-semibold uppercase tracking-wide text-amber-400"
            }
          >
            {live ? "Live" : "Demo"}
          </span>
        </div>
      ) : null}
    </header>
  );
}
