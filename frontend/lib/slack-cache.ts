import type { CoralQueryResult } from "./coral-service";

const SLACK_TTL_MS = 10 * 60 * 1000;

const slackQueryCache = new Map<
  string,
  { result: CoralQueryResult; expiresAt: number }
>();

function cacheKey(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isSlackSql(sql: string): boolean {
  const lower = sql.toLowerCase();
  return lower.includes("slack.") || /\bfrom\s+slack\b/.test(lower);
}

export function getCachedSlackQuery(sql: string): CoralQueryResult | null {
  const entry = slackQueryCache.get(cacheKey(sql));
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) slackQueryCache.delete(cacheKey(sql));
    return null;
  }
  return { ...entry.result, durationMs: 0 };
}

export function setCachedSlackQuery(sql: string, result: CoralQueryResult): void {
  if (result.error && result.errorKind === "rate_limit") return;
  slackQueryCache.set(cacheKey(sql), {
    result,
    expiresAt: Date.now() + SLACK_TTL_MS,
  });
}

export function getAnyCachedSlackQuery(): CoralQueryResult | null {
  const now = Date.now();
  for (const [key, entry] of slackQueryCache) {
    if (entry.expiresAt > now) {
      return { ...entry.result, durationMs: 0 };
    }
    slackQueryCache.delete(key);
  }
  return null;
}
