"""Build the Idle Guard mod: fetch the Varrock guard and the Pillory cage from the OSRS Wiki, draw the mod.io logo, and zip mod/."""
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
USER_AGENT = "melvor-idle-guard/0.1 (personal Melvor Idle mod build)"
GUARD = "File:Guard (Varrock, 1).png"
CHATHEAD = "File:Guard (Varrock, 1) chathead.png"
CAGE = "File:Cage (Pillory).png"
CAGE_WIDTH = 440
BACKGROUND = (36, 31, 26, 255)
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


def fit_height(image, height):
    return image.resize((round(image.width * height / image.height), height), Image.LANCZOS)


def draw_logo(guard):
    logo = Image.new("RGBA", (1280, 720), BACKGROUND)
    big = fit_height(guard, 660)
    logo.alpha_composite(big, (250 - big.width // 2, (720 - big.height) // 2))
    font = ImageFont.load_default_imagefont()

    def text(line, x, y, scale, fill):
        left, top, right, bottom = font.getbbox(line)
        tag = Image.new("RGBA", (right - left + 1, bottom - top + 1))
        pen = ImageDraw.Draw(tag)
        pen.text((1 - left, 1 - top), line, font=font, fill=(0, 0, 0, 255))
        pen.text((-left, -top), line, font=font, fill=fill)
        logo.alpha_composite(scaled(tag, scale), (x, y))

    text("IDLE GUARD", 500, 270, 10, YELLOW)
    text("Lock yourself out of Melvor Idle", 504, 390, 3, ORANGE)
    text("so the idle part stays idle", 504, 430, 3, ORANGE)
    return logo


def square(image):
    """Melvor draws mod icons in a square box: centre the art on a transparent square so it is not stretched."""
    side = max(image.size)
    canvas = Image.new("RGBA", (side, side))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def main():
    square(wiki_image(CHATHEAD)).save(MOD_DIR / "icon.png")
    cage = wiki_image(CAGE)
    cage.resize((CAGE_WIDTH, round(cage.height * CAGE_WIDTH / cage.width)), Image.LANCZOS).save(MOD_DIR / "cage.png", optimize=True)
    DIST_DIR.mkdir(exist_ok=True)
    draw_logo(wiki_image(GUARD)).convert("RGB").save(DIST_DIR / "logo.png", optimize=True)
    archive = DIST_DIR / "melvor-idle-guard.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    print(f"{archive} ({archive.stat().st_size / 1e3:.1f} KB), logo {DIST_DIR / 'logo.png'}")


if __name__ == "__main__":
    main()
