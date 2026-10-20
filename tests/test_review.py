"""Stage (d): mistake log and the 1-3-7-14-28 Leitner ladder."""
from datetime import date, timedelta

import pytest
from sqlmodel import select

from app import feedback, review, services
from app.models import Mistake, Problem

TODAY = date(2026, 11, 3)  # conftest pins HOMEBASE_TODAY to this


def problem(session, slug):
    return session.exec(select(Problem).where(Problem.slug == slug)).one()


@pytest.mark.parametrize("box, outcome, new_box, days, retired", [
    (1, "solid", 2, 3, False),
    (2, "solid", 3, 7, False),
    (4, "solid", 5, 28, False),
    (5, "solid", 5, 0, True),
    (3, "shaky", 3, 7, False),
    (4, "miss", 1, 1, False),
    (1, "miss", 1, 1, False),
])
def test_ladder(box, outcome, new_box, days, retired):
    b, due, r = review.next_state(box, outcome, TODAY)
    assert (b, (due - TODAY).days, r) == (new_box, days, retired)


def test_bad_outcome():
    with pytest.raises(ValueError):
        review.next_state(1, "great", TODAY)


def test_interleave_alternates_courses():
    ms = [Mistake(id=i, problem_id=1, course_id=c, created_at=None, due=TODAY - timedelta(days=d))
          for i, (c, d) in enumerate([(1, 5), (1, 4), (1, 3), (2, 1), (2, 0)], 1)]
    assert [m.course_id for m in review.interleave(ms)] == [1, 2, 1, 2, 1]


def test_miss_rating_logs_a_mistake_due_tomorrow(session):
    p = problem(session, "ulaby-ex-ch1-3")
    services.rate_problem(session, p, "miss", "forgot the prefix", cause="units")
    m = review.open_mistake_for(session, p)
    assert m.box == 1 and m.due == TODAY + timedelta(days=1) and m.cause == "units"
    assert review.due_items(session, TODAY) == []
    assert review.due_items(session, TODAY + timedelta(days=1)) == [m]


def test_solid_and_unlogged_shaky_add_nothing(session):
    p = problem(session, "ulaby-ex-ch1-3")
    services.rate_problem(session, p, "solid")
    services.rate_problem(session, p, "shaky")  # add_to_log not asked for
    assert session.exec(select(Mistake)).all() == []
    services.rate_problem(session, p, "shaky", add_to_log=True)
    assert len(session.exec(select(Mistake)).all()) == 1


def test_missing_again_is_a_lapse_not_a_duplicate(session):
    p = problem(session, "ulaby-ex-ch1-3")
    m = review.add_mistake(session, p, "manual", today=TODAY)
    review.record_review(session, m, "solid", today=TODAY + timedelta(days=1))
    assert m.box == 2
    services.rate_problem(session, p, "miss")
    assert len(session.exec(select(Mistake)).all()) == 1
    assert m.box == 1 and m.lapses == 1


def test_wrong_generated_answer_logs_a_mistake(session):
    p = problem(session, "gen-ece201-w1-power-element_power-3")
    services.check_problem(session, p, [str(p.key["answers"][0]["value"])])
    assert review.open_mistake_for(session, p) is None
    services.check_problem(session, p, ["999"])
    assert "Power absorbed" in review.open_mistake_for(session, p).note


def test_confirmed_feedback_logs_cause_and_first_error(session):
    p = problem(session, "ulaby-ex-ch1-2")
    from tests.test_feedback import GOOD_REVIEW, make_sub
    sub = make_sub(session, "ulaby-ex-ch1-2")
    feedback.apply_review(session, sub, GOOD_REVIEW, reviewer="api")
    feedback.confirm(session, sub, "incorrect")
    m = review.open_mistake_for(session, p)
    assert m.cause == "setup" and m.submission_id == sub.id
    assert m.note == GOOD_REVIEW["first_error"]


def test_full_ladder_retires_after_about_two_months(session):
    p = problem(session, "ulaby-ex-ch1-4")
    m = review.add_mistake(session, p, "manual", today=TODAY)
    day = TODAY
    for _ in range(5):
        day = m.due
        review.record_review(session, m, "solid", today=day)
    assert m.retired_at is not None
    # re-solves on days 1, 4, 11, 25 and 53; the solid from box 5 retires it (~7.5 weeks)
    assert (day - TODAY).days == 1 + 3 + 7 + 14 + 28
    assert review.due_items(session, day + timedelta(days=60)) == []


def test_sweep_brings_retired_items_back(session):
    p = problem(session, "ulaby-ex-ch1-4")
    course = services.course_by_code(session, "ECE201")
    m = review.add_mistake(session, p, "manual", today=TODAY)
    m.box = 5
    session.commit()
    review.record_review(session, m, "solid", today=TODAY)
    assert m.retired_at and m in review.sweep_items(session, course)
    review.record_review(session, m, "miss", sweep=True, today=TODAY)
    assert m.retired_at is None and m.box == 1


def test_generated_mistakes_are_resolved_with_new_numbers(session):
    p = problem(session, "gen-ece201-w1-power-loop_power-2")
    m = review.add_mistake(session, p, "check")
    first = review.variant_seed(m, p)
    review.record_review(session, m, "shaky")
    assert review.variant_seed(m, p) != first != p.seed


def test_queue_respects_daily_budget(session):
    for n in range(1, 8):
        review.add_mistake(session, problem(session, f"ulaby-ex-ch1-{n}"), "manual",
                           today=TODAY - timedelta(days=5))
    queue, more = review.todays_queue(session, TODAY)
    assert len(queue) == review.DAILY_BUDGET_MIN // review.MINUTES_PER_ITEM and more == 7 - len(queue)


# ---- web --------------------------------------------------------------------------------

def test_review_pages_and_flow(client, session):
    p = problem(session, "ulaby-ex-ch1-5")
    m = review.add_mistake(session, p, "manual", today=TODAY - timedelta(days=2))
    assert "Exercise 1-5" in client.get("/review").text
    assert "due for a cold re-solve today" in client.get("/").text
    r = client.get("/review/next", follow_redirects=False)
    assert r.headers["location"] == f"/review/{m.id}"
    assert "Show the key" in client.get(f"/review/{m.id}").text
    r = client.post(f"/review/{m.id}/rate", data={"outcome": "solid"}, follow_redirects=False)
    assert r.headers["location"] == "/review/next"
    session.refresh(m)
    assert m.box == 2
    assert "Exercise 1-5" in client.get("/mistakes").text


def test_variant_review_check(client, session):
    p = problem(session, "gen-ece201-w1-power-element_power-4")
    m = review.add_mistake(session, p, "check", today=TODAY - timedelta(days=1))
    seed = review.variant_seed(m, p)
    from app.generators import generate
    right = generate(p.generator, seed)["key"]["answers"][0]["value"]
    page = client.get(f"/review/{m.id}").text
    assert "new numbers" in page
    r = client.post(f"/review/{m.id}/check", data={"seed": seed, "a0": str(right)}, follow_redirects=True)
    assert "✓" in r.text and 'value="solid" type="submit" class="primary"' in r.text
    assert client.post(f"/review/{m.id}/check", data={"seed": 1, "a0": "1"}).status_code == 409


def test_manual_add_and_remove(client, session):
    client.post("/problem/kuphaldt-ewp-2/mistake", data={"cause": "concept", "note": "source vs load"})
    m = session.exec(select(Mistake)).one()
    assert m.cause == "concept"
    client.post(f"/mistakes/{m.id}/delete")
    assert session.exec(select(Mistake)).all() == []


def test_sweep_route(client, session):
    p = problem(session, "ulaby-ex-ch1-6")
    m = review.add_mistake(session, p, "manual")
    r = client.get("/review/next?sweep=ECE201", follow_redirects=False)
    assert r.headers["location"] == f"/review/{m.id}?sweep=ECE201"
    client.post(f"/review/{m.id}/rate", data={"outcome": "solid", "sweep": "ECE201"})
    r = client.get("/review/next?sweep=ECE201", follow_redirects=False)
    assert r.headers["location"] == "/review?swept=ECE201"


# ---- MCP --------------------------------------------------------------------------------

def test_mcp_review_tools(session):
    from app import mcp_server as mcp
    out = mcp.add_mistake("ulaby-ex-ch1-7", cause="units", note="mA vs A")
    assert "box 1" in out
    mid = session.exec(select(Mistake)).one().id
    assert "No reviews due" in mcp.list_due_reviews()  # due tomorrow
    assert "units" in mcp.list_mistakes("ECE201")
    assert "box 2" in mcp.record_review_outcome(mid, "solid")
    with pytest.raises(ValueError):
        mcp.add_mistake("ulaby-ex-ch1-7", cause="laziness")
