"""Draw the mod.io logo: an OSRS login-screen scene with the bundled mods' best bits, from the sibling mod repos."""
import base64
import importlib.util
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PROJECTS = ROOT.parent
CHARACTER = PROJECTS / "melvor-osrs-character"
sys.path.insert(0, str(CHARACTER / "dev"))
sys.path.insert(0, str(CHARACTER / "build"))
sys.path.insert(0, str(ROOT / "build"))

import build  # noqa: E402
import preview  # noqa: E402

OUT = ROOT / "dev" / "preview"
THEME_IMAGES = PROJECTS / "melvor-osrs-theme" / "mod" / "img"
SPRITES = PROJECTS / "melvor-osrs-sprites" / "mod" / "sprites" / "sprite"
SIZE = (1280, 720)
YELLOW = (255, 255, 0, 255)
ORANGE = (255, 152, 31, 255)
WHITE = (255, 255, 255, 255)
MAX_CAPE = 13342
OUTFIT = [1163, 1127, 1079, 1201, 4587, 4131, 7460, 1704, MAX_CAPE]
SLASH_POSE = 390
SLASH_FRAME = 4
FACING_RIGHT = 1664
BADGES = [
    ("melvor-osrs-theme", "Theme"),
    ("melvor-osrs-sprites", "Sprites"),
    ("melvor-osrs-sounds", "Sounds"),
    ("melvor-osrs-character", "Character"),
]
LOOT = ["item_Big_bones.png", "icon_Coins_10000.png", "item_Steel_arrow.png", "item_Nature_rune.png"]
FONT = ImageFont.load_default_imagefont()
TITLE_SCALE = 11
BADGE_SPACING = 112


def text_tag(line, scale, fill):
    left, top, right, bottom = FONT.getbbox(line)
    tag = Image.new("RGBA", (right - left + 1, bottom - top + 1))
    pen = ImageDraw.Draw(tag)
    pen.text((1 - left, 1 - top), line, font=FONT, fill=(0, 0, 0, 255))
    pen.text((-left, -top), line, font=FONT, fill=fill)
    return tag.resize((tag.width * scale, tag.height * scale), Image.NEAREST)


def paste_centered(canvas, image, center_x, top):
    canvas.alpha_composite(image, (round(center_x - image.width / 2), round(top)))


def max_cape_file():
    """The Max cape isn't Melvor gear, so the character mod doesn't export it; build its item file with that mod's own build code."""
    spec = importlib.util.spec_from_file_location("character_build", CHARACTER / "build" / "build.py")
    character_build = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(character_build)
    cache = character_build.Cache(character_build.CACHE)
    items = cache.files(character_build.osrs_defs.CONFIGS, character_build.osrs_defs.ITEM_GROUP)
    return character_build.item_file(cache, character_build.osrs_defs.item(items[MAX_CAPE]), {})


def with_max_cape(test_data):
    def load(items, pose):
        data = test_data([item for item in items if item != MAX_CAPE], pose)
        cape = max_cape_file()
        data["items"][MAX_CAPE] = cape["item"]
        data["models"].update(cape["models"])
        return data
    return load


def character():
    """The outfit mid-slash, facing right, rendered with a transparent background."""
    OUT.mkdir(parents=True, exist_ok=True)
    page = OUT / "character.html"
    preview.test_data = with_max_cape(preview.test_data)
    page.write_text(preview.page(OUTFIT, FACING_RIGHT, 96, False, 300, 600, "transparent", pose=SLASH_POSE, frame=SLASH_FRAME))
    shot = OUT / "character.png"
    shot.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as profile:
        chrome = subprocess.Popen([preview.CHROME, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars",
                                   "--no-first-run", "--force-device-scale-factor=2", "--use-mock-keychain", "--password-store=basic",
                                   "--allow-file-access-from-files", f"--user-data-dir={profile}", "--default-background-color=00000000",
                                   "--virtual-time-budget=5000", "--window-size=300,600", f"--screenshot={shot}", page.as_uri()],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(160):
            if shot.exists() and shot.stat().st_size > 0:
                time.sleep(0.5)
                break
            time.sleep(0.25)
        chrome.kill()
        chrome.wait()
    image = Image.open(shot).convert("RGBA")
    return image.crop(image.getbbox())


def backdrop():
    login = Image.open(THEME_IMAGES / "login.jpg").convert("RGB")
    scale = max(SIZE[0] / login.width, SIZE[1] / login.height)
    login = login.resize((round(login.width * scale), round(login.height * scale)), Image.LANCZOS)
    left, top = (login.width - SIZE[0]) // 2, (login.height - SIZE[1]) // 2
    return ImageEnhance.Brightness(login.crop((left, top, left + SIZE[0], top + SIZE[1]))).enhance(0.62).convert("RGBA")


LOGIN_ART = {"width": 1089, "height": 503, "rim_y": 266, "brazier_x": [205, 884], "bowl_width": 120}
FIRE_HIDDEN_ROWS = 8


def fire_frame():
    """One frame of the theme's login-screen brazier fire, run with the theme's own simulation."""
    result = subprocess.run(["node", str(ROOT / "dev" / "fire_frame.mjs")], capture_output=True, text=True, check=True)
    frame = json.loads(result.stdout)
    return Image.frombytes("RGBA", (frame["width"], frame["height"]), base64.b64decode(frame["rgba"]))


def add_brazier_fires(canvas):
    """Lights both braziers of the login art, placed the way the theme's login scene places its fire canvases."""
    scale = max(SIZE[0] / LOGIN_ART["width"], SIZE[1] / LOGIN_ART["height"])
    left = (SIZE[0] - LOGIN_ART["width"] * scale) / 2
    top = (SIZE[1] - LOGIN_ART["height"] * scale) / 2
    width = LOGIN_ART["bowl_width"] * scale
    for brazier_x in LOGIN_ART["brazier_x"]:
        fire = fire_frame()
        height = width * fire.height / fire.width
        fire = fire.resize((round(width), round(height)), Image.BILINEAR)
        x = left + brazier_x * scale - width / 2
        y = top + LOGIN_ART["rim_y"] * scale - height + FIRE_HIDDEN_ROWS * height / fire.height - 3 * scale
        canvas.alpha_composite(fire, (round(x), round(y)))


def shadow(canvas, image, x, y, blur_scale=0.6):
    from PIL import ImageFilter
    layer = Image.new("RGBA", canvas.size)
    silhouette = Image.new("RGBA", image.size, (0, 0, 0, 150))
    layer.paste(silhouette, (x, y + 6), image)
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(10 * blur_scale)))


def draw_logo():
    logo = backdrop()
    add_brazier_fires(logo)

    card = Image.open(THEME_IMAGES / "titlebox.png").convert("RGBA")
    card = card.resize((600, round(600 * card.height / card.width)), Image.LANCZOS)
    card_x, card_y = (SIZE[0] - card.width) // 2, 16
    shadow(logo, card, card_x, card_y)
    logo.alpha_composite(card, (card_x, card_y))
    center = SIZE[0] // 2
    first_line, second_line = text_tag("OSRS", TITLE_SCALE, YELLOW), text_tag("OVERHAUL", TITLE_SCALE, YELLOW)
    gap = 26
    title_top = card_y + (card.height - first_line.height - gap - second_line.height) // 2
    paste_centered(logo, first_line, center, title_top)
    paste_centered(logo, second_line, center, title_top + first_line.height + gap)

    giant = build.wiki_image("File:Hill Giant.png")
    giant = giant.resize((round(giant.width * 560 / giant.height), 560), Image.LANCZOS)
    giant_x = SIZE[0] - giant.width - 30
    shadow(logo, giant, giant_x, SIZE[1] - giant.height - 14)
    logo.alpha_composite(giant, (giant_x, SIZE[1] - giant.height - 14))

    hero = character()
    hero = hero.resize((round(hero.width * 480 / hero.height), 480), Image.LANCZOS)
    hero_x = 24
    shadow(logo, hero, hero_x, SIZE[1] - hero.height - 18)
    logo.alpha_composite(hero, (hero_x, SIZE[1] - hero.height - 18))

    splat = Image.open(THEME_IMAGES / "hitsplat-max-hit.png").convert("RGBA")
    splat = splat.resize((splat.width * 4, splat.height * 4), Image.NEAREST)
    splat_x, splat_y = giant_x + giant.width // 2 - splat.width // 2 - 20, SIZE[1] - giant.height + 150
    logo.alpha_composite(splat, (splat_x, splat_y))
    number = text_tag("47", 4, WHITE)
    logo.alpha_composite(number, (splat_x + (splat.width - number.width) // 2, splat_y + (splat.height - number.height) // 2))

    badges_center = SIZE[0] // 2
    first = badges_center - BADGE_SPACING * (len(BADGES) - 1) / 2
    for i, (repo, label) in enumerate(BADGES):
        icon = Image.open(PROJECTS / repo / "mod" / "icon.png").convert("RGBA")
        icon = icon.crop(icon.getbbox())
        if icon.height > 58:
            icon = icon.resize((round(icon.width * 58 / icon.height), 58), Image.NEAREST)
        badge_x = first + i * BADGE_SPACING
        paste_centered(logo, icon, badge_x, card_y + card.height + 92 - icon.height)
        paste_centered(logo, text_tag(label, 2, YELLOW), badge_x, card_y + card.height + 102)

    x = giant_x - 290
    for name in LOOT:
        item = Image.open(SPRITES / name).convert("RGBA")
        item = item.crop(item.getbbox())
        logo.alpha_composite(item, (x, SIZE[1] - 30 - item.height))
        x += item.width + 4
    return logo


def main():
    out = ROOT / "dist" / "logo.png"
    out.parent.mkdir(exist_ok=True)
    draw_logo().convert("RGB").save(out, optimize=True)
    print(out)


if __name__ == "__main__":
    main()
