import base64
import json
from pathlib import Path
from typing import Any

import requests

GITHUB_API = "https://api.github.com"


class GitHubClient:
    def __init__(self, token: str, owner: str, repo: str | None = None):
        self.owner = owner
        self.repo = repo
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            }
        )

    def _get(self, path: str, params: dict | None = None) -> Any:
        url = path if path.startswith("http") else f"{GITHUB_API}{path}"
        response = self.session.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.json()

    def list_recent_commits(self, limit: int = 20) -> list[dict]:
        if not self.repo:
            raise ValueError("GITHUB_REPO required for commit scanning")
        data = self._get(
            f"/repos/{self.owner}/{self.repo}/commits",
            params={"per_page": min(limit, 100)},
        )
        return [
            {
                "sha": c["sha"][:12],
                "full_sha": c["sha"],
                "message": (c.get("commit") or {}).get("message", "")[:120],
                "author": ((c.get("commit") or {}).get("author") or {}).get("name"),
                "date": ((c.get("commit") or {}).get("author") or {}).get("date"),
            }
            for c in data
        ]

    def get_commit_patch(self, sha: str) -> str:
        if not self.repo:
            raise ValueError("GITHUB_REPO required")
        commit = self._get(f"/repos/{self.owner}/{self.repo}/commits/{sha}")
        files = commit.get("files") or []
        chunks = []
        for f in files:
            chunks.append(f"--- {f.get('filename')}")
            if f.get("patch"):
                chunks.append(f["patch"])
            elif f.get("status") == "added" and f.get("contents_url"):
                try:
                    raw = self._get(f["contents_url"])
                    content = base64.b64decode(raw.get("content", "")).decode(
                        "utf-8", errors="replace"
                    )
                    chunks.append(content[:8000])
                except Exception:
                    pass
        return "\n".join(chunks)

    def list_repo_collaborators(self) -> list[dict]:
        if not self.repo:
            raise ValueError("GITHUB_REPO required")
        data = self._get(
            f"/repos/{self.owner}/{self.repo}/collaborators",
            params={"per_page": 100},
        )
        return [
            {
                "login": u["login"],
                "role": (u.get("permissions") or {}),
                "site_admin": u.get("site_admin", False),
            }
            for u in data
        ]

    def list_org_members(self) -> list[dict]:
        data = self._get(
            f"/orgs/{self.owner}/members",
            params={"per_page": 100},
        )
        return [{"login": m["login"]} for m in data]

    def get_branch_protection(self, branch: str = "main") -> dict:
        if not self.repo:
            raise ValueError("GITHUB_REPO required")
        try:
            return self._get(
                f"/repos/{self.owner}/{self.repo}/branches/{branch}/protection"
            )
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 404:
                return {"protected": False, "branch": branch}
            raise

    def list_webhooks(self) -> list[dict]:
        if not self.repo:
            return self._get(f"/orgs/{self.owner}/hooks")
        return self._get(f"/repos/{self.owner}/{self.repo}/hooks")


def load_baseline(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {}


def save_baseline(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


def diff_access_baseline(
    current_collaborators: list[dict],
    baseline: dict,
) -> list[dict]:
    """Flag new admins and newly added collaborators vs saved baseline."""
    findings = []
    prev = {c["login"]: c for c in baseline.get("collaborators", [])}
    current_by_login = {c["login"]: c for c in current_collaborators}

    for login, collab in current_by_login.items():
        perms = collab.get("role") or {}
        is_admin = perms.get("admin") is True
        if login not in prev:
            findings.append(
                {
                    "type": "new_collaborator",
                    "login": login,
                    "admin": is_admin,
                    "severity": "high" if is_admin else "medium",
                }
            )
        elif is_admin and not (prev[login].get("role") or {}).get("admin"):
            findings.append(
                {
                    "type": "privilege_escalation",
                    "login": login,
                    "severity": "critical",
                }
            )

    for login in prev:
        if login not in current_by_login:
            findings.append(
                {
                    "type": "collaborator_removed",
                    "login": login,
                    "severity": "low",
                }
            )

    return findings
