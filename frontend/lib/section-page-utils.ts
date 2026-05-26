import { isAuthOrConfigMessage } from "./errors";

export type SectionFetchState = {
  warnings: string[];
  informational: string[];
  alertWarnings: string[];
  needsConfig: boolean;
};

/** Map API `warnings` + `informational` fields into UI state */
export function parseSectionWarnings(
  alerts: string[] = [],
  informational: string[] = []
): SectionFetchState {
  return {
    warnings: [...alerts, ...informational],
    informational,
    alertWarnings: alerts,
    needsConfig: alerts.some(isAuthOrConfigMessage),
  };
}
