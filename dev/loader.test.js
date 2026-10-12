const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadWrapper(statusFile) {
  const source = fs.readFileSync(path.join(__dirname, 'steam-loader.js'), 'utf8')
    .replace('__MOD_DIR__', JSON.stringify(path.join(ROOT, 'mod')))
    .replace('__STATUS_FILE__', JSON.stringify(statusFile));
  const handlers = {};
  const evals = [];
  const wrapper = {
    require,
    nw: { Window: { get: () => ({ on: (name, fn) => (handlers[name] = fn), eval: (frame, code) => evals.push(code) }) } },
    window: { addEventListener: (name, fn) => (handlers[`window:${name}`] = fn) },
    document: { getElementById: (id) => (id === 'game' ? { id } : null) },
  };
  vm.runInNewContext(source, wrapper);
  return { handlers, evals };
}

const GAME = `
  class NamespacedObject {
    constructor(id, media, modded = false) { this.id = id; this._media = media; this.isModded = modded; }
    getMediaURL(media) { return 'cdn:' + media; }
    get media() { return this.getMediaURL(this._media); }
  }
  const registry = (objects) => ({ size: objects.length, allObjects: objects, getObjectByID: (id) => objects.find((o) => o.id === id) });
  var game = {
    items: registry([
      new NamespacedObject('melvorD:Bronze_Dagger', 'assets/media/bank/weapon_dagger_bronze.png?2'),
      new NamespacedObject('melvorD:Unmapped', 'assets/media/bank/not_a_real_item.png'),
      new NamespacedObject('someMod:Bronze_Dagger', 'assets/media/bank/weapon_dagger_bronze.png', true),
    ]),
  };
  globalThis.NamespacedObject = NamespacedObject;
  class BankItemSettingsMenuElement { setItem() {} }
  globalThis.BankItemSettingsMenuElement = BankItemSettingsMenuElement;
`;

async function runGame(stored = {}) {
  const statusFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'osrs-')), 'status.json');
  const { handlers, evals } = loadWrapper(statusFile);
  handlers['document-start'](null);
  assert.strictEqual(evals.length, 0, 'wrapper window itself must be ignored');
  handlers['document-start']({});
  handlers['document-start']({});
  assert.strictEqual(evals.length, 2, 'every child frame start re-targets the game frame');

  let status;
  let postedCount = 0;
  await new Promise((resolve) => {
    const listeners = {};
    const frame = {
      atob, Blob, URL, Uint8Array, Promise, setTimeout, console, String, Object, JSON, Map, Set,
      localStorage: { getItem: (key) => (key in stored ? JSON.stringify(stored[key]) : null), setItem() {} },
      window: {
        parent: {
          postMessage: (message) => {
            if (message.stage) return;
            postedCount += 1;
            status = structuredClone(message);
            resolve();
          },
        },
      },
      Image: class { decode() { this.naturalWidth = 72; this.naturalHeight = 72; return Promise.resolve(); } },
      MutationObserver: class { observe() {} },
    };
    frame.document = {
      documentElement: { appendChild: (script) => vm.runInContext(script.textContent, frame) },
      createElement: () => ({ remove() {} }),
      addEventListener: (name, fn) => (listeners[name] = fn),
      querySelectorAll: () => [],
      body: { querySelectorAll: () => [] },
    };
    vm.createContext(frame);
    vm.runInContext(evals[0], frame);
    vm.runInContext(evals[1], frame);
    vm.runInContext(GAME, frame);
    listeners.DOMContentLoaded();
  });
  assert.strictEqual(status.ok, true, JSON.stringify(status));
  assert.strictEqual(postedCount, 1, 'second injection into the same document must be a no-op');
  return { status, handlers };
}

test('injected setup swaps mapped base-game media and leaves the rest alone', async () => {
  const { status, handlers } = await runGame();
  assert.deepStrictEqual(status.counts.items, { replaced: 1, total: 3 });
  assert.match(status.samples['melvorD:Bronze_Dagger'].media, /^blob:/);
  assert.strictEqual(status.samples['melvorD:Bronze_Dagger'].decoded, '72x72');
});

test('a category switch turned off restores Melvor art', async () => {
  const { status } = await runGame({ 'osrs-sprites-dev:Item types:item-type-weapons': false });
  assert.deepStrictEqual(status.counts.items, { replaced: 0, total: 3 });
});

test('the master switch turns everything off, even single-item choices', async () => {
  const { status } = await runGame({
    'osrs-sprites-dev:General:enabled': false,
    'osrs-sprites-dev:items': { on: ['melvorD:Bronze_Dagger'], off: [] },
  });
  assert.deepStrictEqual(status.counts.items, { replaced: 0, total: 3 });
});

test('single-item choices override categories in both directions', async () => {
  const off = await runGame({ 'osrs-sprites-dev:items': { on: [], off: ['melvorD:Bronze_Dagger'] } });
  assert.deepStrictEqual(off.status.counts.items, { replaced: 0, total: 3 });
  const on = await runGame({
    'osrs-sprites-dev:Item types:item-type-weapons': false,
    'osrs-sprites-dev:items': { on: ['melvorD:Bronze_Dagger'], off: [] },
  });
  assert.deepStrictEqual(on.status.counts.items, { replaced: 1, total: 3 });
});
