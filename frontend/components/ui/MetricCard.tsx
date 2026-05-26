import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  variant?: "default" | "critical" | "high" | "healthy";
}

const variantStyles = {
  default: "border-coral-border",
  critical: "border-red-500/30 bg-red-500/5",
  high: "border-orange-500/30 bg-orange-500/5",
  healthy: "border-emerald-500/30 bg-emerald-500/5",
};

const iconStyles = {
  default: "text-slate-400",
  critical: "text-red-400",
  high: "text-orange-400",
  healthy: "text-emerald-400",
};

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  variant = "default",
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-coral-panel p-4 shadow-sm",
        variantStyles[variant]
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-100">
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <Icon className={cn("h-5 w-5", iconStyles[variant])} aria-hidden />
      </div>
    </div>
  );
}
