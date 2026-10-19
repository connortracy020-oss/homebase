"""Check AI feedback against handwritten-style samples with known mistakes.

    python scripts/feedback_eval.py make  OUT_DIR    # build samples + review packets
    python scripts/feedback_eval.py score OUT_DIR    # post OUT_DIR/reviews.json, compare to expected
    python scripts/feedback_eval.py api   OUT_DIR    # (needs ANTHROPIC_API_KEY) review via the API, then score

Uses its own throwaway database in OUT_DIR/data, never your real one.
In "make" mode each packet is written as OUT_DIR/packets/<id>/packet.md plus
images, which is exactly what a Claude session sees through get_submission.
expected.json is written to OUT_DIR, away from the packets, so a reviewer
can't peek.
"""
import json
import os
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

OUT = Path(sys.argv[2]).resolve()
os.environ["HOMEBASE_DATA"] = str(OUT / "data")
os.environ["HOMEBASE_NO_BACKUP"] = "1"

from PIL import Image, ImageDraw, ImageFont  # noqa: E402
from sqlmodel import Session, select  # noqa: E402

from app import feedback, services  # noqa: E402
from app.db import get_engine, init_db  # noqa: E402
from app.models import Problem, Submission  # noqa: E402
from app.seed import seed  # noqa: E402

FONT = "C:/Windows/Fonts/Inkfree.ttf"

# (problem slug, lines of "handwritten" work, expected verdict, expected cause)
SAMPLES = [
    ("gen-ece201-w1-power-element_power-1",
     ["i leaves the + terminal (arrow points out of top, + is top)",
      "so not passive:  p = -v i", "p = -(4 V)(2 A) = -8 W", "element delivers 8 W"],
     "correct", "none"),
    ("gen-ece201-w1-power-element_power-2",
     ["+ is at the bottom, arrow points out of the top", "current leaves the top so it enters... the top?",
      "not passive:  p = -v i", "p = -(2)(-0.5) = +1 W", "absorbs 1 W"],
     "incorrect", "setup"),
    ("gen-ece201-w1-power-loop_power-1",
     ["I = -2 A clockwise", "A: enters -,  p = -vI = -(3)(-2) = 6 W",
      "B: enters -,  p = -vI = -(3)(-2) = 6 W", "C: enters +,  p = vI = (-12)(-2) = -24 W",
      "D: enters +,  p = vI = (18)(-2) = -36 W", "sum = 6 + 6 - 24 - 36 = -48 ... should be 0?"],
     "partial", "algebra-sign"),
    ("gen-ece201-w1-power-charge_current-3",
     ["q = integral of i dt from 0 to 2", "= integral 4t dt = 2t^2 from 0 to 2", "= 2(4) - 0 = 8 C"],
     "correct", "none"),
    ("ulaby-ex-ch1-2",
     ["(a) 8.32 x 10^7 Hz = 83.2 MHz", "(b) 1.67 x 10^-8 m = 16.7 nm", "(c) 9.79 x 10^-16 g = 97.9 fg",
      "(d) 4.48 x 10^13 V = 44.8 TV", "(e) 762 bits/s"],
     "partial", "units"),
    ("kuphaldt-ewp-4",
     ["Work = a force pushing something through a distance (W = F d)",
      "Energy = what lets something do work, the ability to do work",
      "Power = how fast work gets done, work per unit time (P = W/t)"],
     "correct", "none"),
    ("ulaby-ex-ch1-1",
     ["~~ scribble ~~", "(a) 5?.? x 1?-? V", "(b) ... ", "[photo too blurry]"],
     "unclear", "unclear"),
]


def handwritten(lines: list[str], seed: int, blur: bool = False) -> bytes:
    rng = random.Random(seed)
    font = ImageFont.truetype(FONT, 54)
    width = max(1500, 200 + max(int(font.getlength(line)) for line in lines))  # never cut text off
    img = Image.new("RGB", (width, 160 + 110 * len(lines)), (250, 249, 244))
    d = ImageDraw.Draw(img)
    for y in range(120, img.height, 110):  # ruled paper
        d.line([(40, y + 60), (width - 40, y + 60)], fill=(205, 215, 230), width=2)
    for i, line in enumerate(lines):
        d.text((90 + rng.randint(-12, 12), 90 + 110 * i + rng.randint(-6, 6)), line,
               fill=(35, 45, 90), font=font)
    img = img.rotate(rng.uniform(-1.5, 1.5), expand=True, fillcolor=(250, 249, 244))
    if blur:
        from PIL import ImageFilter
        img = img.filter(ImageFilter.GaussianBlur(9))
    from io import BytesIO
    buf = BytesIO()
    img.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def make():
    init_db()
    with Session(get_engine()) as s:
        seed(s)
        expected, packets = {}, OUT / "packets"
        for n, (slug, lines, verdict, cause) in enumerate(SAMPLES, 1):
            p = s.exec(select(Problem).where(Problem.slug == slug)).one()
            course = services.course_by_code(s, "ECE201")
            sub = services.create_submission(s, p, course, [(f"work{n}.jpg", handwritten(
                lines, n, blur=(verdict == "unclear")))])
            expected[sub.id] = {"slug": slug, "verdict": verdict, "cause": cause}
            folder = packets / str(sub.id)
            folder.mkdir(parents=True, exist_ok=True)
            packet = feedback.build_packet(s, sub)
            md = [packet.intro(), ""]
            for k, part in enumerate(packet.parts, 1):
                if part.text:
                    md.append(part.text)
                if part.png or part.jpeg:
                    name = f"image{k}.{'png' if part.png else 'jpg'}"
                    (folder / name).write_bytes(part.png or part.jpeg)
                    md.append(f"[image: {name}]")
                md.append("")
            (folder / "packet.md").write_text("\n".join(md), encoding="utf-8")
        (OUT / "expected.json").write_text(json.dumps(expected, indent=2), encoding="utf-8")
        (OUT / "INSTRUCTIONS.md").write_text(feedback.SYSTEM_PROMPT + "\nReply per submission with a JSON "
                                             "object matching this schema:\n" + json.dumps(feedback.SCHEMA, indent=1),
                                             encoding="utf-8")
    print(f"Made {len(SAMPLES)} submissions; packets in {OUT / 'packets'}")


def score(post_from_file=True):
    expected = json.loads((OUT / "expected.json").read_text(encoding="utf-8"))
    with Session(get_engine()) as s:
        if post_from_file:
            reviews = json.loads((OUT / "reviews.json").read_text(encoding="utf-8"))
            for sub_id, review in reviews.items():
                feedback.apply_review(s, s.get(Submission, int(sub_id)), review, reviewer="claude_session")
        hits = 0
        for sub_id, exp in expected.items():
            sub = s.get(Submission, int(sub_id))
            ok = sub.verdict == exp["verdict"]
            hits += ok
            print(f"{'OK ' if ok else 'BAD'} #{sub_id} {exp['slug']:<40} expected {exp['verdict']}/{exp['cause']}"
                  f"  got {sub.verdict}/{sub.cause}  legible={sub.legible}")
        print(f"{hits}/{len(expected)} verdicts match")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "make":
        make()
    elif cmd == "score":
        score()
    elif cmd == "api":
        with Session(get_engine()) as s:
            for sub in s.exec(select(Submission)).all():
                feedback.run_api_review(s, sub)
        score(post_from_file=False)
