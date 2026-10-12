import { FIRE_WIDTH, FIRE_HEIGHT, PALETTE, stepFire } from '../../melvor-osrs-theme/mod/fire.mjs';

const heat = new Uint8ClampedArray(FIRE_WIDTH * FIRE_HEIGHT);
for (let i = 0; i < FIRE_HEIGHT * 3; i++) stepFire(heat);
const pixels = Buffer.alloc(FIRE_WIDTH * FIRE_HEIGHT * 4);
heat.forEach((value, i) => pixels.set(PALETTE.subarray(value * 4, value * 4 + 4), i * 4));
process.stdout.write(JSON.stringify({ width: FIRE_WIDTH, height: FIRE_HEIGHT, rgba: pixels.toString('base64') }));
