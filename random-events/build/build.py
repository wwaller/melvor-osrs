"""Build the OSRS Random Events mod: fetch the chatheads, icon and fonts, draw the mod.io logo, and zip mod/."""
import io
import json
import math
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
USER_AGENT = "melvor-osrs-random-events/0.1 (personal Melvor Idle mod build)"
FONTS_URL = "https://github.com/RuneStar/fonts/releases/download/1.103-0/RuneScape-Fonts.zip"
FONTS = ["RuneScape-Plain-12", "RuneScape-Bold-12"]
CHATHEADS = {
    "sandwich-lady": "File:Sandwich lady chathead.png",
    "genie": "File:Genie chathead.png",
    "frog": "File:Frog (Kiss the frog) chathead.png",
    "frog-crowned": "File:Frog (Kiss the frog, crown) chathead.png",
    "frog-prince": "File:Frog Prince chathead.png",
    "frog-princess": "File:Frog Princess chathead.png",
    "niles": "File:Niles chathead.png",
    "miles": "File:Miles chathead.png",
    "giles": "File:Giles chathead.png",
    "flippa": "File:Flippa chathead.png",
    "sergeant-damien": "File:Sergeant Damien chathead.png",
    "quiz-master": "File:Quiz Master chathead.png",
    "pillory-guard": "File:Pillory Guard chathead.png",
}
POND = {"frog": "File:Frog (Kiss the frog).png", "frog-crowned": "File:Frog (Kiss the frog, crown).png"}
POND_SCALE = 96 / 1493
COSTUME = {
    "frog-mask": "File:Frog mask.png",
    "royal-frog-tunic": "File:Royal frog tunic.png",
    "royal-frog-leggings": "File:Royal frog leggings.png",
    "royal-frog-blouse": "File:Royal frog blouse.png",
    "royal-frog-skirt": "File:Royal frog skirt.png",
    "camo-top": "File:Camo top.png",
    "camo-helmet": "File:Camo helmet.png",
    "camo-bottoms": "File:Camo bottoms.png",
}
ITEM_CANVAS = 28
MIN_ICON_SIZE = 64
SIGNS = {
    "push-up": "File:Push up emote icon.png",
    "star-jump": "File:Star jump emote icon.png",
    "jog": "File:Jog emote icon.png",
    "sit-up": "File:Sit up emote icon.png",
}
ICON = "File:Lamp.png"
LOGO_ART = "File:Genie.png"
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


def crisp(image):
    """Pad an OSRS item icon to a square and scale it up with hard pixels, the same way the Sprites mod does."""
    image = image.crop(image.getbbox())
    side = max(ITEM_CANVAS, image.width, image.height)
    return scaled(square(image, side), math.ceil(MIN_ICON_SIZE / side))


def square(image, side=None):
    """Melvor draws mod icons in a square box: centre the art on a transparent square so it is not stretched."""
    side = side or max(image.size)
    canvas = Image.new("RGBA", (side, side))
    canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def draw_logo(genie):
    logo = Image.new("RGBA", (1280, 720), BACKGROUND)
    height = 640
    body = genie.resize((genie.width * height // genie.height, height), Image.LANCZOS)
    logo.alpha_composite(body, (290 - body.width // 2, (720 - height) // 2))
    font = ImageFont.load_default_imagefont()

    def text(line, left_edge, y, scale, fill):
        left, top, right, bottom = font.getbbox(line)
        tag = Image.new("RGBA", (right - left + 1, bottom - top + 1))
        pen = ImageDraw.Draw(tag)
        pen.text((1 - left, 1 - top), line, font=font, fill=(0, 0, 0, 255))
        pen.text((-left, -top), line, font=font, fill=fill)
        logo.alpha_composite(scaled(tag, scale), (left_edge, y))

    text("OSRS RANDOM EVENTS", 560, 250, 6, YELLOW)
    text("The Sandwich lady and the Genie", 564, 340, 3, ORANGE)
    text("visit about once a day", 564, 380, 3, ORANGE)
    return logo


def main():
    images = MOD_DIR / "img"
    images.mkdir(exist_ok=True)
    for name, title in CHATHEADS.items():
        wiki_image(title).save(images / f"{name}.png")
    for folder, files, convert in [
        ("pond", POND, lambda image: image.resize((round(image.width * POND_SCALE), round(image.height * POND_SCALE)), Image.LANCZOS)),
        ("costume", COSTUME, crisp),
        ("drill", SIGNS, lambda image: scaled(image, 2)),
    ]:
        (images / folder).mkdir(exist_ok=True)
        for name, title in files.items():
            convert(wiki_image(title)).save(images / folder / f"{name}.png")
    square(scaled(wiki_image(ICON), 3)).save(MOD_DIR / "icon.png")
    fonts = MOD_DIR / "fonts"
    fonts.mkdir(exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(fetch(FONTS_URL))) as bundle:
        for name in FONTS:
            (fonts / f"{name}.ttf").write_bytes(bundle.read(f"ttf/{name}.ttf"))
    DIST_DIR.mkdir(exist_ok=True)
    draw_logo(wiki_image(LOGO_ART)).convert("RGB").save(DIST_DIR / "logo.png", optimize=True)
    archive = DIST_DIR / "melvor-osrs-random-events.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    print(f"{archive} ({archive.stat().st_size / 1e3:.1f} KB), logo {DIST_DIR / 'logo.png'}")


if __name__ == "__main__":
    main()
