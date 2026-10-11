"""Build the OSRS sounds mod: pick sound effects, fetch and encode audio, write mod/audio.json."""
import io
import json
import re
import shutil
import subprocess
import zipfile
from pathlib import Path

from PIL import Image

from melvor import BASE_PACKAGES, EXPANSION_PACKAGES, load_package
from wiki import Wiki

ROOT = Path(__file__).resolve().parent.parent
BUILD_DIR = ROOT / "build"
MOD_DIR = ROOT / "mod"
CACHE = BUILD_DIR / ".cache"
SPRITES_BUILD = Path.home() / "Projects/melvor-osrs-sprites/build"

SKILL_ACTIONS = {
    "melvorD:Mining": "File:Mining (1).wav",
    "melvorD:Fishing": "File:Fishing cast.wav",
    "melvorD:Firemaking": "File:Fire lit.wav",
    "melvorD:Smithing": "File:Anvil.ogg",
    "melvorD:Herblore": "File:Grinding.wav",
    "melvorD:Agility": "File:Jump.wav",
    "melvorD:Farming": "File:Filling plant pot.wav",
    "melvorD:Cooking": "File:100 dwarf cooking.ogg",
    "melvorD:Thieving": "File:Coins.wav",
    "melvorAoD:Archaeology": "File:Spade.wav",
    "melvorAoD:Cartography": "File:Quetzal map open.wav",
    "melvorItA:Harvesting": "File:Picking.wav",
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
SFX_GROUPS = ("spells", "monsters", "skills", "levelUps", "levelUpsHigh", "weapons")
SFX_BITRATE = "48k"
DEATH_SUFFIXES = [" death", " death 01", " death01"]


def slug(title):
    return re.sub(r"[^A-Za-z0-9]+", "_", title[5:].rsplit(".", 1)[0]).strip("_")


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
    spells, monsters, spell_stems, unmatched_spells = {}, {}, {}, []
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
        for monster in data.get("monsters", []):
            melvor_id = f"{ns}:{monster['id']}"
            names = [n for n in (monster["name"].strip(), monster_picks.get(melvor_id)) if n]
            words = [w for w in reversed(re.split(r"[\s,]+", monster["name"].strip())) if len(w) > 2]
            sound = find_sound(available, names, DEATH_SUFFIXES) or find_sound(available, words, DEATH_SUFFIXES)
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
        "spells": spells, "monsters": monsters, "skills": SKILL_ACTIONS, "levelUps": level_ups, "levelUpsHigh": level_ups_high,
        "levelUpFallback": LEVEL_UP_FALLBACK, "pet": PET_UNLOCK, "weapons": WEAPONS,
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


def encode(wiki, info, title, out_path, bitrate, mono):
    if title not in info:
        return False
    source = CACHE / "audio" / slug(title)
    if not source.exists():
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(wiki.download(info[title]["url"]))
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
    titles = {t for group in SFX_GROUPS for t in sfx[group].values()}
    titles |= {sfx["levelUpFallback"], sfx["pet"]}
    info = wiki.image_info(titles)
    shutil.rmtree(MOD_DIR / "audio", ignore_errors=True)
    written, missing = {}, []

    def resource(title, folder, bitrate, mono):
        if title not in written:
            path = MOD_DIR / "audio" / folder / f"{slug(title)}.ogg"
            written[title] = path.relative_to(MOD_DIR).as_posix() if encode(wiki, info, title, path, bitrate, mono) else None
            if written[title] is None:
                missing.append(title)
        return written[title]

    audio = {"music": {}, "sfx": {}}
    for context, tracks in music.items():
        audio["music"][context] = [music_info[t]["url"] for t in tracks if t in music_info]
        missing += [t for t in tracks if t not in music_info]
    for group in SFX_GROUPS:
        audio["sfx"][group] = {k: p for k, t in sfx[group].items() for p in [resource(t, "sfx", SFX_BITRATE, True)] if p}
    for single in ("levelUpFallback", "pet"):
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
