"""Build the Mobile Shop mod: fetch the icon from the OSRS Wiki, draw the mod.io logo, and zip mod/."""
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
USER_AGENT = "melvor-mobile-shop/0.1 (personal Melvor Idle mod build)"
ICON = "File:Coins 10000.png"
CARDS = ["Coins 10000", "Feather", "Bronze axe", "Leather", "Iron pickaxe", "Cheese"]
BACKGROUND = (29, 32, 38, 255)
CARD_LIGHT = (44, 48, 56, 255)
CARD_DARK = (54, 59, 68, 255)
BORDER = (82, 88, 98, 255)
WHITE = (234, 234, 234, 255)
GREEN = (60, 200, 110, 255)
YELLOW = (255, 220, 60, 255)


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
    """A phone-width column of shop cards, two to a row with rows alternating light and dark, beside the title."""
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

    left, top, width, height, gap = 60, 60, 220, 180, 16
    for index, name in enumerate(CARDS):
        row, column = divmod(index, 2)
        x, y = left + column * (width + gap), top + row * (height + gap)
        pen.rounded_rectangle((x, y, x + width, y + height), 10, fill=CARD_DARK if row % 2 else CARD_LIGHT, outline=BORDER, width=2)
        art = scaled(wiki_image(f"File:{name}.png"), 3)
        logo.alpha_composite(art, (x + (width - art.width) // 2, y + 18))
        text(name.upper(), x + 18, y + height - 54, 2, WHITE)
        text("100", x + 18, y + height - 30, 2, GREEN)
    text("MOBILE", 600, 230, 10, YELLOW)
    text("SHOP", 600, 340, 10, YELLOW)
    text("Compact shop cards for phones", 604, 460, 3, WHITE)
    return logo


def main():
    square(scaled(wiki_image(ICON), 2)).save(MOD_DIR / "icon.png")
    DIST_DIR.mkdir(exist_ok=True)
    draw_logo().convert("RGB").save(DIST_DIR / "logo.png", optimize=True)
    archive = DIST_DIR / "melvor-mobile-shop.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    print(f"{archive} ({archive.stat().st_size / 1e3:.1f} KB), logo {DIST_DIR / 'logo.png'}")


if __name__ == "__main__":
    main()
