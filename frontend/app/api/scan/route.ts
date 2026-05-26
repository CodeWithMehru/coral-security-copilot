import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/env";
import { ensureServerEnv } from "@/lib/env-server";
import { loadScanReportOptional } from "@/lib/scan-loader";
import { DEMO_REPORT } from "@/lib/demo-data";

export const runtime = "nodejs";

export async function GET() {
  ensureServerEnv();

  if (isDemoMode()) {
    return NextResponse.json({
      report: DEMO_REPORT,
      source: "demo",
      mode: "demo",
      warning: "Demonstration mode — not connected to live integrations.",
    });
  }

  const { report, source, message } = await loadScanReportOptional();

  if (!report) {
    return NextResponse.json({
      report: null,
      source: "skipped",
      mode: "live",
      message:
        message ??
        "Compliance scanner unavailable. Coral SQL dashboards still work when tokens are configured.",
    });
  }

  return NextResponse.json({ report, source, mode: "live" });
}
