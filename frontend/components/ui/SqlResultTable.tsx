"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { CoralSqlResponse } from "@/lib/types";
import { isRateLimitMessage } from "@/lib/errors";
import { DataTable } from "./DataTable";
import { SeverityBadge } from "./SeverityBadge";
import type { Severity } from "@/lib/types";

function formatCell(key: string, value: unknown): ReactNode {
  if (value === null || value === undefined) return <span className="text-slate-600">—</span>;

  if (key === "severity" || key === "github_severity") {
    const s = String(value).toLowerCase() as Severity;
    if (["critical", "high", "medium", "low", "info"].includes(s)) {
      return <SeverityBadge severity={s} />;
    }
  }

  if (
    key.includes("sha") ||
    key === "cve_id" ||
    key === "rule_id" ||
    key === "control_id" ||
    key === "incident_id"
  ) {
    return (
      <code className="font-mono text-xs text-blue-400/90">{String(value)}</code>
    );
  }

  if (key === "redacted_match") {
    return (
      <code className="font-mono text-xs text-red-300/90">{String(value)}</code>
    );
  }

  if (typeof value === "object") {
    return (
      <span className="font-mono text-xs text-slate-500">
        {JSON.stringify(value)}
      </span>
    );
  }

  const str = String(value);
  if (str.length > 80) {
    return <span title={str}>{str.slice(0, 77)}…</span>;
  }
  return str;
}

interface SqlResultTableProps {
  result: CoralSqlResponse;
  dataSource?: string;
  notice?: string;
}

export function SqlResultTable({ result, dataSource, notice }: SqlResultTableProps) {
  if (result.rowCount === 0 && !result.columns.length) {
    return (
      <p className="mt-2 text-sm text-slate-500">
        No rows returned.
      </p>
    );
  }

  if (result.error && result.rowCount === 0) {
    const rateLimited = isRateLimitMessage(result.error);
    return (
      <p
        className={
          rateLimited
            ? "mt-2 rounded border border-slate-600/40 bg-slate-800/40 px-3 py-2 text-sm text-slate-300"
            : "mt-2 text-sm text-red-400"
        }
        role="status"
      >
        {result.error}
      </p>
    );
  }

  const columns: ColumnDef<Record<string, unknown>>[] = result.columns.map(
    (col) => ({
      accessorKey: col,
      header: col.replace(/_/g, " "),
      cell: ({ row }) => formatCell(col, row.getValue(col)),
    })
  );

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          {result.rowCount} row{result.rowCount !== 1 ? "s" : ""} · {result.durationMs}ms
        </span>
        {dataSource === "coral" ? (
          <span className="rounded border border-coral-border px-1.5 py-0.5 font-medium uppercase tracking-wide text-slate-500">
            Coral SQL
          </span>
        ) : null}
      </div>
      {notice ? (
        <p className="rounded border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
          {notice}
        </p>
      ) : null}
      <DataTable
        data={result.rows}
        columns={columns}
        emptyMessage="Query returned no rows."
      />
    </div>
  );
}
