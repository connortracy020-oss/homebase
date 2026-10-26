"""The Circuit Bench's AC (phasor) solver against an independent one: random circuits of
resistors, capacitors, inductors, sine sources and dependent sources, solved here with NumPy
in admittance form (inductors as 1/(jωL), not the bench's jωL branch), node by node."""
import cmath
import json
import random
import shutil
import subprocess

import numpy as np
import pytest

from app import config

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="Node isn't installed (only needed for the bench's solver tests)")

W = 1000.0  # rad/s


def node_name(n):
    return 0 if n == 0 else f"n{n}"


def passive_value(rng, kind):
    """Values whose impedances at 1000 rad/s are all within a few decades of each other."""
    return {"R": rng.choice([1, 2, 5, 10, 22, 47, 100]), "C": rng.choice([1, 2, 4.7, 10, 22]) * 1e-5,
            "L": rng.choice([1, 2, 4.7, 10, 22]) * 1e-3}[kind]


def random_circuit(rng):
    n = rng.randint(2, 6)
    els = []

    def add(kind, a, b, **kw):
        els.append({"kind": kind, "id": f"{kind}{len(els) + 1}", "a": a, "b": b, **kw})

    # a spanning tree of passive parts keeps every node connected to ground
    for k in range(1, n + 1):
        kind = rng.choice("RRCL")
        add(kind, k, rng.randrange(0, k), value=passive_value(rng, kind))
    for _ in range(rng.randint(0, n)):
        a, b = rng.sample(range(n + 1), 2)
        kind = rng.choice("RCL")
        add(kind, a, b, value=passive_value(rng, kind))
    a = rng.randrange(1, n + 1)
    add("V", a, 0, amp=rng.choice([1, 2, 5, 10]), ph=rng.choice([0, 30, -45, 90, 120]))
    for _ in range(rng.randint(0, 2)):
        a, b = rng.sample(range(n + 1), 2)
        add("I", a, b, amp=rng.choice([0.1, 0.5, 1]), ph=rng.choice([0, 60, -90]))
    if rng.random() < 0.5:
        a, b, cp, cn = (rng.randrange(0, n + 1) for _ in range(4))
        if a != b and cp != cn:
            add("G", a, b, gain=rng.choice([0.01, -0.02, 0.05]), cp=cp, cn=cn)
    if rng.random() < 0.4:
        a, b, cp, cn = (rng.randrange(0, n + 1) for _ in range(4))
        if a != b and cp != cn:
            add("E", a, b, gain=rng.choice([2, -1, 0.5]), cp=cp, cn=cn)
    return n, els


def numpy_solve(n, els):
    """Admittance-form MNA: node voltages, plus one current per V and E branch."""
    branches = [e for e in els if e["kind"] in ("V", "E")]
    size = n + len(branches)
    A = np.zeros((size, size), dtype=complex)
    rhs = np.zeros(size, dtype=complex)

    def stamp_y(a, b, y):
        for i, j, s in ((a, a, 1), (b, b, 1), (a, b, -1), (b, a, -1)):
            if i and j:
                A[i - 1, j - 1] += s * y

    def inject(node, i):  # current i flowing into node
        if node:
            rhs[node - 1] += i

    for e in els:
        k, a, b = e["kind"], e["a"], e["b"]
        if k == "R":
            stamp_y(a, b, 1 / e["value"])
        elif k == "C":
            stamp_y(a, b, 1j * W * e["value"])
        elif k == "L":
            stamp_y(a, b, 1 / (1j * W * e["value"]))
        elif k == "I":   # the bench's arrow points at pin a: the current leaves the source there
            i = e["amp"] * cmath.exp(1j * np.radians(e["ph"]))
            inject(a, i)
            inject(b, -i)
        elif k == "G":   # gain · (v_cp − v_cn) leaves at pin a
            for node, sign in ((a, 1), (b, -1)):
                if node:
                    for cnode, cs in ((e["cp"], 1), (e["cn"], -1)):
                        if cnode:
                            A[node - 1, cnode - 1] -= sign * cs * e["gain"]
    for j, e in enumerate(branches):
        r = n + j
        a, b = e["a"], e["b"]
        if a:
            A[a - 1, r] += 1   # branch current enters pin a and leaves pin b
            A[r, a - 1] += 1
        if b:
            A[b - 1, r] -= 1
            A[r, b - 1] -= 1
        if e["kind"] == "V":
            rhs[r] = e["amp"] * cmath.exp(1j * np.radians(e["ph"]))
        else:
            for cnode, cs in ((e["cp"], 1), (e["cn"], -1)):
                if cnode:
                    A[r, cnode - 1] -= cs * e["gain"]
    if np.linalg.cond(A) > 1e10:
        return None
    x = np.linalg.solve(A, rhs)
    return {node_name(k): x[k - 1] for k in range(1, n + 1)}


def to_bench(els):
    out = []
    for e in els:
        k, nodes = e["kind"], [node_name(e["a"]), node_name(e["b"])]
        if k in "RCL":
            out.append({"id": e["id"], "type": k, "nodes": nodes, "params": {k: repr(e["value"])}})
        elif k in ("V", "I"):
            out.append({"id": e["id"], "type": k, "nodes": nodes,
                        "params": {"wave": "sine", f"{k}m": repr(e["amp"]), "w": repr(W), "ph": repr(e["ph"])}})
        else:
            ctrl = f"v({node_name(e['cp'])}, {node_name(e['cn'])})".replace("v(0, ", "-v(").replace(", 0)", ")")
            out.append({"id": e["id"], "type": k, "nodes": nodes, "params": {"gain": repr(e["gain"]), "ctrl": ctrl}})
    return out


def test_bench_ac_matches_an_independent_solver(tmp_path):
    rng = random.Random(201)
    vectors, expected = [], []
    while len(vectors) < 300:
        n, els = random_circuit(rng)
        want = numpy_solve(n, els)
        if want is None:
            continue
        # controls name nodes by label; skip the rare control that refers to ground on both sides
        bench = to_bench(els)
        if any("v()" in (e["params"].get("ctrl") or "") for e in bench):
            continue
        vectors.append({"omega": W, "elements": bench})
        expected.append(want)
    path = tmp_path / "ac.json"
    path.write_text(json.dumps(vectors))
    r = subprocess.run([NODE, "tests/js/acvectors.mjs", str(path)], cwd=config.ROOT, capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stderr[-3000:]
    results = json.loads(r.stdout)
    compared = 0
    for k, (want, got) in enumerate(zip(expected, results)):
        if not got["ok"]:
            # the bench may refuse what NumPy solves only for a structural reason it names
            assert set(got["codes"]) <= {"LOOP", "FLOATING", "SINGULAR"}, (k, got)
            continue
        for name, z in want.items():
            g = complex(*got["v"][name])
            assert abs(g - z) <= 1e-7 * (1 + abs(z)), f"vector {k} node {name}: bench {g}, numpy {z}"
        compared += 1
    assert compared > 250
