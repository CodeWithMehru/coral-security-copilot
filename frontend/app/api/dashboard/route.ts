import { NextResponse } from "next/server";
import { ensureServerEnv } from "@/lib/env-server";
import { getDashboardPayload } from "@/lib/live-metrics";

export const runtime = "nodejs";

export async function GET() {
  ensureServerEnv();
  try {
    const { metrics, mode, warnings } = await getDashboardPayload();
    return NextResponse.json({
      metrics,
      mode,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Dashboard unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
