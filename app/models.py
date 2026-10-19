"""Database tables.

Each class is one SQLite table. Content tables (Course, CourseWeek, PrepWeek, Task)
are filled by the seed script from content/*.json. Your own data (StudySession,
done-marks on tasks, ActivityLog) is never overwritten by re-seeding.

Later stages add videos, notes, problems, submissions, mistakes and exams.
"""
from datetime import date, datetime
from typing import Optional

from sqlmodel import JSON, Column, Field, SQLModel


class Course(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)  # "ECE201"
    name: str  # "ECE 201"
    title: str  # "DC and Transient Circuits"
    color: str  # accent colour for this course, e.g. "#8a5a44"
    priority: int = 0  # lower shows first
    instructor: str = ""
    meets: str = ""
    term_note: str = ""  # shown on the course page
    exam_style_known: bool = True
    exam_style_note: str = ""


class CourseWeek(SQLModel, table=True):
    """One week of the real 10-week Winter term."""
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    number: int  # 1-10
    title: str
    topics: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    notes: str = ""


class PrepWeek(SQLModel, table=True):
    """One calendar week of the Oct 19 - Jan 3 prep plan."""
    id: Optional[int] = Field(default=None, primary_key=True)
    number: int = Field(index=True, unique=True)  # 1-11
    start: date
    end: date
    label: str = ""  # "Thanksgiving", "OSU finals week", ...
    planned_hours: float = 0
    # minutes planned per course code, e.g. {"ECE201": 120, "MTH254": 60}
    planned_minutes: dict = Field(default_factory=dict, sa_column=Column(JSON))
    focus: str = ""


class Task(SQLModel, table=True):
    """A checklist item: watch, read, solve, submit, review, lab or exam."""
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)  # stable key so re-seeding keeps done-marks
    course_id: int = Field(foreign_key="course.id", index=True)
    course_week: int  # which term week this belongs to (1-10)
    prep_week_id: Optional[int] = Field(default=None, foreign_key="prepweek.id", index=True)
    kind: str  # watch | read | solve | submit | review | lab | exam
    title: str
    detail: str = ""
    url: str = ""
    est_min: int = 0
    order: int = 0
    done_at: Optional[datetime] = None
    done_by: str = ""  # "app" or "claude"


class StudySession(SQLModel, table=True):
    """Time you spent studying. Hours on the Progress page come from here."""
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    started_at: datetime
    minutes: int
    source: str = "manual"  # timer | manual | claude
    note: str = ""


class ActivityLog(SQLModel, table=True):
    """Every change, and who made it, so you can see what Claude did."""
    id: Optional[int] = Field(default=None, primary_key=True)
    at: datetime
    actor: str  # "app" or "claude"
    action: str  # "task.done", "session.log", ...
    summary: str
    data: dict = Field(default_factory=dict, sa_column=Column(JSON))


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str = ""
