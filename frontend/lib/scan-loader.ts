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

export type ScanLoadResult = { report: ComplianceReport | null; source: "demo" | "cli" | "skipped"; message?: string; };

export async function loadScanReportOptional(): Promise<ScanLoadResult> {
  if (isDemoMode()) return { report: DEMO_REPORT, source: "demo" };

  // THE MASTER FIX: Use the absolute Python path embedded in Docker, bypassing uv entirely
  const isProd = process.env.NODE_ENV === "production";
  const cmd = isProd ? "/app/.venv/bin/python" : "uv";
  const args = isProd ? ["src/cli.py", "--no-slack"] : ["run", "python", "src/cli.py", "--no-slack"];
  const cwd = isProd ? "/app" : path.resolve(process.cwd(), "..");

  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env });

    let stdout = "";
    let stderr = "";

    child.on("error", (err) => {
      resolve({ report: null, source: "skipped", message: err.message });
    });

    child.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });

    child.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        try { resolve({ report: JSON.parse(stdout), source: "cli" }); return; } 
        catch { resolve({ report: null, source: "skipped", message: "Invalid JSON" }); return; }
      }
      resolve({ report: null, source: "skipped", message: stderr || stdout });
    });
  });
}

export async function loadScanReport(): Promise<{ report: ComplianceReport; source: "demo" | "cli"; }> {
  const result = await loadScanReportOptional();
  if (result.source === "demo" && result.report) return { report: result.report, source: "demo" };
  if (result.report) return { report: result.report, source: "cli" };
  throw new ScanError(result.message ?? "Scan unavailable");
}
export function emptyReport(): ComplianceReport { return { access_findings: [], secret_findings: [], osv_findings: [], policy_matches: [], errors: [], summary: { access_count: 0, secret_count: 0, osv_count: 0, policy_count: 0, error_count: 0 } }; }