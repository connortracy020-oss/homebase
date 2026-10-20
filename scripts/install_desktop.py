"""Make Homebase a desktop app: icon files plus Start menu and desktop shortcuts.

    .venv\\Scripts\\python scripts\\install_desktop.py             # add the shortcuts
    .venv\\Scripts\\python scripts\\install_desktop.py --no-desktop  # Start menu only
    .venv\\Scripts\\python scripts\\install_desktop.py --remove    # take them away again

The shortcuts run desktop/launch.pyw (see that file). Nothing else on the
system changes: no registry edits, no startup entries, no firewall changes.
"""
import argparse
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICO = ROOT / "desktop" / "homebase.ico"
NAME = "Homebase"
CHARCOAL, CREAM = (42, 42, 40), (245, 240, 230)


def draw(size: int) -> Image.Image:
    """The same mark as app/static/icon.svg: a cream house on a charcoal rounded square."""
    s = 8  # draw big, then shrink, for smooth edges
    big = size * s
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    unit = big / 64
    d.rounded_rectangle([0, 0, big - 1, big - 1], radius=14 * unit, fill=CHARCOAL)
    w = round(4 * unit)
    roof = [(14 * unit, 32 * unit), (32 * unit, 17 * unit), (50 * unit, 32 * unit)]
    d.line(roof, fill=CREAM, width=w, joint="curve")
    d.line([(14 * unit, 31 * unit), (14 * unit, 48 * unit), (50 * unit, 48 * unit), (50 * unit, 31 * unit)],
           fill=CREAM, width=w, joint="curve")
    d.rounded_rectangle([27 * unit, 36 * unit, 37 * unit, 50 * unit], radius=1.5 * unit, fill=CREAM)
    return img.resize((size, size), Image.LANCZOS)


def make_icons() -> None:
    ICO.parent.mkdir(exist_ok=True)
    draw(256).save(ICO, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    static = ROOT / "app" / "static"
    draw(192).save(static / "icon-192.png")
    draw(512).save(static / "icon-512.png")
    # iOS home-screen icon: square, no transparency (iOS rounds the corners itself)
    flat = Image.new("RGB", (180, 180), CHARCOAL)
    flat.paste(draw(180), mask=draw(180))
    flat.save(static / "apple-touch-icon.png")
    print(f"icons: {ICO.relative_to(ROOT)}, app/static/icon-192.png, icon-512.png, apple-touch-icon.png")


def ps(script: str) -> str:
    out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
                         capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(out.stderr.strip() or "PowerShell failed")
    return out.stdout.strip()


def folders() -> dict[str, Path]:
    return {"Start menu": Path(ps("[Environment]::GetFolderPath('Programs')")),
            "Desktop": Path(ps("[Environment]::GetFolderPath('Desktop')"))}


def make_shortcut(path: Path) -> None:
    pythonw = ROOT / ".venv" / "Scripts" / "pythonw.exe"
    launcher = ROOT / "desktop" / "launch.pyw"
    q = lambda p: str(p).replace("'", "''")  # noqa: E731  (PowerShell single-quote escaping)
    ps(f"""$s = (New-Object -ComObject WScript.Shell).CreateShortcut('{q(path)}')
$s.TargetPath = '{q(pythonw)}'
$s.Arguments = '"{q(launcher)}"'
$s.WorkingDirectory = '{q(ROOT)}'
$s.IconLocation = '{q(ICO)},0'
$s.Description = 'Homebase: your Winter 2027 study plan'
$s.Save()""")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-desktop", action="store_true", help="only add the Start menu shortcut")
    ap.add_argument("--remove", action="store_true", help="remove the shortcuts")
    args = ap.parse_args()
    where = folders()
    if args.no_desktop:
        where.pop("Desktop")
    if args.remove:
        for label, folder in where.items():
            link = folder / f"{NAME}.lnk"
            if link.exists():
                link.unlink()
                print(f"removed {label} shortcut: {link}")
        return 0
    make_icons()
    for label, folder in where.items():
        link = folder / f"{NAME}.lnk"
        make_shortcut(link)
        print(f"{label} shortcut: {link}")
    print("Done. Open Homebase from the Start menu (you can pin it to the taskbar from there).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
