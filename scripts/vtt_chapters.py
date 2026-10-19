"""Parse OCW caption files (.vtt/.srt) and build chapter indexes for Homebase.

Usage (always run with `python -I`):
  python -I vtt_chapters.py dump <caption file> [block_seconds]
      Print the transcript as timestamped blocks ("[mm:ss = N s] text"),
      each block starting on a real cue start time. Used for reading the
      lecture to choose chapter boundaries.
  python -I vtt_chapters.py build <manifest.json> <spec.json> <out chapters.json> [generated date]
      manifest: [{"video_id", "caption_file" (relative to Homebase root),
                  "caption_source_url"}] plus optional "missing" list.
      spec: {"<video_id>": {"summary": str, "chapters": [{"t", "title", "kind"}]}}
      Every chapter t is snapped to the nearest caption cue start (it must be
      within 4 s of one, else the build fails), so all timestamps come from
      the caption file. duration_sec is the end time of the last cue.
"""
import json
import os
import re
import sys

HOMEBASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KINDS = {"concept", "example", "demo", "review", "admin"}
TS = re.compile(r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})")
TAG = re.compile(r"<[^>]+>")


def _sec(h, m, s, ms):
    return int(h or 0) * 3600 + int(m) * 60 + int(s) + int(ms.ljust(3, "0")) / 1000.0


def parse(path):
    """Return a list of cues: (start_sec, end_sec, text)."""
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        lines = f.read().replace("\r\n", "\n").replace("\r", "\n").split("\n")
    cues, cur = [], None
    for line in lines:
        m = TS.search(line)
        if m:
            g = m.groups()
            cur = [_sec(*g[0:4]), _sec(*g[4:8]), []]
            cues.append(cur)
        elif not line.strip():
            cur = None
        elif cur is not None:
            cur[2].append(TAG.sub("", line).strip())
    return [(a, b, " ".join(t for t in txt if t)) for a, b, txt in cues]


def fmt(t):
    t = int(t)
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def dump(path, block=30.0):
    cues = parse(path)
    print(f"# {os.path.basename(path)}: {len(cues)} cues, duration {fmt(cues[-1][1])} ({int(round(cues[-1][1]))} s)")
    start, buf = None, []
    for a, b, txt in cues:
        if start is None:
            start = a
        buf.append(txt)
        if b - start >= block:
            print(f"[{fmt(start)} = {int(start)}] {' '.join(buf)}")
            start, buf = None, []
    if buf:
        print(f"[{fmt(start)} = {int(start)}] {' '.join(buf)}")


def _words(s):
    return re.findall(r"[a-z0-9']+", s.lower())


def _copied(text, transcript_words, n=7):
    """Return a phrase of n+ words in `text` that appears verbatim in the transcript."""
    w = _words(text)
    joined = " " + " ".join(transcript_words) + " "
    for i in range(len(w) - n + 1):
        phrase = " ".join(w[i:i + n])
        if " " + phrase + " " in joined:
            return phrase
    return None


def build(manifest_path, spec_path, out_path, generated="2026-10-19"):
    with open(manifest_path, encoding="utf-8-sig") as f:
        manifest = json.load(f)
    with open(spec_path, encoding="utf-8-sig") as f:
        spec = json.load(f)
    videos, missing, problems = [], [], []
    entries = manifest["videos"] if isinstance(manifest, dict) else manifest
    missing.extend(manifest.get("missing", []) if isinstance(manifest, dict) else [])
    for ent in entries:
        vid = ent["video_id"]
        cap = os.path.join(HOMEBASE, ent["caption_file"].replace("/", os.sep))
        if vid not in spec:
            problems.append(f"{vid}: no spec entry")
            continue
        cues = parse(cap)
        starts = [c[0] for c in cues]
        tw = _words(" ".join(c[2] for c in cues))
        chapters = []
        for ch in spec[vid]["chapters"]:
            t = float(ch["t"])
            near = min(starts, key=lambda s: abs(s - t))
            if abs(near - t) > 4:
                problems.append(f"{vid}: t={t} is not near any cue start (nearest {near})")
            title = ch["title"].strip()
            if len(title.split()) > 8:
                problems.append(f"{vid}: title over 8 words: {title}")
            if ch["kind"] not in KINDS:
                problems.append(f"{vid}: bad kind {ch['kind']}")
            chapters.append({"t": int(near), "title": title, "kind": ch["kind"]})
        ts = [c["t"] for c in chapters]
        if ts != sorted(ts) or len(set(ts)) != len(ts):
            problems.append(f"{vid}: chapter times not strictly increasing: {ts}")
        summary = spec[vid]["summary"].strip()
        for text in [summary] + [c["title"] for c in chapters]:
            hit = _copied(text, tw)
            if hit:
                problems.append(f"{vid}: phrase copied from transcript: '{hit}'")
        dur = int(round(cues[-1][1]))
        if chapters and chapters[-1]["t"] >= dur:
            problems.append(f"{vid}: last chapter after end of video")
        rec = {
            "video_id": vid,
            "caption_file": ent["caption_file"],
            "caption_source_url": ent["caption_source_url"],
            "duration_sec": dur,
            "summary": summary,
            "chapters": chapters,
        }
        if ent.get("note"):
            rec["note"] = ent["note"]
        videos.append(rec)
        print(f"{vid}: {len(chapters)} chapters, {fmt(dur)}")
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"generated": generated, "videos": videos, "missing": missing}, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {out_path}: {len(videos)} videos, {sum(len(v['chapters']) for v in videos)} chapters, {len(missing)} missing")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "dump":
        dump(sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 30.0)
    elif len(sys.argv) >= 5 and sys.argv[1] == "build":
        build(sys.argv[2], sys.argv[3], sys.argv[4], *(sys.argv[5:6]))
    else:
        print(__doc__)
        sys.exit(2)
