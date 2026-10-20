"""ECE 201 weeks 3-8: resistive circuit analysis and ideal op-amps.

Each generator computes its key by the hand method its steps show, then
re-solves the same circuit a second, independent way: almost always a
modified-nodal-analysis (MNA) netlist built from the same element list that
draws the picture, whose solution is itself checked for KCL at every node and
for power balance. If the two answers disagree the generator raises instead of
returning a problem.

Values are picked (by rejection sampling where needed) so every answer works
out by hand without a calculator.
"""
from __future__ import annotations

import random
import re
from dataclasses import dataclass
from fractions import Fraction

import numpy as np

GENERATORS: dict = {}  # filled at the bottom of this file
WEEKS: dict = {}

# ---- number formatting -------------------------------------------------------------

_SUB = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")
_UNSUB = {"₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7",
          "₈": "8", "₉": "9", "ₓ": "x", "ₛ": "s", "ₒ": "o"}


def _clean(x) -> float:
    r = round(float(x), 9)
    return 0.0 if r == 0 else r


def _fmt(x) -> str:
    """Plain text: 6.0 -> '6', -2.5 -> '−2.5' (real minus sign)."""
    return f"{_clean(x):g}".replace("-", "−")


def _m(x) -> str:
    """A number inside KaTeX."""
    return f"{_clean(x):g}"


def _p(x) -> str:
    """A number inside KaTeX, in parentheses when negative."""
    s = _m(x)
    return f"({s})" if s.startswith("-") else s


def _frac(x) -> str:
    """0.95 -> \\tfrac{19}{20} (for conductances)."""
    f = Fraction(float(x)).limit_denominator(10000)
    if f.denominator == 1:
        return str(f.numerator)
    sign = "-" if f < 0 else ""
    return f"{sign}\\tfrac{{{abs(f.numerator)}}}{{{f.denominator}}}"


def _nice(x, step, hi=None) -> bool:
    q = float(x) / step
    return abs(q - round(q)) < 1e-7 and (hi is None or abs(x) <= hi + 1e-9)


def _sub(prefix: str, k) -> str:
    return prefix + str(k).translate(_SUB)


def _tex(name: str) -> str:
    """'R₁' -> 'R_{1}', 'iₓ' -> 'i_{x}' for KaTeX."""
    for k, ch in enumerate(name):
        if ch in _UNSUB:
            return name[:k] + "_{" + "".join(_UNSUB.get(c, c) for c in name[k:]) + "}"
    return name


def _sum(terms) -> str:
    """Join signed terms: ['a', '-b', 'c'] -> 'a - b + c'; '1I_2' -> 'I_2'."""
    s = " + ".join(terms).replace("+ -", "- ")
    return re.sub(r"(?<![\d.{])1(?=[A-Za-z(])", "", s)


def _gain(g, sym: str) -> str:
    """Label of a dependent source: 2, 'vₓ' -> '2vₓ'; 1, 'vₓ' -> 'vₓ'."""
    return sym if g == 1 else f"{_fmt(g)}{sym}"


def _par(a, b):
    return a * b / (a + b)


def _agree(a, b, what: str, rtol=1e-7, atol=1e-9):
    """The second check: raise (never return a problem) if two methods disagree."""
    if not np.isclose(float(a), float(b), rtol=rtol, atol=atol):
        raise AssertionError(f"{what}: {a!r} vs {b!r}")


@dataclass(frozen=True)
class Units:
    ohm: str
    amp: str
    watt: str
    ohm_m: str
    amp_m: str
    watt_m: str
    gm: str  # transconductance


OHM = Units("Ω", "A", "W", "\\Omega", "\\text{A}", "\\text{W}", "A/V")
KOHM = Units("kΩ", "mA", "mW", "\\text{k}\\Omega", "\\text{mA}", "\\text{mW}", "mA/V")

# ---- modified nodal analysis (the independent solver) --------------------------------


@dataclass
class El:
    """One netlist element. Node 0 is ground.

    R: resistor a-b.  V: source, + at a.  I: current `value` flows from a through
    the source to b.  VCCS: current value*(v[cp]-v[cn]) flows a -> b through it.
    VCVS: v[a]-v[b] = value*(v[cp]-v[cn]).  OPAMP: ideal, + input a, - input b,
    output node `out`.
    """
    kind: str
    name: str
    a: int
    b: int
    value: float = 0.0
    cp: int = 0
    cn: int = 0
    out: int = 0


@dataclass
class Sol:
    v: dict      # node -> voltage
    i: dict      # element name -> current through it (from its a to its b)
    p: dict      # element name -> power absorbed


def mna(els) -> Sol:
    nodes = sorted({n for e in els for n in (e.a, e.b, e.cp, e.cn, e.out)} - {0})
    idx = {n: k for k, n in enumerate(nodes)}
    branches = [e for e in els if e.kind in ("V", "VCVS", "OPAMP")]
    bidx = {e.name: len(nodes) + k for k, e in enumerate(branches)}
    size = len(nodes) + len(branches)
    A = np.zeros((size, size))
    z = np.zeros(size)

    def ni(n):
        return None if n == 0 else idx[n]

    def add(r, c, val):
        if r is not None and c is not None:
            A[r, c] += val

    for e in els:
        a, b = ni(e.a), ni(e.b)
        if e.kind == "R":
            g = 1.0 / e.value
            add(a, a, g); add(b, b, g); add(a, b, -g); add(b, a, -g)
        elif e.kind == "I":
            if a is not None:
                z[a] -= e.value
            if b is not None:
                z[b] += e.value
        elif e.kind == "VCCS":
            p, q = ni(e.cp), ni(e.cn)
            add(a, p, e.value); add(a, q, -e.value); add(b, p, -e.value); add(b, q, e.value)
        elif e.kind in ("V", "VCVS"):
            k = bidx[e.name]
            add(a, k, 1); add(b, k, -1); add(k, a, 1); add(k, b, -1)
            if e.kind == "V":
                z[k] = e.value
            else:
                p, q = ni(e.cp), ni(e.cn)
                add(k, p, -e.value); add(k, q, e.value)
        elif e.kind == "OPAMP":
            k = bidx[e.name]
            add(ni(e.out), k, -1)          # output current flows from ground into `out`
            add(k, a, 1); add(k, b, -1)    # virtual short: v+ = v-
        else:
            raise ValueError(e.kind)
    if np.linalg.cond(A) > 1e12:
        raise ArithmeticError("singular circuit")
    x = np.linalg.solve(A, z)
    v = {0: 0.0, **{n: float(x[idx[n]]) for n in nodes}}
    cur, pw, leave = {}, {}, dict.fromkeys(nodes, 0.0)
    for e in els:
        if e.kind == "R":
            i = (v[e.a] - v[e.b]) / e.value
        elif e.kind == "I":
            i = e.value
        elif e.kind == "VCCS":
            i = e.value * (v[e.cp] - v[e.cn])
        else:
            i = float(x[bidx[e.name]])
        t0, t1 = (0, e.out) if e.kind == "OPAMP" else (e.a, e.b)
        cur[e.name] = i
        pw[e.name] = (v[t0] - v[t1]) * i
        if t0:
            leave[t0] += i
        if t1:
            leave[t1] -= i
    scale = 1 + max([abs(c) for c in cur.values()] + [0])
    if any(abs(r) > 1e-9 * scale for r in leave.values()):
        raise AssertionError("KCL fails on the MNA solution")
    if abs(sum(pw.values())) > 1e-9 * (1 + sum(abs(q) for q in pw.values())):
        raise AssertionError("power does not balance")
    return Sol(v, cur, pw)


# ---- drawing: parts, ladders and SVG ------------------------------------------------


@dataclass
class Part:
    """A two-terminal part drawn on a segment. End 'a' is top (vertical) or left
    (horizontal); end 'b' is bottom or right."""
    kind: str               # R V I C L SW VCCS CCCS VCVS CCVS
    name: str = ""          # shown name, e.g. 'R₁' ('' for dependent sources)
    value: float = 0.0      # ohms / volts / amps / gain / µF / mH
    text: str = ""          # shown value, e.g. '4 Ω', '12 V', '2iₓ'
    end: str = "a"          # V-type: the + end. I-type: the end the arrow points to
    ctrl: tuple | None = None   # ('i', key) through a resistor, ('v', key) across a part,
    #                             ('vn', point) a node voltage
    vmark: tuple | None = None  # (label, plus end)
    imark: tuple | None = None  # (label, end the current flows toward)
    side: str = "right"     # label side for vertical parts
    sw: str = ""            # SW: 'closes' or 'opens' at t = 0
    key: str = ""

    def __post_init__(self):
        if not self.key:
            self.key = self.name


_SIZE = {"R": (25, 9), "V": (18, 18), "I": (18, 18), "VCCS": (26, 20), "CCCS": (26, 20),
         "VCVS": (26, 20), "CCVS": (26, 20), "C": (6, 15), "L": (24, 8), "SW": (22, 10)}
_DEP_I = ("VCCS", "CCCS")
_DEP_V = ("VCVS", "CCVS")


def _s(v) -> str:
    return f"{round(float(v), 1):g}"


def _line(x1, y1, x2, y2) -> str:
    return f'<line x1="{_s(x1)}" y1="{_s(y1)}" x2="{_s(x2)}" y2="{_s(y2)}"/>'


def _text(x, y, s, anchor="start", cls="") -> str:
    a = f' text-anchor="{anchor}"' if anchor != "start" else ""
    c = f' class="{cls}"' if cls else ""
    return f'<text x="{_s(x)}" y="{_s(y)}"{a}{c}>{s}</text>'


def _dot(x, y, r=3) -> str:
    return f'<circle cx="{_s(x)}" cy="{_s(y)}" r="{r}"/>'


def _arrow(x, y, direction, half=12) -> str:
    """A straight arrow centred at (x, y)."""
    h, s = half, 6
    d = {"down": f"M{_s(x)} {_s(y - h)} L{_s(x)} {_s(y + h)} M{_s(x - 5)} {_s(y + h - s)} "
                 f"L{_s(x)} {_s(y + h)} L{_s(x + 5)} {_s(y + h - s)}",
         "up": f"M{_s(x)} {_s(y + h)} L{_s(x)} {_s(y - h)} M{_s(x - 5)} {_s(y - h + s)} "
               f"L{_s(x)} {_s(y - h)} L{_s(x + 5)} {_s(y - h + s)}",
         "right": f"M{_s(x - h)} {_s(y)} L{_s(x + h)} {_s(y)} M{_s(x + h - s)} {_s(y - 5)} "
                  f"L{_s(x + h)} {_s(y)} L{_s(x + h - s)} {_s(y + 5)}",
         "left": f"M{_s(x + h)} {_s(y)} L{_s(x - h)} {_s(y)} M{_s(x - h + s)} {_s(y - 5)} "
                 f"L{_s(x - h)} {_s(y)} L{_s(x - h + s)} {_s(y + 5)}"}[direction]
    return f'<path d="{d}" class="arrow"/>'


def _ground(x, y) -> list:
    return [_line(x, y, x, y + 12), _line(x - 12, y + 12, x + 12, y + 12),
            _line(x - 7, y + 17, x + 7, y + 17), _line(x - 3, y + 22, x + 3, y + 22)]


def _signs(cx, cy, vert, plus_end, inner_gap=8) -> list:
    if vert:
        top, bot = ("+", "−") if plus_end == "a" else ("−", "+")
        return [_text(cx, cy - 3, top, "middle", "sign"), _text(cx, cy + 13, bot, "middle", "sign")]
    left, right = ("+", "−") if plus_end == "a" else ("−", "+")
    return [_text(cx - inner_gap, cy + 5, left, "middle", "sign"),
            _text(cx + inner_gap, cy + 5, right, "middle", "sign")]


def _direction(vert, end) -> str:
    if vert:
        return "up" if end == "a" else "down"
    return "left" if end == "a" else "right"


def _draw(p: Part, x1, y1, x2, y2, below=False) -> list:
    """Leads, body, label and marks of one part from (x1, y1) (end a) to (x2, y2)."""
    vert = x1 == x2
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    h, w = _SIZE[p.kind]
    k = p.kind
    out = ([_line(x1, y1, cx, cy - h), _line(cx, cy + h, x2, y2)] if vert
           else [_line(x1, y1, cx - h, cy), _line(cx + h, cy, x2, y2)])
    if k == "R":
        bx, by, bw, bh = (cx - w, cy - h, 2 * w, 2 * h) if vert else (cx - h, cy - w, 2 * h, 2 * w)
        out.append(f'<rect x="{_s(bx)}" y="{_s(by)}" width="{bw}" height="{bh}" class="element"/>')
    elif k in ("V", "I"):
        out.append(f'<rect x="{_s(cx - 18)}" y="{_s(cy - 18)}" width="36" height="36" rx="18" '
                   f'class="element"/>')
        out += (_signs(cx, cy, vert, p.end) if k == "V"
                else [_arrow(cx, cy, _direction(vert, p.end), 11)])
    elif k in _DEP_I + _DEP_V:
        d = (f"M{_s(cx)} {_s(cy - 26)} L{_s(cx + 20)} {_s(cy)} L{_s(cx)} {_s(cy + 26)} "
             f"L{_s(cx - 20)} {_s(cy)} Z" if vert else
             f"M{_s(cx - 26)} {_s(cy)} L{_s(cx)} {_s(cy - 20)} L{_s(cx + 26)} {_s(cy)} "
             f"L{_s(cx)} {_s(cy + 20)} Z")
        out.append(f'<path d="{d}" class="element"/>')
        out += (_signs(cx, cy, vert, p.end, 9) if k in _DEP_V
                else [_arrow(cx, cy, _direction(vert, p.end), 10)])
    elif k == "C":
        out += ([_line(cx - 15, cy - 6, cx + 15, cy - 6), _line(cx - 15, cy + 6, cx + 15, cy + 6)]
                if vert else
                [_line(cx - 6, cy - 15, cx - 6, cy + 15), _line(cx + 6, cy - 15, cx + 6, cy + 15)])
    elif k == "L":
        if vert:
            d = f"M{_s(cx)} {_s(cy - 24)}" + "".join(
                f" A6 6 0 0 1 {_s(cx)} {_s(cy - 24 + 12 * j)}" for j in range(1, 5))
        else:
            d = f"M{_s(cx - 24)} {_s(cy)}" + "".join(
                f" A6 6 0 0 1 {_s(cx - 24 + 12 * j)} {_s(cy)}" for j in range(1, 5))
        out.append(f'<path d="{d}"/>')
    elif k == "SW":
        if vert:
            raise ValueError("switches are drawn on horizontal wires only")
        out += [_dot(cx - 22, cy), _dot(cx + 22, cy)]
        if p.sw == "closes":   # drawn open, arrow shows it swinging shut
            out += [_line(cx - 22, cy, cx + 16, cy - 20), _arrow(cx + 32, cy - 15, "down", 9)]
        else:                  # drawn closed, arrow shows it swinging open
            out += [_line(cx - 22, cy, cx + 22, cy), _arrow(cx + 32, cy - 15, "up", 9)]
        out.append(_text(cx, cy - 32, "t = 0", "middle"))
    # name and value
    if k != "SW":
        if vert:
            lx, anchor = (cx + w + 8, "start") if p.side == "right" else (cx - w - 8, "end")
            if p.name:
                out += [_text(lx, cy - 2, p.name, anchor), _text(lx, cy + 14, p.text, anchor)]
            else:
                out.append(_text(lx, cy + 5, p.text, anchor))
        else:
            s = f"{p.name} = {p.text}" if p.name else p.text
            out.append(_text(cx, cy + w + 17 if below else cy - w - 6, s, "middle"))
    if p.vmark:
        lbl, plus = p.vmark
        if vert:
            sx = cx - w - 12 if p.side == "right" else cx + w + 12
            top, bot = ("+", "−") if plus == "a" else ("−", "+")
            out += [_text(sx, cy - 11, top, "middle", "sign"), _text(sx, cy + 6, lbl, "middle"),
                    _text(sx, cy + 25, bot, "middle", "sign")]
        else:
            sy = cy - w - 6 if below else cy + w + 19
            left, right = ("+", "−") if plus == "a" else ("−", "+")
            out += [_text(cx - 24, sy, left, "middle", "sign"), _text(cx, sy, lbl, "middle"),
                    _text(cx + 24, sy, right, "middle", "sign")]
    if p.imark:
        lbl, toward = p.imark
        if vert:
            my = (y1 + cy - h) / 2
            out.append(_arrow(cx, my, _direction(True, toward)))
            out.append(_text(cx - 9, my + 5, lbl, "end") if p.side == "right"
                       else _text(cx + 9, my + 5, lbl))
        else:
            mx = (cx + h + x2) / 2
            out.append(_arrow(mx, cy, _direction(False, toward)))
            out.append(_text(mx, cy - 10 if below else cy + 22, lbl, "middle"))
    return out


def _mesh_arc(cx, cy, label) -> list:
    """A clockwise mesh-current arrow with its label in the middle."""
    return [f'<path d="M{_s(cx - 17)} {_s(cy + 17)} A24 24 0 1 1 {_s(cx + 17)} {_s(cy + 17)}" '
            f'class="arrow"/>',
            f'<path d="M{_s(cx + 26)} {_s(cy + 15)} L{_s(cx + 17)} {_s(cy + 17)} '
            f'L{_s(cx + 19)} {_s(cy + 8)}" class="arrow"/>',
            _text(cx, cy + 5, label, "middle")]


def _dir_word(vert, end) -> str:
    return _direction(vert, end)


def _end_word(vert, end) -> str:
    if vert:
        return "top" if end == "a" else "bottom"
    return "left" if end == "a" else "right"


def _describe_part(p: Part, vert: bool) -> str:
    k = p.kind
    if k == "R":
        s = f"resistor {p.name} = {p.text}"
    elif k == "V":
        s = f"independent voltage source {p.name} = {p.text} with + at the {_end_word(vert, p.end)}"
    elif k == "I":
        s = f"independent current source {p.name} = {p.text} with its arrow pointing {_dir_word(vert, p.end)}"
    elif k in _DEP_I:
        s = f"dependent current source (diamond) of value {p.text}, arrow pointing {_dir_word(vert, p.end)}"
    elif k in _DEP_V:
        s = f"dependent voltage source (diamond) of value {p.text} with + at the {_end_word(vert, p.end)}"
    elif k == "C":
        s = f"capacitor {p.name} = {p.text}"
    elif k == "L":
        s = f"inductor {p.name} = {p.text}"
    elif k == "SW":
        s = (f"switch {p.name or 'S'}, open before t = 0 and closing at t = 0" if p.sw == "closes"
             else f"switch {p.name or 'S'}, closed before t = 0 and opening at t = 0")
    else:
        raise ValueError(k)
    if p.vmark:
        s += f"; its voltage {p.vmark[0]} is marked with + at the {_end_word(vert, p.vmark[1])}"
    if p.imark:
        s += f"; a current {p.imark[0]} is marked through it, flowing {_dir_word(vert, p.imark[1])}"
    return s


class Ladder:
    """A circuit drawn as a ladder: a top wire and a bottom wire with vertical
    branches at columns 0..n-1 and optional parts on the wires between columns.

    cols[i]: Part, 'wire', 'term' (open terminals) or None (no branch).
    top[i], bot[i]: Part, 'wire' or None, between columns i and i+1.
    One description drives the netlist, the SVG and the diagram text.
    """

    def __init__(self, cols, top, bot=None, *, dx=170, node_labels=None, ground=None,
                 meshes=(), terms=("a", "b"), ref=("B", 0)):
        self.cols, self.top = list(cols), list(top)
        self.bot = list(bot) if bot is not None else ["wire"] * (len(cols) - 1)
        assert len(self.top) == len(self.bot) == len(self.cols) - 1
        self.dx, self.x0, self.yt, self.yb = dx, 70, 60, 230
        self.node_labels = node_labels or {}
        self.ground, self.meshes, self.terms = ground, list(meshes), terms
        parent = {}

        def find(q):
            parent.setdefault(q, q)
            while parent[q] != q:
                parent[q] = parent[parent[q]]
                q = parent[q]
            return q

        def union(p1, p2):
            parent[find(p1)] = find(p2)

        n = len(self.cols)
        for i in range(n):
            find(("T", i)); find(("B", i))
            if self.cols[i] == "wire":
                union(("T", i), ("B", i))
        for row, segs in (("T", self.top), ("B", self.bot)):
            for i, s in enumerate(segs):
                if s == "wire":
                    union((row, i), (row, i + 1))
        gnd = find(ref)
        ids, order = {gnd: 0}, [("T", i) for i in range(n)] + [("B", i) for i in range(n)]
        for q in order:
            ids.setdefault(find(q), len(ids))
        self._node = {q: ids[find(q)] for q in order}
        self.parts = {}
        for i, c in enumerate(self.cols):
            if isinstance(c, Part):
                self.parts[c.key] = (c, ("T", i), ("B", i), True)
        for i, s in enumerate(self.top):
            if isinstance(s, Part):
                self.parts[s.key] = (s, ("T", i), ("T", i + 1), False)
        for i, s in enumerate(self.bot):
            if isinstance(s, Part):
                self.parts[s.key] = (s, ("B", i), ("B", i + 1), False)

    def x(self, i):
        return self.x0 + i * self.dx

    def node(self, q) -> int:
        return self._node[q]

    # -- netlist --
    def _control(self, p: Part):
        kind, ref = p.ctrl
        if kind == "vn":
            return self.node(ref), 0, p.value
        q, A, B, _ = self.parts[ref]
        if kind == "v":
            pa, pb = (A, B) if q.vmark[1] == "a" else (B, A)
            return self.node(pa), self.node(pb), p.value
        if kind == "i":
            if q.kind != "R":
                raise ValueError("currents are sensed through resistors")
            frm, to = (B, A) if q.imark[1] == "a" else (A, B)
            return self.node(frm), self.node(to), p.value / q.value
        raise ValueError(kind)

    def els(self, closed=True, cap=None, ind=None, kill=(), values=None) -> list:
        """Netlist. closed: switch state. cap: None = capacitor open, else its voltage
        (top/left +). ind: None = inductor short, else its current (a -> b).
        kill: names of independent sources set to zero. values: name -> new value."""
        out = []
        for key, (p, A, B, _) in self.parts.items():
            a, b = self.node(A), self.node(B)
            val = (values or {}).get(key, p.value)
            if key in kill:
                val = 0.0
            k = p.kind
            if k == "R":
                out.append(El("R", key, a, b, val))
            elif k == "V":
                out.append(El("V", key, *((a, b) if p.end == "a" else (b, a)), val))
            elif k == "I":
                out.append(El("I", key, *((b, a) if p.end == "a" else (a, b)), val))
            elif k in _DEP_I:
                cp, cn, g = self._control(p)
                out.append(El("VCCS", key, *((b, a) if p.end == "a" else (a, b)), g, cp, cn))
            elif k in _DEP_V:
                cp, cn, g = self._control(p)
                out.append(El("VCVS", key, *((a, b) if p.end == "a" else (b, a)), g, cp, cn))
            elif k == "SW":
                if closed:
                    out.append(El("V", key, a, b, 0.0))
            elif k == "C":
                if cap is not None:
                    out.append(El("V", key, a, b, cap))
            elif k == "L":
                out.append(El("V", key, a, b, 0.0) if ind is None else El("I", key, a, b, ind))
            else:
                raise ValueError(k)
        return out

    def i_part(self, sol: Sol, key) -> float:
        """Current through a part from its end a to its end b."""
        p, _, _, _ = self.parts[key]
        # els() orients V-type parts + -> -, I-type parts tail -> head, the rest a -> b
        if p.kind in ("V",) + _DEP_V:
            same = p.end == "a"
        elif p.kind in ("I",) + _DEP_I:
            same = p.end == "b"
        else:
            same = True
        return sol.i[key] if same else -sol.i[key]

    def v_part(self, sol: Sol, key) -> float:
        _, A, B, _ = self.parts[key]
        return sol.v[self.node(A)] - sol.v[self.node(B)]

    def v_marked(self, sol: Sol, key) -> float:
        """Voltage across a part with the polarity of its drawn vmark."""
        p = self.parts[key][0]
        return self.v_part(sol, key) * (1 if p.vmark[1] == "a" else -1)

    def i_marked(self, sol: Sol, key) -> float:
        """Current through a part in the direction of its drawn imark."""
        p = self.parts[key][0]
        return self.i_part(sol, key) * (1 if p.imark[1] == "b" else -1)

    # -- picture --
    def svg(self, aria: str) -> str:
        n, yt, yb = len(self.cols), self.yt, self.yb
        W, H = self.x(n - 1) + 100, yb + 46
        out = [f'<svg viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
               f'aria-label="{aria}" class="circuit">']
        for row, segs, y in (("T", self.top, yt), ("B", self.bot, yb)):
            for i, s in enumerate(segs):
                x1, x2 = self.x(i), self.x(i + 1)
                if s == "wire":
                    out.append(_line(x1, y, x2, y))
                elif isinstance(s, Part):
                    out += _draw(s, x1, y, x2, y, below=row == "B")
        for i, c in enumerate(self.cols):
            x = self.x(i)
            if c == "wire":
                out.append(_line(x, yt, x, yb))
            elif c == "term":
                out += [_dot(x, yt, 4), _dot(x, yb, 4)]
                if i == 0:
                    out += [_text(x - 10, yt + 5, self.terms[0], "end"),
                            _text(x - 10, yb + 5, self.terms[1], "end")]
                else:
                    out += [_text(x + 10, yt + 5, self.terms[0]), _text(x + 10, yb + 5, self.terms[1])]
            elif isinstance(c, Part):
                out += _draw(c, x, yt, x, yb)
        for i, c in enumerate(self.cols):
            if c == "term":
                continue
            branch = c is not None
            for segs, y, row in ((self.top, yt, "T"), (self.bot, yb, "B")):
                conn = branch + (i > 0 and segs[i - 1] is not None) + (i < n - 1 and segs[i] is not None)
                if conn >= 3 or (row == "T" and i in self.node_labels):
                    out.append(_dot(self.x(i), y))
        for i, lbl in self.node_labels.items():
            out.append(_text(self.x(i), yt - 14, lbl, "middle"))
        if self.ground is not None:
            out += _ground(self.x(self.ground), yb)
        for i, lbl in self.meshes:
            out += _mesh_arc((self.x(i) + self.x(i + 1)) / 2, (yt + yb) / 2, lbl)
        out.append("</svg>")
        return "\n".join(out)

    def describe(self, extra: str = "") -> str:
        n = len(self.cols)
        s = [f"Diagram: a ladder-shaped circuit with a top wire and a bottom wire; vertical "
             f"positions are numbered 1 to {n} from left to right."]
        for i, c in enumerate(self.cols):
            if c is None:
                s.append(f"Position {i + 1}: no vertical branch (the wires pass straight through).")
            elif c == "wire":
                s.append(f"Position {i + 1}: a plain wire joins the top and bottom wires.")
            elif c == "term":
                s.append(f"Position {i + 1}: open terminals, {self.terms[0]} on the top wire and "
                         f"{self.terms[1]} on the bottom wire.")
            else:
                s.append(f"Position {i + 1} (vertical, top to bottom): {_describe_part(c, True)}.")
        for name, segs in (("top", self.top), ("bottom", self.bot)):
            for i, p in enumerate(segs):
                if isinstance(p, Part):
                    s.append(f"On the {name} wire between positions {i + 1} and {i + 2}: "
                             f"{_describe_part(p, False)}.")
                elif p is None:
                    s.append(f"The {name} wire is open between positions {i + 1} and {i + 2}.")
        if all(p == "wire" for p in self.bot):
            s.append("The bottom wire is a plain wire all the way along.")
        for i, lbl in self.node_labels.items():
            s.append(f"The top of position {i + 1} is labelled node {lbl}.")
        if self.ground is not None:
            s.append("The bottom wire is the reference (ground) node.")
        for i, lbl in self.meshes:
            s.append(f"Mesh current {lbl} circulates clockwise in the loop between positions "
                     f"{i + 1} and {i + 2}.")
        if extra:
            s.append(extra)
        return " ".join(s)


def _R(name, value, u: Units, **kw) -> Part:
    return Part("R", name, value, f"{_fmt(value)} {u.ohm}", **kw)


def _problem(text, diagram, svg, answers, steps, checks, topics) -> dict:
    if not 3 <= len(steps) <= 8:
        raise AssertionError(f"{len(steps)} steps")
    return {"statement": {"text": text, "diagram": diagram, "svg": svg},
            "key": {"answers": answers, "steps": steps, "checks": checks},
            "topics": topics}


def _ans(label, value, unit, tol=0.01) -> dict:
    return {"label": label, "value": _clean(value), "unit": unit, "tol": tol}


R_SMALL = [1, 2, 3, 4, 5, 6, 8, 10, 12]
NICE_R = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 24, 30, 40, 60]

# ---- week 3: equivalent resistance ------------------------------------------------------


def equivalent_resistance(seed: int) -> dict:
    rng = random.Random(seed)
    u = rng.choice([OHM, KOHM])
    n = rng.choice([2, 3, 3])
    for _ in range(5000):
        rp, rs = [0] * n, [None] * n
        rp[-1] = rng.choice([2, 3, 4, 5, 6, 8, 10, 12])
        rs[-1] = rng.choice([1, 2, 3, 4, 5, 6, 8, 10]) if rng.random() < 0.8 else None
        x, ok = rp[-1] + (rs[-1] or 0), True
        for k in range(n - 2, -1, -1):
            cands = [r for r in NICE_R if _nice(_par(x, r), 1)]
            if not cands:
                ok = False
                break
            rp[k] = rng.choice(cands)
            x = _par(x, rp[k])
            if k == 0 or rng.random() < 0.8:
                rs[k] = rng.choice([1, 2, 3, 4, 5, 6, 8, 10])
                x += rs[k]
        if ok and x <= 80:
            break
    else:
        raise RuntimeError("no nice ladder found")

    count = iter(range(1, 20))
    top, cols = [], ["term"]
    for k in range(n):
        top.append(_R(_sub("R", next(count)), rs[k], u) if rs[k] else "wire")
        cols.append(_R(_sub("R", next(count)), rp[k], u))
    lad = Ladder(cols, top, dx=150)
    nm = lambda p: f"\\({_tex(p.name)}\\)"  # noqa: E731
    O = u.ohm_m

    # hand method: combine from the far end
    steps, k = [], n - 1
    x = rp[k]
    if rs[k]:
        steps.append(f"Start at the far right: {nm(top[k])} and {nm(cols[k + 1])} are in series, "
                     f"\\({_m(rs[k])} + {_m(rp[k])} = {_m(rs[k] + rp[k])}\\,{O}\\).")
        x = rs[k] + rp[k]
    else:
        steps.append(f"Start at the far right with {nm(cols[k + 1])} \\(= {_m(rp[k])}\\,{O}\\).")
    for k in range(n - 2, -1, -1):
        y = _par(x, rp[k])
        s = (f"That is in parallel with {nm(cols[k + 1])}: \\(\\dfrac{{{_m(x)} \\cdot {_m(rp[k])}}}"
             f"{{{_m(x)} + {_m(rp[k])}}} = {_m(y)}\\,{O}\\)")
        if rs[k]:
            s += f"; add {nm(top[k])} in series: \\({_m(y)} + {_m(rs[k])} = {_m(y + rs[k])}\\,{O}\\)."
            y += rs[k]
        else:
            s += "."
        steps.append(s)
        x = y
    req = x
    steps.append(f"So \\(R_{{eq}} = {_m(req)}\\,{O}\\) between a and b.")

    # second check: a 1-unit test current, and separately a 1 V test source, on the netlist
    a, b = lad.node(("T", 0)), lad.node(("B", 0))
    sol_i = mna(lad.els() + [El("I", "test", b, a, 1.0)])
    _agree(sol_i.v[a] - sol_i.v[b], req, "R_eq by test current")
    sol_v = mna(lad.els() + [El("V", "test", a, b, 1.0)])
    _agree(-1.0 / sol_v.i["test"], req, "R_eq by test voltage")

    text = (f"Find the equivalent resistance \\(R_{{eq}}\\) seen between terminals a and b of the "
            f"resistor ladder below (in {u.ohm}).")
    return _problem(text, lad.describe(), lad.svg("Resistor ladder between terminals a and b"),
                    [_ans("R_eq", req, u.ohm)], steps,
                    ["Netlist with a 1-unit test current into a: v_ab equals R_eq.",
                     "Netlist with a 1 V test source across a-b: 1/i equals R_eq."],
                    ["series and parallel", "equivalent resistance"])


# ---- week 3: dividers ------------------------------------------------------------------


def voltage_divider(seed: int) -> dict:
    rng = random.Random(seed)
    u = rng.choice([OHM, KOHM])
    kind = rng.choice(["series", "loaded", "two_stage"])
    O, A = u.ohm_m, u.amp_m
    for _ in range(20000):
        Vs = rng.choice([5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30, 36])
        s = rng.choice([1, 1, 1, -1])
        R1, R2, R3, R4 = (rng.choice(R_SMALL) for _ in range(4))
        if kind == "series":
            three = rng.random() < 0.6
            rlist = [R1, R2] + ([R3] if three else [])
            tot = sum(rlist)
            target = rng.randrange(len(rlist))
            natural = rng.random() < 0.75   # + mark where the actual current enters
            v = (1 if natural else -1) * Vs * rlist[target] / tot
            i = s * Vs / tot
        elif kind == "loaded":
            P = _par(R2, R3)
            if not _nice(P, 0.5):
                continue
            v = s * Vs * P / (R1 + P)
            i = (s * Vs - v) / R1
        else:
            P = _par(R2, R3 + R4)
            if not _nice(P, 0.5):
                continue
            v1 = s * Vs * P / (R1 + P)
            v = v1 * R4 / (R3 + R4)
            i = (s * Vs - v1) / R1
        if _nice(v, 0.5) and v != 0 and _nice(i, 0.25) and i != 0:
            break
    else:
        raise RuntimeError("no nice divider found")

    plus = "a" if s > 0 else "b"
    src = Part("V", "V₁", Vs, f"{_fmt(Vs)} V", end=plus)
    steps = []
    if kind == "series":
        names = ["R₁", "R₂", "R₃"][:len(rlist)]
        # clockwise current (for s>0) enters R1 at its left, R2 at its top, R3 (bottom wire) at its right
        enter = ["a", "a", "b"] if s > 0 else ["b", "b", "a"]
        pend = enter[target] if natural else {"a": "b", "b": "a"}[enter[target]]
        parts = [_R(nm, r, u) for nm, r in zip(names, rlist)]
        parts[target].vmark = ("v", pend)
        parts[0].imark = ("i", "b")
        lad = Ladder([src, parts[1]], [parts[0]], [parts[2] if three else "wire"], dx=200)
        tgt = parts[target]
        steps.append(f"All the resistors carry the same current. Total resistance "
                     f"\\({' + '.join(_m(r) for r in rlist)} = {_m(tot)}\\,{O}\\).")
        steps.append(f"\\(i = {'' if s > 0 else '-'}\\dfrac{{{_m(Vs)}}}{{{_m(tot)}}} = {_m(i)}\\,{A}\\) "
                     f"(left to right through \\(R_1\\); "
                     + ("the + terminal of the source is at the top)." if s > 0
                        else "the source's + is at the bottom, so the current is negative)."))
        steps.append(f"Divider: \\(|v| = {_m(Vs)} \\cdot \\dfrac{{{_m(rlist[target])}}}{{{_m(tot)}}} "
                     f"= {_m(abs(v))}\\) V.")
        steps.append(f"The + mark of \\(v\\) is at the end where the actual current "
                     f"{'enters' if v > 0 else 'leaves'} \\({_tex(tgt.name)}\\), "
                     f"so \\(v = {_m(v)}\\) V.")
        target_key = tgt.key
    elif kind == "loaded":
        p1, p2 = _R("R₁", R1, u, imark=("i", "b")), _R("R₂", R2, u)
        p3 = _R("R₃", R3, u, vmark=("v", "a"))
        lad = Ladder([src, p2, p3], [p1, "wire"], dx=170)
        P = _par(R2, R3)
        steps.append(f"\\(R_2\\) and \\(R_3\\) are in parallel: \\(\\dfrac{{{_m(R2)}\\cdot{_m(R3)}}}"
                     f"{{{_m(R2)}+{_m(R3)}}} = {_m(P)}\\,{O}\\).")
        steps.append(f"Divider between \\(R_1\\) and that combination: \\(v = {_p(s * Vs)} \\cdot "
                     f"\\dfrac{{{_m(P)}}}{{{_m(R1)} + {_m(P)}}} = {_m(v)}\\) V.")
        steps.append(f"\\(i = \\dfrac{{{_p(s * Vs)} - {_p(v)}}}{{{_m(R1)}}} = {_m(i)}\\,{A}\\).")
        target_key = "R₃"
    else:
        p1, p2 = _R("R₁", R1, u, imark=("i", "b")), _R("R₂", R2, u)
        p3, p4 = _R("R₃", R3, u), _R("R₄", R4, u, vmark=("v", "a"))
        lad = Ladder([src, p2, p4], [p1, p3], dx=170)
        P = _par(R2, R3 + R4)
        v1 = s * Vs * P / (R1 + P)
        steps.append(f"\\(R_3 + R_4 = {_m(R3 + R4)}\\,{O}\\), in parallel with \\(R_2\\): "
                     f"\\(\\dfrac{{{_m(R2)}\\cdot{_m(R3 + R4)}}}{{{_m(R2)}+{_m(R3 + R4)}}} = {_m(P)}\\,{O}\\).")
        steps.append(f"First divider: the voltage at the top of \\(R_2\\) is \\({_p(s * Vs)} \\cdot "
                     f"\\dfrac{{{_m(P)}}}{{{_m(R1)} + {_m(P)}}} = {_m(v1)}\\) V.")
        steps.append(f"Second divider: \\(v = {_p(v1)} \\cdot \\dfrac{{{_m(R4)}}}{{{_m(R3)} + {_m(R4)}}} "
                     f"= {_m(v)}\\) V.")
        steps.append(f"\\(i = \\dfrac{{{_p(s * Vs)} - {_p(v1)}}}{{{_m(R1)}}} = {_m(i)}\\,{A}\\).")
        target_key = "R₄"

    sol = mna(lad.els())
    _agree(lad.v_marked(sol, target_key), v, "divider voltage")
    _agree(lad.i_marked(sol, "R₁"), i, "current in R1")
    tname = lad.parts[target_key][0].name
    text = (f"In the circuit below, find the voltage \\(v\\) across \\({_tex(tname)}\\) (polarity as "
            f"marked, in V) and the current \\(i\\) through \\(R_1\\) in the direction of its arrow "
            f"(in {u.amp}).")
    return _problem(text, lad.describe(), lad.svg("Voltage divider circuit"),
                    [_ans("v", v, "V"), _ans("i", i, u.amp)], steps,
                    ["Whole circuit re-solved by nodal analysis (MNA netlist); KCL and power balance hold."],
                    ["voltage and current division", "series and parallel", "KVL"])


def current_divider(seed: int) -> dict:
    rng = random.Random(seed)
    u = rng.choice([OHM, KOHM])
    kind = rng.choice(["parallel", "parallel", "branch"])
    O, A = u.ohm_m, u.amp_m
    for _ in range(20000):
        Is = rng.choice([1, 1.5, 2, 3, 4, 5, 6, 8, 9, 10, 12])
        s = rng.choice([1, 1, 1, -1])
        if kind == "parallel":
            rl = [rng.choice(NICE_R[:11]) for _ in range(rng.choice([2, 3]))]
            G = sum(1 / r for r in rl)
            target = rng.randrange(len(rl))
            natural = rng.random() < 0.75   # arrow along the actual current
            i = (1 if natural else -1) * Is * (1 / rl[target]) / G
            v = s * Is / G
        else:
            R1, R2, R3 = (rng.choice(R_SMALL) for _ in range(3))
            i = s * Is * R1 / (R1 + R2 + R3)
            v = s * Is * R1 * (R2 + R3) / (R1 + R2 + R3)
        if _nice(i, 0.25) and i != 0 and _nice(v, 0.5) and v != 0:
            break
    else:
        raise RuntimeError("no nice current divider found")

    src = Part("I", "I₁", Is, f"{_fmt(Is)} {u.amp}", end="a" if s > 0 else "b")
    steps = []
    if kind == "parallel":
        parts = [_R(_sub("R", k + 1), r, u) for k, r in enumerate(rl)]
        down = "b" if natural == (s > 0) else "a"
        parts[target].imark = ("i", down)
        parts[0].vmark = ("v", "a")
        lad = Ladder([src] + parts, ["wire"] * len(parts), dx=150)
        tname = parts[target].name
        steps.append(f"All branches share one voltage. Total conductance "
                     f"\\({' + '.join(f'\\tfrac{{1}}{{{_m(r)}}}' for r in rl)} = {_frac(G)}\\).")
        steps.append(f"\\(v = {'' if s > 0 else '-'}\\dfrac{{{_m(Is)}}}{{{_frac(G)}}} = {_m(v)}\\) V "
                     f"(+ at the top; the source pushes current {'up' if s > 0 else 'down'}).")
        steps.append(f"Current divider: the current down through \\({_tex(tname)}\\) is "
                     f"\\(v/{_m(rl[target])} = {_m(v / rl[target])}\\,{A}\\).")
        steps.append(f"The arrow for \\(i\\) points {'down' if down == 'b' else 'up'}, so "
                     f"\\(i = {_m(i)}\\,{A}\\).")
        target_key = parts[target].key
        v_key = parts[0].key
    else:
        p1 = _R("R₁", R1, u, vmark=("v", "a"))
        p2, p3 = _R("R₂", R2, u), _R("R₃", R3, u, imark=("i", "b"))
        lad = Ladder([src, p1, p3], ["wire", p2], dx=170)
        steps.append(f"The source current splits between \\(R_1\\) and the series branch "
                     f"\\(R_2 + R_3 = {_m(R2 + R3)}\\,{O}\\).")
        steps.append(f"Current divider: \\(i = {_p(s * Is)} \\cdot \\dfrac{{{_m(R1)}}}{{{_m(R1)} + "
                     f"{_m(R2 + R3)}}} = {_m(i)}\\,{A}\\) (down through \\(R_3\\)).")
        steps.append(f"The rest, \\({_p(s * Is)} - {_p(i)} = {_m(s * Is - i)}\\,{A}\\), flows down "
                     f"through \\(R_1\\), so \\(v = {_m(R1)} \\cdot {_p(s * Is - i)} = {_m(v)}\\) V.")
        target_key, v_key, tname = "R₃", "R₁", "R₃"

    sol = mna(lad.els())
    _agree(lad.i_marked(sol, target_key), i, "divider current")
    _agree(lad.v_marked(sol, v_key), v, "branch voltage")
    text = (f"In the circuit below, find the current \\(i\\) through \\({_tex(tname)}\\) in the "
            f"direction of its arrow (in {u.amp}) and the voltage \\(v\\) across \\(R_1\\) with the "
            f"marked polarity (in V).")
    return _problem(text, lad.describe(), lad.svg("Current divider circuit"),
                    [_ans("i", i, u.amp), _ans("v", v, "V")], steps,
                    ["Whole circuit re-solved by nodal analysis (MNA netlist); KCL and power balance hold."],
                    ["voltage and current division", "series and parallel", "KCL"])


# ---- week 4: delta-wye -----------------------------------------------------------------


def _wye_triples():
    out = []
    for p in range(1, 13):
        for q in range(1, 13):
            for r in range(1, 13):
                N = p * q + q * r + r * p
                if N % p == 0 and N % q == 0 and N % r == 0 and max(N // p, N // q, N // r) <= 60:
                    out.append((p, q, r))
    return out


_WYE = _wye_triples()


def delta_wye(seed: int) -> dict:
    rng = random.Random(seed)
    u = rng.choice([OHM, KOHM])
    O = u.ohm_m
    which = rng.choice(["top", "bottom"])
    for _ in range(20000):
        y0, y1, y2 = rng.choice(_WYE)        # arms at (a or b), c, d
        N = y0 * y1 + y1 * y2 + y2 * y0
        cd, xd, xc = N // y0, N // y1, N // y2   # Δ resistor opposite each arm
        o1, o2 = rng.choice(R_SMALL), rng.choice(R_SMALL)   # the other two resistors
        P = _par(y1 + o1, y2 + o2)
        if _nice(P, 0.5) and len({cd, xd, xc}) > 1:
            break
    else:
        raise RuntimeError("no nice bridge found")
    # R1 a-c, R2 a-d, R3 c-d, R4 c-b, R5 d-b
    if which == "top":   # Δ is a, c, d: R_ac opposite d, R_ad opposite c
        R = {1: xc, 2: xd, 3: cd, 4: o1, 5: o2}
        tri, hub = ("R₁", "R₂", "R₃"), "a"
    else:                # Δ is b, c, d: R_cb opposite d, R_db opposite c
        R = {1: o1, 2: o2, 3: cd, 4: xc, 5: xd}
        tri, hub = ("R₄", "R₅", "R₃"), "b"
    req = y0 + P

    # hand method
    S = cd + xd + xc
    if which == "top":
        arm = {"a": R[1] * R[2] / S, "c": R[1] * R[3] / S, "d": R[2] * R[3] / S}
        rest = (f"\\(R_c + R_4 = {_m(arm['c'] + R[4])}\\,{O}\\) and \\(R_d + R_5 = "
                f"{_m(arm['d'] + R[5])}\\,{O}\\)")
        prods = ("R_1R_2", "R_1R_3", "R_2R_3")
        pv = ((R[1], R[2]), (R[1], R[3]), (R[2], R[3]))
    else:
        arm = {"b": R[4] * R[5] / S, "c": R[4] * R[3] / S, "d": R[5] * R[3] / S}
        rest = (f"\\(R_1 + R_c = {_m(arm['c'] + R[1])}\\,{O}\\) and \\(R_2 + R_d = "
                f"{_m(arm['d'] + R[2])}\\,{O}\\)")
        prods = ("R_4R_5", "R_4R_3", "R_5R_3")
        pv = ((R[4], R[5]), (R[4], R[3]), (R[5], R[3]))
    for got, want in zip((arm[hub], arm["c"], arm["d"]), (y0, y1, y2)):
        _agree(got, want, "Δ→Y arm")
    steps = [
        f"Convert the Δ formed by \\({_tex(tri[0])}, {_tex(tri[1])}, {_tex(tri[2])}\\) (between nodes "
        f"{hub}, c, d) to a Y with a new centre node. Sum: \\({_m(R[int(_UNSUB[tri[0][1]])])} + "
        f"{_m(R[int(_UNSUB[tri[1][1]])])} + {_m(R[3])} = {_m(S)}\\,{O}\\).",
        "Each Y arm is the product of the two Δ resistors touching that node over the sum: "
        f"\\(R_{hub} = \\dfrac{{{prods[0]}}}{{\\Sigma}} = \\dfrac{{{_m(pv[0][0])}\\cdot{_m(pv[0][1])}}}"
        f"{{{_m(S)}}} = {_m(y0)}\\,{O}\\), "
        f"\\(R_c = \\dfrac{{{_m(pv[1][0])}\\cdot{_m(pv[1][1])}}}{{{_m(S)}}} = {_m(y1)}\\,{O}\\), "
        f"\\(R_d = \\dfrac{{{_m(pv[2][0])}\\cdot{_m(pv[2][1])}}}{{{_m(S)}}} = {_m(y2)}\\,{O}\\).",
        f"Now {rest} are in parallel: \\(\\dfrac{{{_m(y1 + o1)}\\cdot{_m(y2 + o2)}}}"
        f"{{{_m(y1 + o1)} + {_m(y2 + o2)}}} = {_m(P)}\\,{O}\\).",
        f"Add the arm \\(R_{hub}\\) in series: \\(R_{{eq}} = {_m(y0)} + {_m(P)} = {_m(req)}\\,{O}\\).",
    ]

    # second check: the original bridge (no transformation) and the Y version, on netlists
    a, c, d, b, hubn = 1, 2, 3, 0, 4
    bridge = [El("R", "R1", a, c, R[1]), El("R", "R2", a, d, R[2]), El("R", "R3", c, d, R[3]),
              El("R", "R4", c, b, R[4]), El("R", "R5", d, b, R[5])]
    test = El("I", "test", b, a, 1.0)
    s1 = mna(bridge + [test])
    _agree(s1.v[a], req, "bridge R_eq by test current")
    node_of = {"a": a, "b": b}
    keep = [e for e in bridge if e.name not in {"R" + _UNSUB[t[1]] for t in tri}]
    wye = keep + [El("R", "Yh", node_of[hub], hubn, y0), El("R", "Yc", c, hubn, y1),
                  El("R", "Yd", d, hubn, y2)]
    s2 = mna(wye + [test])
    for n_ in (a, c, d):
        _agree(s1.v[n_], s2.v[n_], "Δ and Y give the same node voltages")
    # and Y -> Δ brings back the original Δ
    Nb = y0 * y1 + y1 * y2 + y2 * y0
    for got, want in zip((Nb / y0, Nb / y1, Nb / y2), (cd, xd, xc)):
        _agree(got, want, "Y→Δ round trip")

    labels = {k: f"{_fmt(R[k])} {u.ohm}" for k in R}
    names = {1: "a and c", 2: "a and d", 3: "c and d", 4: "c and b", 5: "d and b"}
    diagram = ("Diagram: a bridge network between terminals a (top) and b (bottom). Node a feeds a top "
               "wire whose left end goes down to node c and right end down to node d; c and d go down "
               "to a bottom wire that leads to terminal b. "
               + " ".join(f"R{str(k).translate(_SUB)} = {labels[k]} is between nodes {names[k]}"
                          f"{' (the bridge across the middle)' if k == 3 else ''}." for k in R))
    text = (f"For the bridge below, convert the Δ formed by \\({_tex(tri[0])}\\), \\({_tex(tri[1])}\\) "
            f"and \\({_tex(tri[2])}\\) into an equivalent Y. Give the three Y resistors "
            f"\\(R_{hub}\\), \\(R_c\\), \\(R_d\\) (the arms that connect to nodes {hub}, c and d), "
            f"then use them to find \\(R_{{eq}}\\) between a and b (all in {u.ohm}).")
    return _problem(text, diagram, _bridge_svg(R, u),
                    [_ans(f"R_{hub} (Y arm at {hub})", y0, u.ohm), _ans("R_c (Y arm at c)", y1, u.ohm),
                     _ans("R_d (Y arm at d)", y2, u.ohm), _ans("R_eq", req, u.ohm)], steps,
                    ["Original bridge solved with a 1-unit test current (no Δ-Y step): v_ab equals R_eq.",
                     "Y-version netlist gives the same voltages at a, c and d as the bridge.",
                     "Converting the Y back to a Δ recovers the original three resistors."],
                    ["Y-delta transformation", "equivalent resistance"])


def _bridge_svg(R, u) -> str:
    p = {k: _R(_sub("R", k), R[k], u, side="left" if k in (1, 4) else "right") for k in R}
    out = ['<svg viewBox="0 0 420 360" width="420" height="360" role="img" '
           'aria-label="Bridge network between terminals a and b" class="circuit">',
           _line(110, 60, 310, 60), _line(210, 60, 210, 22), _dot(210, 22, 4), _text(222, 27, "a"),
           _line(110, 300, 310, 300), _line(210, 300, 210, 338), _dot(210, 338, 4), _text(222, 343, "b"),
           _dot(210, 60), _dot(210, 300), _dot(110, 180), _dot(310, 180),
           _text(98, 199, "c", "end"), _text(322, 199, "d")]
    out += _draw(p[1], 110, 60, 110, 180) + _draw(p[2], 310, 60, 310, 180)
    out += _draw(p[3], 110, 180, 310, 180)
    out += _draw(p[4], 110, 180, 110, 300) + _draw(p[5], 310, 180, 310, 300)
    out.append("</svg>")
    return "\n".join(out)


# ---- week 4: nodal analysis --------------------------------------------------------------


def nodal_two_node(seed: int) -> dict:
    rng = random.Random(seed)
    u = rng.choice([OHM, KOHM])
    O, A = u.ohm_m, u.amp_m
    Rs = [1, 2, 4, 5, 10] + ([20] if u is KOHM else [])
    for _ in range(50000):
        left, right = rng.choice("IV"), rng.choice("IV")
        dep = rng.choice([None, None, "VCCS", "CCCS"])
        Ra, Rb, Rc = (rng.choice(Rs) for _ in range(3))
        R1s = rng.choice(Rs) if left == "V" else None
        R2s = rng.choice(Rs) if right == "V" else None
        v1 = rng.choice([-6, -4, 2, 4, 5, 6, 8, 10, 12, 16, 20])
        v2 = rng.choice([-8, -4, -2, 2, 3, 4, 6, 8, 10, 12])
        if v1 == v2:
            continue
        sd = rng.choice([1, -1])
        gain = rng.choice([0.25, 0.5, 1, 2]) if dep == "VCCS" else rng.choice([0.5, 2, 3, 4])
        ix = (v1 - v2) / Rb
        dep_in = (sd * gain * (v1 if dep == "VCCS" else ix)) if dep else 0.0   # into node 2
        need1 = v1 / Ra + (v1 - v2) / Rb
        need2 = v2 / Rc + (v2 - v1) / Rb - dep_in
        src1 = need1 if left == "I" else v1 + R1s * need1
        src2 = need2 if right == "I" else v2 + R2s * need2
        ok = all(x != 0 for x in (src1, src2))
        ok = ok and (_nice(src1, 0.5, 12) if left == "I" else _nice(src1, 1, 40))
        ok = ok and (_nice(src2, 0.5, 12) if right == "I" else _nice(src2, 1, 40))
        if dep:
            ok = ok and dep_in != 0 and _nice(dep_in, 0.25, 12)
        if not ok:
            continue
        # the nodal matrix the student writes (sum of currents leaving = 0)
        G = np.array([[1 / Ra + 1 / Rb + (1 / R1s if R1s else 0), -1 / Rb],
                      [-1 / Rb, 1 / Rc + 1 / Rb + (1 / R2s if R2s else 0)]])
        if dep == "VCCS":
            G[1, 0] -= sd * gain
        elif dep == "CCCS":
            G[1, 0] -= sd * gain / Rb
            G[1, 1] += sd * gain / Rb
        rhs = np.array([src1 if left == "I" else src1 / R1s, src2 if right == "I" else src2 / R2s])
        det = np.linalg.det(G)
        if abs(det) > 1e-6 and _nice(det, 1 / 400):
            break
    else:
        raise RuntimeError("no nice nodal circuit found")

    # primary: solve the nodal equations
    sol_v = np.linalg.solve(G, rhs)
    _agree(sol_v[0], v1, "v1 from nodal matrix")
    _agree(sol_v[1], v2, "v2 from nodal matrix")

    count = iter(range(1, 9))
    if left == "I":
        L = Part("I", "I₁", abs(src1), f"{_fmt(abs(src1))} {u.amp}", end="a" if src1 > 0 else "b")
        seg0, pRs1 = "wire", None
    else:
        L = Part("V", "V₁", abs(src1), f"{_fmt(abs(src1))} V", end="a" if src1 > 0 else "b")
        pRs1 = _R(_sub("R", next(count)), R1s, u)
        seg0 = pRs1
    pRa = _R(_sub("R", next(count)), Ra, u)
    pRb = _R(_sub("R", next(count)), Rb, u, imark=("iₓ", "b") if dep == "CCCS" else None)
    pRc = _R(_sub("R", next(count)), Rc, u)
    if right == "I":
        Rt = Part("I", "I₂", abs(src2), f"{_fmt(abs(src2))} {u.amp}", end="a" if src2 > 0 else "b")
        segR, pRs2 = "wire", None
    else:
        Rt = Part("V", "V₂", abs(src2), f"{_fmt(abs(src2))} V", end="a" if src2 > 0 else "b")
        pRs2 = _R(_sub("R", next(count)), R2s, u)
        segR = pRs2
    extra = ""
    if dep:
        D = (Part("VCCS", "", gain, f"{_gain(gain, "v₁")}", end="a" if sd > 0 else "b", ctrl=("vn", ("T", 1)),
                  key="dep") if dep == "VCCS" else
             Part("CCCS", "", gain, f"{_gain(gain, "iₓ")}", end="a" if sd > 0 else "b", ctrl=("i", pRb.key),
                  key="dep"))
        cols, top = [L, pRa, pRc, D, Rt], [seg0, pRb, "wire", segR]
        extra = (f"The diamond is a voltage-controlled current source of {_gain(gain, "v₁")} {u.amp} "
                 f"(gain {_fmt(gain)} {u.gm}), where v₁ is the voltage of node v₁."
                 if dep == "VCCS" else
                 f"The diamond is a current-controlled current source of {_gain(gain, "iₓ")}, where iₓ is "
                 f"the current through {pRb.name} from node v₁ to node v₂.")
    else:
        cols, top = [L, pRa, pRc, Rt], [seg0, pRb, segR]
    lad = Ladder(cols, top, dx=150, node_labels={1: "v₁", 2: "v₂"}, ground=1)

    # second check: MNA on the drawn netlist (sources as real branches) + KCL/power checks
    sol = mna(lad.els())
    _agree(sol.v[lad.node(("T", 1))], v1, "v1 by MNA")
    _agree(sol.v[lad.node(("T", 2))], v2, "v2 by MNA")

    nRa, nRb, nRc = _tex(pRa.name), _tex(pRb.name), _tex(pRc.name)

    def branch(src, R_s, part, node):
        if R_s:
            vs = src  # signed: the source's top terminal sits at this potential
            return f"\\dfrac{{v_{node} {'-' if vs > 0 else '+'} {_m(abs(vs))}}}{{{_m(R_s)}}}"
        return f"{'-' if src > 0 else ''}{_m(abs(src))}"

    t1 = [branch(src1, R1s, L, 1), f"\\dfrac{{v_1}}{{{_m(Ra)}}}", f"\\dfrac{{v_1 - v_2}}{{{_m(Rb)}}}"]
    t2 = [f"\\dfrac{{v_2 - v_1}}{{{_m(Rb)}}}", f"\\dfrac{{v_2}}{{{_m(Rc)}}}"]
    if dep:
        t2.append(f"{'-' if sd > 0 else ''}{_m(gain)}{'v_1' if dep == 'VCCS' else 'i_x'}")
    t2.append(branch(src2, R2s, Rt, 2))
    steps = [f"Take the bottom wire as ground and write KCL as \"sum of currents leaving = 0\" "
             f"(currents in {u.amp}, resistances in {u.ohm})."]
    steps.append(f"Node \\(v_1\\): \\({_sum(t1)} = 0\\).")
    if dep == "CCCS":
        steps.append(f"The controlling current is \\(i_x = \\dfrac{{v_1 - v_2}}{{{_m(Rb)}}}\\) "
                     f"(through \\({nRb}\\)).")
    steps.append(f"Node \\(v_2\\): \\({_sum(t2)} = 0\\).")
    steps.append(f"Collect terms: \\(\\begin{{bmatrix}} {_frac(G[0, 0])} & {_frac(G[0, 1])} \\\\ "
                 f"{_frac(G[1, 0])} & {_frac(G[1, 1])} \\end{{bmatrix}} \\begin{{bmatrix}} v_1 \\\\ v_2 "
                 f"\\end{{bmatrix}} = \\begin{{bmatrix}} {_frac(rhs[0])} \\\\ {_frac(rhs[1])} "
                 f"\\end{{bmatrix}}\\).")
    steps.append(f"Determinant \\(\\Delta = {_frac(det)}\\); Cramer's rule gives \\(v_1 = {_m(v1)}\\) V "
                 f"and \\(v_2 = {_m(v2)}\\) V.")
    text = ("Use nodal analysis to find the node voltages \\(v_1\\) and \\(v_2\\) (relative to the "
            "ground at the bottom), in V." + (" " + extra if dep else ""))
    return _problem(text, lad.describe(extra), lad.svg("Two-node circuit for nodal analysis"),
                    [_ans("v1", v1, "V"), _ans("v2", v2, "V")], steps,
                    ["Values built backwards from chosen node voltages; the nodal matrix reproduces them.",
                     "MNA netlist with voltage sources as real branches gives the same node voltages; "
                     "KCL and power balance hold."],
                    ["nodal analysis"] + (["dependent sources"] if dep else []))


# ---- weeks 5-6: mesh analysis ------------------------------------------------------------


def _solve2(a, b, c, d, e, f):
    """Exact 2x2 solve with Fractions: [[a,b],[c,d]] x = [e,f]."""
    a, b, c, d, e, f = (Fraction(x).limit_denominator(1000) for x in (a, b, c, d, e, f))
    det = a * d - b * c
    if det == 0:
        return None
    return (e * d - b * f) / det, (a * f - e * c) / det, det


def _quarter(x: Fraction, hi=10) -> bool:
    return x != 0 and (4 % x.denominator == 0) and abs(x) <= hi


def mesh_two_loop(seed: int) -> dict:
    rng = random.Random(seed)
    u = rng.choice([OHM, KOHM])
    A_ = u.amp_m
    Rv = [1, 2, 3, 4, 5, 6, 8, 10]
    for _ in range(50000):
        R1, R2, R3 = (rng.choice(Rv) for _ in range(3))
        R5 = rng.choice([None, None, 1, 2, 3, 4])
        R6 = rng.choice([None, None, 1, 2, 4])
        V1, s1 = rng.randint(2, 30), rng.choice([1, 1, -1])
        right = rng.choice(["V", "V", "CCVS", "VCVS"])
        s2 = rng.choice([1, -1])
        L1, L2 = R1 + R3 + (R5 or 0), R2 + R3 + (R6 or 0)
        if right == "V":
            V2 = rng.randint(2, 24)
            row2, f = (-R3, L2), -s2 * V2
        elif right == "CCVS":
            gain = rng.choice([1, 2, 3, 4])
            row2, f = (-R3 + s2 * gain, L2 - s2 * gain), 0
        else:
            gain = rng.choice([0.5, 1, 2, 3])
            row2, f = (-R3 + s2 * gain * R1, L2), 0
        r = _solve2(L1, -R3, row2[0], row2[1], s1 * V1, f)
        if r and _quarter(r[0]) and _quarter(r[1]) and r[0] != r[1]:
            I1, I2, det = (float(q) for q in r)
            break
    else:
        raise RuntimeError("no nice mesh circuit found")
    M = np.array([[L1, -R3], [row2[0], row2[1]]], dtype=float)
    rhs = np.array([s1 * V1, f], dtype=float)
    sol_m = np.linalg.solve(M, rhs)
    _agree(sol_m[0], I1, "I1 (mesh matrix)")
    _agree(sol_m[1], I2, "I2 (mesh matrix)")
    ix = I1 - I2

    p1 = _R("R₁", R1, u, vmark=("vₓ", "a") if right == "VCVS" else None)
    p2, p3 = _R("R₂", R2, u), _R("R₃", R3, u, imark=("iₓ", "b"))
    p5 = _R("R₄", R5, u) if R5 else "wire"
    p6 = _R("R₅" if R5 else "R₄", R6, u) if R6 else "wire"
    src1 = Part("V", "V₁", V1, f"{_fmt(V1)} V", end="a" if s1 > 0 else "b")
    unit_r = u.ohm
    if right == "V":
        rp = Part("V", "V₂", V2, f"{_fmt(V2)} V", end="a" if s2 > 0 else "b")
        extra = ""
    elif right == "CCVS":
        rp = Part("CCVS", "", gain, f"{_gain(gain, "iₓ")}", end="a" if s2 > 0 else "b", ctrl=("i", "R₃"),
                  key="dep")
        extra = (f"The diamond is a current-controlled voltage source of {_gain(gain, "iₓ")} volts "
                 f"(gain {_fmt(gain)} {unit_r}), where iₓ is the current flowing down through R₃.")
    else:
        rp = Part("VCVS", "", gain, f"{_gain(gain, "vₓ")}", end="a" if s2 > 0 else "b", ctrl=("v", "R₁"),
                  key="dep")
        extra = (f"The diamond is a voltage-controlled voltage source of {_gain(gain, "vₓ")}, where vₓ is "
                 f"the voltage across R₁ with + at its left end.")
    lad = Ladder([src1, p3, rp], [p1, p2], [p5, p6], dx=190, meshes=[(0, "I₁"), (1, "I₂")])

    sol = mna(lad.els())
    _agree(lad.i_part(sol, "R₁"), I1, "I1 by MNA")
    _agree(lad.i_part(sol, "R₂"), I2, "I2 by MNA")
    _agree(lad.i_marked(sol, "R₃"), ix, "ix by MNA")

    t1 = [f"{'-' if s1 > 0 else ''}{_m(V1)}", f"{_m(R1)}I_1", f"{_m(R3)}(I_1 - I_2)"]
    if R5:
        t1.append(f"{_m(R5)}I_1")
    t2 = [f"{_m(R3)}(I_2 - I_1)", f"{_m(R2)}I_2"]
    if R6:
        t2.append(f"{_m(R6)}I_2")
    if right == "V":
        t2.append(f"{'' if s2 > 0 else '-'}{_m(V2)}")
    else:
        t2.append(f"{'' if s2 > 0 else '-'}{_m(gain)}{'i_x' if right == 'CCVS' else 'v_x'}")
    steps = [f"Mesh 1, clockwise, adding voltage drops (resistances in {u.ohm}, currents in {u.amp}): "
             f"\\({_sum(t1)} = 0\\).",
             f"Mesh 2, clockwise: \\({_sum(t2)} = 0\\)."]
    if right == "CCVS":
        steps.append("The controlling current is the net current down \\(R_3\\): \\(i_x = I_1 - I_2\\).")
    elif right == "VCVS":
        steps.append(f"The controlling voltage is across \\(R_1\\), which carries \\(I_1\\): "
                     f"\\(v_x = {_m(R1)}I_1\\).")
    steps.append(f"Collect terms: \\(\\begin{{bmatrix}} {_m(L1)} & {_m(-R3)} \\\\ {_m(row2[0])} & "
                 f"{_m(row2[1])} \\end{{bmatrix}} \\begin{{bmatrix}} I_1 \\\\ I_2 \\end{{bmatrix}} = "
                 f"\\begin{{bmatrix}} {_m(s1 * V1)} \\\\ {_m(f)} \\end{{bmatrix}}\\).")
    steps.append(f"\\(\\Delta = {_m(det)}\\); Cramer's rule: \\(I_1 = {_m(I1)}\\,{A_}\\), "
                 f"\\(I_2 = {_m(I2)}\\,{A_}\\).")
    steps.append(f"Down through \\(R_3\\): \\(i_x = I_1 - I_2 = {_m(ix)}\\,{A_}\\).")
    text = (f"Use mesh analysis to find the clockwise mesh currents \\(I_1\\) and \\(I_2\\) and the "
            f"current \\(i_x\\) flowing down through \\(R_3\\) (all in {u.amp}).")
    if extra:
        text += " " + extra
    return _problem(text, lad.describe(extra), lad.svg("Two-mesh circuit"),
                    [_ans("I1", I1, u.amp), _ans("I2", I2, u.amp), _ans("ix", ix, u.amp)], steps,
                    ["Mesh equations solved exactly (fractions) and with numpy; they agree.",
                     "Independent nodal (MNA) solution gives the same branch currents; KCL and power "
                     "balance hold."],
                    ["mesh analysis"] + (["dependent sources"] if right != "V" else []))


def supermesh(seed: int) -> dict:
    rng = random.Random(seed)
    u = rng.choice([OHM, KOHM])
    A_, O = u.amp_m, u.ohm_m
    Rv = [1, 2, 3, 4, 5, 6, 8, 10]
    for _ in range(50000):
        R1, R2 = rng.choice(Rv), rng.choice(Rv)
        R4 = rng.choice([None, None, 1, 2, 3, 4])
        R5 = rng.choice([None, None, 1, 2, 4])
        right = rng.choice(["R", "R", "V"])
        R3 = rng.choice(Rv) if right == "R" else None
        V1, s1 = rng.randint(4, 36), rng.choice([1, 1, -1])
        V2, s2 = rng.randint(2, 20), rng.choice([1, -1])
        Is = rng.choice([0.5, 1, 1.5, 2, 3, 4])
        sI = rng.choice([1, -1])          # +1: source arrow points down
        L1, L2 = R1 + (R4 or 0), R2 + (R5 or 0) + (R3 or 0)
        f = s1 * V1 - (s2 * V2 if right == "V" else 0)
        r = _solve2(1, -1, L1, L2, sI * Is, f)
        if r and _quarter(r[0]) and _quarter(r[1]):
            I1, I2 = float(r[0]), float(r[1])
            vs = s1 * V1 - L1 * I1
            if vs != 0 and abs(vs) <= 60:
                break
    else:
        raise RuntimeError("no nice supermesh circuit found")
    sol_m = np.linalg.solve(np.array([[1, -1], [L1, L2]], float), np.array([sI * Is, f], float))
    _agree(sol_m[0], I1, "I1")
    _agree(sol_m[1], I2, "I2")
    vs2 = L2 * I2 + (s2 * V2 if right == "V" else 0)
    _agree(vs, vs2, "source voltage from mesh 1 and from mesh 2")

    cnt = iter(range(3, 9))
    p1, p2 = _R("R₁", R1, u), _R("R₂", R2, u)
    p4 = _R(_sub("R", next(cnt)), R4, u) if R4 else "wire"
    p5 = _R(_sub("R", next(cnt)), R5, u) if R5 else "wire"
    if right == "R":
        rp = _R(_sub("R", next(cnt)), R3, u)
    else:
        rp = Part("V", "V₂", V2, f"{_fmt(V2)} V", end="a" if s2 > 0 else "b")
    src = Part("V", "V₁", V1, f"{_fmt(V1)} V", end="a" if s1 > 0 else "b")
    cs = Part("I", "Iₛ", Is, f"{_fmt(Is)} {u.amp}", end="b" if sI > 0 else "a", vmark=("v", "a"))
    lad = Ladder([src, cs, rp], [p1, p2], [p4, p5], dx=190, meshes=[(0, "I₁"), (1, "I₂")])
    sol = mna(lad.els())
    _agree(lad.i_part(sol, "R₁"), I1, "I1 by MNA")
    _agree(lad.i_part(sol, "R₂"), I2, "I2 by MNA")
    _agree(lad.v_marked(sol, "Iₛ"), vs, "source voltage by MNA")

    outer = [f"{'-' if s1 > 0 else ''}{_m(V1)}", f"{_m(L1)}I_1", f"{_m(L2)}I_2"]
    if right == "V":
        outer.append(f"{'' if s2 > 0 else '-'}{_m(V2)}")
    l1_names = "R_1" + (f" + {_tex(p4.name)}" if R4 else "")
    l2_names = " + ".join(_tex(p.name) for p in (p2, p5, rp) if isinstance(p, Part) and p.kind == "R")
    steps = [
        f"The current source is shared by both meshes, so it fixes their difference: the net current "
        f"down through it is \\(I_1 - I_2\\), hence \\(I_1 - I_2 = {_m(sI * Is)}\\).",
        f"Supermesh: go clockwise around the outside, skipping the current source. The resistance "
        f"carrying \\(I_1\\) is \\({l1_names} = {_m(L1)}\\,{O}\\) and the resistance carrying \\(I_2\\) "
        f"is \\({l2_names} = {_m(L2)}\\,{O}\\): \\({_sum(outer)} = 0\\).",
        f"Substitute \\(I_1 = I_2 + {_p(sI * Is)}\\): \\({_m(L1 + L2)}I_2 = {_m(f - L1 * sI * Is)}\\), so "
        f"\\(I_2 = {_m(I2)}\\,{A_}\\) and \\(I_1 = {_m(I1)}\\,{A_}\\).",
        f"Mesh 1 alone (the source's voltage \\(v\\) is a drop going down): "
        f"\\({'-' if s1 > 0 else ''}{_m(V1)} + {_m(L1)}({_m(I1)}) + v = 0\\), so \\(v = {_m(vs)}\\) V.",
    ]
    text = (f"Use mesh analysis (a supermesh) to find the clockwise mesh currents \\(I_1\\) and "
            f"\\(I_2\\) (in {u.amp}) and the voltage \\(v\\) across the current source, + at its top "
            f"(in V).")
    return _problem(text, lad.describe(), lad.svg("Two meshes sharing a current source"),
                    [_ans("I1", I1, u.amp), _ans("I2", I2, u.amp), _ans("v", vs, "V")], steps,
                    ["The source voltage computed from mesh 1 and from mesh 2 agree.",
                     "Independent nodal (MNA) solution gives the same currents and voltage; KCL and "
                     "power balance hold."],
                    ["supermesh", "mesh analysis"])


# ---- week 6: superposition -------------------------------------------------------------


def superposition(seed: int) -> dict:
    rng = random.Random(seed)
    u = rng.choice([OHM, KOHM])
    O, A_ = u.ohm_m, u.amp_m
    kind = rng.choice(["VI", "VV", "IV"])
    want = rng.choice(["v", "i"])
    for _ in range(50000):
        R1, R2, R3 = (rng.choice(R_SMALL) for _ in range(3))
        Va, sa = rng.randint(2, 30), rng.choice([1, 1, -1])
        Vb, sb = rng.randint(2, 30), rng.choice([1, -1])
        Ia, Ib = rng.choice([0.5, 1, 1.5, 2, 3, 4, 6]), rng.choice([0.5, 1, 1.5, 2, 3, 4, 6])
        if kind == "VI":   # V source left, I source right
            c1 = sa * Va * R2 / (R1 + R2)
            c2 = sb * Ib * _par(R1, R2)
            shown = [_par(R1, R2)]
        elif kind == "VV":
            c1 = sa * Va * _par(R2, R3) / (R1 + _par(R2, R3))
            c2 = sb * Vb * _par(R1, R2) / (R3 + _par(R1, R2))
            shown = [_par(R2, R3), _par(R1, R2)]
        else:              # I source left, V source right
            c1 = sa * Ia * _par(R2, R3)
            c2 = sb * Vb * R2 / (R2 + R3)
            shown = [_par(R2, R3)]
        if not all(_nice(x, 0.25) for x in shown):
            continue
        if want == "i":
            c1, c2 = c1 / R2, c2 / R2
        step = 0.5 if want == "v" else 0.25
        if _nice(c1, step, 40) and _nice(c2, step, 40) and c1 != 0 and c2 != 0 and c1 + c2 != 0:
            break
    else:
        raise RuntimeError("no nice superposition circuit found")
    total = c1 + c2
    mark = {"vmark": ("v", "a")} if want == "v" else {"imark": ("i", "b")}
    p1, p2, p3 = _R("R₁", R1, u), _R("R₂", R2, u, **mark), _R("R₃", R3, u)
    if kind == "VI":
        S1 = Part("V", "V₁", Va, f"{_fmt(Va)} V", end="a" if sa > 0 else "b")
        S2 = Part("I", "I₂", Ib, f"{_fmt(Ib)} {u.amp}", end="a" if sb > 0 else "b")
    elif kind == "VV":
        S1 = Part("V", "V₁", Va, f"{_fmt(Va)} V", end="a" if sa > 0 else "b")
        S2 = Part("V", "V₂", Vb, f"{_fmt(Vb)} V", end="a" if sb > 0 else "b")
    else:
        S1 = Part("I", "I₁", Ia, f"{_fmt(Ia)} {u.amp}", end="a" if sa > 0 else "b")
        S2 = Part("V", "V₂", Vb, f"{_fmt(Vb)} V", end="a" if sb > 0 else "b")
    lad = Ladder([S1, p2, S2], [p1, p3], dx=180)

    # second check: each single-source circuit and the full circuit, on the netlist
    meas = (lambda s_: lad.v_marked(s_, "R₂")) if want == "v" else (lambda s_: lad.i_marked(s_, "R₂"))
    _agree(meas(mna(lad.els(kill={S2.key}))), c1, f"{S1.name} alone")
    _agree(meas(mna(lad.els(kill={S1.key}))), c2, f"{S2.name} alone")
    _agree(meas(mna(lad.els())), total, "both sources together")

    q = "v" if want == "v" else "i"
    unit = "V" if want == "v" else u.amp
    um = "\\text{V}" if want == "v" else A_
    div = "" if want == "v" else f" Dividing by \\(R_2 = {_m(R2)}\\,{O}\\) gives the current."

    def kill_txt(src):
        return "short circuit" if src.kind == "V" else "open circuit"

    if kind == "VI":
        e1 = (f"Only \\(V_1\\) (\\(I_2\\) → open, so \\(R_3\\) carries nothing): divider "
              f"\\({_p(sa * Va)}\\cdot\\dfrac{{{_m(R2)}}}{{{_m(R1)} + {_m(R2)}}}\\).")
        e2 = (f"Only \\(I_2\\) (\\(V_1\\) → short): \\({_p(sb * Ib)}\\) flows through \\(R_3\\) into "
              f"\\(R_1 \\parallel R_2 = {_m(_par(R1, R2))}\\,{O}\\), so the voltage is "
              f"\\({_p(sb * Ib)}\\cdot{_m(_par(R1, R2))}\\).")
    elif kind == "VV":
        e1 = (f"Only \\(V_1\\) (\\(V_2\\) → short, so \\(R_2 \\parallel R_3 = {_m(_par(R2, R3))}\\,{O}\\)): "
              f"\\({_p(sa * Va)}\\cdot\\dfrac{{{_m(_par(R2, R3))}}}{{{_m(R1)} + {_m(_par(R2, R3))}}}\\).")
        e2 = (f"Only \\(V_2\\) (\\(V_1\\) → short, so \\(R_1 \\parallel R_2 = {_m(_par(R1, R2))}\\,{O}\\)): "
              f"\\({_p(sb * Vb)}\\cdot\\dfrac{{{_m(_par(R1, R2))}}}{{{_m(R3)} + {_m(_par(R1, R2))}}}\\).")
    else:
        e1 = (f"Only \\(I_1\\) (\\(V_2\\) → short): \\({_p(sa * Ia)}\\) flows through \\(R_1\\) into "
              f"\\(R_2 \\parallel R_3 = {_m(_par(R2, R3))}\\,{O}\\), so the voltage is "
              f"\\({_p(sa * Ia)}\\cdot{_m(_par(R2, R3))}\\).")
        e2 = (f"Only \\(V_2\\) (\\(I_1\\) → open, so \\(R_1\\) carries nothing): divider "
              f"\\({_p(sb * Vb)}\\cdot\\dfrac{{{_m(R2)}}}{{{_m(R2)} + {_m(R3)}}}\\).")
    steps = ["Superposition: find the response to each independent source alone, with the other "
             "set to zero (a zeroed voltage source is a short, a zeroed current source an open). "
             "Voltages below are across \\(R_2\\), + at the top.",
             e1 + div + f" So \\({q}' = {_m(c1)}\\,{um}\\).",
             e2 + div + f" So \\({q}'' = {_m(c2)}\\,{um}\\).",
             f"Add: \\({q} = {q}' + {q}'' = {_p(c1)} + {_p(c2)} = {_m(total)}\\,{um}\\)."]
    what = (f"the voltage \\(v\\) across \\(R_2\\) (+ at the top, in V)" if want == "v"
            else f"the current \\(i\\) flowing down through \\(R_2\\) (in {u.amp})")
    text = (f"Use superposition to find {what}. Give the part due to \\({_tex(S1.name)}\\) alone, the "
            f"part due to \\({_tex(S2.name)}\\) alone, and the total.")
    return _problem(text, lad.describe(), lad.svg("Two-source circuit for superposition"),
                    [_ans(f"{q} due to {S1.name}", c1, unit), _ans(f"{q} due to {S2.name}", c2, unit),
                     _ans(f"total {q}", total, unit)], steps,
                    [f"Netlist with {S2.name} zeroed reproduces the first part, and with {S1.name} "
                     "zeroed the second.",
                     "Netlist with both sources on gives the total directly; KCL and power balance hold."],
                    ["superposition"])


# ---- week 7: Thevenin and maximum power ------------------------------------------------


def _thevenin_circuit(rng, u, kinds):
    """A source network feeding terminals a-b. Returns everything both generators need."""
    O, A_ = u.ohm_m, u.amp_m
    kind = rng.choice(kinds)
    for _ in range(50000):
        R1, R2, R3 = (rng.choice(R_SMALL) for _ in range(3))
        Vs, s = rng.choice([4, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30]), rng.choice([1, 1, 1, -1])
        Is, t = rng.choice([0.5, 1, 1.5, 2, 3, 4]), rng.choice([1, -1])
        gain = rng.choice([0.5, 1, 2, 3])
        P12 = _par(R1, R2)
        isc = None
        if kind == "T1":
            voc, rth = s * Vs * R2 / (R1 + R2), R3 + P12
        elif kind == "T2":
            voc, rth = (s * Vs / R1 + t * Is) * P12, R3 + P12
        elif kind == "T3":
            k = 1 + t * gain
            if k <= 0:
                continue
            voc = k * s * Vs * R2 / (R1 + k * R2)
            rth = R3 + 1 / (k / R1 + 1 / R2)
            v1sc = (k * s * Vs / R1) / (k / R1 + 1 / R2 + 1 / R3)
            isc = v1sc / R3
        else:
            k = 1 + t * gain
            if k <= 0:
                continue
            voc = k * s * Vs * R2 / (R1 + R2)
            rth = R3 + k * P12
            v1sc = (s * Vs / R1) / (1 / R1 + 1 / R2 + k / R3)
            isc = k * v1sc / R3
        if isc is None:
            isc = voc / rth
        # intermediate values the steps show must be hand-friendly too
        shown = ([] if kind == "T1" else [s * Vs / R1 + t * Is] if kind == "T2"
                 else [isc * R3] if kind == "T3" else [voc / k])
        if (voc != 0 and _nice(voc, 0.5, 40) and rth > 0 and _nice(rth, 0.5, 40) and _nice(isc, 0.05)
                and all(_nice(x, 0.25) for x in shown)):
            break
    else:
        raise RuntimeError("no nice Thevenin circuit found")

    p1 = _R("R₁", R1, u, imark=("iₓ", "b") if kind == "T3" else None)
    p2 = _R("R₂", R2, u, vmark=("vₓ", "a") if kind == "T4" else None)
    p3 = _R("R₃", R3, u)
    src = Part("V", "V₁", Vs, f"{_fmt(Vs)} V", end="a" if s > 0 else "b")
    extra = ""
    sv = _p(s * Vs)
    if kind == "T1":
        lad = Ladder([src, p2, "term"], [p1, p3], dx=170)
        voc_steps = [f"Open circuit: no current in \\(R_3\\), so \\(v_{{ab}}\\) is the voltage across "
                     f"\\(R_2\\): \\(V_{{th}} = {sv}\\cdot\\dfrac{{{_m(R2)}}}{{{_m(R1)} + {_m(R2)}}} = "
                     f"{_m(voc)}\\) V."]
    elif kind == "T2":
        cs = Part("I", "I₂", Is, f"{_fmt(Is)} {u.amp}", end="a" if t > 0 else "b")
        lad = Ladder([src, p2, cs, "term"], [p1, "wire", p3], dx=150)
        voc_steps = [f"Open circuit: no current in \\(R_3\\), so \\(V_{{th}}\\) is the top-node voltage "
                     f"\\(v\\). KCL there (leaving = 0): \\(\\dfrac{{v - {sv}}}{{{_m(R1)}}} + "
                     f"\\dfrac{{v}}{{{_m(R2)}}} {'-' if t > 0 else '+'} {_m(Is)} = 0\\).",
                     f"Multiply through: \\(v = ({_frac(s * Vs / R1)} + {_p(t * Is)})\\cdot{_m(P12)} = "
                     f"{_m(voc)}\\) V \\(= V_{{th}}\\)."]
    elif kind == "T3":
        D = Part("CCCS", "", gain, f"{_gain(gain, "iₓ")}", end="a" if t > 0 else "b", ctrl=("i", "R₁"),
                 key="dep")
        lad = Ladder([src, p2, D, "term"], [p1, "wire", p3], dx=150)
        extra = (f"The diamond is a current-controlled current source of {_gain(gain, "iₓ")}, where iₓ is "
                 f"the current through R₁ from left to right.")
        sgn = "+" if t > 0 else "-"
        voc_steps = [f"Open circuit: no current in \\(R_3\\); call the top-node voltage \\(v\\). "
                     f"\\(i_x = \\dfrac{{{sv} - v}}{{{_m(R1)}}}\\) and KCL into the node: "
                     f"\\(i_x {sgn} {_m(gain)}i_x = \\dfrac{{v}}{{{_m(R2)}}}\\).",
                     f"So \\({_m(k)}\\cdot\\dfrac{{{sv} - v}}{{{_m(R1)}}} = \\dfrac{{v}}{{{_m(R2)}}}\\), "
                     f"giving \\(V_{{th}} = v = {_m(voc)}\\) V.",
                     f"Short a-b: now \\(R_3\\) is in parallel with \\(R_2\\). "
                     f"\\({_m(k)}\\cdot\\dfrac{{{sv} - v}}{{{_m(R1)}}} = \\dfrac{{v}}{{{_m(R2)}}} + "
                     f"\\dfrac{{v}}{{{_m(R3)}}}\\) gives \\(v = {_m(isc * R3)}\\) V, so "
                     f"\\(i_{{sc}} = v/{_m(R3)} = {_m(isc)}\\,{A_}\\)."]
    else:
        D = Part("VCVS", "", gain, f"{_gain(gain, "vₓ")}", end="b" if t > 0 else "a", ctrl=("v", "R₂"),
                 key="dep")
        lad = Ladder([src, p2, None, "term"], [p1, D, p3], dx=150)
        extra = (f"The diamond is a voltage-controlled voltage source of {_gain(gain, "vₓ")}, where vₓ is "
                 f"the voltage across R₂ with + at the top.")
        voc_steps = [f"Open circuit: no current flows through the dependent source or \\(R_3\\), so "
                     f"\\(v_x = {sv}\\cdot\\dfrac{{{_m(R2)}}}{{{_m(R1)} + {_m(R2)}}} = "
                     f"{_m(voc / k)}\\) V.",
                     f"Walk from the top of \\(R_2\\) through the source to a: \\(V_{{th}} = v_x "
                     f"{'+' if t > 0 else '-'} {_m(gain)}v_x = {_m(k)}({_m(voc / k)}) = {_m(voc)}\\) V.",
                     f"Short a-b: KCL at the top of \\(R_2\\), with \\(i_{{sc}} = {_m(k)}v_x/{_m(R3)}\\): "
                     f"\\(\\dfrac{{{sv} - v_x}}{{{_m(R1)}}} = \\dfrac{{v_x}}{{{_m(R2)}}} + "
                     f"\\dfrac{{{_m(k)}v_x}}{{{_m(R3)}}}\\), so \\(i_{{sc}} = {_m(isc)}\\,{A_}\\)."]
    if kind in ("T1", "T2"):
        rth_step = (f"Zero the independent sources (voltage source → short"
                    f"{', current source → open' if kind == 'T2' else ''}): \\(R_{{th}} = R_3 + R_1 "
                    f"\\parallel R_2 = {_m(R3)} + {_m(P12)} = {_m(rth)}\\,{O}\\).")
    else:
        rth_step = (f"With a dependent source, use \\(R_{{th}} = V_{{th}}/i_{{sc}} = {_m(voc)}/{_m(isc)} = "
                    f"{_m(rth)}\\,{O}\\).")

    # second check, on the netlist: open-circuit voltage, short-circuit current, a test source
    # with the independent sources zeroed, and a load
    a = lad.node(("T", len(lad.cols) - 1))
    indep = {src.key} | ({"I₂"} if kind == "T2" else set())
    _agree(mna(lad.els()).v[a], voc, "V_oc by MNA")
    _agree(mna(lad.els() + [El("V", "short", a, 0, 0.0)]).i["short"], isc, "i_sc by MNA")
    _agree(mna(lad.els(kill=indep) + [El("I", "test", 0, a, 1.0)]).v[a], rth, "R_th by test source")
    RL = 2 * rth
    _agree(mna(lad.els() + [El("R", "load", a, 0, RL)]).v[a], voc * RL / (rth + RL), "load check")
    return dict(lad=lad, voc=voc, rth=rth, isc=isc, kind=kind, extra=extra,
                voc_steps=voc_steps, rth_step=rth_step)


def thevenin(seed: int) -> dict:
    rng = random.Random(seed)
    u = rng.choice([OHM, KOHM])
    c = _thevenin_circuit(rng, u, ["T1", "T2", "T2", "T3", "T4"])
    lad = c["lad"]
    steps = c["voc_steps"] + [c["rth_step"],
                              f"Thevenin equivalent: a \\({_m(c['voc'])}\\) V source in series with "
                              f"\\({_m(c['rth'])}\\,{u.ohm_m}\\), + toward a."]
    text = (f"Find the Thevenin equivalent of the circuit below as seen from terminals a and b: "
            f"\\(V_{{th}} = v_{{ab}}\\) (open circuit, + at a, in V) and \\(R_{{th}}\\) (in {u.ohm}).")
    if c["extra"]:
        text += " " + c["extra"]
    return _problem(text, lad.describe(c["extra"]), lad.svg("Circuit seen from terminals a and b"),
                    [_ans("V_th", c["voc"], "V"), _ans("R_th", c["rth"], u.ohm)], steps,
                    ["Netlist: open-circuit voltage and short-circuit current give V_th and V_th/R_th.",
                     "Netlist with independent sources zeroed and a 1-unit test current at a-b gives R_th.",
                     "Netlist with a load R_L = 2R_th matches the Thevenin divider."],
                    ["Thevenin equivalent", "Thevenin and Norton equivalents"]
                    + (["dependent sources"] if c["kind"] in ("T3", "T4") else []))


def max_power(seed: int) -> dict:
    rng = random.Random(seed)
    u = rng.choice([OHM, KOHM])
    for _ in range(200):
        c = _thevenin_circuit(rng, u, ["T1", "T1", "T2", "T3"])
        pmax = c["voc"] ** 2 / (4 * c["rth"])
        if _nice(pmax, 0.25):
            break
    else:
        raise RuntimeError("no nice max-power circuit found")
    lad, voc, rth = c["lad"], c["voc"], c["rth"]
    a = lad.node(("T", len(lad.cols) - 1))

    # second check: sweep the load on the full netlist, no Thevenin model involved
    def p_load(RL):
        sol = mna(lad.els() + [El("R", "load", a, 0, RL)])
        return sol.p["load"]
    grid = rth * np.logspace(-1, 1, 401)
    ps = np.array([p_load(r) for r in grid])
    best = grid[int(np.argmax(ps))]
    if not abs(best / rth - 1) < 0.01:
        raise AssertionError("load sweep peaks away from R_th")
    _agree(p_load(rth), pmax, "P at R_L = R_th")
    if ps.max() > pmax * (1 + 1e-9):
        raise AssertionError("sweep beats the claimed maximum")

    W = u.watt_m
    steps = c["voc_steps"] + [c["rth_step"],
                              f"Maximum power transfer: \\(R_L = R_{{th}} = {_m(rth)}\\,{u.ohm_m}\\).",
                              f"\\(P_{{max}} = \\dfrac{{V_{{th}}^2}}{{4R_{{th}}}} = \\dfrac{{{_p(voc)}^2}}"
                              f"{{4\\cdot{_m(rth)}}} = {_m(pmax)}\\,{W}\\)."]
    text = (f"A load resistor \\(R_L\\) is connected across terminals a-b of the circuit below. What "
            f"value of \\(R_L\\) absorbs the most power (in {u.ohm}), and what is that maximum power "
            f"(in {u.watt})?")
    if c["extra"]:
        text += " " + c["extra"]
    return _problem(text, lad.describe(c["extra"]), lad.svg("Circuit feeding a load at terminals a and b"),
                    [_ans("R_L", rth, u.ohm), _ans("P_max", pmax, u.watt)], steps,
                    ["Thevenin values checked by open/short-circuit, test-source and load netlists.",
                     "Load swept from R_th/10 to 10R_th on the full netlist: the power peaks at R_th "
                     "and equals V_th²/4R_th there."],
                    ["maximum power transfer", "Thevenin and Norton equivalents"]
                    + (["dependent sources"] if c["kind"] in ("T3", "T4") else []))


# ---- week 8: op-amps ------------------------------------------------------------------------


def opamp_circuit(seed: int) -> dict:
    rng = random.Random(seed)
    kind = rng.choice(["inverting", "noninverting", "summing", "difference"])
    Rk = [1, 2, 4, 5, 10, 20, 40, 50, 100]
    vins = [-3, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 3]
    K = "\\text{k}\\Omega"
    for _ in range(50000):
        if kind in ("inverting", "noninverting"):
            R1, R2 = rng.choice(Rk), rng.choice(Rk)
            vin = rng.choice(vins + [0.2, -0.2, 0.25])
            gain = -R2 / R1 if kind == "inverting" else 1 + R2 / R1
            vout = gain * vin
            if _nice(gain, 0.5) and abs(gain) <= 11 and gain != -1 and _nice(vout, 0.1) and 0 < abs(vout) <= 12:
                break
        elif kind == "summing":
            m = rng.choice([2, 3])
            Rf = rng.choice(Rk)
            Rin = [rng.choice(Rk) for _ in range(m)]
            vs = [rng.choice(vins) for _ in range(m)]
            ratios = [Rf / r for r in Rin]
            if not all(_nice(q, 0.5) and q <= 5 for q in ratios):
                continue
            vout = -sum(q * v for q, v in zip(ratios, vs))
            i_f = sum(v / r for v, r in zip(vs, Rin))
            if _nice(vout, 0.1) and 0 < abs(vout) <= 12 and _nice(i_f, 0.05):
                break
        else:
            R1, R2, R3, R4 = (rng.choice(Rk) for _ in range(4))
            if rng.random() < 0.5:
                R3, R4 = R1, R2
            v1, v2 = rng.choice(vins), rng.choice(vins)
            vp = v2 * R4 / (R3 + R4)
            vout = vp * (1 + R2 / R1) - v1 * R2 / R1
            if (_nice(R2 / R1, 0.5) and _nice(vp, 0.05) and _nice(vout, 0.1) and 0 < abs(vout) <= 12
                    and v1 != v2):
                break
    else:
        raise RuntimeError("no nice op-amp circuit found")

    def r_(_k, val):
        return f"{_fmt(val)} kΩ"

    # second check: MNA with an ideal op-amp (virtual short as a constraint), and the same
    # circuit with a finite open-loop gain of 10^6 which must land within 0.01 %
    out = 3
    if kind == "inverting":
        els = [El("V", "vin", 1, 0, vin), El("R", "R1", 1, 2, R1), El("R", "R2", 2, out, R2)]
        pins = (0, 2)
    elif kind == "noninverting":
        els = [El("V", "vin", 1, 0, vin), El("R", "R1", 2, 0, R1), El("R", "R2", 2, out, R2)]
        pins = (1, 2)
    elif kind == "summing":
        els = [El("R", "Rf", 2, out, Rf)]
        for j, (r, v) in enumerate(zip(Rin, vs)):
            els += [El("V", f"v{j}", 10 + j, 0, v), El("R", f"R{j}", 10 + j, 2, r)]
        pins = (0, 2)
    else:
        els = [El("V", "v1", 1, 0, v1), El("V", "v2", 4, 0, v2), El("R", "R1", 1, 2, R1),
               El("R", "R2", 2, out, R2), El("R", "R3", 4, 5, R3), El("R", "R4", 5, 0, R4)]
        pins = (5, 2)
    ideal = mna(els + [El("OPAMP", "U1", pins[0], pins[1], out=out)])
    _agree(ideal.v[out], vout, "v_out with ideal op-amp")
    finite = mna(els + [El("VCVS", "U1", out, 0, 1e6, pins[0], pins[1])])
    _agree(finite.v[out], vout, "v_out with finite gain", rtol=1e-4, atol=1e-5)

    if kind == "inverting":
        answers = [_ans("Voltage gain v_o/v_1", gain, "V/V"), _ans("v_o", vout, "V")]
        steps = ["Ideal op-amp: no input current, and negative feedback forces \\(v_- = v_+ = 0\\) "
                 "(virtual ground).",
                 f"The current through \\(R_1\\) is \\(v_1/R_1\\); all of it continues through \\(R_2\\) "
                 f"to the output: \\(\\dfrac{{v_1 - 0}}{{{_m(R1)}}} = \\dfrac{{0 - v_o}}{{{_m(R2)}}}\\).",
                 f"Gain \\(= -\\dfrac{{R_2}}{{R_1}} = -\\dfrac{{{_m(R2)}}}{{{_m(R1)}}} = {_m(gain)}\\).",
                 f"\\(v_o = {_m(gain)}\\cdot{_p(vin)} = {_m(vout)}\\) V."]
        ask = "the voltage gain \\(v_o/v_1\\) and the output voltage \\(v_o\\)"
        svg = _opamp_svg_top(kind, [("v₁", vin, "R₁", R1)], R2, None)
        desc = (f"Diagram: an inverting amplifier. Input terminal v₁ = {_fmt(vin)} V (relative to ground) "
                f"connects through R₁ = {r_(1, R1)} to the op-amp's − input. R₂ = {r_(2, R2)} connects "
                f"the − input to the output vₒ (feedback). The + input is grounded.")
    elif kind == "noninverting":
        answers = [_ans("Voltage gain v_o/v_1", gain, "V/V"), _ans("v_o", vout, "V")]
        steps = ["Ideal op-amp: no input current, and \\(v_- = v_+ = v_1\\).",
                 f"\\(R_1\\) and \\(R_2\\) form a divider from \\(v_o\\) to ground: "
                 f"\\(v_- = v_o\\dfrac{{{_m(R1)}}}{{{_m(R1)} + {_m(R2)}}}\\).",
                 f"Gain \\(= 1 + \\dfrac{{R_2}}{{R_1}} = 1 + \\dfrac{{{_m(R2)}}}{{{_m(R1)}}} = {_m(gain)}\\).",
                 f"\\(v_o = {_m(gain)}\\cdot{_p(vin)} = {_m(vout)}\\) V."]
        ask = "the voltage gain \\(v_o/v_1\\) and the output voltage \\(v_o\\)"
        svg = _opamp_svg_noninv(vin, R1, R2)
        desc = (f"Diagram: a non-inverting amplifier. Input terminal v₁ = {_fmt(vin)} V connects "
                f"directly to the op-amp's + input. R₁ = {r_(1, R1)} goes from the − input to ground and "
                f"R₂ = {r_(2, R2)} from the − input to the output vₒ (feedback).")
    elif kind == "summing":
        names = [_sub("v", j + 1) for j in range(m)]
        rnames = [_sub("R", j + 1) for j in range(m)]
        answers = [_ans("v_o", vout, "V"), _ans("Current through Rf toward the output", i_f, "mA")]
        terms = " + ".join(f"\\dfrac{{{_p(v)}}}{{{_m(r)}}}" for v, r in zip(vs, Rin))
        steps = ["Ideal op-amp: the − input is a virtual ground (\\(v_- = v_+ = 0\\)) and draws no current.",
                 f"Each input pushes \\(v_k/R_k\\) into the − node: total \\({terms} = {_m(i_f)}\\) mA.",
                 f"All of that current flows through \\(R_f\\) toward the output, so "
                 f"\\(v_o = 0 - R_f i_f = -{_m(Rf)}\\cdot{_p(i_f)} = {_m(vout)}\\) V.",
                 "Same thing as weights: \\(v_o = -\\sum_k (R_f/R_k)\\,v_k\\) with weights "
                 + ", ".join(_m(q) for q in ratios) + "."]
        ask = "the output voltage \\(v_o\\) and the current through \\(R_f\\) toward the output (mA)"
        svg = _opamp_svg_summing(list(zip(names, vs, rnames, Rin)), Rf)
        desc = ("Diagram: an inverting summing amplifier. "
                + " ".join(f"Input terminal {n_} = {_fmt(v)} V connects through {rn} = {r_(0, r)} to the "
                           f"op-amp's − input." for n_, v, rn, r in zip(names, vs, rnames, Rin))
                + f" Rf = {r_(0, Rf)} connects the − input to the output vₒ. The + input is grounded.")
    else:
        answers = [_ans("v_+ (voltage at the + input)", vp, "V"), _ans("v_o", vout, "V")]
        steps = ["Ideal op-amp: no input currents, and \\(v_- = v_+\\).",
                 f"\\(R_3\\), \\(R_4\\) divide \\(v_2\\): \\(v_+ = {_p(v2)}\\cdot\\dfrac{{{_m(R4)}}}"
                 f"{{{_m(R3)} + {_m(R4)}}} = {_m(vp)}\\) V.",
                 f"KCL at the − input (\\(v_- = {_m(vp)}\\)): \\(\\dfrac{{{_p(v1)} - {_p(vp)}}}{{{_m(R1)}}} = "
                 f"\\dfrac{{{_p(vp)} - v_o}}{{{_m(R2)}}}\\).",
                 f"So \\(v_o = {_p(vp)}\\left(1 + \\dfrac{{{_m(R2)}}}{{{_m(R1)}}}\\right) - "
                 f"\\dfrac{{{_m(R2)}}}{{{_m(R1)}}}{_p(v1)} = {_m(vout)}\\) V."]
        ask = "the voltage \\(v_+\\) at the + input and the output voltage \\(v_o\\)"
        svg = _opamp_svg_top(kind, [("v₁", v1, "R₁", R1)], R2, ("v₂", v2, R3, R4))
        desc = (f"Diagram: a difference amplifier. Input v₁ = {_fmt(v1)} V connects through "
                f"R₁ = {r_(1, R1)} to the op-amp's − input; R₂ = {r_(2, R2)} connects the − input to the "
                f"output vₒ. Input v₂ = {_fmt(v2)} V connects through R₃ = {r_(3, R3)} to the + input, and "
                f"R₄ = {r_(4, R4)} goes from the + input to ground.")
    text = (f"The op-amp below is ideal and stays in its linear region (supplies ±15 V). Input voltages "
            f"are measured from ground. Find {ask}.")
    return _problem(text, desc, svg, answers, steps,
                    ["Netlist solved with an ideal op-amp (virtual-short constraint) gives the same v_o.",
                     "Same netlist with a finite open-loop gain of 10⁶ agrees to 0.01 %."],
                    ["op-amps 2 (inverting, summing, difference, follower, instrumentation)", "op-amps 1"])


_OX = 40


def _triangle(x, ytop, plus_top) -> list:
    t, b = ("+", "−") if plus_top else ("−", "+")
    return [f'<path d="M{x} {ytop} L{x} {ytop + 100} L{x + 90} {ytop + 50} Z" class="element"/>',
            _text(x + 12, ytop + 30, t, "middle", "sign"), _text(x + 12, ytop + 80, b, "middle", "sign")]


def _input(x, y, name, v) -> list:
    return [_dot(x, y, 4), _text(x - 10, y + 5, f"{name} = {_fmt(v)} V", "end")]


def _output(out) -> None:
    X = _OX
    out += [_line(X + 330, 170, X + 430, 170), _dot(X + 390, 170), _dot(X + 430, 170, 4),
            _text(X + 440, 175, "vₒ")]


def _opamp_svg_top(kind, inputs, R2, plus_net) -> str:
    """Inverting or difference amplifier: feedback above the op-amp."""
    X = _OX
    H = 305 if plus_net else 240
    out = [f'<svg viewBox="0 0 {X + 480} {H}" width="{X + 480}" height="{H}" role="img" '
           f'aria-label="{kind} op-amp amplifier" class="circuit">']
    name, v, rname, R1 = inputs[0]
    out += _input(X + 80, 145, name, v)
    out += _draw(Part("R", rname, R1, f"{_fmt(R1)} kΩ"), X + 80, 145, X + 200, 145)
    out += [_line(X + 200, 145, X + 240, 145), _dot(X + 200, 145),
            _line(X + 200, 145, X + 200, 70), _line(X + 390, 70, X + 390, 170)]
    out += _draw(Part("R", "R₂", R2, f"{_fmt(R2)} kΩ"), X + 200, 70, X + 390, 70)
    out += _triangle(X + 240, 120, plus_top=False)
    _output(out)
    if plus_net:
        n2, v2, R3, R4 = plus_net
        out += _input(X + 80, 195, n2, v2)
        out += _draw(Part("R", "R₃", R3, f"{_fmt(R3)} kΩ"), X + 80, 195, X + 210, 195)
        out += [_line(X + 210, 195, X + 240, 195), _dot(X + 210, 195)]
        out += _draw(Part("R", "R₄", R4, f"{_fmt(R4)} kΩ", side="left"), X + 210, 195, X + 210, 275)
        out += _ground(X + 210, 275)
    else:
        out += [_line(X + 240, 195, X + 215, 195)] + _ground(X + 215, 195)
    out.append("</svg>")
    return "\n".join(out)


def _opamp_svg_noninv(vin, R1, R2) -> str:
    X = _OX
    out = [f'<svg viewBox="0 0 {X + 480} 300" width="{X + 480}" height="300" role="img" '
           f'aria-label="non-inverting op-amp amplifier" class="circuit">']
    out += _input(X + 80, 145, "v₁", vin) + [_line(X + 80, 145, X + 240, 145)]
    out += _triangle(X + 240, 120, plus_top=True)
    out += [_line(X + 240, 195, X + 200, 195), _dot(X + 200, 195)]
    out += _draw(Part("R", "R₁", R1, f"{_fmt(R1)} kΩ"), X + 110, 195, X + 200, 195)
    out += _ground(X + 110, 195)
    out += [_line(X + 200, 195, X + 200, 260), _line(X + 390, 260, X + 390, 170)]
    out += _draw(Part("R", "R₂", R2, f"{_fmt(R2)} kΩ"), X + 200, 260, X + 390, 260, below=True)
    _output(out)
    out.append("</svg>")
    return "\n".join(out)


def _opamp_svg_summing(inputs, Rf) -> str:
    X = _OX
    ys = [145 - 50 * k for k in range(len(inputs))][::-1]
    out = [f'<svg viewBox="0 0 {X + 480} 300" width="{X + 480}" height="300" role="img" '
           f'aria-label="summing op-amp amplifier" class="circuit">']
    for (name, v, rname, r), y in zip(inputs, ys):
        out += _input(X + 80, y, name, v)
        out += _draw(Part("R", rname, r, f"{_fmt(r)} kΩ"), X + 80, y, X + 200, y)
    out += [_line(X + 200, ys[0], X + 200, 145), _line(X + 200, 145, X + 240, 145)]
    out += [_dot(X + 200, y) for y in ys[1:]]
    out += _triangle(X + 240, 120, plus_top=False)
    out += [_line(X + 240, 195, X + 220, 195)] + _ground(X + 220, 195)
    out += [_line(X + 200, 145, X + 200, 260), _line(X + 390, 260, X + 390, 170)]
    out += _draw(Part("R", "Rf", Rf, f"{_fmt(Rf)} kΩ"), X + 200, 260, X + 390, 260, below=True)
    _output(out)
    out.append("</svg>")
    return "\n".join(out)


GENERATORS.update({
    "equivalent_resistance": equivalent_resistance,
    "voltage_divider": voltage_divider,
    "current_divider": current_divider,
    "delta_wye": delta_wye,
    "nodal_two_node": nodal_two_node,
    "mesh_two_loop": mesh_two_loop,
    "supermesh": supermesh,
    "superposition": superposition,
    "thevenin": thevenin,
    "max_power": max_power,
    "opamp_circuit": opamp_circuit,
})

WEEKS.update({
    "equivalent_resistance": 3, "voltage_divider": 3, "current_divider": 3,
    "delta_wye": 4, "nodal_two_node": 4,
    "mesh_two_loop": 5,
    "supermesh": 6, "superposition": 6,
    "thevenin": 7, "max_power": 7,
    "opamp_circuit": 8,
})
