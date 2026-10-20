"""ECE 200 (DSP First order): sinusoids and phasors (week 1), spectrum (2),
sampling and aliasing (3), FIR filters (4), convolution (5), FIR frequency
response (6), the DTFT (8) and the DFT (10).

Every answer is computed exactly (SymPy or integer arithmetic) and then checked
a second, independent way: numerical sampling of the signal, np.convolve,
np.fft, or a truncated series. If the two disagree the generator raises.
Numbers are chosen so each problem works without a calculator: phases are
multiples of pi/4 or pi/6 and magnitudes are integers or simple surds.
"""
import functools
import math
import random

import numpy as np
import sympy as sp

GENERATORS: dict = {}  # filled at the bottom of this file
WEEKS: dict = {}

I, PI = sp.I, sp.pi
NO_UNIT = "—"      # pure numbers (the app shows a unit beside every answer box)
PI_RAD = "π rad"   # phases are answered as multiples of pi
PI_RAD_S = "π rad/sample"

# phases (in units of pi) that are multiples of pi/4 or pi/6, in (-1, 1]
NICE_Q = sorted({sp.Rational(k, 12) for k in range(-11, 13) if k % 3 == 0 or k % 2 == 0})

# ---- helpers ------------------------------------------------------------------


def _fmt(x) -> str:
    """6.0 -> '6', 0.5 -> '0.5', -2.0 -> '−2' (real minus sign)."""
    return f"{float(x):g}".replace("-", "−")


def _num(x, nd: int = 6) -> float:
    v = round(float(x), nd)
    return 0.0 if v == 0 else v


def _tol(v) -> float:
    return 0.01 if abs(float(v)) >= 1 else 0.001


def _wrap(q):
    """Phase in units of pi -> the equivalent value in (-1, 1]."""
    q = sp.Rational(q) % 2
    return q - 2 if q > 1 else q


def _polar(z):
    """Exact complex z -> (|z|, angle/pi in (-1, 1]). Angle is None when z = 0.

    The angle is read off numerically, snapped to a multiple of pi/12 and then
    confirmed to 50 digits, so a non-nice angle raises instead of being rounded.
    """
    z = sp.expand_complex(sp.sympify(z))
    re, im = sp.simplify(sp.re(z)), sp.simplify(sp.im(z))
    mag = sp.sqrtdenest(sp.sqrt(sp.simplify(sp.expand(re ** 2 + im ** 2))))
    if abs(complex(sp.N(z, 30))) < 1e-20:
        return sp.Integer(0), None
    zc = complex(sp.N(z, 30))
    q = _wrap(sp.Rational(round(math.atan2(zc.imag, zc.real) / math.pi * 12), 12))
    err = abs(complex(sp.N(z - mag * sp.exp(I * PI * q), 60)))
    assert err < 1e-40, f"angle of {z} is not a multiple of pi/12"
    return mag, q


def _re_im(z):
    z = sp.expand_complex(sp.sympify(z))
    return sp.nsimplify(sp.simplify(sp.re(z))), sp.nsimplify(sp.simplify(sp.im(z)))


def _rect_tex(z) -> str:
    re, im = _re_im(z)
    if im == 0:
        return sp.latex(re)
    mag = sp.Abs(im)
    jpart = "j" + ("" if mag == 1 else f"\\left({sp.latex(mag)}\\right)" if mag.is_Add else sp.latex(mag))
    if re == 0:
        return ("-" if im < 0 else "") + jpart
    return f"{sp.latex(re)} {'-' if im < 0 else '+'} {jpart}"


def _phase_tex(q) -> str:
    """' + \\frac{\\pi}{4}' style tail for a cosine argument."""
    if q == 0:
        return ""
    return (" + " if q > 0 else " - ") + sp.latex(sp.Abs(q) * PI)


def _amp_tex(m) -> str:
    return "" if m == 1 else sp.latex(sp.sympify(m))


def _cos_tex(m, q, arg, fn="cos") -> str:
    return f"{_amp_tex(m)}\\{fn}({arg}{_phase_tex(q)})"


def _exp_tex(m, q) -> str:
    """m e^{j q pi} in LaTeX."""
    if q == 0 or q is None:
        return sp.latex(sp.sympify(m))
    sign = "" if q > 0 else "-"
    return f"{_amp_tex(m)}e^{{{sign}j{sp.latex(sp.Abs(q) * PI)}}}"


def _pi_tex(q) -> str:
    return sp.latex(sp.sympify(q) * PI)


def _pi_str(q) -> str:
    """Plain-text multiple of pi for labels: 0, π, π/2, 2π/3, −π/4."""
    q = sp.Rational(q)
    if q == 0:
        return "0"
    p, d = abs(q.p), q.q
    return ("−" if q < 0 else "") + ("" if p == 1 else str(p)) + "π" + ("" if d == 1 else f"/{d}")


def _ejw(n) -> str:
    """e^{-j w n} in LaTeX, simplified for n = 0, 1, -1."""
    if n == 0:
        return ""
    if n == 1:
        return "e^{-j\\hat\\omega}"
    if n == -1:
        return "e^{j\\hat\\omega}"
    return f"e^{{-j{n}\\hat\\omega}}" if n > 0 else f"e^{{j{-n}\\hat\\omega}}"


def _weighted_tex(coefs) -> str:
    """[(c, n), ...] -> c0 + c1 e^{-jw} - ..., skipping zero coefficients."""
    out = []
    for c, n in coefs:
        if c == 0:
            continue
        e = _ejw(n)
        body = (str(abs(c)) if (abs(c) != 1 or not e) else "") + e
        sign = ("-" if c < 0 else "") if not out else (" - " if c < 0 else " + ")
        out.append(sign + body)
    return "".join(out) or "0"


def _delta_tex(vals, start, var="n") -> str:
    """[2, -1, 3] starting at n=0 -> 2\\delta[n] - \\delta[n-1] + 3\\delta[n-2]."""
    out = []
    for i, v in enumerate(vals):
        if v == 0:
            continue
        k = start + i
        arg = var if k == 0 else (f"{var} - {k}" if k > 0 else f"{var} + {-k}")
        coef = "" if abs(v) == 1 else str(abs(v))
        sign = ("-" if v < 0 else "") if not out else (" - " if v < 0 else " + ")
        out.append(f"{sign}{coef}\\delta[{arg}]")
    return "".join(out) if out else "0"


def _diffeq_tex(b) -> str:
    """[2, -1, 3] -> 2x[n] - x[n-1] + 3x[n-2]."""
    out = []
    for k, v in enumerate(b):
        if v == 0:
            continue
        arg = "n" if k == 0 else f"n-{k}"
        coef = "" if abs(v) == 1 else str(abs(v))
        sign = ("-" if v < 0 else "") if not out else (" - " if v < 0 else " + ")
        out.append(f"{sign}{coef}x[{arg}]")
    return "".join(out)


def _ans(label, value, unit=NO_UNIT, tol=None) -> dict:
    v = _num(value)
    return {"label": label, "value": v, "unit": unit, "tol": _tol(v) if tol is None else tol}


def _problem(text, answers, steps, checks, topics) -> dict:
    return {"statement": {"text": text},
            "key": {"answers": answers, "steps": steps, "checks": checks},
            "topics": topics}


# ---- 1. sinusoid parameters (week 1) ------------------------------------------


def sinusoid_parameters(seed: int) -> dict:
    rng = random.Random(seed)
    if rng.random() < 0.6:
        return _sinusoid_read(rng)
    return _sinusoid_build(rng)


def _sinusoid_read(rng) -> dict:
    A = rng.choice([2, 3, 4, 5, 6, 8, 10])
    f0 = rng.choice([25, 50, 100, 125, 200, 250, 400, 500])
    q = rng.choice(NICE_Q)
    form = rng.choice(["cos", "cos", "sin", "neg"])
    wtex = f"{2 * f0}\\pi t"
    if form == "cos":
        shown, shown_tex = (A, q, "cos"), _cos_tex(A, q, wtex)
        convert = "It is already in the form \\(A\\cos(\\omega_0 t + \\varphi)\\) with \\(A > 0\\)."
    elif form == "sin":
        th = _wrap(q + sp.Rational(1, 2))  # A sin(wt + th) = A cos(wt + th - pi/2)
        shown, shown_tex = (A, th, "sin"), _cos_tex(A, th, wtex, "sin")
        convert = (f"Use \\(\\sin\\theta = \\cos(\\theta - \\pi/2)\\): the phase is "
                   f"\\({_pi_tex(th)} - \\frac{{\\pi}}{{2}} = {_pi_tex(q)}\\) (wrapped into \\((-\\pi, \\pi]\\)).")
    else:
        th = _wrap(q - 1)  # -A cos(wt + th) = A cos(wt + th + pi)
        shown, shown_tex = (-A, th, "cos"), "-" + _cos_tex(A, th, wtex)
        convert = (f"Use \\(-\\cos\\theta = \\cos(\\theta + \\pi)\\): the phase is "
                   f"\\({_pi_tex(th)} + \\pi = {_pi_tex(q)}\\) (wrapped into \\((-\\pi, \\pi]\\)).")
    T_ms = sp.Rational(1000, f0)

    # Second check: sample the formula exactly as written and measure it.
    amp, ph, fn = shown
    T = 1 / f0
    ts = np.arange(4096) / 4096 * T
    arg = 2 * np.pi * f0 * ts + float(ph) * np.pi
    xs = amp * (np.cos(arg) if fn == "cos" else np.sin(arg))
    X = 2 * np.mean(xs * np.exp(-2j * np.pi * f0 * ts))  # = A e^{j phi}
    assert np.isclose(abs(X), A) and np.isclose(np.max(xs), A, rtol=1e-5)
    d = (np.angle(X) / np.pi - float(q)) % 2
    assert min(d, 2 - d) < 1e-9, "phase check failed"
    xs_later = amp * (np.cos(arg + 2 * np.pi * f0 * T) if fn == "cos" else np.sin(arg + 2 * np.pi * f0 * T))
    assert np.allclose(xs, xs_later), "period check failed"

    text = (f"For \\(x(t) = {shown_tex}\\) (t in seconds), write it as \\(A\\cos(2\\pi f_0 t + \\varphi)\\) "
            "with \\(A > 0\\) and \\(-\\pi < \\varphi \\le \\pi\\). Give the amplitude A, the frequency "
            "\\(f_0\\) in Hz, the phase φ in units of π (−0.25 means −π/4), and the period in ms.")
    steps = [convert,
             f"Amplitude \\(A = {A}\\).",
             f"\\(\\omega_0 = {2 * f0}\\pi\\) rad/s, so \\(f_0 = \\omega_0 / 2\\pi = {f0}\\) Hz.",
             f"Period \\(T = 1/f_0 = 1/{f0}\\) s \\(= {_fmt(T_ms)}\\) ms.",
             f"Phase \\(\\varphi = {_pi_tex(q)}\\), i.e. \\({_fmt(q)}\\) in units of π."]
    return _problem(text,
                    [_ans("Amplitude A", A), _ans("Frequency f₀", f0, "Hz"),
                     _ans("Phase φ (in units of π, −1 < φ ≤ 1)", q, PI_RAD, 0.01),
                     _ans("Period T", T_ms, "ms")],
                    steps,
                    ["The formula as written was sampled over one period; its Fourier coefficient at "
                     "f₀ gives the same A and φ, and x(t + T) = x(t)."],
                    ["sinusoids (amplitude, frequency, phase, time shift)"])


def _sinusoid_build(rng) -> dict:
    A = rng.choice([2, 3, 4, 5, 6, 8, 10])
    T_ms = rng.choice([2, 4, 8, 10, 20])
    j = rng.randrange(1, 8)
    tm =sp.Rational(T_ms * j, 8)  # first positive peak at or after t = 0, in ms
    w_pi = sp.Rational(2000, T_ms)  # omega_0 / pi in rad/s
    q = _wrap(-sp.Rational(2 * j, 8))  # phi = -omega_0 t_m = -2 pi j/8

    # Second check: build x(t) from the answers and look for its first peak numerically.
    grid = np.arange(800) / 800 * T_ms / 1000  # one period, step T/800 (t_m lies on the grid)
    xs = A * np.cos(float(w_pi) * np.pi * grid + float(q) * np.pi)
    k = int(np.argmax(xs))
    assert abs(grid[k] * 1000 - float(tm)) < 1e-9 and np.isclose(xs[k], A), "peak check failed"
    assert np.allclose(xs, A * np.cos(float(w_pi) * np.pi * (grid + T_ms / 1000) + float(q) * np.pi))

    text = (f"A sinusoid \\(x(t) = A\\cos(\\omega_0 t + \\varphi)\\) swings between \\(-{A}\\) and \\({A}\\), "
            f"repeats every {T_ms} ms, and its first positive peak at or after \\(t = 0\\) is at "
            f"\\(t = {_fmt(tm)}\\) ms. Find A, \\(\\omega_0\\) in units of π rad/s, and φ in units of π "
            "with \\(-\\pi < \\varphi \\le \\pi\\).")
    steps = [f"The peak value is the amplitude: \\(A = {A}\\).",
             f"\\(\\omega_0 = 2\\pi / T = 2\\pi / ({_fmt(sp.Rational(T_ms, 1000))}\\,\\text{{s}}) = {w_pi}\\pi\\) rad/s.",
             f"A peak at \\(t_m\\) means \\(\\omega_0 t_m + \\varphi = 0\\) (mod \\(2\\pi\\)), so "
             f"\\(\\varphi = -\\omega_0 t_m = -2\\pi \\cdot \\tfrac{{{_fmt(tm)}}}{{{T_ms}}} = {_pi_tex(-sp.Rational(j, 4))}\\).",
             f"Wrapped into \\((-\\pi, \\pi]\\): \\(\\varphi = {_pi_tex(q)}\\) (\\({_fmt(q)}\\) in units of π).",
             f"So \\(x(t) = {_cos_tex(A, q, f'{w_pi}\\pi t')}\\)."]
    return _problem(text,
                    [_ans("Amplitude A", A), _ans("ω₀ (in units of π rad/s)", w_pi, "π rad/s"),
                     _ans("Phase φ (in units of π, −1 < φ ≤ 1)", q, PI_RAD, 0.01)],
                    steps,
                    ["x(t) rebuilt from the answers peaks first at the stated time and repeats with "
                     "the stated period (dense numerical search)."],
                    ["sinusoids (amplitude, frequency, phase, time shift)"])


# ---- 2. phasor addition (week 1) ----------------------------------------------


def _split(e):
    e = sp.expand(e)
    b = e.coeff(sp.sqrt(3))
    a = sp.expand(e - b * sp.sqrt(3))
    assert a.is_Integer and b.is_Integer, e
    return int(a), int(b)


@functools.lru_cache(maxsize=None)
def _nice_phasors() -> dict:
    """Phasors with nice magnitude and angle, keyed by 2z = (a + b√3) + j(c + d√3)."""
    table = {}
    for k in range(-11, 13):
        if k % 6 == 0:
            mags = [1, 2, 3, 4, 5, 6]
        elif k % 2 == 0:
            mags = [1, 2, 3, 4]
        elif k % 3 == 0:
            mags = [sp.sqrt(2), 2 * sp.sqrt(2), 3 * sp.sqrt(2)]
        else:
            continue
        q = sp.Rational(k, 12)
        for m in mags:
            z2 = sp.expand_complex(2 * m * sp.exp(I * PI * q))
            table[_split(sp.re(z2)) + _split(sp.im(z2))] = (sp.sympify(m), q)
    return table


def phasor_sum(terms):
    """[(amplitude, phase/pi), ...] -> exact (A, phase/pi) of the one equivalent cosine."""
    z = sum(sp.nsimplify(m) * sp.exp(I * PI * sp.nsimplify(q)) for m, q in terms)
    return _polar(z)


def phasor_addition(seed: int) -> dict:
    rng = random.Random(seed)
    table = _nice_phasors()
    items = sorted(table.items(), key=lambda kv: kv[0])
    n = rng.choice([2, 2, 3])
    for _ in range(50000):
        picked = rng.sample(items, n)
        if len({v[1] for _, v in picked}) < n:
            continue
        s = tuple(sum(k[i] for k, _ in picked) for i in range(4))
        if s in table and all(s != k for k, _ in picked):
            break
    else:
        raise RuntimeError("no nice phasor sum found")
    parts = [v for _, v in picked]
    A, q = phasor_sum(parts)
    assert sp.simplify(A - table[s][0]) == 0 and q == table[s][1], "lattice and SymPy sums disagree"

    f = rng.choice([10, 25, 50, 60, 100])
    # Second check: the time-domain sum equals A cos(w t + phi) at many instants.
    ts = np.linspace(0, 1 / f, 257)
    lhs = sum(float(m) * np.cos(2 * np.pi * f * ts + float(p) * np.pi) for m, p in parts)
    rhs = float(A) * np.cos(2 * np.pi * f * ts + float(q) * np.pi)
    assert np.max(np.abs(lhs - rhs)) < 1e-9, "time-domain check failed"

    wtex = f"{2 * f}\\pi t"
    x_tex = " + ".join(_cos_tex(m, p, wtex) for m, p in parts)
    z = sum(m * sp.exp(I * PI * p) for m, p in parts)
    text = (f"Write \\(x(t) = {x_tex}\\) as a single sinusoid \\(A\\cos({wtex} + \\varphi)\\) with "
            "\\(A > 0\\) and \\(-\\pi < \\varphi \\le \\pi\\). Give A (a decimal is fine) and φ in units "
            "of π (−0.25 means −π/4).")
    steps = ["All terms share \\(\\omega_0\\), so add phasors \\(X_k = A_k e^{j\\varphi_k}\\) in rectangular form."]
    for i, (m, p) in enumerate(parts, 1):
        steps.append(f"\\(X_{i} = {_exp_tex(m, p)} = {_rect_tex(m * sp.exp(I * PI * p))}\\).")
    steps.append(f"Sum: \\(X = {_rect_tex(z)}\\).")
    approx = "" if A.is_Integer else f" \\approx {float(A):.4g}"
    steps.append(f"\\(|X| = {sp.latex(A)}{approx}\\) and \\(\\angle X = {_pi_tex(q)}\\).")
    steps.append(f"So \\(x(t) = {_cos_tex(A, q, wtex)}\\).")
    return _problem(text,
                    [_ans("Amplitude A", A), _ans("Phase φ (in units of π, −1 < φ ≤ 1)", q, PI_RAD, 0.01)],
                    steps,
                    ["Phasor sum done twice: exact integer lattice in (1, √3) and SymPy.",
                     "The original sum of cosines equals A cos(ω₀t + φ) at 257 sampled instants."],
                    ["phasor addition", "complex exponentials and phasors"])


# ---- 3. two-sided spectrum (week 2) -------------------------------------------


def spectrum_reading(seed: int) -> dict:
    rng = random.Random(seed)
    f0 = rng.choice([50, 100, 200, 250])
    ms = sorted(rng.sample([1, 2, 3, 4, 5], rng.choice([1, 2, 2])))
    comps = [(rng.choice([2, 4, 6, 8, 10]), rng.choice(NICE_Q), m * f0) for m in ms]  # (A, q, f)
    dc = rng.choice([0, 0, 1, 2, 3, 4])
    lines = {}
    if dc:
        lines[0] = (sp.Integer(dc), sp.Integer(0))
    for A, q, f in comps:
        lines[f] = (sp.Rational(A, 2), q)
        lines[-f] = (sp.Rational(A, 2), _wrap(-q))
    fund = math.gcd(*[f for _, _, f in comps])

    # Second check: numerical Fourier coefficients of the time signal over one fundamental period.
    def check(signal):
        N = 4096
        ts = np.arange(N) / N / fund
        xs = signal(ts)
        hmax = max(f for _, _, f in comps) // fund + 3
        for h in range(-hmax, hmax + 1):
            X = np.mean(xs * np.exp(-2j * np.pi * h * fund * ts))
            if h * fund in lines:
                m, q = lines[h * fund]
                assert abs(X - float(m) * np.exp(1j * np.pi * float(q))) < 1e-9, "line mismatch"
            else:
                assert abs(X) < 1e-9, "unexpected spectral line"

    if rng.random() < 0.5:
        # spectrum -> signal
        shown = ", ".join(f"\\(({f}, {_exp_tex(m, q)})\\)" for f, (m, q) in sorted(lines.items()))
        check(lambda ts: dc + sum(A * np.cos(2 * np.pi * f * ts + float(q) * np.pi) for A, q, f in comps))
        text = ("A signal's two-sided spectrum has these lines, written as (frequency in Hz, complex "
                f"amplitude): {shown}. Write \\(x(t)\\) as a constant plus cosines "
                "\\(A_k\\cos(2\\pi f_k t + \\varphi_k)\\) with \\(A_k > 0\\), \\(-\\pi < \\varphi_k \\le \\pi\\). "
                "Give the DC value, each cosine's amplitude and phase (in units of π), and the "
                "fundamental frequency.")
        answers = [_ans("DC value", dc)]
        for A, q, f in comps:
            answers += [_ans(f"Amplitude of the {f} Hz cosine", A),
                        _ans(f"Phase of the {f} Hz cosine (in units of π)", q, PI_RAD, 0.01)]
        answers.append(_ans("Fundamental frequency", fund, "Hz"))
        steps = ["A line pair \\(\\tfrac{A}{2}e^{\\pm j\\varphi}\\) at \\(\\pm f\\) is one cosine "
                 "\\(A\\cos(2\\pi f t + \\varphi)\\); the line at \\(f = 0\\) is the DC value."]
        steps.append(f"DC: {'the line at 0 Hz is ' + str(dc) if dc else 'there is no line at 0 Hz, so 0'}.")
        for A, q, f in comps:
            steps.append(f"\\(\\pm{f}\\) Hz: \\(A = 2 \\times {_fmt(sp.Rational(A, 2))} = {A}\\), phase from the "
                         f"positive-frequency line \\(= {_pi_tex(q)}\\).")
        steps.append(f"Fundamental: the largest \\(f_0\\) dividing every frequency, "
                     f"\\(\\gcd({', '.join(str(f) for _, _, f in comps)}) = {fund}\\) Hz.")
    else:
        # signal -> spectrum
        sin_idx = rng.randrange(len(comps)) if rng.random() < 0.4 else -1
        terms, fns = [], []
        for i, (A, q, f) in enumerate(comps):
            if i == sin_idx:
                th = _wrap(q + sp.Rational(1, 2))
                terms.append(_cos_tex(A, th, f"2\\pi({f})t", "sin"))
                fns.append((A, th, f, np.sin))
            else:
                terms.append(_cos_tex(A, q, f"2\\pi({f})t"))
                fns.append((A, q, f, np.cos))
        x_tex = (f"{dc} + " if dc else "") + " + ".join(terms)
        check(lambda ts: dc + sum(A * fn(2 * np.pi * f * ts + float(p) * np.pi) for A, p, f, fn in fns))
        A, q, f = comps[rng.randrange(len(comps))]
        m, qn = lines[-f]
        text = (f"Sketch the two-sided spectrum of \\(x(t) = {x_tex}\\) (t in seconds). How many spectral "
                f"lines are there? Give the complex amplitude of the line at \\(f = -{f}\\) Hz as a "
                "magnitude and a phase (in units of π, in (−1, 1]), and the value of the line at 0 Hz "
                "(0 if none).")
        answers = [_ans("Number of lines", len(lines), "lines"),
                   _ans(f"Magnitude of the line at −{f} Hz", m),
                   _ans(f"Phase of the line at −{f} Hz (in units of π)", qn, PI_RAD, 0.01),
                   _ans("Line at 0 Hz", dc)]
        steps = ["Each cosine \\(A\\cos(2\\pi f t + \\varphi) = \\tfrac{A}{2}e^{j\\varphi}e^{j2\\pi f t} + "
                 "\\tfrac{A}{2}e^{-j\\varphi}e^{-j2\\pi f t}\\) gives two lines; a constant gives one at 0 Hz."]
        if sin_idx >= 0:
            Ai, qi, fi = comps[sin_idx]
            steps.append(f"Rewrite the sine with \\(\\sin\\theta = \\cos(\\theta - \\pi/2)\\): its phase is "
                         f"\\({_pi_tex(qi)}\\).")
        steps.append(f"Lines: {len(comps)} cosine(s) × 2" + (" + 1 DC line" if dc else "") + f" = {len(lines)}.")
        steps.append(f"At \\(-{f}\\) Hz: \\(\\tfrac{{{A}}}{{2}}e^{{-j\\varphi}}\\) with \\(\\varphi = {_pi_tex(q)}\\), "
                     f"i.e. \\({_exp_tex(m, qn)}\\): magnitude {_fmt(m)}, phase {_fmt(qn)}π.")
        steps.append(f"Line at 0 Hz: {dc}.")
    return _problem(text, answers, steps,
                    ["Numerical Fourier coefficients of x(t) over one fundamental period match every "
                     "line, and are zero at every other harmonic."],
                    ["two-sided spectrum", "sums of sinusoids"])


# ---- 4. sampling and aliasing (week 3) ----------------------------------------


def alias(f0, fs, q):
    """Sample A cos(2 pi f0 t + q pi) at fs. Returns (w_hat/pi in [0, 1], output Hz, output phase/pi)."""
    w = sp.Rational(2 * f0, fs) % 2  # w_hat / pi reduced into [0, 2)
    if w > 1:
        return 2 - w, (2 - w) * sp.Rational(fs, 2), _wrap(-q)
    return w, w * sp.Rational(fs, 2), _wrap(q)


def alias_frequency(seed: int) -> dict:
    rng = random.Random(seed)
    fs = rng.choice([100, 200, 500, 1000, 2000])
    k = rng.choice([k for k in range(1, 60) if k % 10])  # f0 = fs k / 20, never a multiple of fs/2
    f0 = fs * k // 20
    A = rng.randint(1, 10)
    q = rng.choice(NICE_Q)
    w_raw = sp.Rational(2 * f0, fs)
    w, f_out, q_out = alias(f0, fs, q)
    assert 0 <= f_out < sp.Rational(fs, 2)

    # Second check: the samples of the input and of the reconstructed sinusoid are identical.
    n = np.arange(64)
    x_n = A * np.cos(2 * np.pi * f0 * n / fs + float(q) * np.pi)
    y_n = A * np.cos(float(w) * np.pi * n + float(q_out) * np.pi)
    assert np.max(np.abs(x_n - y_n)) < 1e-9, "sample check failed"

    folded = (w_raw % 2) > 1
    m2 = int((w_raw - (w_raw % 2)) / 2)
    text = (f"\\(x(t) = {_cos_tex(A, q, f'2\\pi({f0})t')}\\) is sampled at \\(f_s = {fs}\\) samples/s. "
            "Write the samples as \\(x[n] = A\\cos(\\hat\\omega n + \\varphi)\\) with "
            "\\(0 \\le \\hat\\omega \\le \\pi\\), \\(-\\pi < \\varphi \\le \\pi\\). Then an ideal D-to-C "
            f"converter running at {fs} samples/s rebuilds \\(y(t)\\). Give \\(\\hat\\omega\\) in units of π, "
            "the frequency of \\(y(t)\\) in Hz, and the phase of \\(y(t)\\) in units of π.")
    steps = [f"\\(\\hat\\omega = 2\\pi f_0 / f_s = 2\\pi({f0})/{fs} = {_pi_tex(w_raw)}\\).",
             (f"Subtract \\(2\\pi \\times {m2}\\): \\({_pi_tex(w_raw % 2)}\\)." if m2 else
              f"It is already between 0 and \\(2\\pi\\).")]
    if folded:
        steps.append(f"That is above π, so fold: \\(\\cos(\\theta) = \\cos(-\\theta)\\) and "
                     f"\\(2\\pi - {_pi_tex(w_raw % 2)} = {_pi_tex(w)}\\); the phase changes sign to "
                     f"\\({_pi_tex(q_out)}\\).")
    else:
        steps.append("It is at most π, so no folding; the phase is unchanged.")
    steps.append(f"\\(x[n] = {_cos_tex(A, q_out, f'{sp.latex(w * PI)} n')}\\).")
    steps.append(f"The D-to-C converter outputs the one sinusoid below \\(f_s/2\\) with these samples: "
                 f"\\(f = \\hat\\omega f_s / 2\\pi = {_fmt(w)} \\times {fs}/2 = {_fmt(f_out)}\\) Hz, "
                 f"phase \\({_pi_tex(q_out)}\\).")
    return _problem(text,
                    [_ans("ω̂ (in units of π, 0 to 1)", w, PI_RAD_S, 0.01),
                     _ans("Frequency of y(t)", f_out, "Hz"),
                     _ans("Phase of y(t) (in units of π)", q_out, PI_RAD, 0.01)],
                    steps,
                    ["64 samples of the original x(t) equal 64 samples of the reconstructed y(t), "
                     "and y(t) lies below fs/2."],
                    ["aliasing and folding", "normalized (digital) frequency", "D/A reconstruction"])


# ---- 5. FIR filter output (week 4) --------------------------------------------


def fir_apply(b, x, n):
    """y[n] = sum_k b[k] x[n-k] for an input given as a function of n."""
    return sum(bk * x(n - k) for k, bk in enumerate(b))


def fir_output(seed: int) -> dict:
    rng = random.Random(seed)
    L = rng.choice([2, 3, 3, 4])
    b = [rng.choice([-3, -2, -1, 1, 2, 3])] + [rng.choice([-2, -1, 0, 1, 2, 3]) for _ in range(L - 2)] \
        + [rng.choice([-3, -2, -1, 1, 2, 3])]
    kind = rng.choice(["finite", "finite", "finite", "step", "impulse"])
    if kind == "finite":
        Lx = rng.choice([3, 4, 5])
        xv = [rng.choice([1, 2, 3, -1, -2])] + [rng.choice([-2, -1, 0, 1, 2, 3]) for _ in range(Lx - 1)]
        x = lambda m: xv[m] if 0 <= m < Lx else 0
        x_tex = f"x[n] = {_delta_tex(xv, 0)}"
        x_arr = xv
        ns = sorted(rng.sample(range(0, Lx + L - 1), 2))
    elif kind == "step":
        x = lambda m: 1 if m >= 0 else 0
        x_tex = "x[n] = u[n]"
        x_arr = [1] * 40
        ns = sorted(rng.sample(range(0, L + 2), 2))
    else:
        A, n0 = rng.choice([1, 2, 3, -2]), rng.choice([1, 2, 3])
        x = lambda m: A if m == n0 else 0
        x_tex = f"x[n] = {_delta_tex([A], n0)}"
        x_arr = [0] * n0 + [A]
        ns = sorted(rng.sample(range(n0, n0 + L + 1), 2))
    ys = [fir_apply(b, x, n) for n in ns]

    # Second check: np.convolve of the coefficient list with the input samples.
    conv = np.convolve(b, x_arr)
    for n, y in zip(ns, ys):
        assert (conv[n] if n < len(conv) else 0) == y, "np.convolve disagrees"

    text = (f"An FIR filter is \\(y[n] = {_diffeq_tex(b)}\\). The input is \\({x_tex}\\) "
            f"(zero before n = 0). Find \\(y[{ns[0]}]\\) and \\(y[{ns[1]}]\\).")
    steps = [f"Each output is a weighted sum of the current and past inputs: \\(y[n] = {_diffeq_tex(b)}\\)."]
    for n, y in zip(ns, ys):
        terms = " + ".join(f"({bk})({x(n - k)})" for k, bk in enumerate(b) if bk)
        steps.append(f"\\(y[{n}] = {terms} = {y}\\).")
    return _problem(text, [_ans(f"y[{n}]", y) for n, y in zip(ns, ys)], steps,
                    ["np.convolve of the filter coefficients with the input gives the same samples."],
                    ["FIR filters / difference equations", "impulse response"])


# ---- 6. convolution (week 5) --------------------------------------------------


def convolve_seq(x, nx0, h, nh0):
    """Flip-and-slide: y[n] = sum_k x[k] h[n-k]. Returns (values, first index)."""
    xd = {nx0 + i: v for i, v in enumerate(x)}
    hd = {nh0 + i: v for i, v in enumerate(h)}
    start, stop = nx0 + nh0, nx0 + nh0 + len(x) + len(h) - 2
    ys = [sum(xv * hd.get(n - k, 0) for k, xv in xd.items()) for n in range(start, stop + 1)]
    return ys, start


def convolution(seed: int) -> dict:
    rng = random.Random(seed)
    ends = [-2, -1, 1, 2, 3]
    mids = [-2, -1, 0, 1, 2, 3]

    def seq(L):
        return [rng.choice(ends)] + [rng.choice(mids) for _ in range(L - 2)] + [rng.choice(ends)]

    x, h = seq(rng.choice([2, 3, 4])), seq(rng.choice([2, 3]))
    nx0, nh0 = rng.choice([0, 0, 1, -1]), rng.choice([0, 0, 1])
    ys, start = convolve_seq(x, nx0, h, nh0)

    # Second check: np.convolve, and a third via polynomial multiplication (z-transforms).
    assert list(np.convolve(x, h)) == ys, "np.convolve disagrees"
    zi = sp.symbols("zi")  # z^{-1}
    prod = sp.Poly(sp.expand(sum(v * zi ** i for i, v in enumerate(x)) * sum(v * zi ** i for i, v in enumerate(h))), zi)
    assert [prod.coeff_monomial(zi ** i) for i in range(len(ys))] == ys, "polynomial product disagrees"

    n1, n2 = sorted(rng.sample(range(start, start + len(ys)), 2))
    text = (f"Convolve \\(x[n] = {_delta_tex(x, nx0)}\\) with \\(h[n] = {_delta_tex(h, nh0)}\\). "
            "Give the number of samples from the first nonzero output to the last, the index of the "
            f"first nonzero output, and \\(y[{n1}]\\), \\(y[{n2}]\\).")
    steps = [f"Length: \\(L_x + L_h - 1 = {len(x)} + {len(h)} - 1 = {len(ys)}\\).",
             f"First index: \\(n_x + n_h = {nx0} + {nh0} = {start}\\); last index {start + len(ys) - 1}.",
             "\\(y[n] = \\sum_k x[k]h[n-k]\\): flip h, slide it to n, multiply and add."]
    xd = {nx0 + i: v for i, v in enumerate(x)}
    hd = {nh0 + i: v for i, v in enumerate(h)}
    for n in (n1, n2):
        terms = [f"({xv})({hd[n - k]})" for k, xv in sorted(xd.items()) if n - k in hd]
        steps.append(f"\\(y[{n}] = {' + '.join(terms)} = {ys[n - start]}\\).")
    steps.append(f"Whole output from n = {start}: \\([{', '.join(str(v) for v in ys)}]\\).")
    return _problem(text,
                    [_ans("Number of output samples", len(ys), "samples"),
                     _ans("Index of first nonzero sample", start, "n"),
                     _ans(f"y[{n1}]", ys[n1 - start]), _ans(f"y[{n2}]", ys[n2 - start])],
                    steps,
                    ["Flip-and-slide sum matches np.convolve.",
                     "It also matches the coefficients of X(z)H(z) multiplied as polynomials."],
                    ["DT convolution (by hand, tables, flip-and-slide)"])


# ---- 7. FIR frequency response (week 6) ---------------------------------------


def freq_response(h, w):
    """Exact H(e^{j w pi}) = sum_k h[k] e^{-j w pi k}."""
    w = sp.nsimplify(w)
    return sp.expand_complex(sum(sp.Integer(b) * sp.exp(-I * PI * w * k) for k, b in enumerate(h)))


def _nonzero(z) -> bool:
    return abs(complex(sp.N(z, 30))) > 1e-12


def fir_frequency_response(seed: int) -> dict:
    rng = random.Random(seed)
    halves = [sp.Integer(0), sp.Rational(1, 2), sp.Integer(1)]
    for _ in range(1000):
        if rng.random() < 0.7:  # symmetric: linear phase
            L, b0 = rng.choice([2, 3, 4]), rng.choice([1, 2, 3])
            b1 = rng.choice([-2, -1, 1, 2, 3, 4])
            h = {2: [b0, b0], 3: [b0, b1, b0], 4: [b0, b1, b1, b0]}[L]
        else:  # antisymmetric
            b0 = rng.choice([1, 2, 3])
            h = rng.choice([[b0, -b0], [b0, 0, -b0]])
        w2 = rng.choice([sp.Rational(1, 3), sp.Rational(1, 2), sp.Rational(2, 3)])
        w1s = [w for w in halves if w != w2 and _nonzero(freq_response(h, w))]
        if w1s and _nonzero(freq_response(h, w2)):
            break
    else:
        raise RuntimeError("no usable filter found")
    w1 = rng.choice(w1s)
    H1, H2 = freq_response(h, w1), freq_response(h, w2)
    m1, q1 = _polar(H1)
    m2, q2 = _polar(H2)
    A, th = rng.randint(1, 5), rng.choice(NICE_Q)
    amp, ph = A * m2, _wrap(th + q2)

    # Second check: a 12-point FFT samples H at multiples of pi/6, and a simulation gives the output.
    Hf = np.fft.fft(np.array(h, dtype=float), 12)
    for w, m, q in ((w1, m1, q1), (w2, m2, q2)):
        assert abs(Hf[int(w * 6)] - float(m) * np.exp(1j * np.pi * float(q))) < 1e-9, "FFT disagrees"
    n = np.arange(48)
    xs = A * np.cos(float(w2) * np.pi * n + float(th) * np.pi)
    ys = np.convolve(h, xs)[:48]
    pred = float(amp) * np.cos(float(w2) * np.pi * n + float(ph) * np.pi)
    assert np.allclose(ys[len(h) - 1:], pred[len(h) - 1:]), "steady-state simulation disagrees"

    H_tex = _weighted_tex([(b, k) for k, b in enumerate(h)])

    def at(w, H, m, q):
        rect, pol = _rect_tex(H), _exp_tex(m, q)
        return f"\\(H = {rect}\\)" + ("" if rect == pol else f" \\(= {pol}\\)")

    text = (f"An FIR filter is \\(y[n] = {_diffeq_tex(h)}\\). "
            f"(a) Find the magnitude and phase (in units of π) of \\(H(e^{{j\\hat\\omega}})\\) at "
            f"\\(\\hat\\omega = {_pi_tex(w1)}\\). "
            f"(b) The input is \\(x[n] = {_cos_tex(A, th, f'{_pi_tex(w2)} n')}\\) for all n. "
            "Give the output amplitude and phase (in units of π, in (−1, 1]).")
    steps = [f"\\(H(e^{{j\\hat\\omega}}) = \\sum_k b_k e^{{-jk\\hat\\omega}} = {H_tex}\\)."
             + (" The coefficients are symmetric, so the phase is linear." if h == h[::-1] else
                " The coefficients are antisymmetric, so the phase is linear plus π/2."),
             f"At \\(\\hat\\omega = {_pi_tex(w1)}\\): {at(w1, H1, m1, q1)}, "
             f"so \\(|H| = {sp.latex(m1)}\\), \\(\\angle H = {_pi_tex(q1)}\\).",
             f"At \\(\\hat\\omega = {_pi_tex(w2)}\\): {at(w2, H2, m2, q2)}.",
             "A sinusoid in gives the same-frequency sinusoid out, scaled by \\(|H|\\) and shifted by \\(\\angle H\\).",
             f"Amplitude \\({A} \\times {sp.latex(m2)} = {sp.latex(amp)}\\); phase "
             f"\\({_pi_tex(th)} + ({_pi_tex(q2)}) = {_pi_tex(ph)}\\) (wrapped).",
             f"\\(y[n] = {_cos_tex(amp, ph, f'{_pi_tex(w2)} n')}\\)."]
    return _problem(text,
                    [_ans(f"|H| at ω̂ = {_pi_str(w1)}", m1),
                     _ans(f"Phase of H at ω̂ = {_pi_str(w1)} (in units of π)", q1, PI_RAD, 0.01),
                     _ans("Output amplitude", amp),
                     _ans("Output phase (in units of π)", ph, PI_RAD, 0.01)],
                    steps,
                    ["A 12-point FFT of the coefficients gives the same H at both frequencies.",
                     "Running the filter on the cosine (np.convolve) gives the predicted output once "
                     "the start-up samples pass."],
                    ["frequency response H(e^jw) of FIR filters", "sinusoidal response of LTI systems"])


# ---- 8. DTFT (week 8) ---------------------------------------------------------


def dtft_finite(x, n0, w):
    """Exact X(e^{j w pi}) for a finite sequence whose first value is at n = n0."""
    w = sp.nsimplify(w)
    return sp.expand_complex(sum(sp.Integer(v) * sp.exp(-I * PI * w * (n0 + i)) for i, v in enumerate(x)))


def dtft_pair(seed: int) -> dict:
    rng = random.Random(seed)
    w_real = rng.choice([sp.Integer(0), sp.Integer(1)])
    if rng.random() < 0.65:
        L = rng.choice([2, 3, 3, 4])
        x = [rng.choice([1, 2, 3, -1])] + [rng.choice([-2, -1, 0, 1, 2]) for _ in range(L - 2)] + [rng.choice([1, 2, -1, -2])]
        n0 = rng.choice([0, 0, -1])
        w_c = rng.choice([sp.Rational(1, 2), sp.Rational(1, 2), sp.Rational(1, 3), sp.Rational(2, 3)])
        X0, Xc = dtft_finite(x, n0, w_real), dtft_finite(x, n0, w_c)
        # Second check: a 12-point FFT samples the DTFT at multiples of pi/6 (with the shift by n0).
        F = np.fft.fft(np.array(x, dtype=float), 12)
        for w, X in ((w_real, X0), (w_c, Xc)):
            k = int(w * 6)
            assert abs(np.exp(-1j * np.pi * float(w) * n0) * F[k] - complex(sp.N(X))) < 1e-9, "FFT disagrees"
        x_tex = _delta_tex(x, n0)
        text = (f"Find the DTFT of \\(x[n] = {x_tex}\\) and evaluate it: give \\(X(e^{{j{_pi_tex(w_real)}}})\\), "
                f"and the real and imaginary parts of \\(X(e^{{j{_pi_tex(w_c)}}})\\).")
        terms = _weighted_tex([(v, n0 + i) for i, v in enumerate(x)])
        steps = [f"\\(X(e^{{j\\hat\\omega}}) = \\sum_n x[n]e^{{-j\\hat\\omega n}} = {terms}\\).",
                 f"At \\(\\hat\\omega = {_pi_tex(w_real)}\\) each \\(e^{{-j\\hat\\omega n}}\\) is "
                 f"\\({'1' if w_real == 0 else '(-1)^n'}\\), so \\(X = {sp.latex(X0)}\\).",
                 f"At \\(\\hat\\omega = {_pi_tex(w_c)}\\): use \\(e^{{-j{_pi_tex(w_c)}}} = "
                 f"{_rect_tex(sp.exp(-I * PI * w_c))}\\) and its powers.",
                 f"\\(X(e^{{j{_pi_tex(w_c)}}}) = {_rect_tex(Xc)}\\)."]
        checks = ["A 12-point FFT of the sequence (times the e^{−jω̂n₀} shift) gives the same values."]
    else:
        a = rng.choice([sp.Rational(1, 2), sp.Rational(-1, 2), sp.Rational(1, 3), sp.Rational(1, 4)])
        A = rng.choice([1, 1, 2, 3])
        w_c = sp.Rational(1, 2)
        Xf = lambda w: sp.expand_complex(sp.nsimplify(A / (1 - a * sp.exp(-I * PI * w))))
        X0, Xc = sp.simplify(Xf(w_real)), Xf(w_c)
        # Second check: truncated sum of the series itself (|a|^200 is negligible).
        nn = np.arange(200)
        for w, X in ((w_real, X0), (w_c, Xc)):
            S = np.sum(A * float(a) ** nn * np.exp(-1j * np.pi * float(w) * nn))
            assert abs(S - complex(sp.N(X))) < 1e-9, "series sum disagrees"
        a_tex = f"\\left({sp.latex(a)}\\right)"
        text = (f"Find the DTFT of \\(x[n] = {_amp_tex(A)}{a_tex}^n u[n]\\) and evaluate it: give "
                f"\\(X(e^{{j{_pi_tex(w_real)}}})\\), and the real and imaginary parts of "
                f"\\(X(e^{{j\\pi/2}})\\).")
        steps = [f"Geometric series: \\(X(e^{{j\\hat\\omega}}) = {_amp_tex(A)}\\sum_{{n\\ge 0}} "
                 f"\\left({sp.latex(a)}e^{{-j\\hat\\omega}}\\right)^n "
                 f"= \\dfrac{{{A}}}{{1 - ({sp.latex(a)})e^{{-j\\hat\\omega}}}}\\) since \\(|a| < 1\\).",
                 f"At \\(\\hat\\omega = {_pi_tex(w_real)}\\): \\(e^{{-j\\hat\\omega}} = {1 if w_real == 0 else -1}\\), so "
                 f"\\(X = {A}/({sp.latex(1 - a * (1 if w_real == 0 else -1))}) = {sp.latex(X0)}\\).",
                 f"At \\(\\hat\\omega = \\pi/2\\): \\(e^{{-j\\pi/2}} = -j\\), so \\(X = {A}/({_rect_tex(1 + a * I)})\\).",
                 f"Multiply by the conjugate: \\(X = {_rect_tex(Xc)}\\)."]
        checks = ["The closed form matches a 200-term numerical sum of the series."]
    re, im = _re_im(Xc)
    X0r = _re_im(X0)
    assert X0r[1] == 0, "X at 0 or pi should be real here"
    return _problem(text,
                    [_ans(f"X at ω̂ = {_pi_str(w_real)}", X0r[0]),
                     _ans(f"Re X at ω̂ = {_pi_str(w_c)}", re), _ans(f"Im X at ω̂ = {_pi_str(w_c)}", im)],
                    steps, checks,
                    ["DTFT definition and inverse", "DTFT pairs (impulse, boxcar/Dirichlet, exponential)"])


# ---- 9. small DFT (week 10) ---------------------------------------------------


def dft_exact(x):
    """Exact DFT X[k] = sum_n x[n] e^{-j 2 pi k n / N}."""
    N = len(x)
    return [sp.expand_complex(sum(sp.Integer(v) * sp.exp(-2 * I * PI * k * n / N) for n, v in enumerate(x)))
            for k in range(N)]


def dft_small(seed: int) -> dict:
    rng = random.Random(seed)
    N = rng.choice([4, 4, 8])
    if N == 4:
        while True:
            x = [rng.choice([-2, -1, 0, 1, 2, 3]) for _ in range(4)]
            if any(x):
                break
        ks = sorted({rng.choice([0, 2]), rng.choice([1, 3])})  # one real-valued, one complex
    else:
        pattern = rng.choice(["impulse", "pair", "box", "alt", "cos", "sparse"])
        if pattern == "impulse":
            x = [0] * 8
            x[rng.randrange(8)] = rng.choice([1, 2, 3])
        elif pattern == "pair":
            s = rng.choice([1, -1])
            x = [1, s, 0, 0, 0, 0, 0, 0]
        elif pattern == "box":
            x = [1, 1, 1, 1, 0, 0, 0, 0]
        elif pattern == "alt":
            x = [(-1) ** n for n in range(8)]
        elif pattern == "cos":
            x = [2, 0, -2, 0, 2, 0, -2, 0]
        else:
            x = [0] * 8
            for p in rng.sample(range(8), 2):
                x[p] = rng.choice([1, 2, -1])
        ks = sorted(rng.sample(range(1, 8), 2))
    X = dft_exact(x)
    # Second check: numpy's FFT.
    F = np.fft.fft(np.array(x, dtype=float))
    for k in range(N):
        assert abs(F[k] - complex(sp.N(X[k]))) < 1e-9, "np.fft disagrees"

    text = (f"Compute the {N}-point DFT \\(X[k] = \\sum_{{n=0}}^{{{N - 1}}} x[n]e^{{-j2\\pi kn/{N}}}\\) of "
            f"\\(x[n] = [{', '.join(str(v) for v in x)}]\\) for \\(n = 0, \\dots, {N - 1}\\). Give the real "
            f"and imaginary parts of {' and '.join(f'\\(X[{k}]\\)' for k in ks)}.")
    W = _rect_tex(sp.exp(-2 * I * PI / N))
    steps = [f"\\(W = e^{{-j2\\pi/{N}}} = {W}\\), so \\(X[k] = \\sum_n x[n] W^{{kn}}\\)."]
    if N == 4:
        steps.append("For N = 4 the powers of W are \\(1, -j, -1, j\\).")
    for k in ks:
        terms = " + ".join(f"({v})({_rect_tex(sp.exp(-2 * I * PI * k * n / N))})" for n, v in enumerate(x) if v)
        steps.append(f"\\(X[{k}] = {terms} = {_rect_tex(X[k])}\\).")
    answers = []
    for k in ks:
        re, im = _re_im(X[k])
        answers += [_ans(f"Re X[{k}]", re), _ans(f"Im X[{k}]", im)]
    return _problem(text, answers, steps, ["np.fft.fft gives the same coefficients."],
                    ["DFT as sampled DTFT", "DFT by hand and with np.fft"])


GENERATORS.update({
    "sinusoid_parameters": sinusoid_parameters,
    "phasor_addition": phasor_addition,
    "spectrum_reading": spectrum_reading,
    "alias_frequency": alias_frequency,
    "fir_output": fir_output,
    "convolution": convolution,
    "fir_frequency_response": fir_frequency_response,
    "dtft_pair": dtft_pair,
    "dft_small": dft_small,
})
WEEKS.update({
    "sinusoid_parameters": 1,
    "phasor_addition": 1,
    "spectrum_reading": 2,
    "alias_frequency": 3,
    "fir_output": 4,
    "convolution": 5,
    "fir_frequency_response": 6,
    "dtft_pair": 8,
    "dft_small": 10,
})
