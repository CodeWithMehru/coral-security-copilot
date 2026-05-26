import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/env";
import { ensureServerEnv } from "@/lib/env-server";
import { runCoralQuery } from "@/lib/coral-service";
import type { QueryKind } from "@/lib/query-kinds";

export const runtime = "nodejs";

/** POST /api/coral/sql — execute read-only Coral SQL via CLI */
export async function POST(request: Request) {
  ensureServerEnv();
  try {
    const body = await request.json();
    const sql = typeof body.sql === "string" ? body.sql.trim() : "";
    const queryKind =
      (typeof body.queryKind === "string" ? body.queryKind : undefined) as
        | QueryKind
        | undefined;

    if (!sql) {
      return NextResponse.json({ error: "SQL query is required." }, { status: 400 });
    }

    const result = await runCoralQuery(sql, {
      queryKind,
      allowDemoFallback: isDemoMode(),
    });

    // Return 200 with structured error so Agent Chat can show SQL + friendly message
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
