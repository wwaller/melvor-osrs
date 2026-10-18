"""Decode OSRS cache models (index 7) in all four formats, ported from RuneLite's ModelLoader."""
from osrs_cache import Reader


def _vertices(model, data, count, flags_at, x_at, y_at, z_at, groups_at):
    flags, xs, ys, zs = Reader(data, flags_at), Reader(data, x_at), Reader(data, y_at), Reader(data, z_at)
    groups = Reader(data, groups_at) if groups_at is not None else None
    x = y = z = 0
    for _ in range(count):
        flag = flags.u8()
        x += xs.short_smart() if flag & 1 else 0
        y += ys.short_smart() if flag & 2 else 0
        z += zs.short_smart() if flag & 4 else 0
        model["vx"].append(x)
        model["vy"].append(y)
        model["vz"].append(z)
        model["groups"].append(groups.u8() if groups else -1)


def _faces(model, data, count, types_at, indices_at):
    types, indices = Reader(data, types_at), Reader(data, indices_at)
    a = b = c = last = 0
    for _ in range(count):
        kind = types.u8()
        if kind == 1:
            a = indices.short_smart() + last
            b = indices.short_smart() + a
            c = indices.short_smart() + b
        elif kind == 2:
            b = c
            c = indices.short_smart() + last
        elif kind == 3:
            a = c
            c = indices.short_smart() + last
        elif kind == 4:
            a, b = b, a
            c = indices.short_smart() + last
        last = c
        model["fa"].append(a)
        model["fb"].append(b)
        model["fc"].append(c)


def _new_model(face_count, priority):
    model = {"vx": [], "vy": [], "vz": [], "groups": [], "fa": [], "fb": [], "fc": [], "colors": [],
             "types": None, "priorities": None, "priority": 0, "alphas": None, "textures": None}
    if priority == 255:
        model["priorities"] = []
    else:
        model["priority"] = priority
    return model


def _face_attributes(model, data, count, colors_at, types_at, priorities_at, alphas_at, textures_at, packed_textures):
    colors = Reader(data, colors_at)
    types = Reader(data, types_at) if types_at is not None else None
    priorities = Reader(data, priorities_at) if model["priorities"] is not None else None
    alphas = Reader(data, alphas_at) if alphas_at is not None else None
    textures = Reader(data, textures_at) if textures_at is not None else None
    if types:
        model["types"] = []
    if alphas:
        model["alphas"] = []
    if types and packed_textures or textures:
        model["textures"] = []
    for _ in range(count):
        color = colors.u16()
        if types and packed_textures:
            flag = types.u8()
            model["types"].append(1 if flag & 1 else 0)
            model["textures"].append((color if color < 0x8000 else color - 0x10000) if flag & 2 else -1)
            color = 127 if flag & 2 else color
        elif types:
            model["types"].append(types.i8())
        if textures:
            model["textures"].append(textures.u16() - 1)
        model["colors"].append(color)
        if priorities:
            model["priorities"].append(priorities.i8())
        if alphas:
            model["alphas"].append(alphas.i8())
    if model["types"] is not None and not any(model["types"]):
        model["types"] = None
    if model["textures"] is not None and all(t == -1 for t in model["textures"]):
        model["textures"] = None


def _decode_old(data):
    header = Reader(data, len(data) - 18)
    vertices, faces, texture_faces = header.u16(), header.u16(), header.u8()
    textured, priority, has_alphas, has_alpha_groups, has_groups = header.u8(), header.u8(), header.u8(), header.u8(), header.u8()
    x_length, y_length, z_length, index_length = header.u16(), header.u16(), header.u16(), header.u16()
    position = vertices
    face_types_at = position
    position += faces
    priorities_at = position
    position += faces if priority == 255 else 0
    position += faces if has_alpha_groups else 0
    texture_flags_at = position
    position += faces if textured else 0
    groups_at = position
    position += vertices if has_groups else 0
    alphas_at = position
    position += faces if has_alphas else 0
    indices_at = position
    position += index_length
    colors_at = position
    position += faces * 2 + texture_faces * 6
    x_at = position
    y_at = x_at + x_length
    z_at = y_at + y_length
    model = _new_model(faces, priority)
    _vertices(model, data, vertices, 0, x_at, y_at, z_at, groups_at if has_groups else None)
    _face_attributes(model, data, faces, colors_at, texture_flags_at if textured else None, priorities_at,
                     alphas_at if has_alphas else None, None, True)
    _faces(model, data, faces, face_types_at, indices_at)
    return model


def _decode_type2(data):
    header = Reader(data, len(data) - 23)
    vertices, faces, texture_faces = header.u16(), header.u16(), header.u8()
    textured, priority, has_alphas, has_alpha_groups, has_groups, has_skeletal = (header.u8() for _ in range(6))
    x_length, y_length, z_length, index_length, groups_length = (header.u16() for _ in range(5))
    position = vertices
    face_types_at = position
    position += faces
    priorities_at = position
    position += faces if priority == 255 else 0
    position += faces if has_alpha_groups else 0
    texture_flags_at = position
    position += faces if textured else 0
    groups_at = position
    position += groups_length
    alphas_at = position
    position += faces if has_alphas else 0
    indices_at = position
    position += index_length
    colors_at = position
    position += faces * 2 + texture_faces * 6
    x_at = position
    y_at = x_at + x_length
    z_at = y_at + y_length
    model = _new_model(faces, priority)
    _vertices(model, data, vertices, 0, x_at, y_at, z_at, groups_at if has_groups else None)
    _face_attributes(model, data, faces, colors_at, texture_flags_at if textured else None, priorities_at,
                     alphas_at if has_alphas else None, None, True)
    _faces(model, data, faces, face_types_at, indices_at)
    return model


def _decode_textured(data, header_length):
    # model types 1 and 3 (header_length 26 and 23)
    header = Reader(data, len(data) - header_length)
    vertices, faces, texture_faces = header.u16(), header.u16(), header.u8()
    has_types, priority, has_alphas, has_alpha_groups, has_textures, has_groups = (header.u8() for _ in range(6))
    has_skeletal = header.u8() if header_length == 26 else 0
    x_length, y_length, z_length, index_length, texture_coords_length = (header.u16() for _ in range(5))
    groups_length = header.u16() if header_length == 26 else (vertices if has_groups else 0)
    position = texture_faces + vertices
    types_at = position
    position += faces if has_types else 0
    face_types_at = position
    position += faces
    priorities_at = position
    position += faces if priority == 255 else 0
    position += faces if has_alpha_groups else 0
    groups_at = position
    position += groups_length
    alphas_at = position
    position += faces if has_alphas else 0
    indices_at = position
    position += index_length
    textures_at = position
    position += faces * 2 if has_textures else 0
    position += texture_coords_length
    colors_at = position
    position += faces * 2
    x_at = position
    y_at = x_at + x_length
    z_at = y_at + y_length
    model = _new_model(faces, priority)
    _vertices(model, data, vertices, texture_faces, x_at, y_at, z_at, groups_at if has_groups else None)
    _face_attributes(model, data, faces, colors_at, types_at if has_types else None, priorities_at,
                     alphas_at if has_alphas else None, textures_at if has_textures else None, False)
    _faces(model, data, faces, face_types_at, indices_at)
    return model


def decode(data):
    if data[-2] == 0xFF and data[-1] == 0xFD:
        return _decode_textured(data, 26)
    if data[-2] == 0xFF and data[-1] == 0xFE:
        return _decode_type2(data)
    if data[-2] == 0xFF and data[-1] == 0xFF:
        return _decode_textured(data, 23)
    return _decode_old(data)
