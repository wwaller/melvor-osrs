"""The OSRS NPC behind each monster's OSRS Art picture, with its standing, attack, block and death animations, for the combat view."""
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import osrs_defs
import osrs_model

ANIMATION_NAMES_URL = "https://raw.githubusercontent.com/runelite/runelite/master/runelite-api/src/main/java/net/runelite/api/gameval/AnimationID.java"
KINDS = {
    "stand": re.compile(r"(READY|IDLE|STAND)"),
    "attack": re.compile(r"(ATTACK|MELEE|STRIKE|SWIPE|BITE|SLASH|PUNCH|SMASH|STAB|SWING|CASTING|CAST|SHOOT|THROW)"),
    "special": re.compile(r"(FIRE_?BREATH|ICE_BREATH)"),
    "block": re.compile(r"(BLOCK|PARRY|DEFEND|DEFENCE|DEFENSE)"),
    "death": re.compile(r"(DEATH|DIE|DEAD|DYING)"),
}
STYLE_WORDS = {"magic": {"MAGIC", "CAST", "CASTING", "SPELL", "MAGE"}, "ranged": {"RANGED", "RANGE", "SHOOT", "THROW", "BOW", "ARROW"}}
KIND_WORDS = {"READY", "IDLE", "STAND", "ATTACK", "BLOCK", "PARRY", "DEFEND", "DEATH", "DIE", "DEAD", "NPC", "UPDATE", "01", "02", "1", "2"}
RESTLESS_STAND = re.compile(r"(SLEEP|WALK|HOVER|TELEPORT|SPAWN|EMERGE|DESPAWN)")
AIRBORNE = {"FLIGHT", "FLY", "FLYING", "TRAVEL"}
HUMAN_READY = 808
HUMAN_DEATH = 836
HUMAN_CAST = 711
HUMAN_UNARMED_BLOCK = 424
HUMAN_UNARMED = {"melee": 422, "ranged": 929, "magic": HUMAN_CAST}
WEAPON_SLOT = 3
HUMAN_WEAPONS = [
    (re.compile(r"crossbow", re.I), 4230, 424),
    (re.compile(r"bow", re.I), 426, 424),
    (re.compile(r"knife|dart|javelin|thrownaxe|throwing", re.I), 929, 424),
    (re.compile(r"staff|wand|sceptre", re.I), 414, 415),
    (re.compile(r"2h|godsword", re.I), 407, 410),
    (re.compile(r"dagger", re.I), 376, 378),
    (re.compile(r"axe", re.I), 395, 397),
    (re.compile(r"mace|hammer|maul|flail|club", re.I), 401, 403),
    (re.compile(r"spear|halberd|hasta", re.I), 429, 430),
    (re.compile(r"sword|scimitar|sabre|blade|rapier|cutlass|katana", re.I), 390, 387),
]


def words(text):
    return {word for word in re.split(r"[^A-Z0-9]+", text.upper()) if word}


def animation_names(fetch):
    source = fetch(ANIMATION_NAMES_URL).decode()
    return {int(number): name for name, number in re.findall(r"int ([A-Z0-9_]+) = (\d+);", source)}


SPRITE_MATCHES = """
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import build
from wiki import Wiki
cache_dir = Path(sys.argv[1]) / ".cache"
wiki = Wiki(cache_dir)
matches, _ = build.match_entities(build.load_entities(cache_dir), build.load_pools(wiki), build.load_overrides())
monsters = [{"id": entity.id, "name": name, "spec": spec} for entity, name, spec, _ in matches if entity.kind == "monster"]
rows = []
for table, field in (("infobox_monster", "id"), ("infobox_npc", "npc_id")):
    rows += [{"page": row.get("page_name"), "images": row.get("image") or [], "ids": row.get(field) or []} for row in wiki.bucket(table, ["page_name", "image", field])]
print(json.dumps({"monsters": monsters, "rows": rows}))
"""


def sprite_matches(sprites_build):
    """Run the OSRS Art build's own matching in a separate Python, since both builds have modules named build and melvor."""
    result = subprocess.run([sys.executable, "-c", SPRITE_MATCHES, str(sprites_build)], cwd=sprites_build, capture_output=True, text=True, check=True)
    found = json.loads(result.stdout)
    by_image = defaultdict(list)
    by_page = defaultdict(list)
    for row in found["rows"]:
        ids = [int(value) for value in row["ids"] if str(value).strip().isdigit()]
        for image in row["images"]:
            by_image[image].extend(ids)
        by_page[str(row["page"] or "").lower()].extend(ids)
    return [(monster["id"], monster["name"], monster["spec"]) for monster in found["monsters"]], by_image, by_page


def parts_of(spec):
    if isinstance(spec, str):
        return [{"title": spec, "share": 1, "at": [0.5, 1], "recolor": None}]
    if spec.get("cluster"):
        return [{"title": part["base"], "share": part["share"], "at": part["at"], "recolor": part.get("recolor")} for part in spec["cluster"]]
    if spec.get("row"):
        count = len(spec["row"])
        return [{"title": title, "share": 1 / count, "at": [(index + 0.5) / count, 1], "recolor": spec.get("recolor")} for index, title in enumerate(spec["row"])]
    if spec.get("base"):
        return [{"title": spec["base"], "share": spec.get("shrink", 1), "at": [0.5, 1], "recolor": spec.get("recolor")}]
    return []


class Exporter:
    def __init__(self, cache, fetch, model_cache, compact_model, pose):
        self.cache = cache
        self.model_cache = model_cache
        self.compact_model = compact_model
        self.pose = pose
        self.names = animation_names(fetch)
        self.by_name = {name: number for number, name in self.names.items()}
        self.sequences = cache.files(osrs_defs.CONFIGS, osrs_defs.SEQUENCE_GROUP)
        self.npcs = {npc_id: osrs_defs.npc(data) for npc_id, data in cache.files(osrs_defs.CONFIGS, osrs_defs.NPC_GROUP).items()}
        self.skeleton_of = {}
        self.skeletons = {}
        self.by_skeleton = None
        self.weapons = {}
        for data in cache.files(osrs_defs.CONFIGS, osrs_defs.ITEM_GROUP).values():
            item = osrs_defs.item(data)
            if item["wear_pos"][0] == WEAPON_SLOT and item["male"][0] >= 0:
                self.weapons.setdefault(item["male"][0], item["name"])
        self.texture_colors = {texture_id: int.from_bytes(data[2:4], "big") for texture_id, data in cache.files(osrs_defs.TEXTURES, 0).items()}
        self.npcs_by_name = defaultdict(list)
        for npc_id, definition in self.npcs.items():
            self.npcs_by_name[definition["name"].lower()].append(npc_id)

    def sequence_skeleton(self, sequence_id):
        if sequence_id not in self.skeleton_of:
            skeleton = None
            if sequence_id in self.sequences:
                frames = osrs_defs.sequence(self.sequences[sequence_id])["frames"]
                if frames:
                    group = self.cache.files(osrs_defs.ANIMATIONS, frames[0] >> 16)
                    data = group.get(frames[0] & 0xFFFF)
                    skeleton = osrs_defs.frame_skeleton_id(data) if data else None
            self.skeleton_of[sequence_id] = skeleton
        return self.skeleton_of[sequence_id]

    def npc_for(self, title, page, by_image, by_page):
        bare = re.sub(r"\s*\(.*?\)", "", title.removeprefix("File:").removesuffix(".png")).strip().lower()
        for npc_id in by_image.get(title, []) + by_page.get(page.lower(), []) + by_page.get(bare, []) + self.npcs_by_name.get(bare, []):
            definition = self.npcs.get(npc_id)
            if definition and definition["models"] and definition["stand"] > 0:
                return npc_id
        return None

    def named_on(self, skeleton):
        if self.by_skeleton is None:
            self.by_skeleton = defaultdict(list)
            for number, name in self.names.items():
                if any(pattern.search(name) for pattern in KINDS.values()):
                    found = self.sequence_skeleton(number)
                    if found is not None:
                        self.by_skeleton[found].append((name, number))
        return self.by_skeleton.get(skeleton, [])

    def best(self, pool, kind, reference, style=None):
        best = None
        for name, number in pool:
            if not KINDS[kind].search(name) or (kind != "special" and KINDS["special"].search(name)):
                continue
            if kind == "attack" and (KINDS["block"].search(name) or KINDS["death"].search(name)):
                continue
            if kind == "stand" and RESTLESS_STAND.search(name):
                continue
            own = words(name)
            score = 10 * len(own & reference) - len(own - reference - KIND_WORDS) - 5 * len((own & AIRBORNE) - reference)
            if kind == "attack":
                for other, style_words in STYLE_WORDS.items():
                    if own & style_words:
                        score += 6 if other == style else -6
            rank = (-score, len(name), number)
            if best is None or rank < best[0]:
                best = (rank, number)
        return best[1] if best else None

    def human_combat(self, definition, style):
        weapon = next((self.weapons[model_id] for model_id in definition["models"] if model_id in self.weapons), "")
        attack, block = next(((attack, block) for pattern, attack, block in HUMAN_WEAPONS if pattern.search(weapon)), (HUMAN_UNARMED[style], HUMAN_UNARMED_BLOCK))
        return {"attack": HUMAN_CAST if style == "magic" else attack, "block": block, "death": HUMAN_DEATH}

    def animations(self, definition, attack_type):
        stand = definition["stand"]
        skeleton = self.sequence_skeleton(stand)
        if skeleton is None:
            return None
        stand_name = self.names.get(stand, "")
        reference = (words(stand_name) | words(definition["name"])) - KIND_WORDS
        pool = self.named_on(skeleton)
        style = attack_type if attack_type in ("ranged", "magic") else "melee"
        human = skeleton == self.sequence_skeleton(HUMAN_READY)
        chosen = {"stand": stand}
        if RESTLESS_STAND.search(stand_name):
            calmer = self.best(pool, "stand", reference)
            if calmer:
                chosen["stand"] = calmer
        if human and (not stand_name or stand_name.startswith("HUMAN_")):
            if not KINDS["stand"].search(stand_name):
                chosen["stand"] = HUMAN_READY
            chosen.update(self.human_combat(definition, style))
        else:
            for kind in ("attack", "special", "block", "death"):
                found = self.best(pool, kind, reference, style)
                if found:
                    chosen[kind] = found
            if human:
                for kind, number in self.human_combat(definition, style).items():
                    chosen.setdefault(kind, number)
        return chosen

    def model(self, npc_id):
        definition = self.npcs[npc_id]
        for model_id in definition["models"]:
            if model_id not in self.model_cache:
                self.model_cache[model_id] = self.compact_model(osrs_model.decode(self.cache.group(7, model_id)))
        return definition

    def export(self, monster_id, attack_type, parts, by_image, by_page, osrs_name):
        npcs = []
        poses = {}
        for part in parts:
            npc_id = self.npc_for(part["title"], osrs_name if len(parts) == 1 else part["title"][5:-4], by_image, by_page)
            if npc_id is None:
                continue
            definition = self.model(npc_id)
            chosen = self.animations(definition, attack_type) or {}
            for number in chosen.values():
                if number not in poses:
                    try:
                        poses[number] = self.pose(self.cache, osrs_defs.sequence(self.sequences[number]), self.skeletons)
                    except (KeyError, ValueError):
                        continue
            npcs.append({
                "npc": npc_id, "name": definition["name"], "models": definition["models"], "recolor": definition["recolor"],
                "retexture": definition["retexture"], "scale": [definition["width_scale"], definition["height_scale"]],
                "light": [definition["ambient"], definition["contrast"]], "share": part["share"], "at": part["at"], "tint": part["recolor"],
                "poses": {kind: number for kind, number in chosen.items() if number in poses},
            })
        if not npcs:
            return None
        used = {number for npc in npcs for number in npc["poses"].values()}
        models = {model_id: self.model_cache[model_id] for npc in npcs for model_id in npc["models"]}
        textures = {texture for model in models.values() for texture in model.get("x") or [] if texture >= 0}
        textures |= {to for npc in npcs for _, to in npc["retexture"]}
        return {
            "monster": monster_id, "npcs": npcs, "models": models,
            "textures": {texture: self.texture_colors[texture] for texture in textures if texture in self.texture_colors},
            "poses": {number: poses[number] for number in used},
            "skeletons": {skeleton: self.skeletons[skeleton] for skeleton in {poses[number]["skeleton"] for number in used}},
        }
