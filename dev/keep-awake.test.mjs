import assert from 'node:assert';
import { test } from 'node:test';

const settle = () => new Promise((r) => setTimeout(r, 0));

async function boot({ wakeLock = 'grant', settings = {}, app = null } = {}) {
  const listeners = {};
  const intervals = [];
  const toasts = [];
  const locks = [];
  const values = { 'General:enabled': true, 'General:only-active': false, ...settings };
  const request = async () => {
    if (wakeLock === 'tap' && !globalThis.tapping) throw Object.assign(new Error('needs a tap'), { name: 'NotAllowedError' });
    const handlers = {};
    const sentinel = {
      released: false,
      addEventListener: (type, fn) => (handlers[type] = fn),
      release: async () => {
        sentinel.released = true;
        if (handlers.release) handlers.release();
      },
    };
    locks.push(sentinel);
    return sentinel;
  };
  Object.defineProperty(globalThis, 'navigator', { value: wakeLock === 'none' ? {} : { wakeLock: { request } }, configurable: true, writable: true });
  globalThis.window = app ? { gonative: { screen: app } } : {};
  globalThis.document = { hidden: false, addEventListener: (type, fn) => (listeners[type] = fn) };
  globalThis.setInterval = (fn) => intervals.push(fn);
  globalThis.imageNotify = (media, message, theme) => toasts.push({ message, theme });
  delete globalThis.game;
  let ready;
  const ctx = {
    getResourceUrl: (path) => `blob:${path}`,
    settings: { section: (name) => ({ add() {}, get: (key) => values[`${name}:${key}`] }) },
    onInterfaceReady: (fn) => (ready = fn),
  };
  const { setup } = await import(`../mod/setup.mjs?${Math.random()}`);
  await setup(ctx);
  const tick = async () => {
    intervals.forEach((fn) => fn());
    await settle();
  };
  const tap = async () => {
    globalThis.tapping = true;
    listeners.touchend();
    await settle();
    globalThis.tapping = false;
  };
  return { listeners, toasts, locks, values, ready, tick, tap };
}

test('keeps the screen on once the game is ready, lets go when hidden, takes it back on return', async () => {
  const { listeners, toasts, locks, ready } = await boot();
  ready();
  await settle();
  assert.strictEqual(locks.length, 1);
  assert.deepStrictEqual(toasts, [{ message: 'Keeping the screen on.', theme: 'success' }]);
  locks[0].release();
  document.hidden = true;
  listeners.visibilitychange();
  await settle();
  assert.strictEqual(locks.length, 1, 'no request while hidden');
  document.hidden = false;
  listeners.visibilitychange();
  await settle();
  assert.strictEqual(locks.length, 2, 'asked again on return');
  assert.strictEqual(toasts.length, 1, 'success is only announced once');
});

test('waits quietly for a tap when the app needs one', async () => {
  const { toasts, locks, ready, tap } = await boot({ wakeLock: 'tap' });
  ready();
  await settle();
  assert.strictEqual(locks.length, 0);
  assert.strictEqual(toasts.length, 0, 'no error toast before the first tap');
  await tap();
  assert.strictEqual(locks.length, 1);
  assert.strictEqual(toasts[0].theme, 'success');
});

test('says so when the app has no wake lock support', async () => {
  const { toasts, ready, tick } = await boot({ wakeLock: 'none' });
  ready();
  await tick();
  await tick();
  assert.strictEqual(toasts.length, 1);
  assert.strictEqual(toasts[0].theme, 'danger');
});

test('only while something is running: locks during an action and releases when idle', async () => {
  const { locks, ready, tick } = await boot({ settings: { 'General:only-active': true } });
  globalThis.game = { activeAction: undefined };
  ready();
  await settle();
  assert.strictEqual(locks.length, 0);
  game.activeAction = { id: 'melvorD:Woodcutting' };
  await tick();
  assert.strictEqual(locks.length, 1);
  game.activeAction = undefined;
  await tick();
  assert.ok(locks[0].released);
});

test('uses the Melvor app\'s own keep-screen-on command when the app offers it', async () => {
  const calls = [];
  const app = { keepScreenOn: () => calls.push('on'), keepScreenNormal: () => calls.push('normal') };
  const { locks, toasts, values, ready, tick } = await boot({ app });
  ready();
  await settle();
  assert.deepStrictEqual(calls, ['on']);
  assert.strictEqual(locks.length, 0, 'no web wake lock needed');
  assert.match(toasts[0].message, /Melvor app/);
  values['General:enabled'] = false;
  await tick();
  assert.deepStrictEqual(calls, ['on', 'normal']);
});
