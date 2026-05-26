"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { TopBar } from "@/components/layout/TopBar";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { SeverityBadge } from "@/components/ui/SeverityBadge";
import { SqlResultTable } from "@/components/ui/SqlResultTable";
import { ConfigureEmptyState } from "@/components/ui/ConfigureEmptyState";
import { InfoBanner } from "@/components/ui/InfoBanner";
import { parseSectionWarnings } from "@/lib/section-page-utils";
import { SourceBarChart } from "@/components/ui/FindingsChart";
import type { ComplianceReport, CoralSqlResponse, Severity } from "@/lib/types";

type VulnRow = {
  source: string;
  id: string;
  package: string;
  summary: string;
  severity: Severity;
};

function mapSeverity(s: string): Severity {
  const u = s.toUpperCase();
  if (u.includes("CRITICAL")) return "critical";
  if (u.includes("HIGH")) return "high";
  if (u.includes("MEDIUM")) return "medium";
  return "low";
}

export default function VulnerabilitiesPage() {
  const [isDemo, setIsDemo] = useState(false);
  const [coral, setCoral] = useState<CoralSqlResponse | null>(null);
  const [scan, setScan] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [informational, setInformational] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vulnRes, configRes] = await Promise.all([
        fetch("/api/vulnerabilities"),
        fetch("/api/config"),
      ]);
      const data = await vulnRes.json();
      const config = await configRes.json();
      setIsDemo(config.isDemo === true);

      if (!vulnRes.ok && vulnRes.status >= 500) {
        throw new Error(data.error ?? "Failed to load vulnerabilities");
      }
      setCoral(data.coral ?? null);
      setScan(data.scan ?? null);
      setWarnings(data.warnings ?? []);
      setInformational(data.informational ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setCoral(null);
      setScan(null);
      setInformational([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows: VulnRow[] = useMemo(() => {
    const out: VulnRow[] = [];
    if (coral?.rows?.length) {
      for (const r of coral.rows) {
        out.push({
          source: "Dependabot (Coral)",
          id: String(r.cve_id || r.ghsa_id || r.alert_number || "—"),
          package: String(r.package_name ?? "—"),
          summary: String(r.advisory_summary ?? "—"),
          severity: mapSeverity(String(r.severity ?? r.advisory_severity ?? "medium")),
        });
      }
    }
    if (scan?.osv_findings?.length) {
      for (const o of scan.osv_findings) {
        for (const v of o.vulnerabilities) {
          out.push({
            source: "OSV (compliance scan)",
            id: v.id,
            package: v.affected ?? "—",
            summary: v.summary ?? "—",
            severity: mapSeverity(v.severity ?? o.severity),
          });
        }
      }
    }
    return out;
  }, [coral, scan, isDemo]);

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      counts[r.severity] = (counts[r.severity] ?? 0) + 1;
    }
    return Object.entries(counts).map(([source, count]) => ({
      source: source.charAt(0).toUpperCase() + source.slice(1),
      count,
    }));
  }, [rows]);

  const columns: ColumnDef<VulnRow>[] = [
    { accessorKey: "source", header: "Source" },
    {
      accessorKey: "id",
      header: "CVE / GHSA",
      cell: ({ row }) => (
        <code className="font-mono text-xs text-orange-300">{row.original.id}</code>
      ),
    },
    { accessorKey: "package", header: "Package" },
    {
      accessorKey: "summary",
      header: "Summary",
      cell: ({ row }) => (
        <span className="max-w-md text-slate-400">{row.original.summary}</span>
      ),
    },
    {
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
    },
  ];

  const hasData = rows.length > 0;
  const showEmpty = !loading && !error && !hasData && !isDemo;
  const sectionMeta = parseSectionWarnings(warnings, informational);

  return (
    <>
      <TopBar
        title="Vulnerability Intelligence"
        subtitle="Dependabot advisories (Coral) and OSV cross-reference (compliance scan)"
      />
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        {sectionMeta.alertWarnings.length > 0 && !isDemo ? (
          <ul className="mb-4 space-y-1">
            {sectionMeta.alertWarnings.map((w) => (
              <li
                key={w}
                className="rounded border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
              >
                {w}
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <ErrorBanner message={error} onRetry={load} />
        ) : loading ? (
          <LoadingState label="Querying Dependabot advisories via Coral…" />
        ) : showEmpty ? (
          <div className="space-y-4">
            {sectionMeta.informational.map((w) => (
              <InfoBanner key={w} message={w} />
            ))}
            <ConfigureEmptyState
              variant={sectionMeta.needsConfig ? "configure" : "no-data"}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {coral && coral.rowCount > 0 ? (
              <section className="rounded-lg border border-coral-border bg-coral-panel p-4">
                <h2 className="mb-2 text-sm font-semibold text-slate-200">
                  Dependabot (Coral)
                </h2>
                <SqlResultTable result={coral} dataSource="coral" />
              </section>
            ) : null}

            {hasData ? (
              <>
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-lg border border-coral-border bg-coral-panel p-4 lg:col-span-1">
                    <h2 className="text-sm font-semibold text-slate-200">By severity</h2>
                    <SourceBarChart data={chartData} />
                  </div>
                </div>
                <DataTable data={rows} columns={columns} emptyMessage="No rows." />
              </>
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}
