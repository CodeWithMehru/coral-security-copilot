import type { CoralQueryResult } from "./coral-service";

/** Successful Coral query cache TTL */
const CACHE_TTL_MS = 90_000;

/** After GitHub 429/rate-limit, pause new Coral CLI calls */
const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;

type CacheEntry = {
  result: CoralQueryResult;
  expiresAt: number;
};

const queryCache = new Map<string, CacheEntry>();
let rateLimitedUntil = 0;

function cacheKey(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isGitHubRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

export function markGitHubRateLimited(): void {
  rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
}

export function getCachedCoralQuery(sql: string): CoralQueryResult | null {
  const entry = queryCache.get(cacheKey(sql));
  if (!entry || Date.now() > entry.expiresAt) {
    if (entry) queryCache.delete(cacheKey(sql));
    return null;
  }
  return { ...entry.result, durationMs: 0 };
}

export function setCachedCoralQuery(sql: string, result: CoralQueryResult): void {
  if (result.error || result.errorKind === "rate_limit") return;
  queryCache.set(cacheKey(sql), {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function rateLimitBlockedResult(sql: string): CoralQueryResult {
  return {
    sql,
    raw: "",
    columns: [],
    rows: [],
    rowCount: 0,
    durationMs: 0,
    dataSource: "coral",
    mode: "live",
    error: "GitHub rate limit reached. Please wait 30 minutes.",
    errorKind: "rate_limit",
  };
}
