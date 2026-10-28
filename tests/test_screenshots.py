"""Screenshots in notes from Claude: finding the one he means on this laptop (app/screenshots.py)
and keeping it, cropped, as an image block (notes_add and notes_update in app/mcp_server.py)."""
import os
import time

import pytest
from mcp.server.mcpserver import Image
from PIL import Image as PILImage

from app import config, screenshots
from app.models import NoteBlock


@pytest.fixture
def shots(tmp_path, monkeypatch):
    """A Screenshots folder of test images, and an empty clipboard (the real one is never read)."""
    folder = tmp_path / "Screenshots"
    folder.mkdir()
    monkeypatch.setenv("HOMEBASE_SCREENSHOTS", str(folder))
    monkeypatch.setattr(screenshots.ImageGrab, "grabclipboard", lambda: None)

    def make(name, color, size=(400, 300), minutes_ago=1):
        path = folder / name
        PILImage.new("RGB", size, color).save(path)
        t = time.time() - minutes_ago * 60
        os.utime(path, (t, t))
        return path
    return make


def test_recent_screenshots_newest_first_with_previews(session, shots, monkeypatch):
    from app import mcp_server as m
    assert "No image on his clipboard" in m.screenshots_recent()[0]
    shots("Screenshot old.png", "red", minutes_ago=8 * 60)  # too old to offer
    shots("Screenshot a.png", "green", minutes_ago=30)
    shots("Screenshot b.png", "blue", minutes_ago=2)
    out = m.screenshots_recent()
    lines = [x for x in out if isinstance(x, str)]
    assert lines[1].startswith("- screenshot='Screenshot b.png': taken 2 min ago") and "400×300" in lines[1]
    assert "Screenshot a.png" in lines[2] and not any("old" in s for s in lines)
    assert sum(isinstance(x, Image) for x in out) == 2
    # the clipboard's image comes first, unless it's the newest screenshot again
    monkeypatch.setattr(screenshots.ImageGrab, "grabclipboard", lambda: PILImage.new("RGB", (50, 40), "purple"))
    names = [s.name for s in screenshots.recent()]
    assert names[0].startswith("clipboard:") and names[1:] == ["Screenshot b.png", "Screenshot a.png"]
    monkeypatch.setattr(screenshots.ImageGrab, "grabclipboard", lambda: PILImage.new("RGB", (400, 300), "blue"))
    assert [s.name for s in screenshots.recent()] == ["Screenshot b.png", "Screenshot a.png"]


def test_claude_keeps_a_cropped_screenshot_in_notes(session, shots, monkeypatch):
    from app import mcp_server as m
    shots("Screenshot fig.png", "white", size=(400, 200))
    out = m.notes_add("ECE201", "2", "ideas", "The divider from the lecture", screenshot="Screenshot fig.png",
                      crop=[0, 0, 0.5, 0.5])
    assert out[0].startswith("Added block") and isinstance(out[1], Image)
    bid = int(out[0].split()[2])
    b = session.get(NoteBlock, bid)
    assert (b.kind, b.created_by, b.body) == ("image", "claude", "The divider from the lecture")
    assert PILImage.open(config.DATA_DIR / b.asset).size == (200, 100)
    # a better crop replaces the picture
    assert "Updated block" in m.notes_update(bid, screenshot="Screenshot fig.png", crop=[0.25, 0.25, 1, 1])[0]
    session.expire_all()
    assert PILImage.open(config.DATA_DIR / session.get(NoteBlock, bid).asset).size == (300, 150)
    # the clipboard's image, by the name screenshots_recent gave it, as long as it's still there
    monkeypatch.setattr(screenshots.ImageGrab, "grabclipboard", lambda: PILImage.new("RGB", (80, 60), "black"))
    clip = screenshots.recent()[0].name
    assert m.notes_add("ECE201", "2", "ideas", "From the clipboard", screenshot=clip)[0].startswith("Added block")
    monkeypatch.setattr(screenshots.ImageGrab, "grabclipboard", lambda: PILImage.new("RGB", (80, 60), "gray"))
    with pytest.raises(ValueError, match="different image"):
        m.notes_add("ECE201", "2", "ideas", "x", screenshot=clip)


def test_screenshots_claude_cant_reach_are_explained(session, shots):
    from app import mcp_server as m
    shots("Screenshot fig.png", "white")
    with pytest.raises(ValueError, match="your own sandbox"):  # where an image pasted into the chat lives
        m.notes_add("ECE201", "2", "ideas", "x", image_path="/mnt/user-data/uploads/1792610571934_image.png")
    with pytest.raises(ValueError, match="No screenshot called 'secret.png'"):  # only the Screenshots folder
        m.notes_add("ECE201", "2", "ideas", "x", screenshot="..\\..\\secret.png")
    with pytest.raises(ValueError, match="crop is"):
        m.notes_add("ECE201", "2", "ideas", "x", screenshot="Screenshot fig.png", crop=[0.5, 0, 0.2, 1])
    text_block = int(m.notes_add("ECE201", "2", "ideas", "plain words")[0].split()[2])
    with pytest.raises(ValueError, match="not an image"):
        m.notes_update(text_block, screenshot="Screenshot fig.png")
