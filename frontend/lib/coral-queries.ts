/**
 * Production Coral SQL against bundled github / notion / slack sources.
 * GitHub repo-scoped tables require constant owner + repo filters.
 */

import type { QueryKind } from "./query-kinds";
import { ConfigError, getGitHubScope, sqlLiteral } from "./env";

function ghOptional(): { o: string; r: string; where: string } | null {
  const scope = getGitHubScope();
  if (!scope) return null;
  const o = sqlLiteral(scope.owner);
  const r = sqlLiteral(scope.repo);
  return {
    o,
    r,
    where: `owner = ${o} AND repo = ${r}`,
  };
}

/** Pre-built queries for section APIs and NL→SQL */
export const CoralQueries = {
  secretScanningAlerts: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { where } = g;
    return `SELECT
  alert_number,
  secret_type,
  secret_type_display_name,
  state,
  created_at,
  html_url,
  first_location_detected__path AS file_path,
  first_location_detected__start_line AS start_line,
  resolution,
  resolution_comment
FROM github.repo_secret_scanning_alerts
WHERE ${where}
ORDER BY created_at DESC
LIMIT 50`;
  },

  dependabotVulnerabilities: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { where } = g;
    return `SELECT
  alert_number,
  state,
  severity,
  created_at,
  html_url,
  dependency__package__name AS package_name,
  dependency__package__ecosystem AS ecosystem,
  dependency__manifest_path AS manifest_path,
  security_advisory__ghsa_id AS ghsa_id,
  security_advisory__cve_id AS cve_id,
  security_advisory__summary AS advisory_summary,
  security_advisory__severity AS advisory_severity,
  security_vulnerability__severity AS vuln_severity
FROM github.repo_dependabot_alerts
WHERE ${where}
ORDER BY
  CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
  created_at DESC
LIMIT 50`;
  },

  collaboratorsAccess: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { where } = g;
    return `SELECT
  login,
  permission,
  permissions__admin AS is_admin,
  permissions__maintain AS can_maintain,
  permissions__push AS can_push,
  html_url
FROM github.collaborators
WHERE ${where}
ORDER BY permission DESC, login
LIMIT 100`;
  },

  recentCommits: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { where } = g;
    return `SELECT
  sha,
  commit__message AS message,
  commit__author__name AS author_name,
  commit__author__date AS authored_at,
  html_url
FROM github.commits
WHERE ${where}
ORDER BY commit__author__date DESC
LIMIT 30`;
  },

  notionPolicySearch: (query?: string) => {
    const q = sqlLiteral(query ?? process.env.NOTION_POLICY_QUERY ?? "security compliance policy");
    return `SELECT
  id,
  url,
  created_time,
  last_edited_time,
  object,
  query
FROM notion.search
WHERE query = ${q}
LIMIT 25`;
  },

  slackSecurityChannels: () => `SELECT
  id,
  name,
  topic,
  purpose,
  num_members,
  is_archived,
  created
FROM slack.channels
WHERE (
  LOWER(name) LIKE '%security%'
  OR LOWER(name) LIKE '%incident%'
  OR LOWER(name) LIKE '%sec-%'
  OR LOWER(topic) LIKE '%security%'
  OR LOWER(purpose) LIKE '%security%'
)
AND is_archived = false
ORDER BY num_members DESC
LIMIT 25`,

  /** Cross-source: secrets + dependabot on same repo */
  secretsWithDependencies: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { o, r } = g;
    return `SELECT
  s.alert_number AS secret_alert_number,
  s.secret_type,
  s.state AS secret_state,
  s.created_at AS secret_detected_at,
  s.first_location_detected__path AS secret_path,
  d.alert_number AS dependabot_alert_number,
  d.dependency__package__name AS package_name,
  d.security_advisory__cve_id AS cve_id,
  d.severity AS vuln_severity
FROM github.repo_secret_scanning_alerts AS s
LEFT JOIN github.repo_dependabot_alerts AS d
  ON d.owner = s.owner AND d.repo = s.repo
WHERE s.owner = ${o} AND s.repo = ${r}
ORDER BY s.created_at DESC
LIMIT 30`;
  },

  accessWithPolicies: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { where } = g;
    const policyQ = sqlLiteral(
      process.env.NOTION_POLICY_QUERY ?? "security compliance policy"
    );
    return `SELECT
  c.login,
  c.permission,
  c.permissions__admin AS is_admin,
  n.id AS policy_page_id,
  n.url AS policy_url,
  n.query AS policy_query,
  n.last_edited_time AS policy_updated
FROM github.collaborators AS c
CROSS JOIN notion.search AS n
WHERE c.${where} AND n.query = ${policyQ}
ORDER BY c.permission DESC
LIMIT 40`;
  },

  unifiedSecurityPosture: () => {
    const ghFilter = ghOptional();
    if (!ghFilter) {
      return CoralQueries.slackSecurityChannels();
    }
    const { o, r } = ghFilter;
    return `SELECT
  'github_secret' AS source,
  CAST(s.alert_number AS VARCHAR) AS identifier,
  s.secret_type AS title,
  s.state AS status,
  s.created_at AS event_time
FROM github.repo_secret_scanning_alerts AS s
WHERE s.owner = ${o} AND s.repo = ${r}
UNION ALL
SELECT
  'github_dependabot' AS source,
  CAST(d.alert_number AS VARCHAR),
  COALESCE(d.security_advisory__cve_id, d.dependency__package__name),
  d.state,
  d.created_at
FROM github.repo_dependabot_alerts AS d
WHERE d.owner = ${o} AND d.repo = ${r}
ORDER BY event_time DESC
LIMIT 40`;
  },
};

export function buildQueryForKind(kind: QueryKind): string {
  switch (kind) {
    case "secrets_recent":
    case "secrets_with_commits":
      return CoralQueries.secretScanningAlerts();
    case "access_risky":
      return CoralQueries.collaboratorsAccess();
    case "access_with_policies":
      return CoralQueries.accessWithPolicies();
    case "vulns_dependencies":
      return CoralQueries.dependabotVulnerabilities();
    case "compliance_gaps":
      return CoralQueries.accessWithPolicies();
    case "slack_incidents":
      return CoralQueries.slackSecurityChannels();
    case "posture_summary":
    case "unified_events":
    default:
      return CoralQueries.unifiedSecurityPosture();
  }
}

export function buildQueryForKindSafe(kind: QueryKind): string {
  if (!getGitHubScope()) {
    if (kind === "slack_incidents") return CoralQueries.slackSecurityChannels();
    if (kind === "compliance_gaps" || kind === "access_with_policies") {
      return CoralQueries.notionPolicySearch();
    }
  }
  return buildQueryForKind(kind);
}

export function canRunGitHubQueries(): boolean {
  return getGitHubScope() !== null;
}

/** NL templates use live Coral schemas */
export function buildCrossSourceJoinQuery(intent: "secrets" | "access" | "vulns" | "compliance" | "slack" | "posture"): string {
  switch (intent) {
    case "secrets":
      return canRunGitHubQueries()
        ? CoralQueries.secretsWithDependencies()
        : CoralQueries.slackSecurityChannels();
    case "access":
      return canRunGitHubQueries()
        ? CoralQueries.accessWithPolicies()
        : CoralQueries.notionPolicySearch();
    case "vulns":
      return canRunGitHubQueries()
        ? CoralQueries.dependabotVulnerabilities()
        : `SELECT 'configuration' AS source, 'Set GITHUB_OWNER and GITHUB_REPO' AS message`;
    case "compliance":
      return canRunGitHubQueries()
        ? CoralQueries.accessWithPolicies()
        : CoralQueries.notionPolicySearch();
    case "slack":
      return CoralQueries.slackSecurityChannels();
    case "posture":
    default:
      return CoralQueries.unifiedSecurityPosture();
  }
}
