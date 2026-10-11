"""Build the review page for the guessing pass: build/review/site/{index.html,melvor.webp,osrs.webp}."""
import io
import json
import math

from PIL import Image

import images
from build import BUILD_DIR, load_pools
from melvor import melvor_bytes
from naming import lookup_key
from wiki import Wiki

REVIEW_DIR = BUILD_DIR / "review"
SITE_DIR = REVIEW_DIR / "site"
CELL = 72
COLUMNS = 40
GROUPS = {
    "1_monsters": "Monsters and thieving NPCs",
    "2_pets_areas_obstacles": "Pets, areas, and agility obstacles",
    "3_spells_prayers_shop_tokens": "Spells, prayers, shop, and tokens",
    "4_herblore_farming": "Herblore and farming",
    "5_combat_armour": "Armour",
    "6_combat_weapons_jewelry": "Weapons and jewelry",
    "7_cooking_fishing_smithing_thieving": "Cooking, fishing, smithing, and thieving",
    "8_chests_golbin_raid_summoning": "Chests, Golbin Raid, and summoning",
    "9_events_misc": "Events and everything else",
}
POOL_ORDER = ["item", "npc", "monster", "scenery", "spell", "prayer"]
CANVAS_KINDS = {"item", "shop", "pet"}


def fit_cell(image, resample):
    image = image.convert("RGBA")
    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)
    scale = min(CELL / image.width, CELL / image.height)
    if resample == Image.NEAREST:
        scale = max(1, math.floor(scale))
    image = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), resample)
    cell = Image.new("RGBA", (CELL, CELL))
    cell.paste(image, ((CELL - image.width) // 2, (CELL - image.height) // 2))
    return cell


def osrs_cell(data, info, kind):
    image = Image.open(io.BytesIO(data))
    if max(info["width"] or 0, info["height"] or 0) <= images.MIN_ICON_SIZE:
        canvas = images.ITEM_CANVAS if kind in CANVAS_KINDS else 0
        sprite = Image.open(io.BytesIO(images.pixel_sprite(data, canvas)))
        return fit_cell(sprite, Image.NEAREST), "sprite"
    return fit_cell(image, Image.LANCZOS), "render"


def resolve(proposal, pools):
    name = proposal.get("osrs")
    if not name or proposal.get("confidence") == "skip":
        return None
    order = [proposal["pool"]] + POOL_ORDER if proposal.get("pool") in pools else POOL_ORDER
    for pool in order:
        found = pools[pool].get(lookup_key(name))
        if found:
            return pool, found[0], found[1]
    return "invalid"


def sheet(cells):
    rows = max(1, math.ceil(len(cells) / COLUMNS))
    out = Image.new("RGBA", (COLUMNS * CELL, rows * CELL))
    for index, cell in enumerate(cells):
        out.paste(cell, ((index % COLUMNS) * CELL, (index // COLUMNS) * CELL))
    return out


def main():
    wiki = Wiki(BUILD_DIR / ".cache")
    pools = load_pools(wiki)
    rows, melvor_cells, osrs_cells, osrs_index = [], [], [], {}
    pending = []
    for group_index, (batch, label) in enumerate(GROUPS.items()):
        entities = json.loads((REVIEW_DIR / "batches" / f"{batch}.json").read_text())
        proposals_path = REVIEW_DIR / "proposals" / f"{batch}.json"
        proposals = {p["id"]: p for p in json.loads(proposals_path.read_text())} if proposals_path.exists() else {}
        for entity in entities:
            proposal = proposals.get(entity["id"], {})
            resolved = resolve(proposal, pools)
            row = {
                "id": entity["id"], "g": group_index, "n": entity["name"], "k": entity["kind"],
                "c": " / ".join(x for x in (entity["category"], entity["type"]) if x),
                "also": entity["also"][:6], "m": len(melvor_cells),
                "conf": proposal.get("confidence", "skip"), "r": proposal.get("reason", ""),
                "o": None, "pool": None, "oi": -1,
            }
            data = melvor_bytes(entity["media"], BUILD_DIR / ".cache")
            try:
                melvor_cells.append(fit_cell(Image.open(io.BytesIO(data)), Image.LANCZOS) if data else Image.new("RGBA", (CELL, CELL)))
            except OSError:
                melvor_cells.append(Image.new("RGBA", (CELL, CELL)))
            if resolved == "invalid":
                row["conf"], row["r"] = "skip", f"guess not on the wiki: {proposal.get('osrs')}"
            elif resolved:
                row["pool"], row["o"], row["title"] = resolved
                pending.append(row)
            rows.append(row)

    info = wiki.image_info({row["title"] for row in pending}, thumb_size=images.RENDER_SIZE)
    resolved_titles = {}
    for row in pending:
        title = row.pop("title")
        if title not in info:
            row.update(conf="skip", r=f"wiki file missing: {title}", o=None, pool=None)
            continue
        resolved_titles[row["id"]] = {"kind": row["k"], "title": title, "osrs": row["o"]}
        key = (title, row["k"] in CANVAS_KINDS)
        if key not in osrs_index:
            cell, _ = osrs_cell(wiki.download(info[title]["url"]), info[title], row["k"])
            osrs_index[key] = len(osrs_cells)
            osrs_cells.append(cell)
        row["oi"] = osrs_index[key]

    (REVIEW_DIR / "resolved.json").write_text(json.dumps(resolved_titles, indent=1) + "\n")
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    sheet(melvor_cells).save(SITE_DIR / "melvor.webp", "WEBP", quality=82, method=6)
    sheet(osrs_cells).save(SITE_DIR / "osrs.webp", "WEBP", lossless=True, method=6)
    template = (REVIEW_DIR / "template.html").read_text()
    page = template.replace("/*ROWS*/[]", json.dumps(rows, separators=(",", ":"))).replace(
        "/*GROUPS*/[]", json.dumps(list(GROUPS.values()))).replace("/*COLUMNS*/40", str(COLUMNS)).replace("/*CELL*/72", str(CELL))
    (SITE_DIR / "index.html").write_text(page)
    counts = {c: sum(1 for r in rows if r["conf"] == c) for c in ("real", "thematic", "skip")}
    sizes = {p.name: f"{p.stat().st_size / 1e6:.2f} MB" for p in SITE_DIR.iterdir()}
    print(f"{len(rows)} rows {counts}; {len(osrs_cells)} OSRS images; {sizes}")


if __name__ == "__main__":
    main()
