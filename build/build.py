"""Match Melvor equipment to OSRS items and export the models, body kits and pose the character renderer needs."""
import argparse
import json
import io
import re
import shutil
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

from PIL import Image

import osrs_defs
import osrs_model
import skillcape
from melvor import load_equipment
from osrs_cache import Cache

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "build" / ".cache"
MOD_DIR = ROOT / "mod"
DATA_DIR = MOD_DIR / "data"
DIST_DIR = ROOT / "dist"
SPRITES_MAPPING = ROOT.parent / "melvor-osrs-sprites" / "mod" / "mapping.json"
SPRITES_OVERRIDES = ROOT.parent / "melvor-osrs-sprites" / "build" / "overrides.json"
SPRITES_ASSETS = ROOT.parent / "melvor-osrs-sprites" / "build" / "assets"
SPRITE_PATH = re.compile(r"^sprites/(?:sprite/(?:item|icon)_|render/)(.+)\.png$")
REPORT = ROOT / "build" / "report.md"
MODELS = 7
WIKI_API = "https://oldschool.runescape.wiki/api.php"
USER_AGENT = "melvor-osrs-character/0.1 (personal Melvor Idle mod build)"
ICON = "File:Worn Equipment.png"
OVERHEAD_PRAYERS = {
    "Protect_from_Melee": "File:Protect from Melee overhead.png",
    "Protect_from_Ranged": "File:Protect from Missiles overhead.png",
    "Protect_from_Magic": "File:Protect from Magic overhead.png",
    "Redemption": "File:Redemption overhead.png",
    "Retribution": "File:Retribution overhead.png",
}
MALE_KITS = [3, 14, 18, 26, 33, 36, 42]
FEMALE_KITS = [126, 296, 56, 64, 68, 70, 80]
HAIR_PARTS = {"male": 0, "female": 7}
STAND_POSE = 808
POSES = [
    STAND_POSE,
    618, 619, 620, 621, 623,
    879, 877, 875, 873, 871, 869, 867, 2846,
    625, 626, 627, 3873, 629, 628, 624, 7139,
    896, 897,
    898, 899,
    363,
    1248, 4436, 8480, 8472,
    733,
    1249, 883,
    791, 7531,
    881, 424,
    422, 390, 386, 376, 395, 401, 407, 426, 4230, 711, 929,
]
HAND_ITEM_OFFSET = 512
WORN_AS = {"kharidian_headpiece": "desert_disguise", "burning_amulet": "burning_amulet_5", "digsite_pendant": "digsite_pendant_5"}
WORN_PARTS = {4611: {"models": 2, "wear_pos": [0, 8, -1]}}
WORN_RECOLORS = {29777: [(16320, 5056), (15314, 7122), (16687, 47)]}
CUSTOM_CAPES = {
    "melvorF:Summoning_Skillcape": ("melvorTotH:Superior_Summoning_Skillcape", "#48a8a0"),
    "melvorF:Astrology_Skillcape": ("melvorTotH:Superior_Astrology_Skillcape", "#2c4c9c"),
    "melvorAoD:Archaeology_Skillcape": ("melvorAoD:Superior_Archaeology_Skillcape", "#a8865c"),
}
WORN_STAND_INS = {
    "melvorD:Clue_Chasers_Insignia": "Emerald amulet",
    "melvorD:Bobs_Rake": "Scythe",
    "melvorD:Sword_Of_Some_Reliability": "Iron sword",
    "melvorD:Warding_Shield": "Granite shield",
    "melvorD:Punching_Bag_Platebody": "Red d'hide body",
    "melvorF:Blazing_Lantern": "Lit bug lantern",
    "melvorF:Jeweled_Necklace": "Amulet of glory",
    "melvorF:Cave_Giant_Boots": "Bandos boots",
    "melvorF:Fine_Coinpurse": "Forager's pouch",
    "melvorF:Book_Of_Scholars": "Mage's book",
    "melvorAoD:Torch": "Bruma torch (off-hand)",
}
MELVOR_SLOTS = {"Helmet": 0, "Cape": 1, "Amulet": 2, "Weapon": 3, "Platebody": 4, "Shield": 5, "Platelegs": 7, "Gloves": 9, "Boots": 10}


def deltas(values):
    return [value - previous for previous, value in zip([0] + values, values)]


def compact_model(model):
    """Vertices as x, y and z planes and face corners in order, each delta-coded so the zip compresses them well."""
    compact = {
        "v": deltas(model["vx"]) + deltas(model["vy"]) + deltas(model["vz"]),
        "f": deltas([index for face in zip(model["fa"], model["fb"], model["fc"]) for index in face]),
        "c": model["colors"],
    }
    if any(group != -1 for group in model["groups"]):
        compact["g"] = model["groups"]
    if model["priorities"] is not None:
        compact["p"] = model["priorities"]
    else:
        compact["priority"] = model["priority"]
    for key, field in (("t", "types"), ("a", "alphas"), ("x", "textures")):
        if model[field] is not None:
            compact[key] = model[field]
    return compact


def pose(cache, sequence, skeletons):
    frames = []
    skeleton_ids = set()
    for frame_id in sequence["frames"]:
        data = cache.files(osrs_defs.ANIMATIONS, frame_id >> 16)[frame_id & 0xFFFF]
        skeleton_id = osrs_defs.frame_skeleton_id(data)
        if skeleton_id not in skeletons:
            skeletons[skeleton_id] = osrs_defs.skeleton(cache.group(osrs_defs.SKELETONS, skeleton_id))
        skeleton_ids.add(skeleton_id)
        frames.append(osrs_defs.frame(data, skeletons[skeleton_id]))
    if len(skeleton_ids) != 1:
        raise ValueError(f"animation frames use skeletons {skeleton_ids}")
    return {"skeleton": skeleton_ids.pop(), "frames": frames, "lengths": sequence["lengths"],
            "left": sequence["left_hand"], "right": sequence["right_hand"]}


def fetch(url):
    path = CACHE / "wiki" / urllib.parse.quote(url, safe="")[:200]
    if not path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    return path.read_bytes()


def wiki_image(title):
    query = urllib.parse.urlencode({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url", "format": "json", "formatversion": "2"})
    page = json.loads(fetch(f"{WIKI_API}?{query}"))["query"]["pages"][0]
    return Image.open(io.BytesIO(fetch(page["imageinfo"][0]["url"]))).convert("RGBA")


def slug(name):
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").lower()


def worn_items(cache):
    by_slug = defaultdict(list)
    by_id = {}
    for item_id, data in sorted(cache.files(osrs_defs.CONFIGS, osrs_defs.ITEM_GROUP).items()):
        definition = osrs_defs.item(data)
        if definition["wear_pos"][0] >= 0 and (definition["male"][0] != -1 or definition["female"][0] != -1):
            by_slug[slug(definition["name"])].append(item_id)
            by_id[item_id] = definition
    return by_slug, by_id


def plain_sprite(entry):
    variants = entry.get("v", [])
    if variants == ["composites"]:
        return None
    return entry["a"]["+".join(variants)] if variants else entry["s"]


def match(equipment, sprite_entries, by_slug, by_id):
    matches = {}
    for entry in equipment:
        slot = MELVOR_SLOTS.get(entry.slot)
        sprite = sprite_entries.get(entry.media)
        found = SPRITE_PATH.match(plain_sprite(sprite) or "") if slot is not None and sprite else None
        if not found:
            continue
        words = WORN_AS.get(found.group(1).lower(), found.group(1).lower()).split("_")
        for dropped in range(min(3, len(words))):
            candidates = [item_id for item_id in by_slug.get("_".join(words[:len(words) - dropped]), []) if by_id[item_id]["wear_pos"][0] == slot]
            if candidates:
                matches[entry.id] = candidates[0]
                break
    for entry in equipment:
        stand_in = WORN_STAND_INS.get(entry.id)
        if entry.id not in matches and stand_in:
            candidates = [item_id for item_id in by_slug.get(slug(stand_in), []) if by_id[item_id]["wear_pos"][0] == MELVOR_SLOTS.get(entry.slot)]
            if not candidates:
                raise SystemExit(f"stand-in {stand_in!r} for {entry.id} is not a wearable {entry.slot}")
            matches[entry.id] = candidates[0]
    return matches


def worn_parts(osrs_id, definition):
    # Drops parts the Melvor icon omits (Desert disguise beard) and recolours the Bruma torch flame.
    if osrs_id in WORN_RECOLORS:
        definition = {**definition, "recolor": definition["recolor"] + WORN_RECOLORS[osrs_id]}
    parts = WORN_PARTS.get(osrs_id)
    if not parts:
        return definition
    keep = lambda models: models[:parts["models"]] + [-1] * (len(models) - parts["models"])
    return {**definition, "male": keep(definition["male"]), "female": keep(definition["female"]), "wear_pos": parts["wear_pos"]}


def item_file(cache, definition, model_cache):
    model_ids = sorted({model for model in definition["male"] + definition["female"] if model != -1})
    for model_id in model_ids:
        if model_id not in model_cache:
            model_cache[model_id] = compact_model(osrs_model.decode(cache.group(MODELS, model_id)))
    item = {key: definition[key] for key in ("wear_pos", "male", "female", "male_offset", "female_offset", "recolor", "retexture")}
    return {"item": item, "models": {model_id: model_cache[model_id] for model_id in model_ids}}


def custom_skillcapes(cache):
    overrides = json.loads(SPRITES_OVERRIDES.read_text())["item"]
    base = osrs_defs.item(cache.files(osrs_defs.CONFIGS, osrs_defs.ITEM_GROUP)[skillcape.BASE_CAPE])
    meshes = {gender: osrs_model.decode(cache.group(MODELS, base[gender][0])) for gender in ("male", "female")}
    files = {}
    for cape_id, (superior_id, accent) in CUSTOM_CAPES.items():
        spec = overrides[cape_id]
        emblem = Image.open(SPRITES_ASSETS / spec["emblem"].removeprefix("asset:"))
        shoulders = skillcape.shades(accent)
        for melvor_id, superior in ((cape_id, False), (superior_id, True)):
            name = slug(melvor_id.split(":", 1)[1])
            models = {f"{name}_{gender}": compact_model(skillcape.build(mesh, spec["color"], shoulders, emblem, superior)) for gender, mesh in meshes.items()}
            item = {"wear_pos": base["wear_pos"], "male": [f"{name}_male", -1, -1], "female": [f"{name}_female", -1, -1],
                    "male_offset": 0, "female_offset": 0, "recolor": [], "retexture": []}
            write_json(DATA_DIR / "items" / f"{name}.json", {"item": item, "models": models})
            files[melvor_id] = name
    return files


def base_file(cache, model_cache):
    kits = cache.files(osrs_defs.CONFIGS, osrs_defs.IDENTKIT_GROUP)
    sequences = cache.files(osrs_defs.CONFIGS, osrs_defs.SEQUENCE_GROUP)
    skeletons = {}
    poses = {sequence_id: pose(cache, osrs_defs.sequence(sequences[sequence_id]), skeletons) for sequence_id in POSES}
    decoded = {kit_id: osrs_defs.kit(kit_data) for kit_id, kit_data in kits.items()}
    defaults = {"male": MALE_KITS, "female": FEMALE_KITS}
    hair = {}
    for body, part in HAIR_PARTS.items():
        default = next(kit_id for kit_id in defaults[body] if decoded[kit_id]["part"] == part)
        hair[body] = [default] + [kit_id for kit_id in sorted(decoded) if decoded[kit_id]["part"] == part and decoded[kit_id]["selectable"] and kit_id != default]
    data = {"kits": {}, "models": {}, "poses": poses, "skeletons": skeletons, "defaults": defaults, "hair": hair}
    for kit_id in sorted(set(MALE_KITS + FEMALE_KITS + hair["male"] + hair["female"])):
        data["kits"][kit_id] = decoded[kit_id]
        for model_id in data["kits"][kit_id]["models"]:
            if model_id not in model_cache:
                model_cache[model_id] = compact_model(osrs_model.decode(cache.group(MODELS, model_id)))
            data["models"][model_id] = model_cache[model_id]
    return data


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, separators=(",", ":")))


def write_report(equipment, matches, by_id, custom):
    drawn = [e for e in equipment if e.slot in MELVOR_SLOTS]
    lines = ["# Build report", "", f"{len(matches)} of {len(drawn)} drawable Melvor equipment items matched to OSRS items.", "",
             "| Package | Matched | Drawable |", "|---|---|---|"]
    for package in sorted({e.package for e in drawn}):
        in_package = [e for e in drawn if e.package == package]
        lines.append(f"| {package} | {sum(e.id in matches for e in in_package)} | {len(in_package)} |")
    lines += ["", "## Matched", ""]
    lines += [f"- {e.id} ({e.name}) -> {matches[e.id]} {by_id[matches[e.id]]['name']}" for e in drawn if e.id in matches]
    lines += ["", "## Built", ""]
    lines += [f"- {e.id} ({e.name}) -> {custom[e.id]}, from the Agility cape" for e in drawn if e.id in custom]
    lines += ["", "## Unmatched", ""]
    lines += [f"- {e.id} ({e.name}, {e.slot})" for e in drawn if e.id not in matches and e.id not in custom]
    REPORT.write_text("\n".join(lines) + "\n")


def square(image):
    # Melvor stretches non-square mod icons to a square box.
    side = max(image.size)
    canvas = Image.new("RGBA", (side, side))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sprites-mapping", type=Path, default=SPRITES_MAPPING, help="mod/mapping.json from a built OSRS Sprites mod")
    args = parser.parse_args()
    cache = Cache(CACHE)
    equipment = load_equipment(CACHE)
    by_slug, by_id = worn_items(cache)
    matches = match(equipment, json.loads(args.sprites_mapping.read_text())["entries"], by_slug, by_id)
    shutil.rmtree(DATA_DIR, ignore_errors=True)
    model_cache = {}
    base = base_file(cache, model_cache)
    write_json(DATA_DIR / "base.json", base)
    all_items = cache.files(osrs_defs.CONFIGS, osrs_defs.ITEM_GROUP)
    hand_items = {value - HAND_ITEM_OFFSET for p in base["poses"].values() for value in (p["left"], p["right"]) if value >= HAND_ITEM_OFFSET}
    for osrs_id in sorted(hand_items):
        write_json(DATA_DIR / "items" / f"{osrs_id}.json", item_file(cache, osrs_defs.item(all_items[osrs_id]), model_cache))
    for osrs_id in sorted(set(matches.values())):
        write_json(DATA_DIR / "items" / f"{osrs_id}.json", item_file(cache, worn_parts(osrs_id, by_id[osrs_id]), model_cache))
    custom = custom_skillcapes(cache)
    index = {e.media: matches[e.id] for e in equipment if e.id in matches} | {e.media: custom[e.id] for e in equipment if e.id in custom}
    write_json(DATA_DIR / "index.json", dict(sorted(index.items())))
    write_report(equipment, matches, by_id, custom)
    icon = wiki_image(ICON)
    square(icon.resize((icon.width * 2, icon.height * 2), Image.NEAREST)).save(MOD_DIR / "icon.png")
    overheads = MOD_DIR / "overheads"
    overheads.mkdir(exist_ok=True)
    for prayer, title in OVERHEAD_PRAYERS.items():
        wiki_image(title).save(overheads / f"{prayer}.png")
    DIST_DIR.mkdir(exist_ok=True)
    archive = DIST_DIR / "melvor-osrs-character.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    data_size = sum(p.stat().st_size for p in DATA_DIR.rglob("*.json"))
    print(f"{len(matches)} items matched, {len(custom)} built, {len(model_cache)} models, data {data_size / 1e6:.2f} MB, zip {archive.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
