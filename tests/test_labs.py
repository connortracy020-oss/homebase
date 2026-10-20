"""Python labs: the checker, the content, and the pages."""
import types
from pathlib import Path

import numpy as np
import pytest

from app import config, labs
from app.lab_checks import CHECKS
from app.models import Task
from sqlmodel import select

ANSWERS = config.ROOT / "tests" / "lab_answers" / "ece200"
ALL_LABS = labs.load_labs("ece200")


def test_ten_labs_one_per_week():
    assert [lab["week"] for lab in ALL_LABS] == list(range(1, 11))
    assert [lab["number"] for lab in ALL_LABS] == list(range(1, 11))
    assert sorted(CHECKS["ece200"]) == list(range(1, 11))


@pytest.mark.parametrize("lab", ALL_LABS, ids=lambda lab: lab["id"])
def test_worked_answers_pass_every_check(lab):
    results = labs.check_lab(lab, ANSWERS / Path(lab["starter"]).name)
    assert [(r.name, r.status, r.message) for r in results if r.status != "pass"] == []


@pytest.mark.parametrize("lab", ALL_LABS, ids=lambda lab: lab["id"])
def test_blank_starter_is_all_todo(lab):
    results = labs.check_lab(lab, config.ROOT / lab["starter"])
    assert results and all(r.status == "todo" for r in results)


def run(lab_number, **functions):
    """Check a made-up lab file that has only these functions."""
    return labs.run_checks(CHECKS["ece200"][lab_number], types.SimpleNamespace(**functions))


def test_wrong_answer_fails_with_how_far_off():
    def my_fir(x, b):  # forgot the k = 0 term
        y = np.zeros(len(x))
        for n in range(len(x)):
            for k in range(1, len(b)):
                if n - k >= 0:
                    y[n] += b[k] * x[n - k]
        return y

    result = run(4, my_fir=my_fir)[1]
    assert result.status == "fail" and "off by up to" in result.message


def test_using_the_builtin_is_not_allowed():
    def my_conv(x, h):
        return np.convolve(x, h)  # right answer, but not by hand

    result = run(5, my_conv=my_conv)[0]
    assert result.status == "fail" and "by hand" in result.message


def test_comments_mentioning_the_builtin_are_fine():
    def my_dft(x):
        # this must match np.fft.fft
        N = len(x)
        n = np.arange(N)
        return np.exp(-2j * np.pi * np.outer(n, n) / N) @ x

    assert run(10, my_dft=my_dft)[0].status == "pass"


def test_crash_and_missing_function():
    def make_cosine(A, f, phi, t):
        return A * np.cos(2 * np.pi * f * t + phi) + undefined_name  # noqa: F821

    results = run(1, make_cosine=make_cosine)
    assert results[0].status == "error" and "NameError" in results[0].message
    assert results[1].status == "fail" and "no function called phasor" in results[1].message


def test_file_that_does_not_run(tmp_path):
    bad = tmp_path / "broken.py"
    bad.write_text("def oops(:\n")
    [result] = labs.check_lab(ALL_LABS[0], bad)
    assert result.status == "error" and "SyntaxError" in result.message


def test_find_lab():
    assert labs.find_lab("4")["id"] == "ece200-lab04"
    assert labs.find_lab("04")["id"] == "ece200-lab04"
    assert labs.find_lab("ece200-lab10")["number"] == 10
    assert labs.find_lab("11") is None


def test_command_line_makes_a_copy_and_saves_results(data_dir, capsys):
    lab = labs.find_lab("4")
    assert labs.main(["4"]) == 1  # blank copy: not done yet
    copy = data_dir / "labs" / "lab04_fir.py"
    assert copy.read_text() == (config.ROOT / lab["starter"]).read_text()
    assert "Made your copy" in capsys.readouterr().out
    assert labs.last_result(lab)["passed"] == 0

    copy.write_text((ANSWERS / "lab04_fir.py").read_text())
    assert labs.main(["4"]) == 0
    out = capsys.readouterr().out
    assert "Made your copy" not in out and "6 of 6 checks pass" in out
    assert labs.last_result(lab)["passed"] == 6


def test_command_line_with_another_file(data_dir, capsys):
    assert labs.main(["9", "--file", str(ANSWERS / "lab09_dtfs.py")]) == 0
    assert not (data_dir / "labs" / "lab09_dtfs.py").exists()


def test_lab_tasks_link_to_labs_and_keep_their_ids(session):
    tasks = session.exec(select(Task).where(Task.kind == "lab")).all()
    by_slug = {t.slug: t for t in tasks}
    assert by_slug["p04-ece200-lab-d9d32756"].ref == "ece200-lab01"  # id from before labs existed
    assert by_slug["p09-ece200-lab-9f11d57c"].ref == "ece200-lab05"
    assert all(t.ref_kind == "lab" for t in tasks if t.course_week)


def test_week_page_lists_the_lab(client):
    page = client.get("/course/ECE200/week/4").text
    assert "<h2>Labs</h2>" in page and "/lab/ece200-lab04" in page and "not checked yet" in page
    assert "<h2>Labs</h2>" not in client.get("/course/ECE201/week/4").text


def test_lab_page_shows_checks_and_last_result(client, data_dir):
    page = client.get("/lab/ece200-lab04").text
    assert "labs\\check.py 4" in page and "my_fir matches np.convolve" in page
    assert "Not checked yet" in page
    assert "In the prep plan" in page  # its task, with a checkbox
    labs.main(["4", "--file", str(ANSWERS / "lab04_fir.py")])
    page = client.get("/lab/ece200-lab04").text
    assert "6 of 6 pass" in page and "result-pass" in page
    assert "last check: 6 of 6 pass" in client.get("/course/ECE200/week/4").text


def test_starter_view_and_missing_lab(client):
    assert "def my_fir" in client.get("/lab/ece200-lab04/starter").text
    assert client.get("/lab/nope").status_code == 404


def test_plan_task_links_to_lab_page(client):
    assert 'href="/lab/ece200-lab01"' in client.get("/plan").text


def test_validator_flags_a_starter_that_does_not_match(monkeypatch):
    import scripts.validate_content as vc

    vc.errors.clear()
    vc.check_labs("ece200", {"dspfirst-labs": {}})
    assert vc.errors == []
    broken = dict(ALL_LABS[0], starter="tests/lab_answers/ece200/lab01_phasors.py")  # not blank
    monkeypatch.setattr(labs, "load_labs", lambda code: [broken])
    vc.check_labs("ece200", {"dspfirst-labs": {}})
    assert any("blank starter" in e for e in vc.errors)
    vc.errors.clear()
