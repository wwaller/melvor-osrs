import assert from 'node:assert';
import { test } from 'node:test';
import { installDom, screen, settle } from './fake-dom.mjs';

const { popup, press } = installDom();
const dialog = await import('../dialog.mjs');

const speakers = { wizard: { name: 'Wizard Mizgog', chathead: 'mizgog.png' } };

async function advance() {
  screen(popup).box.click();
  await settle();
}

async function choose(label) {
  const shown = screen(popup);
  const index = shown.options.indexOf(label);
  assert.notStrictEqual(index, -1, `"${label}" is offered, got ${JSON.stringify(shown.options)}`);
  shown.choices[index].click();
  await settle();
}

test('a script compiles options, branches and labels into jumps', () => {
  const { program, labels } = dialog.compile([
    { npc: 'wizard', say: 'Hello.' },
    { label: 'menu' },
    { options: [{ label: 'One', then: [{ player: 'One.' }, { goto: 'menu' }] }, { label: 'Two', then: [] }] },
    { if: () => true, then: { text: 'yes' }, else: { text: 'no' } },
  ]);
  assert.strictEqual(labels.get('menu'), 1);
  const choose = program.find((op) => op.op === 'choose');
  assert.deepStrictEqual(choose.choices.map((option) => option.label), ['One', 'Two']);
  assert.strictEqual(program[choose.choices[0].at].node.player, 'One.');
});

test('scripts with mistakes fail with a message that says what is wrong', () => {
  assert.throws(() => dialog.compile([{ goto: 'nowhere' }]), /no label "nowhere"/);
  assert.throws(() => dialog.compile([{ label: 'a' }, { label: 'a' }]), /used twice/);
  assert.throws(() => dialog.compile([{ shout: 'hi' }]), /unknown step/);
  assert.throws(() => dialog.compile(['hello']), /should be an object/);
});

test('a conversation shows each line in turn, puts the player on the right and follows the option picked', async () => {
  const visits = [];
  const talking = dialog.converse([
    { npc: 'wizard', say: ['Hello there, {player}.', 'Lovely day.'] },
    { label: 'menu' },
    {
      options: [
        { label: 'Who are you?', then: [{ player: 'Who are you?' }, { npc: 'wizard', say: 'A wizard.' }, { do: () => visits.push('asked') }, { goto: 'menu' }] },
        { label: 'Secret option', if: () => false, then: [] },
        { label: 'Goodbye.', then: [{ player: 'Goodbye.' }, { end: 'bye' }] },
      ],
    },
    { text: 'never shown' },
  ], { speakers, player: { name: 'Garu Garu' } });
  await settle();
  assert.deepStrictEqual([screen(popup).name, screen(popup).words], ['Wizard Mizgog', 'Hello there, Garu Garu.']);
  await advance();
  assert.strictEqual(screen(popup).words, 'Lovely day.');
  await advance();
  assert.deepStrictEqual(screen(popup).options, ['Who are you?', 'Goodbye.']);
  await choose('Who are you?');
  assert.deepStrictEqual([screen(popup).name, screen(popup).side], ['Garu Garu', 'right']);
  await advance();
  assert.strictEqual(screen(popup).words, 'A wizard.');
  await advance();
  assert.deepStrictEqual(visits, ['asked']);
  assert.deepStrictEqual(screen(popup).options, ['Who are you?', 'Goodbye.'], 'goto came back to the menu');
  await choose('Goodbye.');
  await advance();
  assert.strictEqual(await talking, 'bye');
  assert.strictEqual(popup.open, false, 'the popup closes when the script ends');
});

test('space continues and the number keys pick options, as in OSRS', async () => {
  const talking = dialog.converse([
    { npc: 'wizard', say: 'Pick one.' },
    { options: ['First', 'Second'].map((label) => ({ label, then: { end: label } })) },
  ], { speakers });
  await settle();
  press(' ');
  await settle();
  press('2');
  assert.strictEqual(await talking, 'Second');
});

test('closing the popup part way through ends the conversation without running the rest', async () => {
  let ran = false;
  const talking = dialog.converse([{ npc: 'wizard', say: 'Wait!' }, { do: () => { ran = true; } }], { speakers });
  await settle();
  Swal.close();
  assert.deepStrictEqual(await talking, { dismissed: true });
  await settle();
  assert.strictEqual(ran, false);
});

test('item boxes show the item, and plain text has no speaker', async () => {
  const talking = dialog.converse([
    { item: 'amulet', say: 'The wizard hands you an amulet.' },
    { text: 'You feel lucky.' },
  ], { items: (id) => ({ name: id, media: `${id}.png` }) });
  await settle();
  assert.ok(screen(popup).box.className.includes('osrs-dialog-item'));
  assert.strictEqual(screen(popup).words, 'The wizard hands you an amulet.');
  await advance();
  assert.ok(screen(popup).box.className.includes('osrs-dialog-plain'));
  assert.strictEqual(screen(popup).name, '');
  await advance();
  assert.strictEqual(await talking, undefined);
});

test('call runs a script built at that moment, and its end value ends the whole conversation', async () => {
  const talking = dialog.converse([
    { call: () => [{ text: 'Inner.' }, { end: 42 }] },
    { text: 'Outer, never shown.' },
  ]);
  await settle();
  assert.strictEqual(screen(popup).words, 'Inner.');
  await advance();
  assert.strictEqual(await talking, 42);
});
