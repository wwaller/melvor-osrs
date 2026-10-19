"""Fetch sound effects from the OSRS game cache, group by group, via the OpenRS2 archive."""
import bz2
import gzip
import json
import struct
import urllib.request
from pathlib import Path

OPENRS2 = "https://archive.openrs2.org"
USER_AGENT = "melvor-osrs-sounds/0.1 (personal Melvor Idle mod build)"
SOUND_INDEX = 4


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

    def sound_effect(self, sound_id):
        url = f"{OPENRS2}/caches/runescape/{self.cache_id}/archives/{SOUND_INDEX}/groups/{sound_id}.dat"
        return decompress(_fetch(url, self.cache_dir / str(self.cache_id) / str(SOUND_INDEX) / f"{sound_id}.dat"))
