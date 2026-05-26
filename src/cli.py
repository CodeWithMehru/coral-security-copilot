"""Standalone compliance scan (no Coral session required)."""

import argparse
import json
import sys
from os import getenv

from dotenv import load_dotenv

from security.compliance import run_full_compliance_scan
from utils import env_or_none


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(
        description="CoralSec Security & Compliance Monitor — one-shot scan"
    )
    parser.add_argument(
        "--lookback",
        type=int,
        default=int(getenv("GITHUB_COMMIT_LOOKBACK", "20")),
        help="Number of recent commits to scan",
    )
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="Save current collaborators as access baseline",
    )
    parser.add_argument(
        "--no-slack",
        action="store_true",
        help="Skip Slack notification even if configured",
    )
    args = parser.parse_args()

    report = run_full_compliance_scan(
        github_token=env_or_none("GITHUB_TOKEN"),
        github_owner=env_or_none("GITHUB_OWNER"),
        github_repo=env_or_none("GITHUB_REPO"),
        commit_lookback=args.lookback,
        notion_token=env_or_none("NOTION_TOKEN"),
        notion_query=getenv("NOTION_POLICY_QUERY", "security compliance policy"),
        slack_token=env_or_none("SLACK_BOT_TOKEN"),
        slack_channel=env_or_none("SLACK_CHANNEL_ID"),
        update_baseline=args.update_baseline,
        notify_slack=not args.no_slack,
    )
    json.dump(report, sys.stdout, indent=2)
    sys.stdout.write("\n")

    s = report["summary"]
    if s["secret_count"] or any(
        f.get("severity") == "critical" for f in report["access_findings"]
    ):
        sys.exit(2)
    if s["access_count"] + s["osv_count"] > 0:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
