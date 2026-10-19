"""Item, identity kit, sequence, frame and skeleton definitions from the OSRS cache, ported from RuneLite's loaders."""
from osrs_cache import Reader

ANIMATIONS = 0
SKELETONS = 1
CONFIGS = 2
IDENTKIT_GROUP = 3
ITEM_GROUP = 10
SEQUENCE_GROUP = 12


def _recolors(reader):
    return [(reader.u16(), reader.u16()) for _ in range(reader.u8())]


def _skip_params(reader):
    for _ in range(reader.u8()):
        kind = reader.u8()
        reader.u24()
        if kind == 1:
            reader.string()
        elif kind == 2:
            reader.i64()
        else:
            reader.i32()


def item(data):
    reader = Reader(data)
    definition = {"name": "", "wear_pos": [-1, -1, -1], "male": [-1, -1, -1], "female": [-1, -1, -1],
                  "male_offset": 0, "female_offset": 0, "recolor": [], "retexture": []}
    while (opcode := reader.u8()) != 0:
        if opcode in (1, 4, 5, 6, 7, 8, 94, 95, 97, 98, 99, 110, 111, 112, 139, 140, 148, 149):
            reader.u16()
        elif opcode in (2, 3, 9) or 30 <= opcode < 40:
            text = reader.string()
            if opcode == 2:
                definition["name"] = text
        elif opcode in (11, 15, 16, 65, 160, 251):
            pass
        elif opcode in (12, 44, 51, 52, 53, 54):
            reader.i32()
        elif opcode in (13, 14, 27):
            definition["wear_pos"][{13: 0, 14: 1, 27: 2}[opcode]] = reader.i8()
        elif opcode in (23, 25, 45, 48):
            model = reader.u16() if opcode in (23, 25) else reader.i32()
            gender = "male" if opcode in (23, 45) else "female"
            definition[gender][0] = model
            definition[f"{gender}_offset"] = reader.u8()
        elif opcode in (24, 26, 78, 79):
            definition["male" if opcode in (24, 78) else "female"][1 if opcode in (24, 26) else 2] = reader.u16()
        elif opcode in (46, 47, 49, 50):
            definition["male" if opcode in (46, 47) else "female"][1 if opcode in (46, 49) else 2] = reader.i32()
        elif opcode in (40, 41):
            definition["recolor" if opcode == 40 else "retexture"] = _recolors(reader)
        elif opcode in (42, 113, 114, 115):
            reader.u8()
        elif opcode == 43:
            reader.u8()
            while reader.u8() != 0:
                reader.string()
        elif opcode == 75:
            reader.i16()
        elif opcode in (90, 91, 92, 93):
            reader.u16()
        elif 100 <= opcode < 110:
            reader.u16()
            reader.u16()
        elif opcode == 161:
            for _ in range(reader.u16()):
                reader.u16()
        elif opcode == 200:
            reader.u8()
            reader.u8()
            reader.string()
        elif opcode in (201, 202):
            reader.u8()
            reader.u16()
            reader.u16()
            if opcode == 202:
                reader.u16()
            reader.i32()
            reader.i32()
            reader.string()
        elif opcode == 249:
            _skip_params(reader)
        else:
            raise ValueError(f"unknown item opcode {opcode}")
    return definition


def kit(data):
    reader = Reader(data)
    definition = {"part": -1, "models": [], "recolor": [], "retexture": [], "selectable": True}
    while (opcode := reader.u8()) != 0:
        if opcode == 1:
            definition["part"] = reader.u8()
        elif opcode == 2:
            definition["models"] = [reader.u16() for _ in range(reader.u8())]
        elif opcode == 5:
            definition["models"] = [reader.i32() for _ in range(reader.u8())]
        elif opcode == 3:
            definition["selectable"] = False
        elif opcode in (40, 41):
            definition["recolor" if opcode == 40 else "retexture"] = [(reader.i16() & 0xFFFF, reader.i16() & 0xFFFF) for _ in range(reader.u8())]
        elif 60 <= opcode < 70:
            reader.u16()
        elif 70 <= opcode < 80:
            reader.i32()
        else:
            raise ValueError(f"unknown kit opcode {opcode}")
    return definition


def sequence(data):
    # frames are (frame archive << 16) | frame file
    reader = Reader(data)
    definition = {"frames": [], "lengths": [], "left_hand": -1, "right_hand": -1}
    while (opcode := reader.u8()) != 0:
        if opcode == 1:
            count = reader.u16()
            definition["lengths"] = [reader.u16() for _ in range(count)]
            low = [reader.u16() for _ in range(count)]
            definition["frames"] = [part | reader.u16() << 16 for part in low]
        elif opcode in (6, 7):
            definition["left_hand" if opcode == 6 else "right_hand"] = reader.u16()
        elif opcode == 2:
            reader.u16()
        elif opcode in (3, 17):
            count = reader.u8()
            reader.offset += count
        elif opcode in (4, 19):
            pass
        elif opcode in (5, 8, 9, 10, 11, 16):
            reader.u8()
        elif opcode == 12:
            count = reader.u8()
            reader.offset += count * 4
        elif opcode == 13:
            reader.i32()
        elif opcode == 14:
            count = reader.u16()
            reader.offset += count * 8
        elif opcode == 15:
            reader.offset += 4
        elif opcode == 18:
            reader.string()
        else:
            raise ValueError(f"unknown sequence opcode {opcode}")
    return definition


def skeleton(data):
    reader = Reader(data)
    length = reader.u8()
    types = [reader.u8() for _ in range(length)]
    sizes = [reader.u8() for _ in range(length)]
    return {"types": types, "groups": [[reader.u8() for _ in range(size)] for size in sizes]}


def frame_skeleton_id(data):
    return Reader(data).u16()


def frame(data, skeleton_definition):
    types = skeleton_definition["types"]
    flags = Reader(data, 3)
    length = data[2]
    values = Reader(data, 3 + length)
    transforms = []
    last = -1
    for entry in range(length):
        flag = flags.u8()
        if flag <= 0:
            continue
        if types[entry] != 0:
            for previous in range(entry - 1, last, -1):
                if types[previous] == 0:
                    transforms.append((previous, 0, 0, 0))
                    break
        default = 128 if types[entry] == 3 else 0
        transforms.append((
            entry,
            values.short_smart() if flag & 1 else default,
            values.short_smart() if flag & 2 else default,
            values.short_smart() if flag & 4 else default,
        ))
        last = entry
    if values.offset != len(data):
        raise ValueError("frame did not decode to its full length")
    return transforms
