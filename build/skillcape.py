"""Skillcapes for the skills OSRS does not have: the Agility cape's mesh in the Melvor cape's colours, its emblem replaced by the skill's icon laid out as a grid of flat squares."""
import colorsys
import functools
import math

from PIL import Image

BASE_CAPE = 9771
EMBLEM_COLOR = 6352
EMBLEM_BOX = (28, 39)
EMBLEM_CENTER_Y = -115.5
EMBLEM_Z = 14
EMBLEM_GROUP = 11
EMBLEM_PRIORITY = 6
EMBLEM_COLORS = 8
EMBLEM_MIN_CONTRAST = 0.25
EMBLEM_LIFT = 0.4
BODY = (43431, 43550, 43674)
TRIM = (57280, 54183, 54503)
ACCENT = (677, 801, 920)
GOLD = "#d8a830"
PLAYER_LIGHT = (64, 850, -30, -50, -30)
BRIGHTNESS = 0.6


def _hsl_to_rgb(hsl):
    """The renderer's palette: OSRS 16-bit HSL to RGB with its brightness curve."""
    hue = (hsl >> 10 & 63) / 64 + 0.5 / 64
    saturation = (hsl >> 7 & 7) / 8 + 0.5 / 8
    luminance = (hsl & 127) / 128
    chroma = (1 - abs(2 * luminance - 1)) * saturation
    x = chroma * (1 - abs((hue * 6) % 2 - 1))
    lightness = luminance - chroma / 2
    r = g = b = lightness
    sector = math.trunc(hue * 6)
    if sector == 0:
        r, g = r + chroma, g + x
    elif sector == 1:
        g, r = g + chroma, r + x
    elif sector == 2:
        g, b = g + chroma, b + x
    elif sector == 3:
        b, g = b + chroma, g + x
    elif sector == 4:
        b, r = b + chroma, r + x
    else:
        r, b = r + chroma, b + x
    return tuple(min(255, math.trunc((min(255, math.trunc(v * 256)) / 256) ** BRIGHTNESS * 256)) for v in (r, g, b))


PALETTE = [_hsl_to_rgb(hsl) for hsl in range(65536)]


def _flat_light():
    """How bright the renderer lights a face that looks straight out of the cape's back."""
    ambient, contrast, x, y, z = PLAYER_LIGHT
    scale = (math.trunc(math.sqrt(x * x + y * y + z * z)) * contrast) >> 8
    return math.trunc(z * -256 / scale) + ambient


LIGHT = _flat_light()


def _shade(hsl):
    return (hsl & 0xFF80) + min(126, max(2, ((hsl & 127) * LIGHT) >> 7))


SHOWN = {}
for _hsl in range(65536):
    SHOWN.setdefault(_shade(_hsl), _hsl)


@functools.cache
def to_hsl(rgb):
    """The OSRS colour that shows as this RGB on the cape's back once the renderer has lit it."""
    shown = min(SHOWN, key=lambda code: sum((a - b) ** 2 for a, b in zip(PALETTE[code], rgb)))
    return SHOWN[shown]


def _hex(color):
    return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))


def shades(color):
    """Light, mid and dark tones of one colour, spaced like the Agility cape's own three blues."""
    h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in _hex(color)))
    tone = lambda dl, ds: tuple(round(v * 255) for v in colorsys.hls_to_rgb(h, min(1, l + dl), max(0, s - ds)))
    return tuple(to_hsl(rgb) for rgb in (tone(0.12, 0.2), tone(0.04, 0.1), tone(0, 0)))


def _emblem_pixels(icon, cape_color):
    """The icon's opaque pixels, scaled to fill where the Agility emblem was and lifted when it would vanish into a dark cape; a shrunk painted icon is also cut to a few flat colours like an OSRS emblem."""
    icon = icon.convert("RGBA")
    icon = icon.crop(icon.getbbox())
    scale = min(EMBLEM_BOX[0] / icon.width, EMBLEM_BOX[1] / icon.height)
    icon = icon.resize((round(icon.width * scale), round(icon.height * scale)), Image.NEAREST if scale > 1 else Image.LANCZOS)
    pixels = icon.load()
    spots = [(x, y) for y in range(icon.height) for x in range(icon.width) if pixels[x, y][3] > 127]
    hls = [colorsys.rgb_to_hls(*(v / 255 for v in pixels[spot][:3])) for spot in spots]
    cape_lightness = colorsys.rgb_to_hls(*(v / 255 for v in _hex(cape_color)))[1]
    gap = sorted(l for _, l, _ in hls)[len(hls) // 2] - cape_lightness
    lift = EMBLEM_LIFT - gap if cape_lightness < 0.5 and gap < EMBLEM_MIN_CONTRAST else 0
    strip = Image.new("RGB", (len(spots), 1))
    strip.putdata([tuple(round(v * 255) for v in colorsys.hls_to_rgb(h, min(1, max(0, l + lift)), s)) for h, l, s in hls])
    if scale < 1:
        strip = strip.quantize(EMBLEM_COLORS, method=Image.Quantize.MEDIANCUT).convert("RGB")
    return icon.width, icon.height, dict(zip(spots, strip.getdata()))


def _faces_out(model, faces):
    """Winding sign of the faces that look out of the cape's back, so new faces light the same way."""
    vx, vy = model["vx"], model["vy"]
    f = faces[0]
    a, b, c = model["fa"][f], model["fb"][f], model["fc"][f]
    return (vx[b] - vx[a]) * (vy[c] - vy[a]) - (vx[c] - vx[a]) * (vy[b] - vy[a]) > 0


def build(model, color, accent, emblem, superior):
    """A copy of the decoded Agility cape mesh with its colours swapped and the emblem rebuilt from the icon."""
    body = shades(color)
    trim = shades(GOLD) if superior else body
    swap = {**dict(zip(BODY, body)), **dict(zip(TRIM, trim)), **dict(zip(ACCENT, accent))}
    old_emblem = [f for f, color in enumerate(model["colors"]) if color == EMBLEM_COLOR]
    out_winding = _faces_out(model, old_emblem)
    keep = [f for f in range(len(model["colors"])) if model["colors"][f] != EMBLEM_COLOR]
    cape = {
        **model,
        "vx": list(model["vx"]), "vy": list(model["vy"]), "vz": list(model["vz"]), "groups": list(model["groups"]),
        "fa": [model["fa"][f] for f in keep], "fb": [model["fb"][f] for f in keep], "fc": [model["fc"][f] for f in keep],
        "colors": [swap.get(model["colors"][f], model["colors"][f]) for f in keep],
        "priorities": [model["priorities"][f] for f in keep],
    }
    for field in ("types", "alphas", "textures"):
        if model[field] is not None:
            raise ValueError(f"base cape has per-face {field}; extend build() to carry them")

    width, height, pixels = _emblem_pixels(emblem, color)
    left, top = -(width // 2), round(EMBLEM_CENTER_Y - height / 2)
    corners = {}

    def corner(x, y):
        if (x, y) not in corners:
            corners[(x, y)] = len(cape["vx"])
            cape["vx"].append(-(left + x))
            cape["vy"].append(top + y)
            cape["vz"].append(EMBLEM_Z)
            cape["groups"].append(EMBLEM_GROUP)
        return corners[(x, y)]

    for (x, y), rgb in sorted(pixels.items(), key=lambda item: (item[0][1], item[0][0])):
        tl, tr, br, bl = corner(x, y), corner(x + 1, y), corner(x + 1, y + 1), corner(x, y + 1)
        for a, b, c in ((tl, tr, br), (tl, br, bl)):
            winding = (cape["vx"][b] - cape["vx"][a]) * (cape["vy"][c] - cape["vy"][a]) - (cape["vx"][c] - cape["vx"][a]) * (cape["vy"][b] - cape["vy"][a]) > 0
            if winding != out_winding:
                b, c = c, b
            cape["fa"].append(a)
            cape["fb"].append(b)
            cape["fc"].append(c)
            cape["colors"].append(to_hsl(rgb))
            cape["priorities"].append(EMBLEM_PRIORITY)
    return cape
