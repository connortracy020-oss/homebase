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

from . import config, exams, feedback, review, services
from .db import get_engine, init_db
from .models import Course, ExamAttempt, Mistake, Problem, ProblemSet, Submission, Task

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
- Timed practice exams: when a pending submission is a timed exam, get_submission returns the \
whole exam with its official solutions; suggest per-problem points with post_exam_grades. He \
enters the final scores himself.
- Spaced review: list_due_reviews shows today's cold re-solves. Have him re-solve without \
notes before showing any key, then record_review_outcome (solid / shaky / miss).
- Everything you change is shown to him as done by Claude.

Notes (his organized notebooks, one per course). When he shares a screenshot (a lecture frame, slide or page) or asks you to add something to his notes:
1. Call notes_outline(course) to see the units and their topics. If he didn't say the course, use the video's course, else ask.
2. Write the content in your own words and equations; don't copy a slide's text word for word. Split it into blocks by kind:
   - an equation -> part "formulas" (body = LaTeX only; title = its name; where = what each symbol means, with units; when = when it applies). Set star=true only for core formulas worth an exam sheet.
   - a term and its meaning -> part "definitions" (title = the term)
   - a solved problem -> part "examples" (title, steps in body, answer)
   - a warning, common mistake or trick -> part "tips"
   - explanation and intuition -> part "ideas"
   - keep the screenshot itself only if a figure matters (kind "image" with image_path)
3. Unit = the term week whose topic matches (a video's unit is its term week). Before adding a formula, notes_search for it; if it's there, notes_update that block instead of adding a duplicate.
4. If you're not sure where something goes, add it to unit "inbox" with suggested_unit and suggested_part.
5. Link each block to its source: video_slug + t_sec when he names the video or time.
6. Then tell him exactly what you added and where (unit and part).

Interactive illustrations (notes_add kind="interactive") - when a picture you can play with \
teaches better than text (vectors, fields, phasors, circuits as values change, sampling, \
convolution, transients, surfaces), or when he asks for one:
- body: one self-contained HTML snippet (no <html>/<head>): markup + <style> + <script>. It runs \
in a locked sandbox: no network, no access to Homebase; only libraries from \
https://cdn.jsdelivr.net/npm/... can be loaded (pin versions). Plain SVG or <canvas> is best. \nGive SVG a pixel-sized viewBox (e.g. 0 0 320 240), set stroke widths and font sizes in those pixels, \nand cap its width (max-width ~360px) so it doesn't fill a wide screen.
- Make it interactive: sliders, drag handles or buttons, with live readouts that use units.
- Use the theme: CSS variables var(--ink) var(--ink-soft) var(--surface) var(--sunken) \
var(--line) var(--accent) (the course color) var(--moss) var(--ochre) var(--brick) var(--plum) \
var(--slate). For canvas, read them with HB.color('--ink') and redraw in HB.onTheme(fn) (light/dark).
- Size: fit 100% width, keep it under about 450px tall; it must work on a phone (touch: use \
pointer events). Math labels: write \\( \\) and call HB.math() once.
- Get the physics and math right (it's study material): check formulas and signs, label axes.
- description (required): 2-4 sentences: what it shows, what to try, what to notice.
- Put it in the part it explains (usually "ideas" or "examples") of the matching unit.

Circuit Bench (the circuits he draws and simulates in Homebase): circuits_list, circuits_get, \
circuits_save, circuits_attempts. A circuit is a JSON document:
{"format": "homebase-circuit", "version": 1, "title", "course", "parts": [{"id", "type", "x", "y", \
"rot", "flip", "params"}], "wires": [{"id", "a": [x, y], "b": [x, y]}], "study": {"predict": true}}
- x, y are whole grid units; y grows downward. rot = quarter turns clockwise.
- Two-terminal parts (R C L V I E F G H SW AM VM) have pin a at (x, y) and pin b 4 units on: \
rot 0 -> (x+4, y), rot 1 -> (x, y+4) (vertical, a on top), rot 2 -> (x-4, y), rot 3 -> (x, y-4). \
Other parts turn the same way about (x, y).
- V, E, H: pin a is the + terminal. I, G, F: the arrow points at pin a (the current leaves the \
source there).
- OA (op-amp) at rot 0: - input (x, y-1), + input (x, y+1), output (x+5, y). GND and LBL (net \
label) have one pin at (x, y). SW2: common (x, y), throw 1 (x+4, y-1), throw 2 (x+4, y+1). \
K (coupled coils) and TR (ideal transformer) at rot 0: primary p1 (x, y) and p2 (x, y+4), \
secondary s1 (x+4, y) and s2 (x+4, y+4); the primary's dot is at p1. V3Y (three-phase, Y) at \
rot 0: a (x+4, y), b (x+4, y+2), c (x+4, y+4), neutral n (x, y+2); V3D (Δ) has a, b, c only.
- A wire is one straight segment. Points joined by wires are one node; a wire end or a pin that \
lands inside another wire joins it; wires that only cross don't. LBLs with the same name are one \
node. Use one GND: the node it touches is 0 V.
- params are text with SI prefixes ("4.7k", "2m", "10u", "1meg"; m is milli): R {R}; C {C, v0}; \
L {L, i0}; V {wave: "dc", V}, a step {wave: "step", V0, V1, at}, a pulse {wave: "pulse", V0, \
V1, td, tr, tf, pw, per} or a sine {wave: "sine", Vm, scale: "peak" or "rms", funit: "rad/s" \
with w or "Hz" with f, ph (degrees, cosine reference: Vdc + Vm cos(ωt + ph)), Vdc}; I the same \
with I, I0, I1, Im, Idc. K {L1, L2, spec: "k" with k or "M" with M, dot: "top" (the secondary's \
dot at s1) or "bottom", i10, i20}; TR {n (N1/N2), dot}; V3Y and V3D {V3m (V3D: the line \
voltage), scale (default "rms"), funit (default "Hz") with f or w, ph (of a), seq: "abc" or \
"acb"}. E (gain), G (A/V), H (ohms), F (gain): \
{gain, ctrl, cname} where ctrl is "v(R2)" (across R2: its pin a minus pin b), "i(R2)" (into R2's \
pin a), "v(Vx)" (a labelled node against ground) or "v(Vx, Vy)", with a leading "-" to flip it, \
and cname is the name the problem uses (vx, ix). OA {model: "ideal" or "gain", A, rout}; \
SW {state: "closed" or "open", at: when it flips}; SW2 {state: "1" or "2", at}; LBL {name}.
- study.predict = true makes him commit a prediction before the bench shows a value.
- circuits_save solves the drawing with the bench's own solver and returns the nodes it found \
(with every part terminal on each) and the solution: DC (a sine source counts only its offset \
there) and, with sine sources, the AC steady state as peak phasors. Read it and make sure it's the circuit you \
meant before you tell him it's ready. To change an existing circuit, pass the base_rev that \
circuits_get showed, so you never overwrite a change he made since.
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
            if sub.exam_attempt_id:
                what = f"timed exam (exam attempt {sub.exam_attempt_id}; grade it with post_exam_grades)"
            else:
                what = problem.label if problem else "no problem"
            out.append(f"- submission {sub.id} · {what} · "
                       f"{pages} page(s) · {sub.created_at:%Y-%m-%d %H:%M} · {sub.status}")
        return "\n".join(out)


def get_submission(submission_id: int) -> list:
    """The full review packet for one submission: instructions, problem, key, and his pages."""
    with db() as s:
        sub = s.get(Submission, submission_id)
        if sub is None:
            raise ValueError(f"No submission {submission_id}")
        if sub.exam_attempt_id:
            attempt = s.get(ExamAttempt, sub.exam_attempt_id)
            items = ["EXAM GRADING INSTRUCTIONS\n" + exams.EXAM_SYSTEM_PROMPT
                     + f"\nWhen done, call post_exam_grades(attempt_id={attempt.id}, ...) with one "
                       "entry per problem number."]
            return items + _packet_content(exams.build_packet(s, attempt))
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


def post_exam_grades(attempt_id: int, problems: list[dict], feedback_text: str,
                     legible: bool = True, confidence: str = "medium") -> str:
    """Suggest grades for a timed practice exam. Connor makes the final call.

    problems: [{"number": 1, "points_awarded": 18, "comment": "...", "first_error": "...",
                "cause": "concept|setup|algebra-sign|units|careless|none|unclear"}]
    """
    with db() as s:
        attempt = s.get(ExamAttempt, attempt_id)
        if attempt is None:
            raise ValueError(f"No exam attempt {attempt_id}")
        exams.apply_review(s, attempt, {"problems": problems, "feedback": feedback_text,
                                        "legible": legible, "confidence": confidence},
                           reviewer="claude_session", model="Claude (chat session)", actor="claude")
        total = sum(v["points"] for v in attempt.suggested.values())
        return f"Saved suggested grades: {total:g}/{attempt.max_points}. He confirms them in Homebase."


def list_exams(course: str = "") -> str:
    """Practice exams set up in Homebase, with time limits and Connor's latest scores."""
    with db() as s:
        c = _course(s, course) if course else None
        out = []
        for e in exams.exams_for(s, c):
            graded = [a for a in exams.attempts_of(s, e) if a.status == "graded"]
            last = f"last {graded[0].total:g}/{graded[0].max_points}" if graded else "not taken"
            out.append(f"- {e.slug} · {e.title} · term wk {e.course_week} · {e.time_min} min · "
                       f"{e.total_points} pts · {last}")
        return "\n".join(out) or "No exams yet."


def recent_activity(limit: int = 20) -> str:
    """The latest changes in Homebase, including ones made by Claude."""
    with db() as s:
        return "\n".join(f"{a.at:%Y-%m-%d %H:%M} [{a.actor}] {a.summary}"
                         for a in services.recent_activity(s, limit)) or "No activity yet."


# ---- Notes: the organized notebooks ------------------------------------------------------------

def _notebook(s, course: str):
    from . import notes
    return notes.notebook_for(s, _course(s, course))


def notes_outline(course: str) -> str:
    """The notebook for one course: its units (with their topics) and how many blocks each
    part holds. Read this first to decide where new notes go."""
    from . import notes
    with db() as s:
        nb = _notebook(s, course)
        lines = [f"{nb.title}. Parts in every unit: " + ", ".join(f"{k} ({n})" for k, n in notes.PARTS) + "."]
        for o in notes.outline(s, nb):
            u = o["unit"]
            ref = "inbox" if u.kind == "inbox" else (str(u.term_week) if u.term_week else f"id:{u.id}")
            parts = ", ".join(f"{p['key']} {p['count']}" for p in o["parts"] if p["count"]) or "empty"
            topics = f" — topics: {', '.join(u.topics)}" if u.topics else ""
            lines.append(f"- unit {ref}: {u.title}{topics} [{parts}]")
        return "\n".join(lines)


def notes_search(query: str, course: str = "") -> str:
    """Find existing note blocks (title, text or LaTeX). Use it before adding a formula,
    so you add to an existing card instead of making a duplicate."""
    from . import notes
    from .models import NoteUnit
    with db() as s:
        nb = _notebook(s, course) if course else None
        rows = notes.search(s, query, nb)
        if not rows:
            return "No matches."
        out = []
        for b in rows:
            u = s.get(NoteUnit, b.unit_id)
            body = b.body.replace("\n", " ")[:120]
            out.append(f"- block {b.id} [{b.kind}] in {u.title} · {notes.PART_NAMES[b.part]}: {b.title + ': ' if b.title else ''}{body}")
        return "\n".join(out)


def notes_add(course: str, unit: str, part: str, body: str, kind: str = "", title: str = "",
              where: str = "", when: str = "", answer: str = "", video_slug: str = "", t_sec: int | None = None,
              source_label: str = "", source_url: str = "", image_path: str = "", star: bool = False,
              suggested_unit: str = "", suggested_part: str = "", description: str = "") -> str:
    """Add one block of notes.

    unit: a term-week number ("4"), a unit title, or "inbox". part: ideas, definitions,
    formulas, examples or tips. kind defaults from the part (formula, definition, example,
    tip, text); use "image" with image_path to keep a screenshot. For a formula, body is the
    LaTeX equation only (no $), title its name, where = what the symbols mean, when = when to
    use it. For an example, answer = the final answer. Math in other text goes in \\( \\).
    video_slug + t_sec link the note back to the lecture at that time. When unsure where it
    goes, use unit "inbox" with suggested_unit / suggested_part.

    kind "interactive" = an interactive illustration: body is a self-contained HTML snippet
    with its own <script> (see the rules in the server instructions), title names it, and
    description (required) says what it shows, what to try and the takeaway."""
    from . import notes
    with db() as s:
        nb = _notebook(s, course)
        u = notes.unit_by_ref(s, nb, unit)
        source = {}
        if video_slug:
            if services.video_by_slug(s, video_slug) is None:
                raise ValueError(f"No video {video_slug!r}")
            source = {"video_slug": video_slug, "t": t_sec}
        elif source_label or source_url:
            source = {"label": source_label, "url": source_url}
        asset = ""
        if image_path:
            from pathlib import Path
            path = Path(image_path)
            if not path.is_file():
                raise ValueError(f"No image file at {image_path}")
            asset = notes.save_asset(path.read_bytes(), path.name)
            kind = kind or "image"
        k = kind or notes.DEFAULT_KIND.get(part, "text")
        if k == "formula":
            dup = notes.similar_formula(s, nb, body)
            if dup is not None:
                return (f"Not added: block {dup.id} already has this formula ({dup.title or dup.body}). "
                        f"Use notes_update(block_id={dup.id}, ...) to add the new detail or source instead.")
        suggested = {}
        if u.kind == "inbox" and suggested_unit:
            su = notes.unit_by_ref(s, nb, suggested_unit)
            suggested = {"unit_id": su.id, "part": suggested_part or part}
        if k == "interactive" and not description.strip():
            raise ValueError("An interactive illustration needs a description: what it shows, what to try, the takeaway.")
        extra = {k2: v for k2, v in (("where", where), ("when", when), ("answer", answer),
                                     ("description", description)) if v}
        b = notes.add_block(s, u, part, k, body, title, extra=extra, source=source, asset=asset, starred=star,
                            suggested=suggested, actor="claude")
        return f"Added block {b.id} ({b.kind}) to {u.title} · {notes.PART_NAMES[part]}."


def notes_update(block_id: int, body: str | None = None, title: str | None = None, where: str | None = None,
                 when: str | None = None, answer: str | None = None, video_slug: str = "", t_sec: int | None = None,
                 description: str | None = None) -> str:
    """Change a block: new text, title, or formula details. Giving video_slug adds a second source
    (the block keeps its first one and lists this one in its details)."""
    from . import notes
    from .models import NoteBlock
    with db() as s:
        b = s.get(NoteBlock, block_id)
        if b is None or b.deleted_at:
            raise ValueError(f"No block {block_id}")
        extra = dict(b.extra or {})
        for key, val in (("where", where), ("when", when), ("answer", answer), ("description", description)):
            if val is not None:
                extra[key] = val
        if video_slug:
            if services.video_by_slug(s, video_slug) is None:
                raise ValueError(f"No video {video_slug!r}")
            extra.setdefault("also_from", []).append({"video_slug": video_slug, "t": t_sec})
        notes.update_block(s, b, actor="claude", body=body, title=title, extra=extra)
        return f"Updated block {block_id}."


def notes_move(block_id: int, unit: str, part: str, course: str = "") -> str:
    """Move a block to another unit and/or part (for example out of the Inbox)."""
    from . import notes
    from .models import NoteBlock, NoteUnit, Notebook
    with db() as s:
        b = s.get(NoteBlock, block_id)
        if b is None:
            raise ValueError(f"No block {block_id}")
        nb = _notebook(s, course) if course else s.get(Notebook, s.get(NoteUnit, b.unit_id).notebook_id)
        u = notes.unit_by_ref(s, nb, unit)
        notes.move_block(s, b, u, part, actor="claude")
        return f"Moved block {block_id} to {u.title} · {notes.PART_NAMES[part]}."


def notes_add_unit(course: str, title: str, after_unit: str = "", topics: list[str] | None = None) -> str:
    """Add a unit when nothing in the outline fits (rare: the units follow the term weeks)."""
    from . import notes
    with db() as s:
        nb = _notebook(s, course)
        after = notes.unit_by_ref(s, nb, after_unit) if after_unit else None
        u = notes.add_unit(s, nb, title, after=after, topics=topics or [], actor="claude")
        return f"Added unit {u.id}: {u.title}."


# ---- Circuit Bench ---------------------------------------------------------------------------

def _circuit(s, slug: str):
    from . import circuits
    c = circuits.get_circuit(s, slug)
    if c is None:
        raise ValueError(f"No circuit {slug!r}; use circuits_list to find slugs.")
    return c


def _bench_solve(doc: dict) -> dict | None:
    """Solve a drawing with the bench's own code (scripts/bench_solve.mjs). None without Node."""
    import json
    import shutil
    import subprocess
    import tempfile
    from pathlib import Path
    node = shutil.which("node")
    if node is None:
        return None
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "circuit.json"
        path.write_text(json.dumps(doc), encoding="utf-8")
        r = subprocess.run([node, str(config.ROOT / "scripts" / "bench_solve.mjs"), str(path)],
                           capture_output=True, text=True, encoding="utf-8", timeout=60)
    if r.returncode != 0:
        return {"ok": False, "errors": ["The bench's solver crashed: " + r.stderr.strip()[-400:]],
                "warnings": [], "nodes": [], "parts": {}, "netlist": None}
    return json.loads(r.stdout)


_PREFIXES = [(1e9, "G"), (1e6, "M"), (1e3, "k"), (1, ""), (1e-3, "m"), (1e-6, "µ"), (1e-9, "n"), (1e-12, "p")]


def _si(x, unit: str) -> str:
    if x is None:
        return "?"
    if x == 0:
        return f"0 {unit}"
    scale, prefix = next(((k, p) for k, p in _PREFIXES if abs(x) >= k * 0.9995), _PREFIXES[-1])
    return f"{x / scale:.4g} {prefix}{unit}"


def _exact(text) -> str:
    """The exact value too, when it's a fraction the decimal doesn't show."""
    return f" (= {text})" if text and "/" in str(text) else ""


def _phasor(z, unit: str, exact=None) -> str:
    """A peak phasor [re, im] in polar form, with the exact rectangular form when there is one."""
    import math
    if z is None:
        return "?"
    m = math.hypot(z[0], z[1])
    if m < 1e-15:
        return f"0 {unit}"
    text = f"{_si(m, unit)}∠{math.degrees(math.atan2(z[1], z[0])):.2f}°"
    if exact:
        re, im = exact
        text += f" (= {re} {'-' if im.startswith('-') else '+'} j{im.lstrip('-')} exactly)"
    return text


def _ac_lines(ac: dict) -> list[str]:
    import math
    if not ac["ok"]:
        return ["AC steady state: the bench can't solve it yet:"] + [f"- error: {e}" for e in ac["errors"]]
    w = ac["omega"]
    out = [f"AC steady state at ω = {w:.6g} rad/s (f = {w / (2 * math.pi):.6g} Hz): peak phasors, cosine "
           f"reference, {'exact' if ac.get('exact') else 'decimals'}:"]
    if ac.get("off"):
        out.append(f"- {', '.join(ac['off'])} run at another frequency, so they're off in this solution.")
    out += [f"- node {n['name']}: {_phasor(n['v'], 'V', n.get('vx'))}" for n in ac["nodes"] if n["index"] > 0]
    out.append("Parts (V = pin a minus pin b; I = into pin a; P + jQ = ½ V I*, absorbed):")
    for pid, e in ac["parts"].items():
        s = e.get("s") or [0, 0]
        line = (f"- {pid}: V {_phasor(e['v'], 'V', e.get('vx'))}, I {_phasor(e['i'], 'A', e.get('ix'))}, "
                f"P {_si(s[0], 'W')}, Q {_si(s[1], 'VAR')}")
        if e.get("pins"):
            line += "; into each pin: " + ", ".join(f"{p['pin']} {_phasor(p['i'], 'A')}" for p in e["pins"])
        out.append(line)
    out += [f"- warning: {w}" for w in ac.get("warnings", [])]
    return out


def _solution_lines(r: dict | None) -> list[str]:
    if r is None:
        return ["Not checked: Node isn't installed, so only the bench can solve it (it does when he opens it)."]
    out = []
    if r["ok"]:
        dc = " DC solution (a sine source counts only its offset there)." if r.get("ac") else ""
        out.append(f"The bench solves it ({'exact fractions' if r.get('exact') else 'decimals'}).{dc} Nodes it found:")
    else:
        out.append("The bench can't solve it yet:")
        out += [f"- error: {e}" for e in r["errors"]]
        if r["nodes"]:
            out.append("Nodes it found:")
    for n in r["nodes"]:
        v = f" = {_si(n.get('v'), 'V')}{_exact(n.get('vx'))}" if r["ok"] else ""
        out.append(f"- {n['name']}{' (ground, 0 V)' if n['ground'] else v}: {', '.join(n['pins']) or 'no terminals'}")
    if r["ok"] and r["parts"]:
        out.append("Parts (v = pin a minus pin b; i = current into pin a, through the part to b; "
                   "p = power absorbed, negative = delivering):")
        for pid, e in r["parts"].items():
            out.append(f"- {pid}: v {_si(e['v'], 'V')}{_exact(e.get('vx'))}, i {_si(e['i'], 'A')}{_exact(e.get('ix'))}, "
                       f"p {_si(e['p'], 'W')}")
    out += [f"- warning: {w}" for w in r.get("warnings", [])]
    if r.get("idle"):
        out.append(f"Set aside (not connected to the rest, or only through capacitors at DC): {', '.join(r['idle'])}")
    if r.get("ac"):
        out += _ac_lines(r["ac"])
    if r.get("netlist"):
        out += ["SPICE netlist:", r["netlist"].rstrip()]
    return out


def _summary(r: dict | None) -> dict | None:
    """The bench's saved-summary shape (what the browser stores after each solve)."""
    if r is None:
        return None
    if not r["ok"]:
        return {"ok": False, "errors": r["errors"][:5]}
    return {"ok": True, "exact": r.get("exact", False),
            "nodes": {n["name"]: n.get("vx") or n.get("v") for n in r["nodes"]},
            "parts": {k: {"v": e.get("vx") or e["v"], "i": e.get("ix") or e["i"], "p": e.get("px") or e["p"]}
                      for k, e in r["parts"].items()}}


def _circuit_head(s, c) -> str:
    course = s.get(Course, c.course_id).code if c.course_id else "no course"
    week = f" wk {c.week}" if c.week else ""
    problem = s.get(Problem, c.problem_id) if c.problem_id else None
    who = {"you": "Connor", "claude": "Claude"}
    origin = f" · from problem {problem.slug}" if problem else f" · made by {who.get(c.source, c.source)}"
    return (f"{c.slug} · {c.title} ({course}{week}){origin} · rev {c.rev} · {len(c.doc.get('parts', []))} parts · "
            f"saved {c.updated_at:%Y-%m-%d %H:%M} by {who.get(c.updated_by, c.updated_by)}{' · archived' if c.archived else ''}")


def circuits_list(course: str = "", archived: bool = False) -> str:
    """Connor's Circuit Bench circuits, newest first (archived ones with archived=True)."""
    from . import circuits
    with db() as s:
        c_id = _course(s, course).id if course else None
        rows = [c for c in circuits.list_circuits(s, archived=archived) if c_id is None or c.course_id == c_id]
        return "\n".join("- " + _circuit_head(s, c) for c in rows) or "No circuits yet."


def circuits_get(circuit_slug: str) -> str:
    """One circuit: its document (JSON), the nodes the bench finds in it, its SPICE netlist, the
    DC solution, and his latest predictions on it."""
    import json
    from . import circuits
    with db() as s:
        c = _circuit(s, circuit_slug)
        lines = [_circuit_head(s, c), f"Document (base_rev for circuits_save: {c.rev}):",
                 json.dumps({k: v for k, v in c.doc.items() if k != "view"}, separators=(",", ":"))]
        lines += _solution_lines(_bench_solve(c.doc))
        tries = circuits.attempts(s, c, 10)
        if tries:
            lines.append("His latest predictions and checks on it:")
            lines += [_attempt_line(a) for a in tries]
        return "\n".join(lines)


def circuits_save(doc: dict, circuit_slug: str = "", base_rev: int | None = None, title: str = "",
                  course: str = "ECE201", week: int | None = None, problem_slug: str = "") -> str:
    """Make a new circuit (no circuit_slug) or save a new version of one (circuit_slug plus the
    base_rev circuits_get showed). doc is the circuit document described in the server
    instructions. problem_slug links a new circuit to the problem it draws. Returns what the
    bench finds in the drawing: check it is the circuit you meant."""
    from . import circuits
    with db() as s:
        r = _bench_solve(doc)
        try:
            if circuit_slug:
                c = _circuit(s, circuit_slug)
                if base_rev is None:
                    raise ValueError(f"Pass base_rev (the rev circuits_get showed; it is now {c.rev}) "
                                     "so a change Connor made since isn't overwritten.")
                c = circuits.save_circuit(s, c, {**doc, "view": c.doc.get("view", {})} if "view" not in doc else doc,
                                          base_rev, summary=_summary(r) if r is not None else {}, actor="claude")
                head = f"Saved circuit {c.slug} (now rev {c.rev})."
            else:
                problem = services.problem_by_slug(s, problem_slug) if problem_slug else None
                if problem_slug and problem is None:
                    raise ValueError(f"No problem {problem_slug!r}")
                c = circuits.create_circuit(s, title or doc.get("title") or "Untitled circuit", course.replace(" ", ""),
                                            doc, source="claude", week=week,
                                            problem_id=problem.id if problem else None, actor="claude")
                if r is not None:
                    c.summary = _summary(r)
                    s.add(c)
                    s.commit()
                head = f"Made circuit {c.slug}: {c.title}. He opens it at /circuits/{c.slug}."
        except circuits.Conflict as e:
            raise ValueError(f"{e}. Call circuits_get again and redo your change on that version.")
        return "\n".join([head] + _solution_lines(r))


def _attempt_line(a) -> str:
    kind = "predicted" if a.kind == "predict" else "checked"
    tags = f" · tags {', '.join(a.tags)}" if a.tags else ""
    note = f" · {a.note}" if a.note else ""
    return (f"- {a.at:%Y-%m-%d %H:%M} {kind} {a.quantity}: guessed {a.guess:.4g}, the circuit gives {a.truth:.4g} · "
            f"{'right' if a.correct else 'off'}{tags}{note}")


def circuits_attempts(circuit_slug: str = "", limit: int = 30) -> str:
    """His predictions and hand checks on the bench (all circuits, or one), newest first: what he
    guessed, what the circuit gives, and the mistake tags."""
    from sqlmodel import col
    from . import circuits
    from .models import Circuit, CircuitAttempt
    with db() as s:
        if circuit_slug:
            c = _circuit(s, circuit_slug)
            rows = [(c, a) for a in circuits.attempts(s, c, limit)]
        else:
            q = select(CircuitAttempt, Circuit).join(Circuit, col(Circuit.id) == col(CircuitAttempt.circuit_id))
            rows = [(c, a) for a, c in s.exec(q.order_by(col(CircuitAttempt.at).desc()).limit(limit)).all()]
        if not rows:
            return "No predictions yet."
        right = sum(a.correct for _, a in rows)
        out = [f"{right} of {len(rows)} right."]
        for c, a in rows:
            out.append(_attempt_line(a) + ("" if circuit_slug else f" · on {c.title} ({c.slug})"))
        return "\n".join(out)


TOOLS = [get_overview, get_week, get_progress, list_problems, get_problem,
         list_pending_submissions, get_submission, post_feedback, mark_task_done,
         log_study_session, add_note, record_problem_result, mark_video_watched,
         list_due_reviews, list_mistakes, add_mistake, record_review_outcome,
         list_exams, post_exam_grades, recent_activity,
         notes_outline, notes_search, notes_add, notes_update, notes_move, notes_add_unit,
         circuits_list, circuits_get, circuits_save, circuits_attempts]
for fn in TOOLS:
    mcp.tool()(fn)


def main():
    init_db()  # create or upgrade tables; content is loaded by the web app
    mcp.run("stdio")


if __name__ == "__main__":
    main()
