"use client";

import { useCallback, useEffect, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { MetricCard } from "@/components/ui/MetricCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import { ConfigureEmptyState } from "@/components/ui/ConfigureEmptyState";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { parseSectionWarnings } from "@/lib/section-page-utils";
import {
  SeverityPieChart,
  FindingsTrendChart,
} from "@/components/ui/FindingsChart";
import {
  Activity,
  AlertTriangle,
  Gauge,
  GitBranch,
  MessageSquare,
  FileText,
  Shield,
  Scan,
} from "lucide-react";
import type { ActivityItem, DashboardMetrics } from "@/lib/types";
import { formatRelativeTime, sourceIconColor } from "@/lib/utils";

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [informational, setInformational] = useState<string[]>([]);
  const [mode, setMode] = useState<"demo" | "live">("live");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard");
      const data = await res.json();
      if (!res.ok && res.status >= 500) {
        throw new Error(data.error ?? "Failed to load dashboard");
      }
      setMetrics(data.metrics);
      setMode(data.mode ?? "live");
      setWarnings(data.warnings ?? []);
      setInformational(data.informational ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sectionMeta = parseSectionWarnings(warnings, informational);

  const sourceIcon = (source: ActivityItem["source"]) => {
    switch (source) {
      case "github":
        return GitBranch;
      case "slack":
        return MessageSquare;
      case "notion":
        return FileText;
      case "osv":
        return Shield;
      default:
        return Activity;
    }
  };

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle="Enterprise security posture overview"
      />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {sectionMeta.informational.length > 0 && mode === "live" ? (
          <div className="mb-4 space-y-2">
            {sectionMeta.informational.map((w) => (
              <InfoBanner key={w} message={w} />
            ))}
          </div>
        ) : null}
        {sectionMeta.alertWarnings.length > 0 && mode === "live" ? (
          <ul className="mb-4 space-y-1">
            {sectionMeta.alertWarnings.map((w) => (
              <li
                key={w}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200"
              >
                {w}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <ErrorBanner message={error} onRetry={load} />
        ) : loading || !metrics ? (
          <LoadingState label="Loading security metrics…" />
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Risk Score"
                value={metrics.riskScore}
                hint="Composite: secrets, access, OSV weighting"
                icon={Gauge}
                variant={
                  metrics.riskScore >= 70
                    ? "critical"
                    : metrics.riskScore >= 40
                      ? "high"
                      : "healthy"
                }
              />
              <MetricCard
                label="Open Findings"
                value={metrics.openFindings}
                hint={`${metrics.criticalCount} critical · ${metrics.highCount} high · ${metrics.mediumCount} medium`}
                icon={AlertTriangle}
                variant={metrics.openFindings > 8 ? "high" : "default"}
              />
              <MetricCard
                label="Secret Patterns"
                value={metrics.patternMatches}
                hint={`${metrics.secretCommits} commits · last scan ${formatRelativeTime(metrics.lastScanAt)}`}
                icon={Scan}
                variant="critical"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-coral-border bg-coral-panel p-4">
                <h2 className="text-sm font-semibold text-slate-200">
                  Severity distribution
                </h2>
                <SeverityPieChart data={metrics.severityBreakdown} />
              </section>
              <section className="rounded-lg border border-coral-border bg-coral-panel p-4">
                <h2 className="text-sm font-semibold text-slate-200">
                  Findings trend (7d)
                </h2>
                <p className="mb-2 text-xs text-slate-500">Open vs resolved volume</p>
                <FindingsTrendChart data={metrics.trendData} />
              </section>
            </div>

            <section className="rounded-lg border border-coral-border bg-coral-panel">
              <div className="border-b border-coral-border px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-200">
                  Recent activity
                </h2>
              </div>
              {mode === "live" && metrics.recentActivity.length === 0 ? (
                <div className="p-6">
                  <ConfigureEmptyState
                    variant={sectionMeta.needsConfig ? "configure" : "no-data"}
                  />
                </div>
              ) : (
              <ul className="divide-y divide-coral-border">
                {metrics.recentActivity.map((item, idx) => {
                  const Icon = sourceIcon(item.source);
                  const stableKey =
                    item.id && item.id.trim().length > 0
                      ? item.id
                      : `${item.source}-${item.timestamp}-${idx}`;
                  return (
                    <li
                      key={stableKey}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-800/30"
                    >
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${sourceIconColor(item.source)}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-slate-200">
                            {item.title}
                          </p>
                          <SeverityBadge severity={item.severity} />
                        </div>
                        {item.detail ? (
                          <p className="mt-0.5 text-xs text-slate-500">
                            {item.detail}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs text-slate-600">
                        {formatRelativeTime(item.timestamp)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
