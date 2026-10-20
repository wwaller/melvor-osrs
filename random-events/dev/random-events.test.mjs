import assert from 'node:assert';
import { test } from 'node:test';
import { all, element, one } from '../../core/test/fake-dom.mjs';

const HOUR_MS = 60 * 60 * 1000;
const realSetTimeout = setTimeout;
const realRandom = Math.random;
const realNow = Date.now;
const settle = () => new Promise((r) => realSetTimeout(r, 0));
const START = 1_800_000_000_000;
const COSTUME = ['Frog_Mask', 'Royal_Frog_Tunic', 'Royal_Frog_Leggings', 'Royal_Frog_Blouse', 'Royal_Frog_Skirt', 'Camo_Top', 'Camo_Helmet', 'Camo_Bottoms'];

const labelled = (root, className, label) => all(root, className).find((node) => node.attributes['aria-label'] === label);

class FoodItem {
  constructor(id, extra = {}) {
    Object.assign(this, { id, name: id, media: `${id}.png`, type: 'Food', golbinRaidExclusive: false }, extra);
  }
}

const thing = (id, type) => ({ id, name: id, media: `${id}.png`, type, golbinRaidExclusive: false });

function makeGame({ foods = 10, skills, owned = [], equipped = [] } = {}) {
  const realm = { id: 'melvorD:Melvor' };
  const added = [];
  const earned = [];
  const token = (id) => ({ id: `${id} token` });
  const skill = (id, isUnlocked, hasToken = true) => ({ id, name: id, media: `${id}.png`, isUnlocked, masteryTokens: new Map(hasToken ? [[realm, [token(id)]]] : []) });
  const byId = new Map([
    ...['melvorD:Topaz', 'melvorD:Sapphire', 'melvorD:Emerald', 'melvorD:Ruby', 'melvorD:Diamond', 'melvorD:Fire_Rune', 'melvorD:Water_Rune', 'melvorD:Earth_Rune', 'melvorD:Air_Rune', 'melvorF:Nature_Rune']
      .map((id) => [id, thing(id.split(':')[1], 'Gem')]),
    ...COSTUME.map((id) => [`osrsRandomEvents:${id}`, thing(id, 'Armour')]),
  ]);
  const emptyFood = new FoodItem('Empty_Food', { name: '', media: 'food_empty.png', type: '' });
  return {
    added,
    earned,
    characterName: 'Garu Garu',
    emptyFoodItem: emptyFood,
    defaultRealm: realm,
    items: {
      allObjects: [
        ...Array.from({ length: foods }, (_, i) => new FoodItem(`Food ${i}`)),
        new FoodItem('Raid food', { golbinRaidExclusive: true }),
        new FoodItem('Same icon as Food 0', { media: 'Food 0.png' }),
        emptyFood,
        new FoodItem('Lemonade (Full)', { media: 'missing_artwork.png', ignoreCompletion: true }),
        ...['Normal', 'Oak', 'Willow', 'Teak'].map((name) => thing(`${name} Logs`, 'Logs')),
        ...['Copper', 'Tin', 'Iron'].map((name) => thing(`${name} Ore`, 'Ore')),
        thing('Mystery Junk', 'Junk'),
      ],
      getObjectByID: (id) => byId.get(id),
    },
    skills: { allObjects: skills ?? [skill('Woodcutting', true), skill('Fishing', false), skill('Attack', true, false), skill('Cooking', true)] },
    bank: { addItem: (...args) => added.push(args), hasItem: (item) => owned.includes(item.id) },
    gp: { add: (amount) => earned.push(amount) },
    combat: { player: { checkEquipmentSetsForItem: (item) => equipped.includes(item.id) } },
  };
}

function installGlobals() {
  const toasts = [];
  const popup = { open: false, html: null, close: null };
  globalThis.FoodItem = FoodItem;
  globalThis.document = { createElement: element, fonts: { add() {} } };
  globalThis.FontFace = class { load() { return Promise.resolve(this); } };
  globalThis.imageNotify = (media, message, theme) => toasts.push({ media, message, theme });
  globalThis.Swal = {
    isVisible: () => popup.open,
    close: () => popup.close?.(),
  };
  globalThis.SwalLocale = {
    fire: (options) => {
      popup.open = true;
      popup.html = options.html;
      return new Promise((resolve) => {
        popup.close = () => {
          popup.open = false;
          resolve({ isDismissed: true });
        };
      });
    },
  };
  return { toasts, popup };
}

const load = (path) => import(`../mod/${path}?${Math.random()}`);

async function helpers() {
  const [dialog, lamp, loot, outfits] = await Promise.all(['core/dialog.mjs', 'lamp.mjs', 'loot.mjs', 'outfits.mjs'].map(load));
  return { dialog, lamp, loot, outfits };
}

async function showEvent(path, { game = makeGame(), preview = false, random } = {}) {
  const globals = installGlobals();
  globalThis.setTimeout = (fn) => fn();
  const event = await load(path);
  const kit = { game, ...(await helpers()), media: (file) => `blob:${file}`, preview, ...(random ? { random } : {}) };
  event.show(kit);
  return { ...globals, game, event, kit, root: globals.popup.html };
}

async function boot({ stored, game = makeGame(), beforeModsLoaded = () => {} } = {}) {
  const globals = installGlobals();
  let clock = START;
  Date.now = () => clock;
  globalThis.game = game;
  const storage = new Map(stored === undefined ? [] : [['next-event', stored]]);
  const intervals = [];
  const timers = [];
  const registered = [];
  globalThis.setInterval = (fn) => intervals.push(fn);
  globalThis.setTimeout = (fn, ms) => timers.push({ fn, ms });
  const buttons = [];
  let characterLoaded;
  let interfaceReady;
  let modsLoaded;
  let published;
  const ctx = {
    loadStylesheet() {},
    loadModule: load,
    getResourceUrl: (path) => `blob:${path}`,
    getResourceBlob: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }),
    gameData: { buildPackage: (build) => ({ add: async () => build({ items: { add: (item) => registered.push(item) } }) }) },
    settings: { section: () => ({ add: (list) => buttons.push(...list) }) },
    characterStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    accountStorage: { getItem() {}, setItem() {} },
    onCharacterSelectionLoaded() {},
    onCharacterLoaded: (fn) => (characterLoaded = fn),
    onInterfaceReady: (fn) => (interfaceReady = fn),
    onModsLoaded: (fn) => (modsLoaded = fn),
    api: (endpoints) => (published = endpoints),
  };
  const { setup } = await load('setup.mjs');
  await setup(ctx);
  beforeModsLoaded(published);
  modsLoaded();
  characterLoaded();
  interfaceReady();
  const tick = async (ms = 60 * 1000) => {
    clock += ms;
    intervals.forEach((fn) => fn());
    await settle();
  };
  return { ...globals, storage, buttons, timers, registered, tick, game, published };
}

const wantedFood = (root) => root.textContent.match(/have a (.+?) on me/)[1];

test.afterEach(() => {
  Date.now = realNow;
  Math.random = realRandom;
  globalThis.setTimeout = realSetTimeout;
});

test('the next event is due 12 to 36 hours later, about a day on average', async () => {
  const { nextDue } = await load('setup.mjs');
  assert.strictEqual(nextDue(0, () => 0), 12 * HOUR_MS);
  assert.strictEqual(nextDue(0, () => 0.5), 24 * HOUR_MS);
  assert.strictEqual(nextDue(0, () => 1), 36 * HOUR_MS);
});

test('an event that came due while away waits 1 to 5 minutes after the game opens', async () => {
  const { startDelay } = await load('setup.mjs');
  assert.strictEqual(startDelay(() => 0), 60 * 1000);
  assert.strictEqual(startDelay(() => 1), 5 * 60 * 1000);
  const { popup, tick } = await boot({ stored: START - HOUR_MS });
  await tick(30 * 1000);
  assert.strictEqual(popup.html, null, 'not straight away');
  await tick(5 * 60 * 1000);
  assert.ok(popup.html, 'shown within a few minutes');
});

test('another mod can add its own event, which gets a preview button and can come up', async () => {
  const shown = [];
  const event = { id: 'otherMod:mime', title: 'the Mime', weight: 1000, available: () => true, show: (kit) => shown.push(kit.preview) };
  const { buttons, tick, published } = await boot({ stored: START - HOUR_MS, beforeModsLoaded: (api) => api.registerEvent(event) });
  assert.strictEqual(published.version, 1);
  assert.ok(published.events().some((each) => each.id === 'otherMod:mime' && each.weight === 1000));
  assert.ok(buttons.some((button) => button.name === 'preview-otherMod-mime' && button.display === 'Preview the Mime in 10 seconds'));
  assert.ok(buttons.some((button) => button.name === 'preview-genie'), 'built-in previews keep their setting names');
  await tick(10 * 60 * 1000);
  assert.deepStrictEqual(shown, [false], 'a heavily weighted event is the one that comes up, for real');
  published.trigger('otherMod:mime');
  assert.deepStrictEqual(shown, [false, true], 'trigger shows a preview by default');
  assert.throws(() => published.registerEvent({ id: 'otherMod:broken', title: 'Broken', available: () => true }), /show should be function/);
  assert.throws(() => published.registerEvent({ ...event, id: 'nonamespace' }), /yourNamespace:name/);
});

test('a new character gets its first event a day or so later, not on install', async () => {
  const { storage, popup, tick } = await boot();
  await tick(10 * 60 * 1000);
  assert.strictEqual(popup.open, false);
  assert.ok(storage.get('next-event') >= START + 12 * HOUR_MS);
});

test('a due event waits for other popups, then shows and schedules the next one', async () => {
  const { storage, popup, tick } = await boot({ stored: START - 1000 });
  popup.open = true;
  await tick(10 * 60 * 1000);
  assert.strictEqual(popup.html, null, 'waits while another popup is open');
  popup.open = false;
  await tick();
  assert.ok(popup.html, 'an event popup opened');
  assert.ok(storage.get('next-event') >= Date.now() + 12 * HOUR_MS);
});

test('events that cannot run are never picked', async () => {
  const { popup, tick } = await boot({ stored: 0, game: makeGame({ foods: 0, skills: [] }) });
  Math.random = () => 0;
  await tick(10 * 60 * 1000);
  assert.match(popup.html.textContent, /Greetings from the prince, Garu Garu!/, 'the Sandwich lady and the Genie are skipped, so the first event left is the frog');
});

test('debug buttons preview each event 10 seconds later, with no reward and no change to the schedule', async () => {
  const { buttons, timers, popup, storage, game } = await boot();
  const due = storage.get('next-event');
  assert.deepStrictEqual(buttons.map((button) => button.display), [
    'Preview the Sandwich lady in 10 seconds',
    'Preview the Genie in 10 seconds',
    'Preview Kiss the frog in 10 seconds',
    'Preview a Certer in 10 seconds',
    'Preview Pinball in 10 seconds',
    'Preview the Drill Demon in 10 seconds',
    'Preview the Quiz Master in 10 seconds',
    'Preview the Pillory in 10 seconds',
  ]);
  buttons[1].onClick();
  assert.strictEqual(popup.html, null);
  assert.deepStrictEqual(timers.map((timer) => timer.ms), [10 * 1000]);
  timers[0].fn();
  all(popup.html, 'osrs-re-skill')[0].click();
  one(popup.html, 'osrs-re-confirm').click();
  assert.strictEqual(game.added.length, 0);
  assert.match(popup.html.textContent, /This is a preview, so no reward is given\./);
  assert.strictEqual(storage.get('next-event'), due);
});

test('the frog and camo costumes are registered as stat-free equipment that stays out of the completion log', async () => {
  const { registered } = await boot();
  assert.deepStrictEqual(registered.map((item) => item.id), COSTUME);
  for (const item of registered) {
    assert.strictEqual(item.itemType, 'Equipment');
    assert.deepStrictEqual([item.equipmentStats, item.equipRequirements, item.ignoreCompletion], [[], [], true]);
    assert.match(item.media, /^img\/costume\/.+\.png$/);
  }
});

test('the tray holds 7 different-looking foods, never raid food or non-food', async () => {
  const { root, game } = await showEvent('sandwich-lady.mjs');
  const foods = all(root, 'osrs-re-food').map((button) => button.attributes['aria-label']);
  assert.strictEqual(foods.length, 7);
  assert.strictEqual(new Set(foods).size, 7);
  assert.ok(foods.every((name) => /^Food \d$/.test(name)), foods.join());
  assert.strictEqual(game.added.length, 0);
});

test('the tray never holds the empty food slot or event food', async () => {
  const { root } = await showEvent('sandwich-lady.mjs', { game: makeGame({ foods: 2 }) });
  assert.deepStrictEqual(all(root, 'osrs-re-food').map((button) => button.attributes['aria-label']).sort(), ['Food 0', 'Food 1']);
});

test('taking the food she offers gives 5 to 25 of it, even with a full bank', async () => {
  const { root, game } = await showEvent('sandwich-lady.mjs', { random: () => 0 });
  const wanted = wantedFood(root);
  assert.match(root.textContent, new RegExp(`Have a ${wanted} for free!`));
  labelled(root, 'osrs-re-food', wanted).click();
  const [[item, quantity, logLost, found, ignoreSpace]] = game.added;
  assert.strictEqual(item.name, wanted);
  assert.ok(quantity >= 5 && quantity <= 25);
  assert.deepStrictEqual([logLost, found, ignoreSpace], [false, true, true]);
  assert.match(root.textContent, /Hope that fills you up!/);
  assert.strictEqual(one(root, 'osrs-re-tray'), undefined, 'the tray is put away');
});

test('food rewards cover 5 to 25', async () => {
  const { loot } = await helpers();
  assert.strictEqual(loot.foodQuantity(() => 0), 5);
  assert.strictEqual(loot.foodQuantity(() => 0.9999), 25);
});

test('taking the wrong food gives nothing', async () => {
  const { root, game } = await showEvent('sandwich-lady.mjs');
  all(root, 'osrs-re-food').find((button) => button.attributes['aria-label'] !== wantedFood(root)).click();
  assert.strictEqual(game.added.length, 0);
  assert.match(root.textContent, /Hey, I didn't say you could have that!/);
});

test('the Key shows the food names', async () => {
  const { root } = await showEvent('sandwich-lady.mjs');
  one(root, 'osrs-re-key').click();
  assert.ok(one(root, 'osrs-re-tray').classList.contains('osrs-re-keyed'));
});

test('closing without choosing says Maybe later; closing after choosing does not', async () => {
  const first = await showEvent('sandwich-lady.mjs');
  Swal.close();
  await settle();
  assert.deepStrictEqual(first.toasts.map((toast) => toast.message), ['Maybe later.']);
  const second = await showEvent('sandwich-lady.mjs');
  all(second.root, 'osrs-re-food')[0].click();
  one(second.root, 'osrs-dialog-continue').click();
  await settle();
  assert.strictEqual(second.toasts.length, 0);
});

test('the Genie only offers unlocked skills that have mastery tokens', async () => {
  const { root } = await showEvent('genie.mjs');
  assert.deepStrictEqual(all(root, 'osrs-re-skill').map((button) => button.attributes['aria-label']), ['Woodcutting', 'Cooking']);
});

test('the Genie gives 5 mastery tokens for the chosen skill, even with a full bank, then vanishes in a puff of smoke', async () => {
  const { root, game } = await showEvent('genie.mjs');
  const confirm = one(root, 'osrs-re-confirm');
  confirm.click();
  assert.strictEqual(game.added.length, 0, 'Confirm does nothing until a skill is chosen');
  all(root, 'osrs-re-skill')[1].click();
  confirm.click();
  assert.deepStrictEqual(game.added, [[{ id: 'Cooking token' }, 5, false, true, true]]);
  assert.strictEqual(all(root, 'osrs-dialog-puff').length, 7);
  assert.ok(one(root, 'osrs-dialog-head').classList.contains('osrs-dialog-gone'));
  assert.match(root.textContent, /I hope you're happy with your wish/);
});

test('the Genie stays away when no unlocked skill has mastery tokens', async () => {
  const { available } = await load('genie.mjs');
  assert.strictEqual(available({ game: makeGame({ skills: [] }), ...(await helpers()) }), false);
});

test('Kiss the frog: plain frogs cheer, the crowned frog asks for help, and a kiss gives a frog costume piece', async () => {
  const { root, game } = await showEvent('frog.mjs', { random: () => 0 });
  assert.match(root.textContent, /Greetings from the prince, Garu Garu!/);
  labelled(root, 'osrs-re-frog', 'Frog').click();
  assert.match(root.textContent, /Hurrah for the frog prince!/);
  labelled(root, 'osrs-re-frog', 'Frog prince').click();
  assert.match(root.textContent, /sadly frog-obsessed old wizard/);
  all(root, 'osrs-dialog-choice')[0].click();
  assert.deepStrictEqual(game.added, [[{ id: 'Frog_Mask', name: 'Frog_Mask', media: 'Frog_Mask.png', type: 'Armour', golbinRaidExclusive: false }, 1, false, true, true]]);
  assert.match(root.textContent, /Thank you so much, Garu Garu. I must return to my fairytale kingdom./);
});

test('Kiss the frog only gives pieces you do not already have in the bank or in an equipment set', async () => {
  const owned = ['Frog_Mask', 'Royal_Frog_Tunic'];
  const { root, game } = await showEvent('frog.mjs', { game: makeGame({ owned, equipped: ['Royal_Frog_Leggings'] }), random: () => 0 });
  labelled(root, 'osrs-re-frog', 'Frog prince').click();
  all(root, 'osrs-dialog-choice')[0].click();
  assert.strictEqual(game.added[0][0].id, 'Royal_Frog_Blouse');
});

test('with the whole frog costume, the frog royal hands over a lamp instead', async () => {
  const { root, game } = await showEvent('frog.mjs', { game: makeGame({ owned: COSTUME }), random: () => 0 });
  labelled(root, 'osrs-re-frog', 'Frog prince').click();
  all(root, 'osrs-dialog-choice')[0].click();
  assert.strictEqual(game.added.length, 0);
  all(root, 'osrs-re-skill')[0].click();
  one(root, 'osrs-re-confirm').click();
  assert.deepStrictEqual(game.added, [[{ id: 'Woodcutting token' }, 5, false, true, true]]);
});

test('turning the frog down gives nothing', async () => {
  const { root, game, toasts } = await showEvent('frog.mjs', { random: () => 0 });
  labelled(root, 'osrs-re-frog', 'Frog prince').click();
  all(root, 'osrs-dialog-choice')[1].click();
  Swal.close();
  await settle();
  assert.strictEqual(game.added.length, 0);
  assert.match(root.textContent, /Maybe later\./);
  assert.strictEqual(toasts.length, 0);
});

test('a Certer gives a present for naming the item, and nothing for a wrong name', async () => {
  const right = await showEvent('certer.mjs');
  const answer = one(right.root, 'osrs-re-certer-item').src.replace('.png', '');
  all(right.root, 'osrs-dialog-choice').find((choice) => choice.textContent === answer).click();
  assert.strictEqual(right.game.added.length + right.game.earned.length, 1);
  assert.match(right.root.textContent, /Thank you, I hope you like your present/);
  const wrong = await showEvent('certer.mjs');
  const shown = one(wrong.root, 'osrs-re-certer-item').src.replace('.png', '');
  all(wrong.root, 'osrs-dialog-choice').find((choice) => choice.textContent !== shown).click();
  assert.strictEqual(wrong.game.added.length + wrong.game.earned.length, 0);
  assert.match(wrong.root.textContent, /Sorry, that's just not the right answer!/);
});

test('the Certer and Pillory present table only gives GP, food or gems that exist', async () => {
  const { loot } = await helpers();
  installGlobals();
  const game = makeGame();
  for (let step = 0; step < 1; step += 0.01) {
    const reward = loot.gift(game, () => step);
    assert.ok(reward.gp > 0 || (reward.item && reward.quantity > 0), JSON.stringify(reward));
  }
});

test('Pinball: ten pokes of the flashing pillar win gems, and a wrong poke starts the count again', async () => {
  const { root, game } = await showEvent('pinball.mjs');
  const lit = () => all(root, 'osrs-re-pillar').find((pillar) => pillar.classList.contains('osrs-re-lit'));
  for (let i = 0; i < 9; i++) lit().click();
  assert.match(root.textContent, /Score: 9/);
  all(root, 'osrs-re-pillar').find((pillar) => pillar !== lit()).click();
  assert.match(root.textContent, /Score: 0/);
  assert.match(root.textContent, /dats bad/);
  for (let i = 0; i < 10; i++) lit().click();
  assert.strictEqual(game.added.length, 1);
  assert.ok(['Sapphire', 'Emerald', 'Ruby', 'Diamond'].includes(game.added[0][0].id));
  assert.match(root.textContent, /We get break now/);
});

test('Drill Demon: four right exercises in a row win the camo top first, and a wrong one starts over', async () => {
  const { root, game } = await showEvent('drill-demon.mjs');
  const mats = () => all(root, 'osrs-re-mat');
  const ordered = () => mats().find((mat) => one(root, 'osrs-dialog-words').textContent.endsWith(mat.exercise.order));
  ordered().click();
  ordered().click();
  mats().find((mat) => mat !== ordered()).click();
  assert.match(root.textContent, /Wrong exercise, worm!/);
  assert.strictEqual(all(root, 'osrs-dialog-pip-on').length, 0);
  for (let i = 0; i < 4; i++) ordered().click();
  assert.strictEqual(game.added[0][0].id, 'Camo_Top');
  assert.match(root.textContent, /you actually did it, Private/);
});

test('Quiz Master: four odd-ones-out in a row, then the prize of your choice', async () => {
  const { root, game } = await showEvent('quiz-master.mjs');
  const type = new Map(game.items.allObjects.map((item) => [item.name, item.type]));
  const odd = () => {
    const buttons = all(root, 'osrs-re-food');
    return buttons.find((button) => buttons.filter((other) => type.get(other.attributes['aria-label']) === type.get(button.attributes['aria-label'])).length === 1);
  };
  odd().click();
  all(root, 'osrs-re-food').find((button) => button !== odd()).click();
  assert.strictEqual(all(root, 'osrs-dialog-pip-on').length, 0, 'a wrong answer starts the streak over');
  for (let i = 0; i < 4; i++) odd().click();
  assert.match(root.textContent, /Please choose your PRIZE!/);
  all(root, 'osrs-dialog-choice')[0].click();
  assert.deepStrictEqual(game.earned, [10000]);
});

test('the Quiz Master mystery box gives one prize', async () => {
  installGlobals();
  const kit = { game: makeGame(), ...(await helpers()) };
  const { mysteryBox } = await load('quiz-master.mjs');
  for (let step = 0; step < 1; step += 0.05) {
    const prize = mysteryBox(kit, () => step);
    assert.ok(prize.gp > 0 || (prize.item && prize.quantity > 0), JSON.stringify(prize));
  }
});

test('Pillory: the right key three times escapes with a present, a wrong key adds a lock and starts over', async () => {
  const { root, game } = await showEvent('pillory.mjs');
  const shape = () => one(root, 'osrs-re-lock').children[1].children[0].className.split(' ')[1].replace('osrs-re-', '');
  const key = (right) => all(root, 'osrs-re-pkey').find((button) => (button.attributes['aria-label'] === `${shape()} key`) === right);
  key(true).click();
  key(false).click();
  assert.strictEqual(all(root, 'osrs-re-padlock').length, 4);
  assert.strictEqual(all(root, 'osrs-re-open').length, 0);
  for (let i = 0; i < 4; i++) key(true).click();
  assert.strictEqual(game.added.length + game.earned.length, 1);
  assert.match(root.textContent, /Hmmph!/);
});

test('previews never give rewards', async () => {
  const frog = await showEvent('frog.mjs', { preview: true, random: () => 0 });
  labelled(frog.root, 'osrs-re-frog', 'Frog prince').click();
  all(frog.root, 'osrs-dialog-choice')[0].click();
  const pinball = await showEvent('pinball.mjs', { preview: true });
  for (let i = 0; i < 10; i++) all(pinball.root, 'osrs-re-pillar').find((pillar) => pillar.classList.contains('osrs-re-lit')).click();
  for (const { game } of [frog, pinball]) assert.strictEqual(game.added.length + game.earned.length, 0);
  assert.match(pinball.root.textContent, /We get break now/);
});
