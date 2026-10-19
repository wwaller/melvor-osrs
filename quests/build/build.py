"""Build the OSRS Quests mod: fetch the talking heads, quest items, icons, jingles and fonts, write mod/library.json and zip mod/."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tools"))
import osrs  # noqa: E402
from catalog import ITEMS, JINGLES, NPCS, QUEST_ICON, QUEST_START_ICON  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MOD_DIR = ROOT / "mod"
DIST_DIR = ROOT / "dist"
USER_AGENT = "melvor-osrs-quests/0.1 (personal Melvor Idle mod build)"
FONTS = ["RuneScape-Plain-12", "RuneScape-Bold-12", "RuneScape-Quill-8", "RuneScape-Quill"]
CHATHEAD_HEIGHT = 140
BACKGROUND = (36, 31, 26, 255)
YELLOW = (255, 255, 0, 255)
ORANGE = (255, 152, 31, 255)
LOGO_ICON_SCALE = 18


def chathead_titles(names):
    return [f"File:{name} chathead.png" for name in names]


def draw_logo(icon):
    logo = Image.new("RGBA", (1280, 720), BACKGROUND)
    art = osrs.scaled(icon, LOGO_ICON_SCALE)
    logo.alpha_composite(art, (280 - art.width // 2, (720 - art.height) // 2))
    font = ImageFont.load_default_imagefont()

    def text(line, left_edge, y, scale, fill):
        left, top, right, bottom = font.getbbox(line)
        tag = Image.new("RGBA", (right - left + 1, bottom - top + 1))
        pen = ImageDraw.Draw(tag)
        pen.text((1 - left, 1 - top), line, font=font, fill=(0, 0, 0, 255))
        pen.text((-left, -top), line, font=font, fill=fill)
        logo.alpha_composite(osrs.scaled(tag, scale), (left_edge, y))

    text("OSRS QUESTS", 560, 250, 8, YELLOW)
    text("Talking heads, quest journals", 564, 360, 3, ORANGE)
    text("and a quest framework for mods", 564, 400, 3, ORANGE)
    return logo


def main():
    wiki = osrs.Wiki(ROOT / "build" / ".cache", USER_AGENT)
    titles = [title for _, names in NPCS.values() for title in chathead_titles(names)]
    titles += [f"File:{title}.png" for _, title, _ in ITEMS.values()]
    titles += [QUEST_ICON, QUEST_START_ICON, *JINGLES]
    found = wiki.urls(titles)
    library = {"npcs": {}, "items": {}, "jingles": []}
    missing = []

    heads = MOD_DIR / "img" / "chatheads"
    heads.mkdir(parents=True, exist_ok=True)
    for npc_id, (name, names) in NPCS.items():
        title = next((title for title in chathead_titles(names) if title in found), None)
        if title is None:
            missing.append(name)
            continue
        image = wiki.image(title)
        image = image.crop(image.getbbox())
        if image.height > CHATHEAD_HEIGHT:
            image = image.resize((round(image.width * CHATHEAD_HEIGHT / image.height), CHATHEAD_HEIGHT), Image.LANCZOS)
        image.save(heads / f"{npc_id}.png", optimize=True)
        library["npcs"][npc_id] = {"name": name, "chathead": f"img/chatheads/{npc_id}.png"}

    items = MOD_DIR / "img" / "items"
    items.mkdir(parents=True, exist_ok=True)
    for item_id, (name, title, description) in ITEMS.items():
        if f"File:{title}.png" not in found:
            missing.append(title)
            continue
        osrs.crisp(wiki.image(f"File:{title}.png")).save(items / f"{item_id}.png", optimize=True)
        library["items"][item_id] = {"name": name, "media": f"img/items/{item_id}.png", "description": description}

    icon = wiki.image(QUEST_ICON)
    osrs.scaled(icon, 2).save(MOD_DIR / "img" / "quest-point.png")
    osrs.scaled(wiki.image(QUEST_START_ICON), 2).save(MOD_DIR / "img" / "quest-start.png")
    osrs.square(osrs.scaled(icon, 4)).save(MOD_DIR / "icon.png")

    audio = MOD_DIR / "audio"
    audio.mkdir(exist_ok=True)
    for index, title in enumerate(title for title in JINGLES if title in found):
        (audio / f"quest-complete-{index + 1}.ogg").write_bytes(wiki.file(title))
        library["jingles"].append(f"audio/quest-complete-{index + 1}.ogg")

    osrs.fonts(wiki, MOD_DIR / "fonts", FONTS)
    (MOD_DIR / "library.json").write_text(json.dumps(library, indent=1) + "\n")
    DIST_DIR.mkdir(exist_ok=True)
    draw_logo(icon).convert("RGB").save(DIST_DIR / "logo.png", optimize=True)
    archive = osrs.package(ROOT, "melvor-osrs-quests.zip")
    print(f"{len(library['npcs'])} talking heads, {len(library['items'])} items, {len(library['jingles'])} jingles; "
          f"missing {missing or 'nothing'}; {archive} ({archive.stat().st_size / 1e3:.0f} KB)")


if __name__ == "__main__":
    main()
