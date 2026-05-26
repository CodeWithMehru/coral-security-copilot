import requests

NOTION_VERSION = "2022-06-28"
NOTION_SEARCH = "https://api.notion.com/v1/search"


def search_policy_pages(token: str, query: str, page_size: int = 10) -> list[dict]:
    response = requests.post(
        NOTION_SEARCH,
        headers={
            "Authorization": f"Bearer {token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        json={
            "query": query,
            "page_size": page_size,
            "filter": {"property": "object", "value": "page"},
        },
        timeout=30,
    )
    response.raise_for_status()
    results = response.json().get("results") or []
    pages = []
    for page in results:
        title = _page_title(page)
        pages.append(
            {
                "id": page.get("id"),
                "title": title,
                "url": page.get("url"),
                "last_edited": page.get("last_edited_time"),
            }
        )
    return pages


def _page_title(page: dict) -> str:
    props = page.get("properties") or {}
    for prop in props.values():
        if prop.get("type") == "title":
            parts = prop.get("title") or []
            return "".join(t.get("plain_text", "") for t in parts) or "Untitled"
    return "Untitled"


def match_policies_for_findings(
    policies: list[dict],
    finding_keywords: list[str],
) -> list[dict]:
    """Heuristic: surface policies whose titles mention finding categories."""
    if not policies:
        return []
    keywords = {k.lower() for k in finding_keywords}
    matched = []
    for p in policies:
        title_lower = (p.get("title") or "").lower()
        if any(k in title_lower for k in keywords):
            matched.append({**p, "match_reason": "title keyword overlap"})
    return matched if matched else policies[:3]
