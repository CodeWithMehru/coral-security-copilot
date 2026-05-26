import type { QueryKind } from "./query-kinds";
import {
  buildCrossSourceJoinQuery,
  buildQueryForKind,
  canRunGitHubQueries,
  CoralQueries,
} from "./coral-queries";
import { ConfigError, isDemoMode } from "./env";

export interface GeneratedQuery {
  sql: string;
  explanation: string;
  queryKind: QueryKind;
  fromTemplate: boolean;
}

interface TemplateDef {
  kind: QueryKind;
  intent: "secrets" | "access" | "vulns" | "compliance" | "slack" | "posture";
  score: (input: string) => number;
  explanation: string;
}

const TEMPLATES: TemplateDef[] = [
  {
    kind: "secrets_with_commits",
    intent: "secrets",
    score: (q) => {
      let s = 0;
      if (/secret|credential|leak|pat|token|exposed/i.test(q)) s += 3;
      if (/recent|commit|diff|show|list/i.test(q)) s += 2;
      return s;
    },
    explanation:
      "GitHub secret scanning alerts joined with Dependabot vulnerability context on the same repository.",
  },
  {
    kind: "access_with_policies",
    intent: "access",
    score: (q) => {
      let s = 0;
      if (/permission|access|collaborator|admin|iam|privilege|risky/i.test(q)) s += 3;
      if (/policy|compliance|notion/i.test(q)) s += 2;
      return s;
    },
    explanation:
      "Repository collaborators cross-referenced with Notion policy pages (access + compliance).",
  },
  {
    kind: "vulns_dependencies",
    intent: "vulns",
    score: (q) => {
      let s = 0;
      if (/vuln|cve|osv|dependenc|package|library|npm|pypi|advisory/i.test(q)) s += 4;
      return s;
    },
    explanation:
      "Dependabot alerts with GitHub Security Advisory CVE/GHSA metadata (OSV-equivalent intelligence).",
  },
  {
    kind: "compliance_gaps",
    intent: "compliance",
    score: (q) => {
      let s = 0;
      if (/compliance|policy|notion|gap|violation|control/i.test(q)) s += 4;
      return s;
    },
    explanation:
      "GitHub access posture joined to Notion internal policy documents for gap analysis.",
  },
  {
    kind: "slack_incidents",
    intent: "slack",
    score: (q) => {
      let s = 0;
      if (/slack|incident|discussion|channel|thread/i.test(q)) s += 4;
      return s;
    },
    explanation: "Slack channels related to security operations and incident response.",
  },
  {
    kind: "posture_summary",
    intent: "posture",
    score: (q) => {
      if (/risk|score|overview|dashboard|summary|posture|metric/i.test(q)) return 3;
      return 0;
    },
    explanation:
      "Unified security posture: GitHub secret + Dependabot findings (and Slack when GitHub scope unset).",
  },
];

function liveSqlForTemplate(t: TemplateDef): string {
  try {
    return buildCrossSourceJoinQuery(t.intent);
  } catch (e) {
    if (e instanceof ConfigError) {
      if (t.intent === "slack") return CoralQueries.slackSecurityChannels();
      return CoralQueries.notionPolicySearch();
    }
    throw e;
  }
}

function demoSqlForKind(kind: QueryKind): string {
  return buildQueryForKind(kind);
}

export function naturalLanguageToSql(input: string): GeneratedQuery {
  const trimmed = input.trim();
  if (/^\s*SELECT\b/i.test(trimmed)) {
    return {
      sql: trimmed,
      explanation: "Executing provided read-only SQL against Coral sources.",
      queryKind: "unified_events",
      fromTemplate: false,
    };
  }

  let best: TemplateDef | null = null;
  let bestScore = 0;
  for (const template of TEMPLATES) {
    const s = template.score(trimmed);
    if (s > bestScore) {
      bestScore = s;
      best = template;
    }
  }

  if (best && bestScore > 0) {
    const sql = isDemoMode() ? demoSqlForKind(best.kind) : liveSqlForTemplate(best);
    return {
      sql,
      explanation: best.explanation,
      queryKind: best.kind,
      fromTemplate: true,
    };
  }

  const kind: QueryKind = "unified_events";
  return {
    sql: isDemoMode() ? demoSqlForKind(kind) : buildCrossSourceJoinQuery("posture"),
    explanation: "Unified security event stream across configured Coral sources.",
    queryKind: kind,
    fromTemplate: true,
  };
}
