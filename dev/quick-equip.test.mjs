import assert from 'node:assert';
import { test } from 'node:test';

function element(tag) {
  const classes = new Set();
  const node = {
    tagName: tag.toUpperCase(),
    children: [],
    set className(value) { classes.clear(); value.split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); },
    get className() { return [...classes].join(' '); },
    classList: { add: (...names) => names.forEach((name) => classes.add(name)), contains: (name) => classes.has(name) },
    append(...nodes) { node.children.push(...nodes); },
    replaceChildren(...nodes) { node.children = nodes; },
    before(other) { node.inserted = other; },
  };
  return node;
}

function equipment(name, slots, requirementsMet = true) {
  return { name, media: `${name}.png`, equipRequirements: requirementsMet ? [] : ['level'], fitsInSlot: (slotID) => slots.includes(slotID) };
}

async function boot() {
  globalThis.document = { createElement: element };
  globalThis.formatNumber = (n) => n.toLocaleString('en-US');
  globalThis.tippy = (target, options) => ({ target, content: options.content, destroyed: false, destroy() { this.destroyed = true; } });
  globalThis.QuickEquipTooltipElement = class QuickEquipTooltipElement { setEquipped() { this.original = true; } };
  const patches = {};
  const ctx = {
    loadStylesheet: (path) => (ctx.stylesheet = path),
    patch: (target, method) => ({ replace: (fn) => (patches[`${target.name}.${method}`] = fn) }),
  };
  const { setup } = await import(`../mod/setup.mjs?${Math.random()}`);
  setup(ctx);
  return { ctx, patches };
}

function tooltipFor() {
  const optional = element('div');
  return { buttons: [{ equip: { parentElement: optional } }], unequipButton: {}, buttonContainer: element('ul'), optional };
}

test('the quick equip menu lists every bank item that fits the slot, worn item first, in bank order', async () => {
  const { ctx, patches } = await boot();
  assert.strictEqual(ctx.stylesheet, 'style.css');
  const helm = equipment('Rune helm', ['melvorD:Helmet']);
  const coif = equipment('Coif', ['melvorD:Helmet'], false);
  const sword = equipment('Sword', ['melvorD:Weapon']);
  const worn = equipment('Dragon helm', ['melvorD:Helmet']);
  const equipCalls = [];
  const slot = { id: 'melvorD:Helmet', allowQuantity: false };
  const equipped = { slot, isEmpty: false, item: worn, quantity: 1 };
  const player = {
    selectedEquipmentSet: 0,
    equipment: { equippedItems: { 'melvorD:Helmet': equipped }, getSlotOfItem: (item) => (item === worn ? slot : undefined) },
    unequipCallback: (s) => () => s,
    equipItem: (...args) => equipCalls.push(args),
  };
  globalThis.game = {
    combat: { player },
    bank: { itemsByTab: [[{ item: sword, quantity: 1 }, { item: helm, quantity: 1 }, { item: worn, quantity: 1 }], [{ item: coif, quantity: 1 }]] },
    checkRequirements: (requirements) => requirements.length === 0,
  };
  const tooltip = tooltipFor();
  patches['QuickEquipTooltipElement.setEquipped'].call(tooltip, () => assert.fail('original menu should not render'), player, equipped);

  const grid = tooltip.quickEquipAllGrid;
  assert.strictEqual(tooltip.buttonContainer.inserted, grid, 'the item grid sits above the unequip button');
  assert.ok(tooltip.optional.classList.contains('d-none'), "Melvor's three set-your-own buttons are hidden");
  assert.deepStrictEqual(grid.tips.map((tip) => tip.content), ['Dragon helm', 'Rune helm', 'Coif'], 'a spare copy of the worn helm in the bank is not listed again');
  assert.ok(grid.children[0].classList.contains('btn-outline-success'), 'the worn item is marked');
  assert.ok(grid.children[2].classList.contains('quick-equip-all-locked'), 'items you cannot wear yet are dimmed');
  assert.strictEqual(tooltip.unequipButton.onclick(), slot, 'unequip still works');

  const clicked = grid.children[1];
  clicked.onclick();
  assert.deepStrictEqual(equipCalls, [[helm, 0, slot, 1]]);
  assert.strictEqual(grid.children[1], clicked, 'the clicked button stays on the page until the click is done, or the top bar menu closes');
  await new Promise((resolve) => setTimeout(resolve));
  assert.notStrictEqual(grid.children[1], clicked, 'then the menu redraws');
  grid.children[0].onclick();
  assert.strictEqual(equipCalls.length, 1, 'clicking the worn item does nothing');
});

test('stackable slots equip the whole stack and show its size, and an empty slot says so', async () => {
  const { patches } = await boot();
  const arrows = equipment('Rune arrows', ['melvorD:Quiver']);
  const equipCalls = [];
  const slot = { id: 'melvorD:Quiver', allowQuantity: true };
  const equipped = { slot, isEmpty: true };
  const player = { selectedEquipmentSet: 1, equipment: { equippedItems: { 'melvorD:Quiver': equipped }, getSlotOfItem: () => undefined }, unequipCallback: () => () => {}, equipItem: (...args) => equipCalls.push(args) };
  globalThis.game = { combat: { player }, bank: { itemsByTab: [[{ item: arrows, quantity: 1500 }]] }, checkRequirements: () => true };
  const tooltip = tooltipFor();
  patches['QuickEquipTooltipElement.setEquipped'].call(tooltip, () => {}, player, equipped);
  const [button] = tooltip.quickEquipAllGrid.children;
  assert.strictEqual(button.children[1].textContent, '1,500');
  button.onclick();
  assert.deepStrictEqual(equipCalls, [[arrows, 1, slot, 1500]]);

  globalThis.game.bank.itemsByTab = [[]];
  patches['QuickEquipTooltipElement.setEquipped'].call(tooltip, () => {}, player, equipped);
  assert.match(tooltip.quickEquipAllGrid.children[0].textContent, /Nothing in your bank/);
});

test('other players, like the Golbin Raid one, keep Melvor\'s own menu', async () => {
  const { patches } = await boot();
  globalThis.game = { combat: { player: {} } };
  let original = false;
  patches['QuickEquipTooltipElement.setEquipped'].call(tooltipFor(), () => (original = true), { raid: true }, {});
  assert.ok(original);
});

test('a worn stack shows once, and clicking it tops it up from the bank like Melvor\'s own quick equip', async () => {
  const { patches } = await boot();
  const arrows = equipment('Rune arrows', ['melvorD:Quiver']);
  const equipCalls = [];
  const slot = { id: 'melvorD:Quiver', allowQuantity: true };
  const equipped = { slot, isEmpty: false, item: arrows, quantity: 1500 };
  const player = { selectedEquipmentSet: 0, equipment: { equippedItems: { 'melvorD:Quiver': equipped }, getSlotOfItem: (item) => (item === arrows ? slot : undefined) }, unequipCallback: () => () => {}, equipItem: (...args) => equipCalls.push(args) };
  globalThis.game = { combat: { player }, bank: { itemsByTab: [[{ item: arrows, quantity: 300 }]], getQty: () => 300 }, checkRequirements: () => true };
  const tooltip = tooltipFor();
  patches['QuickEquipTooltipElement.setEquipped'].call(tooltip, () => {}, player, equipped);
  const buttons = tooltip.quickEquipAllGrid.children;
  assert.strictEqual(buttons.length, 1);
  assert.strictEqual(buttons[0].children[1].textContent, '1,500');
  buttons[0].onclick();
  assert.deepStrictEqual(equipCalls, [[arrows, 0, slot, 300]]);
});
