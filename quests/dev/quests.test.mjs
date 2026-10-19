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
