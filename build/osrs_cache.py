"""Read groups and files from the OSRS game cache, one group at a time, via the OpenRS2 archive."""
import bz2
import gzip
import json
import struct
import urllib.request
from pathlib import Path

OPENRS2 = "https://archive.openrs2.org"
USER_AGENT = "melvor-osrs-character/0.1 (personal Melvor Idle mod build)"
REFERENCE_INDEX = 255
NAMED = 1
SIZED = 4


class Reader:
    def __init__(self, data, offset=0):
        self.data = data
        self.offset = offset

    def peek(self):
        return self.data[self.offset]

    def u8(self):
        self.offset += 1
        return self.data[self.offset - 1]

    def i8(self):
        self.offset += 1
        return struct.unpack_from(">b", self.data, self.offset - 1)[0]

    def u16(self):
        self.offset += 2
        return struct.unpack_from(">H", self.data, self.offset - 2)[0]

    def i16(self):
        self.offset += 2
        return struct.unpack_from(">h", self.data, self.offset - 2)[0]

    def u24(self):
        self.offset += 3
        return int.from_bytes(self.data[self.offset - 3:self.offset], "big")

    def i32(self):
        self.offset += 4
        return struct.unpack_from(">i", self.data, self.offset - 4)[0]

    def i64(self):
        self.offset += 8
        return struct.unpack_from(">q", self.data, self.offset - 8)[0]

    def short_smart(self):
        return self.u8() - 64 if self.peek() < 128 else self.u16() - 0xC000

    def big_smart(self):
        return self.i32() & 0x7FFFFFFF if self.peek() >= 128 else self.u16()

    def string(self):
        end = self.data.index(0, self.offset)
        text = self.data[self.offset:end].decode("latin-1")
        self.offset = end + 1
        return text


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


def _reference_table(data):
    """Group id -> list of file ids, from an index's reference table."""
    reader = Reader(data)
    protocol = reader.u8()
    if protocol >= 6:
        reader.i32()
    flags = reader.u8()
    count_of = reader.big_smart if protocol >= 7 else reader.u16
    group_ids = []
    last = 0
    for _ in range(count_of()):
        last += count_of()
        group_ids.append(last)
    if flags & NAMED:
        reader.offset += 4 * len(group_ids)
    reader.offset += 4 * len(group_ids)
    if flags & SIZED:
        reader.offset += 8 * len(group_ids)
    reader.offset += 4 * len(group_ids)
    file_counts = [count_of() for _ in group_ids]
    files = {}
    for group, file_count in zip(group_ids, file_counts):
        last = 0
        files[group] = []
        for _ in range(file_count):
            last += count_of()
            files[group].append(last)
    return files


def split_group(data, file_ids):
    """The contents of each file in a multi-file group, keyed by file id."""
    if len(file_ids) == 1:
        return {file_ids[0]: data}
    chunks = data[-1]
    reader = Reader(data, len(data) - 1 - chunks * len(file_ids) * 4)
    chunk_sizes = [[0] * chunks for _ in file_ids]
    for chunk in range(chunks):
        size = 0
        for index in range(len(file_ids)):
            size += reader.i32()
            chunk_sizes[index][chunk] = size
    contents = [bytearray() for _ in file_ids]
    offset = 0
    for chunk in range(chunks):
        for index in range(len(file_ids)):
            size = chunk_sizes[index][chunk]
            contents[index] += data[offset:offset + size]
            offset += size
    return {file_id: bytes(content) for file_id, content in zip(file_ids, contents)}


class Cache:
    def __init__(self, cache_dir):
        self.cache_dir = Path(cache_dir) / "openrs2"
        caches = json.loads(_fetch(f"{OPENRS2}/caches.json", self.cache_dir / "caches.json"))
        live = [c for c in caches if c.get("game") == "oldschool" and c.get("environment") == "live" and c.get("timestamp")]
        self.cache_id = max(live, key=lambda c: c["timestamp"])["id"]
        self.references = {}

    def group(self, archive, group):
        url = f"{OPENRS2}/caches/runescape/{self.cache_id}/archives/{archive}/groups/{group}.dat"
        return decompress(_fetch(url, self.cache_dir / str(self.cache_id) / str(archive) / f"{group}.dat"))

    def files(self, archive, group):
        if archive not in self.references:
            self.references[archive] = _reference_table(self.group(REFERENCE_INDEX, archive))
        return split_group(self.group(archive, group), self.references[archive][group])
