import { executeCoralSql } from "./coral";
import { buildQueryForKind } from "./coral-queries";
import type { QueryKind } from "./query-kinds";
import { isDemoMode } from "./env";
import { formatIntegrationError } from "./errors";
import {
  getCachedCoralQuery,
  isGitHubRateLimited,
  markGitHubRateLimited,
  rateLimitBlockedResult,
  setCachedCoralQuery,
} from "./coral-cache";
import { executeVirtualQuery } from "./virtual-query";
import { DEMO_REPORT } from "./demo-data";
import type { CoralSqlResponse } from "./types";

export interface CoralQueryResult extends CoralSqlResponse {
  dataSource: "coral" | "demo";
  mode: "demo" | "live";
  notice?: string;
  errorKind?: string;
}

/** Execute SQL via Coral CLI; demo mode only uses virtual projection */
export async function runCoralQuery(
  sql: string,
  options?: { queryKind?: QueryKind; allowDemoFallback?: boolean; skipCache?: boolean }
): Promise<CoralQueryResult> {
  const mode = isDemoMode() ? "demo" : "live";
  const start = Date.now();

  if (mode === "demo" && options?.allowDemoFallback !== false) {
    const kind = options?.queryKind ?? "unified_events";
    const virtual = executeVirtualQuery(kind, DEMO_REPORT);
    return {
      sql,
      raw: JSON.stringify(virtual.rows, null, 2),
      columns: virtual.columns,
      rows: virtual.rows,
      rowCount: virtual.rows.length,
      durationMs: Date.now() - start,
      dataSource: "demo",
      mode: "demo",
      notice: "Demonstration mode — set CORALSEC_USE_DEMO=false for live Coral SQL.",
    };
  }

  if (isGitHubRateLimited()) {
    return rateLimitBlockedResult(sql);
  }

  if (!options?.skipCache) {
    const cached = getCachedCoralQuery(sql);
    if (cached) return cached;
  }

  const result = await executeCoralSql(sql);

  if (result.error) {
    const formatted = formatIntegrationError(result.error);
    if (formatted.kind === "rate_limit") {
      markGitHubRateLimited();
    }
    const shaped: CoralQueryResult = {
      ...result,
      dataSource: "coral",
      mode: "live",
      error: formatted.message,
      errorKind: formatted.kind,
      notice:
        formatted.kind === "rate_limit" || formatted.kind === "auth"
          ? formatted.message
          : formatted.detail
            ? `Technical detail: ${formatted.detail}`
            : formatted.message,
    };
    return shaped;
  }

  const shaped: CoralQueryResult = {
    ...result,
    dataSource: "coral",
    mode: "live",
    durationMs: Date.now() - start,
  };
  setCachedCoralQuery(sql, shaped);
  return shaped;
}

export async function runQueryByKind(kind: QueryKind): Promise<CoralQueryResult> {
  if (isDemoMode()) {
    return runCoralQuery(buildQueryForKind(kind), { queryKind: kind });
  }
  const sql = buildQueryForKind(kind);
  return runCoralQuery(sql, { queryKind: kind, allowDemoFallback: false });
}

export async function checkCoralSources(): Promise<{
  ok: boolean;
  sources: string[];
  error?: string;
  errorKind?: string;
}> {
  if (isGitHubRateLimited()) {
    return {
      ok: false,
      sources: [],
      error: "GitHub rate limit reached. Please wait 30 minutes.",
      errorKind: "rate_limit",
    };
  }

  const result = await executeCoralSql(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('github', 'notion', 'slack')`
  );
  if (result.error) {
    const formatted = formatIntegrationError(result.error);
    if (formatted.kind === "rate_limit") markGitHubRateLimited();
    return {
      ok: false,
      sources: [],
      error: formatted.message,
      errorKind: formatted.kind,
    };
  }
  const sources = result.rows
    .map((r) => String(r.schema_name ?? ""))
    .filter(Boolean);
  return { ok: sources.length > 0, sources };
}
