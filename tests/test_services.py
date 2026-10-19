from datetime import date, datetime

import pytest
from sqlmodel import select

from app import services
from app.models import ActivityLog, Task


@pytest.mark.parametrize("day, phase, prep, term", [
    (date(2026, 10, 1), "before", None, None),
    (date(2026, 10, 19), "prep", 1, None),
    (date(2026, 11, 26), "prep", 6, None),  # Thanksgiving
    (date(2027, 1, 3), "prep", 11, None),
    (date(2027, 1, 4), "term", None, 1),
    (date(2027, 3, 12), "term", None, 10),
    (date(2027, 3, 16), "finals", None, None),
    (date(2027, 4, 1), "after", None, None),
])
def test_phase_for(session, day, phase, prep, term):
    p = services.phase_for(session, day)
    assert p.name == phase
    assert (p.prep_week.number if p.prep_week else None) == prep
    assert p.term_week == term


def test_task_done_and_undone_are_logged(session):
    task = session.exec(select(Task)).first()
    services.set_task_done(session, task.id, True, actor="claude")
    assert task.done_by == "claude"
    services.set_task_done(session, task.id, True)  # no double log
    services.set_task_done(session, task.id, False)
    actions = [a.action for a in session.exec(select(ActivityLog).order_by(ActivityLog.id))]
    assert actions == ["task.done", "task.undone"]


def test_study_minutes_land_in_the_right_prep_week(session):
    services.log_study(session, "MTH254", 45, started_at=datetime(2026, 11, 3, 20, 0))
    services.log_study(session, "MTH254", 15, started_at=datetime(2026, 11, 9, 0, 30))  # next week
    mth = next(p for p in services.progress(session) if p.course.code == "MTH254")
    assert mth.week_minutes[3] == 45
    assert mth.week_minutes[4] == 15
    assert mth.minutes == 60


def test_study_rejects_bad_input(session):
    with pytest.raises(LookupError):
        services.log_study(session, "CS999", 10)
    with pytest.raises(ValueError):
        services.log_study(session, "ECE201", 0)
