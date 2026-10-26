"""A generated problem's circuit, as a Circuit Bench drawing.

The circuit generators draw every circuit as a Ladder (a top wire, a bottom wire,
vertical branches at columns, parts on the wires between columns). This lays the same
circuit out on the bench's grid, with the same names, values (from the text the problem
shows), polarities and controls, so "Open in simulator" shows exactly the problem's circuit.
"""
import re

COL, TOP, BOT = 6, 0, 8  # grid units between columns; the two rails

_SUB = {"₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8",
        "₉": "9", "ₓ": "x", "ₛ": "s", "ₒ": "o", "ₐ": "a", "ₑ": "e", "ₜ": "t", "ₙ": "n", "ₘ": "m"}
_PREFIX = {"k": "k", "M": "meg", "m": "m", "µ": "u", "μ": "u", "u": "u", "n": "n", "p": "p", "": ""}
_KIND = {"R": "R", "V": "V", "I": "I", "C": "C", "L": "L", "SW": "SW",
         "VCCS": "G", "CCCS": "F", "VCVS": "E", "CCVS": "H"}
_POLAR = ("V", "I", "VCCS", "CCCS", "VCVS", "CCVS")  # pin a is the + end (or the arrow's end)


def plain(name: str) -> str:
    """'R₁' -> 'R1', 'Vₛ' -> 'Vs'."""
    return "".join(_SUB.get(c, c) for c in name if c not in " {}\\_")


def _value_text(p, unit_re: str) -> str | None:
    """The value as the problem shows it, in SI text: '4 kΩ' -> '4k', '2 mA' -> '2m'."""
    m = re.search(rf"(-?\d+(?:\.\d+)?)\s*([kMmµμunp]?)\s*{unit_re}", p.text or "")
    if not m:
        return None
    return f"{m.group(1)}{_PREFIX[m.group(2)]}"


def _scaled(ladder) -> bool:
    """Problems in kΩ use mA and mA/V too (V = mA · kΩ)."""
    return any(isinstance(p, object) and getattr(p, "kind", "") == "R" and "k" in (p.text or "")
               for p, *_ in ladder.parts.values())


def ladder_doc(ladder, title: str = "", course: str = "ECE201") -> dict:
    parts, wires, ids, used = [], [], {}, set()
    kilo = _scaled(ladder)

    def new_id(base: str) -> str:
        base = plain(base) or "X"
        if not re.match(r"^[A-Za-z]", base):
            base = "X" + base
        k, out = 1, base
        while out in used:
            k += 1
            out = f"{base}{k}"
        used.add(out)
        return out

    def wire(a, b):
        if a != b:
            wires.append({"id": f"w{len(wires) + 1}", "a": list(a), "b": list(b)})

    # names first, so controls can refer to any part
    counters = {}
    for key, (p, *_rest) in ladder.parts.items():
        kind = _KIND[p.kind]
        if p.name:
            ids[key] = new_id(p.name)
        else:
            counters[kind] = counters.get(kind, 0) + 1
            ids[key] = new_id(f"{kind}{counters[kind]}")

    def params(p) -> dict:
        k = p.kind
        if k == "R":
            return {"R": _value_text(p, "Ω") or f"{p.value * (1000 if kilo else 1):g}"}
        if k == "V":
            return {"V": _value_text(p, "V") or f"{p.value:g}"}
        if k == "I":
            return {"I": _value_text(p, "A") or f"{p.value * (1e-3 if kilo else 1):g}"}
        if k == "C":
            return {"C": _value_text(p, "F") or f"{p.value:g}u"}
        if k == "L":
            return {"L": _value_text(p, "H") or f"{p.value:g}m"}
        if k == "SW":
            return {"state": "open" if p.sw == "closes" else "closed", "at": "0" if p.sw else ""}
        gain = p.value
        if k == "VCCS" and kilo:
            gain *= 1e-3     # mA/V -> A/V
        if k == "CCVS" and kilo:
            gain *= 1e3      # kΩ -> Ω
        m = re.search(r"([vi][^\d\s]*)$", p.text or "")
        cname = plain(m.group(1)) if m else ("vx" if k in ("VCCS", "VCVS") else "ix")
        return {"gain": f"{gain:g}", "ctrl": control(p), "cname": cname}

    labels = {}

    def control(p) -> str:
        kind, ref = p.ctrl
        if kind == "vn":
            name = labels.get(ref) or f"v{len(labels) + 1}"
            labels[ref] = name
            return f"v({name})"
        q = ladder.parts[ref][0]
        pin_a_end = q.end if q.kind in _POLAR else "a"
        if kind == "v":
            return f"{'' if q.vmark[1] == pin_a_end else '-'}v({ids[ref]})"
        # current through the part, toward the end its arrow mark points to; ours flows a -> b
        toward_b = q.imark[1] == ("b" if pin_a_end == "a" else "a")
        return f"{'' if toward_b else '-'}i({ids[ref]})"

    def place(p, key, x1, y1, x2, y2):
        """A part on the segment (x1, y1) end a -> (x2, y2) end b, leads to fill the gap."""
        vert = x1 == x2
        pin_a_end = p.end if p.kind in _POLAR else "a"
        if vert:
            top, bottom = (x1, y1 + 2), (x1, y2 - 2)
            wire((x1, y1), top); wire(bottom, (x2, y2))
            origin, rot = (top, 1) if pin_a_end == "a" else (bottom, 3)
        else:
            left, right = (x1 + 1, y1), (x2 - 1, y2)
            wire((x1, y1), left); wire(right, (x2, y2))
            origin, rot = (left, 0) if pin_a_end == "a" else (right, 2)
        parts.append({"id": ids[key], "type": _KIND[p.kind], "x": origin[0], "y": origin[1], "rot": rot,
                      "flip": False, "params": params(p)})

    n = len(ladder.cols)
    for i, c in enumerate(ladder.cols):
        x = COL * i
        if c == "wire":
            wire((x, TOP), (x, BOT))
        elif c == "term":
            for nm, y in ((ladder.terms[0], TOP), (ladder.terms[1], BOT)):
                parts.append({"id": new_id(f"T{nm}"), "type": "LBL", "x": x, "y": y, "rot": 3 if y == TOP else 1,
                              "flip": False, "params": {"name": plain(nm)}})
        elif c is not None and not isinstance(c, str):
            key = next(k for k, (pp, *_r) in ladder.parts.items() if pp is c)
            place(c, key, x, TOP, x, BOT)
    for row, segs, y in (("T", ladder.top, TOP), ("B", ladder.bot, BOT)):
        for i, s in enumerate(segs):
            x1, x2 = COL * i, COL * (i + 1)
            if s == "wire":
                wire((x1, y), (x2, y))
            elif s is not None and not isinstance(s, str):
                key = next(k for k, (pp, *_r) in ladder.parts.items() if pp is s)
                place(s, key, x1, y, x2, y)
    for i, lbl in ladder.node_labels.items():
        parts.append({"id": new_id("Lbl"), "type": "LBL", "x": COL * i, "y": TOP, "rot": 3, "flip": False,
                      "params": {"name": plain(lbl)}})
    for (row, i), name in labels.items():
        parts.append({"id": new_id("Lbl"), "type": "LBL", "x": COL * i, "y": TOP if row == "T" else BOT,
                      "rot": 3 if row == "T" else 1, "flip": False, "params": {"name": name}})
    g = ladder.ground if ladder.ground is not None else 0
    parts.append({"id": new_id("GND"), "type": "GND", "x": COL * g, "y": BOT, "rot": 0, "flip": False, "params": {}})
    return {"format": "homebase-circuit", "version": 1, "title": title, "course": course,
            "parts": parts, "wires": wires, "view": {}, "study": {"predict": True}}


def point_of(q) -> tuple:
    """Where a ladder point ('T' or 'B', column) is on the bench grid."""
    row, i = q
    return (COL * i, TOP if row == "T" else BOT)


# ---- circuits that aren't ladders: op-amp amplifiers and the bridge ----------------------

def _two(pid, kind, a, b, **params) -> dict:
    """A two-terminal part from pin a to pin b (4 grid units apart, in a line)."""
    rot = {(4, 0): 0, (0, 4): 1, (-4, 0): 2, (0, -4): 3}[(b[0] - a[0], b[1] - a[1])]
    return {"id": pid, "type": kind, "x": a[0], "y": a[1], "rot": rot, "flip": False,
            "params": {k: str(v) for k, v in params.items()}}


def _at(pid, kind, p, **params) -> dict:
    return {"id": pid, "type": kind, "x": p[0], "y": p[1], "rot": 0, "flip": False,
            "params": {k: str(v) for k, v in params.items()}}


def _doc(parts, paths, title="", course="ECE201") -> dict:
    wires = []
    for pts in paths:
        for a, b in zip(pts, pts[1:]):
            wires.append({"id": f"w{len(wires) + 1}", "a": list(a), "b": list(b)})
    return {"format": "homebase-circuit", "version": 1, "title": title, "course": course,
            "parts": parts, "wires": wires, "view": {}, "study": {"predict": True}}


def _k(r) -> str:
    return f"{r:g}k"


OPAMP_OUT = (19, 4)   # where vₒ is in the amplifier drawings
SUMMING_OUT = (18, 8)  # and in the summer's


def opamp_doc(kind: str, inputs, R2, plus_net=None) -> dict:
    """An op-amp amplifier the way opamp_circuit draws it. inputs: [(name, volts, R name, kΩ)];
    R2 is the feedback resistor (kΩ); plus_net (v₂ name, volts, R₃, R₄) for the difference
    amplifier. The op-amp sits at (13, 4): − input (13, 3), + input (13, 5), output (18, 4);
    the feedback leaves the − input wire at (12, 3)."""
    U = _at("U1", "OA", (13, 4))
    vo = _at("Lvo", "LBL", OPAMP_OUT, name="vo")
    feedback = [[(11, 3), (13, 3)], [(12, 3), (12, 0), (13, 0)], [(17, 0), (19, 0), (19, 4)], [(18, 4), (19, 4)]]
    name, v, rname, R1 = inputs[0]
    source = [_two(plain(name), "V", (0, 6), (0, 10), V=f"{v:g}"), _at("G1", "GND", (0, 10))]
    feed = _two("R2", "R", (13, 0), (17, 0), R=_k(R2))
    if kind == "noninverting":
        # v₁ straight to the + input; R₁ from the − input to ground, R₂ from − to the output
        parts = [U, vo, *source, _two(plain(rname), "R", (7, 3), (11, 3), R=_k(R1)), _at("G2", "GND", (7, 3)), feed]
        return _doc(parts, [[(0, 6), (0, 5), (13, 5)], *feedback])
    parts = [U, vo, *source, _two(plain(rname), "R", (7, 3), (11, 3), R=_k(R1)), feed]
    paths = [[(0, 6), (0, 3), (7, 3)], *feedback]
    if plus_net:  # difference amplifier: v₂ through R₃ to the + input, R₄ from + to ground
        n2, v2, R3, R4 = plus_net
        parts += [_two(plain(n2), "V", (5, 6), (5, 10), V=f"{v2:g}"),
                  _two("R3", "R", (7, 5), (11, 5), R=_k(R3)), _two("R4", "R", (12, 6), (12, 10), R=_k(R4))]
        paths += [[(5, 6), (5, 5), (7, 5)], [(11, 5), (13, 5)], [(12, 5), (12, 6)], [(0, 10), (12, 10)]]
    else:         # inverting: the + input grounded
        parts.append(_at("G2", "GND", (11, 5)))
        paths.append([(13, 5), (11, 5)])
    return _doc(parts, paths)


def summing_doc(inputs, Rf) -> dict:
    """The inverting summer: each input a source from ground through its resistor to the − input.
    The op-amp sits at (12, 8): − input (12, 7), + input (12, 9), output (17, 8)."""
    rows = [7 - 4 * k for k in range(len(inputs))]  # one input every 4 units, upward
    yf = rows[-1] - 4                                 # the feedback resistor above them
    parts = [_at("U1", "OA", (12, 8)), _at("Lvo", "LBL", SUMMING_OUT, name="vo"), _at("G0", "GND", (10, 9)),
             _two("Rf", "R", (12, yf), (16, yf), R=_k(Rf))]
    paths = [[(12, 9), (10, 9)], [(11, 7), (12, 7)], [(16, yf), (18, yf), (18, 8)], [(17, 8), (18, 8)]]
    for k, ((name, v, rname, r), y) in enumerate(zip(inputs, rows)):
        parts += [_at(f"G{k + 1}", "GND", (2, y)), _two(plain(name), "V", (6, y), (2, y), V=f"{v:g}"),
                  _two(plain(rname), "R", (6, y), (10, y), R=_k(r))]
        paths.append([(10, y), (11, y)])
    paths.append([(11, 7), *[(11, y) for y in rows[1:]], (11, yf), (12, yf)])
    return _doc(parts, paths)


def bridge_doc(R: dict, kilo: bool) -> dict:
    """The bridge between a (top) and b (bottom): R1 a–c, R2 a–d, R3 c–d, R4 c–b, R5 d–b.
    "Thevenin at a–b" on the bench gives its R_eq."""
    val = _k if kilo else (lambda r: f"{r:g}")
    parts = [_two("R1", "R", (2, 1), (2, 5), R=val(R[1])), _two("R2", "R", (14, 1), (14, 5), R=val(R[2])),
             _two("R3", "R", (6, 6), (10, 6), R=val(R[3])),
             _two("R4", "R", (2, 7), (2, 11), R=val(R[4])), _two("R5", "R", (14, 7), (14, 11), R=val(R[5])),
             _at("Ta", "LBL", (8, -2), name="a"), _at("Tb", "LBL", (8, 14), name="b"),
             _at("Lc", "LBL", (2, 6), name="c"), _at("Ld", "LBL", (14, 6), name="d"), _at("G", "GND", (2, 12))]
    paths = [[(2, 1), (2, 0), (14, 0), (14, 1)], [(8, 0), (8, -2)], [(2, 5), (2, 7)], [(14, 5), (14, 7)],
             [(2, 6), (6, 6)], [(10, 6), (14, 6)], [(2, 11), (2, 12), (14, 12), (14, 11)], [(8, 12), (8, 14)]]
    return _doc(parts, paths)
