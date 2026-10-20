"""What the app does, as plain functions.

Pages, the JSON API and (later) the Claude MCP server all call these, so
every change goes through one place and lands in the activity log.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlmodel import Session, func, select

from . import config
from .generators import check_answer
from .models import (ActivityLog, Attempt, Chapter, Course, CourseWeek, Note, PrepWeek, Problem,
                     ProblemSet, Reading, Resource, StudySession, Submission, Task, Video)

TERM_START = date(2027, 1, 4)  # Winter 2027, week 1 Monday
TERM_WEEKS = 10
FINALS_END = date(2027, 3, 19)


# ---- where are we in the calendar? ------------------------------------------

@dataclass
class Phase:
    name: str  # "before" | "prep" | "term" | "finals" | "after"
    prep_week: PrepWeek | None = None
    term_week: int | None = None

    @property
    def label(self) -> str:
        if self.name == "prep" and self.prep_week:
            pw = self.prep_week
            extra = f" · {pw.label}" if pw.label else ""
            return f"Prep week {pw.number} of 11{extra}"
        if self.name == "term":
            return f"Winter term, week {self.term_week}"
        return {"before": "Before prep starts", "finals": "Winter finals week",
                "after": "Winter term is over"}.get(self.name, self.name)


def phase_for(session: Session, day: date) -> Phase:
    prep = session.exec(
        select(PrepWeek).where(PrepWeek.start <= day, PrepWeek.end >= day)
    ).first()
    if prep:
        return Phase("prep", prep_week=prep)
    first = session.exec(select(PrepWeek).order_by(PrepWeek.start)).first()
    if first and day < first.start:
        return Phase("before")
    if TERM_START <= day:
        week = (day - TERM_START).days // 7 + 1
        if week <= TERM_WEEKS:
            return Phase("term", term_week=week)
        return Phase("finals" if day <= FINALS_END else "after")
    return Phase("before")


# ---- lookups ------------------------------------------------------------------

def courses(session: Session) -> list[Course]:
    return list(session.exec(select(Course).order_by(Course.priority)))


def course_by_code(session: Session, code: str) -> Course | None:
    return session.exec(select(Course).where(Course.code == code.upper())).first()


def prep_weeks(session: Session) -> list[PrepWeek]:
    return list(session.exec(select(PrepWeek).order_by(PrepWeek.number)))


def course_weeks(session: Session, course: Course) -> list[CourseWeek]:
    return list(session.exec(
        select(CourseWeek).where(CourseWeek.course_id == course.id).order_by(CourseWeek.number)))


def tasks_for_prep_week(session: Session, prep: PrepWeek) -> list[Task]:
    return list(session.exec(
        select(Task).where(Task.prep_week_id == prep.id).order_by(Task.order)))


def tasks_for_course_week(session: Session, course: Course, number: int) -> list[Task]:
    return list(session.exec(
        select(Task).where(Task.course_id == course.id, Task.course_week == number)
        .order_by(Task.prep_week_id, Task.order)))


# ---- changes (all logged) -----------------------------------------------------

def log(session: Session, actor: str, action: str, summary: str, **data) -> None:
    session.add(ActivityLog(at=config.now(), actor=actor, action=action,
                            summary=summary, data=data))


def set_task_done(session: Session, task_id: int, done: bool, actor: str = "app") -> Task:
    task = session.get(Task, task_id)
    if task is None:
        raise LookupError(f"no task {task_id}")
    if done and task.done_at is None:
        task.done_at, task.done_by = config.now(), actor
        log(session, actor, "task.done", f"Done: {task.title}", task_id=task.id)
        if task.ref_kind == "video":  # ticking a watch task marks the video watched
            video = video_by_slug(session, task.ref)
            if video and video.watched_at is None:
                video.watched_at = config.now()
    elif not done and task.done_at is not None:
        task.done_at, task.done_by = None, ""
        log(session, actor, "task.undone", f"Unchecked: {task.title}", task_id=task.id)
    session.commit()
    session.refresh(task)
    return task


def log_study(session: Session, course_code: str, minutes: int, source: str = "manual",
              note: str = "", started_at: datetime | None = None,
              actor: str = "app") -> StudySession:
    course = course_by_code(session, course_code)
    if course is None:
        raise LookupError(f"no course {course_code}")
    if not 1 <= minutes <= 12 * 60:
        raise ValueError("minutes must be between 1 and 720")
    started = started_at or (config.now() - timedelta(minutes=minutes))
    row = StudySession(course_id=course.id, started_at=started, minutes=minutes,
                       source=source, note=note)
    session.add(row)
    log(session, actor, "session.log", f"{minutes} min of {course.name} ({source})",
        course=course.code, minutes=minutes)
    session.commit()
    session.refresh(row)
    return row


def delete_study(session: Session, study_id: int, actor: str = "app") -> None:
    row = session.get(StudySession, study_id)
    if row is None:
        raise LookupError(f"no study session {study_id}")
    session.delete(row)
    log(session, actor, "session.delete", f"Deleted a {row.minutes}-min study entry",
        study_id=study_id)
    session.commit()


# ---- progress -----------------------------------------------------------------

@dataclass
class CourseProgress:
    course: Course
    tasks_done: int = 0
    tasks_total: int = 0
    minutes: int = 0
    planned_minutes: int = 0
    week_minutes: dict[int, int] = field(default_factory=dict)  # prep week -> minutes

    @property
    def pct(self) -> int:
        return round(100 * self.tasks_done / self.tasks_total) if self.tasks_total else 0


def minutes_between(session: Session, course_id: int, start: date, end: date) -> int:
    lo = datetime.combine(start, datetime.min.time())
    hi = datetime.combine(end + timedelta(days=1), datetime.min.time())
    total = session.exec(
        select(func.coalesce(func.sum(StudySession.minutes), 0)).where(
            StudySession.course_id == course_id,
            StudySession.started_at >= lo,
            StudySession.started_at < hi,
        )).one()
    return int(total)


def progress(session: Session) -> list[CourseProgress]:
    weeks = prep_weeks(session)
    out = []
    for course in courses(session):
        cp = CourseProgress(course)
        tasks = session.exec(select(Task).where(Task.course_id == course.id)).all()
        cp.tasks_total = len(tasks)
        cp.tasks_done = sum(1 for t in tasks if t.done_at)
        cp.minutes = int(session.exec(
            select(func.coalesce(func.sum(StudySession.minutes), 0))
            .where(StudySession.course_id == course.id)).one())
        for pw in weeks:
            cp.planned_minutes += pw.planned_minutes.get(course.code, 0)
            cp.week_minutes[pw.number] = minutes_between(session, course.id, pw.start, pw.end)
        out.append(cp)
    return out


# ---- videos and notes ---------------------------------------------------------------

def video_by_slug(session: Session, slug: str) -> Video | None:
    return session.exec(select(Video).where(Video.slug == slug)).first()


def videos_for_week(session: Session, course: Course, week: int) -> list[Video]:
    rows = session.exec(select(Video).where(Video.course_id == course.id, Video.osu_week == week)).all()
    # full lectures (mit..., lanterman...) sort before short YouTube videos (yt-...)
    return sorted(rows, key=lambda v: (v.priority != "core", v.slug.startswith("yt-"), v.slug))


def chapters(session: Session, video: Video) -> list[Chapter]:
    return list(session.exec(select(Chapter).where(Chapter.video_id == video.id).order_by(Chapter.t)))


def chapter_counts(session: Session, videos: list[Video]) -> dict[int, int]:
    ids = [v.id for v in videos]
    if not ids:
        return {}
    rows = session.exec(select(Chapter.video_id, func.count()).where(Chapter.video_id.in_(ids))
                        .group_by(Chapter.video_id)).all()
    return dict(rows)


def save_position(session: Session, video: Video, seconds: int) -> None:
    video.last_pos_sec = max(0, int(seconds))
    session.commit()


def set_watched(session: Session, video: Video, watched: bool, actor: str = "app") -> Video:
    if watched and video.watched_at is None:
        video.watched_at = config.now()
        log(session, actor, "video.watched", f"Watched: {video.title}", video=video.slug)
        for task in session.exec(select(Task).where(Task.ref_kind == "video", Task.ref == video.slug,
                                                    Task.done_at.is_(None))):
            task.done_at, task.done_by = config.now(), actor
    elif not watched and video.watched_at is not None:
        video.watched_at = None
        log(session, actor, "video.unwatched", f"Marked unwatched: {video.title}", video=video.slug)
    session.commit()
    session.refresh(video)
    return video


def notes_for(session: Session, video: Video | None = None, problem: Problem | None = None) -> list[Note]:
    q = select(Note)
    if video is not None:
        q = q.where(Note.video_id == video.id).order_by(Note.t_sec, Note.created_at)
    if problem is not None:
        q = q.where(Note.problem_id == problem.id).order_by(Note.created_at)
    return list(session.exec(q))


def add_note(session: Session, course: Course, body: str, video: Video | None = None,
             t_sec: int | None = None, problem: Problem | None = None, actor: str = "app") -> Note:
    body = body.strip()
    if not body:
        raise ValueError("a note can't be empty")
    now = config.now()
    note = Note(course_id=course.id, video_id=video.id if video else None, t_sec=t_sec,
                problem_id=problem.id if problem else None, body=body,
                created_at=now, updated_at=now, actor=actor)
    session.add(note)
    where = video.title if video else problem.label if problem else course.name
    log(session, actor, "note.add", f"Note on {where}", video=video.slug if video else None)
    session.commit()
    session.refresh(note)
    return note


def update_note(session: Session, note_id: int, body: str, actor: str = "app") -> Note:
    note = session.get(Note, note_id)
    if note is None:
        raise LookupError(f"no note {note_id}")
    if not body.strip():
        raise ValueError("a note can't be empty")
    note.body, note.updated_at = body.strip(), config.now()
    log(session, actor, "note.edit", "Edited a note", note_id=note_id)
    session.commit()
    session.refresh(note)
    return note


def delete_note(session: Session, note_id: int, actor: str = "app") -> None:
    note = session.get(Note, note_id)
    if note is None:
        raise LookupError(f"no note {note_id}")
    session.delete(note)
    log(session, actor, "note.delete", "Deleted a note", note_id=note_id)
    session.commit()


# ---- readings and problems ------------------------------------------------------------

def readings_for_week(session: Session, course: Course, week: int) -> list[tuple[Reading, Resource]]:
    rows = session.exec(select(Reading, Resource).join(Resource, Reading.resource_id == Resource.id)
                        .where(Reading.course_id == course.id, Reading.week == week)
                        .order_by(Reading.order)).all()
    return list(rows)


def local_file_exists(resource: Resource) -> bool:
    return bool(resource.local_path) and (config.ROOT / resource.local_path).exists()


def psets_for_week(session: Session, course: Course, week: int) -> list[ProblemSet]:
    """Problem sets for a week (exam problems are kept apart, on the Exams page)."""
    return list(session.exec(select(ProblemSet).where(ProblemSet.course_id == course.id,
                                                      ProblemSet.week == week,
                                                      ProblemSet.kind != "exam")
                             .order_by(ProblemSet.order)))


def pset_by_slug(session: Session, slug: str) -> ProblemSet | None:
    return session.exec(select(ProblemSet).where(ProblemSet.slug == slug)).first()


def problems(session: Session, pset: ProblemSet) -> list[Problem]:
    return list(session.exec(select(Problem).where(Problem.set_id == pset.id).order_by(Problem.order)))


def problem_by_slug(session: Session, slug: str) -> Problem | None:
    return session.exec(select(Problem).where(Problem.slug == slug)).first()


def attempts(session: Session, problem: Problem) -> list[Attempt]:
    return list(session.exec(select(Attempt).where(Attempt.problem_id == problem.id)
                             .order_by(Attempt.at.desc())))


def last_results(session: Session, problem_ids: list[int]) -> dict[int, str]:
    """Most recent result per problem."""
    out = {}
    if not problem_ids:
        return out
    for a in session.exec(select(Attempt).where(Attempt.problem_id.in_(problem_ids))
                          .order_by(Attempt.at)):
        out[a.problem_id] = a.result
    return out


SELF_RATINGS = ("solid", "shaky", "miss")


def rate_problem(session: Session, problem: Problem, result: str, note: str = "",
                 actor: str = "app", add_to_log: bool | None = None, cause: str = "") -> Attempt:
    """Record how a problem went. A miss goes into the mistake log (a shaky one if you ask)."""
    from . import review

    if result not in SELF_RATINGS:
        raise ValueError(f"rating must be one of {SELF_RATINGS}")
    attempt = Attempt(problem_id=problem.id, at=config.now(), result=result,
                      source="claude" if actor == "claude" else "self", note=note)
    session.add(attempt)
    log(session, actor, "problem.rate", f"{problem.label}: {result}", problem=problem.slug)
    session.commit()
    session.refresh(attempt)
    if add_to_log if add_to_log is not None else result == "miss":
        review.add_mistake(session, problem, source="claude" if actor == "claude" else "rating",
                           cause=cause, note=note, actor=actor)
    return attempt


def check_problem(session: Session, problem: Problem, given: list[str],
                  actor: str = "app") -> tuple[Attempt, list[bool]]:
    """Check typed answers to a generated problem against its computed key."""
    expected = problem.key.get("answers", [])
    if not expected:
        raise ValueError("this problem has no computed answers to check against")
    marks = [check_answer(exp, g) for exp, g in zip(expected, given + [""] * len(expected))]
    result = "correct" if all(marks) else "incorrect"
    attempt = Attempt(problem_id=problem.id, at=config.now(), result=result, source="auto",
                      answer={"given": given, "marks": marks})
    session.add(attempt)
    log(session, actor, "problem.check", f"{problem.label}: {result}", problem=problem.slug)
    session.commit()
    session.refresh(attempt)
    if result == "incorrect":
        from . import review
        wrong = [a["label"] for a, ok in zip(expected, marks) if not ok]
        review.add_mistake(session, problem, source="check", note="Wrong: " + ", ".join(wrong),
                           actor=actor)
    return attempt, marks


# ---- submissions --------------------------------------------------------------------------

def create_submission(session: Session, problem: Problem | None, course: Course,
                      files: list[tuple[str, bytes]], note: str = "",
                      actor: str = "app", exam_attempt_id: int | None = None) -> Submission:
    """Save uploaded work. Raises uploads.UploadError (and saves nothing) if a file is unusable."""
    import shutil

    from . import uploads

    sub = Submission(problem_id=problem.id if problem else None, course_id=course.id,
                     created_at=config.now(), note=note.strip(), exam_attempt_id=exam_attempt_id)
    session.add(sub)
    session.flush()  # get an id for the folder name
    try:
        saved = uploads.save_files(sub.id, files)
    except uploads.UploadError:
        session.rollback()
        shutil.rmtree(config.UPLOAD_DIR / f"{sub.id:05d}", ignore_errors=True)
        raise
    sub.files = [{"name": s.name, "original": s.original, "pages": s.pages} for s in saved]
    what = problem.label if problem else course.name
    log(session, actor, "submission.add", f"Submitted work for {what} ({len(saved)} file(s))",
        submission=sub.id)
    session.commit()
    session.refresh(sub)
    return sub


def submissions(session: Session, status: str | None = None, problem: Problem | None = None,
                limit: int = 50) -> list[Submission]:
    q = select(Submission)
    if status:
        q = q.where(Submission.status == status)
    if problem is not None:
        q = q.where(Submission.problem_id == problem.id)
    return list(session.exec(q.order_by(Submission.created_at.desc()).limit(limit)))


def pending_count(session: Session) -> int:
    """Work waiting for Claude: single-problem submissions and uploaded exam sittings."""
    return int(session.exec(select(func.count()).select_from(Submission)
                            .where(Submission.status.in_(["pending", "error"]))).one())


def delete_submission(session: Session, sub: Submission, actor: str = "app") -> None:
    import shutil

    shutil.rmtree(config.UPLOAD_DIR / f"{sub.id:05d}", ignore_errors=True)
    log(session, actor, "submission.delete", f"Deleted submission #{sub.id}", submission=sub.id)
    session.delete(sub)
    session.commit()


def recent_activity(session: Session, limit: int = 20) -> list[ActivityLog]:
    return list(session.exec(select(ActivityLog).order_by(ActivityLog.at.desc()).limit(limit)))


def recent_study(session: Session, limit: int = 10) -> list[StudySession]:
    return list(session.exec(
        select(StudySession).order_by(StudySession.started_at.desc()).limit(limit)))
