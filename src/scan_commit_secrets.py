"""Lightweight CLI: scan recent commits for secret patterns (no full compliance scan).

This script MUST be resilient: always print valid JSON, even on errors.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from security.agent_tools import scan_commits_for_secrets


def _safe_int(v: str | None, default: int) -> int:
    try:
        if v is None:
            return default
        n = int(v)
        return n if n > 0 else default
    except Exception:
        return default


def _is_aws_finding(f: Any) -> bool:
    # Heuristic: backend rules include AWS key patterns; matched_preview often contains AKIA... or "aws".
    try:
        preview = str(f.get("matched_preview", "")).lower()
        desc = str(f.get("description", "")).lower()
        rule = str(f.get("rule_id", "")).lower()
        return "akia" in preview or "aws" in preview or "aws" in desc or "aws" in rule
    except Exception:
        return False


def main() -> None:
    limit = _safe_int(sys.argv[1] if len(sys.argv) > 1 else None, 5)

    errors: list[str] = []
    secret_findings: list[dict[str, Any]] = []

    try:
        # LangChain tools (StructuredTool) are not directly callable; use .invoke()
        raw = scan_commits_for_secrets.invoke({"commit_limit": limit})
    except Exception as e:
        errors.append(f"scan_commits_for_secrets failed: {e}")
        print(json.dumps({"secret_findings": [], "errors": errors}))
        return

    try:
        data = json.loads(raw) if isinstance(raw, str) else {}
    except Exception as e:
        errors.append(f"invalid_json: {e}")
        # Preserve raw output as a string for debugging without crashing
        errors.append(f"raw_output: {str(raw)[:400]}")
        print(json.dumps({"secret_findings": [], "errors": errors}))
        return

    if isinstance(data, dict) and "error" in data:
        errors.append(str(data.get("error")))
        print(json.dumps({"secret_findings": [], "errors": errors}))
        return

    commits = []
    if isinstance(data, dict):
        commits = data.get("secret_commits") or []
    if not isinstance(commits, list):
        commits = []

    for item in commits:
        if not isinstance(item, dict):
            continue
        commit = str(item.get("commit") or "")
        message = str(item.get("message") or "")
        findings = item.get("findings") or []
        if not isinstance(findings, list):
            findings = []

        severity = "high"
        # Ensure AWS findings are always Critical for demo.
        if any(_is_aws_finding(f) for f in findings if isinstance(f, dict)):
            severity = "critical"
        elif findings:
            severity = "critical"

        secret_findings.append(
            {
                "commit": commit or "—",
                "message": message or "—",
                "findings": findings,
                "severity": severity,
            }
        )

    print(json.dumps({"secret_findings": secret_findings, "errors": errors}))


if __name__ == "__main__":
    main()
