import assert from 'node:assert';
import { test } from 'node:test';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const realNow = Date.now;
const HOUR = 3600000;

function fakeDocument() {
  const make = (tag) => {
    const listeners = {};
    const node = {
      tagName: tag.toUpperCase(),
      children: [],
      attributes: {},
      className: '',
      textContent: '',
      value: '',
      checked: false,
      disabled: false,
      parent: null,
      classList: { names: new Set(), toggle(name, on) { if (on) this.names.add(name); else this.names.delete(name); }, contains(name) { return this.names.has(name); } },
      append(...nodes) { nodes.forEach((child) => { child.parent = node; node.children.push(child); }); },
      remove() { if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node); node.parent = null; },
      setAttribute(name, value) { node.attributes[name] = value; },
      addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
      fire(type) { (listeners[type] ?? []).forEach((fn) => fn()); },
    };
    return node;
  };
  return { body: make('body'), createElement: make };
}

function find(root, className) {
  if (root.className.split(' ').includes(className)) return root;
  for (const child of root.children) {
    const found = find(child, className);
    if (found) return found;
  }
  return null;
}

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return { map, getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) };
}

async function boot({ stored = {} } = {}) {
  let now = Date.UTC(2026, 9, 15, 12);
  Date.now = () => now;
  const doc = fakeDocument();
  const storage = fakeStorage(stored);
  const intervals = [];
  const items = [];
  const fired = [];
  const validation = [];
  globalThis.document = doc;
  globalThis.localStorage = storage;
  globalThis.setInterval = (fn) => intervals.push(fn) && intervals.length;
  globalThis.clearInterval = (id) => (intervals[id - 1] = () => {});
  globalThis.sidebar = { category: (id) => ({ item: (itemId, config) => items.push({ category: id, id: itemId, ...config }) }) };
  globalThis.SwalLocale = {
    fire: (options) => new Promise((resolve) => fired.push({ ...options, press: (confirm) => resolve({ isConfirmed: confirm && options.preConfirm() !== false }) })),
    showValidationMessage: (message) => validation.push(message),
  };
  let ready;
  const stylesheets = [];
  const ctx = {
    getResourceUrl: (path) => `blob:${path}`,
    loadStylesheet: (path) => stylesheets.push(path),
    onInterfaceReady: (fn) => (ready = fn),
  };
  const module = await import(`../mod/setup.mjs?${Math.random()}`);
  module.setup(ctx);
  const screen = () => find(doc.body, 'idle-guard');
  return {
    doc, storage, items, fired, validation, stylesheets, ready, screen,
    advance: (ms) => {
      now += ms;
      intervals.forEach((fn) => fn());
    },
    now: () => now,
  };
}

test('helpers: lock length is clamped to 0 up to 72 hours, and times read like a clock', async () => {
  const { lockMinutes, formatLeft, formatLength } = await import(`../mod/setup.mjs?${Math.random()}`);
  assert.strictEqual(lockMinutes(1, 30), 90);
  assert.strictEqual(lockMinutes('0.5', ''), 30);
  assert.strictEqual(lockMinutes('', ''), 0);
  assert.strictEqual(lockMinutes(-1, 5), 0);
  assert.strictEqual(lockMinutes(500, 0), 72 * 60);
  assert.strictEqual(formatLeft(HOUR + 2 * 60000 + 5000), '1:02:05');
  assert.strictEqual(formatLeft(65000), '1:05');
  assert.strictEqual(formatLeft(400), '0:01');
  assert.strictEqual(formatLength(90), '1 hour 30 minutes');
  assert.strictEqual(formatLength(120), '2 hours');
  assert.strictEqual(formatLength(1), '1 minute');
});

test('a saved lock only counts while it has time left, and bad or unreadable storage means no lock', async () => {
  const { readLock } = await import(`../mod/setup.mjs?${Math.random()}`);
  const at = (value) => readLock(fakeStorage({ 'idleGuard:lock': value }), 1000);
  assert.deepStrictEqual(at(JSON.stringify({ until: 5000, hard: 1 })), { until: 5000, hard: true });
  assert.strictEqual(at(JSON.stringify({ until: 1000 })), null);
  assert.strictEqual(at('not json'), null);
  assert.strictEqual(readLock(fakeStorage(), 1000), null);
  assert.strictEqual(readLock({ getItem: () => { throw new Error('blocked'); } }, 1000), null);
});

test('the lock screen counts down, and its red Ignore only works after 10 seconds', async () => {
  const { createLockScreen } = await import(`../mod/setup.mjs?${Math.random()}`);
  let ended = 0;
  const { screen, update } = createLockScreen(fakeDocument(), { until: HOUR, hard: false }, 'blob:cage.png', 0, () => ended++);
  const ignore = find(screen, 'idle-guard-ignore');
  assert.strictEqual(find(screen, 'idle-guard-cage').src, 'blob:cage.png');
  assert.strictEqual(update(0), true);
  assert.strictEqual(find(screen, 'idle-guard-left').textContent, '1:00:00');
  assert.strictEqual(ignore.textContent, 'Ignore (10)');
  assert.strictEqual(ignore.disabled, true);
  ignore.fire('click');
  assert.strictEqual(ended, 0, 'a tap during the countdown does nothing');
  update(9500);
  assert.strictEqual(ignore.textContent, 'Ignore (1)');
  update(10000);
  assert.strictEqual(ignore.textContent, 'Ignore');
  assert.strictEqual(ignore.disabled, false);
  ignore.fire('click');
  assert.strictEqual(ended, 1);
  assert.strictEqual(update(HOUR), false, 'done once the time is up');
});

test('hard mode has no Ignore at all', async () => {
  const { createLockScreen } = await import(`../mod/setup.mjs?${Math.random()}`);
  const { screen, update } = createLockScreen(fakeDocument(), { until: HOUR, hard: true }, 'blob:cage.png', 0, () => {});
  update(60000);
  assert.strictEqual(find(screen, 'idle-guard-ignore'), null);
  assert.ok(find(screen, 'idle-guard-hard'));
});

test('a lock saved before the app closed is back on screen as soon as the mod loads, and goes away by itself when time is up', async () => {
  const start = Date.UTC(2026, 9, 15, 12);
  const game = await boot({ stored: { 'idleGuard:lock': JSON.stringify({ until: start + 60000, hard: true }) } });
  assert.deepStrictEqual(game.stylesheets, ['style.css']);
  assert.ok(game.screen(), 'shown before the game interface is ready');
  assert.strictEqual(find(game.screen(), 'idle-guard-left').textContent, '1:00');
  game.advance(30000);
  assert.strictEqual(find(game.screen(), 'idle-guard-left').textContent, '0:30');
  game.advance(30000);
  assert.strictEqual(game.screen(), null);
  assert.strictEqual(game.storage.map.has('idleGuard:lock'), false);
  Date.now = realNow;
});

test('Ignore ends the lock for good', async () => {
  const start = Date.UTC(2026, 9, 15, 12);
  const game = await boot({ stored: { 'idleGuard:lock': JSON.stringify({ until: start + HOUR }) } });
  game.advance(10000);
  find(game.screen(), 'idle-guard-ignore').fire('click');
  assert.strictEqual(game.screen(), null);
  assert.strictEqual(game.storage.map.has('idleGuard:lock'), false);
  Date.now = realNow;
});

test('Idle Guard sits in the top sidebar section with Shop and Bank, and its popup starts a lock', async () => {
  const game = await boot();
  assert.strictEqual(game.screen(), null);
  game.ready();
  assert.strictEqual(game.items.length, 1);
  assert.strictEqual(game.items[0].category, '');
  assert.strictEqual(game.items[0].name, 'Idle Guard');
  assert.strictEqual(game.items[0].icon, 'blob:icon.png');
  game.items[0].onClick();
  const form = game.fired[0].html;
  const [hours, minutes] = form.children[0].children.map((field) => field.children[0]);
  assert.strictEqual(hours.value, '1');
  assert.strictEqual(minutes.value, '0');
  minutes.value = '30';
  minutes.fire('input');
  assert.match(find(form, 'idle-guard-summary').textContent, /^Locked for 1 hour 30 minutes, until .*Ignore lets you back in after a 10 second wait\.$/);
  game.fired[0].press(true);
  await settle();
  assert.deepStrictEqual(JSON.parse(game.storage.getItem('idleGuard:lock')), { until: game.now() + 90 * 60000, hard: false });
  assert.deepStrictEqual(JSON.parse(game.storage.getItem('idleGuard:last')), { hours: 1, minutes: 30 });
  assert.ok(find(game.screen(), 'idle-guard-ignore'));
  Date.now = realNow;
});

test('the popup remembers the last length, warns in red for hard mode, and will not lock for no time', async () => {
  const game = await boot({ stored: { 'idleGuard:last': JSON.stringify({ hours: 2, minutes: 15 }) } });
  game.ready();
  game.items[0].onClick();
  const form = game.fired[0].html;
  const [hours, minutes] = form.children[0].children.map((field) => field.children[0]);
  const hard = form.children[1].children[0];
  const summary = find(form, 'idle-guard-summary');
  assert.strictEqual(hours.value, '2');
  assert.strictEqual(minutes.value, '15');
  assert.strictEqual(hard.checked, false, 'hard mode always starts off');
  hard.checked = true;
  hard.fire('change');
  assert.match(summary.textContent, /Hard mode: no way back in until then\.$/);
  assert.ok(summary.classList.contains('text-danger'));
  hours.value = '0';
  minutes.value = '0';
  hours.fire('input');
  assert.strictEqual(summary.textContent, 'Set how long to lock the game for.');
  assert.strictEqual(game.fired[0].preConfirm(), false);
  game.fired[0].press(true);
  await settle();
  assert.deepStrictEqual(game.validation, ['Set how long to lock the game for first.', 'Set how long to lock the game for first.']);
  assert.strictEqual(game.storage.map.has('idleGuard:lock'), false);
  assert.strictEqual(game.screen(), null);
  Date.now = realNow;
});

test('Cancel leaves the game unlocked', async () => {
  const game = await boot();
  game.ready();
  game.items[0].onClick();
  game.fired[0].press(false);
  await settle();
  assert.strictEqual(game.storage.map.has('idleGuard:lock'), false);
  assert.strictEqual(game.screen(), null);
  Date.now = realNow;
});
