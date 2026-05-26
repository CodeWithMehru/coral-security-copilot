import type { ComplianceReport } from "./types";
import type { QueryKind } from "./query-kinds";
import { DEMO_ACTIVITY, SECRET_SCAN_DETAILS } from "./demo-data";

function isoOffset(hours: number): string {
  return new Date(Date.now() - hours * 3600000).toISOString();
}

/** Execute Coral-shaped queries against scan/demo data when CLI has no sources */
export function executeVirtualQuery(
  kind: QueryKind,
  report: ComplianceReport
): { columns: string[]; rows: Record<string, unknown>[] } {
  switch (kind) {
    case "secrets_with_commits":
    case "secrets_recent": {
      const rows: Record<string, unknown>[] = [];
      for (const s of report.secret_findings) {
        const meta = SECRET_SCAN_DETAILS[s.commit];
        for (const f of s.findings) {
          rows.push({
            commit_sha: s.commit,
            author_login: meta?.author ?? "unknown",
            repo_name: meta?.repo ?? "org/platform-api",
            commit_message: s.message,
            rule_id: f.rule_id,
            pattern_description: f.description,
            line_number: f.line_hint ?? null,
            redacted_match: f.matched_preview,
            severity: s.severity,
            detected_at: meta?.detected_at ?? isoOffset(2),
          });
        }
      }
      const columns =
        kind === "secrets_with_commits"
          ? [
              "commit_sha",
              "author_login",
              "repo_name",
              "commit_message",
              "rule_id",
              "pattern_description",
              "line_number",
              "redacted_match",
              "severity",
              "detected_at",
            ]
          : ["commit_sha", "rule_id", "pattern_description", "severity", "detected_at"];
      return { columns, rows: kind === "secrets_recent" ? rows.map(stripCommitJoinCols) : rows };
    }

    case "access_with_policies": {
      const rows = report.access_findings.map((a, i) => {
        const policy = report.policy_matches[i % Math.max(report.policy_matches.length, 1)];
        return {
          login: a.login ?? "—",
          permission: a.permission ?? "—",
          previous_permission: a.previous_permission ?? "—",
          change_type: a.type,
          severity: a.severity ?? "high",
          policy_title: policy?.title ?? "Access Control & IAM Policy",
          control_id: `CTRL-${100 + i}`,
          policy_status: "review_required",
          observed_at: isoOffset(6 - i),
        };
      });
      return {
        columns: [
          "login",
          "permission",
          "previous_permission",
          "change_type",
          "severity",
          "policy_title",
          "control_id",
          "policy_status",
          "observed_at",
        ],
        rows,
      };
    }

    case "access_risky": {
      return {
        columns: [
          "login",
          "permission",
          "previous_permission",
          "change_type",
          "severity",
          "repo_name",
          "observed_at",
        ],
        rows: report.access_findings.map((a, i) => ({
          login: a.login ?? "—",
          permission: a.permission ?? a.branch ?? "—",
          previous_permission: a.previous_permission ?? "—",
          change_type: a.type,
          severity: a.severity ?? "medium",
          repo_name: "org/platform-api",
          observed_at: isoOffset(4 - i),
        })),
      };
    }

    case "vulns_dependencies": {
      const rows: Record<string, unknown>[] = [];
      for (const o of report.osv_findings) {
        for (const v of o.vulnerabilities) {
          const pkg = v.affected ?? "unknown";
          const at = pkg.indexOf("@");
          rows.push({
            cve_id: v.id,
            package_name: at > 0 ? pkg.slice(0, at) : pkg,
            installed_version: at > 0 ? pkg.slice(at + 1) : "—",
            fixed_version: "see advisory",
            severity: (v.severity ?? o.severity).toUpperCase(),
            commit_sha: o.commit,
            committed_at: isoOffset(18),
            summary: v.summary ?? "—",
          });
        }
      }
      return {
        columns: [
          "cve_id",
          "package_name",
          "installed_version",
          "fixed_version",
          "severity",
          "commit_sha",
          "committed_at",
          "summary",
        ],
        rows,
      };
    }

    case "compliance_gaps": {
      const rows: Record<string, unknown>[] = [];
      report.access_findings.forEach((a, i) => {
        const policy = report.policy_matches[i % report.policy_matches.length];
        rows.push({
          change_summary: `${a.type}${a.login ? `: ${a.login}` : ""}`,
          change_type: a.type,
          github_severity: a.severity ?? "high",
          policy_title: policy?.title ?? "—",
          control_id: `CTRL-${200 + i}`,
          status: "review_required",
          matched_at: isoOffset(8),
        });
      });
      if (report.secret_findings.length) {
        const p = report.policy_matches.find((x) =>
          x.relevance?.includes("secret")
        );
        rows.push({
          change_summary: `${report.secret_findings.length} commits with secret patterns`,
          change_type: "secret_exposure",
          github_severity: "critical",
          policy_title: p?.title ?? "Secret Management Standard",
          control_id: "CTRL-SEC-001",
          status: "violation",
          matched_at: isoOffset(3),
        });
      }
      return {
        columns: [
          "change_summary",
          "change_type",
          "github_severity",
          "policy_title",
          "control_id",
          "status",
          "matched_at",
        ],
        rows,
      };
    }

    case "slack_incidents": {
      const slack = DEMO_ACTIVITY.filter((a) => a.source === "slack");
      return {
        columns: [
          "channel",
          "thread_ts",
          "summary",
          "severity",
          "incident_id",
          "incident_status",
          "posted_at",
        ],
        rows: [
          {
            channel: "#security-incidents",
            thread_ts: "1748001200.004821",
            summary:
              slack[0]?.detail ??
              "Credential rotation discussion — staging key exposure under triage",
            severity: "medium",
            incident_id: "INC-2024-1842",
            incident_status: "investigating",
            posted_at: slack[0]?.timestamp ?? isoOffset(4),
          },
          {
            channel: "#sec-ops-alerts",
            thread_ts: "1747998800.002104",
            summary: "Dependabot alert burst — 14 high severity in platform-api",
            severity: "high",
            incident_id: "INC-2024-1840",
            incident_status: "open",
            posted_at: isoOffset(6),
          },
        ],
      };
    }

    case "posture_summary": {
      const s = report.summary;
      const open = s.access_count + s.secret_count + s.osv_count;
      return {
        columns: ["metric_name", "metric_value", "severity", "source", "recorded_at"],
        rows: [
          { metric_name: "risk_score", metric_value: Math.min(100, open * 11), severity: open > 5 ? "high" : "medium", source: "coralsec", recorded_at: isoOffset(0) },
          { metric_name: "open_findings", metric_value: open, severity: "high", source: "aggregator", recorded_at: isoOffset(0) },
          { metric_name: "secret_commits", metric_value: s.secret_count, severity: "critical", source: "github", recorded_at: isoOffset(1) },
          { metric_name: "access_events", metric_value: s.access_count, severity: "high", source: "github", recorded_at: isoOffset(1) },
          { metric_name: "osv_matches", metric_value: s.osv_count, severity: "high", source: "osv", recorded_at: isoOffset(2) },
          { metric_name: "policy_matches", metric_value: s.policy_count, severity: "medium", source: "notion", recorded_at: isoOffset(2) },
          { metric_name: "mean_time_to_triage_hours", metric_value: 4.2, severity: "medium", source: "slack", recorded_at: isoOffset(3) },
          { metric_name: "branch_protection_gaps", metric_value: 1, severity: "high", source: "github", recorded_at: isoOffset(4) },
        ],
      };
    }

    case "unified_events":
    default: {
      return {
        columns: ["source", "title", "severity", "detail", "event_time"],
        rows: DEMO_ACTIVITY.slice(0, 10).map((a) => ({
          source: a.source,
          title: a.title,
          severity: a.severity,
          detail: a.detail ?? "—",
          event_time: a.timestamp,
        })),
      };
    }
  }
}

function stripCommitJoinCols(row: Record<string, unknown>): Record<string, unknown> {
  return {
    commit_sha: row.commit_sha,
    rule_id: row.rule_id,
    pattern_description: row.pattern_description,
    severity: row.severity,
    detected_at: row.detected_at,
  };
}
