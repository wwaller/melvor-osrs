"""Propose skill badges for generic-looking OSRS stand-ins and build their review page."""
import io
import json
import re
from collections import defaultdict

from PIL import Image

import images
from build import BUILD_DIR, load_overrides, load_pools, match_entities, process, spec_of, spec_titles
from melvor import BASE_PACKAGES, load_entities, load_package, melvor_bytes
from review_page import CELL, COLUMNS, fit_cell, sheet
from wiki import Wiki

SITE_DIR = BUILD_DIR / "review" / "decals_site"
MELVOR_ONLY = {
    "Summoning": "melvor:assets/media/skills/summoning/summoning.png",
    "Astrology": "melvor:assets/media/skills/astrology/astrology.png",
}
POTION_SKILLS = {
    "melvorD:Woodcutting": "Woodcutting", "melvorD:Fishing": "Fishing", "melvorD:Firemaking": "Firemaking",
    "melvorD:Cooking": "Cooking", "melvorD:Mining": "Mining", "melvorD:Smithing": "Smithing",
    "melvorD:Thieving": "Thieving", "melvorD:Farming": "Farming", "melvorD:Fletching": "Fletching",
    "melvorD:Crafting": "Crafting", "melvorD:Runecrafting": "Runecraft", "melvorD:Herblore": "Herblore",
    "melvorD:Agility": "Agility", "melvorD:Summoning": "Summoning", "melvorD:Astrology": "Astrology",
}
COMBAT_POTIONS = {"Regeneration Potion": "Hitpoints", "Damage Reduction Potion": "Defence"}
NAME_SKILLS = [
    (r"\bfishing\b|\bfisherman", "Fishing"), (r"\bwoodcut(ting|ters?)\b|\bbird nest\b", "Woodcutting"),
    (r"\bmin(ing|ers?)\b|\bgem gloves\b", "Mining"), (r"\bsmithing\b|\bblacksmiths?\b", "Smithing"),
    (r"\bcook(ing|er)\b|\bchefs?\b", "Cooking"),
    (r"\bfiremaking\b|\bburning mans\b|\bburning (amulet|scroll)\b|\bquick burner\b|\bgolden star\b", "Firemaking"),
    (r"\bfletch(ing|ers?)\b", "Fletching"), (r"\bcraft(ing|ers?)\b", "Crafting"), (r"\brunecraft(ing|ers?)\b", "Runecraft"),
    (r"\bherblore\b|\bpotion makers\b", "Herblore"), (r"\bthie(ving|f|fs|vers)\b", "Thieving"), (r"\bagility\b", "Agility"),
    (r"\bfarming\b", "Farming"), (r"\bslayer\b", "Slayer"), (r"\bstar gazing\b|\bastrology\b", "Astrology"),
    (r"\bsummon(ing|ers?)\b", "Summoning"), (r"\bdeadeye\b|\branged\b|\bmarksmans?\b|\bthrowing power\b", "Ranged"),
    (r"\bwarlock\b|\bmagic (power|crit|critical|hinder)\b|\bwizard'?s (scroll|sigil)\b", "Magic"),
    (r"\bguardian\b|\bdefence\b", "Defence"), (r"\bfighter\b|\bmelee\b|\baccuracy\b", "Attack"),
    (r"\bstrength\b", "Strength"), (r"\bprayer scroll\b", "Prayer"),
]
OBVIOUS_TYPES = {"Weapon", "Ranged Weapon", "Raw Fish", "Cooked Fish", "Junk", "Familiar"}
WIZARD_GEAR = re.compile(r"\bwizard (hat|robes|bottoms|boots)\b", re.I)
SLOT_WORDS = re.compile(r"\s+(hat|body|leggings|boots|gloves|helmet|platebody|cowl|leather body|wizard hat|wizard robes)$", re.I)


def decal_for(skill):
    return MELVOR_ONLY.get(skill, f"File:{skill} icon.png")


def family_of(name):
    name = re.sub(r"\s+(I|II|III|IV)$", "", name)
    name = re.sub(r"\s+\((basic|strong|elite|master)\)$", "", name, flags=re.I)
    return SLOT_WORDS.sub("", name)


def skill_of(entity, item):
    if item.get("action") in POTION_SKILLS:
        return POTION_SKILLS[item["action"]]
    family = family_of(entity.name)
    if family in COMBAT_POTIONS:
        return COMBAT_POTIONS[family]
    return next((skill for pattern, skill in NAME_SKILLS if re.search(pattern, entity.name.lower())), None)


def main():
    cache = BUILD_DIR / ".cache"
    wiki = Wiki(cache)
    entities = load_entities(cache)
    items = {}
    for package in BASE_PACKAGES:
        document = load_package(package, cache)
        items.update({f"{document['namespace']}:{i['id']}": i for i in document["data"]["items"]})
    thematic = set(json.loads((BUILD_DIR / "thematic.json").read_text()))
    matches, _ = match_entities(entities, load_pools(wiki), load_overrides())

    groups, skipped = defaultdict(list), defaultdict(list)
    for entity, _, title, _ in matches:
        if entity.kind != "item" or not entity.is_base_game or entity.id not in thematic:
            continue
        spec = spec_of(title)
        item = items.get(entity.id, {})
        if WIZARD_GEAR.search(entity.name):
            skipped["Wizard robes (OSRS robes already read as magic gear)"].append(entity.name)
            continue
        skill = skill_of(entity, item)
        if not skill:
            continue
        if item.get("type") in OBVIOUS_TYPES or spec.get("tablet") or spec.get("row") or spec.get("badge"):
            skipped["Weapons, fish, junk and summoning tablets (already clear)"].append(entity.name)
        elif "Skillcape" in entity.name:
            skipped["Skillcapes (OSRS capes show the skill)"].append(entity.name)
        else:
            groups[(family_of(entity.name), skill)].append((entity, spec))

    ordered = sorted(groups.items(), key=lambda kv: (kv[0][1], kv[0][0]))
    titles = {t for (_, skill), members in ordered for _, spec in members for t in spec_titles({**spec, "decal": decal_for(skill)})}
    info = wiki.image_info(titles, thumb_size=images.RENDER_SIZE)
    melvor_cells, before_cells, after_cells, rows, plan = [], [], [], [], {}
    for index, ((family, skill), members) in enumerate(ordered):
        entity, spec = members[0]
        decal = decal_for(skill)
        group_id = f"g{index}"
        plan[group_id] = {"skill": skill, "decal": decal, "items": [e.id for e, _ in members]}
        melvor_cells.append(fit_cell(Image.open(io.BytesIO(melvor_bytes(entity.media_path, cache))), Image.LANCZOS))
        for cells, current in ((before_cells, spec), (after_cells, {**spec, "decal": decal})):
            _, png = process(entity, current, info, wiki)
            cells.append(fit_cell(Image.open(io.BytesIO(png)), Image.NEAREST))
        rows.append({"id": group_id, "family": family, "skill": skill, "names": [e.name for e, _ in members]})

    SITE_DIR.mkdir(parents=True, exist_ok=True)
    sheet(melvor_cells).save(SITE_DIR / "melvor.webp", "WEBP", quality=85, method=6)
    sheet(before_cells).save(SITE_DIR / "before.webp", "WEBP", lossless=True, method=6)
    sheet(after_cells).save(SITE_DIR / "after.webp", "WEBP", lossless=True, method=6)
    skipped_list = [{"reason": reason, "names": sorted(set(names))} for reason, names in skipped.items()]
    page = (BUILD_DIR / "review" / "decal_template.html").read_text()
    page = page.replace("/*ROWS*/[]", json.dumps(rows)).replace("/*SKIPPED*/[]", json.dumps(skipped_list))
    page = page.replace("/*COLUMNS*/40", str(COLUMNS)).replace("/*CELL*/72", str(CELL))
    (SITE_DIR / "index.html").write_text(page)
    (BUILD_DIR / "review" / "decal_plan.json").write_text(json.dumps(plan, indent=1) + "\n")
    print(f"{len(rows)} badge groups covering {sum(len(r['names']) for r in rows)} items; skipped {sum(len(s['names']) for s in skipped_list)}")


if __name__ == "__main__":
    main()
