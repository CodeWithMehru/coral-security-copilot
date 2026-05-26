from os import getenv
from typing import Literal

import requests

import logging
from rich.logging import RichHandler

from utils import asserted_env

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(RichHandler(rich_tracebacks=True))


class ClaimError(Exception):
    def __init__(self, message, response):
        super().__init__(message)
        self.response = response


class ClaimHandler:
    _remaining: float | None = None
    _currency: Literal["coral", "micro_coral", "usd"]

    def __init__(
        self, currency: Literal["coral", "micro_coral", "usd"] = "micro_coral"
    ) -> None:
        if currency not in ["coral", "micro_coral", "usd"]:
            raise ValueError("invalid currency %s" % currency)
        self._currency = currency

    def no_budget(self) -> bool:
        return (self._remaining is not None) and self._remaining <= 0

    def remaining(self) -> float | None:
        return self._remaining

    def currency(self) -> Literal["coral", "micro_coral", "usd"]:
        return self._currency

    def claim(self, amount: float) -> float:
        coral_send_claims = getenv("CORAL_SEND_CLAIMS", "0")
        if coral_send_claims == "0":
            logger.warning("Not orchestrated - skipping Coral Server claim")
            return True

        coral_api_url = asserted_env(
            "CORAL_API_URL",
            "Set by Coral Server when CORAL_SEND_CLAIMS=1.",
        )
        coral_session_id = asserted_env(
            "CORAL_SESSION_ID",
            "Set by Coral Server when CORAL_SEND_CLAIMS=1.",
        )
        try:
            response = requests.post(
                f"{coral_api_url}/api/v1/internal/claim/{coral_session_id}",
                headers={"Content-Type": "application/json"},
                json={"amount": {"type": self._currency, "amount": amount}},
                timeout=30,
            )

            if response.status_code == 200:
                budget = response.json()
                remaining = float(budget["remainingBudget"])
                match self._currency:
                    case "coral":
                        remaining = remaining * 1_000_000
                    case "micro_coral":
                        pass
                    case "usd":
                        remaining = (
                            remaining * 1_000_000 * float(budget["coralUsdPrice"])
                        )
                logger.info(
                    "Claimed %s %s - remaining: %s",
                    amount,
                    self._currency,
                    remaining,
                )
                self._remaining = remaining
                return remaining
            raise ClaimError(
                f"Claim failed with status {response.status_code}",
                response,
            )
        except Exception:
            self._remaining = 0
            raise
