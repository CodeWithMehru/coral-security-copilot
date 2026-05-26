import { spawn } from "child_process";
import { ensureServerEnv } from "./env-server";
import type { CoralSqlResponse } from "./types";

/** Block destructive or multi-statement SQL from agent/chat surfaces */
const BLOCKED_PATTERNS = [
  /\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i,
  /;\s*\S/,
  /--/,
  /\/\*/,
];

export function validateReadOnlySql(sql: string): { ok: true } | { ok: false; error: string } {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { ok: false, error: "Query is empty." };
  }
  if (!/^\s*(SELECT|WITH)\b/i.test(trimmed)) {
    return { ok: false, error: "Only read-only SELECT / WITH queries are permitted." };
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, error: "Query contains disallowed statements or syntax." };
    }
  }
  if (trimmed.length > 12000) {
    return { ok: false, error: "Query exceeds maximum length (12000 characters)." };
  }
  return { ok: true };
}

function parseCoralJson(stdout: string): { columns: string[]; rows: Record<string, unknown>[] } {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        return { columns: [], rows: [] };
      }
      const first = parsed[0];
      if (typeof first === "object" && first !== null) {
        const columns = Object.keys(first as Record<string, unknown>);
        return { columns, rows: parsed as Record<string, unknown>[] };
      }
    }
    if (typeof parsed === "object" && parsed !== null && "columns" in parsed && "rows" in parsed) {
      const p = parsed as { columns: string[]; rows: unknown[][] };
      const rows = p.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        p.columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      });
      return { columns: p.columns, rows };
    }
  } catch {
    /* fall through */
  }

  const lines = stdout.trim().split("\n").filter(Boolean);
  if (lines.length < 2) {
    return { columns: [], rows: [] };
  }
  const columns = lines[0].split("|").map((c) => c.trim());
  const rows = lines.slice(2).map((line) => {
    const cells = line.split("|").map((c) => c.trim());
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = cells[i] ?? "";
    });
    return obj;
  });
  return { columns, rows };
}

export function executeCoralSql(sql: string): Promise<CoralSqlResponse> {
  ensureServerEnv();

  const validation = validateReadOnlySql(sql);
  if (!validation.ok) {
    return Promise.resolve({
      sql,
      raw: "",
      columns: [],
      rows: [],
      rowCount: 0,
      durationMs: 0,
      error: validation.error,
    });
  }

  const start = Date.now();
  const coralBin = process.env.CORAL_BIN ?? "coral";
  const cwd = process.env.CORAL_WORKDIR ?? process.env.CORALSEC_ROOT ?? process.cwd();

  const childEnv = {
    ...process.env,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    NOTION_API_KEY: process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY,
    SLACK_TOKEN: process.env.SLACK_BOT_TOKEN ?? process.env.SLACK_TOKEN,
  };

  return new Promise((resolve) => {
    const child = spawn(coralBin, ["sql", sql, "--format", "json"], {
      env: childEnv,
      cwd,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      resolve({
        sql,
        raw: stderr,
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs: Date.now() - start,
        error: `Failed to start Coral CLI (${coralBin}): ${err.message}`,
      });
    });

    child.on("close", (code) => {
      const durationMs = Date.now() - start;
      if (code !== 0) {
        const errText = stderr.trim() || stdout.trim();
        resolve({
          sql,
          raw: errText,
          columns: [],
          rows: [],
          rowCount: 0,
          durationMs,
          error: errText || `Coral exited with code ${code}`,
        });
        return;
      }
      const { columns, rows } = parseCoralJson(stdout);
      resolve({
        sql,
        raw: stdout.trim(),
        columns,
        rows,
        rowCount: rows.length,
        durationMs,
      });
    });
  });
}
