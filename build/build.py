"""Build the Active First mod: fetch the icon from the OSRS Wiki, draw the mod.io logo, and zip mod/."""
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
USER_AGENT = "melvor-active-first/0.1 (personal Melvor Idle mod build)"
ICON = "File:Yellow arrow map marker.png"
ACTIVE = "Willow logs"
OTHERS = ["Logs", "Oak logs", "Teak logs", "Maple logs", "Mahogany logs"]
BACKGROUND = (36, 31, 26, 255)
PANEL = (52, 45, 36, 255)
ROW = (62, 53, 41, 255)
HEADING = (150, 138, 115, 255)
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
    """A skill page: the card in use moved to the front, ahead of the rest of the cards."""
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

    def card(x, y, name, active):
        pen.rectangle((x, y, x + 150, y + 150), fill=ROW, outline=YELLOW if active else PANEL, width=5)
        icon = scaled(wiki_image(f"File:{name}.png"), 3)
        logo.alpha_composite(icon, (x + (150 - icon.width) // 2, y + (150 - icon.height) // 2))

    left, top = 60, 60
    pen.rectangle((left, top, left + 520, 660), fill=PANEL)
    text("ACTIVE", left + 24, top + 22, 3, HEADING)
    card(left + 20, top + 64, ACTIVE, True)
    for i, name in enumerate(OTHERS):
        card(left + 20 + (i % 3) * 165, top + 250 + (i // 3) * 165, name, False)
    text("ACTIVE", 640, 250, 9, YELLOW)
    text("FIRST", 640, 350, 9, YELLOW)
    text("The card you are using", 644, 460, 3, ORANGE)
    text("moves to the front", 644, 500, 3, ORANGE)
    return logo


def main():
    square(scaled(wiki_image(ICON), 2)).save(MOD_DIR / "icon.png")
    DIST_DIR.mkdir(exist_ok=True)
    draw_logo().convert("RGB").save(DIST_DIR / "logo.png", optimize=True)
    archive = DIST_DIR / "melvor-active-first.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    print(f"{archive} ({archive.stat().st_size / 1e3:.1f} KB), logo {DIST_DIR / 'logo.png'}")


if __name__ == "__main__":
    main()
