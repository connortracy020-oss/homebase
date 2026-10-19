"""Generated problems must have correct, self-consistent answers."""
import pytest

from app.generators import GENERATORS, check_answer, generate
from app.generators.circuits_basics import absorbed_power


@pytest.mark.parametrize("name", sorted(GENERATORS))
@pytest.mark.parametrize("seed", range(1, 41))
def test_every_seed_builds_a_checked_problem(name, seed):
    made = generate(name, seed)  # each generator asserts its own second check
    assert made["statement"]["text"]
    answers = made["key"]["answers"]
    assert answers and all("value" in a and a["unit"] for a in answers)
    assert made["key"]["steps"] and made["key"]["checks"]


def test_same_seed_same_problem():
    assert generate("loop_power", 7) == generate("loop_power", 7)


@pytest.mark.parametrize("seed", range(1, 30))
def test_loop_powers_balance(seed):
    values = [a["value"] for a in generate("loop_power", seed)["key"]["answers"]]
    assert len(values) == 4
    assert abs(sum(values)) < 1e-9


def test_passive_sign_convention_by_hand():
    # textbook cases: current into + terminal -> absorbs vi
    assert absorbed_power(10, 2, True) == 20
    assert absorbed_power(10, 2, False) == -20
    assert absorbed_power(-5, 3, True) == -15


def test_check_answer_tolerance():
    exp = {"value": -12.0, "tol": 0.01}
    assert check_answer(exp, "-12")
    assert check_answer(exp, "−12.0")  # typed with a real minus sign
    assert not check_answer(exp, "12")
    assert not check_answer(exp, "twelve")
    assert check_answer({"value": 0.005, "tol": 0.001}, "0.005")
