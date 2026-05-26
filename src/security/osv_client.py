import requests

OSV_QUERY_URL = "https://api.osv.dev/v1/query"
OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"


def query_osv_by_commit(commit_sha: str) -> dict:
    response = requests.post(
        OSV_QUERY_URL,
        json={"commit": commit_sha},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def query_osv_by_package(name: str, ecosystem: str, version: str) -> dict:
    response = requests.post(
        OSV_QUERY_URL,
        json={
            "package": {"name": name, "ecosystem": ecosystem},
            "version": version,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def summarize_vulns(osv_response: dict, limit: int = 10) -> list[dict]:
    vulns = osv_response.get("vulns") or []
    out = []
    for v in vulns[:limit]:
        out.append(
            {
                "id": v.get("id"),
                "summary": v.get("summary"),
                "severity": _severity_from_vuln(v),
                "published": v.get("published"),
            }
        )
    return out


def _severity_from_vuln(vuln: dict) -> str | None:
    for item in vuln.get("severity") or []:
        if item.get("type") == "CVSS_V3":
            return item.get("score")
    database_specific = vuln.get("database_specific") or {}
    return database_specific.get("severity")
