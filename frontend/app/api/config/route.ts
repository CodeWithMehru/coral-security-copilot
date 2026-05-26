import { NextResponse } from "next/server";
import { getGitHubScope, getRuntimeMode, isDemoMode } from "@/lib/env";
import { ensureServerEnv } from "@/lib/env-server";
import { checkCoralSources } from "@/lib/coral-service";

export const runtime = "nodejs";

function connectedSources(): string[] {
  const out: string[] = [];
  if (process.env.GITHUB_TOKEN) out.push("GitHub");
  if (process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY) out.push("Notion");
  if (process.env.SLACK_BOT_TOKEN ?? process.env.SLACK_TOKEN) out.push("Slack");
  return out;
}

export async function GET() {
  ensureServerEnv();
  const mode = getRuntimeMode();
  const github = getGitHubScope();
  const coral = await checkCoralSources();
  const connected = connectedSources();

  return NextResponse.json({
    mode,
    isDemo: isDemoMode(),
    connectedSources: connected,
    github: {
      configured: Boolean(github),
      owner: github?.owner ?? null,
      repo: github?.repo ?? null,
    },
    coral: {
      available: coral.ok,
      sources: coral.sources,
      error: coral.error,
    },
    tokens: {
      github: Boolean(process.env.GITHUB_TOKEN),
      notion: Boolean(process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY),
      slack: Boolean(process.env.SLACK_BOT_TOKEN ?? process.env.SLACK_TOKEN),
    },
  });
}
