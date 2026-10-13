"""Build the Unlearned Skills mod: fetch the icon from the OSRS Wiki, draw the mod.io logo, and zip mod/."""
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
USER_AGENT = "melvor-unlearned-skills/0.1 (personal Melvor Idle mod build)"
ICON = "File:Brass key.png"
LEARNED = ["Woodcutting", "Fishing", "Mining", "Cooking"]
UNLEARNED = ["Herblore", "Thieving", "Farming", "Agility"]
BACKGROUND = (36, 31, 26, 255)
PANEL = (52, 45, 36, 255)
ROW = (62, 53, 41, 255)
HEADING = (150, 138, 115, 255)
WHITE = (234, 223, 196, 255)
RED = (230, 72, 60, 255)
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
    """A sidebar with the learned skills up top and the locked ones gathered under an Unlearned heading."""
    logo = Image.new("RGBA", (1280, 720), BACKGROUND)
    pen = ImageDraw.Draw(logo)
    font = ImageFont.load_default_imagefont()

    def text(line, x, y, scale, fill):
        bounds = font.getbbox(line)
        tag = Image.new("RGBA", (bounds[2] - bounds[0] + 1, bounds[3] - bounds[1] + 1))
        draw = ImageDraw.Draw(tag)
        draw.text((1 - bounds[0], 1 - bounds[1]), line, font=font, fill=(0, 0, 0, 255))
        draw.text((-bounds[0], -bounds[1]), line, font=font, fill=fill)
        logo.alpha_composite(scaled(tag, scale), (x, y))

    left, top, width, row = 60, 50, 400, 62
    pen.rectangle((left, top, left + width, 670), fill=PANEL)
    y = top + 14
    for heading, skills, color in (("NON-COMBAT", LEARNED, WHITE), ("UNLEARNED", UNLEARNED, RED)):
        text(heading, left + 20, y, 3, HEADING)
        y += 44
        for skill in skills:
            pen.rectangle((left + 8, y, left + width - 8, y + row - 8), fill=ROW)
            icon = scaled(wiki_image(f"File:{skill} icon.png"), 2)
            logo.alpha_composite(icon, (left + 22, y + (row - 8 - icon.height) // 2))
            text(skill, left + 90, y + 16, 3, color)
            y += row
        y += 16
    key = scaled(wiki_image(ICON), 3)
    logo.alpha_composite(key, (left + width - 20 - key.width, top + 44 + 4 * row + 60 + (row - 8 - key.height) // 2))
    text("UNLEARNED", 520, 250, 9, YELLOW)
    text("SKILLS", 520, 350, 9, YELLOW)
    text("Locked skills get their own", 524, 460, 3, ORANGE)
    text("section in the sidebar", 524, 500, 3, ORANGE)
    return logo


def main():
    square(scaled(wiki_image(ICON), 2)).save(MOD_DIR / "icon.png")
    DIST_DIR.mkdir(exist_ok=True)
    draw_logo().convert("RGB").save(DIST_DIR / "logo.png", optimize=True)
    archive = DIST_DIR / "melvor-unlearned-skills.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    print(f"{archive} ({archive.stat().st_size / 1e3:.1f} KB), logo {DIST_DIR / 'logo.png'}")


if __name__ == "__main__":
    main()
