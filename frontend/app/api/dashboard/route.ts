import { NextResponse } from "next/server";
import { ensureServerEnv } from "@/lib/env-server";
import { getDashboardPayload } from "@/lib/live-metrics";

export const runtime = "nodejs";

/** Cached live dashboard (3 min TTL) to reduce Coral/GitHub calls */
export async function GET() {
  ensureServerEnv();
  try {
    const { metrics, mode, warnings, informational } = await getDashboardPayload();
    return NextResponse.json(
      {
        metrics,
        mode,
        warnings: warnings.length ? warnings : undefined,
        informational,
        cached: true,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Dashboard unavailable";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
