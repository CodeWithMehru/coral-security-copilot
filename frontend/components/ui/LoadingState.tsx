import { Loader2 } from "lucide-react";

export function LoadingState({ label = "Loading data…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}
