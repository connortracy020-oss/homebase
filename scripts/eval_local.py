"""How far can you trust the local model's quick checks?

Runs the local model again on every submission whose right verdict is known
(the verdict you settled on, or else Claude's review) and compares. Nothing
is saved; your submissions are unchanged.

    .venv\\Scripts\\python scripts\\eval_local.py              # uses the Settings model
    .venv\\Scripts\\python scripts\\eval_local.py --model qwen3.8:27b
    .venv\\Scripts\\python scripts\\eval_local.py --run-anyway  # don't wait for other apps

Like the app, it waits while another app's model is on the GPU, unless you
pass --run-anyway. Rule of thumb from the plan: trust local verdicts only if
they agree about 85% of the time AND never call wrong work correct.
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

from app import db, local_ai  # noqa: E402
from app.models import Problem, Submission  # noqa: E402


def truth(sub: Submission) -> tuple[str, str]:
    if sub.user_verdict:
        return sub.user_verdict, "you"
    if sub.status == "reviewed" and sub.verdict:
        return sub.verdict, "Claude"
    return "", ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--model", help="an Ollama model name (default: the one chosen in Settings)")
    ap.add_argument("--run-anyway", action="store_true", help="don't wait for other apps' models")
    ap.add_argument("--limit", type=int, default=50)
    args = ap.parse_args()

    db.init_db()
    with Session(db.get_engine()) as session:
        st = local_ai.status(session)
        if not st.running:
            print(f"Ollama isn't running: {st.error}")
            return 1
        model = args.model or st.model
        if model not in st.vision_models:
            print(f"{model} isn't a vision model in your Ollama. Have: {', '.join(st.vision_models)}")
            return 1
        subs = [s for s in session.exec(select(Submission).where(Submission.exam_attempt_id.is_(None))
                                        .order_by(Submission.id)).all() if truth(s)[0]][: args.limit]
        if not subs:
            print("No submissions with a known verdict yet. Submit some work, settle the verdicts "
                  "(or have Claude review them), then run this again.")
            return 0
        print(f"Checking {len(subs)} submission(s) with {model}\n")
        rows, agree, false_correct = [], 0, 0
        for sub in subs:
            while not args.run_anyway:
                busy = local_ai.blocker(local_ai.client().loaded(), model)
                if not busy:
                    break
                print(f"  waiting: {local_ai.short_name(busy)} is loaded by another app…")
                time.sleep(10)
            want, who = truth(sub)
            t0 = time.time()
            try:
                got = local_ai.review_submission(session, sub, model)["verdict"]
            except Exception as e:  # keep going; report it
                got = f"error: {e}"[:40]
            secs = time.time() - t0
            problem = session.get(Problem, sub.problem_id) if sub.problem_id else None
            ok = got == want
            agree += ok
            false_correct += (got == "correct" and want in ("incorrect", "partial"))
            rows.append((sub.id, problem.label if problem else "?", want, who, got, secs, ok))
            print(f"  #{sub.id:<4} {rows[-1][1][:28]:<28} right: {want:<9} ({who:<6}) local: {got:<9} "
                  f"{secs:5.1f}s {'✓' if ok else '✗'}")
        n = len(rows)
        print(f"\nAgreement: {agree}/{n} = {100 * agree / n:.0f}%")
        print(f"Called wrong work correct: {false_correct} time(s)")
        verdict = "trustworthy enough to count" if agree / n >= 0.85 and false_correct == 0 else "comments only for now"
        print(f"Suggestion: local verdicts are {verdict}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
