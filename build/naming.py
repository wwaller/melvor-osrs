import re

ROMAN_TO_DOSE = {"I": "1", "II": "2", "III": "3", "IV": "4"}

ITEM_REWRITES = [
    (re.compile(r"\bD-hide\b", re.I), "d'hide"),
    (re.compile(r"^Normal ", re.I), ""),
    (re.compile(r" \(Perfect\)$", re.I), ""),
    (re.compile(r" Helmet$", re.I), " full helm"),
    (re.compile(r" Shield$", re.I), " kiteshield"),
    (re.compile(r" Arrows$", re.I), " arrow"),
    (re.compile(r" Throwing Knife$", re.I), " knife"),
    (re.compile(r" Robes$", re.I), " robe top"),
    (re.compile(r" Bottoms$", re.I), " robe bottom"),
    (re.compile(r" Tree Seed$", re.I), " seed"),
    (re.compile(r" Seeds$", re.I), " seed"),
    (re.compile(r" Ore$", re.I), ""),
    (re.compile(r" Potion (I|II|III|IV)$"), lambda m: f" potion({ROMAN_TO_DOSE[m.group(1)]})"),
    (re.compile(r"^\(S\) (.+)$"), r"\1 (t)"),
    (re.compile(r"^\(([A-Za-z])\) (.+)$"), r"\2 (\1)"),
    (re.compile(r"^\([A-Za-z]\) "), ""),
]


def lookup_key(name):
    name = name.replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", name).strip().lower()


def _plural_variants(name):
    variants = [name + "s"]
    if name.endswith("y"):
        variants.append(name[:-1] + "ies")
    if name.endswith("ies"):
        variants.append(name[:-3] + "y")
    elif name.endswith("s"):
        variants.append(name[:-1])
    return variants


def _unique(names):
    seen = set()
    ordered = []
    for name in names:
        key = lookup_key(name)
        if key and key not in seen:
            seen.add(key)
            ordered.append(name)
    return ordered


def item_candidates(name):
    candidates = [name]
    for pattern, replacement in ITEM_REWRITES:
        candidates += [pattern.sub(replacement, c) for c in candidates if pattern.search(c)]
    candidates += [variant for c in candidates for variant in _plural_variants(c)]
    return _unique(candidates)


def monster_candidates(name):
    return _unique([name, re.sub(r"\s*\([^)]*\)$", "", name)])
