export const FIRE_WIDTH = 96;
export const FIRE_HEIGHT = 144;
const COOLING = 3.8;
const SEED_ROWS = 3;
const SEED_BLUR = 3;
const FLICKER = 0.15;
const HIDDEN_ROWS = 8;
const VISIBLE_CELLS = (FIRE_HEIGHT - HIDDEN_ROWS) * FIRE_WIDTH;
const FRAME_MS = 40;
export const LOGIN_ART = { width: 1089, height: 503, rimY: 266, brazierX: [205, 884], bowlWidth: 120 };
const PALETTE_STOPS = [
  [0, 0, 0, 0, 0],
  [30, 90, 0, 0, 0],
  [60, 170, 25, 0, 170],
  [100, 230, 95, 0, 235],
  [140, 255, 170, 0, 255],
  [180, 255, 220, 50, 255],
  [255, 255, 250, 150, 255],
];
export const PALETTE = buildPalette();

function buildPalette() {
  const palette = new Uint8ClampedArray(256 * 4);
  for (let heat = 0; heat < 256; heat++) {
    const upper = PALETTE_STOPS.findIndex(([stop]) => stop >= heat);
    const [high, ...highColor] = PALETTE_STOPS[upper];
    const [low, ...lowColor] = PALETTE_STOPS[Math.max(0, upper - 1)];
    const t = high === low ? 0 : (heat - low) / (high - low);
    lowColor.forEach((value, channel) => (palette[heat * 4 + channel] = value + (highColor[channel] - value) * t));
  }
  return palette;
}

/** One frame of the fire: soft hot spots flicker along the bowl, and each pixel above averages the ones beneath it, flickering and cooling as it rises. */
export function stepFire(heat, random = Math.random) {
  const center = (FIRE_WIDTH - 1) / 2;
  const at = (y, x) => heat[y * FIRE_WIDTH + Math.min(FIRE_WIDTH - 1, Math.max(0, x))];
  const sparks = Array.from({ length: FIRE_WIDTH }, () => (random() < 0.6 ? 255 : 40));
  for (let x = 0; x < FIRE_WIDTH; x++) {
    const edge = Math.max(0, 1 - ((x - center) / (FIRE_WIDTH / 2)) ** 2);
    let sum = 0;
    for (let k = -SEED_BLUR; k <= SEED_BLUR; k++) sum += sparks[Math.min(FIRE_WIDTH - 1, Math.max(0, x + k))];
    for (let y = FIRE_HEIGHT - SEED_ROWS; y < FIRE_HEIGHT; y++) heat[y * FIRE_WIDTH + x] = (sum / (SEED_BLUR * 2 + 1)) * edge;
  }
  for (let y = 0; y < FIRE_HEIGHT - SEED_ROWS; y++) {
    const sway = random() < FLICKER ? (random() < 0.5 ? -1 : 1) : 0;
    for (let x = 0; x < FIRE_WIDTH; x++) {
      const sum = at(y + 1, x - 1 + sway) + at(y + 1, x + sway) + at(y + 1, x + 1 + sway) + at(y + 2, x + sway);
      heat[y * FIRE_WIDTH + x] = sum / 4 - COOLING * random();
    }
  }
}

/** The OSRS login art with animated fire in both braziers, kept in place as the window resizes. */
export function createLoginScene(document, window) {
  const scene = document.createElement('div');
  scene.id = 'osrs-login-scene';
  const flames = LOGIN_ART.brazierX.map((x) => {
    const canvas = document.createElement('canvas');
    canvas.width = FIRE_WIDTH;
    canvas.height = FIRE_HEIGHT;
    canvas.className = 'osrs-fire';
    scene.append(canvas);
    const context = canvas.getContext('2d');
    return { x, canvas, context, heat: new Uint8ClampedArray(FIRE_WIDTH * FIRE_HEIGHT), image: context.createImageData(FIRE_WIDTH, FIRE_HEIGHT) };
  });
  let frame = null;
  let last = 0;

  function layout() {
    const scale = Math.max(window.innerWidth / LOGIN_ART.width, window.innerHeight / LOGIN_ART.height);
    const left = (window.innerWidth - LOGIN_ART.width * scale) / 2;
    const top = (window.innerHeight - LOGIN_ART.height * scale) / 2;
    const width = LOGIN_ART.bowlWidth * scale;
    const height = (width * FIRE_HEIGHT) / FIRE_WIDTH;
    for (const flame of flames) {
      Object.assign(flame.canvas.style, {
        left: `${left + flame.x * scale - width / 2}px`,
        top: `${top + LOGIN_ART.rimY * scale - height + (HIDDEN_ROWS * height) / FIRE_HEIGHT - 3 * scale}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
    }
  }

  function paint() {
    for (const flame of flames) {
      for (let i = 0; i < VISIBLE_CELLS; i++) flame.image.data.set(PALETTE.subarray(flame.heat[i] * 4, flame.heat[i] * 4 + 4), i * 4);
      flame.context.putImageData(flame.image, 0, 0);
    }
  }

  function draw(time) {
    frame = window.requestAnimationFrame(draw);
    if (time - last < FRAME_MS) return;
    last = time;
    for (const flame of flames) stepFire(flame.heat);
    paint();
  }

  return {
    show() {
      if (scene.isConnected) return;
      for (const flame of flames) for (let i = 0; i < FIRE_HEIGHT * 2; i++) stepFire(flame.heat);
      document.body.prepend(scene);
      layout();
      paint();
      window.addEventListener('resize', layout);
      frame = window.requestAnimationFrame(draw);
    },
    hide() {
      if (!scene.isConnected) return;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', layout);
      scene.remove();
    },
  };
}
