import assert from 'node:assert';
import { test } from 'node:test';
import { FIRE_HEIGHT, FIRE_WIDTH, PALETTE, stepFire } from '../mod/fire.mjs';
import { createRecolorer, osrsNeutral } from '../mod/palette.mjs';

test('the fire burns hottest at the base and cools as it rises', () => {
  const heat = new Uint8ClampedArray(FIRE_WIDTH * FIRE_HEIGHT);
  for (let i = 0; i < 80; i++) stepFire(heat);
  const row = (y) => heat.slice(y * FIRE_WIDTH, (y + 1) * FIRE_WIDTH).reduce((a, b) => a + b, 0);
  assert.ok(row(FIRE_HEIGHT - 2) > row(FIRE_HEIGHT / 2), 'hotter near the base');
  assert.ok(row(FIRE_HEIGHT / 2) > row(0), 'cooler at the top');
  assert.ok(heat[(FIRE_HEIGHT - 2) * FIRE_WIDTH + FIRE_WIDTH / 2] > heat[(FIRE_HEIGHT - 2) * FIRE_WIDTH], 'hotter in the middle of the bowl');
});

test('cold is transparent and the hottest flame is bright yellow', () => {
  assert.strictEqual(PALETTE[3], 0);
  const [r, g, b, a] = PALETTE.subarray(255 * 4, 256 * 4);
  assert.ok(r === 255 && g > 200 && b < 200 && a === 255);
});

test('greys and blue-greys become OSRS browns; accents are left alone', () => {
  const [r, g, b] = osrsNeutral(35, 42, 53);
  assert.ok(r > g && g > b, 'warm brown');
  assert.strictEqual(osrsNeutral(70, 195, 123), null, 'green stays');
});

test('recolouring inline greys can be undone', () => {
  const set = [];
  const element = { style: { setProperty: (p, v) => set.push([p, v]), removeProperty: (p) => set.push(['removed', p]) } };
  const root = { ...element, querySelectorAll: () => [] };
  const window = { getComputedStyle: () => ({ getPropertyValue: (p) => (p === 'background-color' ? 'rgb(35, 42, 53)' : 'rgba(0, 0, 0, 0)') }) };
  const recolorer = createRecolorer(window);
  recolorer.recolor(root);
  assert.strictEqual(set.length, 1);
  assert.strictEqual(set[0][0], 'background-color');
  recolorer.clear();
  assert.deepStrictEqual(set.at(-1), ['removed', 'background-color']);
});
