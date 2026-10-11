import io
import math

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ITEM_CANVAS = 36
MIN_ICON_SIZE = 64
RENDER_SIZE = 256
LABEL_FILL = (255, 255, 0, 255)
LABEL_SHADOW = (0, 0, 0, 255)
STAR_FILL = (255, 208, 0, 255)
STAR_SHAPE = [
    "...#...",
    "...#...",
    "#######",
    ".#####.",
    "..###..",
    ".##.##.",
    ".#...#.",
]


def _open(data):
    return Image.open(io.BytesIO(data)).convert("RGBA")


def _png(image):
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _pad_square(image, side):
    square = Image.new("RGBA", (side, side))
    square.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    return square


def _trim(image):
    bbox = image.getbbox()
    return image.crop(bbox) if bbox else image


def _stamp(image, label, scale):
    """Draw a tier label the way OSRS draws inventory stack counts: yellow, black drop shadow, top-left."""
    font = ImageFont.load_default_imagefont()
    left, top, right, bottom = font.getbbox(label)
    tag = Image.new("RGBA", (right - left + 1, bottom - top + 1))
    draw = ImageDraw.Draw(tag)
    draw.text((1 - left, 1 - top), label, font=font, fill=LABEL_SHADOW)
    draw.text((-left, -top), label, font=font, fill=LABEL_FILL)
    if scale > 1:
        tag = tag.resize((tag.width * scale, tag.height * scale), Image.NEAREST)
    image.alpha_composite(tag, (scale, 0))
    return image


def _star(image, scale):
    """Pixel star in the top-right corner, outlined in black like OSRS sprites."""
    size = len(STAR_SHAPE) + 2
    star = Image.new("RGBA", (size, size))
    filled = {(x + 1, y + 1) for y, line in enumerate(STAR_SHAPE) for x, c in enumerate(line) if c == "#"}
    for x, y in filled:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                star.putpixel((x + dx, y + dy), LABEL_SHADOW)
    for x, y in filled:
        star.putpixel((x, y), STAR_FILL)
    star = star.resize((size * scale, size * scale), Image.NEAREST)
    image.alpha_composite(star, (image.width - star.width, 0))
    return image


def _decal(image, icon_data, fraction=0.36):
    """Small skill icon in the bottom-right corner so a generic sprite says what it is for."""
    icon = _trim(_open(icon_data))
    side = round(image.width * fraction)
    if max(icon.width, icon.height) > side:
        icon.thumbnail((side, side), Image.LANCZOS)
    icon = _outline(icon, 1) if icon.getchannel("A").getextrema()[0] < 255 else icon
    image.alpha_composite(icon, (image.width - icon.width, image.height - icon.height))
    return image


def pixel_sprite(data, canvas=0, label=None, star=False, decal=None):
    """Center on a square canvas, then integer nearest-neighbor upscale so pixels stay crisp."""
    image = _open(data)
    side = max(canvas, image.width, image.height)
    scale = max(1, math.ceil(MIN_ICON_SIZE / side))
    square = _pad_square(image, side).resize((side * scale, side * scale), Image.NEAREST)
    if label:
        _stamp(square, label, max(1, round(square.width / ITEM_CANVAS)))
    if star:
        _star(square, scale)
    if decal:
        _decal(square, decal)
    return _png(square)


def _finish_render(image, label=None, badge=None):
    image.thumbnail((RENDER_SIZE, RENDER_SIZE), Image.LANCZOS)
    square = _pad_square(image, max(image.width, image.height))
    if badge:
        icon = _trim(_open(badge))
        scale = max(1, math.floor(square.width * 0.42 / max(icon.width, icon.height)))
        icon = icon.resize((icon.width * scale, icon.height * scale), Image.NEAREST)
        square.alpha_composite(icon, (square.width - icon.width, square.height - icon.height))
    if label:
        _stamp(square, label, max(2, square.width // 64))
    return _png(square)


def render(data, label=None, badge=None):
    return _finish_render(_trim(_open(data)), label, badge)


def row(datas, overlap=0.25):
    """Line several renders up side by side at a shared height, overlapping a little."""
    height = RENDER_SIZE
    parts = []
    for data in datas:
        image = _trim(_open(data))
        parts.append(image.resize((max(1, round(image.width * height / image.height)), height), Image.LANCZOS))
    step = [round(p.width * (1 - overlap)) for p in parts]
    width = sum(step[:-1]) + parts[-1].width
    canvas = Image.new("RGBA", (width, height))
    x = 0
    for part, advance in zip(parts, step):
        canvas.alpha_composite(part, (x, 0))
        x += advance
    return _finish_render(canvas)


def tablet(blank, creature_data, fill=0.7):
    """Put an OSRS creature on Melvor's blank summoning tablet, large enough to read at icon size."""
    slab = _open(blank)
    box = round(slab.width * fill)
    creature = _trim(_open(creature_data))
    if max(creature.width, creature.height) <= MIN_ICON_SIZE:
        scale = max(1, box // max(creature.width, creature.height))
        creature = creature.resize((creature.width * scale, creature.height * scale), Image.NEAREST)
    creature.thumbnail((box, box), Image.LANCZOS)
    creature = _outline(creature, max(2, slab.width // 64))
    slab.alpha_composite(creature, ((slab.width - creature.width) // 2, (slab.height - creature.height) // 2))
    return _png(slab)


def _outline(image, width, color=LABEL_SHADOW):
    """Dark stroke around the silhouette, like the outline on OSRS sprites."""
    padded = Image.new("RGBA", (image.width + 2 * width, image.height + 2 * width))
    padded.paste(image, (width, width))
    solid = padded.getchannel("A").point(lambda a: 255 if a > 96 else 0)
    stroke = solid.filter(ImageFilter.MaxFilter(2 * width + 1))
    result = Image.new("RGBA", padded.size, color)
    result.putalpha(stroke)
    result.alpha_composite(padded)
    return result
