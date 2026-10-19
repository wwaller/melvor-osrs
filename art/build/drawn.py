"""Hand-drawn OSRS-style icons for Melvor art OSRS has no stand-in for: flat shapes shaded light to dark with a black outline, written to assets/drawn/."""
import colorsys
import io
import math
from pathlib import Path

from PIL import Image, ImageDraw

from images import tint
from wiki import Wiki

BUILD_DIR = Path(__file__).resolve().parent
OUT = BUILD_DIR / "assets" / "drawn"
SOURCES = OUT / "src"
OUTLINE = (0, 0, 0, 255)
GOLD = "#e0b020"
LAMP_GOLD = "#f2c84a"


def _hex(color):
    return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))


def shape(size, draw):
    """Pixels a drawing function fills on a hard-edged (non anti-aliased) canvas."""
    canvas = Image.new("1", size)
    draw(ImageDraw.Draw(canvas))
    pixels = canvas.load()
    return {(x, y) for y in range(size[1]) for x in range(size[0]) if pixels[x, y]}


def smooth(size, draw, k=8):
    """Pixels a shape covers at least half of, drawn at k times the size so circles and points come out even."""
    big = Image.new("L", (size[0] * k, size[1] * k))
    draw(ImageDraw.Draw(big), k)
    return covered(big, size)


def covered(image, size, threshold=128):
    small = image.convert("L").resize(size, Image.BOX)
    pixels = small.load()
    return {(x, y) for y in range(size[1]) for x in range(size[0]) if pixels[x, y] >= threshold}


def paint(image, mask, color, highlight=0.12, shadow=0.16):
    """Fill a mask the OSRS way: lighter toward the top left, darker toward the bottom right, a darker rim along the bottom and right edges."""
    if not mask:
        return image
    h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in _hex(color)))
    xs, ys = [x for x, _ in mask], [y for _, y in mask]
    x0, y0, span = min(xs), min(ys), max(1, max(xs) - min(xs) + max(ys) - min(ys))
    pixels = image.load()
    for x, y in mask:
        tone = l + highlight - (highlight + shadow) * ((x - x0) + (y - y0)) / span
        if (x + 1, y) not in mask or (x, y + 1) not in mask:
            tone -= 0.08
        elif (x - 1, y) not in mask or (x, y - 1) not in mask:
            tone += 0.06
        pixels[x, y] = tuple(round(v * 255) for v in colorsys.hls_to_rgb(h, min(1, max(0, tone)), s)) + (255,)
    return image


def outline(image):
    pixels = image.load()
    filled = {(x, y) for y in range(image.height) for x in range(image.width) if pixels[x, y][3]}
    for y in range(image.height):
        for x in range(image.width):
            if (x, y) not in filled and any((x + dx, y + dy) in filled for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                pixels[x, y] = OUTLINE
    return image


def layered(size, layers):
    """Layers are (mask or draw function, colour[, outlined]), painted in order."""
    image = Image.new("RGBA", size)
    for mask, color, *rest in layers:
        layer = paint(Image.new("RGBA", size), mask if isinstance(mask, set) else shape(size, mask), color)
        image.alpha_composite(outline(layer) if not rest or rest[0] else layer)
    return image.crop(image.getbbox())


def double_arrows():
    def draw(pen):
        pen.rectangle((11, 16, 14, 25), fill=1)
        pen.polygon([(11, 17), (14, 17), (8, 11), (5, 11)], fill=1)
        pen.polygon([(14, 17), (11, 17), (17, 11), (20, 11)], fill=1)
        pen.rectangle((5, 7, 8, 11), fill=1)
        pen.rectangle((17, 7, 20, 11), fill=1)
        pen.polygon([(2, 8), (11, 8), (6.5, 2)], fill=1)
        pen.polygon([(14, 8), (23, 8), (18.5, 2)], fill=1)
    return layered((26, 27), [(draw, "#48b038")])


def down_arrow():
    def draw(pen):
        pen.rectangle((3, 0, 6, 6), fill=1)
        pen.polygon([(0, 6), (9, 6), (4.5, 11)], fill=1)
    return layered((11, 13), [(draw, "#48b038")])


def cost_reduction(coins):
    arrow = down_arrow()
    canvas = Image.new("RGBA", (coins.width + 3, coins.height + 5))
    canvas.alpha_composite(coins, (0, 0))
    canvas.alpha_composite(arrow, (canvas.width - arrow.width, canvas.height - arrow.height))
    return canvas


def plus_from_checkmark(checkmark):
    """Repaints the checkmark's tick green and draws a white plus over it."""
    image = checkmark.copy()
    pixels = image.load()
    green = (107, 199, 31, 255)
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a and r > 130:
                pixels[x, y] = green
    pen = ImageDraw.Draw(image)
    middle = image.width // 2
    pen.rectangle((middle - 2, 7, middle + 1, image.height - 8), fill=(255, 255, 255, 255))
    pen.rectangle((7, middle - 2, image.width - 8, middle + 1), fill=(255, 255, 255, 255))
    return image


def discord():
    """The real Discord logo outline (src/discord_*.png, rendered from the brand vector) shrunk to the pixel grid: blurple, white eyes."""
    size = (26, 20)
    body = covered(Image.open(SOURCES / "discord_body.png"), size)
    eyes = covered(Image.open(SOURCES / "discord_eyes.png"), size, threshold=96)
    return layered(size, [(body, "#5865f2"), (eyes, "#f4f4f8", False)])


def gold_lamp(lamp):
    return tint(lamp.copy(), LAMP_GOLD)


def lamp_pool(lamp):
    lamp = gold_lamp(lamp)
    side = lamp.width + 9
    inset = 4

    def disc(pen, k):
        pen.ellipse((0, 0, side * k - 1, side * k - 1), fill=255)

    def hole(pen, k):
        pen.ellipse((inset * k, inset * k, (side - inset) * k - 1, (side - inset) * k - 1), fill=255)
    ring = smooth((side, side), disc) - smooth((side, side), hole)
    image = layered((side, side), [(smooth((side, side), disc), "#2c2218"), (ring, GOLD)])
    image.alpha_composite(lamp, ((image.width - lamp.width) // 2, (image.height - lamp.height) // 2 + 1))
    return image


def cycle_arrows():
    size, centre, outer, inner = (27, 27), 13.5, 10.5, 6.5
    point = lambda radius, degrees, k: (k * (centre + radius * math.cos(math.radians(degrees))), k * (centre + radius * math.sin(math.radians(degrees))))

    def draw(pen, k):
        for start, end in ((75, 205), (255, 385)):
            arc = range(start, end + 1, 4)
            pen.polygon([point(outer, a, k) for a in arc] + [point(inner, a, k) for a in reversed(arc)], fill=255)
            pen.polygon([point(inner - 3, end, k), point(outer + 3, end, k), point((outer + inner) / 2, end + 32, k)], fill=255)
    return layered(size, [(smooth(size, draw), "#5cc878")])


def gold_star():
    size, cx, cy, rounding = (27, 26), 13.5, 14.2, 2.2
    corners = [(cx + (11 if i % 2 == 0 else 5.6) * math.cos(math.radians(-90 + 36 * i)), cy + (11 if i % 2 == 0 else 5.6) * math.sin(math.radians(-90 + 36 * i))) for i in range(10)]

    def draw(pen, k):
        points = [(x * k, y * k) for x, y in corners]
        pen.polygon(points, fill=255)
        pen.line(points + points[:1], fill=255, width=round(2 * rounding * k), joint="curve")
        for x, y in points[::2]:
            pen.ellipse((x - rounding * k, y - rounding * k, x + rounding * k, y + rounding * k), fill=255)
    return layered(size, [(smooth(size, draw), "#f0c020")])


def reddit():
    def disc(pen):
        pen.ellipse((0, 0, 24, 24), fill=1)

    def head(pen):
        pen.ellipse((3, 10, 19, 20), fill=1)
        pen.ellipse((1, 8, 5, 12), fill=1)
        pen.ellipse((17, 8, 21, 12), fill=1)
        pen.line((11, 10, 13, 6), fill=1, width=1)
        pen.ellipse((13, 3, 16, 6), fill=1)

    def eyes(pen):
        pen.rectangle((7, 13, 8, 14), fill=1)
        pen.rectangle((14, 13, 15, 14), fill=1)
    return layered((25, 25), [(disc, "#ff4500"), (head, "#f6f2ee"), (eyes, "#ff4500")])


def bluesky():
    def wings(pen):
        pen.polygon([(12, 12), (6, 4), (2, 2), (1, 5), (2, 11), (7, 14), (11, 14)], fill=1)
        pen.polygon([(13, 12), (19, 4), (23, 2), (24, 5), (23, 11), (18, 14), (14, 14)], fill=1)
        pen.polygon([(12, 14), (7, 15), (4, 19), (7, 22), (11, 19)], fill=1)
        pen.polygon([(13, 14), (18, 15), (21, 19), (18, 22), (14, 19)], fill=1)
    return layered((26, 24), [(wings, "#1185fe")])


def x_logo():
    def heavy(pen):
        pen.polygon([(1, 1), (7, 1), (23, 22), (17, 22)], fill=1)

    def light(pen):
        pen.line((21, 1, 3, 22), fill=1, width=2)
    return layered((25, 24), [(light, "#eeeeee"), (heavy, "#eeeeee")])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    wiki = Wiki(BUILD_DIR / ".cache")
    titles = ("File:Coins 100.png", "File:Checkmark green.png", "File:Antique lamp.png")
    info = wiki.image_info(set(titles))
    coins, checkmark, lamp = (Image.open(io.BytesIO(wiki.download(info[title]["url"]))).convert("RGBA") for title in titles)
    art = {
        "double.png": double_arrows(),
        "cost_reduction.png": cost_reduction(coins),
        "extra_resource.png": plus_from_checkmark(checkmark),
        "discord.png": discord(),
        "reddit.png": reddit(),
        "bluesky.png": bluesky(),
        "x.png": x_logo(),
        "mastery_lamp.png": gold_lamp(lamp),
        "mastery_pool.png": lamp_pool(lamp),
        "preservation.png": cycle_arrows(),
        "perfect.png": gold_star(),
    }
    for stale in set(OUT.glob("*.png")) - {OUT / name for name in art}:
        stale.unlink()
    for name, image in art.items():
        image.save(OUT / name)
    print(f"{len(art)} icons in {OUT.relative_to(BUILD_DIR)}")


if __name__ == "__main__":
    main()
