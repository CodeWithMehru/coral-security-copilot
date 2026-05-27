import { spawn } from "child_process";
import path from "path";
import { isDemoMode } from "./env";
import { formatIntegrationError } from "./errors";
import type { SecretCommitFinding } from "./types";

const DEFAULT_COMMIT_LIMIT = 5;

/**
 * Scan recent commit diffs for secret patterns (pushed test secrets).
 * Much lighter than the full compliance CLI scan.
 */
export async function loadCommitSecretsOptional(
  commitLimit = DEFAULT_COMMIT_LIMIT
): Promise<{ secret_findings: SecretCommitFinding[]; message?: string }> {
  if (isDemoMode()) {
    return { secret_findings: [] };
  }

  const root = process.env.CORALSEC_ROOT ?? path.resolve(process.cwd(), "..");
  const uvPath = process.env.UV_BIN ?? "uv";

  return new Promise((resolve) => {
    const child = spawn(
      uvPath,
      ["run", "python", "src/scan_commit_secrets.py", String(commitLimit)],
      { cwd: root, env: process.env }
    );

    let stdout = "";
    let stderr = "";

    child.on("error", (err) => {
      resolve({
        secret_findings: [],
        message: formatIntegrationError(err.message).message,
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
          const parsed = JSON.parse(stdout) as {
            secret_findings?: SecretCommitFinding[];
            errors?: string[];
          };
          const findings = parsed.secret_findings ?? [];
          const err = parsed.errors?.[0];
          resolve({
            secret_findings: findings,
            message: err ? formatIntegrationError(err).message : undefined,
          });
          return;
        } catch {
          resolve({
            secret_findings: [],
            message: "Commit secret scan returned invalid JSON.",
          });
          return;
        }
      }

      const raw = stderr.trim() || stdout.trim();
      if (!raw) {
        resolve({ secret_findings: [] });
        return;
      }
      resolve({
        secret_findings: [],
        message: formatIntegrationError(raw).message,
      });
    });
  });
}
