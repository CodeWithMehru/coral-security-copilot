import json

import requests

SLACK_POST = "https://slack.com/api/chat.postMessage"


def post_security_alert(
    token: str,
    channel_id: str,
    title: str,
    summary: str,
    blocks_detail: list[dict] | None = None,
) -> dict:
    blocks = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": title, "emoji": True},
        },
        {"type": "section", "text": {"type": "mrkdwn", "text": summary}},
    ]
    if blocks_detail:
        for item in blocks_detail[:8]:
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*{item.get('label', 'Finding')}*\n{item.get('body', '')}"[
                            :2900
                        ],
                    },
                }
            )

    response = requests.post(
        SLACK_POST,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        data=json.dumps(
            {
                "channel": channel_id,
                "text": f"{title}: {summary}",
                "blocks": blocks,
            }
        ),
        timeout=30,
    )
    response.raise_for_status()
    result = response.json()
    if not result.get("ok"):
        raise RuntimeError(result.get("error", "slack_api_error"))
    return result
