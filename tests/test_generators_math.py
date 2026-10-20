"""ECE 200 (dsp) and MTH 254 (vectorcalc) generators: every seed builds a checked
problem, and the core helpers agree with hand-worked textbook cases."""
import json
import math
from pathlib import Path

import numpy as np
import pytest
import sympy as sp

from app.generators import GENERATORS, check_answer, dsp, generate, vectorcalc
from app.generators.dsp import (alias, convolve_seq, dft_exact, dtft_finite, fir_apply,
                                freq_response, phasor_sum)
from app.generators.vectorcalc import angle_between, classify, plane_through, quad2, quad3

ROOT = Path(__file__).resolve().parents[1]
MODULES = {"ece200": dsp, "mth254": vectorcalc}
ALL = [(course, name) for course, mod in MODULES.items() for name in sorted(mod.GENERATORS)]


def _course_topics(course):
    weeks = json.loads((ROOT / "content" / course / "weeks.json").read_text(encoding="utf-8"))
    return {t for w in weeks for t in w["topics"]}


# ---- every generator, many seeds ------------------------------------------------


@pytest.mark.parametrize("course,name", ALL)
@pytest.mark.parametrize("seed", range(1, 41))
def test_every_seed_builds_cleanly(course, name, seed):
    made = generate(name, seed)  # each generator asserts its own second check
    assert made["statement"]["text"].strip()
    key = made["key"]
    assert key["answers"] and key["checks"]
    assert 3 <= len(key["steps"]) <= 8
    for a in key["answers"]:
        assert set(a) >= {"label", "value", "unit", "tol"}
        assert isinstance(a["value"], float) and math.isfinite(a["value"])
        assert isinstance(a["unit"], str) and a["unit"]
        assert a["tol"] > 0
        assert check_answer(a, repr(a["value"]))  # the key accepts itself
        if "units of π" in a["label"] and "Phase" in a["label"]:
            assert -1 < a["value"] <= 1, a
    assert made["topics"] and set(made["topics"]) <= _course_topics(course)


def test_registry_and_weeks():
    for mod in MODULES.values():
        assert set(mod.WEEKS) == set(mod.GENERATORS)
        assert all(1 <= w <= 10 for w in mod.WEEKS.values())
        for name, fn in mod.GENERATORS.items():
            assert GENERATORS[name] is fn
    assert len(dsp.GENERATORS) == 9 and len(vectorcalc.GENERATORS) == 10


@pytest.mark.parametrize("course,name", ALL)
def test_same_seed_same_problem(course, name):
    assert generate(name, 11) == generate(name, 11)


@pytest.mark.parametrize("seed", range(1, 41))
def test_critical_point_types_are_codes(seed):
    for a in generate("critical_points", seed)["key"]["answers"]:
        if a["label"].startswith("Type"):
            assert a["value"] in (-1.0, 0.0, 1.0)


@pytest.mark.parametrize("seed", range(1, 41))
def test_dot_angle_is_nice(seed):
    angle = next(a for a in generate("dot_angle", seed)["key"]["answers"] if a["label"] == "Angle θ")
    assert angle["value"] in (30, 45, 60, 90, 120, 135, 150)


# ---- hand-checked DSP cases -----------------------------------------------------


def test_phasor_sum_by_hand():
    # cos(wn) + cos(wn - pi/2) = cos + sin = sqrt2 cos(wn - pi/4)
    A, q = phasor_sum([(1, 0), (1, sp.Rational(-1, 2))])
    assert A == sp.sqrt(2) and q == sp.Rational(-1, 4)
    # cos(wn) + cos(wn + pi/2) = cos - sin = sqrt2 cos(wn + pi/4)
    A, q = phasor_sum([(1, 0), (1, sp.Rational(1, 2))])
    assert A == sp.sqrt(2) and q == sp.Rational(1, 4)
    # 2cos(wn + pi/3) + 2cos(wn - pi/3) = 2 * 2cos(pi/3) cos(wn) = 2cos(wn)
    A, q = phasor_sum([(2, sp.Rational(1, 3)), (2, sp.Rational(-1, 3))])
    assert A == 2 and q == 0
    # cos(wn) + cos(wn + pi) = 0 has no phase
    A, q = phasor_sum([(1, 0), (1, 1)])
    assert A == 0 and q is None


def test_convolution_by_hand():
    assert convolve_seq([1, 1], 0, [1, 1], 0) == ([1, 2, 1], 0)
    # (d[n+1] + 2d[n]) * (d[n-1] - d[n-2]) = d[n] + d[n-1] - 2d[n-2]
    assert convolve_seq([1, 2], -1, [1, -1], 1) == ([1, 1, -2], 0)
    assert convolve_seq([1, 2, 3], 0, [1], 2) == ([1, 2, 3], 2)  # pure delay


def test_fir_by_hand():
    step = lambda n: 1 if n >= 0 else 0
    assert fir_apply([1, 1, 1], step, 5) == 3      # 3-point running sum of a step
    assert fir_apply([1, 1, 1], step, 1) == 2
    assert fir_apply([1, -1], step, 0) == 1 and fir_apply([1, -1], step, 4) == 0  # first difference


def test_dft_by_hand():
    assert [complex(v) for v in dft_exact([1, 0, 0, 0])] == [1, 1, 1, 1]
    assert [complex(v) for v in dft_exact([1, 1, 1, 1])] == [4, 0, 0, 0]
    assert [complex(v) for v in dft_exact([0, 1, 0, 0])] == [1, -1j, -1, 1j]
    assert [complex(v) for v in dft_exact([1, -1, 1, -1])] == [0, 0, 4, 0]


def test_alias_by_hand():
    # 700 Hz at 1000 samples/s: w = 1.4 pi folds to 0.6 pi, appears at 300 Hz, phase flips
    assert alias(700, 1000, sp.Rational(1, 4)) == (sp.Rational(3, 5), 300, sp.Rational(-1, 4))
    # 1100 Hz at 1000 samples/s: w = 2.2 pi -> 0.2 pi, 100 Hz, phase unchanged
    assert alias(1100, 1000, sp.Rational(1, 3)) == (sp.Rational(1, 5), 100, sp.Rational(1, 3))
    # below fs/2: nothing changes
    assert alias(100, 1000, 0) == (sp.Rational(1, 5), 100, 0)


def test_frequency_response_by_hand():
    assert complex(freq_response([1, 1], sp.Rational(1, 2))) == pytest.approx(1 - 1j)  # 1 + e^{-j pi/2}
    assert abs(complex(freq_response([1, 2, 1], 1))) < 1e-12   # (1 + e^{-jw})^2 is zero at pi
    assert complex(freq_response([1, -1], 1)) == pytest.approx(2)
    assert complex(freq_response([1, 1, 1], 0)) == pytest.approx(3)
    # 3-point running sum at pi/3: e^{-j pi/3}(1 + 2cos(pi/3)) = 2e^{-j pi/3}
    assert complex(freq_response([1, 1, 1], sp.Rational(1, 3))) == pytest.approx(2 * np.exp(-1j * np.pi / 3))


def test_dtft_by_hand():
    # symmetric x = d[n+1] + d[n] + d[n-1] has X = 1 + 2cos(w)
    assert complex(dtft_finite([1, 1, 1], -1, sp.Rational(1, 3))) == pytest.approx(2)
    assert complex(dtft_finite([1, 1, 1], -1, 1)) == pytest.approx(-1)
    assert complex(dtft_finite([1], 2, sp.Rational(1, 2))) == pytest.approx(-1)  # e^{-j pi} for d[n-2]


# ---- hand-checked vector calculus cases ------------------------------------------


def test_angles_by_hand():
    assert angle_between((1, 0, 0), (1, 1, 0)) == 45
    assert angle_between((1, 0, 0), (0, 1, 0)) == 90
    assert angle_between((1, 0, 0), (-1, 1, 0)) == 135
    assert angle_between((1, 1, 0), (1, 2, 1)) == 30    # 3 / (sqrt2 sqrt6) = sqrt3/2
    assert angle_between((1, 0, 0), (1, 2, 3)) is None


def test_plane_by_hand():
    assert plane_through((1, 0, 0), (0, 1, 0), (0, 0, 1)) == (1, 1, 1, 1)
    assert plane_through((0, 0, 0), (0, 1, 0), (1, 0, 0)) == (0, 0, 1, 0)  # z = 0, sign fixed
    assert plane_through((2, 0, 0), (0, 4, 0), (0, 0, 4)) == (2, 1, 1, 4)  # gcd removed


def test_classify_by_hand():
    x, y = sp.symbols("x y", real=True)
    assert classify(x ** 2 + y ** 2, (0, 0)) == 1
    assert classify(-x ** 2 - 3 * y ** 2, (0, 0)) == -1
    assert classify(x ** 2 - y ** 2, (0, 0)) == 0
    assert classify(x * y, (0, 0)) == 0
    assert classify(x ** 4 + y ** 4, (0, 0)) is None  # second-derivative test inconclusive


def test_integrals_by_hand():
    x, y = sp.symbols("x y")
    assert sp.integrate(x * y, (x, 0, 1), (y, 0, 1)) == sp.Rational(1, 4)
    assert quad2(lambda X, Y: X * Y, 0, 1, lambda X: 0, lambda X: 1) == pytest.approx(0.25, rel=1e-12)
    disk = quad2(lambda X, Y: 1, -1, 1, lambda X: -np.sqrt(1 - X ** 2), lambda X: np.sqrt(1 - X ** 2))
    assert disk == pytest.approx(math.pi, rel=1e-5)
    tri = quad2(lambda X, Y: 1, 0, 1, lambda X: 0, lambda X: X)  # triangle under y = x
    assert tri == pytest.approx(0.5, rel=1e-12)
    ball = quad3(lambda X, Y, Z: 1, -1, 1,
                 lambda X: -np.sqrt(1 - X ** 2), lambda X: np.sqrt(1 - X ** 2),
                 lambda X, Y: -np.sqrt(np.maximum(1 - X ** 2 - Y ** 2, 0)),
                 lambda X, Y: np.sqrt(np.maximum(1 - X ** 2 - Y ** 2, 0)))
    assert ball == pytest.approx(4 * math.pi / 3, rel=1e-4)
    box = quad3(lambda X, Y, Z: X * Y * Z, 0, 1, lambda X: 0, lambda X: 2, lambda X, Y: 0, lambda X, Y: 3, n=8)
    assert box == pytest.approx(0.5 * 2 * 4.5, rel=1e-12)  # (1/2)(2)(9/2)
