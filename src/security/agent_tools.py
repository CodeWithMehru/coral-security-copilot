import json
from os import getenv

from langchain_core.tools import tool

from security.compliance import run_full_compliance_scan
from security.github_client import GitHubClient
from security.notion_client import search_policy_pages
from security.osv_client import query_osv_by_commit, query_osv_by_package, summarize_vulns
from security.secrets import findings_to_dict, scan_text_for_secrets
from security.slack_client import post_security_alert
from utils import env_or_none


def _gh() -> GitHubClient | None:
    token = env_or_none("GITHUB_TOKEN")
    owner = env_or_none("GITHUB_OWNER")
    repo = env_or_none("GITHUB_REPO")
    if token and owner:
        return GitHubClient(token, owner, repo)
    return None


@tool
def scan_repository_compliance(
    commit_lookback: int | None = None,
    update_baseline: bool = False,
    notify_slack: bool = True,
) -> str:
    """Run a full security & compliance scan: access changes, secrets in commits, OSV/CVE lookup, Notion policy cross-reference, optional Slack alert."""
    lookback = commit_lookback or int(getenv("GITHUB_COMMIT_LOOKBACK", "20"))
    report = run_full_compliance_scan(
        github_token=env_or_none("GITHUB_TOKEN"),
        github_owner=env_or_none("GITHUB_OWNER"),
        github_repo=env_or_none("GITHUB_REPO"),
        commit_lookback=lookback,
        notion_token=env_or_none("NOTION_TOKEN"),
        notion_query=getenv("NOTION_POLICY_QUERY", "security compliance policy"),
        slack_token=env_or_none("SLACK_BOT_TOKEN"),
        slack_channel=env_or_none("SLACK_CHANNEL_ID"),
        update_baseline=update_baseline,
        notify_slack=notify_slack,
    )
    return json.dumps(report, indent=2)


@tool
def check_github_access_risk() -> str:
    """Detect risky GitHub access changes: new collaborators, admin escalations, unprotected default branch."""
    gh = _gh()
    if not gh or not env_or_none("GITHUB_REPO"):
        return json.dumps({"error": "Set GITHUB_TOKEN, GITHUB_OWNER, and GITHUB_REPO"})
    collaborators = gh.list_repo_collaborators()
    from security.github_client import diff_access_baseline, load_baseline
    from pathlib import Path

    baseline = load_baseline(Path(".baseline/collaborators.json"))
    findings = diff_access_baseline(collaborators, baseline)
    protection = gh.get_branch_protection("main")
    if not protection.get("protected", True) and "url" not in protection:
        findings.append(
            {"type": "branch_unprotected", "branch": "main", "severity": "high"}
        )
    return json.dumps({"findings": findings, "collaborator_count": len(collaborators)}, indent=2)


@tool
def scan_commits_for_secrets(commit_limit: int = 10) -> str:
    """Scan recent GitHub commits for leaked secrets in diffs."""
    gh = _gh()
    if not gh:
        return json.dumps({"error": "GitHub credentials not configured"})
    results = []
    for commit in gh.list_recent_commits(commit_limit):
        patch = gh.get_commit_patch(commit["full_sha"])
        secrets = scan_text_for_secrets(patch)
        if secrets:
            results.append(
                {
                    "commit": commit["sha"],
                    "message": commit["message"],
                    "findings": findings_to_dict(secrets),
                }
            )
    return json.dumps({"secret_commits": results}, indent=2)


@tool
def query_osv_for_commit(commit_sha: str) -> str:
    """Query OSV (Open Source Vulnerabilities) for known CVEs affecting a git commit SHA."""
    try:
        data = query_osv_by_commit(commit_sha)
        return json.dumps(
            {"commit": commit_sha, "vulnerabilities": summarize_vulns(data)},
            indent=2,
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def query_osv_for_package(package_name: str, ecosystem: str, version: str) -> str:
    """Query OSV for vulnerabilities in a package version (ecosystems: PyPI, npm, Go, etc.)."""
    try:
        data = query_osv_by_package(package_name, ecosystem, version)
        return json.dumps(
            {
                "package": package_name,
                "ecosystem": ecosystem,
                "version": version,
                "vulnerabilities": summarize_vulns(data),
            },
            indent=2,
        )
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def search_notion_policies(query: str | None = None) -> str:
    """Search Notion workspace for internal security and compliance policy documents."""
    token = env_or_none("NOTION_TOKEN")
    if not token:
        return json.dumps({"error": "NOTION_TOKEN not configured"})
    q = query or getenv("NOTION_POLICY_QUERY", "security compliance policy")
    pages = search_policy_pages(token, q)
    return json.dumps({"query": q, "policies": pages}, indent=2)


@tool
def send_slack_security_alert(title: str, message: str) -> str:
    """Post a formatted security alert to the configured Slack channel."""
    token = env_or_none("SLACK_BOT_TOKEN")
    channel = env_or_none("SLACK_CHANNEL_ID")
    if not token or not channel:
        return json.dumps({"error": "SLACK_BOT_TOKEN and SLACK_CHANNEL_ID required"})
    try:
        result = post_security_alert(token, channel, title, message)
        return json.dumps({"ok": True, "ts": result.get("ts")})
    except Exception as e:
        return json.dumps({"error": str(e)})


def get_security_tools() -> list:
    return [
        scan_repository_compliance,
        check_github_access_risk,
        scan_commits_for_secrets,
        query_osv_for_commit,
        query_osv_for_package,
        search_notion_policies,
        send_slack_security_alert,
    ]
