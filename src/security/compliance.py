import json
from pathlib import Path

from security.github_client import (
    GitHubClient,
    diff_access_baseline,
    load_baseline,
    save_baseline,
)
from security.notion_client import match_policies_for_findings, search_policy_pages
from security.osv_client import query_osv_by_commit, summarize_vulns
from security.secrets import findings_to_dict, scan_text_for_secrets
from security.slack_client import post_security_alert


def run_full_compliance_scan(
    *,
    github_token: str | None,
    github_owner: str | None,
    github_repo: str | None,
    commit_lookback: int = 20,
    notion_token: str | None = None,
    notion_query: str = "security compliance policy",
    slack_token: str | None = None,
    slack_channel: str | None = None,
    baseline_path: Path | None = None,
    update_baseline: bool = False,
    notify_slack: bool = True,
) -> dict:
    report: dict = {
        "access_findings": [],
        "secret_findings": [],
        "osv_findings": [],
        "policy_matches": [],
        "errors": [],
    }

    gh = None
    if github_token and github_owner:
        gh = GitHubClient(github_token, github_owner, github_repo)

    if gh and github_repo:
        try:
            collaborators = gh.list_repo_collaborators()
            baseline_file = baseline_path or Path(".baseline/collaborators.json")
            baseline = load_baseline(baseline_file)
            report["access_findings"] = diff_access_baseline(collaborators, baseline)
            protection = gh.get_branch_protection("main")
            if not protection.get("protected", True) and "url" not in protection:
                report["access_findings"].append(
                    {
                        "type": "branch_unprotected",
                        "branch": "main",
                        "severity": "high",
                    }
                )
            if update_baseline:
                save_baseline(
                    baseline_file,
                    {"collaborators": collaborators},
                )
        except Exception as e:
            report["errors"].append(f"github_access: {e}")

        try:
            for commit in gh.list_recent_commits(commit_lookback):
                sha = commit["full_sha"]
                patch = gh.get_commit_patch(sha)
                secrets = scan_text_for_secrets(patch)
                if secrets:
                    report["secret_findings"].append(
                        {
                            "commit": commit["sha"],
                            "message": commit["message"],
                            "findings": findings_to_dict(secrets),
                            "severity": "critical",
                        }
                    )
                try:
                    osv = query_osv_by_commit(sha)
                    vulns = summarize_vulns(osv)
                    if vulns:
                        report["osv_findings"].append(
                            {
                                "commit": commit["sha"],
                                "vulnerabilities": vulns,
                                "severity": "high",
                            }
                        )
                except Exception as e:
                    report["errors"].append(f"osv:{commit['sha'][:8]}: {e}")
        except Exception as e:
            report["errors"].append(f"github_commits: {e}")

    keywords = []
    if report["secret_findings"]:
        keywords.extend(["secret", "credential", "leak"])
    if report["access_findings"]:
        keywords.extend(["access", "privilege", "iam"])
    if report["osv_findings"]:
        keywords.extend(["vulnerability", "cve", "patch"])

    if notion_token:
        try:
            policies = search_policy_pages(notion_token, notion_query)
            report["policy_matches"] = match_policies_for_findings(policies, keywords)
        except Exception as e:
            report["errors"].append(f"notion: {e}")

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    all_items = []
    for f in report["access_findings"]:
        all_items.append(("access", f, f.get("severity", "medium")))
    for f in report["secret_findings"]:
        all_items.append(("secret", f, f.get("severity", "critical")))
    for f in report["osv_findings"]:
        all_items.append(("osv", f, f.get("severity", "high")))
    all_items.sort(key=lambda x: severity_order.get(x[2], 9))

    report["summary"] = {
        "access_count": len(report["access_findings"]),
        "secret_count": len(report["secret_findings"]),
        "osv_count": len(report["osv_findings"]),
        "policy_count": len(report["policy_matches"]),
        "error_count": len(report["errors"]),
    }

    if slack_token and slack_channel and notify_slack and _has_actionable(report):
        try:
            _notify_slack(slack_token, slack_channel, report, all_items)
            report["slack_notified"] = True
        except Exception as e:
            report["errors"].append(f"slack: {e}")
            report["slack_notified"] = False

    return report


def _has_actionable(report: dict) -> bool:
    s = report["summary"]
    return (
        s["access_count"] + s["secret_count"] + s["osv_count"] > 0
        or s["error_count"] > 0
    )


def _notify_slack(
    token: str,
    channel: str,
    report: dict,
    ranked: list,
) -> None:
    s = report["summary"]
    summary = (
        f"*Access:* {s['access_count']} · *Secrets:* {s['secret_count']} · "
        f"*OSV/CVE:* {s['osv_count']} · *Policies:* {s['policy_count']}"
    )
    blocks = []
    for kind, item, sev in ranked[:6]:
        if kind == "access":
            body = json.dumps(item, indent=0)[:500]
            label = f"[{sev}] Access — {item.get('type')}"
        elif kind == "secret":
            body = f"Commit `{item.get('commit')}` — {len(item.get('findings', []))} pattern(s)"
            label = f"[{sev}] Secret in commit"
        else:
            body = f"Commit `{item.get('commit')}` — {len(item.get('vulnerabilities', []))} OSV record(s)"
            label = f"[{sev}] OSV vulnerability"
        blocks.append({"label": label, "body": body})

    if report["policy_matches"]:
        titles = ", ".join(p["title"] for p in report["policy_matches"][:3])
        blocks.append(
            {
                "label": "Policy cross-reference",
                "body": f"Review: {titles}",
            }
        )

    post_security_alert(
        token,
        channel,
        "Security & Compliance Monitor",
        summary,
        blocks,
    )
