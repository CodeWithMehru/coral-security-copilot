/** Runtime config helpers (safe for server; avoid importing env-server from client components) */

export type RuntimeMode = "demo" | "live";

export function isDemoMode(): boolean {
  return process.env.CORALSEC_USE_DEMO === "true";
}

export function getRuntimeMode(): RuntimeMode {
  return isDemoMode() ? "demo" : "live";
}

export interface GitHubScope {
  owner: string;
  repo: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function getGitHubScope(): GitHubScope | null {
  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  if (!owner || !repo) return null;
  return { owner, repo };
}

export function requireGitHubScope(): GitHubScope {
  const scope = getGitHubScope();
  if (!scope) {
    throw new ConfigError(
      "Set GITHUB_OWNER and GITHUB_REPO in .env (repo root) or frontend/.env.local for live Coral GitHub queries."
    );
  }
  return scope;
}

export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
