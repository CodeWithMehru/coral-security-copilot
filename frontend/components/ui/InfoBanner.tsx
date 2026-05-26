import { Info } from "lucide-react";

/** Non-blocking status (rate limits, optional scanner) */
export function InfoBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-slate-600/40 bg-slate-800/40 px-4 py-2.5 text-sm text-slate-300"
    >
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>{message}</p>
      </div>
    </div>
  );
}
