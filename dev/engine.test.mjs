import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

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

test('no two settings share a name, since Melvor gives each one the page id "mod:name" whatever its section', async () => {
  const { settings } = await boot();
  const names = Object.keys(settings).map((key) => key.split(':').slice(1).join(':'));
  assert.deepStrictEqual(names.filter((name, i) => names.indexOf(name) !== i), []);
});
