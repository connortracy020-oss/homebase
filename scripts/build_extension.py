"""Build desktop/homebase.mcpb: a Claude Desktop extension that runs Homebase's MCP server.

    .venv\\Scripts\\python scripts\\build_extension.py

Then double-click desktop\\homebase.mcpb (or Claude Desktop > Settings > Extensions >
Advanced > Install extension) and press Install. Extensions are kept in Claude's own
storage, so they survive Claude rewriting claude_desktop_config.json.

The extension doesn't copy Homebase: it starts the server from this folder with this
folder's Python, so it always runs the current code and data.
"""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "desktop" / "homebase.mcpb"
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
SERVER = ROOT / "mcp_server.py"

STUB = f'''"""Starts the Homebase MCP server from its own folder (see scripts/build_extension.py)."""
import runpy, sys
sys.path.insert(0, r"{ROOT}")
sys.argv = [r"{SERVER}"]
runpy.run_path(r"{SERVER}", run_name="__main__")
'''


def main() -> None:
    from app.mcp_server import TOOLS  # the tool list shown on the install screen

    manifest = {
        "manifest_version": "0.2",
        "name": "homebase",
        "display_name": "Homebase",
        "version": "1.0.0",
        "description": "Connor's Winter 2027 study app: plan, progress, problems, feedback, reviews, exams and notes.",
        "author": {"name": "Connor"},
        "server": {
            "type": "python",
            "entry_point": "server/run.py",
            "mcp_config": {"command": str(PYTHON), "args": ["${__dirname}/server/run.py"]},
        },
        "tools": [{"name": t.__name__, "description": (t.__doc__ or "").strip().splitlines()[0]} for t in TOOLS],
        "compatibility": {"platforms": ["win32"]},
    }
    icon = ROOT / "app" / "static" / "icon-512.png"
    if icon.exists():
        manifest["icon"] = "icon.png"
    OUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, indent=2))
        z.writestr("server/run.py", STUB)
        if icon.exists():
            z.write(icon, "icon.png")
    print(f"built {OUT} ({OUT.stat().st_size // 1024} KB, {len(TOOLS)} tools)")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(ROOT))
    main()
