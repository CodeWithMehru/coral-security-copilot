/**
 * Source-aware Coral / integration error parsing (stderr from Coral CLI).
 */

export type ErrorKind =
  | "auth"
  | "rate_limit"
  | "config"
  | "scanner_unavailable"
  | "not_found"
  | "empty"
  | "unknown";

export type ErrorSource = "github" | "slack" | "notion" | "coral" | "unknown";

export const GITHUB_RATE_LIMIT_MESSAGE =
  "GitHub API rate limit reached. Please wait 30 minutes before retrying.";

export const SLACK_ERROR_MESSAGE =
  "Slack API error or scope missing. Ensure SLACK_BOT_TOKEN includes channels:read and groups:read.";

export const SLACK_CHANNEL_ERROR_MESSAGE =
  "Slack error: Ensure the bot is added to the channel (/invite @bot) and tokens have channels:read scope.";

export const NOTION_ERROR_MESSAGE =
  "Notion API error or integration misconfigured. Verify NOTION_TOKEN and workspace access.";

export const AUTH_USER_MESSAGE =
  "GitHub authentication failed. Verify GITHUB_TOKEN has repo and read:org scopes.";

export const EMPTY_SECRETS_MESSAGE =
  "No secret scanning alerts yet. Commit-message search and local diff scan supplement GHAS-only tables.";

export const CHAT_QUERY_FAILED_MESSAGE =
  "Could not run this query against Coral. Check integration tokens and repository settings.";

export interface FormattedError {
  kind: ErrorKind;
  message: string;
  source: ErrorSource;
  detail?: string;
}

const GITHUB_RATE_KEYWORDS =
  /github.*rate\s*limit|rate\s*limit.*github|x-ratelimit|secondary\s+rate\s+limit|abuse\s+detection/i;

const GENERIC_RATE_KEYWORDS = /\b429\b|too many requests/i;

const SLACK_MARKERS =
  /\bslack\b|slack\.channels|channels:read|invalid_auth|not_authed|missing_scope|not_in_channel|channel_not_found|is_not_in_channel/i;

const NOTION_MARKERS = /\bnotion\b|notion\.search|notion\.pages/i;

const GITHUB_MARKERS =
  /\bgithub\b|repo_dependabot|secret_scanning|collaborators|dependabot/i;

/** Infer which integration produced the stderr (order matters: specific before generic). */
export function detectErrorSource(raw: string): ErrorSource {
  const lower = raw.toLowerCase();
  if (SLACK_MARKERS.test(lower)) return "slack";
  if (NOTION_MARKERS.test(lower)) return "notion";
  if (GITHUB_MARKERS.test(lower)) return "github";
  if (lower.includes("coral") || lower.includes("failed to start")) return "coral";
  return "unknown";
}

function isGitHubRateLimitError(raw: string): boolean {
  return GITHUB_RATE_KEYWORDS.test(raw);
}

export function formatIntegrationError(raw: string): FormattedError {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const source = detectErrorSource(text);

  if (!text) {
    return { kind: "empty", message: "No response from the data source.", source: "unknown" };
  }

  if (
    lower.includes("enoent") &&
    (lower.includes("uv") || lower.includes("spawn"))
  ) {
    return {
      kind: "scanner_unavailable",
      source: "coral",
      message:
        "Compliance scanner unavailable (uv not installed). Coral SQL still works when tokens are configured.",
      detail: text,
    };
  }

  // --- Slack (before generic rate-limit catch-all) ---
  if (source === "slack" || SLACK_MARKERS.test(lower)) {
    if (
      /not_in_channel|channel_not_found|is_not_in_channel|not in channel|is_not_member/i.test(
        lower
      )
    ) {
      return {
        kind: "auth",
        source: "slack",
        message: SLACK_CHANNEL_ERROR_MESSAGE,
        detail: text,
      };
    }
    if (
      /scope|missing|channels:read|not_allowed|missing_scope|invalid_auth|not_authed/i.test(
        lower
      )
    ) {
      return {
        kind: "auth",
        source: "slack",
        message: SLACK_ERROR_MESSAGE,
        detail: text,
      };
    }
    return {
      kind: "unknown",
      source: "slack",
      message: SLACK_CHANNEL_ERROR_MESSAGE,
      detail: text,
    };
  }

  // --- Notion ---
  if (source === "notion" || NOTION_MARKERS.test(lower)) {
    if (/401|unauthorized|invalid|forbidden/i.test(lower)) {
      return {
        kind: "auth",
        source: "notion",
        message: NOTION_ERROR_MESSAGE,
        detail: text,
      };
    }
    return {
      kind: "unknown",
      source: "notion",
      message: NOTION_ERROR_MESSAGE,
      detail: text,
    };
  }

  // --- GitHub rate limit: ONLY when stderr explicitly ties to GitHub ---
  if (source === "github" && isGitHubRateLimitError(text)) {
    return {
      kind: "rate_limit",
      source: "github",
      message: GITHUB_RATE_LIMIT_MESSAGE,
      detail: text,
    };
  }

  if (source === "github" && GENERIC_RATE_KEYWORDS.test(lower) && /api\.github/i.test(lower)) {
    return {
      kind: "rate_limit",
      source: "github",
      message: GITHUB_RATE_LIMIT_MESSAGE,
      detail: text,
    };
  }

  // Non-GitHub 429 / rate wording — do not blame GitHub
  if (GENERIC_RATE_KEYWORDS.test(lower) && source !== "github") {
    return {
      kind: "unknown",
      source,
      message:
        source === "unknown"
          ? "Upstream API rate limit or throttling. Wait a few minutes and retry."
          : `${source} API throttled. Wait a few minutes and retry.`,
      detail: text,
    };
  }

  // --- GitHub auth ---
  if (
    source === "github" &&
    (lower.includes("401") ||
      lower.includes("bad credentials") ||
      lower.includes("requires authentication") ||
      (lower.includes("token") && lower.includes("invalid")))
  ) {
    return {
      kind: "auth",
      source: "github",
      message: AUTH_USER_MESSAGE,
      detail: text,
    };
  }

  if (
    lower.includes("github_owner") ||
    lower.includes("github_repo") ||
    lower.includes("requires a constant") ||
    lower.includes("not configured")
  ) {
    return {
      kind: "config",
      source: "github",
      message:
        "GitHub repository scope missing. Set GITHUB_OWNER and GITHUB_REPO in ../.env or frontend/.env.local.",
      detail: text,
    };
  }

  if (lower.includes("failed to start coral") || lower.includes("coral exited")) {
    return {
      kind: "unknown",
      source: "coral",
      message:
        "Coral CLI could not run this query. Ensure coral is installed and CORAL_WORKDIR points to the project root.",
      detail: text,
    };
  }

  return {
    kind: "unknown",
    source,
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
    message.includes(GITHUB_RATE_LIMIT_MESSAGE) ||
    (/rate limit/i.test(message) && /github/i.test(message))
  );
}

export function isAuthOrConfigMessage(message: string): boolean {
  return (
    message.includes(AUTH_USER_MESSAGE) ||
    message.includes(SLACK_ERROR_MESSAGE) ||
    message.includes(SLACK_CHANNEL_ERROR_MESSAGE) ||
    message.includes(NOTION_ERROR_MESSAGE) ||
    /repository scope missing|Configure.*TOKEN/i.test(message)
  );
}

export function isInformationalWarning(message: string): boolean {
  return (
    isRateLimitMessage(message) ||
    /scanner unavailable|compliance scanner unavailable/i.test(message)
  );
}

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

/** @deprecated use GITHUB_RATE_LIMIT_MESSAGE */
export const RATE_LIMIT_USER_MESSAGE = GITHUB_RATE_LIMIT_MESSAGE;
