"""Fetch sprites from the OSRS game cache, group by group, via the OpenRS2 archive."""
import bz2
import gzip
import json
import struct
import urllib.request
from pathlib import Path

from PIL import Image

OPENRS2 = "https://archive.openrs2.org"
USER_AGENT = "melvor-osrs-theme/0.1 (personal Melvor Idle mod build)"
SPRITE_INDEX = 8
VERTICAL = 1
PER_PIXEL_ALPHA = 2


class Reader:
    def __init__(self, data):
        self.data = data
        self.offset = 0

    def peek(self):
        return self.data[self.offset]

    def u8(self):
        self.offset += 1
        return self.data[self.offset - 1]

    def u16(self):
        self.offset += 2
        return struct.unpack_from(">H", self.data, self.offset - 2)[0]

    def i32(self):
        self.offset += 4
        return struct.unpack_from(">i", self.data, self.offset - 4)[0]

    def unsigned_short_smart(self):
        return self.u8() if self.peek() < 128 else self.u16() - 0x8000

    def short_smart(self):
        return self.u8() - 64 if self.peek() < 128 else self.u16() - 0xC000


def decompress(container):
    compression = container[0]
    length = struct.unpack_from(">i", container, 1)[0]
    if compression == 0:
        return container[5:5 + length]
    data = container[9:9 + length]
    if compression == 1:
        return bz2.decompress(b"BZh1" + data)
    if compression == 2:
        return gzip.decompress(data)
    raise ValueError(f"unsupported compression {compression}")


def _fetch(url, path):
    if not path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    return path.read_bytes()


class Cache:
    def __init__(self, cache_dir):
        self.cache_dir = Path(cache_dir) / "openrs2"
        caches = json.loads(_fetch(f"{OPENRS2}/caches.json", self.cache_dir / "caches.json"))
        live = [c for c in caches if c.get("game") == "oldschool" and c.get("environment") == "live" and c.get("timestamp")]
        self.cache_id = max(live, key=lambda c: c["timestamp"])["id"]

    def group(self, archive, group):
        url = f"{OPENRS2}/caches/runescape/{self.cache_id}/archives/{archive}/groups/{group}.dat"
        return decompress(_fetch(url, self.cache_dir / str(self.cache_id) / str(archive) / f"{group}.dat"))

    def sprites(self, sprite_id):
        data = self.group(SPRITE_INDEX, sprite_id)
        reader = Reader(data)
        reader.offset = len(data) - 2
        count = reader.u16()
        reader.offset = len(data) - 7 - count * 8
        canvas_width, canvas_height, palette_length = reader.u16(), reader.u16(), reader.u8() + 1
        offsets_x = [reader.u16() for _ in range(count)]
        offsets_y = [reader.u16() for _ in range(count)]
        widths = [reader.u16() for _ in range(count)]
        heights = [reader.u16() for _ in range(count)]
        reader.offset = len(data) - 7 - count * 8 - (palette_length - 1) * 3
        palette = [(0, 0, 0)] + [tuple(reader.data[reader.offset + i * 3:reader.offset + i * 3 + 3]) for i in range(palette_length - 1)]
        reader.offset = 0
        frames = []
        for frame in range(count):
            width, height = widths[frame], heights[frame]
            flags = reader.u8()
            indices = self._pixels(reader, width, height, flags)
            alphas = self._pixels(reader, width, height, flags) if flags & PER_PIXEL_ALPHA else [255 if i else 0 for i in indices]
            image = Image.new("RGBA", (canvas_width, canvas_height))
            sprite = Image.new("RGBA", (width, height))
            sprite.putdata([(*palette[i], a) for i, a in zip(indices, alphas)])
            image.paste(sprite, (offsets_x[frame], offsets_y[frame]))
            frames.append(image)
        return frames

    @staticmethod
    def _pixels(reader, width, height, flags):
        values = reader.data[reader.offset:reader.offset + width * height]
        reader.offset += width * height
        if not flags & VERTICAL:
            return list(values)
        return [values[x * height + y] for y in range(height) for x in range(width)]
