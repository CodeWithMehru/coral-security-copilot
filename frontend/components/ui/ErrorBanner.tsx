import { AlertTriangle } from "lucide-react";

export function ErrorBanner({
  message,
  detail,
  onRetry,
}: {
  message: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-red-200">{message}</p>
          {detail ? (
            <p className="mt-1.5 font-mono text-xs leading-relaxed text-red-300/70">
              {detail}
            </p>
          ) : null}
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 text-xs font-medium text-red-300 underline hover:text-red-200"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
