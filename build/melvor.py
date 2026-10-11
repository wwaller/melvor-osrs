import json
import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path

DATA_URL = "https://steam.melvoridle.com/assets/data/{package}.json"
MEDIA_CDN = "https://cdn2-main.melvor.net/"
STEAM_APP = Path.home() / "Library/Application Support/Steam/steamapps/common/Melvor Idle/Melvor Idle.app/Contents/Resources/app.nw"
LANG_URL = "https://steam.melvoridle.com/lang/en.json"
BASE_PACKAGES = ["melvorDemo", "melvorFull"]
EXPANSION_PACKAGES = ["melvorTotH", "melvorExpansion2", "melvorItA"]

SKILL_ICONS = {
    "assets/media/skills/attack/attack.png": "Attack",
    "assets/media/skills/strength/strength.png": "Strength",
    "assets/media/skills/defence/defence.png": "Defence",
    "assets/media/skills/hitpoints/hitpoints.png": "Hitpoints",
    "assets/media/skills/ranged/ranged.png": "Ranged",
    "assets/media/skills/magic/magic.png": "Magic",
    "assets/media/skills/prayer/prayer.png": "Prayer",
    "assets/media/skills/slayer/slayer.png": "Slayer",
    "assets/media/skills/woodcutting/woodcutting.png": "Woodcutting",
    "assets/media/skills/fishing/fishing.png": "Fishing",
    "assets/media/skills/firemaking/firemaking.png": "Firemaking",
    "assets/media/skills/cooking/cooking.png": "Cooking",
    "assets/media/skills/mining/mining.png": "Mining",
    "assets/media/skills/smithing/smithing.png": "Smithing",
    "assets/media/skills/thieving/thieving.png": "Thieving",
    "assets/media/skills/farming/farming.png": "Farming",
    "assets/media/skills/fletching/fletching.png": "Fletching",
    "assets/media/skills/crafting/crafting.png": "Crafting",
    "assets/media/skills/runecrafting/runecrafting.png": "Runecraft",
    "assets/media/skills/herblore/herblore.png": "Herblore",
    "assets/media/skills/agility/agility.png": "Agility",
    "assets/media/skills/combat/combat.png": "Combat",
}

TOP_LEVEL_KINDS = {
    "items": "item",
    "monsters": "monster",
    "prayers": "prayer",
    "attackSpells": "spell",
    "curseSpells": "spell",
    "auroraSpells": "spell",
    "pets": "pet",
    "shopPurchases": "shop",
    "combatAreas": "area",
    "slayerAreas": "area",
    "dungeons": "area",
    "strongholds": "area",
}
SKILL_KINDS = {
    "trees": "tree",
    "rockData": "rock",
    "npcs": "npc",
    "obstacles": "obstacle",
    "altSpells": "spell",
}
DESCRIPTION_KEYS = ["ITEM_DESCRIPTION_{id}", "SHOP_DESCRIPTION_{id}", "MAGIC_ALTMAGIC_DESC_{id}", "SLAYER_AREA_EFFECT_{id}"]


@dataclass(frozen=True)
class Entity:
    kind: str
    id: str
    name: str
    media: str
    package: str
    category: str = ""
    type: str = ""
    description: str = ""
    group: str = ""
    sub: str = ""

    @property
    def media_path(self):
        return strip_query(self.media)

    @property
    def is_base_game(self):
        return self.package in BASE_PACKAGES


def strip_query(media):
    return media.split("?", 1)[0]


def _cached_json(url, path, refresh):
    if refresh or not path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    return json.loads(path.read_text())


def load_package(package, cache_dir, refresh=False):
    return _cached_json(DATA_URL.format(package=package), Path(cache_dir) / "melvor" / f"{package}.json", refresh)


def load_lang(cache_dir, refresh=False):
    return _cached_json(LANG_URL, Path(cache_dir) / "melvor" / "lang_en.json", refresh)


def _description(lang, local_id):
    for key in DESCRIPTION_KEYS:
        text = lang.get(key.format(id=local_id))
        if text:
            return re.sub(r"<[^>]+>", " ", text).strip()
    return ""


def _display_names(documents, key):
    return {f"{doc['namespace']}:{obj['id']}": obj.get("name", obj["id"]) for doc in documents for obj in doc.get("data", {}).get(key, [])}


def _sub(key, obj, spellbooks, shop_categories):
    if key == "attackSpells":
        return spellbooks.get(obj.get("spellbook", ""), "")
    if key == "shopPurchases":
        return shop_categories.get(obj.get("category", ""), "")
    if key == "monsters" and obj.get("isBoss"):
        return "boss"
    return ""


def load_entities(cache_dir, refresh=False):
    lang = load_lang(cache_dir, refresh)
    documents = [(package, load_package(package, cache_dir, refresh)) for package in BASE_PACKAGES + EXPANSION_PACKAGES]
    spellbooks = _display_names([d for _, d in documents], "attackSpellbooks")
    shop_categories = _display_names([d for _, d in documents], "shopCategories")
    entities = []
    for package, document in documents:
        namespace = document["namespace"]
        data = document.get("data", {})

        def add(kind, key, objects):
            for obj in objects:
                name = obj.get("name") or obj.get("customName")
                if name and obj.get("media"):
                    entities.append(Entity(
                        kind, f"{namespace}:{obj['id']}", name, obj["media"], package,
                        str(obj.get("category", "")), str(obj.get("type", "")), _description(lang, obj["id"]),
                        key, _sub(key, obj, spellbooks, shop_categories),
                    ))

        for key, kind in TOP_LEVEL_KINDS.items():
            add(kind, key, data.get(key, []))
        for skill in data.get("skillData", []):
            for key, kind in SKILL_KINDS.items():
                add(kind, key, skill["data"].get(key, []))
    return entities


def melvor_bytes(media, cache_dir):
    """Melvor art from the local Steam install, falling back to Melvor's CDN (cached)."""
    local = STEAM_APP / media
    if local.exists():
        return local.read_bytes()
    cached = Path(cache_dir) / "melvor_media" / media
    if not cached.exists():
        request = urllib.request.Request(MEDIA_CDN + media, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read()
        except OSError:
            return None
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_bytes(body)
    return cached.read_bytes()
