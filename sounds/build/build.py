"""Build the OSRS sounds mod: pick sound effects, fetch and encode audio, write mod/audio.json."""
import io
import json
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

from PIL import Image

from melvor import BASE_PACKAGES, EXPANSION_PACKAGES, load_package
from osrs_cache import Cache
from synth import render, write_wav
from wiki import Wiki
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import core  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = ROOT / "build"
MOD_DIR = ROOT / "mod"
CACHE = BUILD_DIR / ".cache"
SPRITES_BUILD = ROOT.parent / "art" / "build"

SKILL_ACTIONS = {
    "melvorD:Woodcutting": "synth:woodchop",
    "melvorD:Fishing": "synth:fishing_cast",
    "melvorD:Firemaking": "synth:fire_lit",
    "melvorD:Cooking": "synth:fry",
    "melvorD:Mining": "synth:mine1",
    "melvorD:Smithing": "synth:anvil_4",
    "melvorD:Thieving": "synth:pick",
    "melvorD:Fletching": "synth:fletch",
    "melvorD:Crafting": "synth:stitching",
    "melvorD:Runecrafting": "synth:bind_runes",
    "melvorD:Herblore": "synth:vial_mix",
    "melvorD:Agility": "synth:jump",
    "melvorD:Summoning": "synth:summon_npc",
    "melvorD:Astrology": "synth:star_sprite_twinkle",
    "melvorAoD:Archaeology": "synth:digsite_dig_trowel",
    "melvorAoD:Cartography": "synth:quetzal_map_open_01",
    "melvorItA:Harvesting": "synth:farming_pick",
}
RECIPE_CATEGORY_ACTIONS = {
    "melvorD:Bars": "synth:furnace",
    "melvorF:Rings": "synth:furnace",
    "melvorF:Necklaces": "synth:furnace",
    "melvorF:Urns": "synth:pottery",
}
EVENT_SOUNDS = {
    "stunned": "synth:stunned",
    "harvest": "synth:farming_pick",
    "bury": "synth:bones_down",
    "eat": "synth:eat",
    "prayerOff": "synth:cancel_prayer",
    "playerDeath": "File:You Are Dead!.ogg",
}
PRAYER_SOUNDS = {
    "Thick Skin": "thick_skin", "Burst of Strength": "strength_burst", "Clarity of Thought": "clarity",
    "Sharp Eye": "sharp_eye", "Mystic Will": "mystic_will", "Rock Skin": "rock_skin",
    "Superhuman Strength": "superhuman_strength", "Improved Reflexes": "improved_reflexes", "Rapid Heal": "rapid_heal",
    "Protect Item": "protect_items", "Hawk Eye": "hawk_eye", "Mystic Lore": "mystic_lore", "Steel Skin": "steel_skin",
    "Ultimate Strength": "ultimate_strength", "Incredible Reflexes": "incredible_reflexes",
    "Protect from Magic": "protect_from_magic", "Protect from Ranged": "protect_from_missiles",
    "Protect from Melee": "protect_from_melee", "Eagle Eye": "eagle_eye", "Mystic Might": "mystic_might",
    "Redemption": "redemption", "Chivalry": "kr_chivalry", "Piety": "kr_piety", "Rigour": "sharp_eye", "Augury": "mystic_will",
    "Stone Skin": "steel_skin", "Safeguard": "protect_items", "Rejuvenation": "rapid_heal", "Sharp Vision": "eagle_eye",
    "Mystic Mastery": "mystic_might", "Battleheart": "kr_chivalry",
}
LEVEL_UP_SKILLS = {
    "melvorD:Attack": "Attack", "melvorD:Strength": "Strength", "melvorD:Defence": "Defence", "melvorD:Hitpoints": "Hitpoints",
    "melvorD:Ranged": "Ranged", "melvorD:Magic": "Magic", "melvorD:Prayer": "Prayer", "melvorD:Slayer": "Slayer",
    "melvorD:Woodcutting": "Woodcutting", "melvorD:Fishing": "Fishing", "melvorD:Firemaking": "Firemaking",
    "melvorD:Cooking": "Cooking", "melvorD:Mining": "Mining", "melvorD:Smithing": "Smithing", "melvorD:Thieving": "Thieving",
    "melvorD:Farming": "Farming", "melvorD:Fletching": "Fletching", "melvorD:Crafting": "Crafting",
    "melvorD:Runecrafting": "Runecraft", "melvorD:Herblore": "Herblore", "melvorD:Agility": "Agility",
    "melvorD:Township": "Construction", "melvorAoD:Cartography": "Sailing",
}
LEVEL_UP_BANDED = {"Strength", "Hitpoints"}
LEVEL_UP_FALLBACK = "File:Level up fireworks.ogg"
TRACK_SUFFIX = re.compile(r" \(music track\)$")
PET_UNLOCK = "File:Unique drop sound effect.ogg"
WEAPONS = {
    "stab": "File:Stabsword attack (stab).wav",
    "slash": "File:Hacksword attack (slash).wav",
    "twohand": "File:2H slash.ogg",
    "axe": "File:Battleaxe attack (slash).wav",
    "crush": "File:Battleaxe attack (crush).wav",
    "claw": "File:Dragon claws attack.wav",
    "bow": "File:Longbow attack.wav",
    "crossbow": "File:Crossbow attack.wav",
    "javelin": "File:Javelin attack.wav",
    "thrown": "File:Dart attack.wav",
    "unarmed": "File:Unarmed attack (punch).wav",
    "staff": "File:Staff attack (stab).wav",
}
ENEMY_ATTACK_RULES = [(re.compile(pattern), sound) for pattern, sound in (
    (r"(poison|toxic|venom).*breath", "synth:toxicbreath"),
    (r"(ice|frost|freez|cold).*breath", "synth:kingicebreath"),
    (r"(lightning|thunder|shock).*breath", "synth:lightningbreath"),
    (r"torrential|stone breath", "synth:dragonslayer_dragonbreath"),
    (r"breath|dragonfire", "synth:dragonslayer_dragonbreath"),
    (r"heal|regenerat|restor|mend|rejuvenat|recover", "synth:heal"),
    (r"summon|call of|reinforce|minion|spawn", "synth:summon_npc"),
    (r"roar|scream|howl|shriek|screech|bellow|wail|terror|fear|horror|intimidat|cry\b", "synth:cave_horror_howl"),
    (r"barrier|shield|ward\b|protect|harden|fortif|defen|guard|armou?r|bulwark|aegis|carapace|shell", "synth:steel_skin"),
    (r"root|vine|grasp|entangl|bind|snare|trap|tendril|web|\bnet\b|grip|clutch", "Entangle"),
    (r"stun|daze|concuss", "Stun"),
    (r"curse|hex|jinx|doom|bane", "Curse"),
    (r"weaken|wither|enfeeble|decay|frail", "Enfeeble"),
    (r"silence|vulnerab|expose|sunder", "Vulnerability"),
    (r"blind|gaze|confus|mind|madness|insan|whisper|nightmare|dream|illusion|hypno|eye", "Confuse"),
    (r"seismic|quake|stomp|tremor", "synth:toa_akka_attack_stomp_01"),
    (r"(?<!frost)bite|fang|chomp|gnaw|\bmaw|\bjaw", "synth:bite"),
    (r"claw|scratch|\brake|talon|\brend|maul", WEAPONS["claw"]),
    (r"whip|\blash|\btail|flail", "synth:whip"),
    (r"arrow|shot|volley|\bbow|archer|snipe|hunter|huntsman|quiver|marksman", WEAPONS["bow"]),
    (r"toss|throw|hurl|javelin|dagger|knife|dart|fling|\blob\b", WEAPONS["thrown"]),
    (r"stab|spike|pierc|impale|spear|thrust|sting|horn|gore|lance|needle|spine|quill|skewer|punctur", WEAPONS["stab"]),
    (r"\baxe", WEAPONS["axe"]),
    (r"slash|blade|cleave|lacerat|sever|sword|scimitar|swipe|\bcut|slic|scythe|reap|carve|hack|chop", WEAPONS["slash"]),
    (r"slam|crush|smash|pound|bash|hammer|club|headbutt|tackle|trample|\bram\b|punch|fist|batter", WEAPONS["crush"]),
    (r"lightning|thunder|shock|static|electr|spark|volt", "Saradomin Strike"),
    (r"fireball|meteor", "Fire Blast"),
    (r"fire|flame|(?<!frost)burn|infern|blaze|lava|magma|scorch|ember|heat|solar|\bsun|pyre|ignit|combust|explo", "Fire Wave"),
    (r"\bice|frost|freez|frozen|frigid|snow|blizzard|hail|glaci|chill|cold|icicle|winter", "Ice Barrage"),
    (r"water|wave|tidal|torrent|aqua|tsunami|flood|bubble|splash|\brain|\bsea\b|ocean|drown", "Water Wave"),
    (r"wind|\bair\b|gust|tornado|feather|cyclone|gale|\bsky|(?<!sand)storm", "Wind Wave"),
    (r"spore", "synth:zygo_spore_cast_and_fire"),
    (r"poison|toxic|venom|blight|smog|smoke|mist|\bgas|acid|plague|\brot|miasma|pestil|fung|ooze|sludge|slime|disease", "Smoke Barrage"),
    (r"blood|drain|siphon|leech|vampir|\blife|feast|devour|bleed|hemo|sangu", "Blood Barrage"),
    (r"earth|rock|stone|boulder|crystal|shard|sand|\bmud|dust|petrif|pebble|avalanche|landslide|\bgem", "Earth Wave"),
    (r"shadow|dark|void|abyss|eldritch|hollow|phantom|ghost|spirit|soul|death|necro|undead|grave|night|umbra|wraith|spectr|corrupt", "Shadow Barrage"),
    (r"holy|divine|\blight\b|radiant|celestial|angel|smite|judg|sacred|bless|purif", "Saradomin Strike"),
    (r"\bbolt", WEAPONS["crossbow"]),
    (r"strike|\bhit|charge|impact|break|blow|knock", WEAPONS["crush"]),
    (r"beam|pulse|blast|burst|power|\borb|missile|\bray\b|arcane|magic|mana|energy|surge|nova", "Iban Blast"),
)]
ENEMY_ATTACK_EFFECTS = [(re.compile(pattern), sound) for pattern, sound in (
    (r"burn", "Fire Wave"), (r"poison|venom", "Smoke Barrage"), (r"frost|freez|frozen", "Ice Barrage"), (r"stun", "Stun"),
    (r"bleed", "Blood Barrage"), (r"sleep", "Confuse"), (r"slow", "Bind"), (r"curse", "Curse"), (r"silence", "Vulnerability"),
)]
ENEMY_ATTACK_STYLES = {"melee": WEAPONS["slash"], "ranged": WEAPONS["bow"], "magic": "Iban Blast"}
MONSTER_DEATH_RULES = [(re.compile(pattern), f"synth:{death}_death") for pattern, death in (
    (r"spider (king|queen)|rancora", "big_spider"),
    (r"spider|weaver", "small_spider"),
    (r"crab", "rock_crab"),
    (r"tentacle|kraken|octopus", "lore_karamthulhu"),
    (r"jellyfish", "jelly"),
    (r"\beyes?\b|eyed|beholder|gazer|mindeater", "eyeglo_creature"),
    (r"goo\b|bloater", "slime"),
    (r"\bchick\b", "chicken"),
    (r"serpent|viper|\bconda\b|snake|nagaia", "snake"),
    (r"leviathan", "big_seasnake"),
    (r"\boak\b|willow|teak|maple|mahogany|treant|tree spirit", "lore_ent"),
    (r"tangle|thorn|roots\b", "tanglewood_small"),
    (r"plant|bloom|alraune|morellia|sporeslinger", "lore_stranger_plant"),
    (r"wurm|wyrm", "wyrm"),
    (r"wyvern|drake", "drake"),
    (r"werewolf", "half_werewolf"),
    (r"hound|cerberus|wolf|fang\b", "wolf"),
    (r"devil|demon|fiend|horned elite|\bbane\b", "demon"),
    (r"\bmoth\b|mantis|sprayer", "insect"),
    (r"leech", "leech"),
    (r"croc\b", "crocodile"),
    (r"manticore", "godwars_lion"),
    (r"hydra", "lore_hydra"),
    (r"tortoise", "gnome_tortoise"),
    (r"manta\b", "water_creature"),
    (r"griffin|phoenix|kongamato|razortalon|dreadwing|shadewing|razu\b", "giant_roc"),
    (r"crystal|behemoth", "golem"),
    (r"lich\b|bone", "skeleton"),
    (r"\bair (guard|monster)|aleron|voltaire|aeris|lightning", "air_elemental"),
    (r"water (guard|monster)|lissia|murtia|glacia", "water_elemental"),
    (r"earth (guard|monster)|mistral|ophidia", "earth_elemental"),
    (r"fire (guard|monster)|pyra\b|ignis|ragnar|incendius", "fire_elemental"),
    (r"^ice$|protector of ice", "icefiend"),
    (r"mermaid|siren|maiden|witch|valkyrie|angel|\blady\b|ahrenia", "female"),
    (r"elerine", "elf"),
    (r"golbin", "goblin"),
    (r"knight|wizard|pirate|farmer|bandit|archer|warrior|mage\b|druid|thief|shaman|necromancer|priest|paladin|bard\b|hunter|turkul|captain|first mate|figure|doctor|cult|elementalist|merman|master|prat\b|malcs", "human"),
    (r"mirror|barrel|door|scarecrow", "animated"),
    (r"phantom|spectre|specter|poltergeist|wailing|wisp|spirit|echo|drifter", "ghost"),
    (r"shadow|illusion|trickster", "shade"),
    (r"reaper|revenant|dreadwalker|hollow|nightstalker", "wraith"),
)]
MONSTER_DEATH_FALLBACKS = {"melvorItA": "synth:abyssal_death"}
MONSTER_DEATH_FALLBACK = "synth:beast_death"
SPELL_SOUNDS = {
    "melvorTotH:PoisonPods": "File:Smoke Burst.ogg",
    "melvorTotH:GiantFireball": "File:Fire Surge.ogg",
    "melvorTotH:ThunderStrike": "File:Saradomin Strike.ogg",
    "melvorTotH:MeteorShower": "File:Flames of Zamorak.ogg",
    "melvorTotH:Tsunami": "File:Water Surge.ogg",
    "melvorTotH:NaturesBloom": "File:Claws of Guthix.ogg",
    "melvorTotH:InfernalPower": "File:Superior Demonbane.ogg",
    "melvorTotH:Soulash": "File:Shadow Blitz.ogg",
    "melvorTotH:DragonStormCall": "File:Wind Surge.ogg",
    "melvorTotH:SlicingMaelstrom": "File:Wind Surge.ogg",
    "melvorTotH:Madness": "File:Confuse.ogg",
    "melvorTotH:Torment": "File:Curse.ogg",
    "melvorTotH:Despair": "File:Enfeeble.ogg",
    "melvorAoD:CrushingWaves": "File:Water Wave.ogg",
    "melvorAoD:Whirlpool": "File:Water Surge.ogg",
    "melvorAoD:Fatigue": "File:Enfeeble.ogg",
    "melvorAoD:Petrified": "File:Bind.ogg",
    "melvorAoD:Crystallization": "File:Crystal chime ringing.wav",
    "melvorAoD:Crystal_Sanction": "File:Altar crystal chime 1.ogg",
    "melvorItA:TendrilSlam": "File:Entangle.ogg",
    "melvorItA:Madness": "File:Confuse.ogg",
    "melvorItA:ConsumingGrasp": "File:Bind.ogg",
    "melvorItA:Pandemonium": "File:Iban Blast.ogg",
    "melvorItA:VoidfireVolley": "File:Shadow Barrage.ogg",
    "melvorItA:BlackHole": "File:Mark of Darkness.ogg",
    "melvorItA:NullSphere": "File:Tele Block cast.wav",
    "melvorItA:InfiniteVoid": "File:Death Charge.ogg",
}
ABYSSAL_SPELL_TIERS = {
    "Abyssal": ["Inferior Demonbane", "Superior Demonbane", "Dark Demonbane", "Descent of Darkness"],
    "Brume": ["Smoke Rush", "Smoke Burst", "Smoke Blitz", "Smoke Barrage"],
    "Gloom": ["Shadow Rush", "Shadow Burst", "Shadow Blitz", "Shadow Barrage"],
    "Wither": ["Blood Rush", "Blood Burst", "Blood Blitz", "Blood Barrage"],
    "Nether": ["Fire Blast", "Fire Wave", "Fire Surge", "Flames of Zamorak"],
}
SPELL_TIERS = ("Blast", "Wave", "Surge", "Eruption")
NUMERAL = re.compile(r"\s+(I|II|III|IV|V)$")
SFX_GROUPS = ("spells", "monsters", "monsterAttacks", "skills", "categories", "prayers", "levelUps", "levelUpsHigh", "weapons", "enemyAttacks")
SINGLE_SOUNDS = ("levelUpFallback", "pet", *EVENT_SOUNDS)
SFX_BITRATE = "48k"
DEATH_SUFFIXES = [" death", " death 01", " death01"]
SIZE_WORDS = {"giant", "big", "greater", "elder", "large", "small", "mumma"}


def slug(spec):
    kind, name = spec.split(":", 1)
    base = re.sub(r"[^A-Za-z0-9]+", "_", name.rsplit(".", 1)[0]).strip("_")
    return base if kind == "File" else f"{kind}_{base}"


def synth_names(wiki):
    text = wiki.api({"action": "parse", "page": "List of sound IDs", "prop": "wikitext"})["parse"]["wikitext"]
    names = {}
    for sound_id, name in re.findall(r"\|\s*(\d+)\s*\|\|\s*([^|\n]+)", text):
        names.setdefault(name.strip(), int(sound_id))
    return names


def synth_death(names, candidates):
    for candidate in candidates:
        key = re.sub(r"[^a-z0-9]+", "_", candidate.lower()).strip("_") + "_death"
        if key in names:
            return f"synth:{key}"
    return None


def sprite_picks(kind):
    picks = {}
    for name in ("guesses.json", "overrides.json"):
        path = SPRITES_BUILD / name
        if path.exists():
            for melvor_id, value in json.loads(path.read_text()).get(kind, {}).items():
                if isinstance(value, str):
                    picks[melvor_id] = value[5:].rsplit(".", 1)[0] if value.startswith("File:") else value
    return picks


def sfx_titles():
    return set(json.loads((BUILD_DIR / "osrs_audio_index.json").read_text())["sfx"])


def find_sound(available, names, suffixes):
    lowered = {t.lower(): t for t in available}
    for name in names:
        clean = re.sub(r"\s*\(.*\)$", "", name)
        for suffix in suffixes:
            for ext in (".ogg", ".wav", ".flac"):
                for candidate in (f"file:{clean}{suffix}{ext}", f"file:anger {clean}{suffix}{ext}"):
                    if candidate.lower() in lowered:
                        return lowered[candidate.lower()]
    return None


def monster_death_by_kind(namespace, monster):
    text = (monster["name"].strip() or re.sub(r"(?<=[a-z])(?=[A-Z])", " ", monster["id"])).lower()
    return next((sound for pattern, sound in MONSTER_DEATH_RULES if pattern.search(text)), MONSTER_DEATH_FALLBACKS.get(namespace, MONSTER_DEATH_FALLBACK))


def enemy_attack_sound(available, attack, style):
    words = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", attack["id"])
    text = f"{attack.get('name', '')} {words}".lower()
    effects = " ".join(effect.get("effectID", "") for effect in attack.get("prehitEffects", []) + attack.get("onhitEffects", [])).lower()
    sound = next((sound for pattern, sound in ENEMY_ATTACK_RULES if pattern.search(text)), None)
    sound = sound or next((sound for pattern, sound in ENEMY_ATTACK_EFFECTS if pattern.search(effects)), None)
    sound = sound or ENEMY_ATTACK_STYLES.get(style, ENEMY_ATTACK_STYLES["melee"])
    return sound if sound.startswith(("synth:", "File:")) else find_sound(available, [sound], [""])


def sfx_plan():
    available = sfx_titles()
    names = synth_names(Wiki(CACHE))
    spells, monsters, monster_attacks, prayers, spell_stems, unmatched_spells = {}, {}, {}, {}, {}, []
    style_sounds = {style: sound if sound.startswith(("synth:", "File:")) else find_sound(available, [sound], [""]) for style, sound in ENEMY_ATTACK_STYLES.items()}
    attacks, attack_styles = {}, {}
    spell_picks, monster_picks = sprite_picks("spell"), sprite_picks("monster")
    for package in BASE_PACKAGES + EXPANSION_PACKAGES:
        document = load_package(package, CACHE)
        ns = document["namespace"]
        data = document["data"]
        for key in ("attackSpells", "curseSpells", "auroraSpells"):
            for spell in data.get(key, []):
                melvor_id = f"{ns}:{spell['id']}"
                element, _, tier = spell["name"].partition(" ")
                family = ABYSSAL_SPELL_TIERS.get(element) if ns == "melvorItA" and tier in SPELL_TIERS else None
                themed = find_sound(available, [family[SPELL_TIERS.index(tier)]], [""]) if family else SPELL_SOUNDS.get(melvor_id)
                sound = themed or find_sound(available, [spell["name"], spell_picks.get(melvor_id, "")], [""])
                stem = NUMERAL.sub("", spell["name"])
                if sound:
                    spells[melvor_id] = sound
                    spell_stems.setdefault(stem, sound)
                else:
                    unmatched_spells.append((melvor_id, stem))
        for skill in data.get("skillData", []):
            for spell in skill["data"].get("altSpells", []):
                melvor_id = f"{ns}:{spell['id']}"
                name = re.sub(r"\s+(I|II|III|IV)$", "", spell["name"])
                sound = find_sound(available, [name, spell_picks.get(melvor_id, ""), name.replace("Item Alchemy", "High Level Alchemy"), "Superheat Item" if "Superheat" in name else ""], [""])
                if sound:
                    spells[melvor_id] = sound
        for prayer in data.get("prayers", []):
            if prayer["name"] in PRAYER_SOUNDS:
                prayers[f"{ns}:{prayer['id']}"] = f"synth:{PRAYER_SOUNDS[prayer['name']]}"
        attacks.update({f"{ns}:{attack['id']}": attack for attack in data.get("attacks", [])})
        for monster in data.get("monsters", []):
            for attack_id in monster.get("specialAttacks", []):
                attack_styles.setdefault(attack_id, monster.get("attackType", "melee"))
            melvor_id = f"{ns}:{monster['id']}"
            candidates = [n for n in (monster["name"].strip(), monster_picks.get(melvor_id)) if n]
            words = list(reversed(re.split(r"[\s,]+", monster["name"].strip())))
            words = [w for i, w in enumerate(words) if len(w) > 2 and (i == 0 or w.lower() not in SIZE_WORDS)]
            monsters[melvor_id] = synth_death(names, candidates + words) or find_sound(available, candidates + words, DEATH_SUFFIXES) or monster_death_by_kind(ns, monster)
            if not monster.get("specialAttacks"):
                monster_attacks[melvor_id] = style_sounds.get(monster.get("attackType"), style_sounds["melee"])
    for melvor_id, stem in unmatched_spells:
        if stem in spell_stems:
            spells[melvor_id] = spell_stems[stem]
    enemy_attacks = {attack_id: enemy_attack_sound(available, attacks[attack_id], style) for attack_id, style in attack_styles.items() if attack_id in attacks}
    level_ups, level_ups_high = {}, {}
    for skill_id, osrs_skill in LEVEL_UP_SKILLS.items():
        if osrs_skill in LEVEL_UP_BANDED:
            level_ups[skill_id] = f"File:{osrs_skill} Level Up! (2-49).ogg"
            level_ups_high[skill_id] = f"File:{osrs_skill} Level Up! (50-99).ogg"
        else:
            level_ups[skill_id] = f"File:{osrs_skill} Level Up!.ogg"
    return {
        "spells": spells, "monsters": monsters, "monsterAttacks": monster_attacks, "skills": SKILL_ACTIONS, "categories": RECIPE_CATEGORY_ACTIONS, "prayers": prayers,
        "levelUps": level_ups, "levelUpsHigh": level_ups_high, "levelUpFallback": LEVEL_UP_FALLBACK, "pet": PET_UNLOCK,
        "weapons": WEAPONS, "enemyAttacks": enemy_attacks, **EVENT_SOUNDS,
    }


MIN_TRACK_SECONDS = 60


def track_title(name):
    return "File:" + TRACK_SUFFIX.sub("", name) + ".ogg"


def track_lengths():
    lengths = {}
    for line in (BUILD_DIR / "osrs_tracks.tsv").read_text().splitlines():
        name, _, length = (line.split("\t") + ["", ""])[:3]
        minutes, _, seconds = length.partition(":")
        if minutes.isdigit() and seconds.isdigit():
            lengths.setdefault(name, int(minutes) * 60 + int(seconds))
    return lengths


def music_plan():
    # Tracks under a minute are jingles, not music.
    approved = BUILD_DIR / "music.json"
    source = approved if approved.exists() else BUILD_DIR / "music_proposals.json"
    plan = {}
    if not source.exists():
        return plan
    lengths = track_lengths()
    for row in json.loads(source.read_text()):
        tracks = [t for t in [row["primary"]] + row.get("alternates", []) if t and lengths.get(t, MIN_TRACK_SECONDS) >= MIN_TRACK_SECONDS]
        plan[row["id"]] = [track_title(t) for t in tracks]
    return plan


class Sources:
    def __init__(self, wiki, info):
        self.wiki = wiki
        self.info = info
        self.cache = Cache(CACHE)
        self.names = synth_names(wiki)

    def path(self, spec):
        kind, name = spec.split(":", 1)
        if kind == "File":
            if spec not in self.info:
                return None
            source = CACHE / "audio" / slug(spec)
            if not source.exists():
                source.parent.mkdir(parents=True, exist_ok=True)
                source.write_bytes(self.wiki.download(self.info[spec]["url"]))
            return source
        if name not in self.names:
            return None
        source = CACHE / "synth" / f"{slug(spec)}.wav"
        if not source.exists():
            source.parent.mkdir(parents=True, exist_ok=True)
            write_wav(render(self.cache.sound_effect(self.names[name])), source)
        return source


def encode(source, out_path, bitrate, mono):
    if source is None:
        return False
    out_path.parent.mkdir(parents=True, exist_ok=True)
    loudness = "loudnorm=I=-14:TP=-1.5:LRA=7" if mono else "loudnorm=I=-16:TP=-1.5:LRA=11"
    command = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-af", loudness, "-ar", "48000",
               "-c:a", "libopus", "-b:a", bitrate, "-vbr", "on"] + (["-ac", "1"] if mono else []) + [str(out_path)]
    subprocess.run(command, check=True)
    return True


def square(image):
    # Melvor draws mod icons in a square box and stretches anything else.
    side = max(image.size)
    canvas = Image.new("RGBA", (side, side))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def main():
    wiki = Wiki(CACHE)
    sfx = sfx_plan()
    music = music_plan()
    music_info = wiki.image_info({t for ts in music.values() for t in ts})
    specs = {t for group in SFX_GROUPS for t in sfx[group].values()} | {sfx[single] for single in SINGLE_SOUNDS}
    sources = Sources(wiki, wiki.image_info({s for s in specs if s.startswith("File:")}))
    shutil.rmtree(MOD_DIR / "audio", ignore_errors=True)
    written, missing = {}, []

    def resource(title, folder, bitrate, mono):
        if title not in written:
            path = MOD_DIR / "audio" / folder / f"{slug(title)}.ogg"
            written[title] = path.relative_to(MOD_DIR).as_posix() if encode(sources.path(title), path, bitrate, mono) else None
            if written[title] is None:
                missing.append(title)
        return written[title]

    audio = {"music": {}, "sfx": {}}
    for context, tracks in music.items():
        audio["music"][context] = [music_info[t]["url"] for t in tracks if t in music_info]
        missing += [t for t in tracks if t not in music_info]
    for group in SFX_GROUPS:
        audio["sfx"][group] = {k: p for k, t in sfx[group].items() for p in [resource(t, "sfx", SFX_BITRATE, True)] if p}
    for single in SINGLE_SOUNDS:
        audio["sfx"][single] = resource(sfx[single], "sfx", SFX_BITRATE, True)
    (MOD_DIR / "audio.json").write_text(json.dumps(audio, indent=1) + "\n")
    icon = Image.open(io.BytesIO(wiki.download(wiki.image_info(["File:Music.png"])["File:Music.png"]["url"]))).convert("RGBA")
    square(icon.resize((icon.width * 2, icon.height * 2), Image.NEAREST)).save(MOD_DIR / "icon.png")

    core.bundle(ROOT)

    archive = ROOT / "dist" / "melvor-osrs-sounds.zip"
    archive.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    size = sum(p.stat().st_size for p in (MOD_DIR / "audio").rglob("*.ogg")) / 1e6
    counts = {g: len(v) for g, v in audio["sfx"].items() if isinstance(v, dict)}
    streamed = len({u for urls in audio["music"].values() for u in urls})
    print(f"music: {len(audio['music'])} contexts, {streamed} streamed tracks; sfx {counts}, {size:.1f} MB bundled; missing {missing}")


if __name__ == "__main__":
    main()
