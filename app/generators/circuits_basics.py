"""ECE 201 week 1: power, passive sign convention, charge and current.

All numbers are chosen so the problems work without a calculator.
"""
import random

import numpy as np
import sympy as sp

GENERATORS = {}  # filled at the bottom of this file

# ---- helpers ------------------------------------------------------------------


def _fmt(x: float) -> str:
    """6.0 -> '6', 0.5 -> '0.5', -2.0 -> '−2' (real minus sign)."""
    s = f"{x:g}"
    return s.replace("-", "−")


def absorbed_power(v: float, i: float, current_enters_plus: bool) -> float:
    """Passive sign convention: P = v*i when the reference current enters the + terminal."""
    return v * i if current_enters_plus else -v * i


# ---- 1. one element -------------------------------------------------------------


def element_power(seed: int) -> dict:
    rng = random.Random(seed)
    v = rng.choice([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]) * rng.choice([1, -1])
    i = rng.choice([0.5, 1, 2, 3, 4]) * rng.choice([1, -1])
    milli = rng.random() < 0.3  # sometimes the current is in mA
    plus_top = rng.random() < 0.5
    arrow_into_top = rng.random() < 0.5

    i_amps = i / 1000 if milli else i
    enters_plus = arrow_into_top == plus_top
    p = absorbed_power(v, i_amps, enters_plus)

    # Second check: flip both reference directions; the physics can't change.
    p_flipped = absorbed_power(-v, -i_amps, (not arrow_into_top) == (not plus_top))
    # Third check: flip only the voltage reference.
    p_vflip = absorbed_power(-v, i_amps, arrow_into_top == (not plus_top))
    assert np.isclose(p, p_flipped) and np.isclose(p, p_vflip), "sign-convention check failed"

    unit, scale = ("mW", 1000) if milli else ("W", 1)
    i_unit = "mA" if milli else "A"
    answer = round(p * scale, 6)
    word = "absorbs" if answer > 0 else "delivers"
    passive = "enters" if enters_plus else "leaves"

    text = (f"The element below has voltage \\(v = {_fmt(v)}\\) V with the + reference at the "
            f"{'top' if plus_top else 'bottom'} terminal, and current \\(i = {_fmt(i)}\\) {i_unit} "
            f"with the reference arrow pointing {'into' if arrow_into_top else 'out of'} the top "
            f"terminal. What power does the element absorb (in {unit})? A negative answer means "
            f"it delivers power.")
    steps = [
        f"The reference current {passive} the + terminal, so "
        + ("this is the passive sign convention: \\(p = vi\\)." if enters_plus
           else "it is not passive: \\(p = -vi\\)."),
        f"\\(p = {'' if enters_plus else '-'}({_fmt(v)}\\,\\text{{V}})({_fmt(i)}\\,\\text{{{i_unit}}}) "
        f"= {_fmt(answer)}\\,\\text{{{unit}}}\\).",
        f"Positive means absorbing, so the element {word} {_fmt(abs(answer))} {unit}.",
    ]
    diagram = (f"Diagram: a two-terminal element drawn vertically. The + mark is at the "
               f"{'top' if plus_top else 'bottom'} terminal and − at the {'bottom' if plus_top else 'top'}; "
               f"labelled v = {_fmt(v)} V. A current arrow on the top lead points "
               f"{'down, into' if arrow_into_top else 'up, out of'} the element, labelled i = {_fmt(i)} {i_unit}.")
    return {
        "statement": {"text": text, "diagram": diagram,
                      "svg": _element_svg(v, i, i_unit, plus_top, arrow_into_top)},
        "key": {"answers": [{"label": "Power absorbed", "value": answer, "unit": unit, "tol": 0.01}],
                "steps": steps,
                "checks": ["Same answer after flipping both reference directions.",
                           "Same answer after flipping only the voltage reference."]},
        "topics": ["passive sign convention", "power"],
    }


def _element_svg(v, i, i_unit, plus_top, arrow_into_top) -> str:
    top_sign, bot_sign = ("+", "−") if plus_top else ("−", "+")
    # arrow on the top lead, pointing down (into) or up (out of) the element
    arrow = ("M100 22 L100 52 M93 44 L100 54 L107 44" if arrow_into_top
             else "M100 54 L100 24 M93 32 L100 22 L107 32")
    return f"""<svg viewBox="0 0 220 200" width="220" height="200" role="img"
  aria-label="Two-terminal element with voltage and current references" class="circuit">
  <line x1="100" y1="8" x2="100" y2="62"/><line x1="100" y1="138" x2="100" y2="192"/>
  <circle cx="100" cy="8" r="3"/><circle cx="100" cy="192" r="3"/>
  <rect x="78" y="62" width="44" height="76" rx="3"/>
  <path d="{arrow}" class="arrow"/>
  <text x="112" y="40">i = {_fmt(i)} {i_unit}</text>
  <text x="132" y="80" class="sign">{top_sign}</text>
  <text x="132" y="104">v = {_fmt(v)} V</text>
  <text x="132" y="130" class="sign">{bot_sign}</text>
</svg>"""


# ---- 2. a loop of four elements -------------------------------------------------

SIDES = ["left", "top", "right", "bottom"]  # in the clockwise order the current visits them


def loop_power(seed: int) -> dict:
    rng = random.Random(seed)
    current = rng.choice([1, 2, 3, 0.5]) * rng.choice([1, 1, -1])
    while True:
        drops = [rng.choice([2, 3, 4, 5, 6, 8, 10, 12]) * rng.choice([1, -1]) for _ in range(3)]
        last = -sum(drops)
        if last != 0 and abs(last) <= 20:
            break
    drops.append(last)  # KVL: clockwise drops sum to zero
    names = ["A", "B", "C", "D"]
    plus_at_entry = [rng.random() < 0.5 for _ in range(4)]
    # the voltage written on each element, measured from its + mark to its − mark
    shown = [d if pe else -d for d, pe in zip(drops, plus_at_entry)]

    powers = []
    for d, pe, v in zip(drops, plus_at_entry, shown):
        p_from_drop = d * current  # drop along the current direction times current
        p_from_rule = absorbed_power(v, current, current_enters_plus=pe)
        assert np.isclose(p_from_drop, p_from_rule), "two power methods disagree"
        powers.append(round(p_from_rule, 6))
    assert np.isclose(sum(powers), 0), "power does not balance"

    text = (f"In the loop below, the reference current \\(I = {_fmt(current)}\\) A flows clockwise "
            "through all four elements. Each element's voltage is given with its own + and − marks. "
            "Find the power absorbed by each element (W). Then check that the four powers add to zero.")
    steps = []
    for n, side, pe, v, p in zip(names, SIDES, plus_at_entry, shown, powers):
        rule = (f"enters + → \\(p = vI = ({_fmt(v)})({_fmt(current)})" if pe
                else f"enters − → \\(p = -vI = -({_fmt(v)})({_fmt(current)})")
        steps.append(f"{n} ({side}): clockwise current {rule} = {_fmt(p)}\\) W "
                     f"({'absorbing' if p > 0 else 'delivering'}).")
    steps.append(f"Sum: \\({' + '.join(_fmt(p) for p in powers)} = 0\\). Power balances.")
    ends = {"left": ("bottom", "top"), "top": ("left", "right"),
            "right": ("top", "bottom"), "bottom": ("right", "left")}  # (entry end, exit end)
    diagram = "Diagram: a rectangular loop; the current arrow is clockwise, labelled I = " + \
        f"{_fmt(current)} A. " + " ".join(
            f"Element {n} is on the {side} side, labelled {_fmt(v)} V, with + at its "
            f"{ends[side][0] if pe else ends[side][1]} end and − at its "
            f"{ends[side][1] if pe else ends[side][0]} end."
            for n, side, v, pe in zip(names, SIDES, shown, plus_at_entry))
    return {
        "statement": {"text": text, "diagram": diagram,
                      "svg": _loop_svg(names, shown, plus_at_entry, current)},
        "key": {"answers": [{"label": f"Power absorbed by {n}", "value": p, "unit": "W", "tol": 0.01}
                            for n, p in zip(names, powers)],
                "steps": steps,
                "checks": ["Each power computed two ways (passive-sign rule and voltage drop × I).",
                           "The four powers sum to zero (conservation of energy)."]},
        "topics": ["passive sign convention", "power", "conservation of power"],
    }


def _loop_svg(names, shown, plus_at_entry, current) -> str:
    # The loop is a rectangle (x 80-320, y 50-230); the current runs clockwise:
    # up the left side, right along the top, down the right, left along the bottom.
    # For each side: element box, where the + / − mark goes at the entry and exit
    # ends of that box, and where the name label goes.
    sides = {
        "left": dict(box=(62, 110, 36, 60), entry=(106, 166), exit=(106, 120), label=(6, 145)),
        "top": dict(box=(170, 32, 60, 36), entry=(176, 88), exit=(216, 88), label=(176, 22)),
        "right": dict(box=(302, 110, 36, 60), entry=(286, 120), exit=(286, 166), label=(346, 145)),
        "bottom": dict(box=(170, 212, 60, 36), entry=(216, 204), exit=(176, 204), label=(176, 266)),
    }
    parts = ['<svg viewBox="0 0 420 280" width="420" height="280" role="img" '
             'aria-label="Loop of four elements A to D with a clockwise current" class="circuit">',
             '<rect x="80" y="50" width="240" height="180" fill="none"/>']
    for n, side, v, pe in zip(names, SIDES, shown, plus_at_entry):
        s = sides[side]
        x, y, w, h = s["box"]
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" class="element"/>')
        plus, minus = (s["entry"], s["exit"]) if pe else (s["exit"], s["entry"])
        parts.append(f'<text x="{plus[0]}" y="{plus[1]}" class="sign">+</text>')
        parts.append(f'<text x="{minus[0]}" y="{minus[1]}" class="sign">−</text>')
        lx, ly = s["label"]
        parts.append(f'<text x="{lx}" y="{ly}">{n}: {_fmt(v)} V</text>')
    # clockwise arrow in the middle of the loop
    parts.append('<path d="M165 150 A36 36 0 1 1 235 150" fill="none" class="arrow"/>'
                 '<path d="M228 142 L235 152 L242 142" fill="none" class="arrow"/>')
    parts.append(f'<text x="200" y="160" text-anchor="middle">I = {_fmt(current)} A</text>')
    parts.append("</svg>")
    return "\n".join(parts)


# ---- 3. charge and current -------------------------------------------------------

t = sp.symbols("t", nonnegative=True)


def charge_current(seed: int) -> dict:
    rng = random.Random(seed)
    kind = rng.choice(["ramp", "exp", "cos"])
    if kind == "ramp":
        k, T = rng.choice([2, 4, 6, 8]), rng.choice([1, 2, 3])
        i_expr = k * t
        q = sp.integrate(i_expr, (t, 0, T))
        q_num = np.trapezoid([k * x for x in np.linspace(0, T, 20001)], np.linspace(0, T, 20001))
        assert np.isclose(float(q), q_num, rtol=1e-6)
        text = (f"A current \\(i(t) = {k}t\\) A flows into a terminal for \\(0 \\le t \\le {T}\\) s "
                f"(t in seconds). How much charge (in C) enters the terminal over that time?")
        answers = [{"label": "Charge", "value": float(q), "unit": "C", "tol": 0.01}]
        steps = ["\\(q = \\int_0^{%d} i(t)\\,dt = \\int_0^{%d} %d t\\,dt\\)." % (T, T, k),
                 "\\(= %d \\cdot \\tfrac{t^2}{2}\\Big|_0^{%d} = %s\\) C." % (k, T, _fmt(float(q)))]
    elif kind == "exp":
        Q_mC, tau_ms = rng.choice([2, 4, 6, 10]), rng.choice([1, 2])
        Q, tau = Q_mC / 1000, tau_ms / 1000
        q_expr = Q * (1 - sp.exp(-t / tau))
        i_expr = sp.diff(q_expr, t)
        i0 = float(i_expr.subs(t, 0))
        h = 1e-9
        i0_num = (float(q_expr.subs(t, h)) - float(q_expr.subs(t, 0))) / h
        assert np.isclose(i0, i0_num, rtol=1e-4)
        assert np.isclose(i0, Q / tau)
        text = (f"The charge that has passed a point is \\(q(t) = {Q_mC}(1 - e^{{-t/\\tau}})\\) mC "
                f"with \\(\\tau = {tau_ms}\\) ms. What is the current at \\(t = 0\\) (in A)?")
        answers = [{"label": "i(0)", "value": round(i0, 9), "unit": "A", "tol": 0.001}]
        steps = ["\\(i = \\dfrac{dq}{dt} = \\dfrac{Q}{\\tau} e^{-t/\\tau}\\).",
                 f"At \\(t=0\\): \\(i(0) = Q/\\tau = {Q_mC}\\,\\text{{mC}} / {tau_ms}\\,\\text{{ms}} "
                 f"= {_fmt(round(i0, 9))}\\) A."]
    else:
        I0, w = rng.choice([1, 2, 5]), rng.choice([100, 200, 500])
        i_expr = I0 * sp.cos(w * t)
        T = sp.pi / (2 * w)
        q = float(sp.integrate(i_expr, (t, 0, T)))
        xs = np.linspace(0, float(T), 20001)
        assert np.isclose(q, np.trapezoid(I0 * np.cos(w * xs), xs), rtol=1e-6)
        q_mC = round(q * 1000, 6)
        text = (f"A current \\(i(t) = {I0}\\cos({w}t)\\) A flows into a capacitor. How much charge "
                f"(in mC) flows in from \\(t = 0\\) to \\(t = \\pi/{2 * w}\\) s, the first quarter period?")
        answers = [{"label": "Charge", "value": q_mC, "unit": "mC", "tol": 0.01}]
        steps = [f"\\(q = \\int_0^{{\\pi/{2 * w}}} {I0}\\cos({w}t)\\,dt "
                 f"= \\tfrac{{{I0}}}{{{w}}}\\sin({w}t)\\Big|_0^{{\\pi/{2 * w}}}\\).",
                 f"\\(= \\tfrac{{{I0}}}{{{w}}}(1 - 0) = {_fmt(q_mC)}\\) mC."]
    return {
        "statement": {"text": text},
        "key": {"answers": answers, "steps": steps,
                "checks": ["SymPy result matches a numerical integral / derivative."]},
        "topics": ["charge and current"],
    }


GENERATORS.update({
    "element_power": element_power,
    "loop_power": loop_power,
    "charge_current": charge_current,
})
