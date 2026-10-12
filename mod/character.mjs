const ANGLE = (2 * Math.PI) / 2048;
const SINE = Int32Array.from({ length: 2048 }, (_, i) => Math.trunc(65536 * Math.sin(i * ANGLE)));
const COSINE = Int32Array.from({ length: 2048 }, (_, i) => Math.trunc(65536 * Math.cos(i * ANGLE)));
const KIT_SLOTS = [8, 11, 4, 6, 9, 7, 10];
const BODY_RECOLOR_FROM = [6798, 8741, 25238, 4626, 4550];
const BODY_RECOLOR_TO = [
  [6798, 107, 10283, 16, 4797, 7744, 5799, 4634, -31839, 22433, 2983, -11343, 8, 5281, 10438, 3650, -27322, -21845, 200, 571, 908, 21830, 28946, -15701, -14010],
  [8741, 12, -1506, -22374, 7735, 8404, 1701, -27106, 24094, 10153, -8915, 4783, 1341, 16578, -30533, 25239, 8, 5281, 10438, 3650, -27322, -21845, 200, 571, 908, 21830, 28946, -15701, -14010],
  [25238, 8742, 12, -1506, -22374, 7735, 8404, 1701, -27106, 24094, 10153, -8915, 4783, 1341, 16578, -30533, 8, 5281, 10438, 3650, -27322, -21845, 200, 571, 908, 21830, 28946, -15701, -14010],
  [4626, 11146, 6439, 12, 4758, 10270],
  [4550, 4537, 5681, 5673, 5790, 6806, 8076, 4574],
];
const BODY_RECOLOR2_FROM = [-10304, 9104, -1, -1, -1];
const BODY_RECOLOR2_TO = [
  [6554, 115, 10304, 28, 5702, 7756, 5681, 4510, -31835, 22437, 2859, -11339, 16, 5157, 10446, 3658, -27314, -21965, 472, 580, 784, 21966, 28950, -15697, -14002],
  [9104, 10275, 7595, 3610, 7975, 8526, 918, -26734, 24466, 10145, -6882, 5027, 1457, 16565, -30545, 25486, 24, 5392, 10429, 3673, -27335, -21957, 192, 687, 412, 21821, 28835, -15460, -14019],
  [], [], [],
];
export const DEFAULT_COLORS = [0, 6, 9, 0, 1];
const PLAYER_LIGHT = [64, 850, -30, -50, -30];
const HAND_ITEM_OFFSET = 512;
const WEAPON_SLOT = 3;
const SHIELD_SLOT = 5;
export const STAND_POSE = 808;
const BRIGHTNESS = 0.6;

function sums(deltas, start, length) {
  const values = new Int32Array(length);
  for (let i = 0, total = 0; i < length; i++) values[i] = total += deltas[start + i];
  return values;
}

function fromCompact(compact) {
  const faces = compact.c.length;
  const vertices = compact.v.length / 3;
  const corners = sums(compact.f, 0, faces * 3);
  return {
    vx: sums(compact.v, 0, vertices),
    vy: sums(compact.v, vertices, vertices),
    vz: sums(compact.v, vertices * 2, vertices),
    groups: compact.g ? Int16Array.from(compact.g) : new Int16Array(vertices).fill(-1),
    fa: Int32Array.from({ length: faces }, (_, i) => corners[i * 3]),
    fb: Int32Array.from({ length: faces }, (_, i) => corners[i * 3 + 1]),
    fc: Int32Array.from({ length: faces }, (_, i) => corners[i * 3 + 2]),
    colors: Uint16Array.from(compact.c),
    types: compact.t ? Int8Array.from(compact.t) : null,
    priorities: compact.p ? Int8Array.from(compact.p) : null,
    priority: compact.priority ?? 0,
    alphas: compact.a ? Int8Array.from(compact.a) : null,
    textures: compact.x ? Int16Array.from(compact.x) : null,
  };
}

function merge(models) {
  const vertexCount = models.reduce((sum, m) => sum + m.vx.length, 0);
  const faceCount = models.reduce((sum, m) => sum + m.colors.length, 0);
  const perFacePriority = models.some((m) => m.priorities) || new Set(models.map((m) => m.priority)).size > 1;
  const merged = {
    vx: new Int32Array(vertexCount), vy: new Int32Array(vertexCount), vz: new Int32Array(vertexCount), groups: new Int16Array(vertexCount),
    fa: new Int32Array(faceCount), fb: new Int32Array(faceCount), fc: new Int32Array(faceCount), colors: new Uint16Array(faceCount),
    types: models.some((m) => m.types) ? new Int8Array(faceCount) : null,
    priorities: perFacePriority ? new Int8Array(faceCount) : null,
    priority: models[0]?.priority ?? 0,
    alphas: models.some((m) => m.alphas) ? new Int8Array(faceCount) : null,
    textures: models.some((m) => m.textures) ? new Int16Array(faceCount).fill(-1) : null,
  };
  let vertexBase = 0;
  let faceBase = 0;
  for (const model of models) {
    merged.vx.set(model.vx, vertexBase);
    merged.vy.set(model.vy, vertexBase);
    merged.vz.set(model.vz, vertexBase);
    merged.groups.set(model.groups, vertexBase);
    for (let face = 0; face < model.colors.length; face++) {
      merged.fa[faceBase + face] = model.fa[face] + vertexBase;
      merged.fb[faceBase + face] = model.fb[face] + vertexBase;
      merged.fc[faceBase + face] = model.fc[face] + vertexBase;
    }
    merged.colors.set(model.colors, faceBase);
    if (model.types) merged.types.set(model.types, faceBase);
    if (merged.priorities) {
      if (model.priorities) merged.priorities.set(model.priorities, faceBase);
      else merged.priorities.fill(model.priority, faceBase, faceBase + model.colors.length);
    }
    if (model.alphas) merged.alphas.set(model.alphas, faceBase);
    if (model.textures) merged.textures.set(model.textures, faceBase);
    vertexBase += model.vx.length;
    faceBase += model.colors.length;
  }
  return merged;
}

function recolor(model, from, to) {
  from &= 0xffff;
  to &= 0xffff;
  for (let face = 0; face < model.colors.length; face++) if (model.colors[face] === from) model.colors[face] = to;
}

function retexture(model, from, to) {
  if (!model.textures) return;
  for (let face = 0; face < model.textures.length; face++) if (model.textures[face] === from) model.textures[face] = to;
}

function partModel(data, modelIds, recolors, retextures) {
  const models = modelIds.filter((id) => id !== -1 && data.models[id]).map((id) => fromCompact(data.models[id]));
  if (!models.length) return null;
  const model = merge(models);
  for (const [from, to] of recolors) recolor(model, from, to);
  for (const [from, to] of retextures) retexture(model, from, to);
  return model;
}

function wornModel(data, item, female) {
  const model = partModel(data, female ? item.female : item.male, item.recolor, item.retexture);
  const offset = female ? item.female_offset : item.male_offset;
  if (model && offset) for (let i = 0; i < model.vy.length; i++) model.vy[i] += offset;
  return model;
}

/** The OSRS player model wearing the given items, merged slot by slot the way the game client does. An animation's hand items replace the weapon and shield. */
export function playerModel(data, itemIds, { female = false, colors = DEFAULT_COLORS, hands = { left: -1, right: -1 } } = {}) {
  const slots = new Array(12).fill(null);
  for (const kitId of data.defaults[female ? 'female' : 'male']) {
    const kit = data.kits[kitId];
    if (kit) slots[KIT_SLOTS[kit.part % 7]] = { kit };
  }
  const items = itemIds.map((id) => data.items[id]).filter((item) => item && item.wear_pos[0] >= 0);
  for (const item of items) for (const slot of item.wear_pos.slice(1)) if (slot >= 0 && slots[slot]?.kit) slots[slot] = null;
  for (const item of items) slots[item.wear_pos[0]] = { item };
  const held = (value) => (value >= HAND_ITEM_OFFSET && data.items[value - HAND_ITEM_OFFSET] ? { item: data.items[value - HAND_ITEM_OFFSET] } : null);
  if (hands.right !== -1) slots[WEAPON_SLOT] = held(hands.right);
  if (hands.left !== -1) slots[SHIELD_SLOT] = hands.left === hands.right ? null : held(hands.left);
  const parts = slots
    .map((entry) => entry && (entry.kit ? partModel(data, entry.kit.models, entry.kit.recolor, entry.kit.retexture) : wornModel(data, entry.item, female)))
    .filter(Boolean);
  const model = merge(parts);
  colors.forEach((color, part) => {
    if (color < BODY_RECOLOR_TO[part].length) recolor(model, BODY_RECOLOR_FROM[part], BODY_RECOLOR_TO[part][color]);
    if (BODY_RECOLOR2_FROM[part] !== -1 && color < BODY_RECOLOR2_TO[part].length) recolor(model, BODY_RECOLOR2_FROM[part], BODY_RECOLOR2_TO[part][color]);
  });
  return model;
}

function shade(color, light) {
  return (color & 0xff80) + Math.min(126, Math.max(2, ((color & 127) * light) >> 7));
}

/** Bakes lighting into per-vertex face colours at the rest pose, as the client does before animating. */
export function light(model, [ambient, contrast, x, y, z] = PLAYER_LIGHT) {
  const vertexCount = model.vx.length;
  const faceCount = model.colors.length;
  const normalX = new Int32Array(vertexCount), normalY = new Int32Array(vertexCount), normalZ = new Int32Array(vertexCount), normalCount = new Int32Array(vertexCount);
  const faceNormals = new Int32Array(faceCount * 3);
  for (let face = 0; face < faceCount; face++) {
    const a = model.fa[face], b = model.fb[face], c = model.fc[face];
    const xA = model.vx[b] - model.vx[a], yA = model.vy[b] - model.vy[a], zA = model.vz[b] - model.vz[a];
    const xB = model.vx[c] - model.vx[a], yB = model.vy[c] - model.vy[a], zB = model.vz[c] - model.vz[a];
    let nx = yA * zB - yB * zA, ny = zA * xB - zB * xA, nz = xA * yB - xB * yA;
    while (nx > 8192 || ny > 8192 || nz > 8192 || nx < -8192 || ny < -8192 || nz < -8192) {
      nx >>= 1;
      ny >>= 1;
      nz >>= 1;
    }
    const length = Math.trunc(Math.sqrt(nx * nx + ny * ny + nz * nz)) || 1;
    nx = Math.trunc((nx * 256) / length);
    ny = Math.trunc((ny * 256) / length);
    nz = Math.trunc((nz * 256) / length);
    const type = model.types ? model.types[face] : 0;
    if (type === 0) {
      for (const vertex of [a, b, c]) {
        normalX[vertex] += nx;
        normalY[vertex] += ny;
        normalZ[vertex] += nz;
        normalCount[vertex]++;
      }
    } else if (type === 1) {
      faceNormals.set([nx, ny, nz], face * 3);
    }
  }
  const scale = (Math.trunc(Math.sqrt(x * x + y * y + z * z)) * contrast) >> 8;
  const vertexLight = (vertex) => Math.trunc((y * normalY[vertex] + z * normalZ[vertex] + x * normalX[vertex]) / (scale * normalCount[vertex])) + ambient;
  const colors1 = new Int32Array(faceCount), colors2 = new Int32Array(faceCount), colors3 = new Int32Array(faceCount);
  for (let face = 0; face < faceCount; face++) {
    let type = model.types ? model.types[face] : 0;
    const alpha = model.alphas ? model.alphas[face] : 0;
    const textured = model.textures && model.textures[face] !== -1;
    if (alpha === -2) type = 3;
    if (alpha === -1) type = 2;
    const color = textured ? 0 : model.colors[face];
    const tone = textured ? (value) => Math.min(126, Math.max(2, value)) : (value) => shade(color, value);
    if (type === 0) {
      colors1[face] = tone(vertexLight(model.fa[face]));
      colors2[face] = tone(vertexLight(model.fb[face]));
      colors3[face] = tone(vertexLight(model.fc[face]));
    } else if (type === 1) {
      const n = face * 3;
      colors1[face] = tone(Math.trunc((y * faceNormals[n + 1] + z * faceNormals[n + 2] + x * faceNormals[n]) / (scale / 2 + scale)) + ambient);
      colors3[face] = -1;
    } else if (type === 3 && !textured) {
      colors1[face] = 128;
      colors3[face] = -1;
    } else {
      colors3[face] = -2;
    }
  }
  return { ...model, vx: model.vx.slice(), vy: model.vy.slice(), vz: model.vz.slice(), colors1, colors2, colors3 };
}

/** Moves the model's vertices into one frame of an animation, using the skeleton's vertex groups. */
/** A copy of the model moved into one animation frame, using the skeleton's vertex groups. */
export function animate(model, skeleton, transforms) {
  const groups = [];
  model.groups.forEach((group, vertex) => {
    if (group >= 0) (groups[group] ??= []).push(vertex);
  });
  const vx = model.vx.slice(), vy = model.vy.slice(), vz = model.vz.slice();
  let originX = 0, originY = 0, originZ = 0;
  for (const [entry, dx, dy, dz] of transforms) {
    const type = skeleton.types[entry];
    const members = skeleton.groups[entry].flatMap((group) => groups[group] ?? []);
    if (type === 0) {
      let count = 0;
      originX = originY = originZ = 0;
      for (const v of members) {
        originX += vx[v];
        originY += vy[v];
        originZ += vz[v];
        count++;
      }
      originX = dx + (count ? Math.trunc(originX / count) : 0);
      originY = dy + (count ? Math.trunc(originY / count) : 0);
      originZ = dz + (count ? Math.trunc(originZ / count) : 0);
    } else if (type === 1) {
      for (const v of members) {
        vx[v] += dx;
        vy[v] += dy;
        vz[v] += dz;
      }
    } else if (type === 2) {
      const pitch = (dx & 255) * 8, yaw = (dy & 255) * 8, roll = (dz & 255) * 8;
      for (const v of members) {
        let x = vx[v] - originX, y = vy[v] - originY, z = vz[v] - originZ;
        if (roll) {
          const sin = SINE[roll], cos = COSINE[roll];
          const rotated = (sin * y + cos * x) >> 16;
          y = (cos * y - sin * x) >> 16;
          x = rotated;
        }
        if (pitch) {
          const sin = SINE[pitch], cos = COSINE[pitch];
          const rotated = (cos * y - sin * z) >> 16;
          z = (sin * y + cos * z) >> 16;
          y = rotated;
        }
        if (yaw) {
          const sin = SINE[yaw], cos = COSINE[yaw];
          const rotated = (sin * z + cos * x) >> 16;
          z = (cos * z - sin * x) >> 16;
          x = rotated;
        }
        vx[v] = x + originX;
        vy[v] = y + originY;
        vz[v] = z + originZ;
      }
    } else if (type === 3) {
      for (const v of members) {
        vx[v] = Math.trunc((dx * (vx[v] - originX)) / 128) + originX;
        vy[v] = Math.trunc((dy * (vy[v] - originY)) / 128) + originY;
        vz[v] = Math.trunc((dz * (vz[v] - originZ)) / 128) + originZ;
      }
    }
  }
  return { ...model, vx, vy, vz };
}

/** Face draw order, back to front, with the client's interleaving of priority 10 and 11 faces. */
function drawOrder(model, depth, radius, visible) {
  const faceCount = model.colors.length;
  const buckets = Array.from({ length: radius * 2 + 1 }, () => []);
  for (let face = 0; face < faceCount; face++) {
    if (!visible[face]) continue;
    const bucket = Math.trunc((depth[model.fa[face]] + depth[model.fb[face]] + depth[model.fc[face]]) / 3) + radius;
    buckets[Math.min(buckets.length - 1, Math.max(0, bucket))].push(face);
  }
  const order = [];
  if (!model.priorities) {
    for (let bucket = buckets.length - 1; bucket >= 0; bucket--) order.push(...buckets[bucket]);
    return order;
  }
  const byPriority = Array.from({ length: 12 }, () => []);
  const depthSum = new Array(12).fill(0);
  const depth10 = [];
  const depth11 = [];
  for (let bucket = buckets.length - 1; bucket >= 0; bucket--) {
    for (const face of buckets[bucket]) {
      const priority = model.priorities[face];
      byPriority[priority].push(face);
      if (priority < 10) depthSum[priority] += bucket;
      else (priority === 10 ? depth10 : depth11).push(bucket);
    }
  }
  const average = (a, b) => (byPriority[a].length + byPriority[b].length ? Math.trunc((depthSum[a] + depthSum[b]) / (byPriority[a].length + byPriority[b].length)) : 0);
  const averages = { 0: average(1, 2), 3: average(3, 4), 5: average(6, 8) };
  let list = byPriority[10], depths = depth10, index = 0;
  if (!list.length) {
    list = byPriority[11];
    depths = depth11;
  }
  let next = index < list.length ? depths[index] : -1000;
  const drawNext = () => {
    order.push(list[index++]);
    if (index === list.length && list !== byPriority[11]) {
      list = byPriority[11];
      depths = depth11;
      index = 0;
    }
    next = index < list.length ? depths[index] : -1000;
  };
  for (let priority = 0; priority < 10; priority++) {
    if (priority in averages) while (next > averages[priority]) drawNext();
    order.push(...byPriority[priority]);
  }
  while (next !== -1000) drawNext();
  return order;
}

function lowestPoint(model, yawSin, yawCos, pitchSin, pitchCos) {
  let lowest = -Infinity;
  for (let v = 0; v < model.vx.length; v++) {
    const z1 = (model.vz[v] * yawCos - model.vx[v] * yawSin) >> 16;
    lowest = Math.max(lowest, (model.vy[v] * pitchCos - z1 * pitchSin) >> 16);
  }
  return lowest;
}

function cylinderBounds(model, pitchSin, pitchCos) {
  let radius = 0, top = Infinity, bottom = -Infinity;
  for (let v = 0; v < model.vx.length; v++) {
    radius = Math.max(radius, Math.hypot(model.vx[v], model.vz[v]));
    top = Math.min(top, model.vy[v]);
    bottom = Math.max(bottom, model.vy[v]);
  }
  let minY = Infinity, maxY = -Infinity;
  for (const y of [top, bottom]) {
    for (const z of [-radius, radius]) {
      const projected = (y * pitchCos - z * pitchSin) / 65536;
      minY = Math.min(minY, projected);
      maxY = Math.max(maxY, projected);
    }
  }
  return { minX: -radius, maxX: radius, minY, maxY };
}

function hslToRgb(hsl, brightness) {
  const hue = (hsl >> 10 & 63) / 64 + 0.5 / 64;
  const saturation = (hsl >> 7 & 7) / 8 + 0.5 / 8;
  const luminance = (hsl & 127) / 128;
  const chroma = (1 - Math.abs(2 * luminance - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1));
  const lightness = luminance - chroma / 2;
  let r = lightness, g = lightness, b = lightness;
  switch (Math.trunc(hue * 6)) {
    case 0: r += chroma; g += x; break;
    case 1: g += chroma; r += x; break;
    case 2: g += chroma; b += x; break;
    case 3: b += chroma; g += x; break;
    case 4: b += chroma; r += x; break;
    default: r += chroma; b += x; break;
  }
  const rgb = (Math.trunc(r * 256) << 16) | (Math.trunc(g * 256) << 8) | Math.trunc(b * 256);
  const channel = (value) => Math.trunc(Math.pow(value / 256, brightness) * 256);
  return [channel(rgb >> 16), channel(rgb >> 8 & 255), channel(rgb & 255)];
}

function buildPalette(brightness) {
  const palette = new Uint8Array(65536 * 4);
  for (let hsl = 0; hsl < 65536; hsl++) {
    palette.set(hslToRgb(hsl, brightness).map((value) => Math.min(255, value)), hsl * 4);
    palette[hsl * 4 + 3] = 255;
  }
  return palette;
}

const VERTEX_SHADER = `
attribute vec2 position;
attribute float hsl;
attribute float opacity;
uniform vec2 size;
varying float vHsl;
varying float vOpacity;
void main() {
  vHsl = hsl;
  vOpacity = opacity;
  gl_Position = vec4(position.x / size.x * 2.0 - 1.0, 1.0 - position.y / size.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D palette;
varying float vHsl;
varying float vOpacity;
void main() {
  float index = floor(vHsl + 0.5);
  float row = floor(index / 256.0);
  gl_FragColor = vec4(texture2D(palette, (vec2(index - row * 256.0, row) + 0.5) / 256.0).rgb, vOpacity);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

/** Draws lit, posed player models onto a canvas the way the OSRS client rasterises them, back to front. */
export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  gl.useProgram(program);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildPalette(BRIGHTNESS));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const buffer = gl.createBuffer();
  const attributes = ['position', 'hsl', 'opacity'].map((name) => gl.getAttribLocation(program, name));
  const sizeUniform = gl.getUniformLocation(program, 'size');
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  return {
    /**
     * yaw and pitch are in OSRS angle units (2048 per turn). With a reference model, the view fits that model's
     * upright bounding cylinder instead of the drawn model, so the framing holds still through an animation and while turning.
     * Returns the canvas rows of the model's lowest point and of the ground under its centre, the pixels per model unit,
     * and how much the camera's pitch flattens a circle on the ground.
     */
    draw(model, { yaw = 0, pitch = 96, padding = 0.06, reference = null } = {}) {
      const vertexCount = model.vx.length;
      const screenX = new Float64Array(vertexCount), screenY = new Float64Array(vertexCount), depth = new Int32Array(vertexCount);
      const yawSin = SINE[yaw & 2047], yawCos = COSINE[yaw & 2047], pitchSin = SINE[pitch & 2047], pitchCos = COSINE[pitch & 2047];
      let radius = 0;
      for (let v = 0; v < vertexCount; v++) {
        const x0 = model.vx[v], y0 = model.vy[v], z0 = model.vz[v];
        radius = Math.max(radius, Math.ceil(Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0)));
        const x = (z0 * yawSin + x0 * yawCos) >> 16;
        const z1 = (z0 * yawCos - x0 * yawSin) >> 16;
        const y = (y0 * pitchCos - z1 * pitchSin) >> 16;
        const z = (y0 * pitchSin + z1 * pitchCos) >> 16;
        screenX[v] = x;
        screenY[v] = y;
        depth[v] = z;
      }
      const faceCount = model.colors.length;
      const visible = new Uint8Array(faceCount);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let face = 0; face < faceCount; face++) {
        if (model.colors3[face] === -2) continue;
        const a = model.fa[face], b = model.fb[face], c = model.fc[face];
        if ((screenX[a] - screenX[b]) * (screenY[c] - screenY[b]) - (screenX[c] - screenX[b]) * (screenY[a] - screenY[b]) <= 0) continue;
        visible[face] = 1;
        for (const v of [a, b, c]) {
          minX = Math.min(minX, screenX[v]);
          maxX = Math.max(maxX, screenX[v]);
          minY = Math.min(minY, screenY[v]);
          maxY = Math.max(maxY, screenY[v]);
        }
      }
      const lowest = reference ? lowestPoint(reference, yawSin, yawCos, pitchSin, pitchCos) : maxY;
      if (reference) ({ minX, maxX, minY, maxY } = cylinderBounds(reference, pitchSin, pitchCos));
      const width = canvas.width, height = canvas.height;
      const fit = Math.min((width * (1 - 2 * padding)) / (maxX - minX), (height * (1 - 2 * padding)) / (maxY - minY));
      const offsetX = width / 2 - ((minX + maxX) / 2) * fit, offsetY = height / 2 - ((minY + maxY) / 2) * fit;
      const order = drawOrder(model, depth, radius, visible);
      const vertices = new Float32Array(order.length * 3 * 4);
      let at = 0;
      for (const face of order) {
        const flat = model.colors3[face] === -1;
        const tones = flat ? [model.colors1[face], model.colors1[face], model.colors1[face]] : [model.colors1[face], model.colors2[face], model.colors3[face]];
        const opacity = model.alphas ? 1 - (model.alphas[face] & 255) / 256 : 1;
        [model.fa[face], model.fb[face], model.fc[face]].forEach((v, corner) => {
          vertices.set([screenX[v] * fit + offsetX, screenY[v] * fit + offsetY, tones[corner], opacity], at);
          at += 4;
        });
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(sizeUniform, width, height);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      [2, 1, 1].forEach((components, i) => {
        gl.enableVertexAttribArray(attributes[i]);
        gl.vertexAttribPointer(attributes[i], components, gl.FLOAT, false, 16, [0, 8, 12][i]);
      });
      gl.drawArrays(gl.TRIANGLES, 0, order.length * 3);
      return { ground: lowest * fit + offsetY, origin: offsetY, scale: fit, tilt: pitchSin / 65536 };
    },
  };
}

/** A posed, lit player model ready to draw. */
/** A lit player model at rest, wearing the given items and holding whatever the animation puts in the hands. */
export function litPlayer(data, itemIds, { pose = STAND_POSE, ...options } = {}) {
  const { left, right } = data.poses[pose];
  return light(playerModel(data, itemIds, { ...options, hands: { left, right } }));
}

/** The lit player model moved into one frame of an animation. */
export function poseFrame(data, model, pose, frame) {
  const { skeleton, frames } = data.poses[pose];
  return animate(model, data.skeletons[skeleton], frames[frame % frames.length]);
}

/** A posed, lit player model ready to draw. */
export function posedPlayer(data, itemIds, options = {}) {
  return poseFrame(data, litPlayer(data, itemIds, options), options.pose ?? STAND_POSE, options.frame ?? 0);
}
