import assert from 'node:assert';
import { test } from 'node:test';
import { installDom, screen, settle } from '../../core/test/fake-dom.mjs';

const { popup, toasts } = installDom();
const dialog = await import('../../core/dialog.mjs');
const registry = await import('../../core/registry.mjs');
const { createEngine, COMPLETED, IN_PROGRESS, NOT_STARTED } = await import('../mod/engine.mjs');
const { quest: impCatcher } = await import('../mod/quests/imp-catcher.mjs');

const WIZARD_TOWER = { id: 'melvorD:Wizard_Tower' };
const BEADS = ['Red_bead', 'Yellow_bead', 'Black_bead', 'White_bead'].map((id) => `osrsQuests:${id}`);

function makeGame() {
  const bank = new Map();
  const items = new Map([...BEADS, 'melvorD:Amulet_of_Accuracy'].map((id) => [id, { id, name: id.split(':')[1].replace(/_/g, ' '), media: `${id}.png` }]));
  const magic = { id: 'melvorD:Magic', name: 'Magic', level: 1, xp: 0, addXP(amount) { this.xp += amount; } };
  return {
    characterName: 'Garu Garu',
    magic,
    bank: {
      contents: bank,
      getQty: (item) => bank.get(item.id) ?? 0,
      addItem: (item, quantity) => bank.set(item.id, (bank.get(item.id) ?? 0) + quantity),
      removeItemQuantity: (item, quantity) => bank.set(item.id, (bank.get(item.id) ?? 0) - quantity),
    },
    items: { getObjectByID: (id) => items.get(id) },
    skills: { getObjectByID: (id) => (id === magic.id ? magic : undefined) },
    gp: { total: 0, add(amount) { this.total += amount; } },
  };
}

function makeStorage() {
  const saved = new Map();
  return { getItem: (key) => (saved.has(key) ? JSON.parse(saved.get(key)) : undefined), setItem: (key, value) => saved.set(key, JSON.stringify(value)) };
}

function makeEngine({ game = makeGame(), storage = makeStorage(), random = () => 0 } = {}) {
  const completed = [];
  const engine = createEngine({ game, storage, registry, dialog, random, notify: (text, media) => toasts.push({ text, media }), onComplete: (quest, summary) => completed.push({ quest, summary, popupOpen: popup.open }) });
  for (const [id, name] of [['wizard_mizgog', 'Wizard Mizgog'], ['wizard_grayzag', 'Wizard Grayzag'], ['imp', 'Imp']]) {
    engine.npcs.register({ id: `osrsQuests:${id}`, name, chathead: `${id}.png` });
  }
  engine.load();
  return { engine, game, storage, completed };
}

async function play(talking, picks) {
  const seen = [];
  for (;;) {
    await settle();
    if (!popup.open) break;
    const shown = screen(popup);
    if (shown.options) {
      const label = picks.shift();
      assert.ok(label, `ran out of picks at ${JSON.stringify(shown.options)}`);
      seen.push(`> ${label}`);
      shown.choices[shown.options.indexOf(label)].click();
    } else {
      seen.push(`${shown.name}: ${shown.words}`);
      shown.box.click();
    }
  }
  await talking;
  return seen;
}

test('Imp Catcher plays through from the first conversation to the Quest Complete screen', async () => {
  const { engine, game, completed } = makeEngine();
  engine.quests.register(impCatcher);
  const started = [];
  engine.on('questStarted', ({ quest }) => started.push(quest.id));
  assert.strictEqual(engine.status(impCatcher.id), NOT_STARTED);
  assert.match(engine.journal(impCatcher.id).lines[0].text, /speaking to \*Wizard Mizgog\*/);
  assert.deepStrictEqual(engine.journal(impCatcher.id).talk.map((talk) => talk.name), ['Wizard Mizgog']);

  const first = await play(engine.talk(impCatcher.id, 'mizgog'), ['Most of your friends are pretty quiet, aren\'t they?', 'Give me a quest please.', 'I\'ll try.']);
  assert.strictEqual(first[0], 'Wizard Mizgog: Hello there.');
  assert.ok(first.includes('Wizard Mizgog: Yes, they\'ve mostly got their heads in the clouds, thinking about magic.'));
  assert.ok(first.includes('Garu Garu: I\'ll try.'));
  assert.strictEqual(engine.status(impCatcher.id), IN_PROGRESS);
  assert.deepStrictEqual(started, [impCatcher.id]);

  const early = await play(engine.talk(impCatcher.id, 'mizgog'), []);
  assert.ok(early.includes('Garu Garu: I\'ve not found any yet.'));

  await engine.dispatch('monsterKilled', { area: { id: 'melvorD:Farmlands' } });
  assert.strictEqual(BEADS.filter((bead) => game.bank.contents.get(bead)).length, 0, 'beads only come from the Wizard Tower');
  for (let kill = 0; kill < 6; kill++) await engine.dispatch('monsterKilled', { area: WIZARD_TOWER });
  assert.deepStrictEqual(BEADS.map((bead) => game.bank.contents.get(bead)), [1, 1, 1, 1], 'one of each bead, never a spare');
  assert.strictEqual(toasts.filter((toast) => toast.text.startsWith('Wizard Grayzag')).length, 1, 'Grayzag taunts once');
  assert.ok(toasts.some((toast) => toast.media === 'imp.png'), 'the imp toast shows the imp chathead');

  const journal = engine.journal(impCatcher.id);
  assert.ok(journal.lines.filter((line) => /bead\*$/.test(line.text)).every((line) => line.done), 'each found bead is struck through');
  assert.ok(journal.lines.some((line) => line.text.startsWith('I have all four beads')));

  const last = await play(engine.talk(impCatcher.id, 'mizgog'), []);
  assert.ok(last.includes(': You give four coloured beads to Wizard Mizgog.'));
  assert.strictEqual(completed.length, 1);
  assert.strictEqual(completed[0].popupOpen, false, 'the Quest Complete screen waits for the conversation to close');
  assert.deepStrictEqual(completed[0].summary.lines, ['1 Quest Point', '875 Magic XP', 'Amulet of Accuracy']);
  assert.deepStrictEqual(BEADS.map((bead) => game.bank.contents.get(bead)), [0, 0, 0, 0]);
  assert.strictEqual(game.bank.contents.get('melvorD:Amulet_of_Accuracy'), 1);
  assert.strictEqual(game.magic.xp, 875);
  assert.strictEqual(engine.status(impCatcher.id), COMPLETED);
  assert.strictEqual(engine.questPoints(), 1);
  assert.ok(engine.journal(impCatcher.id).finished);
  assert.ok(engine.journal(impCatcher.id).lines.every((line) => line.done), 'a finished journal is all struck through');
  assert.deepStrictEqual(engine.journal(impCatcher.id).talk, []);
});

test('progress is saved per character and comes back on load', async () => {
  const storage = makeStorage();
  const { engine } = makeEngine({ storage });
  engine.quests.register(impCatcher);
  engine.handle(impCatcher.id).setStage('beads');
  engine.handle(impCatcher.id).set('taunted', true);
  const { engine: reloaded } = makeEngine({ storage });
  reloaded.quests.register(impCatcher);
  assert.strictEqual(reloaded.status(impCatcher.id), IN_PROGRESS);
  assert.strictEqual(reloaded.handle(impCatcher.id).get('taunted'), true);
  reloaded.reset();
  assert.strictEqual(reloaded.status(impCatcher.id), NOT_STARTED);
});

test('a quest whose requirements are not met cannot be started', async () => {
  const { engine, game } = makeEngine();
  engine.quests.register(impCatcher);
  engine.quests.register({
    id: 'testMod:sequel',
    name: 'The Sequel',
    questPoints: 2,
    requirements: [{ quest: impCatcher.id }, { skill: 'melvorD:Magic', level: 10 }],
    cast: { mizgog: 'osrsQuests:wizard_mizgog' },
    stages: { start: { journal: ['Speak to *Wizard Mizgog*.'], talk: { mizgog: [{ do: (q) => q.setStage('middle') }] } }, middle: { journal: ['Middle.'] } },
  });
  const journal = engine.journal('testMod:sequel');
  assert.deepStrictEqual(journal.lines.slice(1).map((line) => [line.text, line.done]), [['To start this quest I need:', false], ['Imp Catcher', false], ['10 Magic', false]]);
  assert.strictEqual(journal.talk[0].locked, true);
  assert.deepStrictEqual(await engine.talk('testMod:sequel', 'mizgog'), { locked: true });
  game.magic.level = 10;
  engine.handle(impCatcher.id).complete();
  assert.strictEqual(engine.journal('testMod:sequel').talk[0].locked, false);
  assert.strictEqual(engine.maxQuestPoints(), 3);
});

test('mistakes in a quest definition are reported when it is registered', () => {
  const { engine } = makeEngine();
  const base = { id: 'testMod:broken', name: 'Broken', stages: { start: {} } };
  assert.throws(() => engine.quests.register({ ...base, stages: { middle: {} } }), /needs a "start" stage/);
  assert.throws(() => engine.quests.register({ ...base, stages: { start: { on: { sneeze() {} } } } }), /unknown trigger "sneeze"/);
  assert.throws(() => engine.quests.register({ ...base, id: 'no-namespace' }), /yourNamespace:name/);
  assert.throws(() => engine.quests.register({ ...base, name: 7 }), /name should be string/);
  engine.quests.register(base);
  assert.throws(() => engine.quests.register(base), /already registered/);
});

test('a trigger that throws is logged and does not stop other quests hearing the event', async () => {
  const { engine } = makeEngine();
  const heard = [];
  const quiet = console.error;
  console.error = () => {};
  engine.quests.register({ id: 'testMod:a', name: 'A', stages: { start: { on: { levelUp() { throw new Error('boom'); } } } } });
  engine.quests.register({ id: 'testMod:b', name: 'B', stages: { start: { on: { levelUp: (event) => heard.push(event.level) } } } });
  await engine.dispatch('levelUp', { level: 5 });
  console.error = quiet;
  assert.deepStrictEqual(heard, [5]);
});

const QUEST_FILES = ['cooks-assistant', 'restless-ghost', 'rune-mysteries', 'dorics-quest', 'imp-catcher', 'vampyre-slayer', 'ernest-the-chicken', 'goblin-diplomacy', 'black-knights-fortress', 'dragon-slayer'];
const allQuests = await Promise.all(QUEST_FILES.map(async (file) => (await import(`../mod/quests/${file}.mjs`)).quest));

function anyGame() {
  const game = makeGame();
  const bank = game.bank.contents;
  const items = new Map();
  game.items = { getObjectByID: (id) => (items.has(id) ? items.get(id) : items.set(id, { id, name: id.split(':')[1].replace(/_/g, ' '), media: `${id}.png` }).get(id)) };
  const skills = new Map();
  game.skills = { getObjectByID: (id) => (skills.has(id) ? skills.get(id) : skills.set(id, { id, name: id.split(':')[1], level: 99, xp: 0, addXP(amount) { this.xp += amount; } }).get(id)) };
  game.bank.getQty = (item) => bank.get(item.id) ?? 0;
  return game;
}

test('every quest uses talking heads and quest items that the library has', async () => {
  const { readFileSync } = await import('node:fs');
  const library = JSON.parse(readFileSync(new URL('../mod/library.json', import.meta.url)));
  for (const quest of allQuests) {
    for (const [key, npc] of Object.entries(quest.cast ?? {})) assert.ok(npc.replace('osrsQuests:', '') in library.npcs, `${quest.name}: no talking head for ${key} (${npc})`);
    const source = readFileSync(new URL(`../mod/quests/${QUEST_FILES[allQuests.indexOf(quest)]}.mjs`, import.meta.url), 'utf8');
    for (const [, item] of source.matchAll(/'osrsQuests:([A-Z]\w+)'/g)) assert.ok(item in library.items, `${quest.name}: no quest item ${item}`);
  }
});

test('every quest registers, and every stage has a journal and talk scripts that compile', () => {
  const { engine } = makeEngine({ game: anyGame() });
  for (const id of new Set(allQuests.flatMap((quest) => Object.values(quest.cast ?? {})))) if (!engine.npcs.get(id)) engine.npcs.register({ id, name: id, chathead: `${id.split(':')[1]}.png` });
  for (const quest of allQuests) engine.quests.register(quest);
  assert.strictEqual(engine.quests.list().length, allQuests.length);
  assert.strictEqual(engine.maxQuestPoints(), 22);
  for (const quest of allQuests) {
    const q = engine.handle(quest.id);
    for (const [name, stage] of Object.entries(quest.stages)) {
      if (name !== 'start') q.setStage(name);
      const journal = engine.journal(quest.id);
      assert.ok(journal.lines.length > 0, `${quest.name} ${name}: empty journal`);
      for (const [cast, script] of Object.entries(stage.talk ?? {})) {
        assert.ok(engine.npc(cast, quest), `${quest.name} ${name}: ${cast} is not in the cast`);
        dialog.compile(typeof script === 'function' ? script(q) : script);
      }
    }
  }
});

test('Cook\'s Assistant: farm drops and a pickpocketed farmer fill the Cook\'s list', async () => {
  const game = anyGame();
  const { engine, completed } = makeEngine({ game });
  const cooks = allQuests.find((quest) => quest.id === 'osrsQuests:cooks_assistant');
  engine.quests.register(cooks);
  engine.npcs.register({ id: 'osrsQuests:cook', name: 'Cook', chathead: 'cook.png' });
  await play(engine.talk(cooks.id, 'cook'), ['What\'s wrong?', 'I\'m always happy to help a cook in distress.']);
  assert.strictEqual(engine.handle(cooks.id).stage, 'ingredients');
  await engine.dispatch('monsterKilled', { monster: { id: 'melvorD:Chicken' }, area: { id: 'melvorD:Farmlands' } });
  await engine.dispatch('monsterKilled', { monster: { id: 'melvorD:Cow' }, area: { id: 'melvorD:Farmlands' } });
  const waiting = await play(engine.talk(cooks.id, 'cook'), []);
  assert.ok(waiting.includes('Cook: Please hurry! I still need a pot of flour.'));
  await engine.dispatch('skillAction', { skill: { id: 'melvorD:Thieving' }, event: { npc: { id: 'melvorF:BOB_THE_FARMER' } } });
  await play(engine.talk(cooks.id, 'cook'), []);
  assert.strictEqual(engine.status(cooks.id), COMPLETED);
  assert.deepStrictEqual(completed.at(-1).summary.lines, ['1 Quest Point', '300 Cooking XP', 'Permission to use the Cook\'s range']);
});

test('Goblin Diplomacy: the generals turn down orange and blue before settling on brown', async () => {
  const game = anyGame();
  const { engine, completed } = makeEngine({ game });
  const goblins = allQuests.find((quest) => quest.id === 'osrsQuests:goblin_diplomacy');
  engine.quests.register(goblins);
  for (const [id, name] of [['general_wartface', 'General Wartface'], ['general_bentnoze', 'General Bentnoze'], ['aggie', 'Aggie']]) engine.npcs.register({ id: `osrsQuests:${id}`, name, chathead: `${id}.png` });
  await play(engine.talk(goblins.id, 'wartface'), ['Do you want me to pick an armour colour for you?']);
  for (let kill = 0; kill < 5; kill++) await engine.dispatch('monsterKilled', { monster: { id: 'melvorD:Golbin' }, area: { id: 'melvorD:Goblin_Village' } });
  assert.strictEqual(game.bank.contents.get('osrsQuests:Goblin_mail'), 3, 'no more than three mail');
  const early = await play(engine.talk(goblins.id, 'wartface'), ['Not yet.']);
  assert.ok(!early.some((line) => line.includes('orange armour')), 'orange is hidden until you have the dyes');
  await play(engine.talk(goblins.id, 'aggie'), []);
  const shown = await play(engine.talk(goblins.id, 'wartface'), ['I have some orange armour here.', 'I have some blue armour here.', 'I have some brown armour here.']);
  assert.ok(shown.includes('General Bentnoze: Ooh, brown. That good colour.'));
  assert.strictEqual(engine.status(goblins.id), COMPLETED);
  assert.strictEqual(completed.at(-1).quest.id, goblins.id);
});
