import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/env";
import { ensureServerEnv } from "@/lib/env-server";
import { CoralQueries } from "@/lib/coral-queries";
import { runCoralQuery } from "@/lib/coral-service";
import { loadScanReportOptional } from "@/lib/scan-loader";
import { formatWarnings, partitionWarnings } from "@/lib/errors";
import { DEMO_REPORT } from "@/lib/demo-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  ensureServerEnv();

  if (isDemoMode()) {
    return NextResponse.json({ mode: "demo", coral: null, scan: DEMO_REPORT });
  }

  const includeScan = new URL(request.url).searchParams.get("scan") === "1";
  const rawWarnings: string[] = [];
  let coralResult = null;

  try {
    const sql = CoralQueries.dependabotVulnerabilities();
    coralResult = await runCoralQuery(sql, {
      queryKind: "vulns_dependencies",
      allowDemoFallback: false,
    });
    if (coralResult.error) rawWarnings.push(coralResult.error);
  } catch (e) {
    rawWarnings.push(
      e instanceof Error ? e.message : "Coral vulnerability query failed"
    );
  }

  let scan = null;
  if (includeScan) {
    const scanLoad = await loadScanReportOptional();
    scan = scanLoad.report;
    if (scanLoad.message) rawWarnings.push(scanLoad.message);
  }

  const hasData =
    (coralResult?.rowCount ?? 0) > 0 || (scan?.osv_findings?.length ?? 0) > 0;
  const formatted = formatWarnings(rawWarnings);
  const { alerts, informational } = partitionWarnings(formatted);

  return NextResponse.json({
    mode: "live",
    coral: coralResult,
    scan,
    hasData,
    warnings: alerts.length ? alerts : undefined,
    informational: informational.length ? informational : undefined,
  });
}
