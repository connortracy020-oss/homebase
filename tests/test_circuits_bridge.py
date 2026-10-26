"""Generated problems open on the Circuit Bench with the same circuit: for every circuit
generator and many seeds, the bench's solution of the converted drawing must match the
generator's own (Python) solution of its ladder, node for node."""
import json
import shutil
import subprocess

import pytest

from app import config
from app.generators import bench_bridge, generate
from app.generators.circuits_dc import mna

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="Node isn't installed (only needed for the bench's solver tests)")

CIRCUITS = ["equivalent_resistance", "voltage_divider", "current_divider", "nodal_two_node", "max_power",
            "mesh_two_loop", "supermesh", "superposition", "thevenin", "rc_step", "rl_step"]


def capture(name, seed):
    """Generate a problem and keep the ladder its bench drawing came from."""
    seen = []
    real = bench_bridge.ladder_doc

    def spy(ladder, *a, **k):
        doc = real(ladder, *a, **k)
        seen.append((ladder, doc))
        return doc

    bench_bridge.ladder_doc = spy
    try:
        problem = generate(name, seed)
    finally:
        bench_bridge.ladder_doc = real
    return problem, seen


def test_generated_problems_carry_a_bench_circuit():
    for name in CIRCUITS:
        problem, seen = capture(name, 1)
        assert seen, f"{name} made no bench circuit"
        assert problem["statement"]["bench"]["format"] == "homebase-circuit"


def test_bench_matches_the_generators_own_solution(tmp_path):
    cases, expected = [], []
    for name in CIRCUITS:
        for seed in range(1, 16):
            _, seen = capture(name, seed)
            for ladder, doc in seen:
                closed = any(getattr(p, "sw", "") == "opens" for p, *_ in ladder.parts.values())
                try:
                    sol = mna(ladder.els(closed=closed))
                except (ArithmeticError, AssertionError):
                    continue
                n = len(ladder.cols)
                qs = [("T", i) for i in range(n)] + [("B", i) for i in range(n)]
                if ladder.node(("B", 0)) not in sol.v:
                    continue
                ref = sol.v[ladder.node(("B", 0))]
                cases.append({"doc": doc, "points": [list(bench_bridge.point_of(q)) for q in qs] + [list(bench_bridge.point_of(("B", 0)))]})
                # points on no part's node (an open terminal's far side) have no voltage to compare
                expected.append((name, seed, [sol.v[ladder.node(q)] - ref if ladder.node(q) in sol.v else None for q in qs]))
    assert len(cases) > 100
    path = tmp_path / "cases.json"
    path.write_text(json.dumps(cases))
    r = subprocess.run([NODE, "tests/js/docs.mjs", str(path)], cwd=config.ROOT, capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stderr[-3000:]
    results = json.loads(r.stdout)
    for (name, seed, want), got in zip(expected, results):
        assert got["ok"], f"{name} seed {seed}: the bench couldn't solve it: {got.get('errors')}"
        ref = got["v"][-1]
        for k, w in enumerate(want):
            g = got["v"][k]
            if g is None or w is None:
                continue
            assert abs((g - ref) - w) <= 1e-7 * (1 + abs(w)), f"{name} seed {seed} point {k}: bench {g - ref}, generator {w}"


def _answer(problem, label):
    return next(a["value"] for a in problem["key"]["answers"] if a["label"] == label)


def test_op_amp_and_bridge_drawings_give_the_generators_answers(tmp_path):
    """Circuits that aren't ladders are drawn by hand-made layouts; the bench must still give
    the problem's own answers: vₒ of every amplifier type, R_eq of every bridge."""
    cases, expected = [], []
    kinds = set()
    for seed in range(1, 41):
        p = generate("opamp_circuit", seed)
        doc = p["statement"]["bench"]
        ids = {q["id"] for q in doc["parts"]}
        kinds.add("summing" if "Rf" in ids else "difference" if "R3" in ids else "inverting or non-inverting")
        out = bench_bridge.SUMMING_OUT if "Rf" in ids else bench_bridge.OPAMP_OUT
        cases.append({"doc": doc, "points": [list(out)]})
        expected.append(("opamp_circuit", seed, "v", _answer(p, "v_o")))
    for seed in range(1, 21):
        p = generate("delta_wye", seed)
        doc = p["statement"]["bench"]
        kilo = any(q["params"].get("R", "").endswith("k") for q in doc["parts"])
        cases.append({"doc": doc, "points": [], "port": ["a", "b"]})
        expected.append(("delta_wye", seed, "rth", _answer(p, "R_eq") * (1000 if kilo else 1)))
    assert kinds == {"summing", "difference", "inverting or non-inverting"}
    path = tmp_path / "cases.json"
    path.write_text(json.dumps(cases))
    r = subprocess.run([NODE, "tests/js/docs.mjs", str(path)], cwd=config.ROOT, capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stderr[-3000:]
    for (name, seed, what, want), got in zip(expected, json.loads(r.stdout)):
        assert got["ok"], f"{name} seed {seed}: the bench couldn't solve it: {got.get('errors')}"
        value = got["v"][0] if what == "v" else got["rth"]
        assert abs(value - want) <= 1e-7 * (1 + abs(want)), f"{name} seed {seed}: bench {value}, generator {want}"
