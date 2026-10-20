"""ECE 201 week 10: first-order RC and RL step responses (switch at t = 0).

The key comes from the usual hand method: initial value from the circuit before
the switch moves (capacitor open / inductor short), final value from the circuit
long after, and tau = R_th C or L / R_th. The second, independent check builds the
same circuit as a netlist, finds the initial and final values by DC analysis, and
then integrates the circuit's own differential equation numerically (RK4, with
the capacitor or inductor replaced at each step by a source of its present value)
and compares the trajectory with the closed-form answer at several times.

Units are chosen so the arithmetic stays simple: RC in kΩ, µF, mA and ms;
RL in Ω, mH, A and ms (kΩ·µF = ms, mH/Ω = ms).
"""
from __future__ import annotations

import math
import random

from .circuits_dc import (KOHM, OHM, Ladder, Part, _agree, _ans, _fmt, _m, _nice, _p, _par,
                          _problem, mna)

GENERATORS: dict = {}  # filled at the bottom of this file
WEEKS: dict = {}

E1, E2, LN2 = 0.368, 0.135, 0.693
APPROX = ("Use \\(e^{-1} \\approx 0.368\\), \\(e^{-2} \\approx 0.135\\) and \\(\\ln 2 \\approx 0.693\\) "
          "where needed.")


def _rk4_check(lad, kind, store, x0, xf, tau, times):
    """Integrate the post-switch circuit numerically and compare with the formula."""
    def rate(x):
        if kind == "C":   # C dv/dt = current into the + (top) plate
            sol = mna(lad.els(closed=store["closed_after"], cap=x))
            return sol.i["C"] / store["value"]
        sol = mna(lad.els(closed=store["closed_after"], ind=x))   # L di/dt = v across L
        return lad.v_part(sol, "L") / store["value"]

    f0, f1, f2 = rate(0.0), rate(1.0), rate(2.0)
    slope = f1 - f0
    if abs((f2 - f0) - 2 * slope) > 1e-9 * (1 + abs(f2)):
        raise AssertionError("circuit equation is not first-order linear")
    _agree(-1 / slope, tau, "time constant from the netlist equation")
    _agree(-f0 / slope, xf, "equilibrium of the netlist equation")

    def f(x):
        return f0 + slope * x

    def exact(t):
        return xf + (x0 - xf) * math.exp(-t / tau)

    for t_end in times:
        n = max(200, int(400 * t_end / tau))
        h, x = t_end / n, x0
        for _ in range(n):
            k1 = f(x)
            k2 = f(x + h / 2 * k1)
            k3 = f(x + h / 2 * k2)
            k4 = f(x + h * k3)
            x += h / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        _agree(x, exact(t_end), f"RK4 vs formula at t = {t_end}", rtol=1e-7, atol=1e-8)
    return f(x0)   # the rate just after the switch


def _pick_extra(rng):
    return rng.choice(["at1", "at2", "half"])


def _extra(extra, x0, xf, tau, sym, unit, unit_m, what):
    """The fourth question: a value at t = tau or 2 tau, or the halfway time."""
    if extra in ("at1", "at2"):
        k = 1 if extra == "at1" else 2
        val = xf + (x0 - xf) * math.exp(-k)
        e = E1 if k == 1 else E2
        q = f"the value of \\({sym}\\) at \\(t = {_m(k * tau)}\\) ms"
        step = (f"At \\(t = {_m(k * tau)}\\) ms \\(= {k}\\tau\\): \\({sym} = {_p(xf)} + {_p(x0 - xf)}"
                f"e^{{-{k}}} \\approx {_p(xf)} + {_p(x0 - xf)}({e}) = {_m(round(xf + (x0 - xf) * e, 4))}"
                f"\\,{unit_m}\\).")
        return q, step, _ans(f"{what} at t = {_fmt(k * tau)} ms", val, unit,
                             max(0.02, abs(x0 - xf) * 0.002)), k * tau
    t = tau * math.log(2)
    q = (f"the time at which \\({sym}\\) is halfway from its initial value to its final value")
    step = (f"Halfway means \\(e^{{-t/\\tau}} = \\tfrac{{1}}{{2}}\\), so \\(t = \\tau\\ln 2 \\approx "
            f"{_m(tau)}(0.693) = {_m(round(tau * LN2, 4))}\\) ms.")
    return q, step, _ans("Time to reach halfway", t, "ms", 0.01), t


def rc_step(seed: int) -> dict:
    rng = random.Random(seed)
    kind = rng.choice(["closes", "opens", "series"])
    u = KOHM
    for _ in range(50000):
        R1, R2 = rng.choice([1, 2, 3, 4, 5, 6, 8, 10, 12]), rng.choice([1, 2, 3, 4, 5, 6, 8, 10, 12])
        C = rng.choice([0.5, 1, 2, 4, 5, 10])
        Vs, s = rng.choice([5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30]), rng.choice([1, 1, 1, 1, -1])
        V0 = rng.choice([-6, -4, -2, 2, 3, 4, 5, 6, 8, 10])
        div = s * Vs * R2 / (R1 + R2)
        if kind == "closes":
            x0, xf, Rth = 0.0, div, _par(R1, R2)
        elif kind == "opens":
            x0, xf, Rth = div, 0.0, R2
        else:
            x0, xf, Rth = float(V0), float(s * Vs), R1
        tau = Rth * C
        i0 = C * (xf - x0) / tau
        if (_nice(tau, 0.5, 20) and tau > 0 and _nice(Rth, 0.5) and _nice(x0, 0.5) and _nice(xf, 0.5)
                and x0 != xf and _nice(i0, 0.05)):
            break
    else:
        raise RuntimeError("no nice RC circuit found")
    extra = _pick_extra(rng)
    ask_jump = kind == "series" or rng.random() < 0.5

    src = Part("V", "V₁", Vs, f"{_fmt(Vs)} V", end="a" if s > 0 else "b")
    sw = Part("SW", "S", sw="opens" if kind == "opens" else "closes")
    cap = Part("C", "C", C, f"{_fmt(C)} µF", vmark=("v", "a"))
    p1 = Part("R", "R₁", R1, f"{_fmt(R1)} kΩ")
    if kind == "series":
        lad = Ladder([src, None, cap], [p1, sw], dx=150)
    else:
        p2 = Part("R", "R₂", R2, f"{_fmt(R2)} kΩ")
        lad = Ladder([src, None, p2, cap], [p1, sw, "wire"], dx=150)

    # second check: DC netlists for the two end states, then RK4 on the circuit equation
    before, after = kind == "opens", kind != "opens"
    if kind != "series":
        _agree(mna(lad.els(closed=before)).v[lad.node(("T", len(lad.cols) - 1))], x0, "v(0-) by DC netlist")
    _agree(mna(lad.els(closed=after)).v[lad.node(("T", len(lad.cols) - 1))], xf, "v(inf) by DC netlist")
    q4, s4, a4, t4 = _extra(extra, x0, xf, tau, "v", "V", "\\text{V}", "v")
    f0 = _rk4_check(lad, "C", {"closed_after": after, "value": C}, x0, xf, tau,
                    [0.5 * tau, tau, 2 * tau, 3 * tau, t4])
    _agree(f0 * C, i0, "i_C(0+) from the netlist")

    sv = _p(s * Vs)
    if kind == "closes":
        st = [f"For \\(t < 0\\) the switch has been open a long time, so C has discharged through "
              f"\\(R_2\\): \\(v(0^-) = 0\\). Capacitor voltage cannot jump, so \\(v(0^+) = 0\\) V.",
              f"As \\(t \\to \\infty\\), C is an open circuit and \\(R_1, R_2\\) divide the source: "
              f"\\(v(\\infty) = {sv}\\cdot\\dfrac{{{_m(R2)}}}{{{_m(R1)} + {_m(R2)}}} = {_m(xf)}\\) V.",
              f"With the source shorted, C sees \\(R_1 \\parallel R_2 = {_m(Rth)}\\) kΩ, so "
              f"\\(\\tau = R_{{th}}C = {_m(Rth)}\\cdot{_m(C)} = {_m(tau)}\\) ms."]
    elif kind == "opens":
        st = [f"For \\(t < 0\\) the switch has been closed a long time and C is an open circuit: "
              f"\\(v(0^-) = {sv}\\cdot\\dfrac{{{_m(R2)}}}{{{_m(R1)} + {_m(R2)}}} = {_m(x0)}\\) V "
              f"\\(= v(0^+)\\).",
              "After the switch opens, C can only discharge through \\(R_2\\): \\(v(\\infty) = 0\\).",
              f"\\(\\tau = R_2 C = {_m(R2)}\\cdot{_m(C)} = {_m(tau)}\\) ms."]
    else:
        st = [f"The capacitor holds its charge until the switch closes: \\(v(0^+) = v(0^-) = {_m(x0)}\\) V.",
              f"As \\(t \\to \\infty\\) the current stops, so there is no drop across \\(R_1\\): "
              f"\\(v(\\infty) = {_m(xf)}\\) V.",
              f"\\(\\tau = R_1 C = {_m(R1)}\\cdot{_m(C)} = {_m(tau)}\\) ms."]
    st.append(f"\\(v(t) = v(\\infty) + [v(0^+) - v(\\infty)]e^{{-t/\\tau}} = {_m(xf)} {'+' if x0 - xf > 0 else '-'} "
              f"{_m(abs(x0 - xf))}e^{{-t/{_m(tau)}}}\\) V (t in ms), for \\(t > 0\\).")
    st.append(s4)
    if ask_jump:
        st.append(f"\\(i(0^+) = C\\dfrac{{dv}}{{dt}}\\Big|_{{0^+}} = C\\dfrac{{v(\\infty) - v(0^+)}}{{\\tau}} = "
                  f"{_m(C)}\\cdot\\dfrac{{{_p(xf - x0)}}}{{{_m(tau)}}} = {_m(i0)}\\) mA.")
    answers = ([] if kind == "series" else [_ans("v(0+)", x0, "V")]) + [
        _ans("v(∞)", xf, "V"), _ans("Time constant τ", tau, "ms")]
    if ask_jump:
        answers.append(_ans("i(0+), capacitor current (down)", i0, "mA"))
    answers.append(a4)
    asks = (["\\(v(0^+)\\)"] if kind != "series" else []) + ["\\(v(\\infty)\\)", "the time constant \\(\\tau\\)"]
    if ask_jump:
        asks.append("the capacitor current \\(i(0^+)\\) flowing down into its + plate (mA)")
    asks.append(q4)
    pre = {"closes": "The switch has been open for a long time and closes at \\(t = 0\\).",
           "opens": "The switch has been closed for a long time and opens at \\(t = 0\\).",
           "series": (f"The capacitor was charged to \\(v(0^-) = {_m(x0)}\\) V (+ at the top) and the "
                      f"switch closes at \\(t = 0\\).")}[kind]
    text = (f"{pre} The capacitor voltage \\(v(t)\\) is marked with + at the top. Find "
            + ", ".join(asks[:-1]) + f" and {asks[-1]}. Give voltages in V, currents in mA and times "
            f"in ms. {APPROX}")
    extra_d = (f" Before t = 0 the capacitor holds {_fmt(x0)} V (+ at the top)." if kind == "series" else "")
    return _problem(text, lad.describe(extra_d.strip()), lad.svg("RC circuit with a switch at t = 0"),
                    answers, st,
                    ["DC netlists of the circuit before and after the switch give v(0-) and v(∞).",
                     "The circuit's own equation (from the netlist, C replaced by a source) has the same "
                     "τ and equilibrium; RK4 integration matches the formula at t = 0.5τ, τ, 2τ, 3τ "
                     "and at the asked time."],
                    ["RC and RL first-order circuits (natural and step response)", "capacitors"])


def rl_step(seed: int) -> dict:
    rng = random.Random(seed)
    kind = rng.choice(["series", "closes", "opens"])
    u = OHM
    for _ in range(50000):
        R1, R2 = rng.choice([2, 4, 5, 8, 10, 20]), rng.choice([2, 4, 5, 8, 10, 20])
        L = rng.choice([5, 10, 20, 40, 50, 100])
        Vs, s = rng.choice([4, 5, 6, 8, 10, 12, 16, 20, 24, 40]), rng.choice([1, 1, 1, 1, -1])
        ifin = s * Vs / R1
        if kind == "series":
            x0, xf, Rth = 0.0, ifin, R1
        elif kind == "closes":
            x0, xf, Rth = 0.0, ifin, _par(R1, R2)
        else:
            x0, xf, Rth = ifin, 0.0, R2
        tau = L / Rth
        v0 = L * (xf - x0) / tau
        if (_nice(tau, 0.25, 20) and _nice(Rth, 0.5) and _nice(x0, 0.25) and _nice(xf, 0.25)
                and x0 != xf and _nice(v0, 0.5)):
            break
    else:
        raise RuntimeError("no nice RL circuit found")
    extra = _pick_extra(rng)
    ask_jump = kind == "opens" or rng.random() < 0.4

    src = Part("V", "V₁", Vs, f"{_fmt(Vs)} V", end="a" if s > 0 else "b")
    sw = Part("SW", "S", sw="opens" if kind == "opens" else "closes")
    ind = Part("L", "L", L, f"{_fmt(L)} mH", imark=("i", "b"), vmark=("v", "a") if ask_jump else None)
    p1 = Part("R", "R₁", R1, f"{_fmt(R1)} {u.ohm}")
    if kind == "series":
        lad = Ladder([src, None, ind], [p1, sw], dx=150)
    else:
        p2 = Part("R", "R₂", R2, f"{_fmt(R2)} {u.ohm}")
        lad = Ladder([src, None, p2, ind], [p1, sw, "wire"], dx=150)

    before, after = kind == "opens", kind != "opens"
    _agree(mna(lad.els(closed=before)).i["L"], x0, "i(0-) by DC netlist")
    _agree(mna(lad.els(closed=after)).i["L"], xf, "i(inf) by DC netlist")
    q4, s4, a4, t4 = _extra(extra, x0, xf, tau, "i", "A", "\\text{A}", "i")
    f0 = _rk4_check(lad, "L", {"closed_after": after, "value": L}, x0, xf, tau,
                    [0.5 * tau, tau, 2 * tau, 3 * tau, t4])
    _agree(f0 * L, v0, "v_L(0+) from the netlist")

    sv = _p(s * Vs)
    if kind in ("series", "closes"):
        st = ["For \\(t < 0\\) the switch is open and nothing drives the inductor: \\(i(0^-) = 0\\). "
              "Inductor current cannot jump, so \\(i(0^+) = 0\\).",
              f"As \\(t \\to \\infty\\) the inductor is a short"
              + (" (which also shorts out \\(R_2\\))" if kind == "closes" else "")
              + f": \\(i(\\infty) = {sv}/{_m(R1)} = {_m(xf)}\\) A.",
              (f"With the source shorted, L sees \\(R_1 \\parallel R_2 = {_m(Rth)}\\,\\Omega\\), so "
               f"\\(\\tau = L/R_{{th}} = {_m(L)}/{_m(Rth)} = {_m(tau)}\\) ms." if kind == "closes" else
               f"\\(\\tau = L/R_1 = {_m(L)}/{_m(R1)} = {_m(tau)}\\) ms (mH/Ω = ms).")]
    else:
        st = [f"For \\(t < 0\\) the switch has been closed a long time; the inductor is a short (and "
              f"shorts \\(R_2\\)): \\(i(0^-) = {sv}/{_m(R1)} = {_m(x0)}\\) A \\(= i(0^+)\\).",
              "After the switch opens, L and \\(R_2\\) form a loop with no source: \\(i(\\infty) = 0\\).",
              f"\\(\\tau = L/R_2 = {_m(L)}/{_m(R2)} = {_m(tau)}\\) ms."]
    st.append(f"\\(i(t) = i(\\infty) + [i(0^+) - i(\\infty)]e^{{-t/\\tau}} = {_m(xf)} {'+' if x0 - xf > 0 else '-'} "
              f"{_m(abs(x0 - xf))}e^{{-t/{_m(tau)}}}\\) A (t in ms), for \\(t > 0\\).")
    st.append(s4)
    if ask_jump:
        why = (f" (the inductor's current is forced up through \\(R_2\\): \\(-{_p(x0)}\\cdot{_m(R2)}\\))"
               if kind == "opens" else "")
        st.append(f"\\(v(0^+) = L\\dfrac{{di}}{{dt}}\\Big|_{{0^+}} = L\\dfrac{{i(\\infty) - i(0^+)}}{{\\tau}} = "
                  f"{_m(L)}\\cdot\\dfrac{{{_p(xf - x0)}}}{{{_m(tau)}}} = {_m(v0)}\\) V{why}.")
    answers = ([_ans("i(0+)", x0, "A")] if kind == "opens" else []) + [
        _ans("i(∞)", xf, "A"), _ans("Time constant τ", tau, "ms")]
    if ask_jump:
        answers.append(_ans("v(0+), inductor voltage (+ at top)", v0, "V"))
    answers.append(a4)
    asks = (["\\(i(0^+)\\)"] if kind == "opens" else []) + ["\\(i(\\infty)\\)", "the time constant \\(\\tau\\)"]
    if ask_jump:
        asks.append("the inductor voltage \\(v(0^+)\\) (+ at the top)")
    asks.append(q4)
    pre = ("The switch has been open for a long time and closes at \\(t = 0\\)." if kind != "opens"
           else "The switch has been closed for a long time and opens at \\(t = 0\\).")
    text = (f"{pre} The inductor current \\(i(t)\\) flows down through L. Find " + ", ".join(asks[:-1])
            + f" and {asks[-1]}. Give currents in A, voltages in V and times in ms. {APPROX}")
    return _problem(text, lad.describe(), lad.svg("RL circuit with a switch at t = 0"), answers, st,
                    ["DC netlists of the circuit before and after the switch (inductor as a short) give "
                     "i(0-) and i(∞).",
                     "The circuit's own equation (from the netlist, L replaced by a source) has the same "
                     "τ and equilibrium; RK4 integration matches the formula at t = 0.5τ, τ, 2τ, 3τ "
                     "and at the asked time."],
                    ["RC and RL first-order circuits (natural and step response)", "inductors"])


GENERATORS.update({"rc_step": rc_step, "rl_step": rl_step})
WEEKS.update({"rc_step": 10, "rl_step": 10})
