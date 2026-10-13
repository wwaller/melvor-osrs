import assert from 'node:assert';
import { test } from 'node:test';

function element(tag) {
  const classes = new Set();
  const node = {
    tagName: tag.toUpperCase(),
    children: [],
    attributes: {},
    parent: null,
    set className(value) { classes.clear(); value.split(/\s+/).filter(Boolean).forEach((name) => classes.add(name)); },
    get className() { return [...classes].join(' '); },
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      contains: (name) => classes.has(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    },
    setAttribute(name, value) { node.attributes[name] = value; },
    append(...nodes) { nodes.forEach((child) => { if (child.parent) child.parent.children = child.parent.children.filter((c) => c !== child); child.parent = node; node.children.push(child); }); },
    replaceChildren(...nodes) { node.children = []; node.append(...nodes); },
    insertBefore(child, before) {
      if (child.parent) child.parent.children = child.parent.children.filter((c) => c !== child);
      child.parent = node;
      node.children.splice(node.children.indexOf(before), 0, child);
    },
    get lastElementChild() { return node.children[node.children.length - 1]; },
  };
  return node;
}

function item(id, classes = '') {
  const rootEl = element('li');
  rootEl.className = classes;
  return { id, rootEl };
}

function world() {
  const skill = (id, name, action) => ({ id, name, media: `${name}.png`, action });
  const actions = { combat: { isActive: false }, woodcutting: { isActive: true }, altMagic: { isActive: false }, farming: { isActive: false }, harvesting: { isActive: false } };
  const pages = {
    'melvorD:Combat': { id: 'melvorD:Combat', name: 'Combat', media: 'combat.png', action: actions.combat },
    'melvorD:Woodcutting': { id: 'melvorD:Woodcutting', name: 'Woodcutting', action: actions.woodcutting },
    'melvorD:AltMagic': { id: 'melvorD:AltMagic', name: 'Alt. Magic', action: actions.altMagic },
    'melvorD:Farming': { id: 'melvorD:Farming', name: 'Farming', action: actions.farming, skillSidebarCategoryID: 'Passive' },
    'melvorItA:Harvesting': { id: 'melvorItA:Harvesting', name: 'Harvesting', action: actions.harvesting },
    'melvorD:Bank': { id: 'melvorD:Bank', name: 'Bank', media: 'bank.png' },
    'melvorD:Shop': { id: 'melvorD:Shop', name: 'Shop', media: 'shop.png' },
  };
  const skills = {
    'melvorD:Attack': skill('melvorD:Attack', 'Attack'),
    'melvorD:Magic': skill('melvorD:Magic', 'Magic'),
    'melvorD:Woodcutting': skill('melvorD:Woodcutting', 'Woodcutting'),
    'melvorD:Farming': skill('melvorD:Farming', 'Farming'),
    'melvorItA:Harvesting': skill('melvorItA:Harvesting', 'Harvesting'),
  };
  const pagesFor = {
    'melvorD:Attack': [pages['melvorD:Combat']],
    'melvorD:Magic': [pages['melvorD:Combat'], pages['melvorD:AltMagic']],
    'melvorD:Woodcutting': [pages['melvorD:Woodcutting']],
    'melvorD:Farming': [pages['melvorD:Farming']],
    'melvorItA:Harvesting': [pages['melvorItA:Harvesting']],
  };
  const categories = {
    Combat: [item('melvorD:Combat'), item('melvorD:Attack'), item('melvorD:Magic')],
    Passive: [item('melvorD:Farming')],
    'Non-Combat': [item('melvorD:Woodcutting'), item('melvorD:Magic'), item('melvorItA:Harvesting', 'opacity-50'), item('melvorD:Hidden', 'd-none')],
  };
  const sidebarAPI = { category: (id) => ({ items: () => categories[id] }) };
  const gameAPI = {
    pages: { getObjectByID: (id) => pages[id] },
    skills: { getObjectByID: (id) => skills[id] },
    getPagesForSkill: (s) => pagesFor[s.id],
  };
  return { sidebarAPI, gameAPI, pages, actions };
}

test('the flyout lists Combat once, then the passive and non-combat skills in sidebar order, keeping what the sidebar dims', async () => {
  const { skillEntries } = await import(`../mod/setup.mjs?${Math.random()}`);
  const { sidebarAPI, gameAPI } = world();
  const entries = skillEntries(sidebarAPI, gameAPI);
  assert.deepStrictEqual(entries.map((e) => e.name), ['Combat', 'Farming', 'Woodcutting', 'Alt. Magic', 'Harvesting']);
  assert.strictEqual(entries[3].page.id, 'melvorD:AltMagic', 'Magic under Non-Combat opens Alt. Magic, not Combat');
  assert.deepStrictEqual(entries.map((e) => e.dimmed), [false, false, false, false, true], 'other-realm skills stay dimmed; hidden ones are left out');
});

async function boot(values = {}) {
  const { sidebarAPI, gameAPI, pages, actions } = world();
  const body = element('body');
  const minibarContainer = element('div');
  minibarContainer.append(element('div'), element('button'));
  const pageChanges = [];
  const patches = {};
  let ready;
  let tip;
  globalThis.sidebar = sidebarAPI;
  globalThis.game = { ...gameAPI, openPage: pages['melvorD:Woodcutting'] };
  globalThis.document = { body, createElement: element, getElementById: (id) => (id === 'skill-footer-minibar-container' ? minibarContainer : null) };
  globalThis.changePage = (...args) => pageChanges.push(args);
  globalThis.tippy = (target, options) => (tip = { target, options, hidden: false, hide() { this.hidden = true; }, setContent(content) { this.content = content; } });
  globalThis.Minibar = class Minibar { setSkill() {} };
  globalThis.Game = class Game { renderActiveSkills() {} };
  const ctx = {
    loadStylesheet: (path) => (ctx.stylesheet = path),
    settings: { section: () => ({ add: (config) => (ctx.setting = config), get: (name) => values[name] ?? ctx.setting?.default }) },
    patch: (target, method) => ({ after: (fn) => (patches[`${target.name}.${method}`] = fn), replace: (fn) => (patches[`${target.name}.${method}`] = fn) }),
    onInterfaceReady: (fn) => (ready = fn),
  };
  const { setup } = await import(`../mod/setup.mjs?${Math.random()}`);
  setup(ctx);
  ready();
  return { ctx, patches, body, minibarContainer, pageChanges, pages, actions, tip: () => tip };
}

test('on skill pages the button sits just above the minibar arrow; elsewhere it floats in the same corner', async () => {
  const { ctx, patches, body, minibarContainer } = await boot();
  assert.strictEqual(ctx.stylesheet, 'style.css');
  const floating = body.children[0];
  const button = minibarContainer.children[1];
  assert.ok(button.classList.contains('skill-switcher-button'));
  assert.strictEqual(minibarContainer.lastElementChild.tagName, 'BUTTON', 'the arrow stays last');
  assert.ok(floating.classList.contains('d-none'));

  minibarContainer.classList.add('d-none');
  patches['Minibar.setSkill']();
  assert.strictEqual(floating.children[0], button);
  assert.ok(!floating.classList.contains('d-none'));
});

test('the button shows the active skill, and the flyout puts active skills in a row under the grid and switches pages without opening the sidebar', async () => {
  const { patches, minibarContainer, pageChanges, pages, actions, tip } = await boot();
  const button = minibarContainer.children[1];
  assert.strictEqual(button.children[0].children[0].src, 'Woodcutting.png');

  tip().options.onShow(tip());
  const [grid, activeRow] = tip().content.children;
  assert.deepStrictEqual(activeRow.children.map((t) => t.title), ['Woodcutting']);
  assert.ok(!grid.children.some((t) => t.title === 'Woodcutting'), 'active skills only show in their own row');
  assert.deepStrictEqual(grid.children.map((t) => t.title), ['Combat', 'Farming', 'Alt. Magic', 'Harvesting'], 'sidebar order; the stylesheet lays it out from the bottom right');
  const woodcutting = activeRow.children[0];
  assert.ok(woodcutting.classList.contains('skill-switcher-active') && woodcutting.classList.contains('skill-switcher-current'));
  assert.ok(grid.children.find((t) => t.title === 'Harvesting').classList.contains('skill-switcher-dimmed'));

  grid.children.find((t) => t.title === 'Alt. Magic').onclick();
  assert.deepStrictEqual(pageChanges, [[pages['melvorD:AltMagic'], -1, globalThis.game.skills.getObjectByID('melvorD:Magic'), false, false]]);
  assert.ok(tip().hidden);

  actions.woodcutting.isActive = false;
  const fakeGame = { renderQueue: { activeSkills: true } };
  patches['Game.renderActiveSkills'].call(fakeGame, () => {});
  assert.ok(button.children[0].children[0].className.includes('fa-th-large'), 'nothing active shows the grid icon');
});

test('with the option on, Bank and Shop join the bottom row to the left of the active skills', async () => {
  const off = await boot();
  off.tip().options.onShow(off.tip());
  assert.deepStrictEqual(off.tip().content.children[1].children.map((t) => t.title), ['Woodcutting'], 'off by default');

  const { tip, pageChanges, pages } = await boot({ 'bank-and-shop': true });
  tip().options.onShow(tip());
  const bottom = tip().content.children[1];
  assert.deepStrictEqual(bottom.children.map((t) => t.title), ['Woodcutting', 'Bank', 'Shop'], 'active skills first, so they sit nearest the button');
  assert.ok(!bottom.children[1].classList.contains('skill-switcher-active'));
  bottom.children[1].onclick();
  assert.deepStrictEqual(pageChanges, [[pages['melvorD:Bank'], -1, undefined, false, false]]);
});
