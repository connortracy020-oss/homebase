"""Claude sees why a tool call was refused (_reported in app/mcp_server.py): the MCP SDK passes on
only ToolError messages and reports anything else as a bare "Error executing tool ..."."""
import asyncio

import pytest
from mcp.server.mcpserver.exceptions import ToolError


def test_refusals_reach_claude_with_their_reason(session):
    from app import mcp_server as m
    with pytest.raises(ToolError, match="No circuit 'nope'; use circuits_list"):
        asyncio.run(m.mcp.call_tool("circuits_get", {"circuit_slug": "nope"}))
    with pytest.raises(ToolError, match="your own sandbox"):
        asyncio.run(m.mcp.call_tool("notes_add", {"course": "ECE201", "unit": "2", "part": "ideas", "body": "x",
                                                  "image_path": "/mnt/user-data/uploads/1792610571934_image.png"}))
    with pytest.raises(ToolError, match="unit"):  # a NotesError, a kind of ValueError
        asyncio.run(m.mcp.call_tool("notes_add", {"course": "ECE201", "unit": "99", "part": "ideas", "body": "x"}))
