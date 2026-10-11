"""Build the Keep Screen On mod: fetch the icon from the OSRS Wiki, draw the mod.io logo, and zip mod/."""
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
USER_AGENT = "melvor-keep-screen-on/0.1 (personal Melvor Idle mod build)"
ICON = "File:Bullseye lantern (lit).png"
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


def draw_logo(lantern):
    logo = Image.new("RGBA", (1280, 720), BACKGROUND)
    big = scaled(lantern, 9)
    logo.alpha_composite(big, (190 - big.width // 2, (720 - big.height) // 2))
    font = ImageFont.load_default_imagefont()

    def text(line, x, y, scale, fill):
        left, top, right, bottom = font.getbbox(line)
        tag = Image.new("RGBA", (right - left + 1, bottom - top + 1))
        pen = ImageDraw.Draw(tag)
        pen.text((1 - left, 1 - top), line, font=font, fill=(0, 0, 0, 255))
        pen.text((-left, -top), line, font=font, fill=fill)
        logo.alpha_composite(scaled(tag, scale), (x, y))

    text("KEEP SCREEN ON", 400, 270, 9, YELLOW)
    text("Stops your screen from locking", 404, 380, 3, ORANGE)
    text("while Melvor Idle is open", 404, 420, 3, ORANGE)
    return logo


def main():
    lantern = wiki_image(ICON)
    scaled(lantern, 2).save(MOD_DIR / "icon.png")
    DIST_DIR.mkdir(exist_ok=True)
    draw_logo(lantern).convert("RGB").save(DIST_DIR / "logo.png", optimize=True)
    archive = DIST_DIR / "melvor-keep-screen-on.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    print(f"{archive} ({archive.stat().st_size / 1e3:.1f} KB), logo {DIST_DIR / 'logo.png'}")


if __name__ == "__main__":
    main()
