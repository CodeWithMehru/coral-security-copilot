import { spawn } from "child_process";
import { ensureServerEnv } from "./env-server";
import type { CoralSqlResponse } from "./types";

const BLOCKED_PATTERNS = [ /\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i, /;\s*\S/, /--/, /\/\*/ ];

export function validateReadOnlySql(sql: string): { ok: true } | { ok: false; error: string } {
  const trimmed = sql.trim();
  if (!trimmed) return { ok: false, error: "Query is empty." };
  if (!/^\s*(SELECT|WITH)\b/i.test(trimmed)) return { ok: false, error: "Only read-only SELECT / WITH queries are permitted." };
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) return { ok: false, error: "Query contains disallowed statements or syntax." };
  }
  if (trimmed.length > 12000) return { ok: false, error: "Query exceeds maximum length." };
  return { ok: true };
}

function parseCoralJson(stdout: string): { columns: string[]; rows: Record<string, unknown>[] } {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
      return { columns: Object.keys(parsed[0] as Record<string, unknown>), rows: parsed as Record<string, unknown>[] };
    }
  } catch { /* fall through */ }
  const lines = stdout.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return { columns: [], rows: [] };
  const columns = lines[0].split("|").map(c => c.trim());
  const rows = lines.slice(2).map(line => {
    const obj: Record<string, unknown> = {};
    line.split("|").map(c => c.trim()).forEach((cell, i) => obj[columns[i]] = cell);
    return obj;
  });
  return { columns, rows };
}

export function executeCoralSql(sql: string): Promise<CoralSqlResponse> {
  ensureServerEnv();
  const validation = validateReadOnlySql(sql);
  if (!validation.ok) return Promise.resolve({ sql, raw: "", columns: [], rows: [], rowCount: 0, durationMs: 0, error: validation.error });

  const start = Date.now();
  
  // THE MASTER FIX: Force absolute Docker path for production, fallback to 'coral' for localhost
  const coralBin = process.env.NODE_ENV === "production" ? "/usr/bin/coral" : "coral";
  const cwd = process.env.NODE_ENV === "production" ? "/app" : process.cwd();

  const childEnv = {
    ...process.env,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    NOTION_API_KEY: process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY,
    SLACK_TOKEN: process.env.SLACK_BOT_TOKEN ?? process.env.SLACK_TOKEN,
  };

  return new Promise((resolve) => {
    const child = spawn(coralBin, ["sql", sql, "--format", "json"], { env: childEnv, cwd });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("error", (err) => {
      resolve({ sql, raw: stderr, columns: [], rows: [], rowCount: 0, durationMs: Date.now() - start, error: err.message });
    });

    child.on("close", (code) => {
      const durationMs = Date.now() - start;
      if (code !== 0) {
        resolve({ sql, raw: stderr || stdout, columns: [], rows: [], rowCount: 0, durationMs, error: stderr || `Exited ${code}` });
        return;
      }
      const { columns, rows } = parseCoralJson(stdout);
      resolve({ sql, raw: stdout.trim(), columns, rows, rowCount: rows.length, durationMs });
    });
  });
}