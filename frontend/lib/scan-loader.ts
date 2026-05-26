import { spawn } from "child_process";
import path from "path";
import { isDemoMode } from "./env";
import { formatIntegrationError } from "./errors";
import { DEMO_REPORT } from "./demo-data";
import type { ComplianceReport } from "./types";

export class ScanError extends Error {
  readonly formatted: ReturnType<typeof formatIntegrationError>;

  constructor(message: string, raw?: string) {
    const formatted = formatIntegrationError(raw ?? message);
    super(formatted.message);
    this.name = "ScanError";
    this.formatted = formatted;
  }
}

export type ScanLoadResult = {
  report: ComplianceReport | null;
  source: "demo" | "cli" | "skipped";
  message?: string;
};

function emptyReport(): ComplianceReport {
  return {
    access_findings: [],
    secret_findings: [],
    osv_findings: [],
    policy_matches: [],
    errors: [],
    summary: {
      access_count: 0,
      secret_count: 0,
      osv_count: 0,
      policy_count: 0,
      error_count: 0,
    },
  };
}

/**
 * Optional compliance scan — never throws for missing uv; returns skipped with message.
 */
export async function loadScanReportOptional(): Promise<ScanLoadResult> {
  if (isDemoMode()) {
    return { report: DEMO_REPORT, source: "demo" };
  }

  const root = process.env.CORALSEC_ROOT ?? path.resolve(process.cwd(), "..");
  const uvPath = process.env.UV_BIN ?? "uv";

  return new Promise((resolve) => {
    const child = spawn(uvPath, ["run", "python", "src/cli.py", "--no-slack"], {
      cwd: root,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.on("error", (err) => {
      const formatted = formatIntegrationError(err.message);
      resolve({
        report: null,
        source: "skipped",
        message: formatted.message,
      });
    });

    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c: Buffer) => {
      stderr += c.toString();
    });

    child.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          resolve({ report: JSON.parse(stdout), source: "cli" });
          return;
        } catch {
          resolve({
            report: null,
            source: "skipped",
            message: "Compliance scanner returned invalid JSON.",
          });
          return;
        }
      }

      const raw = stderr.trim() || stdout.trim() || `exit code ${code}`;
      const formatted = formatIntegrationError(raw);
      resolve({
        report: null,
        source: "skipped",
        message: formatted.message,
      });
    });
  });
}

/** @deprecated use loadScanReportOptional */
export async function loadScanReport(): Promise<{
  report: ComplianceReport;
  source: "demo" | "cli";
}> {
  const result = await loadScanReportOptional();
  if (result.source === "demo" && result.report) {
    return { report: result.report, source: "demo" };
  }
  if (result.report) {
    return { report: result.report, source: "cli" };
  }
  throw new ScanError(result.message ?? "Scan unavailable");
}

export { emptyReport };
