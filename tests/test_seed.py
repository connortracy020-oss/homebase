from datetime import date

from sqlmodel import select

from app import services
from app.models import ActivityLog, Course, CourseWeek, PrepWeek, Task
from app.seed import seed


def test_seed_loads_everything(session):
    assert [c.code for c in services.courses(session)] == ["ECE201", "MTH254", "ECE200"]
    assert len(session.exec(select(CourseWeek)).all()) == 30
    weeks = services.prep_weeks(session)
    assert len(weeks) == 11
    assert weeks[0].start == date(2026, 10, 19)
    assert weeks[-1].end == date(2027, 1, 3)


def test_prep_weeks_are_back_to_back(session):
    weeks = services.prep_weeks(session)
    for a, b in zip(weeks, weeks[1:]):
        assert (b.start - a.end).days == 1
        assert (a.end - a.start).days == 6


def test_planned_time_matches_plan(session):
    """PLAN.md promises about 50 hours; heavier in December than October."""
    weeks = services.prep_weeks(session)
    total = sum(w.planned_hours for w in weeks)
    assert 44 <= total <= 56
    october = weeks[0].planned_hours
    mid_december = next(w for w in weeks if w.start == date(2026, 12, 14)).planned_hours
    assert mid_december > october


def test_video_tasks_get_real_links(session):
    task = session.exec(select(Task).where(Task.slug.contains("mit6002-L01"))).one()
    assert task.url.startswith("https://ocw.mit.edu/")
    assert task.est_min > 30  # 41-minute lecture at 1.25x plus notes


def test_reseed_keeps_progress(session):
    task = session.exec(select(Task)).first()
    services.set_task_done(session, task.id, True)
    services.log_study(session, "ECE201", 30)
    seed(session)
    assert session.get(Task, task.id).done_at is not None
    assert services.progress(session)[0].minutes == 30
    assert session.exec(select(ActivityLog).where(ActivityLog.action == "task.removed")).all() == []
