import asyncio
import logging
import sys
from collections.abc import Sequence
from os import getenv

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_mcp_adapters.client import BaseTool, ClientSession, MultiServerMCPClient
from langchain_mcp_adapters.resources import load_mcp_resources
from langchain_mcp_adapters.tools import load_mcp_tools
from rich.logging import RichHandler

from claims import ClaimHandler
from prompts import DEFAULT_SYSTEM_PROMPT
from security.agent_tools import get_security_tools
from tools import ToolRunner
from utils import asserted_env, env_or_none

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(RichHandler(rich_tracebacks=True))

USD_PER_TOKEN = 0.000001


class InMemoryHistory:
    messages: list[BaseMessage]

    def __init__(self):
        self.messages = []

    def add_messages(self, messages: Sequence[BaseMessage]) -> None:
        self.messages.extend(messages)

    def add_message(self, message: BaseMessage):
        self.messages.append(message)


async def fetch_tools(
    client: MultiServerMCPClient, coral_session: ClientSession
) -> list[BaseTool]:
    try:
        coral_tools = await load_mcp_tools(
            coral_session,
            connection=client.connections["coral"],
        )
        other_tools = []
        for server in filter(lambda k: k != "coral", client.connections.keys()):
            other_tools.extend(await client.get_tools(server_name=server))
        security_tools = get_security_tools()
        logger.info(
            "Loaded %d coral, %d external MCP, %d security tools.",
            len(coral_tools),
            len(other_tools),
            len(security_tools),
        )
        return list(coral_tools) + other_tools + security_tools
    except Exception as e:
        logger.exception("Failed to load tools: %s", repr(e))
        sys.exit(1)


def resolve_system_prompt() -> str:
    custom = env_or_none("SYSTEM_PROMPT")
    if custom and custom.upper() != "UNMODIFIED":
        return custom
    return DEFAULT_SYSTEM_PROMPT


async def main():
    coral_runtime = getenv("CORAL_ORCHESTRATION_RUNTIME", None)
    if coral_runtime is None:
        load_dotenv()

    coral_connection_url = asserted_env("CORAL_CONNECTION_URL")
    extra_prompt = getenv("CORAL_PROMPT_SYSTEM", "")

    system_prompt = resolve_system_prompt()
    model_name = asserted_env("MODEL_NAME")
    model_provider = asserted_env("MODEL_PROVIDER")
    model_api_key = asserted_env("MODEL_API_KEY")
    model_base_url = getenv("MODEL_BASE_URL")
    kwargs = {}
    if model_base_url and model_base_url.upper() != "UNMODIFIED":
        kwargs["base_url"] = model_base_url

    temperature = float(asserted_env("MODEL_TEMPERATURE"))
    max_tokens = int(float(asserted_env("MODEL_MAX_TOKENS")))
    max_iterations = int(float(asserted_env("MAX_ITERATIONS")))

    global claim_handler
    claim_handler = ClaimHandler("usd")

    prompt = ChatPromptTemplate.from_messages(
        [
            SystemMessage(
                content="{coral_instruction} {system_prompt} {extra_prompt} {coral_messages}"
            ),
            MessagesPlaceholder("history"),
        ]
    )

    model = init_chat_model(
        model=model_name,
        model_provider=model_provider,
        api_key=model_api_key,
        temperature=temperature,
        max_tokens=max_tokens,
        **kwargs,
    )

    client = MultiServerMCPClient(
        connections={
            "coral": {
                "transport": "sse",
                "url": coral_connection_url,
                "timeout": 300000,
                "sse_read_timeout": 300000,
            }
        }
    )

    history = InMemoryHistory()
    logger.info("Connecting to Coral @ '%s'", coral_connection_url)

    async with client.session("coral") as coral_session:
        tools = await fetch_tools(client, coral_session)
        chain = prompt | model.bind_tools(tools)
        tool_runner = ToolRunner(tools)

        coral_instruction = (
            await load_mcp_resources(coral_session, uris="coral://agent/instruction")
        )[0]

        for _ in range(max_iterations):
            if claim_handler.no_budget():
                logger.info("No budget remaining — stopping.")
                break

            coral_messages = (
                await load_mcp_resources(coral_session, uris="coral://messages")
            )[0]

            step_result: BaseMessage = await chain.ainvoke(
                {
                    "coral_instruction": [
                        SystemMessage(content=coral_instruction.as_string())
                    ],
                    "system_prompt": system_prompt,
                    "extra_prompt": extra_prompt,
                    "coral_messages": [
                        SystemMessage(content=coral_messages.as_string())
                    ],
                    "history": history.messages,
                }
            )

            total_to_claim = 0.0
            try:
                usage = (
                    step_result.model_dump()
                    .get("response_metadata", {})
                    .get("token_usage", {})
                )
                total_tokens = usage.get("total_tokens", 0)
                total_to_claim = total_tokens * USD_PER_TOKEN
                if total_to_claim > 0:
                    claim_handler.claim(total_to_claim)
            except (AttributeError, TypeError):
                logger.warning("Could not compute token cost for step.")

            logger.info("-> %s", step_result.content)
            history.add_message(step_result)

            if isinstance(step_result, AIMessage) and step_result.tool_calls:
                for call in step_result.tool_calls:
                    history.add_message(await tool_runner.run_tool(call))


if __name__ == "__main__":
    asyncio.run(main())
