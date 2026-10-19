"""Build the OSRS Theme mod: recolour Melvor's stylesheets into an OSRS palette and zip mod/."""
import colorsys
import io
import json
import re
import shutil
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image, ImageColor, ImageDraw, ImageFilter, ImageFont

from osrs_cache import Cache

ROOT = Path(__file__).resolve().parent.parent
MOD_DIR = ROOT / "mod"
DIST_DIR = ROOT / "dist"
CACHE = ROOT / "build" / ".cache"
GAME_URL = "https://steam.melvoridle.com/"
STYLESHEETS = ["assets/css/oneui.css", "assets/css/themes/amethyst.min.css", "assets/css/game.css"]
WIKI_API = "https://oldschool.runescape.wiki/api.php"
USER_AGENT = "melvor-osrs-theme/0.1 (personal Melvor Idle mod build)"
ICON = "File:Settings.png"
SCOPE = "html body.osrs-theme"
COLOR_PROPERTIES = re.compile(r"^(color|background-color|background|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|box-shadow|fill|stroke|text-decoration-color|caret-color)$")
COLOR_NAMES = "|".join(sorted(ImageColor.colormap, key=len, reverse=True))
COLOR_TOKEN = re.compile(rf"#[0-9a-fA-F]{{3,8}}\b|rgba?\([^)]*\)|\b(?:{COLOR_NAMES})\b", re.I)
NEUTRAL_HUE = 34
HUES = [
    ((15, 70), 32, 0.95),
    ((70, 170), 105, 0.4),
    ((170, 235), 200, 0.42),
    ((235, 320), 40, 0.58),
]
RED = (2, 0.72)
ACCENT_DARKEN = 0.88
GREEN_DARKEN = 0.78
HITSPLATS = {
    "damage": "File:Damage hitsplat.png", "max-hit": "File:Damage hitsplat (max hit).png", "tinted": "File:Damage hitsplat (tinted).png",
    "zero": "File:Zero damage hitsplat.png", "poison": "File:Poison hitsplat.png", "venom": "File:Venom hitsplat.png",
    "burn": "File:Burn hitsplat.png", "bleed": "File:Bleed hitsplat.png", "heal": "File:Heal hitsplat.png",
    "corruption": "File:Corruption hitsplat.png",
}
LOGIN_BACKGROUND = "File:Login background mobile (original).png"
RECIPE_BOOK = "File:Pie recipe book.png"
LOGIN_SPRITES = {"titlebox": 499, "titlebutton": 2135}
# Skills tab stones: left half and right half with the slash, as RuneLite's STATS_TILE sprites.
SKILL_STONES = {"skill-stone": (174, 175), "skill-stone-selected": (177, 182), "skill-stone-plain": (174, 176)}
STONE_LEFT_BOX = (2, 2, 33, 34)
STONE_RIGHT_BOX = (3, 2, 34, 34)
GAME_BACKGROUNDS = {
    "lumbridge": ("File:Lumbridge.png", "Lumbridge", "day"),
    "varrock": ("File:Varrock.png", "Varrock", "day"),
    "falador-park": ("File:Falador Park.png", "Falador Park", "day"),
    "seers-village": ("File:Seers Village.png", "Seers' Village", "day"),
    "catherby": ("File:Catherby.png", "Catherby", "day"),
    "karamja": ("File:Karamja.png", "Karamja", "day"),
    "al-kharid": ("File:Al Kharid.png", "Al Kharid", "day"),
    "wilderness": ("File:Wilderness.png", "The Wilderness", "dusk"),
    "canifis": ("File:Canifis.png", "Canifis", "night"),
    "zanaris": ("File:Zanaris.png", "Zanaris", "day"),
    "fossil-island": ("File:Mushroom Forest.png", "Fossil Island", "day"),
    "grand-exchange": ("File:Grand Exchange.png", "Grand Exchange", "day"),
}
SKIES = {"day": ((104, 140, 178), (188, 204, 214)), "dusk": ((58, 48, 70), (142, 112, 108)), "night": ((14, 22, 30), (52, 72, 66))}
VOID_LIGHTNESS = 6
VOID_MIN_SIZE = 5
GAME_BACKGROUND_WIDTH = 1440
GAME_BACKGROUND_THUMB_WIDTH = 384
SLAYER_MASTERS = ["Turael", "Krystilia", "Mazchna", "Vannaka", "Nieve", "Duradel", "Mortimer"]
SLAYER_MASTER_HEIGHT = 360
FONTS_URL = "https://github.com/RuneStar/fonts/releases/download/1.103-0/RuneScape-Fonts.zip"
FONTS = ["RuneScape-Plain-11", "RuneScape-Plain-12", "RuneScape-Bold-12"]
STONE_SIZE = 128
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


def parse_color(token):
    if token.lower() in ImageColor.colormap:
        return (*ImageColor.getrgb(token.lower())[:3], None)
    if token.startswith("#"):
        digits = token[1:]
        if len(digits) in (3, 4):
            digits = "".join(c * 2 for c in digits)
        alpha = int(digits[6:8], 16) / 255 if len(digits) == 8 else None
        return int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16), alpha
    parts = [p.strip() for p in re.split(r"[,\s/]+", token[token.index("(") + 1:-1]) if p.strip()]
    if len(parts) < 3 or any(p.endswith("%") for p in parts[:3]):
        return None
    alpha = float(parts[3].rstrip("%")) / (100 if parts[3].endswith("%") else 1) if len(parts) > 3 else None
    return int(float(parts[0])), int(float(parts[1])), int(float(parts[2])), alpha


def osrs_color(red, green, blue):
    hue, lightness, saturation = colorsys.rgb_to_hls(red / 255, green / 255, blue / 255)
    degrees = hue * 360
    if saturation < 0.3 or lightness < 0.06 or lightness > 0.98:
        target_hue = NEUTRAL_HUE
        target_saturation = 0.16 + 0.32 * max(0.0, (lightness - 0.45) / 0.55)
        lightness = 0.04 + lightness * 0.95
    elif degrees >= 320 or degrees < 15:
        target_hue, target_saturation = RED
        lightness *= ACCENT_DARKEN
    else:
        target_hue, target_saturation = next((h, s) for (low, high), h, s in HUES if low <= degrees < high)
        if 70 <= degrees < 170:
            lightness *= GREEN_DARKEN
    r, g, b = colorsys.hls_to_rgb(target_hue / 360, lightness, target_saturation)
    return round(r * 255), round(g * 255), round(b * 255)


def remap_token(token):
    parsed = parse_color(token)
    if parsed is None:
        return token
    red, green, blue, alpha = parsed
    r, g, b = osrs_color(red, green, blue)
    if alpha is None:
        return f"#{r:02x}{g:02x}{b:02x}"
    return f"rgba({r}, {g}, {b}, {alpha:.3g})"


def split_outside_parens(text, separator):
    parts, depth, start = [], 0, 0
    for index, char in enumerate(text):
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        elif char == separator and depth == 0:
            parts.append(text[start:index])
            start = index + 1
    parts.append(text[start:])
    return parts


def parse_blocks(css):
    blocks, index = [], 0
    while True:
        open_brace = css.find("{", index)
        if open_brace < 0:
            return blocks
        prelude = re.sub(r"@[^{;]*;", "", css[index:open_brace]).strip()
        depth, end = 1, open_brace + 1
        while depth:
            depth += {"{": 1, "}": -1}.get(css[end], 0)
            end += 1
        body = css[open_brace + 1:end - 1]
        if prelude.startswith(("@media", "@supports")):
            blocks.append((prelude, parse_blocks(body)))
        elif not prelude.startswith("@"):
            blocks.append((prelude, body))
        index = end


def recolor_declarations(body):
    out = []
    for declaration in split_outside_parens(body, ";"):
        if ":" not in declaration:
            continue
        name, value = declaration.split(":", 1)
        name, value = name.strip().lower(), value.strip()
        if not COLOR_PROPERTIES.match(name) or not COLOR_TOKEN.search(value):
            continue
        if "url(" in value:
            colors = COLOR_TOKEN.findall(value)
            if not name.startswith("background"):
                continue
            name, value = "background-color", colors[-1] + (" !important" if "!important" in value else "")
        out.append(f"{name}:{COLOR_TOKEN.sub(lambda m: remap_token(m.group(0)), value)}")
    return ";".join(out)


def scoped(selector):
    selector = selector.strip()
    if selector.startswith((":root", "html")):
        head, _, rest = selector.partition(" ")
        return f"{head}:has(> body.osrs-theme) {rest}".strip()
    if selector.startswith("body"):
        return SCOPE + selector[len("body"):]
    return f"{SCOPE} {selector}"


def recolor(blocks):
    out = []
    for prelude, body in blocks:
        if isinstance(body, list):
            inner = recolor(body)
            if inner:
                out.append(f"{prelude}{{{inner}}}")
            continue
        declarations = recolor_declarations(re.sub(r"/\*.*?\*/", "", body, flags=re.S))
        selectors = [s for s in (scoped(part) for part in split_outside_parens(prelude, ",")) if s]
        if declarations and selectors:
            out.append(f"{','.join(selectors)}{{{declarations}}}")
    return "\n".join(out)


def build_theme():
    sheets = []
    for sheet in STYLESHEETS:
        css = re.sub(r"/\*.*?\*/", "", fetch(GAME_URL + sheet).decode("utf-8", "replace"), flags=re.S)
        sheets.append(f"/* {sheet} */\n" + recolor(parse_blocks(css)))
    return "\n".join(sheets) + "\n" + (ROOT / "build" / "extras.css").read_text()


def wiki_image(title):
    query = urllib.parse.urlencode({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url", "format": "json", "formatversion": "2"})
    page = json.loads(fetch(f"{WIKI_API}?{query}"))["query"]["pages"][0]
    return Image.open(io.BytesIO(fetch(page["imageinfo"][0]["url"]))).convert("RGBA")


def stone_texture():
    coarse = Image.effect_noise((STONE_SIZE, STONE_SIZE), 70).convert("L")
    tiled = Image.new("L", (STONE_SIZE * 3, STONE_SIZE * 3))
    for x in range(3):
        for y in range(3):
            tiled.paste(coarse, (x * STONE_SIZE, y * STONE_SIZE))
    coarse = tiled.filter(ImageFilter.GaussianBlur(5)).crop((STONE_SIZE, STONE_SIZE, STONE_SIZE * 2, STONE_SIZE * 2))
    grain = Image.effect_noise((STONE_SIZE, STONE_SIZE), 30).convert("L")
    mixed = Image.blend(coarse, grain, 0.35)
    texture = Image.new("RGBA", mixed.size)
    texture.putdata([(255, 236, 200, min(40, (v - 128) // 2)) if v > 128 else (0, 0, 0, min(60, (128 - v) * 2 // 3)) for v in mixed.tobytes()])
    return texture


def scaled(image, scale):
    return image.resize((image.width * scale, image.height * scale), Image.NEAREST)


def draw_logo(icon, titlebox):
    logo = Image.new("RGBA", (1280, 720), BACKGROUND)
    card = scaled(titlebox, 3)
    card_x, card_y = (logo.width - card.width) // 2, (logo.height - card.height) // 2
    shadow = Image.new("RGBA", logo.size)
    shadow.paste((0, 0, 0, 153), (card_x, card_y + 6), card)
    logo.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(12)))
    logo.alpha_composite(card, (card_x, card_y))
    big = scaled(icon, 9)
    logo.alpha_composite(big, (316 - big.width // 2, (720 - big.height) // 2))
    font = ImageFont.load_default_imagefont()

    def text(line, x, y, scale, fill):
        left, top, right, bottom = font.getbbox(line)
        tag = Image.new("RGBA", (right - left + 1, bottom - top + 1))
        pen = ImageDraw.Draw(tag)
        pen.text((1 - left, 1 - top), line, font=font, fill=(0, 0, 0, 255))
        pen.text((-left, -top), line, font=font, fill=fill)
        logo.alpha_composite(scaled(tag, scale), (x, y))

    text("OSRS THEME", 526, 270, 9, YELLOW)
    text("Old School RuneScape colours", 530, 380, 3, ORANGE)
    text("for Melvor Idle", 530, 420, 3, ORANGE)
    return logo


def fill_void(art, sky):
    # OSRS screenshots have black sky and gaps past the view distance; paint sky into black areas too big to be outlines
    black = art.convert("L").point(lambda value: 255 if value < VOID_LIGHTNESS else 0)
    mask = black.filter(ImageFilter.MinFilter(VOID_MIN_SIZE)).filter(ImageFilter.MaxFilter(VOID_MIN_SIZE)).filter(ImageFilter.GaussianBlur(0.8))
    top, horizon = SKIES[sky]
    gradient = Image.new("RGB", (1, art.height))
    for y in range(art.height):
        mix = min(1, y / (art.height * 0.6))
        gradient.putpixel((0, y), tuple(round(a + (b - a) * mix) for a, b in zip(top, horizon)))
    return Image.composite(gradient.resize(art.size), art, mask)


def write_game_backgrounds(images):
    folder = images / "backgrounds"
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir()
    for key, (title, _label, sky) in GAME_BACKGROUNDS.items():
        art = fill_void(wiki_image(title).convert("RGB"), sky)
        if art.width > GAME_BACKGROUND_WIDTH:
            art = art.resize((GAME_BACKGROUND_WIDTH, round(art.height * GAME_BACKGROUND_WIDTH / art.width)), Image.LANCZOS)
        art.save(folder / f"{key}.jpg", quality=82, optimize=True)
        thumb = art.resize((GAME_BACKGROUND_THUMB_WIDTH, round(art.height * GAME_BACKGROUND_THUMB_WIDTH / art.width)), Image.LANCZOS)
        thumb.save(folder / f"{key}-thumb.jpg", quality=82, optimize=True)
    (images / "backgrounds.json").write_text(json.dumps([{"key": key, "label": label} for key, (_title, label, _sky) in GAME_BACKGROUNDS.items()]))


def write_slayer_masters(images):
    folder = images / "slayer"
    shutil.rmtree(folder, ignore_errors=True)
    folder.mkdir()
    for name in SLAYER_MASTERS:
        art = wiki_image(f"File:{name}.png")
        art = art.crop(art.getbbox())
        art = art.resize((round(art.width * SLAYER_MASTER_HEIGHT / art.height), SLAYER_MASTER_HEIGHT), Image.LANCZOS)
        art.save(folder / f"{name.lower()}.png", optimize=True)

def main():
    MOD_DIR.mkdir(exist_ok=True)
    theme = build_theme()
    (MOD_DIR / "theme.css").write_text(theme)
    icon = wiki_image(ICON)
    scaled(icon, 2).save(MOD_DIR / "icon.png")
    images = MOD_DIR / "img"
    images.mkdir(exist_ok=True)
    for name, title in HITSPLATS.items():
        wiki_image(title).save(images / f"hitsplat-{name}.png")
    wiki_image(LOGIN_BACKGROUND).convert("RGB").save(images / "login.jpg", quality=82, optimize=True)
    wiki_image(RECIPE_BOOK).save(images / "recipe-book.png", optimize=True)
    write_game_backgrounds(images)
    write_slayer_masters(images)
    stone_texture().save(images / "stone.png", optimize=True)
    fonts = MOD_DIR / "fonts"
    fonts.mkdir(exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(fetch(FONTS_URL))) as bundle:
        for name in FONTS:
            (fonts / f"{name}.ttf").write_bytes(bundle.read(f"ttf/{name}.ttf"))
    cache = Cache(CACHE)
    for name, sprite_id in LOGIN_SPRITES.items():
        cache.sprites(sprite_id)[0].save(images / f"{name}.png", optimize=True)
    for name, (left_id, right_id) in SKILL_STONES.items():
        left = cache.sprites(left_id)[0].crop(STONE_LEFT_BOX)
        right = cache.sprites(right_id)[0].crop(STONE_RIGHT_BOX)
        stone = Image.new("RGBA", (left.width + right.width, left.height))
        stone.paste(left, (0, 0))
        stone.paste(right, (left.width, 0))
        stone.save(images / f"{name}.png", optimize=True)
    DIST_DIR.mkdir(exist_ok=True)
    draw_logo(icon, Image.open(images / "titlebox.png").convert("RGBA")).convert("RGB").save(DIST_DIR / "logo.png", optimize=True)
    archive = DIST_DIR / "melvor-osrs-theme.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(MOD_DIR.rglob("*")):
            if path.is_file() and not any(part.startswith(".") for part in path.relative_to(MOD_DIR).parts):
                bundle.write(path, path.relative_to(MOD_DIR).as_posix())
    rules = theme.count("{")
    print(f"theme.css {len(theme) / 1e3:.0f} KB, {rules} rules; {archive} ({archive.stat().st_size / 1e3:.0f} KB)")


if __name__ == "__main__":
    main()
