import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const audio = JSON.parse(readFileSync(new URL('../mod/audio.json', import.meta.url)));

function fakeEngine(log) {
  const param = () => ({ value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; } });
  const node = () => ({ gain: param(), connect(target) { return target; }, disconnect() {} });
  const engine = {
    currentTime: 0,
    state: 'suspended',
    destination: {},
    createGain: node,
    createBuffer: (channels, length, sampleRate) => ({ numberOfChannels: channels, length, sampleRate, duration: 100, getChannelData: () => new Float32Array(length) }),
    createBufferSource() {
      const source = { engine, buffer: null, onended: null, connect(target) { return target; }, start(when, offset) { source.offset = offset; log.started.push(source); }, stop() { log.stopped.push(source); } };
      return source;
    },
    decodeAudioData: async (data) => ({ numberOfChannels: 2, length: 8, sampleRate: 22050, duration: 100, url: data.url, getChannelData: () => new Float32Array(8) }),
    resume: async () => { engine.state = 'running'; },
    suspend: async () => { engine.state = 'suspended'; },
    close: async () => { engine.state = 'closed'; },
  };
  log.engines.push(engine);
  return engine;
}

async function boot({ mobile = false } = {}) {
  const log = { started: [], stopped: [], engines: [], get state() { return this.engines.at(-1).state; } };
  const listeners = {};
  const intervals = [];
  const settings = {};
  const hooks = {};
  const fetched = [];
  const patches = {};
  globalThis.window = { AudioContext: function AudioContext() { return fakeEngine(log); }, addEventListener: (t, fn) => (listeners[`window:${t}`] = fn) };
  globalThis.document = { hidden: false, addEventListener: (t, fn) => (listeners[t] = fn) };
  globalThis.fetch = async (url) => { fetched.push(url); return { arrayBuffer: async () => Object.assign(new ArrayBuffer(8), { url }) }; };
  globalThis.setInterval = (fn) => intervals.push(fn);
  globalThis.nativeManager = { isIOS: mobile, isAndroid: false };
  globalThis.Skill = class Skill { onLevelUp() {} };
  globalThis.PetManager = class PetManager { unlockPet() {} };
  globalThis.Player = class Player { togglePrayer() {} eatFood() {} };
  globalThis.Bank = class Bank { buryItemOnClick() {} };
  globalThis.BaseManager = class BaseManager { onPlayerDeath() {} };
  delete globalThis.game;
  const ctx = {
    loadData: async () => audio,
    getResourceUrl: (path) => `blob:${path}`,
    settings: { section: (name) => ({ add(configs) { for (const c of configs) settings[`${name}:${c.name}`] = c.default; }, get: (key) => settings[`${name}:${key}`] }) },
    patch: (target, method) => ({ after: (fn) => (patches[`${target.name}.${method}`] = fn), replace: (fn) => (patches[`${target.name}.${method}`] = fn) }),
    onCharacterLoaded: (fn) => (hooks.character = fn),
    onInterfaceReady: (fn) => (hooks.ready = fn),
  };
  const { setup } = await import(`../mod/setup.mjs?${Math.random()}`);
  await setup(ctx);
  const tick = async () => { intervals.forEach((fn) => fn()); await new Promise((r) => setTimeout(r, 0)); };
  return { log, listeners, settings, hooks, fetched, patches, tick };
}

test('character select plays Scape Main, a skill crossfades to its own track, music off stops it', async () => {
  const { log, settings, hooks, fetched, tick } = await boot();
  await tick();
  assert.match(fetched[0], /Scape_Main/);
  assert.strictEqual(log.started.length, 1);

  const skillListeners = {};
  const woodcutting = { id: 'melvorD:Woodcutting', on: (type, fn) => (skillListeners[type] = fn) };
  globalThis.game = { activeAction: woodcutting, skills: [woodcutting], combat: { player: { on() {} }, on() {} }, farming: { on() {} }, on() {}, _isInOnlineLoop: true };
  hooks.character();
  await tick();
  assert.ok(audio.music['melvorD:Woodcutting'].includes(fetched.at(-1)), 'woodcutting track requested');
  assert.strictEqual(log.started.length, 2);
  assert.strictEqual(log.stopped.length, 1, 'previous track faded out');

  settings['Music:enabled'] = false;
  await tick();
  assert.strictEqual(log.stopped.length, 2, 'music switched off stops the current track');
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

test('hiding the app on a phone suspends all audio, coming back resumes it', async () => {
  const { log, listeners } = await boot({ mobile: true });
  listeners.pointerdown();
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(log.state, 'running');
  document.hidden = true;
  listeners.visibilitychange();
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(log.state, 'running', 'fades out before suspending');
  await new Promise((r) => setTimeout(r, 120));
  assert.strictEqual(log.state, 'suspended');
  document.hidden = false;
  listeners.visibilitychange();
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
  assert.strictEqual(resumed.offset, 42, 'the track continues where it was');
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
