import type { Severity } from "@/lib/types";
import { cn, severityColorClass, severityLabel } from "@/lib/utils";

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        severityColorClass(severity)
      )}
    >
      {severityLabel(severity)}
    </span>
  );
}
