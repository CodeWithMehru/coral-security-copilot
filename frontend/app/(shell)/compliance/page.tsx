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
import type { ComplianceReport, CoralSqlResponse, Severity } from "@/lib/types";

type GapRow = {
  login: string;
  permission: string;
  is_admin: boolean;
  policy_url: string;
  policy_query: string;
  severity: Severity;
};

export default function CompliancePage() {
  const [isDemo, setIsDemo] = useState(false);
  const [access, setAccess] = useState<CoralSqlResponse | null>(null);
  const [policies, setPolicies] = useState<CoralSqlResponse | null>(null);
  const [scan, setScan] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [informational, setInformational] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [compRes, configRes] = await Promise.all([
        fetch("/api/compliance"),
        fetch("/api/config"),
      ]);
      const data = await compRes.json();
      const config = await configRes.json();
      setIsDemo(config.isDemo === true);

      if (!compRes.ok && compRes.status >= 500) {
        throw new Error(data.error ?? "Failed to load compliance data");
      }
      setAccess(data.access ?? null);
      setPolicies(data.policies ?? null);
      setScan(data.scan ?? null);
      setWarnings(data.warnings ?? []);
      setInformational(data.informational ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setAccess(null);
      setPolicies(null);
      setScan(null);
      setInformational([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows: GapRow[] = useMemo(() => {
    if (access?.rows?.length) {
      return access.rows.map((r) => ({
        login: String(r.login ?? "—"),
        permission: String(r.permission ?? "—"),
        is_admin: r.is_admin === true,
        policy_url: String(r.policy_url ?? "—"),
        policy_query: String(r.policy_query ?? "—"),
        severity: r.is_admin === true || r.permission === "admin" ? "critical" : "high",
      }));
    }
    if (!access?.rows?.length && scan?.access_findings?.length) {
      return scan.access_findings.map((a, i) => ({
        login: a.login ?? "—",
        permission: a.permission ?? a.branch ?? "—",
        is_admin: a.permission === "admin",
        policy_url: scan.policy_matches[i]?.url ?? "—",
        policy_query: scan.policy_matches[i]?.title ?? "—",
        severity: (a.severity as Severity) ?? "high",
      }));
    }
    return [];
  }, [access, scan, isDemo]);

  const columns: ColumnDef<GapRow>[] = [
    { accessorKey: "login", header: "Collaborator" },
    { accessorKey: "permission", header: "Permission" },
    {
      accessorKey: "is_admin",
      header: "Admin",
      cell: ({ row }) => (row.original.is_admin ? "yes" : "no"),
    },
    {
      accessorKey: "policy_query",
      header: "Notion policy",
      cell: ({ row }) => {
        const url = row.original.policy_url;
        const label = row.original.policy_query;
        if (url.startsWith("http")) {
          return (
            <a
              href={url}
              className="text-xs text-blue-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {label}
            </a>
          );
        }
        return <span className="text-xs text-slate-500">{label}</span>;
      },
    },
    {
      accessorKey: "severity",
      header: "Severity",
      cell: ({ row }) => <SeverityBadge severity={row.original.severity} />,
    },
  ];

  const hasData =
    rows.length > 0 ||
    (policies?.rowCount ?? 0) > 0 ||
    (access?.rowCount ?? 0) > 0;
  const showEmpty = !loading && !error && !hasData && !isDemo;
  const sectionMeta = parseSectionWarnings(warnings, informational);

  return (
    <>
      <TopBar
        title="Compliance Monitor"
        subtitle="GitHub collaborators cross-referenced with Notion policies (Coral SQL)"
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
          <LoadingState label="Running GitHub × Notion compliance query via Coral…" />
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
            {access && access.rowCount > 0 ? (
              <section className="rounded-lg border border-coral-border bg-coral-panel p-4">
                <h2 className="mb-2 text-sm font-semibold text-slate-200">
                  GitHub × Notion (Coral JOIN)
                </h2>
                <SqlResultTable result={access} dataSource="coral" />
              </section>
            ) : null}

            {policies && policies.rowCount > 0 ? (
              <section className="rounded-lg border border-coral-border bg-coral-panel p-4">
                <h2 className="mb-2 text-sm font-semibold text-slate-200">
                  Notion policy search
                </h2>
                <SqlResultTable result={policies} dataSource="coral" />
              </section>
            ) : null}

            {rows.length > 0 ? (
              <DataTable
                data={rows}
                columns={columns}
                emptyMessage="No rows."
              />
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}
