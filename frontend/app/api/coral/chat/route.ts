import { NextResponse } from "next/server";
import { ensureServerEnv } from "@/lib/env-server";
import { naturalLanguageToSql } from "@/lib/nl-to-sql";

export const runtime = "nodejs";

/** POST /api/coral/chat — NL → Coral SQL (client executes via /api/coral/sql) */
export async function POST(request: Request) {
  ensureServerEnv();
  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const generated = naturalLanguageToSql(message);
    return NextResponse.json({
      sql: generated.sql,
      explanation: generated.explanation,
      queryKind: generated.queryKind,
      fromTemplate: generated.fromTemplate,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate SQL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
