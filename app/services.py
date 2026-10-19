"""What the app does, as plain functions.

Pages, the JSON API and (later) the Claude MCP server all call these, so
every change goes through one place and lands in the activity log.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlmodel import Session, func, select

from . import config
from .models import ActivityLog, Course, CourseWeek, PrepWeek, StudySession, Task

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


def recent_activity(session: Session, limit: int = 20) -> list[ActivityLog]:
    return list(session.exec(select(ActivityLog).order_by(ActivityLog.at.desc()).limit(limit)))


def recent_study(session: Session, limit: int = 10) -> list[StudySession]:
    return list(session.exec(
        select(StudySession).order_by(StudySession.started_at.desc()).limit(limit)))
