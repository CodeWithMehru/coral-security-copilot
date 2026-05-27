import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/env";
import { ensureServerEnv } from "@/lib/env-server";
import { CoralQueries } from "@/lib/coral-queries";
import { runCoralQuery } from "@/lib/coral-service";
import { loadCommitSecretsOptional } from "@/lib/commit-secrets-loader";
import { formatWarnings, partitionWarnings, EMPTY_SECRETS_MESSAGE } from "@/lib/errors";
import { DEMO_REPORT, SECRET_SCAN_DETAILS } from "@/lib/demo-data";
import type { ComplianceReport, SecretCommitFinding } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  ensureServerEnv();

  if (isDemoMode()) {
    return NextResponse.json({
      mode: "demo",
      coral: null,
      scan: DEMO_REPORT,
      meta: SECRET_SCAN_DETAILS,
    });
  }

  const { searchParams } = new URL(request.url);
  const includeCommits = searchParams.get("commits") !== "0";

  const rawWarnings: string[] = [];
  let coralResult = null;

  try {
    const sql = CoralQueries.commitsSecretPatterns();
    coralResult = await runCoralQuery(sql, {
      queryKind: "secrets_recent",
      allowDemoFallback: false,
    });
    if (coralResult.error) rawWarnings.push(coralResult.error);
  } catch (e) {
    rawWarnings.push(e instanceof Error ? e.message : "Coral secret query failed");
  }

  let commitFindings: SecretCommitFinding[] = [];
  if (includeCommits) {
    const commitScan = await loadCommitSecretsOptional(5);
    commitFindings = commitScan.secret_findings;
    if (commitScan.message) rawWarnings.push(commitScan.message);
  }

  const scan: ComplianceReport | null =
    commitFindings.length > 0
      ? {
          access_findings: [],
          secret_findings: commitFindings,
          osv_findings: [],
          policy_matches: [],
          errors: [],
          summary: {
            access_count: 0,
            secret_count: commitFindings.length,
            osv_count: 0,
            policy_count: 0,
            error_count: 0,
          },
        }
      : null;

  const hasData =
    (coralResult?.rowCount ?? 0) > 0 || commitFindings.length > 0;
  const formatted = formatWarnings(rawWarnings);
  const { alerts, informational } = partitionWarnings(formatted);

  return NextResponse.json({
    mode: "live",
    coral: coralResult,
    scan,
    meta: {},
    hasData,
    warnings: alerts.length ? alerts : undefined,
    informational: informational.length ? informational : undefined,
    emptyHint: hasData ? undefined : EMPTY_SECRETS_MESSAGE,
  });
}
