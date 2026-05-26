import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/env";
import { ensureServerEnv } from "@/lib/env-server";
import { CoralQueries } from "@/lib/coral-queries";
import { runCoralQuery } from "@/lib/coral-service";
import { isGitHubRateLimited } from "@/lib/coral-cache";
import { loadScanReportOptional } from "@/lib/scan-loader";
import { formatWarnings, partitionWarnings, RATE_LIMIT_USER_MESSAGE } from "@/lib/errors";
import { DEMO_REPORT } from "@/lib/demo-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  ensureServerEnv();

  if (isDemoMode()) {
    return NextResponse.json({ mode: "demo", coral: null, scan: DEMO_REPORT });
  }

  const includeScan = new URL(request.url).searchParams.get("scan") === "1";
  const rawWarnings: string[] = [];
  let accessResult = null;
  let policyResult = null;

  if (isGitHubRateLimited()) {
    rawWarnings.push(RATE_LIMIT_USER_MESSAGE);
  }

  if (!isGitHubRateLimited()) {
    try {
      accessResult = await runCoralQuery(CoralQueries.collaboratorsAccess(), {
        queryKind: "access_risky",
        allowDemoFallback: false,
      });
      if (accessResult.error) rawWarnings.push(accessResult.error);
    } catch (e) {
      rawWarnings.push(e instanceof Error ? e.message : "GitHub access query failed");
    }
  }

  if (!isGitHubRateLimited()) {
    try {
      policyResult = await runCoralQuery(CoralQueries.notionPolicySearch(), {
        allowDemoFallback: false,
      });
      if (policyResult.error) rawWarnings.push(policyResult.error);
    } catch (e) {
      rawWarnings.push(e instanceof Error ? e.message : "Notion policy query failed");
    }
  }

  let scan = null;
  if (includeScan) {
    const scanLoad = await loadScanReportOptional();
    scan = scanLoad.report;
    if (scanLoad.message) rawWarnings.push(scanLoad.message);
  }

  const hasData =
    (accessResult?.rowCount ?? 0) > 0 ||
    (policyResult?.rowCount ?? 0) > 0 ||
    (scan?.access_findings?.length ?? 0) > 0 ||
    (scan?.policy_matches?.length ?? 0) > 0;
  const formatted = formatWarnings(rawWarnings);
  const { alerts, informational } = partitionWarnings(formatted);

  return NextResponse.json({
    mode: "live",
    access: accessResult,
    policies: policyResult,
    scan,
    hasData,
    warnings: alerts.length ? alerts : undefined,
    informational: informational.length ? informational : undefined,
  });
}
