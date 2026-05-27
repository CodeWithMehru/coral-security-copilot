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
  /** Lightweight query for dashboards / chat (fewer columns, lower limit) */
  secretScanningAlertsLite: () => {
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
  first_location_detected__start_line AS start_line
FROM github.repo_secret_scanning_alerts
WHERE ${where}
ORDER BY created_at DESC
LIMIT 25`;
  },

  secretScanningAlerts: () => CoralQueries.secretScanningAlertsLite(),

  /** GHAS secret scanning alerts — open state (for "show open alerts" intent) */
  secretScanningAlertsOpen: () => {
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
  first_location_detected__start_line AS start_line
FROM github.repo_secret_scanning_alerts
WHERE ${where}
  AND state = 'open'
ORDER BY created_at DESC
LIMIT 25`;
  },

  dependabotVulnerabilitiesLite: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { where } = g;
    return `SELECT
  alert_number,
  state,
  severity,
  created_at,
  dependency__package__name AS package_name,
  security_advisory__cve_id AS cve_id,
  security_advisory__ghsa_id AS ghsa_id,
  security_advisory__summary AS advisory_summary
FROM github.repo_dependabot_alerts
WHERE ${where}
ORDER BY created_at DESC
LIMIT 25`;
  },

  dependabotVulnerabilities: () => CoralQueries.dependabotVulnerabilitiesLite(),

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

  /**
   * Secret discovery via commit messages (works without GHAS).
   * Agent Guideline 1 — prefer over repo_secret_scanning_alerts alone.
   */
  commitsSecretPatterns: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { where } = g;
    return `SELECT
  sha AS commit_hash,
  commit__message AS message,
  commit__author__name AS author_name,
  commit__author__date AS authored_at,
  html_url
FROM github.commits
WHERE ${where}
  AND (
    LOWER(commit__message) LIKE '%token%'
    OR LOWER(commit__message) LIKE '%secret%'
    OR LOWER(commit__message) LIKE '%key%'
    OR LOWER(commit__message) LIKE '%password%'
    OR LOWER(commit__message) LIKE '%apikey%'
    OR LOWER(commit__message) LIKE '%credential%'
    OR LOWER(commit__message) LIKE '%aws%'
    OR LOWER(commit__message) LIKE '%pat_%'
    OR LOWER(commit__message) LIKE '%ghp_%'
  )
ORDER BY commit__author__date DESC
LIMIT 10`;
  },

  /** Guideline 1 — commits + Slack security channels in one result */
  secretsCommitsWithSlack: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { o, r } = g;
    return `SELECT
  c.sha AS commit_hash,
  c.commit__message AS message,
  c.commit__author__date AS authored_at,
  sl.name AS slack_channel,
  sl.topic AS slack_topic
FROM github.commits AS c
LEFT JOIN slack.channels AS sl ON LOWER(sl.name) LIKE '%security%'
WHERE c.owner = ${o} AND c.repo = ${r}
  AND (
    LOWER(c.commit__message) LIKE '%token%'
    OR LOWER(c.commit__message) LIKE '%secret%'
    OR LOWER(c.commit__message) LIKE '%key%'
    OR LOWER(c.commit__message) LIKE '%password%'
    OR LOWER(c.commit__message) LIKE '%credential%'
  )
ORDER BY c.commit__author__date DESC
LIMIT 25`;
  },

  /** RULE 1 — open Dependabot alerts (include NULL severity — e.g. postcss CVE) */
  dependabotCriticalHigh: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { where } = g;
    return `SELECT
  alert_number,
  state,
  severity,
  created_at,
  dependency__package__name AS package_name,
  security_advisory__cve_id AS cve_id,
  security_advisory__ghsa_id AS ghsa_id,
  security_advisory__summary AS advisory_summary
FROM github.repo_dependabot_alerts
WHERE ${where}
  AND (state = 'open' OR state IS NULL)
ORDER BY created_at DESC
LIMIT 25`;
  },

  /** Guideline 3 — connectivity probe for Notion */
  notionConnectivityProbe: () => `SELECT
  id,
  url,
  query,
  object,
  last_edited_time
FROM notion.search
LIMIT 10`,

  notionPolicySearchBroad: () => {
    const q = sqlLiteral(
      process.env.NOTION_POLICY_QUERY ?? "security compliance policy"
    );
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

  notionPolicySearch: (_query?: string) => CoralQueries.notionPolicySearchBroad(),

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

  /** RULE 4 — collaborators + notion.search (query parameter assignment) */
  accessWithPolicies: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { o, r } = g;
    const notionQ = sqlLiteral(
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
LEFT JOIN notion.search AS n ON n.query = ${notionQ}
WHERE c.owner = ${o} AND c.repo = ${r}
ORDER BY c.permission DESC
LIMIT 40`;
  },

  /** RULE 3 — unified risk posture (LEFT JOIN — no row loss when Slack/Notion empty) */
  enterpriseRiskPostureJoin: () => {
    const g = ghOptional();
    if (!g) throw new ConfigError("GITHUB_OWNER and GITHUB_REPO required.");
    const { o, r } = g;
    const notionQ = sqlLiteral(
      process.env.NOTION_POLICY_QUERY ?? "security compliance policy"
    );
    return `SELECT
  gh.dependency__package__name AS package_name,
  gh.security_advisory__cve_id AS cve_id,
  gh.state,
  sl.name AS slack_channel,
  no.url AS notion_policy
FROM github.repo_dependabot_alerts AS gh
LEFT JOIN slack.channels AS sl ON LOWER(sl.name) LIKE '%security%'
LEFT JOIN notion.search AS no ON no.query = ${notionQ}
WHERE gh.owner = ${o} AND gh.repo = ${r}
  AND (gh.state = 'open' OR gh.state IS NULL)
LIMIT 25`;
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
      return CoralQueries.commitsSecretPatterns();
    case "access_risky":
      return CoralQueries.collaboratorsAccess();
    case "access_with_policies":
      return CoralQueries.accessWithPolicies();
    case "vulns_dependencies":
      return CoralQueries.dependabotCriticalHigh();
    case "compliance_gaps":
      return CoralQueries.accessWithPolicies();
    case "slack_incidents":
      return CoralQueries.slackSecurityChannels();
    case "posture_summary":
    case "unified_events":
    default:
      return CoralQueries.enterpriseRiskPostureJoin();
  }
}

export function buildQueryForKindSafe(kind: QueryKind): string {
  if (!getGitHubScope()) {
    if (kind === "slack_incidents") return CoralQueries.slackSecurityChannels();
    if (kind === "compliance_gaps" || kind === "access_with_policies") {
      return CoralQueries.notionPolicySearchBroad();
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
        ? CoralQueries.secretsCommitsWithSlack()
        : CoralQueries.slackSecurityChannels();
    case "access":
      return canRunGitHubQueries()
        ? CoralQueries.accessWithPolicies()
        : CoralQueries.notionPolicySearchBroad();
    case "vulns":
      return canRunGitHubQueries()
        ? CoralQueries.dependabotCriticalHigh()
        : `SELECT 'configuration' AS source, 'Set GITHUB_OWNER and GITHUB_REPO' AS message`;
    case "compliance":
      return canRunGitHubQueries()
        ? CoralQueries.accessWithPolicies()
        : CoralQueries.notionPolicySearchBroad();
    case "slack":
      return CoralQueries.slackSecurityChannels();
    case "posture":
    default:
      return canRunGitHubQueries()
        ? CoralQueries.enterpriseRiskPostureJoin()
        : CoralQueries.slackSecurityChannels();
  }
}
