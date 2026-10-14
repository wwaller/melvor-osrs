"""Build the Better Mobile Combat UI mod: fetch the icon from the OSRS Wiki, draw the mod.io logo, and zip mod/."""
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
USER_AGENT = "melvor-better-mobile-combat-ui/0.1 (personal Melvor Idle mod build)"
ICON = "File:Combat icon.png"
CORNER = ["Combat icon", "Prayer icon", "Magic icon", "Slayer icon"]
BACKGROUND = (36, 31, 26, 255)
PANEL = (52, 45, 36, 255)
ROW = (62, 53, 41, 255)
HEADING = (150, 138, 115, 255)
YELLOW = (255, 255, 0, 255)
ORANGE = (255, 152, 31, 255)
GREEN = (48, 160, 80, 255)


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
    """A phone combat page: the corner buttons stacked bottom right, and the Start Last Target button."""
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

    left, top = 80, 60
    pen.rectangle((left, top, left + 380, 660), fill=PANEL)
    pen.rectangle((left + 20, top + 20, left + 360, top + 120), fill=GREEN)
    text("START LAST", left + 60, top + 50, 4, (255, 255, 255, 255))
    for i, name in enumerate(CORNER):
        y = top + 200 + i * 100
        pen.rectangle((left + 270, y, left + 360, y + 90), fill=ROW, outline=HEADING, width=3)
        icon = scaled(wiki_image(f"File:{name}.png"), 2)
        logo.alpha_composite(icon, (left + 315 - icon.width // 2, y + 45 - icon.height // 2))
    text("BETTER", 560, 200, 9, YELLOW)
    text("MOBILE", 560, 300, 9, YELLOW)
    text("COMBAT UI", 560, 400, 9, YELLOW)
    text("Combat in thumb reach", 564, 520, 3, ORANGE)
    return logo


def main():
    square(scaled(wiki_image(ICON), 2)).save(MOD_DIR / "icon.png")
    DIST_DIR.mkdir(exist_ok=True)
    draw_logo().convert("RGB").save(DIST_DIR / "logo.png", optimize=True)
    archive = DIST_DIR / "melvor-better-mobile-combat-ui.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    print(f"{archive} ({archive.stat().st_size / 1e3:.1f} KB), logo {DIST_DIR / 'logo.png'}")


if __name__ == "__main__":
    main()
