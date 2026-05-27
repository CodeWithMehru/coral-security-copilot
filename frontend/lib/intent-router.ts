/**
 * Deterministic intent classification — one distinct SQL shape per intent.
 * Evaluated in priority order so "Summarize … Dependabot" never reuses commits LIKE SQL.
 */

import {
  buildCrossSourceJoinQuery,
  canRunGitHubQueries,
  CoralQueries,
} from "./coral-queries";
import { ConfigError } from "./env";
import type { QueryKind } from "./query-kinds";
import type { AgentIntent } from "./agent-system-prompt";

export type RoutedIntent =
  | "posture_unified"
  | "secrets_ghas_alerts"
  | "secrets_commits"
  | "vulns_dependabot"
  | "access_collaborators"
  | "compliance_notion"
  | "slack_channels";

export interface RoutedQueryPlan {
  routedIntent: RoutedIntent;
  agentIntent: AgentIntent;
  queryKind: QueryKind;
  /** Human-readable reason for routing (debug / explanation) */
  reason: string;
}

/**
 * Classify user message into exactly one routed intent (first match wins).
 */
export function classifyUserIntent(input: string): RoutedQueryPlan {
  const q = input.trim();
  const lower = q.toLowerCase();

  // --- Priority 1: Risk posture / summarize (NEVER use github.commits LIKE) ---
  if (
    /summarize|summary|unified posture|risk posture|security posture|overview|posture across/i.test(
      lower
    ) &&
    (/dependabot|cve|vulnerabilit|findings across|secret scanning and dependabot/i.test(
      lower
    ) ||
      /across github|multi.?source|cross.?source/i.test(lower))
  ) {
    return {
      routedIntent: "posture_unified",
      agentIntent: "posture",
      queryKind: "posture_summary",
      reason:
        "Summarize/posture request with Dependabot — enterprise JOIN (no commits LIKE query).",
    };
  }

  if (
    /summarize|summary|risk posture|unified/i.test(lower) &&
    /dependabot|cve|vuln/i.test(lower) &&
    !/which collaborator|admin access|slack channel list/i.test(lower)
  ) {
    return {
      routedIntent: "posture_unified",
      agentIntent: "posture",
      queryKind: "posture_summary",
      reason: "Summary spanning vulnerabilities — unified Dependabot + Slack + Notion JOIN.",
    };
  }

  // --- Priority 2: Dependabot-only (no secret commits) ---
  if (
    /dependabot|cve|ghsa|osv|vulnerabilit|advisory|package/i.test(lower) &&
    !/secret scanning alert|commit.*like|collaborator|notion|slack channel/i.test(lower)
  ) {
    return {
      routedIntent: "vulns_dependabot",
      agentIntent: "vulns",
      queryKind: "vulns_dependencies",
      reason: "Dependabot/CVE-focused query.",
    };
  }

  // --- Priority 3: Secret alerts (RULE 2 — always github.commits, never GHAS table) ---
  if (
    /secret scanning alert|scanning alert|open.*secret|secret type|file path|ghas|advanced security/i.test(
      lower
    ) &&
    !/summarize|dependabot|risk posture/i.test(lower)
  ) {
    return {
      routedIntent: "secrets_commits",
      agentIntent: "secrets",
      queryKind: "secrets_with_commits",
      reason:
        "Open secret alerts via github.commits LIKE (not repo_secret_scanning_alerts); local diff scan merged if empty.",
    };
  }

  // --- Priority 4: Slack-only ---
  if (
    /slack/i.test(lower) &&
    /channel|incident|discussion/i.test(lower) &&
    !/dependabot|collaborator|notion policy/i.test(lower)
  ) {
    return {
      routedIntent: "slack_channels",
      agentIntent: "slack",
      queryKind: "slack_incidents",
      reason: "Slack channel discovery.",
    };
  }

  // --- Priority 5: Compliance / Notion × access ---
  if (
    (/compliance|policy|notion/i.test(lower) && /collaborator|access|permission/i.test(lower)) ||
    /cross.?reference.*notion|policies.*access/i.test(lower)
  ) {
    return {
      routedIntent: "compliance_notion",
      agentIntent: "compliance",
      queryKind: "compliance_gaps",
      reason: "Compliance: collaborators cross-referenced with broad Notion search.",
    };
  }

  // --- Priority 6: Access / admin ---
  if (/collaborator|admin access|permission|elevated access|iam/i.test(lower)) {
    return {
      routedIntent: "access_collaborators",
      agentIntent: "access",
      queryKind: "access_risky",
      reason: "Repository collaborator permissions.",
    };
  }

  // --- Priority 7: Generic secrets → commits LIKE (not posture) ---
  if (/secret|credential|leak|token|exposed|apikey|password/i.test(lower)) {
    const slackContext = /slack|channel|reported|incident/i.test(lower);
    return {
      routedIntent: slackContext ? "secrets_commits" : "secrets_commits",
      agentIntent: "secrets",
      queryKind: "secrets_with_commits",
      reason: slackContext
        ? "Secret hunt with Slack incident channel context."
        : "Commit-message pattern search for leaked secrets.",
    };
  }

  // --- Default: unified posture JOIN ---
  return {
    routedIntent: "posture_unified",
    agentIntent: "posture",
    queryKind: "unified_events",
    reason: "Default — enterprise cross-source posture query.",
  };
}

const EXPLANATIONS: Record<RoutedIntent, string> = {
  posture_unified:
    "RULE 3: LEFT JOIN github.repo_dependabot_alerts + Slack + Notion; (state = 'open' OR state IS NULL).",
  secrets_ghas_alerts:
    "RULE 2: github.commits LIKE patterns (GHAS table not used). Local commit-diff scan merged if empty.",
  secrets_commits:
    'Scanning commit history for patterns (AWS, PAT, Keys)… — github.commits LIKE only; no state filter; local diff scan if empty.',
  vulns_dependabot:
    "RULE 1: github.repo_dependabot_alerts with (state = 'open' OR state IS NULL) — no severity filter.",
  access_collaborators: "Repository collaborators and permission levels.",
  compliance_notion:
    "RULE 4: collaborators LEFT JOIN notion.search ON query = 'security compliance policy' (exact API pushdown).",
  slack_channels: "slack.channels filtered for security/incident operations.",
};

/** Map routed intent → exactly one SQL template (no duplicate shapes across intents). */
export function buildSqlForRoutedPlan(plan: RoutedQueryPlan, userInput: string): string {
  const slackInSecrets = /slack|channel|reported/i.test(userInput.toLowerCase());

  try {
    switch (plan.routedIntent) {
      case "posture_unified":
        return canRunGitHubQueries()
          ? CoralQueries.enterpriseRiskPostureJoin()
          : CoralQueries.slackSecurityChannels();

      case "secrets_ghas_alerts":
        return canRunGitHubQueries()
          ? CoralQueries.commitsSecretPatterns()
          : CoralQueries.commitsSecretPatterns();

      case "secrets_commits":
        if (!canRunGitHubQueries()) return CoralQueries.slackSecurityChannels();
        return slackInSecrets
          ? CoralQueries.secretsCommitsWithSlack()
          : CoralQueries.commitsSecretPatterns();

      case "vulns_dependabot":
        return canRunGitHubQueries()
          ? CoralQueries.dependabotCriticalHigh()
          : `SELECT 'configuration' AS source, 'Set GITHUB_OWNER and GITHUB_REPO' AS message`;

      case "access_collaborators":
        return canRunGitHubQueries()
          ? CoralQueries.collaboratorsAccess()
          : CoralQueries.notionConnectivityProbe();

      case "compliance_notion":
        return canRunGitHubQueries()
          ? CoralQueries.accessWithPolicies()
          : CoralQueries.notionPolicySearchBroad();

      case "slack_channels":
        return CoralQueries.slackSecurityChannels();

      default:
        return buildCrossSourceJoinQuery("posture");
    }
  } catch (e) {
    if (e instanceof ConfigError) {
      return CoralQueries.notionConnectivityProbe();
    }
    throw e;
  }
}

export function explanationForRoutedPlan(plan: RoutedQueryPlan): string {
  return EXPLANATIONS[plan.routedIntent] ?? plan.reason;
}
