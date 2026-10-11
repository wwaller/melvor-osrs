"""Build the OSRS sounds mod: pick sound effects, fetch and encode audio, write mod/audio.json."""
import io
import json
import re
import shutil
import subprocess
import zipfile
from pathlib import Path

from PIL import Image

from melvor import BASE_PACKAGES, load_package
from osrs_cache import Cache
from synth import render, write_wav
from wiki import Wiki

ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = ROOT / "build"
MOD_DIR = ROOT / "mod"
CACHE = BUILD_DIR / ".cache"
SPRITES_BUILD = Path.home() / "Projects/melvor-osrs-sprites/build"

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
    "melvorD:Township": "Construction",
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
NUMERAL = re.compile(r"\s+(I|II|III|IV|V)$")
SFX_GROUPS = ("spells", "monsters", "skills", "categories", "prayers", "levelUps", "levelUpsHigh", "weapons")
SINGLE_SOUNDS = ("levelUpFallback", "pet", *EVENT_SOUNDS)
SFX_BITRATE = "48k"
DEATH_SUFFIXES = [" death", " death 01", " death01"]
SIZE_WORDS = {"giant", "big", "greater", "elder", "large", "small", "mumma"}


def slug(spec):
    kind, name = spec.split(":", 1)
    base = re.sub(r"[^A-Za-z0-9]+", "_", name.rsplit(".", 1)[0]).strip("_")
    return base if kind == "File" else f"{kind}_{base}"


def synth_names(wiki):
    """Jagex's sound effect names to cache ids, from the OSRS Wiki's list of sound IDs."""
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
    """The sprite mod's OSRS pick per Melvor id, so a spell or monster sounds like what it shows."""
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


def sfx_plan():
    available = sfx_titles()
    names = synth_names(Wiki(CACHE))
    spells, monsters, prayers, spell_stems, unmatched_spells = {}, {}, {}, {}, []
    spell_picks, monster_picks = sprite_picks("spell"), sprite_picks("monster")
    for package in BASE_PACKAGES:
        document = load_package(package, CACHE)
        ns = document["namespace"]
        data = document["data"]
        for key in ("attackSpells", "curseSpells", "auroraSpells"):
            for spell in data.get(key, []):
                melvor_id = f"{ns}:{spell['id']}"
                sound = find_sound(available, [spell["name"], spell_picks.get(melvor_id, "")], [""])
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
        for monster in data.get("monsters", []):
            melvor_id = f"{ns}:{monster['id']}"
            candidates = [n for n in (monster["name"].strip(), monster_picks.get(melvor_id)) if n]
            words = list(reversed(re.split(r"[\s,]+", monster["name"].strip())))
            words = [w for i, w in enumerate(words) if len(w) > 2 and (i == 0 or w.lower() not in SIZE_WORDS)]
            sound = synth_death(names, candidates + words) or find_sound(available, candidates + words, DEATH_SUFFIXES)
            if sound:
                monsters[melvor_id] = sound
    for melvor_id, stem in unmatched_spells:
        if stem in spell_stems:
            spells[melvor_id] = spell_stems[stem]
    level_ups, level_ups_high = {}, {}
    for skill_id, osrs_skill in LEVEL_UP_SKILLS.items():
        if osrs_skill in LEVEL_UP_BANDED:
            level_ups[skill_id] = f"File:{osrs_skill} Level Up! (2-49).ogg"
            level_ups_high[skill_id] = f"File:{osrs_skill} Level Up! (50-99).ogg"
        else:
            level_ups[skill_id] = f"File:{osrs_skill} Level Up!.ogg"
    return {
        "spells": spells, "monsters": monsters, "skills": SKILL_ACTIONS, "categories": RECIPE_CATEGORY_ACTIONS, "prayers": prayers,
        "levelUps": level_ups, "levelUpsHigh": level_ups_high, "levelUpFallback": LEVEL_UP_FALLBACK, "pet": PET_UNLOCK,
        "weapons": WEAPONS, **EVENT_SOUNDS,
    }


def track_title(name):
    return "File:" + TRACK_SUFFIX.sub("", name) + ".ogg"


def music_plan():
    approved = BUILD_DIR / "music.json"
    source = approved if approved.exists() else BUILD_DIR / "music_proposals.json"
    plan = {}
    if not source.exists():
        return plan
    for row in json.loads(source.read_text()):
        plan[row["id"]] = [track_title(t) for t in [row["primary"]] + row.get("alternates", []) if t]
    return plan


class Sources:
    """Local audio for a sound spec: an OSRS Wiki file, or a Jagex-named synth sound rendered from the game cache."""

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
    icon.resize((icon.width * 2, icon.height * 2), Image.NEAREST).save(MOD_DIR / "icon.png")

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
