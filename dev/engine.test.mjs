import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseRetryAfter, songRetryDelay, trackTitle } from '../mod/setup.mjs';
import { createHistory as createHistoryFor, modChanges } from '../mod/overhaul.mjs';

const createHistory = (idb, options) => createHistoryFor(idb, 'osrs-sounds-history', options);

const audio = JSON.parse(readFileSync(new URL('../mod/audio.json', import.meta.url)));

function fakeEngine(log) {
  const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; } });
  const node = () => ({ gain: param(), connect(target) { return target; }, disconnect() {} });
  let clock = 0;
  let runningSince = null;
  const now = () => (runningSince === null || log.clockStuck ? clock : clock + (Date.now() - runningSince) / 1000);
  const engine = {
    get currentTime() { return now(); },
    set currentTime(value) { clock = value; runningSince = runningSince === null ? null : Date.now(); },
    state: 'suspended',
    destination: {},
    gains: [],
    createGain: () => {
      const gain = node();
      engine.gains.push(gain);
      return gain;
    },
    createBuffer: (channels, length, sampleRate) => ({ numberOfChannels: channels, length, sampleRate, duration: 100, getChannelData: () => new Float32Array(length) }),
    createBufferSource() {
      const source = { engine, buffer: null, onended: null, connect(target) { return target; }, start(when, offset) { source.offset = offset; log.started.push(source); }, stop() { log.stopped.push(source); } };
      return source;
    },
    decodeAudioData: async (data) => ({ numberOfChannels: 2, length: 8, sampleRate: 22050, duration: 100, url: data.url, getChannelData: () => new Float32Array(8) }),
    resume: async () => { if (runningSince === null) runningSince = Date.now(); engine.state = 'running'; },
    suspend: async () => { clock = now(); runningSince = null; engine.state = 'suspended'; },
    close: async () => { clock = now(); runningSince = null; engine.state = 'closed'; },
  };
  log.engines.push(engine);
  return engine;
}

function fakeElement(tag) {
  const classes = new Set();
  const listeners = {};
  const element = {
    tag,
    children: [],
    attributes: {},
    textContent: '',
    title: '',
    style: { values: {}, setProperty(name, value) { this.values[name] = value; } },
    disabled: false,
    get className() { return [...classes].join(' '); },
    set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); },
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), contains: (name) => classes.has(name), add: (name) => classes.add(name) },
    setAttribute(name, value) { element.attributes[name] = value; },
    getAttribute(name) { return element.attributes[name]; },
    addEventListener(type, fn) { listeners[type] = fn; },
    click() { listeners.click?.({ stopPropagation() {} }); },
    fire(type) { listeners[type]?.({}); },
    append(...nodes) {
      for (const node of nodes) {
        const at = element.children.indexOf(node);
        if (at >= 0) element.children.splice(at, 1);
        element.children.push(node);
      }
    },
    prepend(node) { element.children.unshift(node); },
    find(predicate) {
      for (const child of element.children) {
        if (predicate(child)) return child;
        const found = child.find?.(predicate);
        if (found) return found;
      }
      return null;
    },
  };
  return element;
}

async function boot({ mobile = false, header = false, account = {} } = {}) {
  const log = { started: [], stopped: [], engines: [], get state() { return this.engines.at(-1).state; } };
  const listeners = {};
  const intervals = [];
  const settings = {};
  const hooks = {};
  const fetched = [];
  const patches = {};
  const stored = { ...account };
  globalThis.window = { AudioContext: function AudioContext() { return fakeEngine(log); }, addEventListener: (t, fn) => (listeners[`window:${t}`] = fn) };
  const topBar = fakeElement('div');
  const potions = Object.assign(fakeElement('button'), { closest: (selector) => (selector === '.d-flex' ? topBar : null) });
  topBar.append(potions);
  globalThis.document = {
    hidden: false,
    addEventListener: (t, fn) => (listeners[t] = fn),
    createElement: fakeElement,
    createTextNode: (text) => ({ text }),
    body: fakeElement('body'),
    ...(header ? { getElementById: (id) => (id === 'page-header-potions-dropdown' ? potions : null) } : {}),
  };
  globalThis.fetch = async (url) => { fetched.push(url); return { arrayBuffer: async () => Object.assign(new ArrayBuffer(8), { url }) }; };
  globalThis.setInterval = (fn) => intervals.push(fn);
  globalThis.nativeManager = { isIOS: mobile, isAndroid: false };
  globalThis.Skill = class Skill { onLevelUp() {} };
  globalThis.PetManager = class PetManager { unlockPet() {} };
  globalThis.Player = class Player { togglePrayer() {} eatFood() {} };
  globalThis.Bank = class Bank { buryItemOnClick() {} };
  globalThis.BaseManager = class BaseManager { onPlayerDeath() {} };
  delete globalThis.game;
  if (header) globalThis.game = {};
  const toasts = [];
  globalThis.fireTopToast = (html) => toasts.push(html);
  const characterStored = {};
  const configs = {};
  const sections = [];
  const ctx = {
    loadData: async () => audio,
    loadStylesheet() {},
    namespace: 'osrsSounds',
    name: 'Old School Runescape Sounds',
    characterStorage: { getItem: (key) => characterStored[key], setItem: (key, value) => (characterStored[key] = value) },
    accountStorage: { getItem: (key) => stored[key], setItem: (key, value) => (stored[key] = value) },
    getResourceUrl: (path) => `blob:${path}`,
    settings: { section: (name) => { if (!sections.includes(name)) sections.push(name); return { add(list) { for (const c of list) { settings[`${name}:${c.name}`] = c.default; configs[c.name] = c; } }, get: (key) => settings[`${name}:${key}`] }; } },
    patch: (target, method) => ({ after: (fn) => (patches[`${target.name}.${method}`] = fn), replace: (fn) => (patches[`${target.name}.${method}`] = fn) }),
    onCharacterLoaded: (fn) => (hooks.character = fn),
    onInterfaceReady: (fn) => (hooks.ready = fn),
    onCharacterSelectionLoaded: (fn) => (hooks.select = fn),
    loadModule: (path) => import(`../mod/${path}`),
  };
  const { setup } = await import(`../mod/setup.mjs?${Math.random()}`);
  await setup(ctx);
  const tick = async () => { intervals.forEach((fn) => fn()); await new Promise((r) => setTimeout(r, 0)); };
  return { log, listeners, settings, hooks, fetched, patches, tick, topBar, stored, characterStored, toasts, configs, sections };
}

test('failed song downloads back off from 3s, doubling to a 10 minute cap, and a 429 or 503 waits at least its Retry-After', () => {
  const offline = new TypeError('Failed to fetch');
  assert.deepStrictEqual([1, 2, 3, 4].map((failures) => songRetryDelay(failures, offline)), [3000, 6000, 12000, 24000]);
  assert.strictEqual(songRetryDelay(20, offline), 10 * 60 * 1000);
  assert.strictEqual(songRetryDelay(1, { status: 429, retryAfterMs: 120000 }), 120000);
  assert.strictEqual(songRetryDelay(1, { status: 429, retryAfterMs: null }), 60000, 'a hidden Retry-After still waits a minute');
  assert.strictEqual(songRetryDelay(3, { status: 503, retryAfterMs: 1000 }), 12000, 'never shorter than the backoff');
  assert.strictEqual(songRetryDelay(1, { status: 404, retryAfterMs: 999999 }), 3000, 'Retry-After only counts on 429 and 503');
});

test('Retry-After is read as seconds or as an HTTP date', () => {
  const now = Date.UTC(2026, 9, 15, 12);
  assert.strictEqual(parseRetryAfter('120', now), 120000);
  assert.strictEqual(parseRetryAfter(new Date(now + 30000).toUTCString(), now), 30000);
  assert.strictEqual(parseRetryAfter(new Date(now - 30000).toUTCString(), now), 0);
  assert.strictEqual(parseRetryAfter(null, now), null);
  assert.strictEqual(parseRetryAfter('soon', now), null);
});

test('after a 429 no other song downloads until its Retry-After is up, even when the music changes', async () => {
  const { hooks, fetched, tick } = await boot();
  globalThis.fetch = async (url) => {
    fetched.push(url);
    return { ok: false, status: 429, statusText: 'Too Many Requests', headers: { get: (name) => (name === 'Retry-After' ? '120' : null) } };
  };
  const waits = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => (ms >= 1000 ? (waits.push(ms), 0) : realSetTimeout(fn, ms));
  try {
    await tick();
    await tick();
    assert.strictEqual(fetched.length, 1, 'the character select song was asked for once');
    const woodcutting = { id: 'melvorD:Woodcutting', on() {} };
    globalThis.game = { ...globalThis.game, activeAction: woodcutting, skills: [woodcutting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
    hooks.character();
    await tick();
    assert.strictEqual(fetched.length, 1, 'switching to Woodcutting waits instead of downloading');
    assert.ok(waits.some((ms) => ms === 120000), 'the next try is 2 minutes out');
    assert.ok(waits.some((ms) => ms > 119000 && ms <= 120000), 'the Woodcutting song waits out the same window');
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

function fakeIndexedDB() {
  const databases = new Map();
  const answer = (result) => ({ result });
  const table = () => Object.assign(new Map(), { next: 0 });
  return {
    get tables() { return databases.get('osrs-sounds-songs') ?? new Map(); },
    get history() { return databases.get('osrs-sounds-history')?.get('events') ?? new Map(); },
    open(name) {
      const request = {};
      setTimeout(() => {
        const fresh = !databases.has(name);
        if (fresh) databases.set(name, new Map());
        const tables = databases.get(name);
        request.result = {
          createObjectStore: (store) => tables.set(store, table()),
          transaction: () => {
            const transaction = {
              objectStore: (store) => ((rows) => ({
                get: (key) => answer(rows.get(key)),
                put: (value, key) => (rows.set(key, value), answer(key)),
                add: (value) => {
                  rows.next++;
                  rows.set(rows.next, value);
                  return answer(rows.next);
                },
                getAllKeys: () => answer([...rows.keys()]),
                delete: (key) => (rows.delete(key), answer(undefined)),
                clear: () => (rows.clear(), answer(undefined)),
                count: () => answer(rows.size),
                getAll: () => answer([...rows.values()]),
              }))(tables.get(store)),
            };
            setTimeout(() => transaction.oncomplete?.());
            return transaction;
          },
        };
        if (fresh) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

test('songs are only kept on the device when that setting is on, which it is not by default', async () => {
  globalThis.indexedDB = fakeIndexedDB();
  const { configs, fetched, tick } = await boot();
  await tick();
  await settle();
  assert.strictEqual(configs['save-songs'].default, false);
  assert.match(fetched[0], /Scape_Main/);
  assert.strictEqual(globalThis.indexedDB.tables.get('songs'), undefined, 'nothing saved');
  delete globalThis.indexedDB;
});

test('with it on, a song downloads from the wiki once and plays from the device after that, even after a reload', async () => {
  globalThis.indexedDB = fakeIndexedDB();
  const first = await boot();
  first.settings['Music:save-songs'] = true;
  await first.tick();
  await settle();
  const song = first.fetched[0];
  assert.match(song, /Scape_Main/);
  assert.ok(globalThis.indexedDB.tables.get('songs').has(song), 'saved under its wiki address');
  assert.ok(globalThis.indexedDB.tables.get('songs').get(song).byteLength > 0);

  const second = await boot();
  second.settings['Music:save-songs'] = true;
  await second.tick();
  await settle();
  assert.strictEqual(second.fetched.length, 0, 'not downloaded again');
  assert.strictEqual(second.log.started.length, 1, 'but still plays');
  delete globalThis.indexedDB;
});

test('songs the mod no longer uses are dropped when the game starts, and turning the setting off keeps the saved songs', async () => {
  globalThis.indexedDB = fakeIndexedDB();
  const { settings, configs, hooks, tick } = await boot({ header: true });
  settings['Music:save-songs'] = true;
  await tick();
  await settle();
  const songs = globalThis.indexedDB.tables.get('songs');
  const sizes = globalThis.indexedDB.tables.get('sizes');
  const stale = 'https://oldschool.runescape.wiki/images/Old_Song.ogg?00000';
  songs.set(stale, new ArrayBuffer(4));
  sizes.set(stale, 4);
  hooks.ready();
  await settle();
  assert.ok(!songs.has(stale) && !sizes.has(stale), 'stale song removed');
  assert.ok(songs.size > 0 && songs.size === sizes.size, 'songs still in use are kept, each with its size');

  settings['Music:save-songs'] = false;
  configs['save-songs'].onChange(false);
  await settle();
  assert.ok(songs.size > 0, 'still saved, just not played from the device');
  delete globalThis.indexedDB;
});

test('Download every song now downloads every song from the wiki one at a time, even with the setting off, and Clear downloaded songs frees them', async () => {
  globalThis.indexedDB = fakeIndexedDB();
  const asked = [];
  globalThis.SwalLocale = { fire: async (options) => (asked.push(options), { isConfirmed: true }) };
  const { configs, fetched, tick, toasts } = await boot();
  await tick();
  await settle();
  const before = fetched.length;
  await configs['download-all'].onClick();
  const wiki = [...new Set(Object.values(audio.music).flat())].filter((url) => url.startsWith('http'));
  assert.match(asked[0].text, new RegExp(`^0 of ${wiki.length} songs downloaded to this device, using 0 MB\\. The other ${wiki.length} will download one at a time`), asked[0].text);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(fetched.length > before, 'downloads started');
  assert.ok(fetched.slice(before).every((url) => wiki.includes(url)), 'only wiki songs');
  await configs['download-all'].onClick();
  assert.match(asked.at(-1).text, /songs downloaded so far\. Stop downloading the rest\?$/, 'pressing it again shows how far along it is');
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const saved = globalThis.indexedDB.tables.get('songs').size;
  assert.ok(saved > 0 && saved < wiki.length, 'stopped partway');
  assert.match(toasts.at(-1), /Stopped downloading songs/);

  await configs['clear-songs'].onClick();
  assert.match(asked.at(-1).text, new RegExp(`^${saved} of ${wiki.length} songs downloaded to this device, using \\d+ MB\\. Clearing them frees that space`), asked.at(-1).text);
  await settle();
  assert.strictEqual(globalThis.indexedDB.tables.get('songs').size, 0);
  assert.match(toasts.at(-1), new RegExp(`Cleared ${saved} downloaded songs`));
  delete globalThis.SwalLocale;
  delete globalThis.indexedDB;
});

test('the mod list is compared with the last time the game opened', () => {
  assert.strictEqual(modChanges(null, ['OSRS Theme', 'SEMI']), 'mods loaded (2): OSRS Theme, SEMI');
  assert.strictEqual(modChanges(['OSRS Theme', 'SEMI'], ['OSRS Theme', 'SEMI']), null);
  assert.strictEqual(modChanges(['OSRS Theme', 'SEMI'], ['OSRS Theme', 'Idle Guard']), 'mods added: Idle Guard; mods removed or turned off: SEMI');
});

test('the history on the device keeps a week of events and no more than its cap', async () => {
  const idb = fakeIndexedDB();
  const now = Date.now();
  await createHistory(idb, { flushMs: 5 }).read();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const events = idb.history;
  [now - 9 * 86400000, now - 8 * 86400000, now - 3 * 86400000, now - 1000].forEach((t, index) => {
    events.next++;
    events.set(events.next, { t, text: `event ${index}` });
  });
  const log = createHistory(idb, { flushMs: 5, max: 3 });
  log.add('just now');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepStrictEqual((await log.read()).map((event) => event.text), ['event 2', 'event 3', 'just now']);
  const capped = createHistory(idb, { flushMs: 5, max: 2 });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepStrictEqual((await capped.read()).map((event) => event.text), ['event 3', 'just now']);
});

test('settings changes and button presses go into the history on the device', async () => {
  globalThis.indexedDB = fakeIndexedDB();
  const { configs } = await boot();
  configs.volume.onChange(55, 30);
  configs['effects-enabled'].onChange(false, true);
  await new Promise((resolve) => setTimeout(resolve, 5200));
  const texts = [...globalThis.indexedDB.history.values()].map((event) => event.text);
  assert.ok(texts.some((text) => text.startsWith('opened: OSRS Sounds')), texts.join(' | '));
  assert.ok(texts.includes('setting "Music: Music volume" changed from 30 to 55'), texts.join(' | '));
  assert.ok(texts.includes('setting "Sound effects: Play OSRS sound effects" changed from true to false'), texts.join(' | '));
  delete globalThis.indexedDB;
});

test('character select plays Scape Main, a skill crossfades to its own track, music off stops it', async () => {
  const { log, settings, hooks, fetched, tick } = await boot();
  await tick();
  assert.match(fetched[0], /Scape_Main/);
  assert.strictEqual(log.started.length, 1);

  const skillListeners = {};
  const woodcutting = { id: 'melvorD:Woodcutting', on: (type, fn) => (skillListeners[type] = fn) };
  globalThis.game = { ...globalThis.game, activeAction: woodcutting, skills: [woodcutting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
  hooks.character();
  await tick();
  assert.ok(audio.music['melvorD:Woodcutting'].includes(fetched.at(-1)), 'woodcutting track requested');
  assert.strictEqual(log.started.length, 2);
  assert.strictEqual(log.stopped.length, 1, 'previous track faded out');

  settings['Music:enabled'] = false;
  await tick();
  assert.strictEqual(log.stopped.length, 2, 'music switched off stops the current track');
});

test('with a mod running several actions at once, music follows combat first, then the running skill', async () => {
  const { fetched, hooks, tick } = await boot();
  const woodcutting = { id: 'melvorD:Woodcutting', isActive: true, on() {} };
  const combat = { id: 'melvorD:Combat', isActive: false, selectedArea: { id: 'melvorD:Farmlands' }, player: { on() {} }, on() {} };
  const multitasking = { id: 'multitasking:multitasking', isActive: true };
  const activeActions = { allObjects: [multitasking, combat, woodcutting] };
  globalThis.game = { activeAction: multitasking, activeActions, skills: [woodcutting], combat, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
  hooks.character();
  await tick();
  assert.ok(audio.music['melvorD:Woodcutting'].includes(fetched.at(-1)), 'woodcutting track requested');

  combat.isActive = true;
  await tick();
  assert.ok(audio.music['melvorD:Farmlands'].includes(fetched.at(-1)), 'combat area track requested');
});

test('base skills in the Abyssal realm play the realm tracks, expansion skills keep their own', async () => {
  const { hooks, fetched, tick } = await boot();
  const melvor = { id: 'melvorD:Melvor' };
  const abyssal = { id: 'melvorItA:Abyssal' };
  const woodcutting = { id: 'melvorD:Woodcutting', namespace: 'melvorD', currentRealm: abyssal, on() {} };
  const harvesting = { id: 'melvorItA:Harvesting', namespace: 'melvorItA', currentRealm: abyssal, on() {} };
  globalThis.game = { ...globalThis.game, activeAction: woodcutting, defaultRealm: melvor, skills: [woodcutting, harvesting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
  hooks.character();
  await tick();
  assert.ok(audio.music['melvorItA:Abyssal'].includes(fetched.at(-1)), 'abyssal woodcutting plays the realm tracks');
  game.activeAction = harvesting;
  await tick();
  assert.ok(audio.music['melvorItA:Harvesting'].includes(fetched.at(-1)), 'harvesting plays its own tracks');
  woodcutting.currentRealm = melvor;
  game.activeAction = woodcutting;
  await tick();
  assert.ok(audio.music['melvorD:Woodcutting'].includes(fetched.at(-1)), 'normal woodcutting is unchanged');
});

test('a new sound on the same channel cuts the previous one', async () => {
  const { log, hooks, tick } = await boot();
  const skillListeners = {};
  const cooking = { id: 'melvorD:Cooking', on: (type, fn) => (skillListeners[type] = fn) };
  globalThis.game = { activeAction: undefined, skills: [cooking], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true, altMagic: {} };
  hooks.character();
  hooks.ready();
  await tick();
  const before = log.started.length;
  skillListeners.action();
  await tick();
  skillListeners.action();
  await tick();
  assert.strictEqual(log.started.length, before + 2);
  assert.ok(log.stopped.includes(log.started[before]), 'first cooking sound was cut');
});

test('hiding the app on a phone mutes at once and suspends shortly after, coming back resumes it', async () => {
  const { log, listeners } = await boot({ mobile: true });
  listeners.pointerdown();
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(log.state, 'running');
  document.hidden = true;
  listeners.visibilitychange();
  assert.strictEqual(log.engines.at(-1).gains[0].gain.value, 0, 'muted at once, with no fade a frozen page might never finish');
  assert.strictEqual(log.state, 'running', 'the audio itself is left for the timer to stop');
  await new Promise((r) => setTimeout(r, 120));
  assert.strictEqual(log.state, 'suspended');
  document.hidden = false;
  listeners.visibilitychange();
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(log.state, 'running');
});

test('on desktop with background play off, switching to another window pauses sound and coming back resumes it', async () => {
  const { log, listeners, settings } = await boot();
  settings['Music:background'] = false;
  listeners.pointerdown();
  await new Promise((r) => setTimeout(r, 0));
  listeners['window:blur']();
  await new Promise((r) => setTimeout(r, 120));
  assert.strictEqual(log.state, 'suspended');
  listeners['window:focus']();
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(log.state, 'running');
});

test('on desktop with background play on, switching to another window keeps playing', async () => {
  const { log, listeners } = await boot();
  listeners.pointerdown();
  await new Promise((r) => setTimeout(r, 0));
  listeners['window:blur']();
  await new Promise((r) => setTimeout(r, 120));
  assert.strictEqual(log.state, 'running');
});

test('a tap after the audio was muted and stopped brings the volume back, not just the audio', async () => {
  const { log, listeners } = await boot({ mobile: true });
  listeners.pointerdown();
  await new Promise((r) => setTimeout(r, 0));
  document.hidden = true;
  listeners.visibilitychange();
  await new Promise((r) => setTimeout(r, 120));
  document.hidden = false;
  listeners.pointerdown();
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(log.state, 'running');
  assert.ok(log.engines.at(-1).gains[0].gain.value > 0, 'master volume fades back in');
});

test('after a fast lock and unlock, audio whose clock never moves is rebuilt, and a tap rebuilds it if it stays stuck', async () => {
  const { log, listeners } = await boot({ mobile: true });
  listeners.pointerdown();
  await new Promise((r) => setTimeout(r, 0));
  document.hidden = true;
  listeners.visibilitychange();
  document.hidden = false;
  log.clockStuck = true;
  listeners.visibilitychange();
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(log.engines.length, 2, 'rebuilt once on unlock');
  await new Promise((r) => setTimeout(r, 1100));
  assert.strictEqual(log.engines.length, 3, 'rebuilt again when its clock had not moved');
  listeners.pointerdown();
  assert.strictEqual(log.engines.length, 4, 'a tap rebuilds stuck audio inside the tap');
  log.clockStuck = false;
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(log.state, 'running');
});

test('level-ups and pets found offline play once you are back', async () => {
  const { log, hooks, patches, tick } = await boot();
  const gameListeners = {};
  globalThis.game = { activeAction: undefined, skills: [], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on: (type, fn) => (gameListeners[type] = fn), _isInOnlineLoop: true };
  hooks.character();
  hooks.ready();
  await tick();
  const before = log.started.length;
  game._isInOnlineLoop = false;
  patches['Skill.onLevelUp'].call({ id: 'melvorD:Woodcutting' }, undefined, 10, 11);
  patches['Skill.onLevelUp'].call({ id: 'melvorD:Fishing' }, undefined, 20, 21);
  patches['PetManager.unlockPet'].call({ unlocked: new Set() }, () => {}, { id: 'pet' });
  await tick();
  assert.strictEqual(log.started.length, before, 'nothing plays during offline progress');
  game._isInOnlineLoop = true;
  gameListeners.offlineLoopExited();
  await new Promise((r) => setTimeout(r, 600));
  assert.strictEqual(log.started.length, before + 1, 'one jingle plays on return');
  log.started.at(-1).onended();
  await tick();
  assert.strictEqual(log.started.length, before + 2, 'pet chime follows the jingle');
});

test('locking and unlocking a phone rebuilds the audio engine and picks the song back up', async () => {
  const { log, listeners, tick } = await boot({ mobile: true });
  await tick();
  listeners.touchend();
  const first = log.engines[0];
  first.currentTime = 42;
  document.hidden = true;
  listeners.visibilitychange();
  listeners['window:pagehide']();
  document.hidden = false;
  listeners.visibilitychange();
  listeners['window:pageshow']();
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(log.engines.length, 2, 'one fresh engine, not one per event');
  assert.strictEqual(first.state, 'closed');
  assert.strictEqual(log.state, 'running');
  const resumed = log.started.at(-1);
  assert.strictEqual(resumed.engine, log.engines[1]);
  assert.ok(Math.abs(resumed.offset - 42) < 0.5, 'the track continues where it was');
});

test('prayers, eating, attacks, skilling and your death all layer instead of cutting each other', async () => {
  const { log, hooks, patches, tick } = await boot();
  const playerListeners = {};
  const skillListeners = {};
  const player = { on: (type, fn) => (playerListeners[type] = fn), attackType: 'melee', equipment: { getItemInSlot: () => ({ name: 'Bronze Scimitar' }) } };
  const woodcutting = { id: 'melvorD:Woodcutting', on: (type, fn) => (skillListeners[type] = fn) };
  globalThis.game = { activeAction: undefined, skills: [woodcutting], combat: { player, on() {} }, farming: { on() {} }, on() {}, emptyEquipmentItem: {}, _isInOnlineLoop: true };
  hooks.character();
  hooks.ready();
  await tick();
  const started = log.started.length;
  const stopped = log.stopped.length;
  const fighter = { activePrayers: new Set(), hitpoints: 10 };
  patches['Player.togglePrayer'].call(fighter, (prayer) => fighter.activePrayers.add(prayer), { id: 'melvorF:Piety' });
  patches['Player.eatFood'].call(fighter, () => { fighter.hitpoints += 5; });
  playerListeners.attack();
  skillListeners.action();
  patches['BaseManager.onPlayerDeath'].call({});
  await tick();
  assert.strictEqual(log.started.length, started + 5, 'all five sounds started');
  assert.strictEqual(log.stopped.length, stopped, 'none of them cut another');
});

test('when too many sounds overlap, the oldest is cut to make room', async () => {
  const { log, hooks, tick } = await boot();
  const actions = [];
  const skills = Object.keys(audio.sfx.skills).slice(0, 9).map((id) => ({ id, on: (type, fn) => actions.push(fn) }));
  globalThis.game = { activeAction: undefined, skills, combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
  hooks.character();
  hooks.ready();
  await tick();
  const started = log.started.length;
  actions.forEach((fire) => fire());
  await tick();
  assert.strictEqual(log.started.length, started + 9, 'the ninth sound still plays');
  assert.ok(log.stopped.includes(log.started[started]), 'the oldest one was cut');
});

test('coming back from offline after dying and levelling up plays only the death jingle, then the pet chime', async () => {
  const { log, hooks, patches, tick } = await boot();
  const gameListeners = {};
  globalThis.game = { activeAction: undefined, skills: [], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on: (type, fn) => (gameListeners[type] = fn), _isInOnlineLoop: true };
  hooks.character();
  hooks.ready();
  await tick();
  const before = log.started.length;
  game._isInOnlineLoop = false;
  patches['Skill.onLevelUp'].call({ id: 'melvorD:Woodcutting' }, undefined, 10, 11);
  patches['BaseManager.onPlayerDeath'].call({});
  patches['PetManager.unlockPet'].call({ unlocked: new Set() }, () => {}, { id: 'pet' });
  game._isInOnlineLoop = true;
  gameListeners.offlineLoopExited();
  await new Promise((r) => setTimeout(r, 600));
  assert.strictEqual(log.started.length, before + 1, 'one jingle');
  assert.match(log.started.at(-1).buffer.url, /You_Are_Dead/, 'and it is the death jingle');
  log.started.at(-1).onended();
  await tick();
  assert.strictEqual(log.started.length, before + 2, 'then the pet chime');
});

test('full shuffle picks from every track and keeps the song going across skills, per-skill shuffle follows the skill', async () => {
  const { log, settings, hooks, fetched, tick } = await boot();
  assert.strictEqual(settings['Music:shuffle-mode'], 'skill', 'per-skill shuffle stays the default');
  settings['Music:shuffle-mode'] = 'all';
  const woodcutting = { id: 'melvorD:Woodcutting', on() {} };
  const fishing = { id: 'melvorD:Fishing', on() {} };
  globalThis.game = { ...globalThis.game, activeAction: woodcutting, skills: [woodcutting, fishing], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
  hooks.character();
  await tick();
  const every = new Set(Object.entries(audio.music).filter(([key]) => key !== 'charselect').flatMap(([, list]) => list));
  assert.ok(every.has(fetched.at(-1)), 'a track from anywhere in the mod');
  const started = log.started.length;
  game.activeAction = fishing;
  await tick();
  assert.strictEqual(log.started.length, started, 'changing skill does not change the song');

  settings['Music:shuffle-mode'] = 'skill';
  game.activeAction = woodcutting;
  await tick();
  assert.strictEqual(log.started.length, started + 1, 'per-skill shuffle switches to the skill\'s own tracks');
});

test('the top bar gets a music button: the harp while nothing plays, moving bars with the song name while one does', async () => {
  const { settings, hooks, tick, topBar } = await boot({ header: true });
  hooks.ready();
  const root = topBar.children[0];
  assert.ok(root.className.includes('osrs-music'), 'the music button sits first in the top bar, before the potions');
  const button = root.children[0];
  assert.ok(!button.classList.contains('is-playing'), 'nothing is playing yet');
  assert.ok(button.find((child) => child.className === 'osrs-music-harp'), 'the harp is there for when nothing plays');
  await tick();
  assert.ok(button.classList.contains('is-playing') && button.classList.contains('is-animated'), 'bars while a song plays');
  const title = root.find((child) => child.className === 'osrs-music-title');
  assert.strictEqual(title.textContent, 'Scape Main', 'the song name, from its wiki file');
  assert.strictEqual(button.title, 'Now playing: Scape Main');
  settings['Music:animated-icon'] = false;
  root.find((child) => child.getAttribute?.('data-action') === 'next').click();
  await tick();
  assert.ok(button.classList.contains('is-playing') && !button.classList.contains('is-animated'), 'with the animation off, the harp shows even while playing');
});

test('pause stops the song and resume picks it up where it stopped; back and next move through the songs', async () => {
  const { log, hooks, tick, topBar } = await boot({ header: true });
  hooks.ready();
  await tick();
  const root = topBar.children[0];
  const press = (action) => root.find((child) => child.getAttribute?.('data-action') === action).click();
  const title = () => root.find((child) => child.className === 'osrs-music-title').textContent;
  const label = () => root.find((child) => child.className === 'osrs-music-label').textContent;
  const engine = log.engines.at(-1);
  const first = title();
  engine.currentTime = 42;
  const stoppedBefore = log.stopped.length;
  press('toggle');
  assert.strictEqual(log.stopped.length, stoppedBefore + 1, 'pause stops the song');
  assert.strictEqual(label(), 'Paused');
  assert.ok(!root.children[0].classList.contains('is-playing'), 'the harp while paused');
  const toggleIcon = root.find((child) => child.getAttribute?.('data-action') === 'toggle').children[0];
  assert.strictEqual(toggleIcon.className, 'fa fa-play');
  await tick();
  const startedBefore = log.started.length;
  press('toggle');
  assert.strictEqual(log.started.length, startedBefore + 1, 'resume starts the song again');
  assert.ok(Math.abs(log.started.at(-1).offset - 42) < 1, `from where it was paused (${log.started.at(-1).offset})`);
  assert.strictEqual(title(), first);
  assert.strictEqual(label(), 'Now playing');

  press('next');
  await tick();
  const second = title();
  assert.notStrictEqual(second, first, 'next plays another song');
  press('back');
  await tick();
  assert.strictEqual(title(), first, 'back early in a song goes to the one before');
  engine.currentTime += 10;
  const restarts = log.started.length;
  press('back');
  await tick();
  assert.strictEqual(title(), first, 'back later in a song starts it again');
  assert.strictEqual(log.started.length, restarts + 1);
  assert.strictEqual(log.started.at(-1).offset, 0);
});

test('a song picked from the list plays at once, and starting a skill or entering a combat area still switches to that place\'s music', async () => {
  const { hooks, tick, topBar } = await boot({ header: true });
  hooks.ready();
  await tick();
  const root = topBar.children[0];
  const title = () => root.find((child) => child.className === 'osrs-music-title').textContent;
  const list = root.find((child) => child.className?.includes('osrs-music-song-list'));
  assert.ok(list.children.length > 300, `every song in the mod is in the list (${list.children.length})`);
  const toggle = root.find((child) => child.className?.includes('osrs-music-picker-toggle'));
  toggle.click();
  assert.ok(!list.classList.contains('d-none'), 'the song button opens the list in the player, not a system menu');
  const harmony = list.children.find((item) => item.textContent === 'Harmony');
  harmony.click();
  await tick();
  assert.strictEqual(title(), 'Harmony');
  assert.ok(list.classList.contains('d-none'), 'picking closes the list');
  assert.ok(harmony.classList.contains('active'), 'the list marks the song playing');
  assert.strictEqual(root.find((child) => child.className === 'osrs-music-picker-label').textContent, 'Harmony');
  const { world, woodcutting } = skillWorld();
  globalThis.game = { ...globalThis.game, ...world };
  hooks.character();
  globalThis.game.activeAction = woodcutting;
  await tick();
  assert.strictEqual(title(), trackTitle(audio.music['melvorD:Woodcutting'][0]), 'starting a skill switches away from the picked song');
  const area = Object.keys(audio.music).find((key) => !world.skills.getObjectByID(key) && !['charselect', 'idle', 'melvorD:GolbinRaid'].includes(key) && !key.includes('Abyssal'));
  world.combat.isActive = true;
  world.combat.selectedArea = { id: area };
  await tick();
  assert.strictEqual(title(), trackTitle(audio.music[area][0]), `entering a combat area switches to its music (${area})`);
});

test('with Full shuffle on, starting a skill or entering a combat area keeps the current song playing', async () => {
  const { hooks, tick, topBar, log, settings } = await boot({ header: true });
  settings['Music:shuffle-mode'] = 'all';
  const { world, woodcutting } = skillWorld();
  globalThis.game = { ...globalThis.game, ...world };
  hooks.character();
  hooks.ready();
  await tick();
  const root = topBar.children[0];
  const title = () => root.find((child) => child.className === 'osrs-music-title').textContent;
  const playing = title();
  assert.notStrictEqual(playing, '-', 'a song is playing');
  const started = log.started.length;
  globalThis.game.activeAction = woodcutting;
  await tick();
  assert.strictEqual(title(), playing, 'starting a skill does not change the song');
  const area = Object.keys(audio.music).find((key) => !world.skills.getObjectByID(key) && !['charselect', 'idle', 'melvorD:GolbinRaid'].includes(key) && !key.includes('Abyssal'));
  world.combat.isActive = true;
  world.combat.selectedArea = { id: area };
  await tick();
  assert.strictEqual(title(), playing, 'nor does entering a combat area');
  assert.strictEqual(log.started.length, started, 'the song is never restarted');
});

test('repeat-1 plays the same song again when it ends, holds it through skill changes, and is remembered', async () => {
  const { log, hooks, tick, topBar, stored } = await boot({ header: true });
  hooks.ready();
  await tick();
  const root = topBar.children[0];
  const title = () => root.find((child) => child.className === 'osrs-music-title').textContent;
  const repeat = root.find((child) => child.getAttribute?.('data-action') === 'repeat');
  repeat.click();
  assert.ok(repeat.classList.contains('active'));
  assert.strictEqual(stored['repeat-one'], true);
  const first = title();
  const started = log.started.length;
  log.started.at(-1).onended();
  assert.strictEqual(log.started.length, started + 1, 'the song starts again');
  assert.strictEqual(title(), first);
  const woodcutting = { id: 'melvorD:Woodcutting', on() {} };
  globalThis.game = { ...globalThis.game, activeAction: woodcutting, skills: [woodcutting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
  hooks.character();
  await tick();
  assert.strictEqual(title(), first, 'still the same song after starting a skill');
  const again = await boot({ header: true });
  again.stored['repeat-one'] = true;
  again.hooks.ready();
  assert.ok(again.topBar.children[0].find((child) => child.getAttribute?.('data-action') === 'repeat').classList.contains('active'), 'repeat-1 is still on after a reload');
});

test('a place\'s first song unlocks the moment you are there, with a toast, and is kept with the character', async () => {
  const { hooks, tick, fetched, toasts, characterStored } = await boot();
  const woodcutting = { id: 'melvorD:Woodcutting', on() {} };
  globalThis.game = { activeAction: woodcutting, skills: [woodcutting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
  hooks.character();
  await tick();
  const first = audio.music['melvorD:Woodcutting'][0];
  assert.strictEqual(fetched.at(-1), first, 'the first woodcutting song plays');
  assert.strictEqual(toasts.length, 1);
  assert.match(toasts[0], new RegExp(`You have unlocked a new music track: <span class="font-w600">${trackTitle(first)}</span>`));
  assert.ok(characterStored.songs.includes(decodeURIComponent(first.split('?')[0].split('/').pop()).replace(/\.ogg$/, '')), 'saved with the character');
  await tick();
  assert.strictEqual(toasts.length, 1, 'only once');
});

test('after the first, each action has a small chance at the next song, sized to about 4 hours of play', async () => {
  const { hooks, tick, toasts, characterStored } = await boot();
  const actions = {};
  const woodcutting = { id: 'melvorD:Woodcutting', actionInterval: 3000, on: (type, fn) => (actions[type] = fn) };
  globalThis.game = { activeAction: woodcutting, skills: [woodcutting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
  hooks.character();
  await tick();
  const songs = audio.music['melvorD:Woodcutting'];
  const rolls = [];
  const random = Math.random;
  Math.random = () => rolls.shift() ?? 0.5;
  try {
    rolls.push(3000 / (4 * 3600000) + 1e-9);
    actions.action();
    assert.strictEqual(characterStored.songs.length, 1, 'a roll just above the chance does nothing');
    rolls.push(3000 / (4 * 3600000) - 1e-9);
    actions.action();
    assert.strictEqual(characterStored.songs.length, 2, 'a roll under 3s / 4h unlocks the second song');
    assert.match(toasts.at(-1), new RegExp(trackTitle(songs[1])));
    rolls.push(3000 / (4 * 3600000) - 1e-9);
    actions.action();
    assert.strictEqual(characterStored.songs.length, 2, 'the third song needs the much longer odds of about another 20 hours');
    rolls.push(3000 / (20 * 3600000) - 1e-9);
    actions.action();
    assert.strictEqual(characterStored.songs.length, 3);
  } finally {
    Math.random = random;
  }
});

test('songs unlocked during offline progress are announced once you are back', async () => {
  const { hooks, tick, toasts } = await boot();
  const actions = {};
  const events = {};
  const woodcutting = { id: 'melvorD:Woodcutting', actionInterval: 3000, on: (type, fn) => (actions[type] = fn) };
  globalThis.game = { activeAction: woodcutting, skills: [woodcutting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on: (type, fn) => (events[type] = fn), _isInOnlineLoop: false };
  hooks.character();
  const random = Math.random;
  Math.random = () => 0;
  try {
    actions.action();
    actions.action();
  } finally {
    Math.random = random;
  }
  assert.strictEqual(toasts.length, 0, 'nothing pops up mid offline progress');
  game._isInOnlineLoop = true;
  events.offlineLoopExited();
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.strictEqual(toasts.length, 2, 'both songs are announced on return');
});

test('the song list shows unlocked songs in green and locked ones in red that cannot be picked', async () => {
  const { hooks, tick, topBar } = await boot({ header: true });
  hooks.ready();
  await tick();
  const root = topBar.children[0];
  root.find((child) => child.className?.includes('osrs-music-picker-toggle')).click();
  const list = root.find((child) => child.className?.includes('osrs-music-song-list'));
  const item = (url) => list.children.find((each) => each.textContent === trackTitle(url));
  const idle = item(audio.music.idle[0]);
  const locked = item(audio.music['melvorD:Woodcutting'][2]);
  assert.ok(idle.classList.contains('osrs-music-unlocked') && !idle.disabled, 'idle music starts unlocked, in green');
  assert.strictEqual(idle.style.values.color, '#0dc10d', 'the green is set on the element itself, so no theme can override it');
  assert.strictEqual(locked.style.values.color, '#ff2b2b');
  assert.ok(locked.classList.contains('osrs-music-locked') && locked.disabled, 'a woodcutting song not yet heard is red and cannot be picked');
  const title = () => root.find((child) => child.className === 'osrs-music-title').textContent;
  const before = title();
  locked.click();
  await tick();
  assert.strictEqual(title(), before, 'picking a locked song does nothing');
  assert.match(root.find((child) => child.className === 'osrs-music-count').textContent, /^\d+ of \d+ songs unlocked$/);
});

test('in Adventure mode the song list only offers songs for unlocked skills, plus songs that also play outside a skill', async () => {
  const { hooks, tick, topBar } = await boot({ header: true });
  globalThis.game.skills = { getObjectByID: (id) => (id === 'melvorD:Woodcutting' ? { isUnlocked: false } : id.endsWith(':Fishing') ? { isUnlocked: true } : undefined) };
  hooks.ready();
  await tick();
  const places = new Map();
  for (const [key, list] of Object.entries(audio.music)) for (const url of list) places.set(url, [...(places.get(url) ?? []), key]);
  const onlyWoodcutting = [...places].find(([, keys]) => keys.length === 1 && keys[0] === 'melvorD:Woodcutting')[0];
  const shared = [...places].find(([, keys]) => keys.includes('melvorD:Woodcutting') && keys.some((key) => key === 'idle' || !key.includes(':')))?.[0];
  const root = topBar.children[0];
  root.find((child) => child.className?.includes('osrs-music-picker-toggle')).click();
  const list = root.find((child) => child.className?.includes('osrs-music-song-list'));
  const item = (url) => list.children.find((each) => each.textContent === trackTitle(url));
  assert.ok(item(onlyWoodcutting).classList.contains('d-none'), 'a song only for locked Woodcutting is hidden');
  assert.ok(!item(audio.music.idle[0]).classList.contains('d-none'), 'idle music is always offered');
  if (shared) assert.ok(!item(shared).classList.contains('d-none'), 'a Woodcutting song that also plays elsewhere stays');
});

test('no two settings share a name, since Melvor gives each one the page id "mod:name" whatever its section', async () => {
  const { settings } = await boot();
  const names = Object.keys(settings).map((key) => key.split(':').slice(1).join(':'));
  assert.deepStrictEqual(names.filter((name, i) => names.indexOf(name) !== i), []);
});

// mulberry32
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stemOf = (url) => decodeURIComponent(url.split('?')[0].split('/').pop()).replace(/\.ogg$/i, '');

async function unlockAllSongs(configs) {
  globalThis.SwalLocale = { fire: () => Promise.resolve({ isConfirmed: true }) };
  try {
    configs['danger-unlock-all'].onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    delete globalThis.SwalLocale;
  }
}

function luckyAction(act, skill) {
  const random = Math.random;
  Math.random = () => 0;
  try {
    act(skill);
  } finally {
    Math.random = random;
  }
}

function skillWorld(extra = {}) {
  const listeners = {};
  const skill = (id, actionInterval = 3000) => ({ id, namespace: id.split(':')[0], actionInterval, on: (type, fn) => (listeners[`${id}:${type}`] = fn) });
  const woodcutting = skill('melvorD:Woodcutting');
  const fishing = skill('melvorD:Fishing');
  const events = {};
  const player = { stats: { attackInterval: 2400 }, attackType: 'melee', equipment: { getItemInSlot: () => undefined }, on: (type, fn) => (listeners[`player:${type}`] = fn) };
  const world = {
    activeAction: null,
    golbinRaid: {},
    defaultRealm: { id: 'melvorD:Melvor' },
    skills: Object.assign([woodcutting, fishing], { getObjectByID: (id) => [woodcutting, fishing].find((each) => each.id === id) }),
    realms: { getObjectByID: (id) => (id === 'melvorItA:Abyssal' ? { id } : undefined) },
    combat: { player, isActive: false, selectedArea: null, on() {} },
    farming: { id: 'melvorD:Farming', on: (type, fn) => (listeners[`farming:${type}`] = fn) },
    on: (type, fn) => (events[type] = fn),
    _isInOnlineLoop: true,
    ...extra,
  };
  const act = (target, times = 1) => {
    for (let i = 0; i < times; i++) listeners[`${target.id}:action`]();
  };
  return { world, woodcutting, fishing, player, listeners, events, act };
}

test('a new profile: only the login and idle songs, then each skill and combat area gives its first song the moment you are there', async () => {
  const { hooks, tick, fetched, toasts, characterStored } = await boot();
  await tick();
  assert.ok(audio.music.charselect.includes(fetched.at(-1)), 'character select plays its own free music');
  const { world, woodcutting, fishing } = skillWorld();
  globalThis.game = world;
  hooks.character();
  await tick();
  assert.ok(audio.music.idle.includes(fetched.at(-1)), 'standing idle plays the free idle music');
  assert.strictEqual(toasts.length, 0, 'no unlocks for idle music');
  world.activeAction = woodcutting;
  await tick();
  assert.strictEqual(fetched.at(-1), audio.music['melvorD:Woodcutting'][0], 'woodcutting plays its first song straight away');
  world.activeAction = fishing;
  await tick();
  assert.strictEqual(fetched.at(-1), audio.music['melvorD:Fishing'][0]);
  world.activeAction = null;
  const area = Object.keys(audio.music).find((key) => key.includes('Farmlands')) ?? Object.keys(audio.music).find((key) => !world.skills.getObjectByID(key) && !['charselect', 'idle', 'melvorD:GolbinRaid'].includes(key) && !key.includes('Abyssal'));
  world.combat.isActive = true;
  world.combat.selectedArea = { id: area };
  await tick();
  assert.strictEqual(fetched.at(-1), audio.music[area][0], 'entering a combat area plays its first song');
  assert.strictEqual(toasts.length, 3, 'one toast per first song');
  assert.deepStrictEqual(characterStored.songs, [stemOf(audio.music['melvorD:Woodcutting'][0]), stemOf(audio.music['melvorD:Fishing'][0]), stemOf(audio.music[area][0])]);
});

test('on average the second song takes about 4 hours of actions and the third about another 20, whatever the action speed', async () => {
  const random = Math.random;
  try {
    for (const interval of [1500, 3000, 6000]) {
      const { hooks, characterStored } = await boot();
      const { world, woodcutting, act } = skillWorld();
      woodcutting.actionInterval = interval;
      globalThis.game = world;
      hooks.character();
      Math.random = seeded(interval);
      const waits = { second: [], third: [] };
      for (let trial = 0; trial < 300; trial++) {
        characterStored.songs = [];
        hooks.character();
        act(woodcutting);
        let actions = 0;
        while (characterStored.songs.length < 2) {
          act(woodcutting);
          actions++;
        }
        waits.second.push(actions);
        if (trial < 150) {
          actions = 0;
          while (characterStored.songs.length < 3) {
            act(woodcutting);
            actions++;
          }
          waits.third.push(actions);
        }
      }
      const hours = (list) => (list.reduce((sum, value) => sum + value, 0) / list.length) * interval / 3600000;
      const second = hours(waits.second);
      const third = hours(waits.third);
      const within = (mean, expected, trials) => Math.abs(mean - expected) < 3 * expected / Math.sqrt(trials);
      assert.ok(within(second, 4, waits.second.length), `second song after ${second.toFixed(2)} hours on average with ${interval}ms actions`);
      assert.ok(within(third, 20, waits.third.length), `third song after another ${third.toFixed(1)} hours on average with ${interval}ms actions`);
    }
  } finally {
    Math.random = random;
  }
});

test('combat rolls on every attack using your attack speed, and a song shared with another place counts for both', async () => {
  const { hooks, tick, characterStored } = await boot();
  const { world, woodcutting, listeners, act } = skillWorld();
  globalThis.game = world;
  hooks.character();
  const area = Object.keys(audio.music).find((key) => !world.skills.getObjectByID(key) && !['charselect', 'idle', 'melvorD:GolbinRaid'].includes(key) && !key.includes('Abyssal'));
  world.combat.isActive = true;
  world.combat.selectedArea = { id: area };
  await tick();
  const random = Math.random;
  try {
    Math.random = () => 2400 / (4 * 3600000) + 1e-9;
    listeners['player:attack']();
    assert.strictEqual(characterStored.songs.length, 1, 'just over the 2.4s / 4h odds: nothing');
    Math.random = () => 2400 / (4 * 3600000) - 1e-9;
    listeners['player:attack']();
    assert.strictEqual(characterStored.songs.length, 2, 'just under: the area\'s second song');
  } finally {
    Math.random = random;
  }

  const contexts = Object.entries(audio.music).filter(([key]) => !['charselect', 'idle'].includes(key));
  const shared = contexts.flatMap(([a, listA]) => contexts.filter(([b]) => b !== a).map(([b, listB]) => [a, listA, b, listB])).find(([, listA, , listB]) => listA[1] === listB[0] && listA[0] !== listB[0] && !listB.slice(1).includes(listA[0]));
  assert.ok(shared, 'the song data has a song that is one place\'s first and another\'s second');
  const [first, firstList, other, otherList] = shared;
  const { hooks: hooks2, tick: tick2, characterStored: stored2 } = await boot();
  const second = skillWorld();
  globalThis.game = second.world;
  hooks2.character();
  second.world.combat.isActive = true;
  second.world.combat.selectedArea = { id: other };
  await tick2();
  second.world.combat.selectedArea = { id: first };
  await tick2();
  assert.ok(stored2.songs.includes(stemOf(firstList[0])) && stored2.songs.includes(stemOf(otherList[0])), 'both first songs');
  try {
    Math.random = () => 2400 / (4 * 3600000) - 1e-9;
    second.listeners['player:attack']();
    assert.ok(!stored2.songs.includes(stemOf(firstList[2])), `${first}'s second song was already heard in ${other}, so it waits on the longer odds for the third`);
    Math.random = () => 2400 / (20 * 3600000) - 1e-9;
    second.listeners['player:attack']();
    assert.ok(stored2.songs.includes(stemOf(firstList[2])), 'the third song on the 20 hour odds');
  } finally {
    Math.random = random;
  }
});

test('skills in the Abyssal realm, Cartography surveys and Farming harvests all unlock songs too', async () => {
  const { hooks, tick, characterStored } = await boot();
  const { world, woodcutting, listeners, act } = skillWorld();
  const cartographyListeners = {};
  world.cartography = { id: 'melvorAoD:Cartography', namespace: 'melvorAoD', actionInterval: 3000, on: (type, fn) => (cartographyListeners[type] = fn) };
  globalThis.game = world;
  hooks.character();
  woodcutting.currentRealm = { id: 'melvorItA:Abyssal' };
  act(woodcutting);
  assert.ok(characterStored.songs.includes(stemOf(audio.music['melvorItA:Abyssal'][0])), 'woodcutting in the Abyss unlocks the Abyss music, not Woodcutting\'s');
  cartographyListeners.survey();
  assert.ok(characterStored.songs.includes(stemOf(audio.music['melvorAoD:Cartography'][0])), 'a survey unlocks Cartography\'s first song');
  listeners['farming:harvest']();
  assert.ok(characterStored.songs.includes(stemOf(audio.music['melvorD:Farming'][0])), 'a harvest unlocks Farming\'s first song');
  const random = Math.random;
  try {
    Math.random = () => (10 * 60 * 1000) / (4 * 3600000) - 1e-9;
    listeners['farming:harvest']();
    assert.ok(characterStored.songs.includes(stemOf(audio.music['melvorD:Farming'][1])), 'each harvest counts as ten minutes of play');
  } finally {
    Math.random = random;
  }
});

test('many songs unlocked during offline progress make one summary toast when you are back', async () => {
  const { hooks, toasts } = await boot();
  const { world, woodcutting, fishing, events, act } = skillWorld({ _isInOnlineLoop: false });
  globalThis.game = world;
  hooks.character();
  const random = Math.random;
  Math.random = () => 0;
  try {
    act(woodcutting, 5);
    act(fishing, 5);
  } finally {
    Math.random = random;
  }
  assert.strictEqual(toasts.length, 0);
  world._isInOnlineLoop = true;
  events.offlineLoopExited();
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.strictEqual(toasts.length, 1);
  assert.match(toasts[0], /You have unlocked 6 new music tracks\./);
});

test('unlocked songs survive a reload, and every song unlocked still fits in Melvor\'s mod storage', async () => {
  const first = await boot();
  const a = skillWorld();
  globalThis.game = a.world;
  first.hooks.character();
  a.act(a.woodcutting);
  const kept = { ...first.characterStored };
  const second = await boot({ header: true });
  Object.assign(second.characterStored, kept);
  const b = skillWorld();
  globalThis.game = { ...globalThis.game, ...b.world };
  second.hooks.character();
  second.hooks.ready();
  const root = second.topBar.children[0];
  const list = root.find((child) => child.className?.includes('osrs-music-song-list'));
  const item = list.children.find((each) => each.textContent === trackTitle(audio.music['melvorD:Woodcutting'][0]));
  assert.ok(item.classList.contains('osrs-music-unlocked'), 'still unlocked after reloading');
  await unlockAllSongs(second.configs);
  assert.ok(second.characterStored.songs.length > 290);
  assert.ok(JSON.stringify(second.characterStored.songs).length < 8192, `${JSON.stringify(second.characterStored.songs).length} bytes`);
});

test('a skill only plays its unlocked songs; a newly unlocked one joins without cutting the song off; full shuffle only draws unlocked songs', async () => {
  const { hooks, tick, topBar, log, settings } = await boot({ header: true });
  const { world, woodcutting, act } = skillWorld();
  globalThis.game = { ...globalThis.game, ...world };
  settings['Music:shuffle-mode'] = 'off';
  settings['Sound effects:skilling'] = false;
  hooks.character();
  hooks.ready();
  world.activeAction = woodcutting;
  globalThis.game.activeAction = woodcutting;
  await tick();
  const root = topBar.children[0];
  const title = () => root.find((child) => child.className === 'osrs-music-title').textContent;
  const press = (action) => root.find((child) => child.getAttribute?.('data-action') === action).click();
  const songs = audio.music['melvorD:Woodcutting'];
  assert.strictEqual(title(), trackTitle(songs[0]));
  press('next');
  await tick();
  assert.strictEqual(title(), trackTitle(songs[0]), 'with one song unlocked, next stays on it');
  const started = log.started.length;
  luckyAction(act, woodcutting);
  await tick();
  assert.strictEqual(log.started.length, started, 'unlocking a song does not restart the music');
  press('next');
  await tick();
  assert.strictEqual(title(), trackTitle(songs[1]), 'the new song is next in line');
  settings['Music:shuffle-mode'] = 'all';
  const unlockedTitles = new Set([...audio.music.charselect, ...audio.music.idle, songs[0], songs[1]].map(trackTitle));
  for (let i = 0; i < 25; i++) {
    press('next');
    await tick();
    assert.ok(unlockedTitles.has(title()), `full shuffle stays on unlocked songs (${title()})`);
  }
});

test('the song list keeps unlocked songs at the top in green, alphabetical, and moves a song up when it unlocks', async () => {
  const { hooks, tick, topBar } = await boot({ header: true });
  const { world, woodcutting, act } = skillWorld();
  globalThis.game = { ...globalThis.game, ...world };
  hooks.character();
  hooks.ready();
  await tick();
  const root = topBar.children[0];
  root.find((child) => child.className?.includes('osrs-music-picker-toggle')).click();
  const list = root.find((child) => child.className?.includes('osrs-music-song-list'));
  const order = () => list.children.map((item) => [item.textContent, item.classList.contains('osrs-music-unlocked')]);
  const check = () => {
    const rows = order();
    const firstLocked = rows.findIndex(([, open]) => !open);
    assert.ok(rows.slice(firstLocked).every(([, open]) => !open), 'no unlocked song below a locked one');
    const sorted = (names) => names.every((name, i) => i === 0 || names[i - 1].localeCompare(name) <= 0);
    assert.ok(sorted(rows.slice(0, firstLocked).map(([name]) => name)) && sorted(rows.slice(firstLocked).map(([name]) => name)), 'each group alphabetical');
    return firstLocked;
  };
  const before = check();
  globalThis.game.activeAction = woodcutting;
  await tick();
  luckyAction(act, woodcutting);
  const after = check();
  assert.ok(after >= before + 1, `the newly unlocked songs moved up into the green group (${before} -> ${after})`);
  assert.match(root.find((child) => child.className === 'osrs-music-count').textContent, new RegExp(`^${after} of \\d+ songs unlocked$`));
});

test('a ? in the player and a button in the mod settings open a guide laid out like the Game Guide', async () => {
  const { hooks, tick, topBar, configs } = await boot({ header: true });
  const calls = [];
  globalThis.$ = (target) => ({ dropdown: (command) => calls.push(['dropdown', command]), modal: (command) => calls.push(['modal', command, target]) });
  let swalClosed = false;
  globalThis.Swal = { isVisible: () => true, close: () => (swalClosed = true) };
  try {
    hooks.ready();
    await tick();
    const root = topBar.children[0];
    const help = root.find((child) => child.className?.includes('osrs-music-help'));
    assert.ok(help, 'the player has a ? button');
    help.click();
    assert.deepStrictEqual(calls[0], ['dropdown', 'hide'], 'the player closes before the guide opens');
    const shown = calls.find(([kind]) => kind === 'modal');
    assert.strictEqual(shown[1], 'show');
    const guide = shown[2];
    assert.ok(guide.className.includes('modal') && document.body.children.includes(guide), 'a modal added to the page');
    const headings = [];
    const walk = (node) => {
      if (node.tag === 'h4') headings.push(node.textContent);
      (node.children ?? []).forEach(walk);
    };
    walk(guide);
    assert.deepStrictEqual(headings, ['Unlocking songs']);
    assert.ok(guide.find((node) => node.className === 'modal-dialog modal-lg'), 'a Game Guide modal sized for one section');
    assert.ok(guide.find((node) => node.className === 'block-header bg-primary-dark'), 'the Game Guide header');
    calls.length = 0;
    configs.guide.onClick();
    assert.ok(swalClosed, 'the mod settings popup closes first');
    assert.strictEqual(calls.find(([kind]) => kind === 'modal')[2], guide, 'the same guide, built once');
  } finally {
    delete globalThis.$;
    delete globalThis.Swal;
  }
});

test('the last settings section, DANGER, warns hard, defaults to cancel, and unlocks every song for anyone who confirms', async () => {
  const { hooks, configs, sections, characterStored, toasts } = await boot();
  assert.strictEqual(sections.at(-1), 'DANGER', 'DANGER is at the very bottom');
  const { world } = skillWorld();
  globalThis.game = world;
  hooks.character();
  let prompt = null;
  let answer = { isConfirmed: false };
  globalThis.SwalLocale = { fire: (options) => { prompt = options; return Promise.resolve(answer); } };
  const text = () => {
    const parts = [];
    const walk = (node) => {
      if (node.textContent) parts.push(node.textContent);
      (node.children ?? []).forEach(walk);
    };
    walk(prompt.html);
    return parts.join(' ');
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  try {
    configs['danger-unlock-all'].onClick();
    assert.match(text(), /Train a skill or step into a combat area and its first song unlocks right away/, 'the prompt explains how songs normally unlock');
    assert.match(text(), /really, really want to :'\(/, 'and warns that this is a last resort');
    const crying = prompt.html.children.find((node) => node.tag === 'img');
    assert.strictEqual(crying?.src, 'blob:cry.gif', 'with the crying emote beside it');
    assert.match(prompt.customClass.confirmButton, /btn-danger/, 'the unlock button is the red one');
    assert.match(prompt.customClass.container, /swal-infront/);
    assert.strictEqual(prompt.focusCancel, true, 'Enter cancels');
    assert.strictEqual(prompt.cancelButtonText, "Nah, I'll earn them");
    assert.strictEqual(prompt.confirmButtonText, "I don't care, unlock all");
    assert.strictEqual(prompt.preConfirm, undefined, 'nothing to meet first');
    await settle();
    assert.ok((characterStored.songs ?? []).length < 10, 'cancelling unlocks nothing');
    answer = { isConfirmed: true };
    configs['danger-unlock-all'].onClick();
    await settle();
    assert.ok(characterStored.songs.length > 290, `confirming on a brand new character unlocks every song (${characterStored.songs.length})`);
    assert.strictEqual(toasts.length, 1, 'with one toast, not hundreds');
    assert.match(toasts[0], new RegExp(`You have unlocked ${characterStored.songs.length} new music tracks\\.`));
  } finally {
    delete globalThis.SwalLocale;
  }
});

test('debug info still comes out when Default page on load holds a page that links back to the game', async () => {
  const { hooks, configs } = await boot({ header: true });
  const woodcutting = { id: 'melvorD:Woodcutting', name: 'Woodcutting', on() {} };
  const page = (id) => ({ id, game: null });
  globalThis.game = {
    activeAction: woodcutting, skills: [woodcutting], combat: { isActive: false, player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true,
    settings: { boolData: {}, choiceData: { defaultPageOnLoad: { currentValue: page('melvorD:Woodcutting'), defaultValue: page('melvorD:ActiveSkill') } } },
  };
  globalThis.game.settings.choiceData.defaultPageOnLoad.currentValue.game = globalThis.game;
  globalThis.game.minibar = { game: globalThis.game };
  hooks.character();
  hooks.ready();
  const report = await configs.debug.onClick();
  assert.match(report, /defaultPageOnLoad = melvorD:Woodcutting \(default melvorD:ActiveSkill\)/);
  assert.ok(report.includes('== Recent events'), 'the report reaches the end');
});

test('debug info reports the device, the output check, settings, game mode, unlocked songs and song load errors', async () => {
  const { hooks, tick, configs, characterStored } = await boot({ header: true });
  const woodcutting = { id: 'melvorD:Woodcutting', name: 'Woodcutting', on() {} };
  globalThis.game = {
    activeAction: woodcutting, skills: [woodcutting], combat: { isActive: false, player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true,
    currentGamemode: { id: 'melvorD:Hardcore', name: 'Hardcore' },
    settings: { boolData: { darkMode: { currentValue: false, defaultValue: true }, autoCloudSave: { currentValue: true, defaultValue: true } }, choiceData: { defaultPageOnLoad: { currentValue: 3, defaultValue: 0 } } },
  };
  characterStored.songs = [stemOf(audio.music['melvorD:Woodcutting'][0])];
  hooks.character();
  hooks.ready();
  const fetchWorks = globalThis.fetch;
  globalThis.fetch = async (url) => (/\.ogg/.test(url) && !url.startsWith('blob:') ? { ok: false, status: 404, statusText: 'Not Found' } : fetchWorks(url));
  try {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    globalThis.fetch = fetchWorks;
  }
  const report = await configs.debug.onClick();
  for (const heading of ['Device', 'Permission to play sound', "Is the device playing the game's sound?", 'Music', 'Sound effects', 'Mod settings', 'Character', 'Melvor settings', 'Mods loaded', 'Recent events']) {
    assert.ok(report.includes(`== ${heading}`), `has the ${heading} section`);
  }
  assert.match(report, /verdict: audio is suspended/);
  assert.match(report, /game mode: Hardcore \(melvorD:Hardcore\)/);
  assert.match(report, /Music \/ Shuffle: skill/);
  assert.match(report, /main menu uses \(music volume, effects volume, music on; last set on any character\): 30, 40, true/);
  assert.match(report, /darkMode = false \(default true\)/);
  assert.match(report, /defaultPageOnLoad = 3 \(default 0\)/);
  assert.match(report, /left at default \(1\): autoCloudSave=true/);
  assert.match(report, new RegExp(`unlocked: .*${trackTitle(audio.music['melvorD:Woodcutting'][0])}`));
  assert.match(report, /unlocked: .*Scape Main/, 'free songs count as unlocked');
  assert.match(report, /last song error: .*HTTP 404 Not Found/);
  assert.match(report, /song failed \(1 in a row\): .*HTTP 404 Not Found, next try in 3s/, 'the failure and the backoff are in the event log');
  assert.match(report, /song download failures in a row: 1, next download allowed in \ds/);
});

test("a song the game's service worker answers with 408 downloads around it, and later songs skip the service worker", async () => {
  const { log, hooks, tick, fetched, configs } = await boot({ header: true });
  const sentToWorker = [];
  globalThis.Worker = class {
    postMessage(url) {
      sentToWorker.push(url);
      queueMicrotask(() => this.onmessage({ data: { bytes: Object.assign(new ArrayBuffer(8), { url }) } }));
    }
    terminate() {}
  };
  const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'test', serviceWorker: { controller: { scriptURL: 'https://android.melvoridle.com/offlineClientStage3/sw.js' } } }, configurable: true });
  globalThis.fetch = async (url) => {
    fetched.push(url);
    return url.startsWith('http') ? { ok: false, status: 408 } : { ok: true, arrayBuffer: async () => Object.assign(new ArrayBuffer(8), { url }) };
  };
  try {
    await tick();
    assert.match(sentToWorker[0], /Scape_Main/, 'the 408 song is fetched again around the service worker');
    assert.strictEqual(log.started.length, 1, 'and it plays');
    const woodcutting = { id: 'melvorD:Woodcutting', on() {} };
    globalThis.game = { activeAction: woodcutting, skills: [woodcutting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
    hooks.character();
    const before = fetched.length;
    await tick();
    assert.ok(audio.music['melvorD:Woodcutting'].includes(sentToWorker.at(-1)), 'the next song goes straight around the service worker');
    assert.strictEqual(fetched.slice(before).filter((url) => url.startsWith('http')).length, 0, 'without asking the service worker first');
    assert.strictEqual(log.started.length, 2);
    const report = await configs.debug.onClick();
    assert.match(report, /game's service worker: https:\/\/android\.melvoridle\.com\/offlineClientStage3\/sw\.js, songs downloaded around it 2, going around it: worked/);
  } finally {
    Object.defineProperty(globalThis, 'navigator', realNavigator);
    delete globalThis.Worker;
  }
});

test('effect files decode a few at a time, and one that failed to decode is tried again the next time it plays', async () => {
  const { log, hooks, tick, fetched } = await boot();
  const skillListeners = {};
  const cooking = { id: 'melvorD:Cooking', on: (type, fn) => (skillListeners[type] = fn) };
  globalThis.game = { activeAction: undefined, skills: [cooking], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true, altMagic: {} };
  const files = new Set(Object.values(audio.sfx).flatMap((group) => (typeof group === 'string' ? [group] : Object.values(group))));
  const engine = log.engines.at(-1);
  const decode = engine.decodeAudioData;
  const cookingFile = `blob:${audio.sfx.skills['melvorD:Cooking']}`;
  let decodes = 0;
  let running = 0;
  let most = 0;
  let failCooking = true;
  engine.decodeAudioData = async (data) => {
    decodes++;
    most = Math.max(most, ++running);
    await new Promise((resolve) => setTimeout(resolve, 1));
    running--;
    if (data.url === cookingFile && failCooking) {
      failCooking = false;
      throw Object.assign(new Error('The buffer passed to decodeAudioData contains invalid content which cannot be decoded successfully.'), { name: 'EncodingError' });
    }
    return decode(data);
  };
  hooks.character();
  hooks.ready();
  while (decodes < files.size || running > 0) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.strictEqual(most, 4, 'never more than 4 decodes at once');
  const cookingFetches = () => fetched.filter((url) => url === cookingFile).length;
  assert.strictEqual(cookingFetches(), 1);
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const before = log.started.length;
  skillListeners.action();
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.strictEqual(cookingFetches(), 2, 'the failed file is loaded again');
  assert.strictEqual(log.started.length, before + 1, 'and plays');
});

test('volumes saved with a character apply as soon as it loads, and the main menu uses the volumes last set', async () => {
  const first = await boot();
  await first.tick();
  const [, musicGain, effectsGain] = first.log.engines.at(-1).gains;
  assert.strictEqual(musicGain.gain.value, 0.3, 'a new player hears the default music volume at the main menu');
  first.settings['Music:volume'] = 5;
  first.settings['Sound effects:effects-volume'] = 0.5;
  const woodcutting = { id: 'melvorD:Woodcutting', on() {} };
  globalThis.game = { activeAction: woodcutting, skills: [woodcutting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
  first.hooks.character();
  await first.tick();
  assert.strictEqual(musicGain.gain.value, 0.05, 'Melvor restores saved settings without calling onChange, so loading the character applies them');
  assert.strictEqual(effectsGain.gain.value, 0.005);
  assert.deepStrictEqual(first.stored.volumes, [5, 0.5, true]);

  const next = await boot({ account: { volumes: first.stored.volumes } });
  await next.tick();
  const [, menuMusic, menuEffects] = next.log.engines.at(-1).gains;
  assert.strictEqual(menuMusic.gain.value, 0.05, 'the main menu plays at the volume last set, not the default 30');
  assert.strictEqual(menuEffects.gain.value, 0.005);
  globalThis.game = { activeAction: woodcutting, skills: [woodcutting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
  next.hooks.character();
  await next.tick();
  assert.strictEqual(menuMusic.gain.value, 0.3, 'a character left at the defaults gets the defaults');
  assert.deepStrictEqual(next.stored.volumes, [30, 40, true]);
});

test('someone who turned music off hears no login music, and turning it back on plays at their volume', async () => {
  const first = await boot();
  await first.tick();
  const [, musicGain] = first.log.engines.at(-1).gains;
  const woodcutting = { id: 'melvorD:Woodcutting', on() {} };
  const world = () => ({ activeAction: woodcutting, skills: [woodcutting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true });
  first.settings['Music:volume'] = 5;
  first.settings['Music:enabled'] = false;
  globalThis.game = world();
  first.hooks.character();
  await first.tick();
  assert.strictEqual(musicGain.gain.value, 0, 'a character saved with music off loads silent');
  assert.deepStrictEqual(first.stored.volumes, [5, 40, false]);
  first.settings['Music:enabled'] = true;
  first.configs.enabled.onChange(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await first.tick();
  assert.strictEqual(musicGain.gain.value, 0.05, 'turning music back on brings its volume back, not just the song');
  first.settings['Music:enabled'] = false;
  first.configs.enabled.onChange(false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(first.stored.volumes, [5, 40, false], 'turning music off is remembered at once');

  const next = await boot({ account: { volumes: first.stored.volumes } });
  await next.tick();
  assert.strictEqual(next.fetched.length, 0, 'no login music is even downloaded');
  assert.strictEqual(next.log.started.length, 0);
});

test('a cog in the top left of the player closes it and opens this mod\'s settings', async () => {
  const { hooks, tick, topBar } = await boot({ header: true });
  const calls = [];
  globalThis.$ = () => ({ dropdown: (command) => calls.push(['dropdown', command]) });
  globalThis.sidebar = {
    category: (category) => ({
      item: (item) => ({
        subitems: () => [
          { id: 'Another Mod', click: () => calls.push(['opened', category, item, 'Another Mod']) },
          { id: 'Old School Runescape Sounds', click: () => calls.push(['opened', category, item, 'Old School Runescape Sounds']) },
        ],
      }),
    }),
  };
  try {
    hooks.ready();
    await tick();
    const cog = topBar.children[0].find((child) => child.className?.includes('osrs-music-settings'));
    assert.ok(cog, 'the player has a cog button');
    assert.ok(cog.children.some((icon) => icon.className.includes('fa-cog')));
    cog.click();
    assert.deepStrictEqual(calls, [['dropdown', 'hide'], ['opened', 'Modding', 'Mod Settings', 'Old School Runescape Sounds']]);
  } finally {
    delete globalThis.$;
    delete globalThis.sidebar;
  }
});

test('with nothing playing for 5 seconds the audio engine pauses to save battery, the next sound wakes it, and a song keeps it running', async () => {
  const realNow = Date.now;
  let offset = 0;
  Date.now = () => realNow() + offset;
  try {
    const { log, hooks, tick, settings, listeners } = await boot();
    const skillListeners = {};
    const cooking = { id: 'melvorD:Cooking', on: (type, fn) => (skillListeners[type] = fn) };
    globalThis.game = { activeAction: undefined, skills: [cooking], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true, altMagic: {} };
    settings['Music:enabled'] = false;
    hooks.character();
    hooks.ready();
    listeners.pointerdown();
    await tick();
    assert.strictEqual(log.state, 'running');
    offset += 6000;
    await tick();
    assert.strictEqual(log.state, 'suspended', 'paused after 5 quiet seconds');
    listeners.pointerdown();
    await tick();
    assert.strictEqual(log.state, 'suspended', 'a tap alone does not wake it');
    const before = log.started.length;
    skillListeners.action();
    await tick();
    assert.strictEqual(log.state, 'running', 'a sound effect wakes it');
    assert.strictEqual(log.started.length, before + 1, 'and plays');
    settings['Music:enabled'] = true;
    await tick();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await tick();
    offset += 60000;
    await tick();
    assert.strictEqual(log.state, 'running', 'never while a song plays');
  } finally {
    Date.now = realNow;
  }
});

test('on iOS the audio engine is never paused for being quiet, since Safari may not restart it without a tap', async () => {
  const realNow = Date.now;
  let offset = 0;
  Date.now = () => realNow() + offset;
  try {
    const { log, hooks, tick, settings, listeners } = await boot({ mobile: true });
    globalThis.game = { activeAction: undefined, skills: [], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true, altMagic: {} };
    settings['Music:enabled'] = false;
    hooks.character();
    hooks.ready();
    listeners.pointerdown();
    await tick();
    offset += 60000;
    await tick();
    assert.strictEqual(log.state, 'running');
  } finally {
    Date.now = realNow;
  }
});
