interface EmptyPanelProps {
  variant?: "no-data" | "configure";
  title?: string;
  description?: string;
}

export function ConfigureEmptyState({
  variant = "no-data",
  title,
  description,
}: EmptyPanelProps) {
  const isConfigure = variant === "configure";

  const heading =
    title ?? (isConfigure ? "Configure integrations" : "No findings");

  const body =
    description ??
    (isConfigure
      ? "Add GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, NOTION_TOKEN, and SLACK_BOT_TOKEN to ../.env or frontend/.env.local, then restart the dev server."
      : "No security issues matched your repository and connected sources. This is a clean result — not an error.");

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-coral-border bg-coral-panel/40 px-8 py-16 text-center">
      <h3 className="text-sm font-semibold text-slate-200">{heading}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">{body}</p>
    </div>
  );
}

/** @deprecated use ConfigureEmptyState */
export const EmptyPanel = ConfigureEmptyState;
