/** Security-focused prompts for Agent Chat (Coral SQL) */
export const SUGGESTED_PROMPTS = [
  {
    label: "Open secret alerts",
    message:
      "Show open GitHub secret scanning alerts with secret type, file path, and state",
  },
  {
    label: "Dependabot CVEs",
    message:
      "List open Dependabot vulnerabilities with CVE, package name, and severity for this repo",
  },
  {
    label: "Admin collaborators",
    message:
      "Which collaborators have admin access on this repository?",
  },
  {
    label: "Policies × access",
    message:
      "Cross-reference repository collaborators with Notion security policy pages",
  },
  {
    label: "Security Slack channels",
    message: "List Slack channels related to security incidents and operations",
  },
  {
    label: "Unified posture",
    message:
      "Summarize secret scanning and Dependabot findings across GitHub for risk posture",
  },
] as const;
