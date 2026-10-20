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
    # what the task points at inside Homebase, e.g. ("video", "mit6002-L01")
    ref_kind: str = ""  # video | reading | pset | ""
    ref: str = ""


class Video(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)  # "mit6002-L01"
    course_id: int = Field(foreign_key="course.id", index=True)
    series: str = ""  # display name, e.g. "MIT 6.002 (2007)"
    title: str
    url: str
    youtube_id: Optional[str] = None
    duration_min: Optional[float] = None
    osu_week: Optional[int] = None
    priority: str = "core"  # core | optional
    summary: str = ""
    verified: bool = True
    last_pos_sec: int = 0  # where you stopped watching (yours, kept on re-seed)
    watched_at: Optional[datetime] = None


class Chapter(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    video_id: int = Field(foreign_key="video.id", index=True)
    t: int  # seconds from the start
    title: str
    kind: str = "concept"  # concept | example | demo | review | admin


class Note(SQLModel, table=True):
    """Your notes. Pinned to a video time, a problem, or just a course."""
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    video_id: Optional[int] = Field(default=None, foreign_key="video.id", index=True)
    problem_id: Optional[int] = Field(default=None, foreign_key="problem.id", index=True)
    t_sec: Optional[int] = None
    body: str
    created_at: datetime
    updated_at: datetime
    actor: str = "app"


class Resource(SQLModel, table=True):
    """A book, slide deck, or document: a link and/or a file in library/."""
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    kind: str = "textbook"
    title: str
    url: str = ""
    local_path: str = ""  # relative to Homebase/, e.g. library/ece201/ulaby/x.pdf
    license: str = ""
    verified: bool = True
    notes: str = ""


class Reading(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    week: int
    resource_id: int = Field(foreign_key="resource.id")
    sections: str = ""  # "1-1 to 1-6"
    page: Optional[int] = None  # PDF page to open at, when known
    est_min: int = 0
    optional: bool = False
    note: str = ""
    order: int = 0


class ProblemSet(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    week: int
    title: str
    source: str = ""  # where the problems come from
    license: str = ""
    kind: str = "pdf"  # pdf | generated
    notes: str = ""
    optional: bool = False
    order: int = 0


class Problem(SQLModel, table=True):
    """One problem with a pointer to its answer key.

    key_type says how much to trust the key:
      official_worked  published worked solution
      official_answer  published final answer only
      computed         generated here; answer computed and checked by code
      none             no key exists, so feedback is about reasoning only
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    set_id: int = Field(foreign_key="problemset.id", index=True)
    label: str  # "Exercise 1-3"
    order: int = 0
    topics: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    key_type: str = "none"
    # where the problem is: {"pdf", "page", "start", "end"} or {"text", "svg"}
    statement: dict = Field(default_factory=dict, sa_column=Column(JSON))
    # where the key is: {"pdf", "page", "start", "end"} or {"answers": [...], "steps": [...]}
    key: dict = Field(default_factory=dict, sa_column=Column(JSON))
    generator: str = ""
    seed: Optional[int] = None
    points: Optional[float] = None  # for exam problems (some exams use 12.5-point parts)


class Exam(SQLModel, table=True):
    """A real past exam set up for timed practice (content/<course>/exams.json).

    Its problems live in a hidden problem set, so a missed exam problem can go
    into the mistake log like any other problem.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    set_id: int = Field(foreign_key="problemset.id")
    title: str
    source: str = ""
    license: str = ""
    course_week: int = 0  # the term week whose exam this imitates
    scope: str = ""
    time_min: int
    time_note: str = ""
    original_rules: str = ""
    practice_rules: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    skipped: str = ""
    verified: str = ""
    total_points: float = 0
    order: int = 0


class ExamAttempt(SQLModel, table=True):
    """One timed sitting: start, deadline, your uploaded work, and the scores."""
    id: Optional[int] = Field(default=None, primary_key=True)
    exam_id: int = Field(foreign_key="exam.id", index=True)
    started_at: datetime
    deadline: datetime
    finished_at: Optional[datetime] = None
    status: str = "in_progress"  # in_progress | finished | graded
    overtime_sec: int = 0
    # {problem_id: points}, set when you grade; Claude's suggestions are kept separately
    scores: dict = Field(default_factory=dict, sa_column=Column(JSON))
    suggested: dict = Field(default_factory=dict, sa_column=Column(JSON))
    total: Optional[float] = None
    max_points: float = 0
    feedback: str = ""  # Claude's overall comments, if reviewed
    reviewer: str = ""
    graded_at: Optional[datetime] = None


class Attempt(SQLModel, table=True):
    """Each time you try a problem: a checked answer or your own rating."""
    id: Optional[int] = Field(default=None, primary_key=True)
    problem_id: int = Field(foreign_key="problem.id", index=True)
    at: datetime
    result: str  # correct | incorrect (auto-checked) or solid | shaky | miss (self-rated)
    source: str = "self"  # auto | self | claude
    answer: dict = Field(default_factory=dict, sa_column=Column(JSON))
    note: str = ""


class Submission(SQLModel, table=True):
    """Photos or a PDF of your handwritten work, and the feedback on it.

    status: pending (waiting for review) -> reviewing -> reviewed, or error.
    Claude reviews either through the API ("api") or when you open a Claude
    session and ask it to review your queue ("claude_session").
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    problem_id: Optional[int] = Field(default=None, foreign_key="problem.id", index=True)
    exam_attempt_id: Optional[int] = Field(default=None, foreign_key="examattempt.id", index=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    created_at: datetime
    # [{"name": original file name, "original": path, "pages": [processed page paths]}]
    files: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    note: str = ""  # anything you want the reviewer to know
    status: str = "pending"
    reviewer: str = ""  # api | claude_session
    model: str = ""
    transcription: str = ""
    verdict: str = ""  # correct | partial | incorrect | unclear
    first_error: str = ""
    cause: str = ""  # concept | setup | algebra-sign | units | careless | none | unclear
    feedback: str = ""
    confidence: str = ""  # high | medium | low
    legible: bool = True
    answers: list[dict] = Field(default_factory=list, sa_column=Column(JSON))
    error: str = ""
    reviewed_at: Optional[datetime] = None
    tokens_in: int = 0
    tokens_out: int = 0
    user_verdict: str = ""  # what you decided after reading the feedback
    confirmed_at: Optional[datetime] = None


class Mistake(SQLModel, table=True):
    """A problem you got wrong, scheduled for spaced review (see app/review.py).

    box 1-5 sets the gap until the next review: 1, 3, 7, 14, 28 days.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    problem_id: int = Field(foreign_key="problem.id", index=True)
    course_id: int = Field(foreign_key="course.id", index=True)
    created_at: datetime
    source: str = "rating"  # rating | check | submission | manual | claude
    submission_id: Optional[int] = Field(default=None, foreign_key="submission.id")
    cause: str = ""  # concept | setup | algebra-sign | units | careless | unclear
    note: str = ""  # what went wrong, in your words or from the feedback
    box: int = 1
    due: date
    reviews: int = 0
    lapses: int = 0  # times it fell back to box 1
    last_reviewed: Optional[datetime] = None
    retired_at: Optional[datetime] = None


class ReviewAttempt(SQLModel, table=True):
    """One cold re-solve of a mistake."""
    id: Optional[int] = Field(default=None, primary_key=True)
    mistake_id: int = Field(foreign_key="mistake.id", index=True)
    at: datetime
    outcome: str  # solid | shaky | miss
    box_before: int
    box_after: int
    sweep: bool = False  # part of a pre-exam sweep
    variant_seed: Optional[int] = None  # generated problems are re-solved with new numbers
    note: str = ""
    actor: str = "app"


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
