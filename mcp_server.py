"""Start the Homebase MCP server (Claude runs this; see README "Claude access").

Works from any folder:  C:\\path\\to\\Homebase\\.venv\\Scripts\\python.exe C:\\path\\to\\Homebase\\mcp_server.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.mcp_server import main  # noqa: E402

main()
