import re
from dataclasses import dataclass


@dataclass
class SecretFinding:
    rule_id: str
    description: str
    matched_preview: str
    line_hint: int | None = None


PATTERNS: list[tuple[str, str, str]] = [
    (
        "aws_access_key",
        "AWS access key ID",
        r"(?<![A-Z0-9])[A-Z0-9]{20}(?![A-Z0-9])",
    ),
    (
        "aws_secret_key",
        "AWS secret access key",
        r"(?i)aws(.{0,20})?(secret|session|key).{0,20}?['\"][A-Za-z0-9/+=]{40}['\"]",
    ),
    (
        "github_pat",
        "GitHub personal access token",
        r"ghp_[A-Za-z0-9_]{20,}",
    ),
    (
        "github_oauth",
        "GitHub OAuth token",
        r"gho_[A-Za-z0-9_]{20,}",
    ),
    (
        "slack_token",
        "Slack token",
        r"xox[baprs]-[A-Za-z0-9-]{10,}",
    ),
    (
        "notion_token",
        "Notion integration token",
        r"secret_[A-Za-z0-9]{24,}",
    ),
    (
        "private_key",
        "Private key block",
        r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
    ),
    (
        "generic_api_key",
        "Generic API key assignment",
        r"(?i)(api[_-]?key|apikey|secret[_-]?key)\s*[=:]\s*['\"][A-Za-z0-9_\-]{16,}['\"]",
    ),
    (
        "jwt",
        "JSON Web Token",
        r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    ),
]


def _redact(match: str, max_len: int = 12) -> str:
    if len(match) <= max_len:
        return match[:4] + "…"
    return match[:6] + "…" + match[-4:]


def scan_text_for_secrets(text: str) -> list[SecretFinding]:
    findings: list[SecretFinding] = []
    lines = text.splitlines()

    for rule_id, description, pattern in PATTERNS:
        for line_no, line in enumerate(lines, start=1):
            for m in re.finditer(pattern, line):
                findings.append(
                    SecretFinding(
                        rule_id=rule_id,
                        description=description,
                        matched_preview=_redact(m.group(0)),
                        line_hint=line_no,
                    )
                )
        if rule_id in ("private_key",) and re.search(pattern, text, re.MULTILINE):
            if not any(f.rule_id == rule_id for f in findings):
                findings.append(
                    SecretFinding(
                        rule_id=rule_id,
                        description=description,
                        matched_preview="-----BEGIN … PRIVATE KEY-----",
                        line_hint=None,
                    )
                )

    return findings


def findings_to_dict(findings: list[SecretFinding]) -> list[dict]:
    return [
        {
            "rule_id": f.rule_id,
            "description": f.description,
            "preview": f.matched_preview,
            "line": f.line_hint,
        }
        for f in findings
    ]
