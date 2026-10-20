"""Problem generators.

Each generator turns a seed into one problem whose answer is computed here
and then checked a second, independent way. If the two disagree the
generator raises instead of producing a problem with a wrong key.

A generator returns:
    {"statement": {"text": ..., "diagram": ..., "svg": ...},
     "key": {"answers": [{"label", "value", "unit", "tol"}], "steps": [...],
             "checks": [...]},
     "topics": [...]}

Each module below defines GENERATORS = {name: function}; they are merged
here, so modules can be added without editing this file's logic.
"""
import importlib

MODULES = ["circuits_basics", "circuits_dc", "circuits_transient", "dsp", "vectorcalc"]

GENERATORS: dict = {}
for _name in MODULES:
    try:
        _mod = importlib.import_module(f"{__name__}.{_name}")
    except ModuleNotFoundError as _e:
        if _e.name != f"{__name__}.{_name}":
            raise  # a real import error inside the module
        continue
    for _key, _fn in getattr(_mod, "GENERATORS", {}).items():
        if _key in GENERATORS:
            raise RuntimeError(f"generator {_key!r} is defined twice")
        GENERATORS[_key] = _fn


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
