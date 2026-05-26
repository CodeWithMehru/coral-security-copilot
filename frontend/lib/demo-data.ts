import type { ActivityItem, ComplianceReport, DashboardMetrics } from "./types";

export interface SecretCommitMeta {
  author: string;
  repo: string;
  branch: string;
  file_path: string;
  detected_at: string;
  diff_excerpt: string;
}

/** Extended metadata for secret scanner UI and JOIN query simulation */
export const SECRET_SCAN_DETAILS: Record<string, SecretCommitMeta> = {
  a4f91c2: {
    author: "jchen@corp.example",
    repo: "org/platform-api",
    branch: "feature/staging-rotate",
    file_path: "deploy/k8s/staging-secrets.yaml",
    detected_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    diff_excerpt: "+ GITHUB_TOKEN=ghp_ab…xyz9  # TODO remove before merge",
  },
  e82b10d: {
    author: "devops-bot",
    repo: "org/webhooks-service",
    branch: "main",
    file_path: "src/handlers/slack_notify.py",
    detected_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    diff_excerpt: '+ SLACK_BOT_TOKEN="xoxb-1…"',
  },
  f31d8e4: {
    author: "mross@corp.example",
    repo: "org/data-pipeline",
    branch: "hotfix/ingest-key",
    file_path: "config/prod.env.example",
    detected_at: new Date(Date.now() - 11 * 3600000).toISOString(),
    diff_excerpt: "+ NOTION_SECRET=secret_…",
  },
  b9021aa: {
    author: "svc-ci@corp.example",
    repo: "org/platform-api",
    branch: "ci/cache-fix",
    file_path: ".github/workflows/deploy.yml",
    detected_at: new Date(Date.now() - 26 * 3600000).toISOString(),
    diff_excerpt: "+ AWS_SECRET_ACCESS_KEY=\"…\"  (test fixture leaked)",
  },
};

export const DEMO_REPORT: ComplianceReport = {
  access_findings: [
    {
      type: "permission_escalation",
      login: "svc-deploy-bot",
      permission: "admin",
      previous_permission: "write",
      severity: "critical",
    },
    {
      type: "new_collaborator",
      login: "contractor-audit-q2",
      permission: "maintain",
      severity: "high",
    },
    {
      type: "permission_escalation",
      login: "legacy-migration-sa",
      permission: "admin",
      previous_permission: "read",
      severity: "critical",
    },
    {
      type: "branch_unprotected",
      branch: "main",
      severity: "high",
    },
  ],
  secret_findings: [
    {
      commit: "a4f91c2",
      message: "fix: rotate staging credentials for platform-api",
      severity: "critical",
      findings: [
        {
          rule_id: "github_pat",
          description: "GitHub personal access token",
          matched_preview: "ghp_ab…xyz9",
          line_hint: 42,
        },
        {
          rule_id: "generic_api_key",
          description: "Generic API key assignment",
          matched_preview: "api_ke…8f2a",
          line_hint: 58,
        },
      ],
    },
    {
      commit: "e82b10d",
      message: "chore: update Slack webhook handler defaults",
      severity: "critical",
      findings: [
        {
          rule_id: "slack_token",
          description: "Slack bot token",
          matched_preview: "xoxb-1…4a2f",
          line_hint: 12,
        },
      ],
    },
    {
      commit: "f31d8e4",
      message: "docs: add Notion sync example env block",
      severity: "critical",
      findings: [
        {
          rule_id: "notion_token",
          description: "Notion integration token",
          matched_preview: "secret_…9c1d",
          line_hint: 7,
        },
      ],
    },
    {
      commit: "b9021aa",
      message: "ci: cache node_modules in deploy workflow",
      severity: "high",
      findings: [
        {
          rule_id: "aws_secret_key",
          description: "AWS secret access key",
          matched_preview: "wJalr…UtnF",
          line_hint: 89,
        },
        {
          rule_id: "jwt",
          description: "JSON Web Token",
          matched_preview: "eyJhbG…XMiJ9",
          line_hint: 102,
        },
      ],
    },
  ],
  osv_findings: [
    {
      commit: "c3d88aa",
      severity: "high",
      vulnerabilities: [
        {
          id: "GHSA-29mw-w4m4-4ph5",
          summary: "Prototype pollution in lodash",
          severity: "HIGH",
          affected: "lodash@4.17.20",
        },
        {
          id: "CVE-2024-4741",
          summary: "OpenSSL buffer over-read in TLS handshake",
          severity: "CRITICAL",
          affected: "openssl@3.0.13",
        },
        {
          id: "GHSA-952p-76c6-q7j2",
          summary: "Path traversal in express static middleware",
          severity: "HIGH",
          affected: "express@4.18.2",
        },
      ],
    },
    {
      commit: "9a1ff03",
      severity: "medium",
      vulnerabilities: [
        {
          id: "CVE-2024-22019",
          summary: "Undici fetch with untrusted certificates",
          severity: "MEDIUM",
          affected: "undici@5.28.3",
        },
      ],
    },
  ],
  policy_matches: [
    {
      title: "Access Control & IAM Policy",
      url: "https://notion.so/internal/iam-policy",
      relevance: "access, privilege, iam",
      snippet:
        "Administrative repository permissions require CISO approval and quarterly access review.",
    },
    {
      title: "Secret Management Standard",
      url: "https://notion.so/internal/secret-mgmt",
      relevance: "secret, credential, leak",
      snippet:
        "Credentials must never appear in commit diffs. Use vault injection in CI/CD only.",
    },
    {
      title: "Vulnerability Remediation SLA",
      url: "https://notion.so/internal/vuln-sla",
      relevance: "vulnerability, cve, patch",
      snippet: "Critical CVEs: patch or mitigate within 72 hours. High: 14 days.",
    },
    {
      title: "Branch Protection Requirements",
      url: "https://notion.so/internal/branch-protection",
      relevance: "branch, protection, github",
      snippet: "Default branch must enforce required reviews and block force-push.",
    },
  ],
  errors: [],
  summary: {
    access_count: 4,
    secret_count: 4,
    osv_count: 2,
    policy_count: 4,
    error_count: 0,
  },
};

export const DEMO_ACTIVITY: ActivityItem[] = [
  {
    id: "act-1",
    timestamp: new Date(Date.now() - 12 * 60000).toISOString(),
    source: "github",
    title: "Admin permission granted to svc-deploy-bot",
    severity: "critical",
    detail: "Escalation write → admin on org/platform-api",
  },
  {
    id: "act-2",
    timestamp: new Date(Date.now() - 38 * 60000).toISOString(),
    source: "github",
    title: "Secret patterns in commit a4f91c2 (platform-api)",
    severity: "critical",
    detail: "github_pat, generic_api_key — deploy/k8s/staging-secrets.yaml",
  },
  {
    id: "act-3",
    timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
    source: "osv",
    title: "OSV: 3 advisories on commit c3d88aa",
    severity: "high",
    detail: "lodash, openssl, express — dependency lockfile delta",
  },
  {
    id: "act-4",
    timestamp: new Date(Date.now() - 4 * 3600000).toISOString(),
    source: "slack",
    title: "#security-incidents: staging credential exposure",
    severity: "medium",
    detail: "INC-2024-1842 assigned to SecEng — rotation in progress",
  },
  {
    id: "act-5",
    timestamp: new Date(Date.now() - 6 * 3600000).toISOString(),
    source: "github",
    title: "Slack token detected in webhooks-service main",
    severity: "critical",
    detail: "Commit e82b10d — auto-block recommended",
  },
  {
    id: "act-6",
    timestamp: new Date(Date.now() - 8 * 3600000).toISOString(),
    source: "notion",
    title: "Policy match: Secret Management Standard",
    severity: "high",
    detail: "4 commits violate §4.2 — credential in diff",
  },
  {
    id: "act-7",
    timestamp: new Date(Date.now() - 14 * 3600000).toISOString(),
    source: "github",
    title: "main branch protection gap detected",
    severity: "high",
    detail: "Required status checks not enforced",
  },
  {
    id: "act-8",
    timestamp: new Date(Date.now() - 24 * 3600000).toISOString(),
    source: "system",
    title: "Scheduled compliance scan completed",
    severity: "info",
    detail: "14 open findings · Slack notification sent",
  },
];

export function buildDashboardMetrics(
  report: ComplianceReport,
  activity: ActivityItem[] = DEMO_ACTIVITY
): DashboardMetrics {
  const critical =
    report.secret_findings.length +
    report.access_findings.filter((f) => f.severity === "critical").length;
  const high =
    report.osv_findings.reduce((n, o) => n + o.vulnerabilities.length, 0) +
    report.access_findings.filter((f) => f.severity === "high").length;

  const openFindings =
    report.summary.access_count +
    report.summary.secret_count +
    report.summary.osv_count;

  const patternMatches = report.secret_findings.reduce(
    (n, s) => n + s.findings.length,
    0
  );

  const riskScore = Math.min(
    100,
    Math.round(
      critical * 14 +
        high * 6 +
        report.summary.access_count * 2 +
        patternMatches * 1.5
    )
  );

  const now = Date.now();
  const trendData = [12, 14, 11, 15, 13, 16, openFindings || 14].map((v, i) => {
    const d = new Date(now - (6 - i) * 86400000);
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      findings: v,
      resolved: Math.max(2, Math.floor(v * 0.4)),
    };
  });

  const medium = Math.max(0, openFindings - Math.min(critical + high, openFindings));

  return {
    riskScore,
    openFindings,
    criticalCount: critical,
    highCount: high,
    mediumCount: medium,
    patternMatches,
    secretCommits: report.summary.secret_count,
    reposMonitored: 24,
    lastScanAt: new Date(Date.now() - 18 * 60000).toISOString(),
    mtttHours: 4.2,
    slackAlerts24h: 3,
    recentActivity: activity.slice(0, 10),
    severityBreakdown: [
      { name: "Critical", value: critical, fill: "#ef4444" },
      { name: "High", value: high, fill: "#f97316" },
      { name: "Medium", value: medium, fill: "#eab308" },
      { name: "Healthy", value: Math.max(4, 28 - openFindings), fill: "#10b981" },
    ],
    trendData,
    integrationHealth: [
      { name: "GitHub", status: "connected", latencyMs: 142 },
      { name: "OSV", status: "connected", latencyMs: 89 },
      { name: "Notion", status: "connected", latencyMs: 210 },
      { name: "Slack", status: "connected", latencyMs: 176 },
    ],
  };
}

export const DEMO_METRICS = buildDashboardMetrics(DEMO_REPORT);
