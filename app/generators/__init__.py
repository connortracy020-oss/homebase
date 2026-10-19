"""Problem generators.

Each generator turns a seed into one problem whose answer is computed here
and then checked a second, independent way. If the two disagree the
generator raises instead of producing a problem with a wrong key.

A generator returns:
    {"statement": {"text": ..., "svg": ...},
     "key": {"answers": [{"label", "value", "unit", "tol"}], "steps": [...],
             "checks": [...]},
     "topics": [...]}
"""
from . import circuits_basics

GENERATORS = {
    "element_power": circuits_basics.element_power,
    "loop_power": circuits_basics.loop_power,
    "charge_current": circuits_basics.charge_current,
}


def generate(name: str, seed: int) -> dict:
    if name not in GENERATORS:
        raise KeyError(f"unknown generator {name!r}")
    return GENERATORS[name](seed)


def check_answer(expected: dict, given: str) -> bool:
    """Is a typed answer within tolerance of the computed one?"""
    try:
        value = float(given.strip().replace(",", "").replace("−", "-"))
    except ValueError:
        return False
    tol = expected.get("tol", 0.01)
    target = expected["value"]
    return abs(value - target) <= max(tol, abs(target) * 0.005)
