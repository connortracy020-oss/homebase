"""Read aloud with Chatterbox, the same voice Lecture Desk uses.

Homebase doesn't install its own copy. It uses Lecture Desk's Chatterbox engine
(ChatterboxReader.exe) and model, read-only:

  - The engine runs from Lecture Desk's folder, as Homebase's own separate process,
    started when you press play and stopped after a few idle minutes (to free the GPU).
  - The engine looks for the model under <root>/models/chatterbox-multilingual-v3 and
    writes audio only under <root>/reader-cache. Homebase gives it its own root,
    data/speech/, whose model folder holds hard links to Lecture Desk's model files:
    the same files on disk, no extra space, and nothing in Lecture Desk's folder changes.
  - If Lecture Desk is already reading aloud (its Chatterbox is running), or the GPU
    doesn't have room, Homebase says so instead of competing for it.

Each sentence is spoken once and cached by its text, so replaying is instant.

The voice makes audio a bit slower than it plays (about 1.2 to 1.7 seconds of work per second of
speech), so it can't keep up when it only works one or two sentences ahead. Requests therefore
wait in a queue with three priorities, and the sentence you are waiting to hear always goes first:
  0 NOW         the sentence being played (or about to be)
  1 AHEAD       the look-ahead the reader page asks for while you listen
  2 BACKGROUND  "prepare the next pages" (see app/routes/speech_routes.py)
"""
import contextlib
import hashlib
import heapq
import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

from . import config

MODEL_FOLDER = "chatterbox-multilingual-v3"
MODEL_FILES = ("Cangjie5_TC.json", "conds.pt", "grapheme_mtl_merged_expanded_v1.json", "s3gen.pt",
               "t3_mtl23ls_v3.safetensors", "ve.pt")
MARKER = "lecture-desk-model.json"
VOICE = "chatterbox_v3_default"
IDLE_SECONDS = 180          # stop the engine (and free the GPU) after this long unused
NEEDS_VRAM_MB = 4500        # roughly what the engine needs on the GPU
START_TIMEOUT = 180
SPEAK_TIMEOUT = 120
CREATE_NO_WINDOW = 0x08000000


class SpeechError(Exception):
    pass


class SpeechBusy(SpeechError):
    """The GPU or Chatterbox is in use by something else right now."""


class SpeechStale(SpeechError):
    """A look-ahead request for a place you have since jumped away from. Safe to ignore."""


NOW, AHEAD, BACKGROUND = 0, 1, 2


def speech_root() -> Path:
    return config.DATA_DIR / "speech"


def lecture_desk_models() -> Path | None:
    """Where Lecture Desk keeps its models. Its data may be in the normal place or, when
    it was installed from a packaged app, under that app's LocalCache."""
    override = os.environ.get("HOMEBASE_CHATTERBOX_MODELS")
    candidates = [Path(override)] if override else []
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    candidates.append(local / "Lecture Desk" / "models")
    packages = local / "Packages"
    if packages.is_dir():
        candidates += sorted(packages.glob("*/LocalCache/Local/Lecture Desk/models"))
    for c in candidates:
        if (c / "chatterbox-runtime" / "ChatterboxReader.exe").is_file() and (c / MODEL_FOLDER / MARKER).is_file():
            return c
    return None


def status() -> dict:
    src = lecture_desk_models()
    if src is None:
        return {"available": False, "reason": "Lecture Desk's Chatterbox voice isn't on this laptop."}
    return {"available": True, "engine": str(src / "chatterbox-runtime" / "ChatterboxReader.exe"),
            "running": ENGINE.running(), "ready": ENGINE.ready.is_set()}


def link_models(src: Path) -> Path:
    """data/speech/models/<folder>/ with hard links to Lecture Desk's model files."""
    target = speech_root() / "models" / MODEL_FOLDER
    target.mkdir(parents=True, exist_ok=True)
    for name in MODEL_FILES:
        s, t = src / MODEL_FOLDER / name, target / name
        if t.exists() and t.stat().st_size == s.stat().st_size:
            continue
        if t.exists():
            t.unlink()  # a stale link to an older file (only our own link is removed)
        try:
            os.link(s, t)
        except OSError as e:
            raise SpeechError(f"Couldn't link Chatterbox's model file {name} ({e}).") from e
    shutil.copyfile(src / MODEL_FOLDER / MARKER, target / MARKER)
    (speech_root() / "reader-cache").mkdir(parents=True, exist_ok=True)
    return target


def other_chatterbox_running(own_pid: int | None) -> bool:
    try:
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq ChatterboxReader.exe", "/FO", "CSV", "/NH"],
                             capture_output=True, text=True, timeout=10, creationflags=CREATE_NO_WINDOW).stdout
    except (OSError, subprocess.TimeoutExpired):
        return False
    pids = [int(line.split('","')[1]) for line in out.splitlines() if line.startswith('"ChatterboxReader')]
    return any(p != own_pid for p in pids)


def free_vram_mb() -> int | None:
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=memory.total,memory.used", "--format=csv,noheader,nounits"],
                             capture_output=True, text=True, timeout=10, creationflags=CREATE_NO_WINDOW).stdout
        total, used = (int(x) for x in out.strip().splitlines()[0].split(","))
        return total - used
    except (OSError, ValueError, IndexError, subprocess.TimeoutExpired):
        return None


def cache_key(text: str) -> str:
    return hashlib.sha256(f"{VOICE}\n{text}".encode("utf-8")).hexdigest()[:32]


def cached_audio(text: str) -> Path | None:
    path = speech_root() / "reader-cache" / f"{cache_key(text)}.wav"
    return path if path.is_file() and path.stat().st_size > 1000 else None


class Engine:
    """One ChatterboxReader process, fed one sentence at a time over stdin."""

    def __init__(self):
        self.proc: subprocess.Popen | None = None
        self.ready = threading.Event()
        self.turn = threading.Condition()   # one sentence at a time, in priority order
        self.waiting: list[tuple[int, int]] = []   # (priority, ticket number) of requests in line
        self.busy = False
        self.tickets = 0
        self.epoch = 0                      # the newest "place in the reading" the page has told us about
        self.start_lock = threading.Lock()
        self.pending: dict[str, dict] = {}
        self.events: dict[str, threading.Event] = {}
        self.last_used = time.time()
        self.fatal = ""
        self.counter = 0
        threading.Thread(target=self._idle_watch, daemon=True).start()

    def running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def start(self, force: bool = False) -> None:
        with self.start_lock:
            if self.running():
                return
            src = lecture_desk_models()
            if src is None:
                raise SpeechError("Lecture Desk's Chatterbox voice isn't on this laptop.")
            if not force:
                if other_chatterbox_running(None):
                    raise SpeechBusy("Lecture Desk is using its Chatterbox voice right now.")
                free = free_vram_mb()
                if free is not None and free < NEEDS_VRAM_MB:
                    raise SpeechBusy(f"The GPU is busy (only {free} MB free; another app, probably Ollama, has a model loaded).")
            link_models(src)
            self.ready.clear()
            self.fatal = ""
            env = {**os.environ, "LECTURE_PARENT_PID": str(os.getpid())}  # the engine exits if Homebase does
            self.proc = subprocess.Popen(
                [str(src / "chatterbox-runtime" / "ChatterboxReader.exe"), "--mode", "serve", "--root", str(speech_root())],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env,
                cwd=str(src / "chatterbox-runtime"), creationflags=CREATE_NO_WINDOW, text=True, encoding="utf-8", bufsize=1)
            threading.Thread(target=self._read, args=(self.proc,), daemon=True).start()
        if not self.ready.wait(START_TIMEOUT):
            self.stop()
            raise SpeechError("The Chatterbox voice took too long to start.")
        if self.fatal:
            if "nvidia" in self.fatal.lower():
                raise SpeechError("Chatterbox needs the laptop's NVIDIA GPU, which is switched off right now "
                                  "(on battery or in an Eco or integrated-only power mode).")
            raise SpeechError(f"The Chatterbox voice didn't start: {self.fatal}.")

    def _read(self, proc):
        for line in proc.stdout:
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if msg.get("ready"):
                self.ready.set()
            elif "fatal" in msg:
                self.fatal = str(msg["fatal"])[:300]
                self.ready.set()
            elif msg.get("id") in self.events:
                self.pending[msg["id"]] = msg
                self.events[msg["id"]].set()
        self.ready.set()  # the process ended; wake anyone waiting
        for ev in list(self.events.values()):
            ev.set()

    @contextlib.contextmanager
    def _my_turn(self, priority: int, epoch: int | None):
        """Wait in line (lowest priority number first, then first come first served)."""
        with self.turn:
            self.tickets += 1
            me = (priority, self.tickets)
            heapq.heappush(self.waiting, me)
            try:
                while self.busy or self.waiting[0] != me:
                    self.turn.wait()
                if priority > NOW and epoch is not None and epoch < self.epoch:
                    raise SpeechStale("You jumped to another place in the reading.")
            finally:
                self.waiting.remove(me)
                heapq.heapify(self.waiting)
                self.turn.notify_all()
            self.busy = True
        try:
            yield
        finally:
            with self.turn:
                self.busy = False
                self.turn.notify_all()

    def busy_now(self) -> bool:
        return self.busy or bool(self.waiting)

    def speak(self, text: str, force: bool = False, priority: int = NOW, epoch: int | None = None) -> Path:
        """Speak one sentence. `epoch` says which place in the reading the request belongs to: once
        a newer place has been announced, queued look-ahead for an older one is dropped (SpeechStale)."""
        hit = cached_audio(text)
        if hit:
            return hit
        if epoch is not None:
            with self.turn:
                self.epoch = max(self.epoch, epoch)
        self.last_used = time.time()
        self.start(force=force)
        with self._my_turn(priority, epoch):
            hit = cached_audio(text)
            if hit:
                return hit
            self.counter += 1
            rid = f"hb{self.counter}"
            out = speech_root() / "reader-cache" / f"{cache_key(text)}.wav"
            ev = self.events[rid] = threading.Event()
            try:
                self.proc.stdin.write(json.dumps({"id": rid, "action": "speak", "text": text, "voice": VOICE,
                                                  "language": "en", "output": str(out)}) + "\n")
                self.proc.stdin.flush()
            except (OSError, AttributeError) as e:
                self.events.pop(rid, None)
                raise SpeechError("The Chatterbox voice stopped. Press play again.") from e
            ok = ev.wait(SPEAK_TIMEOUT)
            self.events.pop(rid, None)
            msg = self.pending.pop(rid, None)
            self.last_used = time.time()
            if not ok or msg is None:
                raise SpeechError("The Chatterbox voice didn't answer. Press play again.")
            if msg.get("error"):
                raise SpeechError(str(msg["error"])[:300])
            return out

    def stop(self) -> None:
        proc, self.proc = self.proc, None
        if proc is None:
            return
        try:
            proc.stdin.write(json.dumps({"id": "close", "action": "close"}) + "\n")
            proc.stdin.flush()
            proc.wait(10)
        except Exception:  # noqa: BLE001
            proc.kill()
        self.ready.clear()

    def _idle_watch(self):
        while True:
            time.sleep(20)
            if self.running() and not self.busy_now() and time.time() - self.last_used > IDLE_SECONDS:
                self.stop()


ENGINE = Engine()
