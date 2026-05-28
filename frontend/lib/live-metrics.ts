import { CoralQueries } from "./coral-queries";
import { runCoralQuery } from "./coral-service";
import { isGitHubRateLimited } from "./coral-cache";
import {
  getCachedDashboard,
  setCachedDashboard,
  type DashboardCachePayload,
} from "./dashboard-cache";
import { formatWarnings, isRateLimitMessage } from "./errors";
import { isDemoMode } from "./env";
import { buildDashboardMetrics, DEMO_ACTIVITY, DEMO_REPORT } from "./demo-data";
import type { ActivityItem, DashboardMetrics } from "./types";

function rowStr(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return "";
  return String(v);
}

function isRateLimitResult(error?: string, errorKind?: string): boolean {
  return errorKind === "rate_limit" || (!!error && isRateLimitMessage(error));
}

/**
 * Dashboard: one lite secrets query (shared cache with Secret Scanner).
 * Dependabot query only when not rate-limited.
 */
export async function buildLiveDashboardMetrics(): Promise<{
  metrics: DashboardMetrics;
  warnings: string[];
  informational: string[];
}> {
  const warnings: string[] = [];
  const informational: string[] = [];
  let secretCount = 0;
  let vulnCount = 0;
  let criticalCount = 0;
  let highCount = 0;
  let patternMatches = 0;
  const activity: ActivityItem[] = [];

  const secretsSql = CoralQueries.commitsSecretPatterns();
  const secrets = await runCoralQuery(secretsSql, {
    queryKind: "secrets_recent",
    allowDemoFallback: false,
  });

  if (secrets.error) {
    if (isRateLimitResult(secrets.error, secrets.errorKind)) {
      informational.push(secrets.error);
    } else {
      warnings.push(secrets.error);
    }
  } else {
    secretCount = secrets.rowCount;
    patternMatches = secrets.rowCount;
    for (const row of secrets.rows.slice(0, 5)) {
      const state = rowStr(row, "state");
      const sev: ActivityItem["severity"] = state === "open" ? "critical" : "high";
      if (sev === "critical") criticalCount++;
      else highCount++;
      const commitHash = rowStr(row, "commit_hash") || rowStr(row, "sha");
      const alertNumber = rowStr(row, "alert_number");
      activity.push({
        // commit-based secret scans don't have alert_number; ensure stable unique IDs
        id: `gh-secret-${commitHash || alertNumber || rowStr(row, "html_url") || `row-${crypto.randomUUID()}`}`,
        timestamp: rowStr(row, "created_at") || new Date().toISOString(),
        source: "github",
        title: `Secret scanning: ${rowStr(row, "secret_type")}`,
        severity: sev,
        detail: rowStr(row, "file_path") || rowStr(row, "html_url"),
      });
    }
  }

  if (!isGitHubRateLimited() && !isRateLimitResult(secrets.error, secrets.errorKind)) {
    const vulns = await runCoralQuery(CoralQueries.dependabotCriticalHigh(), {
      queryKind: "vulns_dependencies",
      allowDemoFallback: false,
    });

    if (vulns.error) {
      if (isRateLimitResult(vulns.error, vulns.errorKind)) {
        informational.push(vulns.error);
      } else {
        warnings.push(vulns.error);
      }
    } else {
      vulnCount = vulns.rowCount;
      for (const row of vulns.rows.slice(0, 4)) {
        const sev = rowStr(row, "severity").toLowerCase();
        const itemSev: ActivityItem["severity"] =
          sev === "critical" ? "critical" : sev === "high" ? "high" : "medium";
        if (itemSev === "critical") criticalCount++;
        else if (itemSev === "high") highCount++;
        activity.push({
          id: `gh-vuln-${rowStr(row, "alert_number")}`,
          timestamp: rowStr(row, "created_at") || new Date().toISOString(),
          source: "osv",
          title: `CVE ${rowStr(row, "cve_id") || rowStr(row, "ghsa_id")} — ${rowStr(row, "package_name")}`,
          severity: itemSev,
          detail: rowStr(row, "advisory_summary"),
        });
      }
    }
  }

  const openFindings = secretCount + vulnCount;
  const medium = Math.max(0, openFindings - criticalCount - highCount);

  const now = Date.now();
  const trendData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now - (6 - i) * 86400000);
    const v = Math.max(0, openFindings - (6 - i));
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      findings: v,
      resolved: Math.floor(v * 0.35),
    };
  });

  const metrics: DashboardMetrics = {
    riskScore: Math.min(100, criticalCount * 14 + highCount * 6 + openFindings * 2),
    openFindings,
    criticalCount,
    highCount,
    mediumCount: medium,
    patternMatches,
    secretCommits: secretCount,
    reposMonitored: 1,
    lastScanAt: new Date().toISOString(),
    mtttHours: 0,
    slackAlerts24h: 0,
    recentActivity: activity.slice(0, 10),
    severityBreakdown: [
      { name: "Critical", value: criticalCount, fill: "#ef4444" },
      { name: "High", value: highCount, fill: "#f97316" },
      { name: "Medium", value: medium, fill: "#eab308" },
      { name: "Healthy", value: Math.max(0, 10 - openFindings), fill: "#10b981" },
    ],
    trendData,
    integrationHealth: [],
  };

  return {
    metrics,
    warnings: formatWarnings(warnings),
    informational: formatWarnings(informational),
  };
}

export async function getDashboardPayload(): Promise<DashboardCachePayload> {
  if (isDemoMode()) {
    return {
      metrics: buildDashboardMetrics(DEMO_REPORT, DEMO_ACTIVITY),
      mode: "demo",
      warnings: ["Demonstration mode is enabled (CORALSEC_USE_DEMO=true)."],
    };
  }

  const cached = getCachedDashboard();
  if (cached) return cached;

  const { metrics, warnings, informational } = await buildLiveDashboardMetrics();
  const payload: DashboardCachePayload = {
    metrics,
    mode: "live",
    warnings,
    informational: informational.length ? informational : undefined,
  };
  setCachedDashboard(payload);
  return payload;
}
