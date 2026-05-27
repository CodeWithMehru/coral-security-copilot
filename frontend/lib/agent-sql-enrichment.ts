import { loadCommitSecretsOptional } from "./commit-secrets-loader";
import type { RoutedIntent } from "./intent-router";
import type { CoralQueryResult } from "./coral-service";
import type { QueryKind } from "./query-kinds";

const ENRICHABLE: RoutedIntent[] = ["secrets_ghas_alerts", "secrets_commits"];

const NON_ENRICH_KINDS: QueryKind[] = [
  "posture_summary",
  "unified_events",
  "vulns_dependencies",
  "slack_incidents",
  "access_risky",
  "access_with_policies",
  "compliance_gaps",
];

function resolveRoutedIntent(sql: string, queryKind?: QueryKind): RoutedIntent | null {
  if (queryKind && NON_ENRICH_KINDS.includes(queryKind)) return null;

  const lower = sql.toLowerCase();
  if (lower.includes("repo_dependabot") && lower.includes("notion")) return null;
  if (lower.includes("repo_dependabot") && lower.includes("slack.channels")) return null;

  if (queryKind === "secrets_recent") return "secrets_ghas_alerts";
  if (queryKind === "secrets_with_commits") return "secrets_commits";
  if (lower.includes("repo_secret_scanning")) return "secrets_ghas_alerts";
  if (lower.includes("github.commits")) return "secrets_commits";

  return null;
}

/**
 * Merge local commit-diff scan only for secret-specific intents — never for posture JOINs.
 */
export async function enrichAgentSqlResult(
  result: CoralQueryResult,
  options?: { queryKind?: QueryKind; sql?: string }
): Promise<CoralQueryResult> {
  const sql = options?.sql ?? result.sql;
  const routed = resolveRoutedIntent(sql, options?.queryKind);
  if (!routed || !ENRICHABLE.includes(routed)) return result;
  if (result.rowCount > 0 && routed !== "secrets_ghas_alerts") return result;

  const { secret_findings, message } = await loadCommitSecretsOptional(8);
  if (!secret_findings.length) {
    if (message && routed === "secrets_ghas_alerts") {
      return {
        ...result,
        notice:
          result.notice ??
          "No GHAS secret scanning rows. Local commit scan: " + message,
      };
    }
    return result;
  }

  const rows: Record<string, unknown>[] = [];
  for (const commit of secret_findings) {
    for (const f of commit.findings) {
      rows.push({
        source: "compliance_commit_scan",
        commit_hash: commit.commit,
        commit_message: commit.message,
        rule_id: f.rule_id,
        description: f.description,
        matched_preview: f.matched_preview,
        severity: commit.severity,
      });
    }
  }

  const columns =
    rows.length > 0 ? Object.keys(rows[0]) : ["source", "commit_hash", "rule_id"];

  return {
    ...result,
    columns,
    rows,
    rowCount: rows.length,
    raw: JSON.stringify(rows, null, 2),
    notice:
      "Merged local commit secret scan — github.repo_secret_scanning_alerts is empty without GitHub Advanced Security.",
    error: undefined,
    errorKind: undefined,
  };
}
