import argparse
import json
import re
import shutil
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

import images
from categories import settings_list, tags_for
from melvor import SKILL_ICONS, Entity, load_entities, melvor_bytes
from naming import item_candidates, lookup_key, monster_candidates
from wiki import Wiki

ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = ROOT / "build"
BLANK_TABLET = BUILD_DIR / "assets" / "melvor_tablet_blank.png"
MOD_DIR = ROOT / "mod"
SPRITE_DIR = "sprites"
FILE_TITLE = re.compile(r"File:[^|\]]+?\.(?:png|gif)", re.I)
STACK_TITLE = re.compile(r"^File:.+ (\d+)\.png$", re.I)
TIER_NAME = re.compile(r"^(.*?)[ _](I|II|III|IV|V|VI)$")
UNSET = object()

OSRS_PRAYERS = [
    "Thick Skin", "Burst of Strength", "Clarity of Thought", "Sharp Eye", "Mystic Will", "Rock Skin",
    "Superhuman Strength", "Improved Reflexes", "Rapid Restore", "Rapid Heal", "Protect Item", "Hawk Eye",
    "Mystic Lore", "Steel Skin", "Ultimate Strength", "Incredible Reflexes", "Protect from Magic",
    "Protect from Missiles", "Protect from Melee", "Eagle Eye", "Mystic Might", "Retribution", "Redemption",
    "Smite", "Preserve", "Chivalry", "Deadeye", "Mystic Vigour", "Piety", "Rigour", "Augury",
]

KIND_POOLS = {
    "item": ["item"],
    "shop": ["item"],
    "pet": ["item", "npc", "monster"],
    "monster": ["monster", "npc"],
    "npc": ["npc", "monster"],
    "prayer": ["prayer"],
    "spell": ["spell"],
    "tree": ["scenery"],
    "rock": ["scenery"],
    "obstacle": ["scenery"],
    "area": [],
}
SPRITE_CANVAS_KINDS = {"item", "shop", "pet"}


def rock_candidates(name):
    return [f"{name} rocks", f"{name} rock", name]


CANDIDATES = {
    "item": item_candidates,
    "shop": item_candidates,
    "pet": lambda name: [],
    "tree": item_candidates,
    "monster": monster_candidates,
    "npc": monster_candidates,
    "rock": rock_candidates,
}


def file_titles(image_field):
    values = image_field if isinstance(image_field, list) else [image_field or ""]
    return [m.group(0).replace("_", " ").replace("File: ", "File:") for v in values for m in [FILE_TITLE.search(v)] if m]


def pick_title(name, titles):
    """Prefer the plain 'File:<name>.png' version, then the biggest stack of a stackable."""
    plain = lookup_key(f"File:{name}.png")
    for title in titles:
        if lookup_key(title) == plain:
            return title
    if all(STACK_TITLE.match(t) for t in titles):
        return max(titles, key=lambda t: int(STACK_TITLE.match(t).group(1)))
    return titles[0]


def build_index(rows, *name_fields):
    names, titles = {}, defaultdict(list)
    for row in rows:
        row_titles = file_titles(row.get("image"))
        for field in name_fields:
            if row.get(field) and row_titles:
                key = lookup_key(row[field])
                names.setdefault(key, row[field])
                titles[key] += [t for t in row_titles if t not in titles[key]]
    return {key: (names[key], pick_title(names[key], titles[key])) for key in titles}


def load_pools(wiki):
    prayers = wiki.image_info({f"File:{name}.png" for name in OSRS_PRAYERS})
    return {
        "item": build_index(wiki.bucket("infobox_item", ["item_name", "image"]), "item_name"),
        "monster": build_index(wiki.bucket("infobox_monster", ["name", "page_name", "image"]), "name", "page_name"),
        "npc": build_index(wiki.bucket("infobox_npc", ["page_name", "image"]), "page_name"),
        "scenery": build_index(wiki.bucket("infobox_scenery", ["page_name", "image"]), "page_name"),
        "spell": build_index(wiki.bucket("infobox_spell", ["page_name", "image"]), "page_name"),
        "prayer": {lookup_key(t[5:-4]): (t[5:-4], t) for t in prayers},
    }


def load_overrides():
    """Hand overrides win over reviewed guesses; both map kind -> Melvor id -> name, File title, or null."""
    merged = defaultdict(dict)
    for name in ("guesses.json", "overrides.json"):
        path = BUILD_DIR / name
        if path.exists():
            for kind, entries in json.loads(path.read_text()).items():
                merged[kind].update(entries)
    return merged


def resolve(value, pool_names, pools):
    if isinstance(value, dict):
        return json.dumps(value, sort_keys=True), value
    if value.startswith("File:"):
        return value, value
    for pool in pool_names:
        found = pools[pool].get(lookup_key(value))
        if found:
            return found
    raise SystemExit(f"override target {value!r} not found in pools {pool_names}")


def match_entities(entities, pools, overrides):
    matches, misses = [], []
    for media, value in {**SKILL_ICONS, **overrides.get("media", {})}.items():
        title = value if value.startswith("File:") else f"File:{value} icon.png"
        matches.append((Entity("icon", media, value, media, "static"), value, title, "static"))
    for entity in entities:
        pool_names = KIND_POOLS[entity.kind]
        override = overrides.get(entity.kind, {}).get(entity.id, UNSET)
        if override is None:
            misses.append((entity, "blocked by override"))
            continue
        if override is not UNSET:
            osrs_name, title = resolve(override, pool_names, pools)
            matches.append((entity, osrs_name, title, "override"))
            continue
        found = None
        for candidate in CANDIDATES.get(entity.kind, lambda n: [n])(entity.name):
            found = next((pools[p][lookup_key(candidate)] for p in pool_names if lookup_key(candidate) in pools[p]), None)
            if found:
                matches.append((entity, found[0], found[1], "exact" if candidate == entity.name else "rewrite"))
                break
        if not found:
            misses.append((entity, "no match"))
    label_tiers(matches)
    star_perfect(matches)
    return matches, misses


def star_perfect(matches):
    """Melvor's (Perfect) foods share art with the plain food; a star tells them apart."""
    for index, (entity, osrs_name, title, how) in enumerate(matches):
        if entity.name.lower().endswith("(perfect)"):
            matches[index] = (entity, osrs_name, {**spec_of(title), "star": True}, how)


def label_tiers(matches):
    """Tiers (I, II, III...) of one Melvor family that share an OSRS image get the numeral stamped on."""
    families = defaultdict(list)
    for index, (entity, _, title, _) in enumerate(matches):
        if isinstance(title, str):
            tier = TIER_NAME.match(entity.name)
            base = tier.group(1) if tier else entity.name
            families[(entity.kind, lookup_key(base), title)].append((index, tier.group(2) if tier else None))
    for members in families.values():
        if len(members) < 2 or not any(tier for _, tier in members):
            continue
        for index, tier in members:
            entity, osrs_name, title, how = matches[index]
            matches[index] = (entity, osrs_name, {"base": title, "label": tier or "I"}, how)


def spec_of(title):
    return title if isinstance(title, dict) else {"base": title}


def spec_titles(spec):
    titles = spec.get("row") or [spec.get(k) for k in ("base", "badge", "inset", "tablet")]
    return [t for t in titles + [spec.get("decal")] if t and t.startswith("File:")]


def spec_slug(spec):
    titles = spec.get("row") or [spec.get(k) for k in ("base", "badge", "inset", "tablet")]
    parts = (["tablet"] if spec.get("tablet") else []) + [slug(t) for t in titles if t]
    if spec.get("label"):
        parts.append(spec["label"])
    if spec.get("star"):
        parts.append("perfect")
    if spec.get("decal"):
        parts.append("badge_" + re.sub(r"[^A-Za-z0-9]+", "_", spec["decal"].split(":", 1)[-1].rsplit("/", 1)[-1].rsplit(".", 1)[0]).strip("_"))
    return "_".join(parts)


def slug(title):
    return re.sub(r"[^A-Za-z0-9]+", "_", title[5:].rsplit(".", 1)[0]).strip("_")


def decal_bytes(value, fetch):
    if value.startswith("melvor:"):
        return melvor_bytes(value[len("melvor:"):], BUILD_DIR / ".cache")
    return fetch(value)


def process(entity, spec, info, wiki):
    fetch = lambda title: wiki.download(info[title]["url"])
    if spec.get("row"):
        return "render", images.row([fetch(t) for t in spec["row"]])
    if spec.get("tablet"):
        return "render", images.tablet(BLANK_TABLET.read_bytes(), fetch(spec["tablet"]))
    base = info[spec["base"]]
    if max(base["width"] or 0, base["height"] or 0) <= images.MIN_ICON_SIZE:
        canvas = images.ITEM_CANVAS if entity.kind in SPRITE_CANVAS_KINDS else 0
        decal = decal_bytes(spec["decal"], fetch) if spec.get("decal") else None
        return "sprite", images.pixel_sprite(fetch(spec["base"]), canvas, spec.get("label"), spec.get("star", False), decal)
    badge = fetch(spec["badge"]) if spec.get("badge") else None
    return "render", images.render(fetch(spec["base"]), spec.get("label"), badge)


def apply_decals(matches, decals):
    for index, (entity, osrs_name, title, how) in enumerate(matches):
        spec = spec_of(title)
        if entity.id in decals and not (spec.get("row") or spec.get("tablet") or spec.get("badge")):
            matches[index] = (entity, osrs_name, {**spec, "decal": decals[entity.id]}, how)


VARIANT_KEYS = {"numerals": "label", "stars": "star", "decals": "decal"}


def variants_of(spec):
    """Optional extras on this image, each with its own switch; composites have no plain fallback."""
    if spec.get("row") or spec.get("tablet") or spec.get("badge"):
        return ["composites"]
    return sorted(name for name, key in VARIANT_KEYS.items() if spec.get(key))


def without(spec, names):
    return {k: v for k, v in spec.items() if k not in {VARIANT_KEYS[n] for n in names}}


def write_sprites(matches, wiki, thematic_ids):
    all_titles = {t for _, _, title, _ in matches for t in spec_titles(spec_of(title))}
    info = wiki.image_info(all_titles, thumb_size=images.RENDER_SIZE)
    out_root = MOD_DIR / SPRITE_DIR
    shutil.rmtree(out_root, ignore_errors=True)
    entries, written, missing_files = {}, {}, []

    def sprite_for(entity, spec):
        canvas_kind = "item" if entity.kind in SPRITE_CANVAS_KINDS else "icon"
        key = (canvas_kind, json.dumps(spec, sort_keys=True))
        if key not in written:
            style, png = process(entity, spec, info, wiki)
            name = spec_slug(spec)
            relative = f"{SPRITE_DIR}/{style}/{canvas_kind}_{name}.png" if style == "sprite" else f"{SPRITE_DIR}/render/{name}.png"
            (MOD_DIR / relative).parent.mkdir(parents=True, exist_ok=True)
            (MOD_DIR / relative).write_bytes(png)
            written[key] = relative
        return written[key]

    for entity, osrs_name, title, how in matches:
        spec = spec_of(title)
        absent = [t for t in spec_titles(spec) if t not in info]
        if absent:
            missing_files.append((entity, ", ".join(absent)))
            continue
        if entity.media_path in entries:
            continue
        entry = {"s": sprite_for(entity, spec), "t": tags_for(entity, thematic_ids)}
        variants = variants_of(spec)
        if variants:
            entry["v"] = variants
        if variants and variants != ["composites"]:
            subsets = [[n for i, n in enumerate(variants) if mask >> i & 1] for mask in range(1, 2 ** len(variants))]
            entry["a"] = {"+".join(off): sprite_for(entity, without(spec, off)) for off in subsets}
        entries[entity.media_path] = entry
    return entries, missing_files


def write_report(entities, matches, misses, missing_files, mapping):
    missing_ids = {e.id for e, _ in missing_files}
    totals, hits = Counter(), Counter()
    for entity in entities:
        totals[(entity.package, entity.kind)] += 1
        hits[(entity.package, entity.kind)] += entity.media_path in mapping and entity.id not in missing_ids

    lines = ["# Build report", "", f"{len(mapping)} Melvor image paths mapped to OSRS sprites.", ""]
    lines += ["| Package | Kind | Covered | Total |", "|---|---|---|---|"]
    for package, kind in sorted(totals):
        lines.append(f"| {package} | {kind} | {hits[(package, kind)]} | {totals[(package, kind)]} |")

    by_kind = defaultdict(list)
    for entity, osrs_name, title, how in matches:
        if entity.is_base_game or entity.kind == "icon" or how != "exact":
            by_kind[entity.kind].append(f"- `{entity.id}` {entity.name} -> {title} ({how})")
    for kind in sorted(by_kind):
        lines += ["", f"## Matched {kind} (base game, static, and non-exact)", ""] + sorted(by_kind[kind])

    lines += ["", "## Wiki files that do not exist", ""]
    lines += [f"- `{e.id}` {e.name} -> {title}" for e, title in missing_files] or ["- none"]
    lines += ["", "## Unmatched base game", ""]
    lines += sorted(f"- `{e.id}` ({e.kind}) {e.name}: {why}" for e, why in misses if e.is_base_game and e.media_path not in mapping)
    (BUILD_DIR / "report.md").write_text("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Build the OSRS sprite mapping for the Melvor Idle mod.")
    parser.add_argument("--refresh", action="store_true", help="ignore cached wiki and game data")
    args = parser.parse_args()

    cache_dir = BUILD_DIR / ".cache"
    wiki = Wiki(cache_dir, refresh=args.refresh)
    entities = load_entities(cache_dir, refresh=args.refresh)
    pools = load_pools(wiki)

    thematic_ids = set(json.loads((BUILD_DIR / "thematic.json").read_text()))
    matches, misses = match_entities(entities, pools, load_overrides())
    apply_decals(matches, json.loads((BUILD_DIR / "decals.json").read_text()))
    mapping, missing_files = write_sprites(matches, wiki, thematic_ids)
    settings = settings_list(entry["t"] for entry in mapping.values())
    switches = {s["name"] for s in settings}
    for entry in mapping.values():
        entry["t"] = [name for _, name, _ in entry["t"] if name in switches]
    document = {"version": 2, "settings": settings, "entries": dict(sorted(mapping.items()))}
    (MOD_DIR / "mapping.json").write_text(json.dumps(document, separators=(",", ":")) + "\n")
    write_report(entities, matches, misses, missing_files, mapping)

    icon = MOD_DIR / SPRITE_DIR / "sprite" / "item_Dragon_scimitar.png"
    if icon.exists():
        shutil.copy2(icon, MOD_DIR / "icon.png")
    archive = ROOT / "dist" / "melvor-osrs-sprites.zip"
    archive.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    print(f"packaged {archive.relative_to(ROOT)}")

    sprite_bytes = sum(p.stat().st_size for p in (MOD_DIR / SPRITE_DIR).rglob("*.png"))
    print(f"{len(mapping)} image paths mapped, {len(settings)} settings, {sprite_bytes / 1e6:.1f} MB of sprites")
    print(f"{len(missing_files)} referenced wiki files missing; see build/report.md")


if __name__ == "__main__":
    main()
