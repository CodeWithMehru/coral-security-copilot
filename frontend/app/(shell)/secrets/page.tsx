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
import { EMPTY_SECRETS_MESSAGE } from "@/lib/errors";
import type { ComplianceReport, CoralSqlResponse, Severity } from "@/lib/types";
import { truncate } from "@/lib/utils";

type PatternRow = {
  source: string;
  commit_or_alert: string;
  message: string;
  file_path: string;
  rule_id: string;
  description: string;
  preview: string;
  line: number | string;
  severity: Severity;
};

function mapSeverity(s: string): Severity {
  const u = s.toLowerCase();
  if (u === "open" || u === "critical") return "critical";
  if (u === "high") return "high";
  return "medium";
}

export default function SecretScannerPage() {
  const [isDemo, setIsDemo] = useState(false);
  const [coral, setCoral] = useState<CoralSqlResponse | null>(null);
  const [scan, setScan] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [informational, setInformational] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [emptyHint, setEmptyHint] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [secretsRes, configRes] = await Promise.all([
        fetch("/api/secrets?commits=1"),
        fetch("/api/config"),
      ]);
      const data = await secretsRes.json();
      const config = await configRes.json();
      setIsDemo(config.isDemo === true);

      if (!secretsRes.ok && secretsRes.status >= 500) {
        throw new Error(data.error ?? "Failed to load secret data");
      }
      setCoral(data.coral ?? null);
      setScan(data.scan ?? null);
      setWarnings(data.warnings ?? []);
      setInformational(data.informational ?? []);
      setEmptyHint(data.emptyHint ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setCoral(null);
      setScan(null);
      setInformational([]);
      setEmptyHint(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows: PatternRow[] = useMemo(() => {
    const out: PatternRow[] = [];

    if (coral?.rows?.length) {
      for (const row of coral.rows) {
        out.push({
          source: "GitHub (Coral)",
          commit_or_alert: String(row.alert_number ?? "—"),
          message: String(row.secret_type_display_name ?? row.secret_type ?? "—"),
          file_path: String(row.file_path ?? "—"),
          rule_id: String(row.secret_type ?? "—"),
          description: String(row.secret_type_display_name ?? row.secret_type ?? "—"),
          preview: "—",
          line: row.start_line != null ? String(row.start_line) : "—",
          severity: mapSeverity(String(row.state ?? "open")),
        });
      }
    }

    if (scan?.secret_findings?.length) {
      for (const s of scan.secret_findings) {
        for (const f of s.findings) {
          out.push({
            source: "Compliance scan",
            commit_or_alert: s.commit,
            message: s.message,
            file_path: "—",
            rule_id: f.rule_id,
            description: f.description,
            preview: f.matched_preview,
            line: f.line_hint != null ? String(f.line_hint) : "—",
            severity: s.severity,
          });
        }
      }
    }

    return out;
  }, [coral, scan, isDemo]);

  const columns: ColumnDef<PatternRow>[] = [
    { accessorKey: "source", header: "Source" },
    {
      accessorKey: "commit_or_alert",
      header: "Alert / Commit",
      cell: ({ row }) => (
        <code className="font-mono text-xs text-blue-400">
          {row.original.commit_or_alert}
        </code>
      ),
    },
    {
      accessorKey: "message",
      header: "Detail",
      cell: ({ row }) => (
        <span className="text-slate-400">{truncate(row.original.message, 48)}</span>
      ),
    },
    {
      accessorKey: "file_path",
      header: "Location",
      cell: ({ row }) => (
        <span className="text-xs text-slate-500">
          {truncate(row.original.file_path, 40)}
        </span>
      ),
    },
    { accessorKey: "rule_id", header: "Rule" },
    {
      accessorKey: "preview",
      header: "Match",
      cell: ({ row }) =>
        row.original.preview !== "—" ? (
          <code className="font-mono text-xs text-red-300/90">{row.original.preview}</code>
        ) : (
          "—"
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
        title="Secret Scanner"
        subtitle="GitHub secret scanning via Coral SQL + commit diff patterns"
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
          <ErrorBanner message={error} onRetry={() => load()} />
        ) : loading ? (
          <LoadingState label="Querying GitHub secret scanning via Coral…" />
        ) : showEmpty ? (
          <div className="space-y-4">
            {sectionMeta.informational.map((w) => (
              <InfoBanner key={w} message={w} />
            ))}
            <ConfigureEmptyState
              variant={sectionMeta.needsConfig ? "configure" : "no-data"}
              description={
                sectionMeta.needsConfig
                  ? undefined
                  : emptyHint ?? EMPTY_SECRETS_MESSAGE
              }
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                {coral?.rowCount ?? 0} Coral alert{(coral?.rowCount ?? 0) !== 1 ? "s" : ""}
                {!isDemo && scan?.secret_findings?.length
                  ? ` · ${scan.secret_findings.length} commit(s) from compliance scan`
                  : ""}
              </p>
              <button
                type="button"
                onClick={() => load(true)}
                disabled={refreshing}
                className="rounded-md border border-coral-border px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 disabled:opacity-50"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>

            {coral && coral.rowCount > 0 ? (
              <section className="rounded-lg border border-coral-border bg-coral-panel p-4">
                <h2 className="text-sm font-semibold text-slate-200">
                  GitHub Secret Scanning
                </h2>
                <SqlResultTable result={coral} dataSource="coral" />
              </section>
            ) : null}

            {hasData ? (
              <section>
                <h2 className="mb-3 text-sm font-semibold text-slate-200">All findings</h2>
                <DataTable data={rows} columns={columns} emptyMessage="No rows." />
              </section>
            ) : null}
          </div>
        )}
      </main>
    </>
  );
}
