import fs from "fs";
import path from "path";

let envLoaded = false;

/** Load parent repo .env then frontend .env.local (server-only) */
export function ensureServerEnv(): void {
  if (envLoaded) return;
  const root = process.env.CORALSEC_ROOT ?? path.resolve(process.cwd(), "..");
  loadEnvFile(path.join(root, ".env"));
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));
  envLoaded = true;
}

function loadEnvFile(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    /* ignore */
  }
}
