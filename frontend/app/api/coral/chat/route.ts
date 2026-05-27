import { NextResponse } from "next/server";
import { ensureServerEnv } from "@/lib/env-server";
import { AGENT_SYSTEM_PROMPT, NOTION_SEARCH_QUERY } from "@/lib/agent-system-prompt";
import { naturalLanguageToSql } from "@/lib/nl-to-sql";

export const runtime = "nodejs";

/** POST /api/coral/chat — NL → Coral SQL (Unified Security Context Engine) */
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
      routedIntent: generated.routedIntent,
      fromTemplate: generated.fromTemplate,
      systemPrompt: generated.systemPrompt,
      agentRole: AGENT_SYSTEM_PROMPT,
      notionSearchQuery: NOTION_SEARCH_QUERY,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate SQL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
