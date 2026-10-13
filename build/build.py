"""Build the Skill Switcher mod: fetch the icon from the OSRS Wiki, draw the mod.io logo, and zip mod/."""
import io
import json
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
MOD_DIR = ROOT / "mod"
DIST_DIR = ROOT / "dist"
CACHE = ROOT / "build" / ".cache"
API_URL = "https://oldschool.runescape.wiki/api.php"
USER_AGENT = "melvor-skill-switcher/0.1 (personal Melvor Idle mod build)"
ICON = "File:Stats icon.png"
SKILLS = ["Attack", "Woodcutting", "Fishing", "Mining", "Smithing", "Cooking", "Firemaking", "Crafting", "Fletching", "Herblore",
          "Thieving", "Agility", "Runecraft", "Farming", "Prayer"]
ACTIVE = "Woodcutting"
BACKGROUND = (36, 31, 26, 255)
SLOT = (62, 53, 41, 255)
SLOT_EDGE = (92, 80, 62, 255)
GREEN = (48, 192, 96, 255)
YELLOW = (255, 255, 0, 255)
ORANGE = (255, 152, 31, 255)


def fetch(url):
    path = CACHE / urllib.parse.quote(url, safe="")[:200]
    if not path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    return path.read_bytes()


def wiki_image(title):
    query = urllib.parse.urlencode({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url", "format": "json", "formatversion": "2"})
    page = json.loads(fetch(f"{API_URL}?{query}"))["query"]["pages"][0]
    return Image.open(io.BytesIO(fetch(page["imageinfo"][0]["url"]))).convert("RGBA")


def scaled(image, scale):
    return image.resize((image.width * scale, image.height * scale), Image.NEAREST)


def square(image):
    """Melvor draws mod icons in a square box: centre the art on a transparent square so it is not stretched."""
    side = max(image.size)
    canvas = Image.new("RGBA", (side, side))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def draw_logo():
    """The flyout as the art: a grid of skill icons with the active one outlined green."""
    logo = Image.new("RGBA", (1280, 720), BACKGROUND)
    pen = ImageDraw.Draw(logo)
    cell, gap, left, top = 96, 12, 60, 102
    for n, skill in enumerate(SKILLS):
        x, y = left + (n % 3) * (cell + gap), top + (n // 3) * (cell + gap)
        pen.rectangle((x, y, x + cell, y + cell), fill=SLOT, outline=GREEN if skill == ACTIVE else SLOT_EDGE, width=4)
        icon = scaled(wiki_image(f"File:{skill} icon.png"), 3)
        logo.alpha_composite(icon, (x + (cell - icon.width) // 2, y + (cell - icon.height) // 2))
    font = ImageFont.load_default_imagefont()

    def text(line, x, y, scale, fill):
        bounds = font.getbbox(line)
        tag = Image.new("RGBA", (bounds[2] - bounds[0] + 1, bounds[3] - bounds[1] + 1))
        draw = ImageDraw.Draw(tag)
        draw.text((1 - bounds[0], 1 - bounds[1]), line, font=font, fill=(0, 0, 0, 255))
        draw.text((-bounds[0], -bounds[1]), line, font=font, fill=fill)
        logo.alpha_composite(scaled(tag, scale), (x, y))

    text("SKILL", 460, 250, 9, YELLOW)
    text("SWITCHER", 460, 350, 9, YELLOW)
    text("Jump to any skill from", 464, 460, 3, ORANGE)
    text("the bottom right corner", 464, 500, 3, ORANGE)
    return logo


def main():
    square(scaled(wiki_image(ICON), 2)).save(MOD_DIR / "icon.png")
    DIST_DIR.mkdir(exist_ok=True)
    draw_logo().convert("RGB").save(DIST_DIR / "logo.png", optimize=True)
    archive = DIST_DIR / "melvor-skill-switcher.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    print(f"{archive} ({archive.stat().st_size / 1e3:.1f} KB), logo {DIST_DIR / 'logo.png'}")


if __name__ == "__main__":
    main()
