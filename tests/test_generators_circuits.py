"""ECE 201 circuit generators (weeks 3-10): every seed builds a checked problem, the
drawings are tidy, and fixed cases match answers worked out by hand here."""
import math
import re
import xml.etree.ElementTree as ET

import pytest

from app.generators import GENERATORS, check_answer, generate
from app.generators import circuits_dc as dc
from app.generators import circuits_transient as tr

NAMES = sorted(set(dc.GENERATORS) | set(tr.GENERATORS))
SEEDS = range(1, 41)
TABLE_WEEKS = {"equivalent_resistance": 3, "voltage_divider": 3, "current_divider": 3,
               "delta_wye": 4, "nodal_two_node": 4, "mesh_two_loop": 5, "supermesh": 6,
               "superposition": 6, "thevenin": 7, "max_power": 7, "opamp_circuit": 8,
               "rc_step": 10, "rl_step": 10}


def test_registry_and_weeks():
    assert set(NAMES) == set(TABLE_WEEKS)
    assert all(n in GENERATORS for n in NAMES)
    assert {**dc.WEEKS, **tr.WEEKS} == TABLE_WEEKS


# ---- every seed ---------------------------------------------------------------------


@pytest.mark.parametrize("name", NAMES)
@pytest.mark.parametrize("seed", SEEDS)
def test_seed_builds_a_complete_problem(name, seed):
    made = generate(name, seed)   # raises if its two methods disagree
    st, key = made["statement"], made["key"]
    assert st["text"].strip()
    assert isinstance(st["diagram"], str) and len(st["diagram"]) > 80
    assert st["svg"].startswith("<svg") and 'class="circuit"' in st["svg"]
    assert key["answers"]
    for a in key["answers"]:
        assert a["label"] and a["unit"]
        assert isinstance(a["value"], float) and math.isfinite(a["value"])
        assert a["tol"] > 0
        assert check_answer(a, repr(a["value"]))
        # a student rounding to two decimals is accepted
        assert check_answer(a, f"{a['value']:.2f}"), (a, f"{a['value']:.2f}")
    assert 3 <= len(key["steps"]) <= 8 and all(isinstance(s, str) and s for s in key["steps"])
    assert key["checks"] and all(key["checks"])
    assert made["topics"]
    # balanced KaTeX delimiters in the text and every step
    for s in [st["text"]] + key["steps"]:
        assert s.count("\\(") == s.count("\\)"), s


@pytest.mark.parametrize("name", NAMES)
def test_same_seed_same_problem(name):
    assert generate(name, 11) == generate(name, 11)


def test_seeds_vary():
    for name in NAMES:
        texts = {repr(generate(name, s)["key"]["answers"]) for s in range(1, 21)}
        assert len(texts) >= 10, name


# ---- drawings: inside the viewBox, no label collisions ------------------------------


def _path_points(d):
    toks = re.findall(r"[A-Za-z]|-?\d+(?:\.\d+)?", d)
    pts, i, cmd, pad = [], 0, None, 0.0
    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
            continue
        if cmd in ("M", "L"):
            pts.append((float(toks[i]), float(toks[i + 1])))
            i += 2
        elif cmd == "A":
            pad = max(pad, float(toks[i]))
            pts.append((float(toks[i + 5]), float(toks[i + 6])))
            i += 7
        else:
            raise AssertionError(f"unexpected path command {cmd}")
    return pts, pad


def _layout_errors(svg):
    root = ET.fromstring(svg)
    vx, vy, vw, vh = map(float, root.get("viewBox").split())
    texts, segs, boxes, errs = [], [], [], []
    for el in root.iter():
        tag, cls = el.tag, el.get("class", "")
        if tag == "text":
            s = el.text or ""
            x, y = float(el.get("x")), float(el.get("y"))
            sign = cls == "sign"
            w = 10 if sign else 7.6 * len(s)
            anchor = el.get("text-anchor", "start")
            left = x - w / 2 if anchor == "middle" else x - w if anchor == "end" else x
            box = (left, y - 12, left + w, y - 1) if sign else (left, y - 11, left + w, y + 3)
            texts.append((box, sign, s))
        elif tag == "line":
            segs.append(tuple(float(el.get(k)) for k in ("x1", "y1", "x2", "y2")))
        elif tag == "rect":
            x, y, w, h = (float(el.get(k)) for k in ("x", "y", "width", "height"))
            boxes.append(("rect", (x, y, x + w, y + h)))
        elif tag == "circle":
            cx, cy, r = (float(el.get(k)) for k in ("cx", "cy", "r"))
            boxes.append(("circle", (cx - r, cy - r, cx + r, cy + r)))
        elif tag == "path":
            pts, pad = _path_points(el.get("d"))
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            kind = "arc" if (pad and "arrow" in cls) else "path"
            boxes.append((kind, (min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad)))

    def inside(b):
        return b[0] >= vx - 0.01 and b[1] >= vy - 0.01 and b[2] <= vx + vw + 0.01 and b[3] <= vy + vh + 0.01

    def overlap(a, b, eps=0.5):
        return a[0] < b[2] - eps and b[0] < a[2] - eps and a[1] < b[3] - eps and b[1] < a[3] - eps

    def hits(seg, b):   # does a segment pass through the box? (Liang-Barsky clip)
        x1, y1, x2, y2 = seg
        t0, t1, dx, dy = 0.0, 1.0, x2 - x1, y2 - y1
        for p, q in ((-dx, x1 - b[0]), (dx, b[2] - x1), (-dy, y1 - b[1]), (dy, b[3] - y1)):
            if p == 0:
                if q < 0:
                    return False
            else:
                t = q / p
                if p < 0:
                    t0 = max(t0, t)
                else:
                    t1 = min(t1, t)
        return t0 < t1 - 1e-9

    for b, _, s in texts:
        if not inside(b):
            errs.append(f"text {s!r} leaves the viewBox")
    for seg in segs:
        if not inside((min(seg[0], seg[2]), min(seg[1], seg[3]), max(seg[0], seg[2]), max(seg[1], seg[3]))):
            errs.append(f"line {seg} leaves the viewBox")
    for kind, b in boxes:
        if not inside(b):
            errs.append(f"{kind} {b} leaves the viewBox")
    for i, (b, sign, s) in enumerate(texts):
        shrunk = (b[0] + 0.5, b[1] + 0.5, b[2] - 0.5, b[3] - 0.5)
        for b2, _, s2 in texts[i + 1:]:
            if overlap(b, b2):
                errs.append(f"text {s!r} overlaps text {s2!r}")
        for seg in segs:
            if hits(seg, shrunk):
                errs.append(f"text {s!r} is crossed by line {seg}")
        if not sign:   # signs sit inside source symbols and the op-amp triangle by design
            for kind, b2 in boxes:
                if kind != "arc" and overlap(b, b2):
                    errs.append(f"text {s!r} overlaps a {kind} at {b2}")
    return errs


@pytest.mark.parametrize("name", NAMES)
def test_drawings_are_tidy(name):
    for seed in SEEDS:
        errs = _layout_errors(generate(name, seed)["statement"]["svg"])
        assert not errs, f"{name}({seed}): {errs[:4]}"


def test_layout_checker_catches_collisions():
    bad = ('<svg viewBox="0 0 100 100" class="circuit"><line x1="0" y1="50" x2="100" y2="50"/>'
           '<text x="10" y="54">R1</text><text x="12" y="54">R2</text><text x="95" y="20">far</text></svg>')
    errs = _layout_errors(bad)
    assert any("crossed by line" in e for e in errs)
    assert any("overlaps text" in e for e in errs)
    assert any("leaves the viewBox" in e for e in errs)


# ---- the independent solver, by hand -------------------------------------------------


def test_ten_parallel_ten_is_five():
    # a 1 A test current into two 10 Ω resistors in parallel: v = 5 V, so 5 Ω
    sol = dc.mna([dc.El("R", "a", 1, 0, 10), dc.El("R", "b", 1, 0, 10), dc.El("I", "t", 0, 1, 1.0)])
    assert sol.v[1] == pytest.approx(5.0)
    lad = dc.Ladder(["term", dc._R("R₁", 10, dc.OHM), dc._R("R₂", 10, dc.OHM)], ["wire", "wire"])
    sol = dc.mna(lad.els() + [dc.El("V", "t", lad.node(("T", 0)), 0, 1.0)])
    assert -1 / sol.i["t"] == pytest.approx(5.0)


def test_divider_and_power_balance_by_hand():
    # 12 V across 2 Ω + 4 Ω: 2 A, 8 V across the 4 Ω, source delivers 24 W
    sol = dc.mna([dc.El("V", "s", 1, 0, 12), dc.El("R", "a", 1, 2, 2), dc.El("R", "b", 2, 0, 4)])
    assert sol.v[2] == pytest.approx(8.0)
    assert sol.p["s"] == pytest.approx(-24.0)
    assert sol.p["a"] == pytest.approx(8.0) and sol.p["b"] == pytest.approx(16.0)


def test_inverting_amp_1k_4k_has_gain_minus_4():
    for vin in (0.5, -2.0):
        sol = dc.mna([dc.El("V", "in", 1, 0, vin), dc.El("R", "R1", 1, 2, 1), dc.El("R", "R2", 2, 3, 4),
                      dc.El("OPAMP", "U", 0, 2, out=3)])
        assert sol.v[3] == pytest.approx(-4 * vin)
        assert sol.v[2] == pytest.approx(0.0, abs=1e-12)   # virtual ground


def test_noninverting_amp_1k_3k_has_gain_4():
    sol = dc.mna([dc.El("V", "in", 1, 0, 1.5), dc.El("R", "R1", 2, 0, 1), dc.El("R", "R2", 2, 3, 3),
                  dc.El("OPAMP", "U", 1, 2, out=3)])
    assert sol.v[3] == pytest.approx(6.0)


def test_delta_of_three_30_ohm_is_wye_of_10_ohm():
    # a Δ of 30 Ω loaded at each corner behaves exactly like a Y of 10 Ω arms
    load = [dc.El("R", "x", 2, 0, 7), dc.El("R", "y", 3, 0, 5), dc.El("I", "t", 0, 1, 1.0)]
    delta = [dc.El("R", "ab", 1, 2, 30), dc.El("R", "ac", 1, 3, 30), dc.El("R", "bc", 2, 3, 30)]
    wye = [dc.El("R", "a", 1, 9, 10), dc.El("R", "b", 2, 9, 10), dc.El("R", "c", 3, 9, 10)]
    s1, s2 = dc.mna(delta + load), dc.mna(wye + load)
    for n in (1, 2, 3):
        assert s1.v[n] == pytest.approx(s2.v[n])


def test_rc_time_constant_2k_1uF_is_2ms():
    # 10 V, 2 kΩ, 1 µF, switch closes on an empty capacitor: τ = RC = 2 ms
    lad = dc.Ladder([dc.Part("V", "V₁", 10, "10 V"), None, dc.Part("C", "C", 1, "1 µF", vmark=("v", "a"))],
                    [dc.Part("R", "R₁", 2, "2 kΩ"), dc.Part("SW", "S", sw="closes")])
    tr._rk4_check(lad, "C", {"closed_after": True, "value": 1}, 0.0, 10.0, 2.0, [2.0])
    with pytest.raises(AssertionError):
        tr._rk4_check(lad, "C", {"closed_after": True, "value": 1}, 0.0, 10.0, 3.0, [2.0])
    # my own forward-Euler of i = (10 - v)/R, dv/dt = i/C: 63.2 % of the way at t = τ
    v, h = 0.0, 1e-5
    for _ in range(int(2.0 / h)):
        v += h * (10 - v) / 2 / 1
    assert v == pytest.approx(10 * (1 - math.exp(-1)), rel=1e-4)


def test_rl_time_constant_20mH_10ohm_is_2ms():
    lad = dc.Ladder([dc.Part("V", "V₁", 5, "5 V"), None, dc.Part("L", "L", 20, "20 mH", imark=("i", "b"))],
                    [dc.Part("R", "R₁", 10, "10 Ω"), dc.Part("SW", "S", sw="closes")])
    tr._rk4_check(lad, "L", {"closed_after": True, "value": 20}, 0.0, 0.5, 2.0, [2.0, 4.0])


def test_disagreement_raises():
    with pytest.raises(AssertionError):
        dc._agree(1.0, 1.001, "two methods")


# ---- fixed seeds, answers worked out by hand from the diagram ------------------------


def par(a, b):
    return a * b / (a + b)


def values(name, seed):
    return [a["value"] for a in generate(name, seed)["key"]["answers"]]


def diagram(name, seed):
    return generate(name, seed)["statement"]["diagram"]


def test_hand_equivalent_resistance_seed1():
    d = diagram("equivalent_resistance", 1)
    for s in ("R₁ = 4 Ω", "R₂ = 6 Ω", "R₃ = 1 Ω", "R₄ = 6 Ω", "R₅ = 3 Ω"):
        assert s in d
    assert values("equivalent_resistance", 1) == pytest.approx([4 + par(6, 1 + par(6, 3))])   # 6 Ω


def test_hand_voltage_divider_seed1():
    d = diagram("voltage_divider", 1)
    assert "V₁ = 36 V with + at the top" in d and "R₄ = 8 Ω; its voltage v is marked with + at the top" in d
    p = par(12, 4 + 8)                      # R2 ∥ (R3 + R4) = 6
    v_top = 36 * p / (12 + p)               # 12 V
    assert values("voltage_divider", 1) == pytest.approx([v_top * 8 / 12, (36 - v_top) / 12])   # 8 V, 2 A


def test_hand_current_divider_seed2():
    d = diagram("current_divider", 2)
    assert "I₁ = 9 A with its arrow pointing up" in d and "R₃ = 6 Ω; a current i" in d
    v = 9 / (1 / 8 + 1 / 12 + 1 / 6)        # 24 V
    assert values("current_divider", 2) == pytest.approx([v / 6, v])


def test_hand_delta_wye_seed1():
    d = diagram("delta_wye", 1)
    assert "R₁ = 24 Ω" in d and "R₃ = 32 Ω" in d and "R₅ = 10 Ω" in d
    S = 24 + 8 + 32
    ra, rc, rd = 24 * 8 / S, 24 * 32 / S, 8 * 32 / S        # 3, 12, 4
    assert values("delta_wye", 1) == pytest.approx([ra, rc, rd, ra + par(rc + 2, rd + 10)])   # R_eq 10


def test_hand_nodal_seed1():
    d = diagram("nodal_two_node", 1)
    assert "I₁ = 8 A with its arrow pointing up" in d and "I₂ = 10 A with its arrow pointing down" in d
    # KCL by hand: v1/10 + (v1-v2)/4 = 8 and (v2-v1)/4 + v2/1 = -10 -> v1 = 20, v2 = -4
    v1, v2 = values("nodal_two_node", 1)
    assert (v1, v2) == pytest.approx((20, -4))
    assert v1 / 10 + (v1 - v2) / 4 == pytest.approx(8)
    assert (v2 - v1) / 4 + v2 == pytest.approx(-10)


def test_hand_mesh_seed2():
    d = diagram("mesh_two_loop", 2)
    assert "V₁ = 11 V with + at the bottom" in d and "V₂ = 17 V with + at the top" in d
    # mesh 1: 11 + 2I1 + 5(I1-I2) = 0; mesh 2: 5(I2-I1) + 1*I2 + 1*I2 + 17 = 0
    I1, I2, ix = values("mesh_two_loop", 2)
    assert 11 + 2 * I1 + 5 * (I1 - I2) == pytest.approx(0)
    assert 5 * (I2 - I1) + 2 * I2 + 17 == pytest.approx(0)
    assert (I1, I2, ix) == pytest.approx((-6.75, -7.25, 0.5))


def test_hand_supermesh_seed1():
    d = diagram("supermesh", 1)
    assert "Iₛ = 1.5 A with its arrow pointing down" in d
    # I1 - I2 = 1.5; -18 + (8+2) I1 + 4 I2 + 17 = 0 -> I2 = -1, I1 = 0.5; v = 18 - 10(0.5) = 13
    assert values("supermesh", 1) == pytest.approx([0.5, -1.0, 13.0])


def test_hand_superposition_seed6():
    d = diagram("superposition", 6)
    assert "V₁ = 20 V with + at the top" in d and "V₂ = 30 V with + at the top" in d
    i1 = 20 * par(2, 6) / (6 + par(2, 6)) / 2      # 2 A
    i2 = 30 * par(6, 2) / (6 + par(6, 2)) / 2      # 3 A
    assert values("superposition", 6) == pytest.approx([i1, i2, i1 + i2])


def test_hand_thevenin_seed3_vcvs():
    d = diagram("thevenin", 3)
    assert "0.5vₓ with + at the right" in d and "R₁ = 12 Ω" in d
    vx = 6 * 6 / (12 + 6)
    assert values("thevenin", 3) == pytest.approx([1.5 * vx, 4 + 1.5 * par(12, 6)])   # 3 V, 10 Ω


def test_hand_thevenin_seed6_cccs():
    d = diagram("thevenin", 6)
    assert "0.5iₓ, arrow pointing up" in d and "+ at the bottom" in d
    # node: 1.5(-16 - v)/2 = v/4 -> v = -12; test source: R_th = 5 + 1/(1.5/2 + 1/4) = 6
    assert values("thevenin", 6) == pytest.approx([-12.0, 6.0])


def test_hand_max_power_seed2():
    d = diagram("max_power", 2)
    assert "V₁ = 12 V" in d and "R₃ = 2 Ω" in d
    vth, rth = 12 * 2 / 4, 2 + par(2, 2)
    assert values("max_power", 2) == pytest.approx([rth, vth ** 2 / (4 * rth)])   # 3 Ω, 3 W


def test_hand_opamp_seed6_inverting_1k_4k():
    d = diagram("opamp_circuit", 6)
    assert "inverting amplifier" in d and "R₁ = 1 kΩ" in d and "R₂ = 4 kΩ" in d and "v₁ = 0.2 V" in d
    assert values("opamp_circuit", 6) == pytest.approx([-4.0, -0.8])


def test_hand_rc_seed3():
    d = diagram("rc_step", 3)
    assert "V₁ = 18 V" in d and "R₁ = 2 kΩ" in d and "R₂ = 2 kΩ" in d and "C = 5 µF" in d
    tau = par(2, 2) * 5                    # 5 ms
    vf = 18 * 2 / 4                        # 9 V
    assert values("rc_step", 3) == pytest.approx([0, vf, tau, 5 * vf / tau, vf * (1 - math.exp(-2))])


def test_hand_rl_seed6_opening_switch():
    d = diagram("rl_step", 6)
    assert "opening at t = 0" in d and "R₂ = 8 Ω" in d and "L = 20 mH" in d and "V₁ = 4 V" in d
    i0, tau = 4 / 2, 20 / 8                # 2 A, 2.5 ms
    assert values("rl_step", 6) == pytest.approx([i0, 0, tau, -i0 * 8, i0 * math.exp(-1)])
