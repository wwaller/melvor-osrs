import colorsys
import io
import math

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ITEM_CANVAS = 28
SLOT_SIZE = 36
MIN_ICON_SIZE = 64
RENDER_SIZE = 256
LABEL_FILL = (255, 255, 0, 255)
LABEL_SHADOW = (0, 0, 0, 255)
STAR_FILL = (255, 208, 0, 255)
GROUP_CANVAS = 44
GROUP_SPOTS = {
    2: [(0, 0), (1, 1)],
    3: [(0, 0), (1, 0), (0.5, 1)],
    4: [(0, 0), (1, 1), (0, 1), (1, 0)],
    6: [(0, 0.2), (1, 0.8), (0, 0.8), (1, 0.2), (0.5, 0), (0.5, 1)],
}
OUTLINE_LIGHTNESS = 0.1
GREY_SATURATION = 0.22
GOLD = (0.13, 0.85)
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


def _pad_square(image, side, grounded=False):
    square = Image.new("RGBA", (side, side))
    square.paste(image, ((side - image.width) // 2, side - image.height if grounded else (side - image.height) // 2))
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
    icon = _trim(_open(icon_data))
    side = round(image.width * fraction)
    if max(icon.width, icon.height) > side:
        icon.thumbnail((side, side), Image.LANCZOS)
    icon = _outline(icon, 1) if icon.getchannel("A").getextrema()[0] < 255 else icon
    image.alpha_composite(icon, (image.width - icon.width, image.height - icon.height))
    return image


def _hls(color):
    return colorsys.rgb_to_hls(*(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)))


def _rgba(h, l, s, a):
    return tuple(round(v * 255) for v in colorsys.hls_to_rgb(h, min(1, max(0, l)), s)) + (a,)


def tint(image, color, greys_only=False):
    """Recolour a sprite to one colour, keeping its shading; greys_only leaves coloured parts (wooden handles) alone."""
    target_h, target_l, target_s = _hls(color)
    pixels = image.load()
    picked = []
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if a and l > OUTLINE_LIGHTNESS and not (greys_only and s > GREY_SATURATION):
                picked.append((x, y, l, a))
    if not picked:
        return image
    mean = sum(l for _, _, l, _ in picked) / len(picked)
    for x, y, l, a in picked:
        pixels[x, y] = _rgba(target_h, l * target_l / mean, target_s, a)
    return image


def gold_trim(image):
    pixels = image.load()
    def edge(x, y):
        if not (0 <= x < image.width and 0 <= y < image.height):
            return True
        r, g, b, a = pixels[x, y]
        return a < 128 or colorsys.rgb_to_hls(r / 255, g / 255, b / 255)[1] <= OUTLINE_LIGHTNESS
    rim = [(x, y) for y in range(image.height) for x in range(image.width)
           if not edge(x, y) and any(edge(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in rim:
        r, g, b, a = pixels[x, y]
        pixels[x, y] = _rgba(GOLD[0], 0.3 + 0.45 * colorsys.rgb_to_hls(r / 255, g / 255, b / 255)[1], GOLD[1], a)
    return image


def _crisp(image, canvas):
    side = max(canvas, image.width, image.height)
    scale = max(1, math.ceil(MIN_ICON_SIZE / side))
    return _pad_square(image, side).resize((side * scale, side * scale), Image.NEAREST), scale


def group(datas):
    parts = [_trim(_open(data)) for data in datas]
    side = max([GROUP_CANVAS] + [max(part.size) for part in parts])
    canvas = Image.new("RGBA", (side, side))
    for part, (fx, fy) in zip(parts, GROUP_SPOTS[len(parts)]):
        canvas.alpha_composite(part, (round((side - part.width) * fx), round((side - part.height) * fy)))
    return _png(_crisp(canvas, side)[0])


def _emblem(icon, size):
    icon = _trim(icon)
    icon.thumbnail((size, size), Image.LANCZOS)
    pixels = icon.load()
    for y in range(icon.height):
        for x in range(icon.width):
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (r, g, b, 255) if a > 110 else (0, 0, 0, 0)
    return icon


def skillcape(template_data, emblem_data, color, trim=None):
    cape = _trim(_open(template_data))
    pixels = cape.load()
    top = cape.height // 4
    def is_emblem(x, y):
        _, l, s = colorsys.rgb_to_hls(*(v / 255 for v in pixels[x, y][:3]))
        return pixels[x, y][3] and l > OUTLINE_LIGHTNESS and s < GREY_SATURATION
    emblem_spots = [(x, y) for y in range(top, cape.height) for x in range(cape.width) if is_emblem(x, y)]
    tint(cape, color)
    if emblem_spots:
        left, upper = min(x for x, _ in emblem_spots), min(y for _, y in emblem_spots)
        right, lower = max(x for x, _ in emblem_spots) + 1, max(y for _, y in emblem_spots) + 1
        fill = pixels[max(0, left - 1), (upper + lower) // 2]
        for x, y in emblem_spots:
            pixels[x, y] = fill
        emblem = _emblem(_open(emblem_data), max(right - left, lower - upper))
        cape.alpha_composite(emblem, ((left + right - emblem.width) // 2, (upper + lower - emblem.height) // 2))
    if trim:
        gold_trim(cape)
    return _png(_crisp(cape, ITEM_CANVAS)[0])


def pixel_sprite(data, canvas=0, label=None, star=False, decal=None, recolor=None, trim=None):
    image = _trim(_open(data)) if canvas else _open(data)
    if recolor:
        tint(image, recolor["color"], recolor.get("greys", False))
    if trim:
        gold_trim(image)
    side = max(canvas, image.width, image.height)
    scale = max(1, math.ceil(MIN_ICON_SIZE / side))
    square = _pad_square(image, side).resize((side * scale, side * scale), Image.NEAREST)
    if label:
        _stamp(square, label, scale if canvas else max(1, round(square.width / SLOT_SIZE)))
    if star:
        _star(square, scale)
    if decal:
        _decal(square, decal)
    return _png(square)


def _finish_render(image, label=None, badge=None, grounded=False, recolor=None, shrink=None, star=False, outline=None):
    image.thumbnail((RENDER_SIZE, RENDER_SIZE), Image.LANCZOS)
    if recolor:
        tint(image, recolor["color"], recolor.get("greys", False))
    if outline:
        image = _outline(image, outline)
    side = max(image.width, image.height)
    square = _pad_square(image, round(side / shrink) if shrink else side, grounded)
    if badge:
        icon = _trim(_open(badge))
        scale = max(1, math.floor(square.width * 0.42 / max(icon.width, icon.height)))
        icon = icon.resize((icon.width * scale, icon.height * scale), Image.NEAREST)
        square.alpha_composite(icon, (square.width - icon.width, square.height - icon.height))
    if label:
        _stamp(square, label, max(2, square.width // 64))
    if star:
        _star(square, max(2, round(square.width / SLOT_SIZE)))
    return _png(square)


def erase_hue(image, low, high, min_saturation=0.15, min_alpha=32):
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            h, _, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if a < min_alpha or (s >= min_saturation and low <= h * 360 <= high):
                pixels[x, y] = (0, 0, 0, 0)
    return _trim(image)


def big_top(image, split, scale, stack=1, overlap=0.45):
    cut = round(image.height * split)
    top, rest = image.crop((0, 0, image.width, cut)), image.crop((0, cut, image.width, image.height))
    tiers = [top.resize((max(1, round(top.width * scale * 0.78 ** i)), max(1, round(top.height * scale * 0.78 ** i))), Image.LANCZOS) for i in range(stack)]
    rises = [0]
    for lower, upper in zip(tiers, tiers[1:]):
        rises.append(rises[-1] + round(upper.height * (1 - overlap)))
    width = max([rest.width] + [tier.width for tier in tiers])
    height = rises[-1] + tiers[0].height + rest.height
    canvas = Image.new("RGBA", (width, height))
    base = height - rest.height
    canvas.alpha_composite(rest, ((width - rest.width) // 2, base))
    for tier, rise in reversed(list(zip(tiers, rises))):
        canvas.alpha_composite(tier, ((width - tier.width) // 2, base - tier.height - rise + round(tier.height * 0.08)))
    return _trim(canvas)


def render(data, label=None, badge=None, grounded=False, recolor=None, shrink=None, top=None, star=False, rotate=None, erase=None, inflate=None, outline=None):
    image = _trim(_open(data))
    if erase:
        image = erase_hue(image, *erase)
    if inflate:
        image = image.resize((image.width, round(image.height * inflate)), Image.LANCZOS)
    if rotate:
        image = _trim(image.rotate(rotate, resample=Image.BICUBIC, expand=True))
    return _finish_render(big_top(image, **top) if top else image, label, badge, grounded, recolor, shrink, star, outline)


def row(datas, overlap=0.25, grounded=False, recolor=None):
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
    return _finish_render(canvas, grounded=grounded, recolor=recolor)


def cluster(parts, grounded=False):
    """Parts are (data, size as a share of the frame, (x, y) as shares of the free space, recolor)."""
    side = RENDER_SIZE * 2
    canvas = Image.new("RGBA", (side, side))
    for data, share, (fx, fy), recolor in parts:
        image = _trim(_open(data))
        fit = side * share / max(image.size)
        image = image.resize((max(1, round(image.width * fit)), max(1, round(image.height * fit))), Image.LANCZOS)
        if recolor:
            tint(image, recolor["color"], recolor.get("greys", False))
        canvas.alpha_composite(image, (round((side - image.width) * fx), round((side - image.height) * fy)))
    return _finish_render(_trim(canvas), grounded=grounded)


def tablet(blank, creature_data, fill=0.7):
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
    padded = Image.new("RGBA", (image.width + 2 * width, image.height + 2 * width))
    padded.paste(image, (width, width))
    solid = padded.getchannel("A").point(lambda a: 255 if a > 96 else 0)
    stroke = solid.filter(ImageFilter.MaxFilter(2 * width + 1))
    result = Image.new("RGBA", padded.size, color)
    result.putalpha(stroke)
    result.alpha_composite(padded)
    return result
