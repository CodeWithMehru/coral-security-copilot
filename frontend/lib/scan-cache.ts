import type { ComplianceReport } from "./types";

const COMMIT_SCAN_TTL_MS = 2 * 60 * 1000;

let commitScanCache: {
  report: ComplianceReport;
  expiresAt: number;
} | null = null;

export function getCachedCommitScan(): ComplianceReport | null {
  if (!commitScanCache || Date.now() > commitScanCache.expiresAt) {
    commitScanCache = null;
    return null;
  }
  return commitScanCache.report;
}

export function setCachedCommitScan(report: ComplianceReport): void {
  commitScanCache = {
    report,
    expiresAt: Date.now() + COMMIT_SCAN_TTL_MS,
  };
}
