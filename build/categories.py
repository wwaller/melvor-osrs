"""Setting switches for the mod: every replaced image is tagged with the switches that govern it."""
import re
from collections import Counter

CURRENCIES = {"assets/media/main/coins.png", "assets/media/main/slayer_coins.png"}
GENERAL = [
    ("enabled", "Use OSRS art", "Master switch for every replacement."),
    ("thematic", "Thematic stand-ins", "Art for things with no exact OSRS counterpart. Turn off to keep only real matches."),
    ("numerals", "Tier numerals", "Roman numerals stamped on tiers that share one OSRS image. Off shows the plain image."),
    ("stars", "Perfect food stars", "Gold star on Perfect food. Off shows the plain food."),
    ("composites", "Composite art", "Cooking fires with logs, Multi-Tree, and summoning tablets. Off keeps Melvor art."),
    ("decals", "Skill badges", "Small skill icon on potions, scrolls and other items whose OSRS art does not show what they are for."),
]
PACKS = {
    "melvorDemo": ("pack-base", "Base game"),
    "melvorFull": ("pack-base", "Base game"),
    "melvorTotH": ("pack-toth", "Throne of the Herald"),
    "melvorExpansion2": ("pack-aod", "Atlas of Discovery"),
    "melvorItA": ("pack-ita", "Into the Abyss"),
}
GROUPS = {
    "pets": ("Combat", "pets", "Pets"),
    "prayers": ("Combat", "prayers", "Prayers"),
    "curseSpells": ("Combat", "curses", "Curses"),
    "auroraSpells": ("Combat", "auroras", "Auroras"),
    "altSpells": ("Combat", "alt-magic", "Alt. Magic spells"),
    "combatAreas": ("Combat", "combat-areas", "Combat areas"),
    "slayerAreas": ("Combat", "slayer-areas", "Slayer areas"),
    "dungeons": ("Combat", "dungeons", "Dungeons"),
    "strongholds": ("Combat", "strongholds", "Strongholds"),
    "trees": ("Skilling", "trees", "Woodcutting trees"),
    "rockData": ("Skilling", "rocks", "Mining rocks"),
    "npcs": ("Skilling", "thieving", "Thieving targets"),
    "obstacles": ("Skilling", "agility", "Agility obstacles"),
}
SECTIONS = ["General", "Content packs", "Combat", "Skilling", "Shop", "Item categories", "Item types"]
MIN_IMAGES = 5
ITEM_CATEGORIES = {
    "Combat": "Combat", "Herblore": "Herblore", "Cooking": "Cooking", "Farming": "Farming", "Openable": "Openables",
    "Fishing": "Fishing", "Thieving": "Thieving", "Golbin Raid": "Golbin Raid", "Smithing": "Smithing",
    "Summoning": "Summoning", "Events": "Events", "Runecrafting": "Runecrafting", "Fletching": "Fletching",
    "Firemaking": "Firemaking", "Township": "Township", "Mining": "Mining", "Woodcutting": "Woodcutting",
    "Crafting": "Crafting", "Archaeology": "Archaeology", "Gemstone": "Gems", "Astrology": "Astrology",
}
ITEM_TYPES = {
    "Armour": "Armour", "Potion": "Potions", "Trimmed Armour": "Trimmed armour", "Ranged Armour": "Ranged armour",
    "Weapon": "Weapons", "Magic Armour": "Magic armour", "Food": "Food", "Chest": "Chests",
    "Ranged Weapon": "Ranged weapons", "Amulet": "Amulets", "Ring": "Rings", "Ammo": "Ammo", "Seeds": "Seeds",
    "Familiar": "Summoning familiars", "Raw Fish": "Raw fish", "Rune": "Runes", "Bag": "Bags",
    "Magic Staff": "Magic staves", "Cooked Fish": "Cooked fish", "Unstrung Bows": "Unstrung bows", "Junk": "Junk",
    "Magic Wand": "Magic wands", "Ore": "Ores", "Shard": "Shards", "Bar": "Bars", "Logs": "Logs",
    "Crossbow": "Crossbows", "Herb": "Herbs", "Slayer Armour": "Slayer armour", "Arrowtips": "Arrowtips",
    "Artefact": "Artefacts", "Javelin": "Javelins", "Ingredient": "Ingredients", "Gem": "Gems", "Hats": "Hats",
    "Bones": "Bones", "Dragonhide": "Dragonhide", "Fragment": "Fragments",
}


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def clean(label):
    return label.split(":")[-1].replace("_", " ").strip() or "Other"


def tags_for(entity, thematic_ids):
    """(section, name, label) for each switch that must be on for this entity's art to show."""
    tags = []
    if entity.package in PACKS:
        name, label = PACKS[entity.package]
        tags.append(("Content packs", name, label))
    if entity.kind == "icon":
        tags.append(("Skilling", "currency", "Currency icons") if entity.media_path in CURRENCIES else ("Skilling", "skill-icons", "Skill and menu icons"))
    elif entity.kind == "item":
        category, kind = ITEM_CATEGORIES.get(clean(entity.category)), ITEM_TYPES.get(clean(entity.type))
        if category:
            tags.append(("Item categories", f"item-cat-{slugify(category)}", category))
        if kind:
            tags.append(("Item types", f"item-type-{slugify(kind)}", kind))
    elif entity.kind == "monster":
        tags.append(("Combat", "bosses", "Bosses") if entity.sub == "boss" else ("Combat", "monsters", "Monsters"))
    elif entity.group == "attackSpells":
        book = entity.sub or "Other spells"
        tags.append(("Combat", f"spells-{slugify(book)}", book))
    elif entity.kind == "shop":
        category = entity.sub or "Other"
        tags.append(("Shop", f"shop-{slugify(category)}", category))
    elif entity.group in GROUPS:
        tags.append(GROUPS[entity.group])
    if entity.id in thematic_ids:
        tags.append(("General", "thematic", "Thematic stand-ins"))
    return tags


def settings_list(tagged_entries):
    """Ordered switch definitions, skipping switches too small to be worth one; labels carry image counts."""
    counts, labels = Counter(), {}
    for tags in tagged_entries:
        for section, name, label in tags:
            counts[(section, name)] += 1
            labels[(section, name)] = label
    out = [{"section": "General", "name": name, "label": label, "hint": hint} for name, label, hint in GENERAL]
    for section in SECTIONS[1:]:
        keys = sorted((k for k in counts if k[0] == section and counts[k] >= MIN_IMAGES), key=lambda k: (-counts[k], labels[k]))
        for key in keys:
            out.append({"section": section, "name": key[1], "label": f"{labels[key]} ({counts[key]})", "hint": ""})
    return out
