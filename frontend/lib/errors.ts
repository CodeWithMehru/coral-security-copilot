/**
 * Maps raw Coral CLI / GitHub / scanner errors into operator-friendly messages.
 */

export type ErrorKind =
  | "auth"
  | "rate_limit"
  | "config"
  | "scanner_unavailable"
  | "not_found"
  | "empty"
  | "unknown";

export const RATE_LIMIT_USER_MESSAGE =
  "GitHub rate limit reached. Please wait 30 minutes.";

export const AUTH_USER_MESSAGE =
  "GitHub authentication failed. Verify GITHUB_TOKEN has repo and read:org scopes.";

export interface FormattedError {
  kind: ErrorKind;
  message: string;
  detail?: string;
}

export function formatIntegrationError(raw: string): FormattedError {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return { kind: "empty", message: "No response from the data source." };
  }

  if (
    lower.includes("enoent") &&
    (lower.includes("uv") || lower.includes("spawn"))
  ) {
    return {
      kind: "scanner_unavailable",
      message:
        "Compliance scanner unavailable (uv not installed). Coral SQL still works when tokens are configured.",
      detail: text,
    };
  }

  if (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("secondary rate limit") ||
    lower.includes("abuse detection") ||
    (lower.includes("403") &&
      (lower.includes("rate") || lower.includes("api rate")))
  ) {
    return { kind: "rate_limit", message: RATE_LIMIT_USER_MESSAGE, detail: text };
  }

  if (
    lower.includes("401") ||
    lower.includes("bad credentials") ||
    lower.includes("unauthorized") ||
    lower.includes("authentication failed") ||
    lower.includes("requires authentication") ||
    (lower.includes("github") && lower.includes("token") && lower.includes("invalid"))
  ) {
    return { kind: "auth", message: AUTH_USER_MESSAGE, detail: text };
  }

  if (
    lower.includes("github_owner") ||
    lower.includes("github_repo") ||
    lower.includes("requires a constant") ||
    lower.includes("owner =") ||
    lower.includes("not configured")
  ) {
    return {
      kind: "config",
      message:
        "GitHub repository scope missing. Set GITHUB_OWNER and GITHUB_REPO in ../.env or frontend/.env.local.",
      detail: text,
    };
  }

  if (lower.includes("notion") && (lower.includes("401") || lower.includes("unauthorized"))) {
    return {
      kind: "auth",
      message: "Notion authentication failed. Verify NOTION_TOKEN and page access.",
      detail: text,
    };
  }

  if (lower.includes("slack") && (lower.includes("invalid_auth") || lower.includes("not_authed"))) {
    return {
      kind: "auth",
      message: "Slack authentication failed. Verify SLACK_BOT_TOKEN and channel scopes.",
      detail: text,
    };
  }

  if (lower.includes("failed to start coral") || lower.includes("coral exited")) {
    return {
      kind: "unknown",
      message:
        "Coral CLI could not run this query. Ensure coral is installed and CORAL_WORKDIR points to the project root.",
      detail: text,
    };
  }

  return {
    kind: "unknown",
    message: text.length > 280 ? `${text.slice(0, 277)}…` : text,
    detail: text.length > 280 ? text : undefined,
  };
}

export function formatWarnings(rawWarnings: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of rawWarnings) {
    const { message } = formatIntegrationError(w);
    if (!seen.has(message)) {
      seen.add(message);
      out.push(message);
    }
  }
  return out;
}

export function isRateLimitMessage(message: string): boolean {
  return (
    message.includes(RATE_LIMIT_USER_MESSAGE) ||
    /rate limit/i.test(message)
  );
}

export function isAuthOrConfigMessage(message: string): boolean {
  return (
    message.includes(AUTH_USER_MESSAGE) ||
    /authentication failed|repository scope missing|Configure.*TOKEN/i.test(message)
  );
}

export function isInformationalWarning(message: string): boolean {
  return (
    isRateLimitMessage(message) ||
    /scanner unavailable|compliance scanner unavailable/i.test(message)
  );
}

/** Warnings that should not block the “No findings” empty state */
export function partitionWarnings(warnings: string[]): {
  alerts: string[];
  informational: string[];
} {
  const alerts: string[] = [];
  const informational: string[] = [];
  for (const w of warnings) {
    if (isInformationalWarning(w)) informational.push(w);
    else alerts.push(w);
  }
  return { alerts, informational };
}

export function isConfigError(kind: ErrorKind): boolean {
  return kind === "auth" || kind === "config" || kind === "scanner_unavailable";
}
