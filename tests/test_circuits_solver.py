"""The Circuit Bench's solver (JavaScript, app/static/circuits) checked two ways: its own
tests with closed-form answers (node --test tests/js), and agreement with Homebase's Python
MNA solver (app/generators/circuits_dc.py) on hundreds of random circuits.

Node is only needed to run these tests; nothing in the app uses it.
"""
import json
import random
import shutil
import subprocess
from fractions import Fraction

import pytest

from app import config
from app.generators.circuits_dc import El, mna

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="Node isn't installed (only needed for the bench's solver tests)")


def run_node(*args, timeout=180):
    return subprocess.run([NODE, *args], cwd=config.ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)


def test_js_unit_tests():
    r = run_node("--test", "tests/js/")
    assert r.returncode == 0, r.stdout[-6000:] + r.stderr[-3000:]


R_VALUES = ["1", "2", "3", "4", "5", "6", "8", "10", "12", "20", "1.5", "2.2"]
SOURCE_VALUES = ["1", "2", "3", "5", "-4", "10", "0.5", "12"]
GAINS = ["2", "3", "-1", "0.5", "4", "-2"]
GMS = ["0.5", "1", "-0.25", "2", "0.1"]


def name(n: int):
    return 0 if n == 0 else f"n{n}"


def random_circuit(rng: random.Random):
    """A connected random circuit as (Python El list, bench netlist)."""
    n = rng.randint(2, 6)
    py, js = [], []

    def add(kind, value_text, a, b, cp=0, cn=0, out=0):
        k = len(py) + 1
        value = float(Fraction(value_text))
        if kind == "R":
            py.append(El("R", f"R{k}", a, b, value))
            js.append({"id": f"R{k}", "type": "R", "nodes": [name(a), name(b)], "params": {"R": value_text}})
        elif kind == "V":
            py.append(El("V", f"V{k}", a, b, value))
            js.append({"id": f"V{k}", "type": "V", "nodes": [name(a), name(b)], "params": {"V": value_text}})
        elif kind == "I":   # Python: current flows a -> b through the source, so it leaves at b
            py.append(El("I", f"I{k}", a, b, value))
            js.append({"id": f"I{k}", "type": "I", "nodes": [name(b), name(a)], "params": {"I": value_text}})
        elif kind == "VCCS":
            py.append(El("VCCS", f"G{k}", a, b, value, cp, cn))
            js.append({"id": f"G{k}", "type": "G", "nodes": [name(b), name(a)],
                       "params": {"gain": value_text, "ctrl": f"v({name(cp)}, {name(cn)})"}})
        elif kind == "VCVS":
            py.append(El("VCVS", f"E{k}", a, b, value, cp, cn))
            js.append({"id": f"E{k}", "type": "E", "nodes": [name(a), name(b)],
                       "params": {"gain": value_text, "ctrl": f"v({name(cp)}, {name(cn)})"}})
        elif kind == "OPAMP":   # Python: + input a, - input b
            py.append(El("OPAMP", f"U{k}", a, b, out=out))
            js.append({"id": f"U{k}", "type": "OA", "nodes": [name(b), name(a), name(out)], "params": {}})

    for k in range(1, n + 1):  # a spanning tree of resistors keeps everything connected
        add("R", rng.choice(R_VALUES), k, rng.randrange(0, k))
    for _ in range(rng.randint(0, n)):
        a, b = rng.sample(range(n + 1), 2)
        add("R", rng.choice(R_VALUES), a, b)
    for _ in range(rng.randint(1, 2)):
        a, b = rng.sample(range(n + 1), 2)
        add("V" if rng.random() < 0.5 else "I", rng.choice(SOURCE_VALUES), a, b)
    if rng.random() < 0.5:
        a, b = rng.sample(range(n + 1), 2)
        cp, cn = rng.sample(range(n + 1), 2)
        if rng.random() < 0.5:
            add("VCVS", rng.choice(GAINS), a, b, cp, cn)
        else:
            add("VCCS", rng.choice(GMS), a, b, cp, cn)
    if rng.random() < 0.2 and n >= 3:
        plus, minus, out = rng.sample(range(n + 1), 3)
        if out != 0:
            add("OPAMP", "0", plus, minus, out=out)
    return py, js


def test_js_matches_python_on_random_circuits(tmp_path):
    rng = random.Random(201)
    cases = [random_circuit(rng) for _ in range(400)]
    vectors = tmp_path / "vectors.json"
    vectors.write_text(json.dumps([{"elements": js} for _, js in cases]))
    r = run_node("tests/js/vectors.mjs", str(vectors))
    assert r.returncode == 0, r.stderr[-3000:]
    results = json.loads(r.stdout)
    both = js_only = py_only = 0
    for (py, js), res in zip(cases, results):
        try:
            sol = mna(py)
        except (ArithmeticError, AssertionError, ZeroDivisionError):
            sol = None
        if sol is None:
            js_only += res["ok"]
            continue
        assert res["ok"], f"bench rejected a circuit Python solved: {res['codes']} {js}"
        both += 1
        assert res["exact"]
        for node, v in sol.v.items():
            got = res["v"]["ground" if node == 0 else f"n{node}"]
            assert abs(got - v) <= 1e-7 * (1 + abs(v)), f"node {node}: bench {got}, python {v}\n{js}"
            exact = res["vx"]["ground" if node == 0 else f"n{node}"]
            assert abs(float(Fraction(exact)) - v) <= 1e-7 * (1 + abs(v))
        for e in py:
            if e.kind in ("R", "V"):  # same current convention for these (a -> b through the part)
                assert abs(res["i"][e.name] - sol.i[e.name]) <= 1e-9 * (1 + abs(sol.i[e.name])), e.name
    assert both >= 300, f"only {both} circuits solved by both"
    assert js_only <= 8, f"bench solved {js_only} circuits Python's solver called singular"
