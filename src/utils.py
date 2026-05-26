import logging
import sys
from os import getenv

from rich.logging import RichHandler

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(RichHandler(rich_tracebacks=True))


def asserted_env(name: str, extra_msg: str = "") -> str:
    value = getenv(name, None)
    if value is None:
        logger.error("Option '%s' not provided! %s", name, extra_msg)
        sys.exit(1)
    return value


def env_or_none(name: str) -> str | None:
    value = getenv(name)
    if value is None or value.strip() == "":
        return None
    return value.strip()
