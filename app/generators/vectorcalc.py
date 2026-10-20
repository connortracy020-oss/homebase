"""MTH 254 (vector calculus) generators: dot and cross products (week 1), planes
and lines (2), arc length (3), gradient (5), tangent planes and critical points
(6), double integrals (7, polar from week 8) and triple integrals (9).

Every answer is computed exactly (integer/Fraction arithmetic or SymPy) and then
checked a second, independent way: numpy, a geometric identity, numerical
differentiation, a polyline length, or Gauss-Legendre quadrature in Cartesian
coordinates. If the two disagree the generator raises. Numbers are chosen so
each problem works without a calculator.
"""
import itertools
import math
import random
from fractions import Fraction

import numpy as np
import sympy as sp

GENERATORS: dict = {}  # filled at the bottom of this file
WEEKS: dict = {}

x, y, z, t = sp.symbols("x y z t", real=True)
r, theta, phi, rho = sp.symbols("r theta phi rho", nonnegative=True)
PI = sp.pi
NO_UNIT = "—"   # pure numbers (the app shows a unit beside every answer box)
TYPE_LABEL = "(1 = min, −1 = max, 0 = saddle)"

# ---- helpers ------------------------------------------------------------------


def _fmt(v) -> str:
    return f"{float(v):g}".replace("-", "−")


def _num(v, nd: int = 6) -> float:
    out = round(float(v), nd)
    return 0.0 if out == 0 else out


def _tol(v) -> float:
    return 0.01 if abs(float(v)) >= 1 else 0.001


def _ans(label, value, unit=NO_UNIT, tol=None) -> dict:
    v = _num(value)
    return {"label": label, "value": v, "unit": unit, "tol": _tol(v) if tol is None else tol}


def _problem(text, answers, steps, checks, topics) -> dict:
    return {"statement": {"text": text},
            "key": {"answers": answers, "steps": steps, "checks": checks},
            "topics": topics}


def _q(v) -> str:
    """Exact rational/Fraction/SymPy value as LaTeX."""
    if isinstance(v, Fraction):
        v = sp.Rational(v.numerator, v.denominator)
    return sp.latex(sp.sympify(v))


def _vec_tex(v) -> str:
    return "\\langle " + ", ".join(_q(c) for c in v) + " \\rangle"


def _pt_tex(v) -> str:
    return "(" + ", ".join(_q(c) for c in v) + ")"


def _dot(a, b):
    return sum(p * q for p, q in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _sub(a, b):
    return tuple(p - q for p, q in zip(a, b))


def _add(a, b):
    return tuple(p + q for p, q in zip(a, b))


def _scale(k, a):
    return tuple(k * p for p in a)


def _isqrt_exact(n):
    """Integer square root if n is a perfect square (n a non-negative int or Fraction), else None."""
    n = Fraction(n)
    a, b = math.isqrt(n.numerator), math.isqrt(n.denominator)
    return Fraction(a, b) if a * a == n.numerator and b * b == n.denominator else None


def _ig(e) -> str:
    """Integrand LaTeX, parenthesized when it is a sum."""
    s = sp.latex(e)
    return f"\\left({s}\\right)" if sp.sympify(e).is_Add else s


def _lin_tex(p, q, var="t") -> str:
    """p + q t with tidy signs: 3 - 2t, t, -1 + t, 4."""
    if q == 0:
        return str(p)
    qt = ("" if abs(q) == 1 else str(abs(q))) + var
    if p == 0:
        return ("-" if q < 0 else "") + qt
    return f"{p} {'-' if q < 0 else '+'} {qt}"


def _plane_tex(n, d) -> str:
    out = []
    for c, var in zip(n, "xyz"):
        if c == 0:
            continue
        coef = "" if abs(c) == 1 else str(abs(c))
        sign = ("-" if c < 0 else "") if not out else (" - " if c < 0 else " + ")
        out.append(f"{sign}{coef}{var}")
    return "".join(out) + f" = {d}"


def _value_answer(label, val, unit=None) -> dict:
    """An exact value; when it is a rational multiple of pi, answer in units of pi."""
    val = sp.nsimplify(sp.simplify(val))
    q = sp.simplify(val / PI)
    if val.has(PI) and q.is_rational:
        return _ans(f"{label} (in units of π)", q, "π " + unit if unit else "π")
    return _ans(label, val, unit or NO_UNIT)


_VECS = [v for v in itertools.product(range(-3, 4), repeat=3) if any(v)]

# ---- 1. dot product and angle (week 1) ----------------------------------------

# angle in degrees -> (cos^2, sign of cos), and its exact cosine for the steps
_ANGLES = {30: (Fraction(3, 4), 1), 45: (Fraction(1, 2), 1), 60: (Fraction(1, 4), 1), 90: (Fraction(0), 0),
           120: (Fraction(1, 4), -1), 135: (Fraction(1, 2), -1), 150: (Fraction(3, 4), -1)}
_COS_TEX = {30: "\\frac{\\sqrt{3}}{2}", 45: "\\frac{\\sqrt{2}}{2}", 60: "\\frac{1}{2}", 90: "0",
            120: "-\\frac{1}{2}", 135: "-\\frac{\\sqrt{2}}{2}", 150: "-\\frac{\\sqrt{3}}{2}"}


def angle_between(a, b):
    """Exact angle in degrees if it is one of the nice ones (or 0/180), else None."""
    d = _dot(a, b)
    c2 = Fraction(d * d, _dot(a, a) * _dot(b, b))
    s = (d > 0) - (d < 0)
    if c2 == 1:
        return 0 if s > 0 else 180
    for deg, (cc, sign) in _ANGLES.items():
        if c2 == cc and s == sign:
            return deg
    return None


def dot_angle(seed: int) -> dict:
    rng = random.Random(seed)
    deg = rng.choice(list(_ANGLES))
    for _ in range(400):
        a = rng.choice(_VECS)
        cands = [b for b in _VECS if _cross(a, b) != (0, 0, 0) and angle_between(a, b) == deg]
        if cands:
            b = rng.choice(cands)
            break
    else:
        raise RuntimeError("no vector pair found")
    d, na, nb = _dot(a, b), _dot(a, a), _dot(b, b)
    proj = tuple(Fraction(d, na) * c for c in a)

    # Second check: numpy's arccos, the law of cosines, and the projection's geometry.
    an, bn = np.array(a, float), np.array(b, float)
    deg_np = math.degrees(math.acos(np.dot(an, bn) / (np.linalg.norm(an) * np.linalg.norm(bn))))
    assert abs(deg_np - deg) < 1e-9, "numpy angle disagrees"
    lhs = np.dot(an - bn, an - bn)
    rhs = na + nb - 2 * math.sqrt(na * nb) * math.cos(math.radians(deg))
    assert abs(lhs - rhs) < 1e-9, "law of cosines fails"
    assert _dot(_sub(b, proj), a) == 0 and _cross(proj, a) == (0, 0, 0), "projection check failed"

    text = (f"Let \\(\\mathbf a = {_vec_tex(a)}\\) and \\(\\mathbf b = {_vec_tex(b)}\\). Find "
            "\\(\\mathbf a\\cdot\\mathbf b\\), the angle between the vectors in degrees, and the "
            "components of the vector projection \\(\\operatorname{proj}_{\\mathbf a}\\mathbf b\\).")
    steps = [f"\\(\\mathbf a\\cdot\\mathbf b = {' + '.join(f'({p})({q})' for p, q in zip(a, b))} = {d}\\).",
             f"\\(|\\mathbf a| = \\sqrt{{{na}}}\\), \\(|\\mathbf b| = \\sqrt{{{nb}}}\\).",
             f"\\(\\cos\\theta = \\dfrac{{{d}}}{{\\sqrt{{{na}}}\\sqrt{{{nb}}}}} = \\dfrac{{{d}}}{{\\sqrt{{{na * nb}}}}} "
             f"= {_COS_TEX[deg]}\\), so \\(\\theta = {deg}^\\circ\\).",
             f"\\(\\operatorname{{proj}}_{{\\mathbf a}}\\mathbf b = \\dfrac{{\\mathbf a\\cdot\\mathbf b}}{{|\\mathbf a|^2}}\\mathbf a "
             f"= \\dfrac{{{d}}}{{{na}}}{_vec_tex(a)} = {_vec_tex(proj)}\\)."]
    return _problem(text,
                    [_ans("a · b", d), _ans("Angle θ", deg, "°", 0.5)]
                    + [_ans(f"proj {c}-component", p) for c, p in zip("xyz", proj)],
                    steps,
                    ["numpy arccos gives the same angle; the law of cosines holds with it.",
                     "b − proj is perpendicular to a and proj is parallel to a (exact)."],
                    ["dot product, projections"])


# ---- 2. cross product and area (week 1) ---------------------------------------


def cross_area(seed: int) -> dict:
    rng = random.Random(seed)
    triangle = rng.random() < 0.5
    want_square = rng.random() < 0.5
    small = [v for v in _VECS if max(map(abs, v)) <= 3]
    for _ in range(500):
        a, b = rng.choice(small), rng.choice(small)
        c = _cross(a, b)
        if c == (0, 0, 0):
            continue
        n2 = _dot(c, c)
        if (_isqrt_exact(n2) is not None) == want_square:
            break
    n2 = _dot(c, c)

    # Second check: numpy's cross product, the Lagrange identity, and perpendicularity.
    assert tuple(int(v) for v in np.cross(a, b)) == c, "numpy cross disagrees"
    assert n2 == _dot(a, a) * _dot(b, b) - _dot(a, b) ** 2, "Lagrange identity fails"
    assert _dot(c, a) == 0 and _dot(c, b) == 0, "cross product not perpendicular"

    root = _isqrt_exact(n2)
    if triangle:
        P = tuple(rng.randint(-2, 2) for _ in range(3))
        Q, R = _add(P, a), _add(P, b)
        what = (f"the triangle with vertices \\(P{_pt_tex(P)}\\), \\(Q{_pt_tex(Q)}\\), \\(R{_pt_tex(R)}\\)")
        vecs = (f"\\(\\vec{{PQ}} = {_vec_tex(a)}\\), \\(\\vec{{PR}} = {_vec_tex(b)}\\)")
        cross_name = "\\vec{PQ}\\times\\vec{PR}"
        factor = Fraction(1, 2)
    else:
        what = (f"the parallelogram spanned by \\(\\mathbf a = {_vec_tex(a)}\\) and \\(\\mathbf b = {_vec_tex(b)}\\)")
        vecs = "Use \\(\\mathbf a\\) and \\(\\mathbf b\\) directly"
        cross_name = "\\mathbf a\\times\\mathbf b"
        factor = Fraction(1)
    shape = "triangle" if triangle else "parallelogram"
    if root is not None:
        area = factor * root
        ask = "its area"
        area_ans = _ans(f"Area of the {shape}", area, "units²")
        last = f"Area \\(= {'\\tfrac12' if triangle else ''}\\sqrt{{{n2}}} = {_q(area)}\\)."
    else:
        area2 = factor * factor * n2
        ask = "the square of its area (area²)"
        area_ans = _ans(f"Area² of the {shape}", area2, "units⁴")
        last = (f"Area \\(= {'\\tfrac12' if triangle else ''}\\sqrt{{{n2}}}\\), so "
                f"area² \\(= {_q(area2)}\\).")
    text = (f"For {what}, find the components of \\({cross_name}\\) and {ask}.")
    steps = [vecs + ".",
             f"\\({cross_name} = \\langle ({a[1]})({b[2]}) - ({a[2]})({b[1]}),\\ ({a[2]})({b[0]}) - ({a[0]})({b[2]}),"
             f"\\ ({a[0]})({b[1]}) - ({a[1]})({b[0]}) \\rangle = {_vec_tex(c)}\\).",
             f"\\(|{cross_name}|^2 = {' + '.join(f'({v})^2' for v in c)} = {n2}\\).",
             ("The triangle is half the parallelogram. " if triangle else "") + last]
    return _problem(text,
                    [_ans(f"{cname}-component of the cross product", v) for cname, v in zip("xyz", c)]
                    + [area_ans],
                    steps,
                    ["numpy.cross matches; |a×b|² = |a|²|b|² − (a·b)² holds; a×b is perpendicular to both."],
                    ["cross product"])


# ---- 3. plane through three points (week 2) -----------------------------------

_NORMALS = sorted({tuple(s * c for s, c in zip(signs, perm))
                   for base in [(1, 2, 2), (2, 3, 6), (3, 4, 0)]
                   for perm in itertools.permutations(base)
                   for signs in itertools.product([1, -1], repeat=3)
                   if perm[0] > 0 and signs[0] == 1})


def plane_through(P, Q, R):
    """(a, b, c, d) with ax + by + cz = d through three points, integers, gcd 1, first nonzero > 0."""
    n = _cross(_sub(Q, P), _sub(R, P))
    g = math.gcd(*n)
    n = tuple(v // g for v in n)
    if next(v for v in n if v) < 0:
        n = _scale(-1, n)
    return n + (_dot(n, P),)


def plane_through_points(seed: int) -> dict:
    rng = random.Random(seed)
    n = rng.choice(_NORMALS)
    P = tuple(rng.randint(-2, 2) for _ in range(3))
    inplane = [u for u in itertools.product(range(-4, 5), repeat=3) if any(u) and _dot(u, n) == 0]
    for _ in range(1000):
        u, v = rng.sample(inplane, 2)
        if _cross(u, v) != (0, 0, 0):
            break
    else:
        raise RuntimeError("no two independent in-plane vectors")
    Q, R = _add(P, u), _add(P, v)
    a, b, c, d = plane_through(P, Q, R)
    assert (a, b, c) == n, "normal from the points is not the planted normal"
    while True:
        S = tuple(rng.randint(-3, 3) for _ in range(3))
        if _dot(n, S) != d:
            break
    nn = math.isqrt(_dot(n, n))
    dist = Fraction(abs(_dot(n, S) - d), nn)

    # Second check: all three points satisfy the equation; numpy distance via the foot of the perpendicular.
    assert all(_dot(n, p) == d for p in (P, Q, R))
    Sn, nv = np.array(S, float), np.array(n, float)
    k = sp.symbols("k")
    k0 = sp.solve(sp.Eq(sum(nc * (sc + k * nc) for nc, sc in zip(n, S)), d), k)[0]
    foot = Sn + float(k0) * nv
    assert abs(np.dot(nv, foot) - d) < 1e-9 and abs(np.linalg.norm(Sn - foot) - float(dist)) < 1e-9

    m = _cross(_sub(Q, P), _sub(R, P))
    text = (f"Find the plane through \\(P{_pt_tex(P)}\\), \\(Q{_pt_tex(Q)}\\) and \\(R{_pt_tex(R)}\\) in the "
            "form \\(ax + by + cz = d\\) with integer coefficients that share no common factor and "
            f"\\(a > 0\\). Then find the distance from \\(S{_pt_tex(S)}\\) to the plane.")
    steps = [f"\\(\\vec{{PQ}} = {_vec_tex(u)}\\), \\(\\vec{{PR}} = {_vec_tex(v)}\\).",
             f"Normal \\(\\vec{{PQ}}\\times\\vec{{PR}} = {_vec_tex(m)}\\)"
             + (f"; divide by {abs(m[0] // a)} (and fix the sign) to get \\({_vec_tex(n)}\\)." if m != n else "."),
             f"\\(d = \\mathbf n\\cdot P = {_dot(n, P)}\\), so the plane is \\({_plane_tex(n, d)}\\).",
             f"Check Q and R: \\({_dot(n, Q)} = {d}\\), \\({_dot(n, R)} = {d}\\).",
             f"Distance \\(= \\dfrac{{|\\mathbf n\\cdot S - d|}}{{|\\mathbf n|}} = \\dfrac{{|{_dot(n, S)} - ({d})|}}"
             f"{{\\sqrt{{{_dot(n, n)}}}}} = {_q(dist)}\\)."]
    return _problem(text,
                    [_ans("a", a), _ans("b", b), _ans("c", c), _ans("d", d),
                     _ans("Distance from S", dist, "units")],
                    steps,
                    ["All three points satisfy the plane equation.",
                     "Distance rechecked as |S − F| with F the foot of the perpendicular (SymPy solve + numpy)."],
                    ["lines (and planes) in space"])


# ---- 4. line meets plane (week 2) ---------------------------------------------


def line_plane_intersection(seed: int) -> dict:
    rng = random.Random(seed)
    X = tuple(rng.randint(-3, 3) for _ in range(3))
    small = [v for v in _VECS if max(map(abs, v)) <= 2]
    v = rng.choice(small)
    t0 = rng.choice([-2, -1, 1, 2, 3])
    while True:
        n = rng.choice(small)
        if _dot(n, v) != 0 and math.gcd(*n) == 1:
            break
    P = _sub(X, _scale(t0, v))
    d = _dot(n, X)
    tt = Fraction(d - _dot(n, P), _dot(n, v))
    point = tuple(p + tt * q for p, q in zip(P, v))
    assert tt == t0 and point == X

    # Second check: numpy solves the 3x3 system (the plane plus two planes containing the line).
    e = next(e for e in [(1, 0, 0), (0, 1, 0), (0, 0, 1)] if _cross(v, e) != (0, 0, 0))
    w1 = _cross(v, e)
    w2 = _cross(v, w1)
    M = np.array([n, w1, w2], float)
    rhs = np.array([d, _dot(w1, P), _dot(w2, P)], float)
    assert np.allclose(np.linalg.solve(M, rhs), np.array(X, float)), "numpy solve disagrees"

    comps = [_lin_tex(p, q) for p, q in zip(P, v)]
    text = (f"The line \\(x = {comps[0]},\\ y = {comps[1]},\\ z = {comps[2]}\\) meets the plane "
            f"\\({_plane_tex(n, d)}\\). Find the parameter value t and the point of intersection.")
    sub = " + ".join(f"({nc})({_lin_tex(pc, vc)})" for nc, pc, vc in zip(n, P, v) if nc)
    steps = [f"Substitute the line into the plane: \\({sub} = {d}\\).",
             f"Collect: \\({_dot(n, P)} + ({_dot(n, v)})t = {d}\\), so \\(t = \\dfrac{{{d} - ({_dot(n, P)})}}{{{_dot(n, v)}}} = {t0}\\).",
             f"Point: \\({_pt_tex(P)} + ({t0}){_vec_tex(v)} = {_pt_tex(X)}\\).",
             f"Check in the plane: \\({' + '.join(f'({nc})({xc})' for nc, xc in zip(n, X) if nc)} = {d}\\)."]
    return _problem(text,
                    [_ans("t", t0), _ans("x", X[0]), _ans("y", X[1]), _ans("z", X[2])],
                    steps,
                    ["numpy.linalg.solve on the plane plus two planes containing the line gives the same point."],
                    ["lines (and planes) in space"])


# ---- 5. arc length (week 3) ---------------------------------------------------


def _arc_case(rng):
    kind = rng.choice(["helix", "helix", "twisted", "cusp", "cycloid", "astroid"])
    if kind == "helix":
        a, b = rng.choice([(3, 4), (4, 3), (6, 8), (8, 6), (5, 12), (12, 5)])
        c = math.isqrt(a * a + b * b)
        T = rng.choice([PI / 2, PI, 2 * PI])
        return (kind, (a * sp.cos(t), a * sp.sin(t), b * t), sp.Integer(c), T,
                [f"\\(|\\mathbf r'|^2 = {a * a}\\sin^2 t + {a * a}\\cos^2 t + {b * b} = {a * a + b * b}\\), "
                 f"so \\(|\\mathbf r'| = {c}\\)."])
    if kind == "twisted":
        if rng.random() < 0.5:
            curve, speed = (2 * t, t ** 2, t ** 3 / 3), 2 + t ** 2
            note = "\\(|\\mathbf r'|^2 = 4 + 4t^2 + t^4 = (2 + t^2)^2\\), so \\(|\\mathbf r'| = 2 + t^2\\)."
        else:
            curve, speed = (t, t ** 2, sp.Rational(2, 3) * t ** 3), 1 + 2 * t ** 2
            note = "\\(|\\mathbf r'|^2 = 1 + 4t^2 + 4t^4 = (1 + 2t^2)^2\\), so \\(|\\mathbf r'| = 1 + 2t^2\\)."
        return kind, curve, speed, sp.Integer(rng.choice([1, 2, 3])), [note]
    if kind == "cusp":
        k = rng.choice([1, 2])
        T = rng.choice([sp.sqrt(3), 2 * sp.sqrt(2)])
        return (kind, (3 * k * t ** 2, 2 * k * t ** 3), 6 * k * t * sp.sqrt(1 + t ** 2), T,
                [f"\\(|\\mathbf r'|^2 = {36 * k * k}t^2 + {36 * k * k}t^4 = {36 * k * k}t^2(1 + t^2)\\), so "
                 f"\\(|\\mathbf r'| = {6 * k}t\\sqrt{{1 + t^2}}\\) for \\(t \\ge 0\\).",
                 "Substitute \\(u = 1 + t^2\\), \\(du = 2t\\,dt\\)."])
    if kind == "cycloid":
        a = rng.choice([1, 2, 3])
        T = rng.choice([PI, 2 * PI])
        return (kind, (a * (t - sp.sin(t)), a * (1 - sp.cos(t))), 2 * a * sp.sin(t / 2), T,
                [f"\\(|\\mathbf r'|^2 = {a * a}[(1 - \\cos t)^2 + \\sin^2 t] = {2 * a * a}(1 - \\cos t) "
                 f"= {4 * a * a}\\sin^2(t/2)\\).",
                 f"On \\([0, {sp.latex(T)}]\\), \\(\\sin(t/2) \\ge 0\\), so \\(|\\mathbf r'| = {2 * a}\\sin(t/2)\\)."])
    a = rng.choice([2, 4, 6])
    return (kind, (a * sp.cos(t) ** 3, a * sp.sin(t) ** 3), 3 * a * sp.sin(t) * sp.cos(t), PI / 2,
            [f"\\(|\\mathbf r'|^2 = {9 * a * a}\\cos^4 t\\sin^2 t + {9 * a * a}\\sin^4 t\\cos^2 t "
             f"= {9 * a * a}\\sin^2 t\\cos^2 t\\).",
             f"On \\([0, \\pi/2]\\) both are \\(\\ge 0\\), so \\(|\\mathbf r'| = {3 * a}\\sin t\\cos t\\)."])


def arc_length(seed: int) -> dict:
    rng = random.Random(seed)
    kind, curve, speed, T, notes = _arc_case(rng)
    L = sp.simplify(sp.integrate(speed, (t, 0, T)))
    deriv = [sp.diff(c, t) for c in curve]

    # Second check: the claimed speed matches |r'| numerically, and a fine polyline has length L.
    ts = np.linspace(0, float(T), 200001)

    def sample(e):
        return np.broadcast_to(np.asarray(sp.lambdify(t, e, "numpy")(ts), float), ts.shape)

    speeds = np.sqrt(sum(sample(d) ** 2 for d in deriv))
    assert np.allclose(speeds, sample(speed), atol=1e-9), "speed formula wrong"
    pts = np.array([sample(c) for c in curve])
    poly = np.sum(np.linalg.norm(np.diff(pts, axis=1), axis=0))
    assert abs(poly - float(L)) < 1e-6 * max(1, float(L)), "polyline length disagrees"

    vec = "\\langle " + ", ".join(sp.latex(c) for c in curve) + " \\rangle"
    text = (f"Find the length of the curve \\(\\mathbf r(t) = {vec}\\) for \\(0 \\le t \\le {sp.latex(T)}\\).")
    steps = [f"\\(\\mathbf r'(t) = \\langle {', '.join(sp.latex(d) for d in deriv)} \\rangle\\)."] + notes + [
        f"\\(L = \\int_0^{{{sp.latex(T)}}} {sp.latex(speed)}\\,dt = {sp.latex(L)}\\)."]
    return _problem(text, [_value_answer("Arc length", L, "units")], steps,
                    ["The simplified speed matches |r′(t)| at 200 001 points, and the length of a "
                     "200 000-segment polyline along the curve equals L."],
                    ["length of curves (curvature 11.9 optional)"])


# ---- 6. gradient and directional derivative (week 5) --------------------------

_MONO2 = [x * y, x ** 2, y ** 2, x ** 2 * y, x * y ** 2, x ** 3, y ** 3, x, y]
_MONO3 = [x * y * z, x * z, y * z, x ** 2 * z, y ** 2, z ** 2, x * y, x * z ** 2]
_DIRS2 = [(3, 4), (4, 3), (0, 1), (1, 0), (5, 12), (12, 5)]
_DIRS3 = sorted({p for base in [(1, 2, 2), (2, 3, 6), (0, 0, 1), (0, 3, 4)] for p in itertools.permutations(base)})


def _poly(rng, monos, k=3):
    return sum(rng.choice([-3, -2, -1, 1, 2, 3]) * m for m in rng.sample(monos, k))


def _num_grad(fl, P, h=1e-5):
    P = np.array(P, float)
    g = []
    for i in range(len(P)):
        e = np.zeros(len(P))
        e[i] = h
        g.append((fl(*(P + e)) - fl(*(P - e))) / (2 * h))
    return np.array(g)


def gradient_directional(seed: int) -> dict:
    rng = random.Random(seed)
    dim = rng.choice([2, 2, 3])
    vars_ = (x, y) if dim == 2 else (x, y, z)
    while True:
        f = _poly(rng, _MONO2 if dim == 2 else _MONO3)
        P = tuple(rng.randint(-2, 2) for _ in range(dim))
        grad = [sp.diff(f, v).subs(dict(zip(vars_, P))) for v in vars_]
        if any(grad):
            break
    base = rng.choice(_DIRS2 if dim == 2 else _DIRS3)
    u = tuple(s * c for s, c in zip([rng.choice([1, -1]) for _ in range(dim)], base))
    nu = math.isqrt(sum(c * c for c in u))
    Du = sp.Rational(sum(g * c for g, c in zip(grad, u)), nu)
    g2 = sum(g * g for g in grad)
    gmag = _isqrt_exact(int(g2))

    # Second check: central differences for the gradient and along the unit direction.
    fl = sp.lambdify(vars_, f, "numpy")
    gnum = _num_grad(fl, P)
    assert np.allclose(gnum, [float(g) for g in grad], atol=1e-5), "numerical gradient disagrees"
    un, h = np.array(u, float) / nu, 1e-5
    Dnum = (fl(*(np.array(P, float) + h * un)) - fl(*(np.array(P, float) - h * un))) / (2 * h)
    assert abs(Dnum - float(Du)) < 1e-5, "numerical directional derivative disagrees"

    names = "xyz"[:dim]
    toward = rng.random() < 0.5
    if toward:
        Q = _add(P, u)
        dir_text = f"toward the point \\({_pt_tex(Q)}\\)"
        dir_step = f"Direction \\(\\vec{{PQ}} = {_vec_tex(u)}\\), length {nu}, so \\(\\mathbf u = {_vec_tex(u)}/{nu}\\)."
    else:
        dir_text = f"in the direction of \\(\\mathbf v = {_vec_tex(u)}\\)"
        dir_step = f"\\(|\\mathbf v| = {nu}\\), so \\(\\mathbf u = {_vec_tex(u)}/{nu}\\)."
    ask_max = gmag is not None
    text = (f"Let \\(f({', '.join(names)}) = {sp.latex(f)}\\). Find \\(\\nabla f\\) at \\(P{_pt_tex(P)}\\) and "
            f"the directional derivative of f at P {dir_text}."
            + (" Also give the maximum rate of increase of f at P." if ask_max else ""))
    steps = ["\\(\\nabla f = \\langle " + ", ".join(sp.latex(sp.diff(f, v)) for v in vars_) + " \\rangle\\).",
             f"At P: \\(\\nabla f = {_vec_tex(grad)}\\).",
             dir_step,
             f"\\(D_{{\\mathbf u}}f = \\nabla f\\cdot\\mathbf u = \\dfrac{{{' + '.join(f'({g})({c})' for g, c in zip(grad, u))}}}{{{nu}}} "
             f"= {sp.latex(Du)}\\)."]
    answers = [_ans(f"∂f/∂{v} at P", g) for v, g in zip(names, grad)] + [_ans("Directional derivative", Du)]
    if ask_max:
        steps.append(f"Maximum rate \\(= |\\nabla f| = \\sqrt{{{g2}}} = {_q(gmag)}\\).")
        answers.append(_ans("Maximum rate of increase", gmag))
    return _problem(text, answers, steps,
                    ["Central differences give the same gradient and directional derivative."],
                    ["directional derivatives and gradient", "partial derivatives"])


# ---- 7. tangent plane and linear approximation (week 6) -----------------------


def tangent_plane(seed: int) -> dict:
    rng = random.Random(seed)
    kind = rng.choice(["poly", "poly", "sqrt", "hemi", "exp"])
    if kind == "poly":
        f = _poly(rng, _MONO2)
        a, b = rng.randint(-2, 2), rng.randint(-2, 2)
    elif kind == "sqrt":
        a, b = rng.choice([(3, 4), (4, 3), (6, 8), (8, 6), (5, 12), (12, 5)])
        f = sp.sqrt(x ** 2 + y ** 2)
    elif kind == "hemi":
        R, a, b = rng.choice([(3, 1, 2), (3, 2, 1), (3, 2, 2), (7, 2, 3), (7, 3, 6), (7, 2, 6), (7, 6, 2)])
        f = sp.sqrt(R * R - x ** 2 - y ** 2)
    else:
        c, k = rng.choice([1, 2, 3]), rng.choice([-2, -1, 1, 2, 3])
        a, b = rng.choice([1, 2, 3, -1]), 0
        f = c * x * sp.exp(k * y)
    dx, dy = [sp.Rational(rng.choice([-2, -1, 1, 2]), 10) for _ in range(2)]
    at = {x: a, y: b}
    f0 = sp.simplify(f.subs(at))
    fx, fy = sp.simplify(sp.diff(f, x).subs(at)), sp.simplify(sp.diff(f, y).subs(at))
    L = f0 + fx * dx + fy * dy

    # Second check: numerical partials (central differences) rebuild the same plane and value.
    fl = sp.lambdify((x, y), f, "numpy")
    g = _num_grad(fl, (a, b))
    assert abs(g[0] - float(fx)) < 1e-5 and abs(g[1] - float(fy)) < 1e-5, "numerical partials disagree"
    L_num = fl(a, b) + g[0] * float(dx) + g[1] * float(dy)
    assert abs(L_num - float(L)) < 1e-5, "linear approximation disagrees"
    assert abs(fl(a + float(dx), b + float(dy)) - float(L)) < 1.0, "linearization far from f"

    text = (f"Let \\(f(x, y) = {sp.latex(f)}\\). Find \\(f({a}, {b})\\), \\(f_x({a}, {b})\\) and \\(f_y({a}, {b})\\), "
            f"write the tangent plane at that point, and use it to estimate \\(f({_fmt(a + dx)}, {_fmt(b + dy)})\\).")
    steps = [f"\\(f({a}, {b}) = {sp.latex(f0)}\\).",
             f"\\(f_x = {sp.latex(sp.diff(f, x))}\\), so \\(f_x({a}, {b}) = {sp.latex(fx)}\\).",
             f"\\(f_y = {sp.latex(sp.diff(f, y))}\\), so \\(f_y({a}, {b}) = {sp.latex(fy)}\\).",
             f"Tangent plane: \\(z = {sp.latex(f0)} + ({sp.latex(fx)})(x - ({a})) + ({sp.latex(fy)})(y - ({b}))\\).",
             f"With \\(\\Delta x = {_fmt(dx)}\\), \\(\\Delta y = {_fmt(dy)}\\): \\(L = {sp.latex(f0)} + ({sp.latex(fx)})({_fmt(dx)}) "
             f"+ ({sp.latex(fy)})({_fmt(dy)}) = {_fmt(L)}\\)."]
    return _problem(text,
                    [_ans(f"f({a}, {b})", f0), _ans("f_x", fx), _ans("f_y", fy),
                     _ans(f"Linear estimate of f({_fmt(a + dx)}, {_fmt(b + dy)})", L)],
                    steps,
                    ["Central-difference partials give the same plane and estimate; the estimate is "
                     "close to the true value of f."],
                    ["tangent planes and linear approximation"])


# ---- 8. critical points (week 6) ----------------------------------------------


def classify(f, P):
    """Second-derivative test at a critical point: 1 min, -1 max, 0 saddle (None if inconclusive)."""
    at = {x: P[0], y: P[1]}
    fxx, fyy, fxy = (sp.diff(f, x, 2).subs(at), sp.diff(f, y, 2).subs(at), sp.diff(f, x, y).subs(at))
    D = fxx * fyy - fxy ** 2
    if D < 0:
        return 0
    if D > 0:
        return 1 if fxx > 0 else -1
    return None


def _probe(fl, P, eps=1e-2):
    """Numerical type: compare f on a small circle with f at P."""
    angs = np.linspace(0, 2 * np.pi, 72, endpoint=False)
    diff = fl(P[0] + eps * np.cos(angs), P[1] + eps * np.sin(angs)) - fl(*P)
    if np.all(diff > 0):
        return 1
    if np.all(diff < 0):
        return -1
    return 0 if diff.max() > 0 > diff.min() else None


_TYPE_WORD = {1: "local minimum", -1: "local maximum", 0: "saddle point"}


def critical_points(seed: int) -> dict:
    rng = random.Random(seed)
    if rng.random() < 0.55:
        while True:
            A, C = rng.choice([-3, -2, -1, 1, 2, 3]), rng.choice([-3, -2, -1, 1, 2, 3])
            B = rng.randint(-4, 4)
            if 4 * A * C - B * B != 0:
                break
        x0, y0 = rng.randint(-3, 3), rng.randint(-3, 3)
        D_, E_ = -(2 * A * x0 + B * y0), -(B * x0 + 2 * C * y0)
        f = A * x ** 2 + B * x * y + C * y ** 2 + D_ * x + E_ * y
        pts = [(x0, y0)]
        intro = f"\\(f(x, y) = {sp.latex(f)}\\) has exactly one critical point."
        asked = "Find it and classify it"
    else:
        if rng.random() < 0.5:
            k = rng.choice([1, 2, 3])
            f = x ** 3 + y ** 3 - 3 * k * x * y
            pts = [(0, 0), (k, k)]
        else:
            k, cc, y1 = rng.choice([1, 2, 3]), rng.choice([-3, -2, -1, 1, 2, 3]), rng.randint(-2, 2)
            f = sp.expand(x ** 3 - 3 * k * k * x + cc * (y - y1) ** 2)
            pts = [(-k, y1), (k, y1)]
        intro = f"\\(f(x, y) = {sp.latex(f)}\\) has exactly two critical points."
        asked = "Find both (list the one with smaller x first) and classify each"
    types = [classify(f, p) for p in pts]

    # Second check: SymPy solves grad f = 0 independently; numpy eigenvalues and a numerical probe classify.
    sols = sp.solve([sp.diff(f, x), sp.diff(f, y)], [x, y], dict=True)
    real = sorted({(s[x], s[y]) for s in sols if s[x].is_real and s[y].is_real})
    assert real == sorted(pts), f"critical points {real} != {pts}"
    fl = sp.lambdify((x, y), f, "numpy")
    for p, ty in zip(pts, types):
        H = np.array(sp.hessian(f, (x, y)).subs({x: p[0], y: p[1]}), float)
        ev = np.linalg.eigvalsh(H)
        ty_eig = 1 if ev.min() > 0 else (-1 if ev.max() < 0 else 0)
        assert ty is not None and ty == ty_eig == _probe(fl, p), "classification disagrees"

    text = f"{intro} {asked}. Encode the type as 1 = local min, −1 = local max, 0 = saddle."
    fx, fy = sp.diff(f, x), sp.diff(f, y)
    steps = [f"\\(f_x = {sp.latex(fx)} = 0\\) and \\(f_y = {sp.latex(fy)} = 0\\).",
             "Solutions: " + ", ".join(f"\\({_pt_tex(p)}\\)" for p in pts) + ".",
             f"\\(f_{{xx}} = {sp.latex(sp.diff(f, x, 2))}\\), \\(f_{{yy}} = {sp.latex(sp.diff(f, y, 2))}\\), "
             f"\\(f_{{xy}} = {sp.latex(sp.diff(f, x, y))}\\); \\(D = f_{{xx}}f_{{yy}} - f_{{xy}}^2\\)."]
    answers = []
    for i, (p, ty) in enumerate(zip(pts, types)):
        at = {x: p[0], y: p[1]}
        fxx, fyy, fxy = (sp.diff(f, x, 2).subs(at), sp.diff(f, y, 2).subs(at), sp.diff(f, x, y).subs(at))
        D = fxx * fyy - fxy ** 2
        steps.append(f"At \\({_pt_tex(p)}\\): \\(D = ({fxx})({fyy}) - ({fxy})^2 = {D}\\)"
                     + (f", \\(f_{{xx}} = {fxx}\\)" if D > 0 else "") + f" → {_TYPE_WORD[ty]}.")
        tag = "" if len(pts) == 1 else (" (smaller x)" if i == 0 else " (larger x)")
        answers += [_ans(f"x of critical point{tag}", p[0]), _ans(f"y of critical point{tag}", p[1]),
                    _ans(f"Type{tag} {TYPE_LABEL}", ty, "code", 0.1)]
    return _problem(text, answers, steps,
                    ["SymPy's solve finds exactly these critical points.",
                     "Hessian eigenvalue signs (numpy) and comparing f on a small circle give the same type."],
                    ["max/min, second derivative test, absolute extrema"])


# ---- quadrature for the integral checks --------------------------------------


def _gl(n):
    return np.polynomial.legendre.leggauss(n)


def quad2(f, xa, xb, ylo, yhi, n=160):
    """Gauss-Legendre iterated integral: x from xa to xb, y from ylo(x) to yhi(x)."""
    u, w = _gl(n)
    X = (xb - xa) / 2 * u + (xb + xa) / 2
    WX = (xb - xa) / 2 * w
    lo, hi = ylo(X) + 0 * X, yhi(X) + 0 * X
    Y = (hi - lo)[:, None] / 2 * u[None, :] + (hi + lo)[:, None] / 2
    WY = (hi - lo)[:, None] / 2 * w[None, :]
    Xg = X[:, None] + 0 * Y
    return float(np.sum(WX[:, None] * WY * (f(Xg, Y) + 0 * Y)))


def quad3(f, xa, xb, ylo, yhi, zlo, zhi, n=60):
    """Gauss-Legendre iterated integral over x in [xa, xb], y in [ylo(x), yhi(x)], z in [zlo, zhi](x, y)."""
    u, w = _gl(n)
    X = (xb - xa) / 2 * u + (xb + xa) / 2
    WX = (xb - xa) / 2 * w
    X2 = X[:, None]
    lo, hi = ylo(X2) + 0 * X2, yhi(X2) + 0 * X2
    Y = (hi - lo) / 2 * u[None, :] + (hi + lo) / 2
    WY = (hi - lo) / 2 * w[None, :]
    X3, Y3 = X2[:, :, None] + 0 * Y[:, :, None], Y[:, :, None]
    zl, zh = zlo(X3, Y3) + 0 * Y3, zhi(X3, Y3) + 0 * Y3
    Z = (zh - zl) / 2 * u[None, None, :] + (zh + zl) / 2
    WZ = (zh - zl) / 2 * w[None, None, :]
    Xg, Yg = X3 + 0 * Z, Y3 + 0 * Z
    return float(np.sum(WX[:, None, None] * WY[:, :, None] * WZ * (f(Xg, Yg, Z) + 0 * Z)))


def _root(c):
    return lambda X, *rest: np.sqrt(np.maximum(c - X ** 2 - sum(v ** 2 for v in rest), 0))


def _neg_root(c):
    return lambda X, *rest: -np.sqrt(np.maximum(c - X ** 2 - sum(v ** 2 for v in rest), 0))


# ---- 9. double integrals (weeks 7-8) ------------------------------------------

# integrand in Cartesian -> the same function in polar (before the Jacobian r)
_POLAR_FS = [(sp.Integer(1), sp.Integer(1)), (x ** 2 + y ** 2, r ** 2), (sp.sqrt(x ** 2 + y ** 2), r)]


def double_integral(seed: int) -> dict:
    rng = random.Random(seed)
    kind = rng.choice(["rect", "rect", "triangle", "between", "polar", "polar"])
    if kind == "rect":
        f = rng.choice([x * y, x + y, x ** 2 * y, x * y ** 2, x ** 2 + y ** 2, 2 * x + 3 * y, 6 * x * y ** 2])
        a, b = rng.choice([(0, 1), (0, 2), (1, 2), (0, 3), (1, 3)])
        c, d = rng.choice([(0, 1), (0, 2), (1, 2), (0, 3), (1, 3)])
        inner = sp.integrate(f, (y, c, d))
        val = sp.integrate(inner, (x, a, b))
        num = quad2(sp.lambdify((x, y), f, "numpy"), a, b, lambda X: c, lambda X: d)
        text = (f"Evaluate \\(\\displaystyle\\iint_R {_ig(f)}\\,dA\\) where \\(R = [{a}, {b}]\\times[{c}, {d}]\\).")
        steps = [f"\\(\\displaystyle\\int_{{{a}}}^{{{b}}}\\int_{{{c}}}^{{{d}}} {_ig(f)}\\,dy\\,dx\\).",
                 f"Inner: \\(\\int_{{{c}}}^{{{d}}} {_ig(f)}\\,dy = {sp.latex(sp.expand(inner))}\\).",
                 f"Outer: \\(\\int_{{{a}}}^{{{b}}} \\left({sp.latex(sp.expand(inner))}\\right) dx = {sp.latex(val)}\\)."]
        unit = None
    elif kind in ("triangle", "between"):
        if kind == "triangle":
            a, m = rng.choice([1, 2, 3]), rng.choice([1, 2])
            f = rng.choice([sp.Integer(1), x, y, x * y, x + y])
            lo, hi = sp.Integer(0), m * x
            region = (f"the triangle with vertices \\((0, 0)\\), \\(({a}, 0)\\) and \\(({a}, {m * a})\\)")
            bounds = f"For \\(0 \\le x \\le {a}\\), y runs from 0 up to the line \\(y = {sp.latex(m * x)}\\)."
        else:
            a = rng.choice([1, 2, 3])
            f = rng.choice([sp.Integer(1), x, y])
            lo, hi = x ** 2, a * x
            region = f"the region between \\(y = x^2\\) and \\(y = {sp.latex(a * x)}\\)"
            bounds = (f"The curves meet where \\(x^2 = {sp.latex(a * x)}\\): \\(x = 0\\) and \\(x = {a}\\); "
                      f"between them \\({sp.latex(a * x)} \\ge x^2\\).")
        inner = sp.expand(sp.integrate(f, (y, lo, hi)))
        val = sp.integrate(inner, (x, 0, a))
        num = quad2(sp.lambdify((x, y), f, "numpy"), 0, a, sp.lambdify(x, lo, "numpy"), sp.lambdify(x, hi, "numpy"))
        text = f"Evaluate \\(\\displaystyle\\iint_D {_ig(f)}\\,dA\\) where D is {region}."
        steps = [bounds,
                 f"\\(\\displaystyle\\int_0^{{{a}}}\\int_{{{sp.latex(lo)}}}^{{{sp.latex(hi)}}} {_ig(f)}\\,dy\\,dx\\).",
                 f"Inner: \\({sp.latex(inner)}\\).",
                 f"Outer: \\(\\int_0^{{{a}}} \\left({sp.latex(inner)}\\right) dx = {sp.latex(val)}\\)."]
        unit = "units²" if f == 1 else None
    else:
        fc, fp = rng.choice(_POLAR_FS)
        shape = rng.choice(["disk", "quarter", "half", "annulus"])
        if shape == "annulus":
            R1, R2 = rng.choice([(1, 2), (1, 3), (2, 3)])
        else:
            R1, R2 = 0, rng.choice([1, 2, 3])
        t1, t2 = {"disk": (0, 2 * PI), "quarter": (0, PI / 2), "half": (0, PI), "annulus": (0, 2 * PI)}[shape]
        inner = sp.integrate(fp * r, (r, R1, R2))
        val = sp.integrate(inner, (theta, t1, t2))
        fl = sp.lambdify((x, y), fc, "numpy")
        if shape == "disk":
            num = quad2(fl, -R2, R2, _neg_root(R2 ** 2), _root(R2 ** 2))
        elif shape == "quarter":
            num = quad2(fl, 0, R2, lambda X: 0, _root(R2 ** 2))
        elif shape == "half":
            num = quad2(fl, -R2, R2, lambda X: 0, _root(R2 ** 2))
        else:
            num = (quad2(fl, -R2, R2, _neg_root(R2 ** 2), _root(R2 ** 2))
                   - quad2(fl, -R1, R1, _neg_root(R1 ** 2), _root(R1 ** 2)))
        region = {"disk": f"the disk \\(x^2 + y^2 \\le {R2 ** 2}\\)",
                  "quarter": f"the part of the disk \\(x^2 + y^2 \\le {R2 ** 2}\\) in the first quadrant",
                  "half": f"the upper half (\\(y \\ge 0\\)) of the disk \\(x^2 + y^2 \\le {R2 ** 2}\\)",
                  "annulus": f"the ring \\({R1 ** 2} \\le x^2 + y^2 \\le {R2 ** 2}\\)"}[shape]
        text = f"Use polar coordinates to evaluate \\(\\displaystyle\\iint_D {_ig(fc)}\\,dA\\) where D is {region}."
        steps = [f"In polar form the integrand is \\({sp.latex(fp)}\\) and \\(dA = r\\,dr\\,d\\theta\\); "
                 f"\\({R1} \\le r \\le {R2}\\), \\({sp.latex(t1)} \\le \\theta \\le {sp.latex(t2)}\\).",
                 f"\\(\\displaystyle\\int_{{{sp.latex(t1)}}}^{{{sp.latex(t2)}}}\\int_{{{R1}}}^{{{R2}}} {sp.latex(fp * r)}\\,dr\\,d\\theta\\).",
                 f"Inner: \\(\\int_{{{R1}}}^{{{R2}}} {sp.latex(fp * r)}\\,dr = {sp.latex(inner)}\\).",
                 f"Outer: \\({sp.latex(inner)} \\times {sp.latex(t2 - t1)} = {sp.latex(val)}\\)."]
        unit = "units²" if fc == 1 else None
    assert abs(num - float(val)) < 1e-5 * max(1, abs(float(val))), f"quadrature {num} != {val}"
    return _problem(text, [_value_answer("Value of the integral" if unit is None else "Area", val, unit)],
                    steps,
                    ["SymPy's exact iterated integral matches Gauss-Legendre quadrature done in "
                     "Cartesian coordinates."],
                    ["double integrals over rectangles", "double integrals over general regions, order of integration"]
                    + (["double integrals in polar coordinates"] if kind == "polar" else []))


# ---- 10. triple integrals (week 9) --------------------------------------------


def triple_integral(seed: int) -> dict:
    rng = random.Random(seed)
    kind = rng.choice(["box", "tetra", "cyl", "cyl", "sph", "sph"])
    if kind == "box":
        f = rng.choice([x * y * z, x + y + z, x ** 2, x * y, z, 2 * x * z])
        a, b, c = rng.choice([1, 2, 3]), rng.choice([1, 2, 3]), rng.choice([1, 2, 3])
        val = sp.integrate(f, (z, 0, c), (y, 0, b), (x, 0, a))
        num = quad3(sp.lambdify((x, y, z), f, "numpy"), 0, a, lambda X: 0, lambda X: b,
                    lambda X, Y: 0, lambda X, Y: c, n=12)
        text = (f"Evaluate \\(\\displaystyle\\iiint_B {_ig(f)}\\,dV\\) over the box "
                f"\\(B = [0, {a}]\\times[0, {b}]\\times[0, {c}]\\).")
        i1 = sp.integrate(f, (z, 0, c))
        i2 = sp.integrate(i1, (y, 0, b))
        steps = [f"\\(\\displaystyle\\int_0^{{{a}}}\\int_0^{{{b}}}\\int_0^{{{c}}} {_ig(f)}\\,dz\\,dy\\,dx\\).",
                 f"In z: \\({sp.latex(sp.expand(i1))}\\).", f"In y: \\({sp.latex(sp.expand(i2))}\\).",
                 f"In x: \\({sp.latex(val)}\\)."]
        unit, topics = None, ["triple integrals"]
    elif kind == "tetra":
        A, B, C = (rng.choice([1, 2, 3]) for _ in range(3))
        f = rng.choice([sp.Integer(1), x, z])
        L = math.lcm(A, B, C)
        n = (L // A, L // B, L // C)
        ytop = B * (1 - x / sp.Integer(A))
        ztop = C * (1 - x / sp.Integer(A) - y / sp.Integer(B))
        val = sp.integrate(f, (z, 0, ztop), (y, 0, ytop), (x, 0, A))
        num = quad3(sp.lambdify((x, y, z), f, "numpy"), 0, A, lambda X: 0, sp.lambdify(x, ytop, "numpy"),
                    lambda X, Y: 0, sp.lambdify((x, y), ztop, "numpy"), n=16)
        text = (f"Evaluate \\(\\displaystyle\\iiint_E {_ig(f)}\\,dV\\) where E is the solid in the first "
                f"octant under the plane \\({_plane_tex(n, L)}\\).")
        steps = [f"The plane meets the axes at \\(x = {A}\\), \\(y = {B}\\), \\(z = {C}\\).",
                 f"Bounds: \\(0 \\le x \\le {A}\\), \\(0 \\le y \\le {sp.latex(ytop)}\\), "
                 f"\\(0 \\le z \\le {sp.latex(sp.expand(ztop))}\\).",
                 f"\\(\\displaystyle\\int_0^{{{A}}}\\int_0^{{{sp.latex(ytop)}}}\\int_0^{{{sp.latex(sp.expand(ztop))}}} "
                 f"{_ig(f)}\\,dz\\,dy\\,dx = {sp.latex(val)}\\)."]
        if f == 1:
            steps.append(f"(Check: a tetrahedron's volume is \\(abc/6 = {A}\\cdot{B}\\cdot{C}/6 = {sp.latex(sp.Rational(A * B * C, 6))}\\).)")
            assert val == sp.Rational(A * B * C, 6)
        unit, topics = ("units³" if f == 1 else None), ["triple integrals"]
    elif kind == "cyl":
        R = rng.choice([1, 2, 3])
        solid = rng.choice(["cylinder", "paraboloid", "cone"])
        fc, fp = rng.choice([(sp.Integer(1), sp.Integer(1)), (z, z), (x ** 2 + y ** 2, r ** 2)])
        if solid == "cylinder":
            H = rng.choice([1, 2, 3, 4])
            zl, zh = sp.Integer(0), sp.Integer(H)
            desc = f"the cylinder \\(x^2 + y^2 \\le {R * R}\\), \\(0 \\le z \\le {H}\\)"
            num_zl, num_zh = (lambda X, Y: 0), (lambda X, Y: H)
        elif solid == "paraboloid":
            zl, zh = sp.Integer(0), R * R - r ** 2
            desc = f"the solid under \\(z = {R * R} - x^2 - y^2\\) and above \\(z = 0\\)"
            num_zl, num_zh = (lambda X, Y: 0), (lambda X, Y: R * R - X ** 2 - Y ** 2)
        else:
            zl, zh = r, sp.Integer(R)
            desc = f"the solid inside the cone \\(z = \\sqrt{{x^2 + y^2}}\\) and below \\(z = {R}\\)"
            num_zl, num_zh = (lambda X, Y: np.sqrt(X ** 2 + Y ** 2)), (lambda X, Y: R)
        inner = sp.integrate(fp * r, (z, zl, zh))
        mid = sp.integrate(inner, (r, 0, R))
        val = sp.integrate(mid, (theta, 0, 2 * PI))
        num = quad3(sp.lambdify((x, y, z), fc, "numpy"), -R, R, _neg_root(R * R), _root(R * R), num_zl, num_zh)
        text = (f"Use cylindrical coordinates to evaluate \\(\\displaystyle\\iiint_E {_ig(fc)}\\,dV\\) where E is {desc}.")
        steps = [f"In cylindrical coordinates the integrand is \\({sp.latex(fp)}\\) and \\(dV = r\\,dz\\,dr\\,d\\theta\\); "
                 f"\\({sp.latex(zl)} \\le z \\le {sp.latex(zh)}\\), \\(0 \\le r \\le {R}\\), \\(0 \\le \\theta \\le 2\\pi\\).",
                 f"In z: \\(\\int_{{{sp.latex(zl)}}}^{{{sp.latex(zh)}}} {sp.latex(fp * r)}\\,dz = {sp.latex(sp.expand(inner))}\\).",
                 f"In r: \\(\\int_0^{{{R}}} \\left({sp.latex(sp.expand(inner))}\\right) dr = {sp.latex(mid)}\\).",
                 f"In θ: \\({sp.latex(mid)} \\times 2\\pi = {sp.latex(val)}\\)."]
        unit, topics = ("units³" if fc == 1 else None), ["triple integrals in cylindrical and spherical"]
    else:
        R = rng.choice([1, 2, 3])
        solid = rng.choice(["ball", "hemisphere", "octant"])
        if solid == "hemisphere":
            fc, fp = rng.choice([(sp.Integer(1), sp.Integer(1)), (z, rho * sp.cos(phi))])
        else:
            fc, fp = rng.choice([(sp.Integer(1), sp.Integer(1)), (x ** 2 + y ** 2 + z ** 2, rho ** 2)])
        p2, t2 = {"ball": (PI, 2 * PI), "hemisphere": (PI / 2, 2 * PI), "octant": (PI / 2, PI / 2)}[solid]
        inner = sp.integrate(fp * rho ** 2 * sp.sin(phi), (rho, 0, R))
        mid = sp.simplify(sp.integrate(inner, (phi, 0, p2)))
        val = sp.simplify(mid * t2)
        fl = sp.lambdify((x, y, z), fc, "numpy")
        if solid == "ball":
            num = quad3(fl, -R, R, _neg_root(R * R), _root(R * R), _neg_root(R * R), _root(R * R))
        elif solid == "hemisphere":
            num = quad3(fl, -R, R, _neg_root(R * R), _root(R * R), lambda X, Y: 0, _root(R * R))
        else:
            num = quad3(fl, 0, R, lambda X: 0, _root(R * R), lambda X, Y: 0, _root(R * R))
        desc = {"ball": f"the ball \\(x^2 + y^2 + z^2 \\le {R * R}\\)",
                "hemisphere": f"the upper half (\\(z \\ge 0\\)) of the ball \\(x^2 + y^2 + z^2 \\le {R * R}\\)",
                "octant": f"the part of the ball \\(x^2 + y^2 + z^2 \\le {R * R}\\) with \\(x, y, z \\ge 0\\)"}[solid]
        text = (f"Use spherical coordinates to evaluate \\(\\displaystyle\\iiint_E {_ig(fc)}\\,dV\\) where E is {desc}.")
        steps = [f"In spherical coordinates the integrand is \\({sp.latex(fp)}\\) and "
                 f"\\(dV = \\rho^2\\sin\\varphi\\,d\\rho\\,d\\varphi\\,d\\theta\\); \\(0 \\le \\rho \\le {R}\\), "
                 f"\\(0 \\le \\varphi \\le {sp.latex(p2)}\\), \\(0 \\le \\theta \\le {sp.latex(t2)}\\).",
                 f"In ρ: \\(\\int_0^{{{R}}} {sp.latex(fp * rho ** 2 * sp.sin(phi))}\\,d\\rho = {sp.latex(inner)}\\).",
                 f"In φ: \\(\\int_0^{{{sp.latex(p2)}}} {sp.latex(inner)}\\,d\\varphi = {sp.latex(mid)}\\).",
                 f"In θ: \\({sp.latex(mid)} \\times {sp.latex(t2)} = {sp.latex(val)}\\)."]
        unit, topics = ("units³" if fc == 1 else None), ["triple integrals in cylindrical and spherical"]
    assert abs(num - float(val)) < 2e-4 * max(1, abs(float(val))), f"quadrature {num} != {val}"
    return _problem(text, [_value_answer("Value of the integral" if unit is None else "Volume", val, unit)],
                    steps,
                    ["SymPy's exact iterated integral matches Gauss-Legendre quadrature done in "
                     "Cartesian coordinates."],
                    topics)


GENERATORS.update({
    "dot_angle": dot_angle,
    "cross_area": cross_area,
    "plane_through_points": plane_through_points,
    "line_plane_intersection": line_plane_intersection,
    "arc_length": arc_length,
    "gradient_directional": gradient_directional,
    "tangent_plane": tangent_plane,
    "critical_points": critical_points,
    "double_integral": double_integral,
    "triple_integral": triple_integral,
})
WEEKS.update({
    "dot_angle": 1,
    "cross_area": 1,
    "plane_through_points": 2,
    "line_plane_intersection": 2,
    "arc_length": 3,
    "gradient_directional": 5,
    "tangent_plane": 6,
    "critical_points": 6,
    "double_integral": 7,
    "triple_integral": 9,
})
