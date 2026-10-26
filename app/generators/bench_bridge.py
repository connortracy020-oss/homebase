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
