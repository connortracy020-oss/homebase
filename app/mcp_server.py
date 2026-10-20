"""Homebase MCP server: lets Claude (Code or Desktop) see and update Homebase.

Run by Claude, not by you:
    .venv\\Scripts\\python.exe mcp_server.py

Every change made here is labelled "claude" in the activity log, so the
Progress page shows exactly what Claude did. Claude talks to the same SQLite
database the web app uses; the web app doesn't need to be running.
"""
from contextlib import contextmanager
from datetime import date

from mcp.server.mcpserver import Image, MCPServer
from sqlmodel import Session, select

from . import config, feedback, review, services
from .db import get_engine, init_db
from .models import Course, Mistake, Problem, ProblemSet, Submission, Task

INSTRUCTIONS = """\
Homebase is Connor's self-study platform for three Winter 2027 OSU courses (ECE 201 circuits, \
MTH 254 vector calculus, ECE 200 discrete-time signals). Use these tools to see his plan and \
progress, log work he does with you, and review submitted handwritten work.

Rules:
- Answer keys come from official published solutions or code-computed answers. You give \
feedback; you are not the answer key. Never mark something correct that has no key.
- To review queued work: list_pending_submissions, then get_submission(id) for the full \
packet (problem, key, his pages), then post_feedback. Follow the review instructions in the \
packet exactly.
- When he works a problem with you in chat, record it with record_problem_result and log the \
time with log_study_session. Ask before logging time he didn't mention.
- Spaced review: list_due_reviews shows today's cold re-solves. Have him re-solve without \
notes before showing any key, then record_review_outcome (solid / shaky / miss).
- Everything you change is shown to him as done by Claude.
"""

mcp = MCPServer("homebase", instructions=INSTRUCTIONS)


@contextmanager
def db():
    with Session(get_engine()) as session:
        yield session


def _course(session, code: str) -> Course:
    course = services.course_by_code(session, code.replace(" ", ""))
    if course is None:
        raise ValueError(f"Unknown course {code!r}. Use ECE201, MTH254 or ECE200.")
    return course


def _task_line(t: Task, course_name: str) -> str:
    mark = "x" if t.done_at else " "
    ref = f" [{t.ref_kind}: {t.ref}]" if t.ref_kind else ""
    return f"- [{mark}] task {t.id} · {course_name} wk {t.course_week} · {t.kind}: {t.title} ({t.est_min} min){ref}"


# ---- reading ------------------------------------------------------------------------------

def get_overview(day: str = "") -> str:
    """Where Connor is in the plan today: phase, this week's tasks, time logged, pending reviews."""
    with db() as s:
        d = date.fromisoformat(day) if day else config.today()
        phase = services.phase_for(s, d)
        names = {c.id: c.name for c in services.courses(s)}
        lines = [f"Today is {d:%A %Y-%m-%d}. {phase.label}."]
        if phase.prep_week:
            pw = phase.prep_week
            lines.append(f"Prep week {pw.number}: {pw.start} to {pw.end}. Focus: {pw.focus}")
            for c in services.courses(s):
                planned = pw.planned_minutes.get(c.code, 0)
                if planned:
                    logged = services.minutes_between(s, c.id, pw.start, pw.end)
                    lines.append(f"{c.name}: {logged} of {planned} planned minutes logged this week.")
            lines.append("Tasks this week:")
            lines += [_task_line(t, names[t.course_id]) for t in services.tasks_for_prep_week(s, pw)]
        lines.append(f"Submissions waiting for review: {services.pending_count(s)}")
        lines.append(f"Mistakes due for a cold re-solve today: {len(review.due_items(s, d))}")
        return "\n".join(lines)


def get_week(course: str, week: int) -> str:
    """One term week of a course: topics, videos, readings, problem sets and checklist."""
    with db() as s:
        c = _course(s, course)
        weeks = {w.number: w for w in services.course_weeks(s, c)}
        if week not in weeks:
            raise ValueError(f"{c.name} has weeks 1-{len(weeks)}")
        w = weeks[week]
        out = [f"{c.name} term week {week}: {w.title}", "Topics: " + "; ".join(w.topics)]
        if not c.exam_style_known:
            out.append(f"Note: {c.exam_style_note}")
        out.append("Videos:")
        for v in services.videos_for_week(s, c, week):
            out.append(f"- {v.slug} · {v.title} ({v.series}, {v.duration_min or '?'} min, {v.priority})"
                       f"{' · watched' if v.watched_at else ''}")
        out.append("Readings:")
        for r, res in services.readings_for_week(s, c, week):
            out.append(f"- {res.title}: {r.sections}{' (optional)' if r.optional else ''}")
        out.append("Problem sets:")
        for ps in services.psets_for_week(s, c, week):
            probs = services.problems(s, ps)
            res = services.last_results(s, [p.id for p in probs])
            out.append(f"- {ps.slug} · {ps.title}: {len(probs)} problems, {len(res)} tried")
        out.append("Checklist:")
        out += [_task_line(t, c.name) for t in services.tasks_for_course_week(s, c, week)]
        return "\n".join(out)


def get_progress() -> str:
    """Hours logged vs planned and tasks done, per course."""
    with db() as s:
        lines = []
        for p in services.progress(s):
            lines.append(f"{p.course.name}: {p.minutes} of {p.planned_minutes} planned minutes; "
                         f"{p.tasks_done}/{p.tasks_total} tasks done ({p.pct}%).")
        return "\n".join(lines)


def list_problems(course: str, week: int) -> str:
    """Every problem for a course week, with its key type and Connor's latest result."""
    with db() as s:
        c = _course(s, course)
        out = []
        for ps in services.psets_for_week(s, c, week):
            probs = services.problems(s, ps)
            res = services.last_results(s, [p.id for p in probs])
            out.append(f"{ps.title} ({ps.slug}):")
            out += [f"- {p.slug} · {p.label} · key: {p.key_type} · last: {res.get(p.id, 'not tried')}"
                    for p in probs]
        return "\n".join(out) or "No problem sets for that week yet."


def _packet_content(packet: feedback.Packet) -> list:
    items: list = [packet.intro()]
    for part in packet.parts:
        if part.text:
            items.append(part.text)
        if part.png:
            items.append(Image(data=part.png, format="png"))
        if part.jpeg:
            items.append(Image(data=part.jpeg, format="jpeg"))
    return items


def get_problem(problem_slug: str) -> list:
    """A problem's statement and its answer key (images for PDF problems).

    Use this when Connor works a problem with you. Show him the key only
    after he has tried it.
    """
    with db() as s:
        problem = services.problem_by_slug(s, problem_slug)
        if problem is None:
            raise ValueError(f"No problem {problem_slug!r}; use list_problems to find slugs.")
        pset = s.get(ProblemSet, problem.set_id)
        sub = Submission(problem_id=problem.id, course_id=pset.course_id, created_at=config.now())
        return _packet_content(feedback.build_packet(s, sub))  # an empty packet, no student pages


def list_pending_submissions() -> str:
    """Handwritten work waiting for feedback (status pending or error)."""
    with db() as s:
        rows = [x for st in ("pending", "error") for x in services.submissions(s, status=st)]
        if not rows:
            return "Nothing is waiting for review."
        out = []
        for sub in sorted(rows, key=lambda x: x.created_at):
            problem = s.get(Problem, sub.problem_id) if sub.problem_id else None
            pages = sum(len(f["pages"]) for f in sub.files)
            out.append(f"- submission {sub.id} · {problem.label if problem else 'no problem'} · "
                       f"{pages} page(s) · {sub.created_at:%Y-%m-%d %H:%M} · {sub.status}")
        return "\n".join(out)


def get_submission(submission_id: int) -> list:
    """The full review packet for one submission: instructions, problem, key, and his pages."""
    with db() as s:
        sub = s.get(Submission, submission_id)
        if sub is None:
            raise ValueError(f"No submission {submission_id}")
        packet = feedback.build_packet(s, sub)
        items = ["REVIEW INSTRUCTIONS\n" + feedback.SYSTEM_PROMPT
                 + "\nWhen done, call post_feedback with the fields described above."]
        items += _packet_content(packet)
        if sub.status == "reviewed":
            items.append(f"(Already reviewed: verdict {sub.verdict}. Posting again replaces it.)")
        return items


# ---- writing ------------------------------------------------------------------------------

def post_feedback(submission_id: int, transcription: str, verdict: str, feedback_text: str,
                  first_error: str = "", cause: str = "unclear", confidence: str = "medium",
                  legible: bool = True, answers: list[dict] | None = None) -> str:
    """Store your review of a submission.

    verdict: correct | partial | incorrect | unclear
    cause: concept | setup | algebra-sign | units | careless | none | unclear
    answers: [{"label", "student", "key", "match": "yes"|"no"|"unknown"}]
    """
    with db() as s:
        sub = s.get(Submission, submission_id)
        if sub is None:
            raise ValueError(f"No submission {submission_id}")
        feedback.apply_review(s, sub, {
            "transcription": transcription, "verdict": verdict, "feedback": feedback_text,
            "first_error": first_error, "cause": cause, "confidence": confidence,
            "legible": legible, "answers": answers or [],
        }, reviewer="claude_session", model="Claude (chat session)", actor="claude")
        return f"Saved feedback on submission {submission_id}: {sub.verdict}."


def mark_task_done(task_id: int, done: bool = True) -> str:
    """Tick (or untick) a checklist task by its id (ids are in get_overview / get_week)."""
    with db() as s:
        try:
            t = services.set_task_done(s, task_id, done, actor="claude")
        except LookupError as e:
            raise ValueError(str(e))
        return f"Task {t.id} {'done' if t.done_at else 'not done'}: {t.title}"


def log_study_session(course: str, minutes: int, note: str = "") -> str:
    """Log study time Connor spent (for example, working problems with you)."""
    with db() as s:
        c = _course(s, course)
        row = services.log_study(s, c.code, minutes, source="claude", note=note, actor="claude")
        return f"Logged {row.minutes} min of {c.name}."


def add_note(course: str, body: str, video_slug: str = "", t_sec: int | None = None,
             problem_slug: str = "") -> str:
    """Save a note for Connor, optionally pinned to a video time or a problem."""
    with db() as s:
        c = _course(s, course)
        video = services.video_by_slug(s, video_slug) if video_slug else None
        problem = services.problem_by_slug(s, problem_slug) if problem_slug else None
        if video_slug and video is None:
            raise ValueError(f"No video {video_slug!r}")
        if problem_slug and problem is None:
            raise ValueError(f"No problem {problem_slug!r}")
        note = services.add_note(s, c, body, video=video, t_sec=t_sec, problem=problem, actor="claude")
        return f"Saved note {note.id}."


def record_problem_result(problem_slug: str, result: str, note: str = "") -> str:
    """Record how a problem went when Connor worked it with you: solid | shaky | miss."""
    with db() as s:
        problem = services.problem_by_slug(s, problem_slug)
        if problem is None:
            raise ValueError(f"No problem {problem_slug!r}")
        services.rate_problem(s, problem, result, note, actor="claude")
        return f"Recorded {result} on {problem.label}."


def mark_video_watched(video_slug: str, watched: bool = True) -> str:
    """Mark a lecture video watched (this also ticks its checklist task)."""
    with db() as s:
        video = services.video_by_slug(s, video_slug)
        if video is None:
            raise ValueError(f"No video {video_slug!r}")
        services.set_watched(s, video, watched, actor="claude")
        return f"{video.title}: {'watched' if watched else 'not watched'}."


def list_due_reviews() -> str:
    """Mistakes due for a cold re-solve today (spaced review), oldest first, mixed across courses."""
    with db() as s:
        items = review.due_items(s)
        if not items:
            return "No reviews due today."
        out = [f"{len(items)} due (about {review.MINUTES_PER_ITEM} min each; daily budget "
               f"{review.DAILY_BUDGET_MIN} min):"]
        for m in items:
            p = s.get(Problem, m.problem_id)
            out.append(f"- mistake {m.id} · {p.slug} · {p.label} · box {m.box} · due {m.due}"
                       f"{' · ' + m.cause if m.cause else ''}{' · ' + m.note if m.note else ''}")
        return "\n".join(out)


def list_mistakes(course: str = "") -> str:
    """The mistake log (open and retired), optionally for one course, with cause counts."""
    with db() as s:
        c = _course(s, course) if course else None
        rows = review.all_mistakes(s, c)
        if not rows:
            return "The mistake log is empty."
        out = []
        for m in rows:
            p = s.get(Problem, m.problem_id)
            state = "retired" if m.retired_at else f"box {m.box}, due {m.due}"
            out.append(f"- mistake {m.id} · {p.label} ({p.slug}) · {state} · cause {m.cause or '?'} · "
                       f"{m.reviews} reviews · {m.note}")
        courses = [c] if c else services.courses(s)
        for co in courses:
            out.append(f"{co.name} causes: {review.cause_counts(s, co)}")
        return "\n".join(out)


def add_mistake(problem_slug: str, cause: str = "", note: str = "") -> str:
    """Put a problem in the mistake log (for example, one Connor got wrong while working with you).

    cause: concept | setup | algebra-sign | units | careless | unclear
    """
    with db() as s:
        p = services.problem_by_slug(s, problem_slug)
        if p is None:
            raise ValueError(f"No problem {problem_slug!r}")
        if cause and cause not in feedback.CAUSES:
            raise ValueError(f"cause must be one of {feedback.CAUSES}")
        m = review.add_mistake(s, p, source="claude", cause=cause, note=note, actor="claude")
        return f"Mistake {m.id}: {p.label} in box {m.box}, due {m.due}."


def record_review_outcome(mistake_id: int, outcome: str, note: str = "") -> str:
    """Record a cold re-solve of a logged mistake: solid | shaky | miss (moves it on the ladder)."""
    with db() as s:
        m = s.get(Mistake, mistake_id)
        if m is None:
            raise ValueError(f"No mistake {mistake_id}")
        review.record_review(s, m, outcome, note, actor="claude")
        state = "retired" if m.retired_at else f"box {m.box}, next review {m.due}"
        return f"Recorded {outcome}: {state}."


def recent_activity(limit: int = 20) -> str:
    """The latest changes in Homebase, including ones made by Claude."""
    with db() as s:
        return "\n".join(f"{a.at:%Y-%m-%d %H:%M} [{a.actor}] {a.summary}"
                         for a in services.recent_activity(s, limit)) or "No activity yet."


TOOLS = [get_overview, get_week, get_progress, list_problems, get_problem,
         list_pending_submissions, get_submission, post_feedback, mark_task_done,
         log_study_session, add_note, record_problem_result, mark_video_watched,
         list_due_reviews, list_mistakes, add_mistake, record_review_outcome, recent_activity]
for fn in TOOLS:
    mcp.tool()(fn)


def main():
    init_db()  # create or upgrade tables; content is loaded by the web app
    mcp.run("stdio")


if __name__ == "__main__":
    main()
