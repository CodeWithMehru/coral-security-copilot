import logging
from collections.abc import Sequence

from langchain_core.messages import ToolCall, ToolMessage
from langchain_mcp_adapters.client import BaseTool
from rich.logging import RichHandler

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
logger.addHandler(RichHandler(rich_tracebacks=True))


class ToolRunner:
    tool_by_name: dict[str, BaseTool]

    def __init__(self, tools: Sequence[BaseTool]) -> None:
        self.tool_by_name = {tool.name: tool for tool in tools}

    async def run_tool(self, call: ToolCall) -> ToolMessage:
        if not call["name"]:
            return ToolMessage(
                content="Failed to run tool - no tool name passed!",
                tool_call_id=call["id"],
            )
        tool = self.tool_by_name.get(call["name"])
        if tool is None:
            return ToolMessage(
                content=f"Tool '{call['name']}' not found",
                tool_call_id=call["id"],
            )
        try:
            tool_result = await tool.arun(call["args"])
            return ToolMessage(content=str(tool_result), tool_call_id=call["id"])
        except Exception as e:
            content = f"Error running tool '{call['name']}': {e}"
            logger.warning(content)
            return ToolMessage(content=content, tool_call_id=call["id"])
