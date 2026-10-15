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
    before(other) { node.parent.insertBefore(other, node); },
    get lastElementChild() { return node.children[node.children.length - 1]; },
    find: (name) => node.children.find((child) => child.classList.contains(name)),
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

async function boot(values = {}, { interfaceReady = true, desktop = false, sidebarOpen = false } = {}) {
  const { sidebarAPI, gameAPI, pages, actions } = world();
  const body = element('body');
  const minibarContainer = element('div');
  minibarContainer.append(element('div'), element('button'));
  const pageChanges = [];
  const patches = {};
  let ready;
  let tip;
  const layouts = [];
  globalThis.One = { layout: (action) => layouts.push(action) };
  const scrolls = [];
  globalThis.window = { matchMedia: (query) => ({ matches: query === '(min-width: 992px)' && desktop }), scrollTo: (options) => scrolls.push(options) };
  const pageContainer = element('div');
  if (sidebarOpen) pageContainer.classList.add('sidebar-o-xs');
  globalThis.sidebar = sidebarAPI;
  globalThis.game = { ...gameAPI, openPage: pages['melvorD:Woodcutting'] };
  globalThis.document = { body, createElement: element, getElementById: (id) => ({ 'skill-footer-minibar-container': minibarContainer, 'page-container': sidebarOpen ? pageContainer : null })[id] ?? null };
  globalThis.changePage = (...args) => pageChanges.push(args);
  globalThis.tippy = (target, options) => (tip = { target, options, hidden: false, hide() { this.hidden = true; }, setContent(content) { this.content = content; } });
  globalThis.Minibar = class Minibar { setSkill() {} };
  globalThis.Game = class Game { renderActiveSkills() {} };
  const ctx = {
    loadStylesheet: (path) => (ctx.stylesheet = path),
    configs: {},
    settings: { section: () => ({ add: (config) => [config].flat().forEach((each) => (ctx.configs[each.name] = each)), get: (name) => values[name] ?? ctx.configs[name]?.default }) },
    patch: (target, method) => ({ after: (fn) => (patches[`${target.name}.${method}`] = fn), replace: (fn) => (patches[`${target.name}.${method}`] = fn) }),
    onInterfaceReady: (fn) => (ready = fn),
  };
  const { setup } = await import(`../mod/setup.mjs?${Math.random()}`);
  setup(ctx);
  if (interfaceReady) ready();
  return { ctx, ready, patches, body, minibarContainer, pageChanges, pages, actions, layouts, scrolls, tip: () => tip };
}

test('on skill pages the button sits just above the minibar arrow; elsewhere it floats in the same corner', async () => {
  const { ctx, patches, body, minibarContainer } = await boot();
  assert.strictEqual(ctx.stylesheet, 'style.css');
  const floating = body.children[0];
  const button = minibarContainer.find('skill-switcher-button');
  assert.ok(button);
  assert.strictEqual(minibarContainer.lastElementChild.tagName, 'BUTTON', 'the arrow stays last');
  assert.ok(floating.classList.contains('d-none'));

  minibarContainer.classList.add('d-none');
  patches['Minibar.setSkill']();
  assert.strictEqual(floating.find('skill-switcher-button'), button);
  assert.ok(!floating.classList.contains('d-none'));
});

test('the button shows the active skill, and the flyout puts active skills in a row under the grid and switches pages without opening the sidebar', async () => {
  const { patches, minibarContainer, pageChanges, pages, actions, tip } = await boot();
  const button = minibarContainer.find('skill-switcher-button');
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

const melvorAccepts = (result) => typeof result !== 'string' && (result === undefined || Boolean(result));

test('the menu button is off by default and waits just above the switcher', async () => {
  const { ctx, minibarContainer } = await boot();
  assert.strictEqual(ctx.configs['menu-button'].default, false);
  const [, top, menu, button, arrow] = minibarContainer.children;
  assert.ok(top.classList.contains('skill-switcher-top') && menu.classList.contains('skill-switcher-menu') && button.classList.contains('skill-switcher-button'), 'Jump to Top, then menu, then switcher');
  assert.strictEqual(arrow, minibarContainer.lastElementChild, 'the arrow stays last');
  assert.ok(menu.classList.contains('d-none'));
  assert.strictEqual(menu.children[0].className, 'fas fa-bars text-white');
});

test('the menu switch turns the button on and off, and Melvor keeps each change', async () => {
  const { ctx, minibarContainer } = await boot();
  const menu = minibarContainer.find('skill-switcher-menu');
  const { onChange } = ctx.configs['menu-button'];
  assert.ok(melvorAccepts(onChange(true, false)), 'Melvor would flip the switch back on a false or string return');
  assert.ok(!menu.classList.contains('d-none'));
  assert.ok(melvorAccepts(onChange(false, true)));
  assert.ok(menu.classList.contains('d-none'));
  assert.ok(melvorAccepts(onChange(true, false)));
  assert.ok(!menu.classList.contains('d-none'));
});

test('a switch saved as on shows the button at startup, since Melvor restores it without calling onChange', async () => {
  const { minibarContainer } = await boot({ 'menu-button': true });
  assert.ok(!minibarContainer.find('skill-switcher-menu').classList.contains('d-none'));
});

test('flipping the switch before the interface is up is accepted and still applies once it is', async () => {
  const values = {};
  const { ctx, ready, minibarContainer } = await boot(values, { interfaceReady: false });
  assert.ok(melvorAccepts(ctx.configs['menu-button'].onChange(true, false)));
  values['menu-button'] = true;
  ready();
  assert.ok(!minibarContainer.find('skill-switcher-menu').classList.contains('d-none'));
});

test('pressing the menu button toggles the sidebar the way the top-left button does', async () => {
  const { minibarContainer, layouts } = await boot({ 'menu-button': true });
  minibarContainer.find('skill-switcher-menu').onclick();
  assert.deepStrictEqual(layouts, ['sidebar_toggle']);
  minibarContainer.find('skill-switcher-menu').onclick();
  assert.deepStrictEqual(layouts, ['sidebar_toggle', 'sidebar_toggle']);
});

test('off the skill pages the menu button floats with the switcher, still above it, and comes back with it', async () => {
  const { patches, body, minibarContainer } = await boot({ 'menu-button': true });
  const floating = body.children[0];
  minibarContainer.classList.add('d-none');
  patches['Minibar.setSkill']();
  assert.deepStrictEqual(floating.children.map((child) => child.className.split(' ').pop()), ['skill-switcher-top', 'skill-switcher-menu', 'skill-switcher-button']);
  assert.strictEqual(minibarContainer.children.length, 2);
  minibarContainer.classList.toggle('d-none', false);
  patches['Minibar.setSkill']();
  assert.deepStrictEqual(minibarContainer.children.slice(1, 4).map((child) => child.className.split(' ').pop()), ['skill-switcher-top', 'skill-switcher-menu', 'skill-switcher-button']);
  assert.strictEqual(minibarContainer.children.length, 5);
  assert.strictEqual(floating.children.length, 0);
});

test('the over-the-sidebar switch is off by default, and Melvor keeps each change', async () => {
  const { ctx, body } = await boot();
  const config = ctx.configs['above-sidebar'];
  assert.strictEqual(config.default, false);
  assert.ok(!body.classList.contains('skill-switcher-above-sidebar'));
  assert.ok(melvorAccepts(config.onChange(true, false)));
  assert.ok(body.classList.contains('skill-switcher-above-sidebar'));
  assert.ok(melvorAccepts(config.onChange(false, true)));
  assert.ok(!body.classList.contains('skill-switcher-above-sidebar'));
  assert.ok(melvorAccepts(config.onChange(true, false)));
  assert.ok(body.classList.contains('skill-switcher-above-sidebar'));
});

test('a saved over-the-sidebar switch applies at startup, since Melvor restores it without calling onChange', async () => {
  const { body } = await boot({ 'above-sidebar': true });
  assert.ok(body.classList.contains('skill-switcher-above-sidebar'));
});

test('picking a skill with the phone sidebar open closes the sidebar; otherwise the sidebar is left alone', async () => {
  for (const [options, expected] of [[{ sidebarOpen: true }, ['sidebar_close']], [{}, []], [{ sidebarOpen: true, desktop: true }, []]]) {
    const { tip, layouts, pageChanges } = await boot({}, options);
    tip().options.onShow(tip());
    tip().content.children[0].children[0].onclick();
    assert.strictEqual(pageChanges.length, 1);
    assert.deepStrictEqual(layouts, expected, JSON.stringify(options));
  }
});

test('the Jump to Top button is on by default, an up arrow just above the menu button', async () => {
  const { ctx, minibarContainer } = await boot();
  assert.strictEqual(ctx.configs['top-button'].default, true);
  const top = minibarContainer.find('skill-switcher-top');
  assert.strictEqual(top.nextElementSibling ?? minibarContainer.children[minibarContainer.children.indexOf(top) + 1], minibarContainer.find('skill-switcher-menu'));
  assert.ok(!top.classList.contains('d-none'));
  assert.strictEqual(top.children[0].className, 'fas fa-arrow-up text-white');
});

test('pressing Jump to Top scrolls smoothly back to the top of the page', async () => {
  const { minibarContainer, scrolls } = await boot();
  minibarContainer.find('skill-switcher-top').onclick();
  assert.deepStrictEqual(scrolls, [{ top: 0, behavior: 'smooth' }]);
});

test('the Jump to Top switch turns the button off and on, and Melvor keeps each change', async () => {
  const { ctx, minibarContainer } = await boot();
  const top = minibarContainer.find('skill-switcher-top');
  const { onChange } = ctx.configs['top-button'];
  assert.ok(melvorAccepts(onChange(false, true)));
  assert.ok(top.classList.contains('d-none'));
  assert.ok(melvorAccepts(onChange(true, false)));
  assert.ok(!top.classList.contains('d-none'));
});

test('a Jump to Top switch saved as off keeps the button hidden at startup', async () => {
  const { minibarContainer } = await boot({ 'top-button': false });
  assert.ok(minibarContainer.find('skill-switcher-top').classList.contains('d-none'));
});
