import type { DashboardMetrics } from "./types";

export type DashboardCachePayload = {
  metrics: DashboardMetrics;
  mode: "demo" | "live";
  warnings: string[];
  informational?: string[];
};

const DASHBOARD_CACHE_TTL_MS = 3 * 60 * 1000;

let cached: { payload: DashboardCachePayload; expiresAt: number } | null = null;

export function getCachedDashboard(): DashboardCachePayload | null {
  if (!cached || Date.now() > cached.expiresAt) {
    cached = null;
    return null;
  }
  return cached.payload;
}

export function setCachedDashboard(payload: DashboardCachePayload): void {
  cached = {
    payload,
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
  };
}

export function invalidateDashboardCache(): void {
  cached = null;
}
