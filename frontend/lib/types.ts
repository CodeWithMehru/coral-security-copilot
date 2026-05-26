/** Severity levels aligned with backend compliance scanner */
export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface ScanSummary {
  access_count: number;
  secret_count: number;
  osv_count: number;
  policy_count: number;
  error_count: number;
}

export interface AccessFinding {
  type: string;
  severity?: Severity;
  login?: string;
  permission?: string;
  branch?: string;
  previous_permission?: string;
}

export interface SecretPatternFinding {
  rule_id: string;
  description: string;
  matched_preview: string;
  line_hint?: number;
}

export interface SecretCommitFinding {
  commit: string;
  message: string;
  findings: SecretPatternFinding[];
  severity: Severity;
}

export interface OsvVulnerability {
  id: string;
  summary?: string;
  severity?: string;
  affected?: string;
}

export interface OsvCommitFinding {
  commit: string;
  vulnerabilities: OsvVulnerability[];
  severity: Severity;
}

export interface PolicyMatch {
  title: string;
  url?: string;
  relevance?: string;
  snippet?: string;
}

export interface ComplianceReport {
  access_findings: AccessFinding[];
  secret_findings: SecretCommitFinding[];
  osv_findings: OsvCommitFinding[];
  policy_matches: PolicyMatch[];
  errors: string[];
  summary: ScanSummary;
  slack_notified?: boolean;
}

export interface DashboardMetrics {
  riskScore: number;
  openFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  patternMatches: number;
  secretCommits: number;
  reposMonitored: number;
  lastScanAt: string;
  mtttHours: number;
  slackAlerts24h: number;
  recentActivity: ActivityItem[];
  severityBreakdown: { name: string; value: number; fill: string }[];
  trendData: { date: string; findings: number; resolved?: number }[];
  integrationHealth: {
    name: string;
    status: "connected" | "degraded" | "offline";
    latencyMs: number;
  }[];
}

export interface ChatGenerateResponse {
  sql: string;
  explanation: string;
  queryKind: string;
  fromTemplate: boolean;
}

export interface ActivityItem {
  id: string;
  timestamp: string;
  source: "github" | "slack" | "notion" | "osv" | "system";
  title: string;
  severity: Severity;
  detail?: string;
}

export interface CoralSqlRequest {
  sql: string;
}

export interface CoralSqlResponse {
  sql: string;
  raw: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  error?: string;
  dataSource?: "coral" | "demo" | "scan_derived";
  mode?: "demo" | "live";
  notice?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sql?: string;
  result?: CoralSqlResponse;
  dataSource?: "coral" | "demo" | "scan_derived";
  notice?: string;
  timestamp: string;
}
