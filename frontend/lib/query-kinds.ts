/** Identifiers for NL→SQL templates and virtual query execution */
export type QueryKind =
  | "secrets_recent"
  | "secrets_with_commits"
  | "access_risky"
  | "access_with_policies"
  | "vulns_dependencies"
  | "compliance_gaps"
  | "slack_incidents"
  | "posture_summary"
  | "unified_events";

export function inferQueryKindFromSql(sql: string): QueryKind {
  const lower = sql.toLowerCase();
  if (lower.includes("github.commits") && lower.includes("slack"))
    return "secrets_with_commits";
  if (lower.includes("security_secret_findings") && lower.includes("join"))
    return "secrets_with_commits";
  if (lower.includes("github.commits") || lower.includes("commit_hash"))
    return "secrets_with_commits";
  if (lower.includes("secret") || lower.includes("compliance_commit_scan"))
    return "secrets_recent";
  if (lower.includes("security_access_events") && lower.includes("policy"))
    return "access_with_policies";
  if (lower.includes("access") || lower.includes("permission"))
    return "access_risky";
  if (lower.includes("osv") || lower.includes("cve") || lower.includes("vulnerab"))
    return "vulns_dependencies";
  if (lower.includes("policy") || lower.includes("compliance"))
    return "compliance_gaps";
  if (lower.includes("slack")) return "slack_incidents";
  if (lower.includes("metrics") || lower.includes("posture")) return "posture_summary";
  return "unified_events";
}
