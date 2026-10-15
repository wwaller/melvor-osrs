import assert from 'node:assert';
import { test } from 'node:test';

const settle = () => new Promise((r) => setTimeout(r, 0));

function element(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: '',
    attributes: {},
    style: {},
    children: [],
    input: { checked: false },
    classList: { names: new Set(), toggle(name, on = !this.names.has(name)) { if (on) this.names.add(name); else this.names.delete(name); return on; }, contains(name) { return this.names.has(name); } },
    append(child) { this.children.push(child); },
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }),
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    initialize(data, onChange) { this.input.checked = data.currentValue; this.label = data.name; this.onChange = onChange; },
    setChecked(on) { this.input.checked = on; },
    after(node) { this.next = node; },
    addEventListener() {},
  };
}

async function boot(values = {}) {
  const classes = new Set();
  const properties = {};
  const darkMode = element('settings-switch');
  darkMode.className = 'mb-2';
  darkMode.setAttribute('data-size', 'large');
  const settings = { enabled: true, ...values };
  const configs = {};
  const sectionOf = {};
  const patches = {};
  const hooks = {};
  const sectionOrder = [];
  globalThis.BankItemIconElement = class BankItemIconElement { updateQuantity() {} };
  globalThis.Bank = class Bank { sellItemOnClick() {} };
  globalThis.BankSelectedItemMenuElement = class BankSelectedItemMenuElement { setItemLocked() {} updateItemQuantity() {} };
  globalThis.OfflineProgressElement = class OfflineProgressElement { setMessages() {} };
  globalThis.SplashManager = class SplashManager { renderSplash() {} };
  globalThis.Settings = class Settings { changeChoiceSetting() {} };
  globalThis.saveData = () => {};
  globalThis.RealmManager = class RealmManager { onRealmRequirementMet() {} };
  const stored = new Map();
  globalThis.document = {
    body: { tagName: 'BODY', children: [], style: { setProperty: (name, value) => (properties[`body ${name}`] = value) }, prepend(child) { this.children.unshift(child); child.isConnected = true; child.remove = () => { this.children = this.children.filter((c) => c !== child); child.isConnected = false; }; }, querySelectorAll: () => globalThis.pageElements || [], getBoundingClientRect: () => ({ width: 1000, height: 800 }), setAttribute(name, value) { this[name] = value; }, classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) } },
    fonts: { add: (face) => fonts.push(face) },
    documentElement: { style: { setProperty: (name, value) => (properties[name] = value) } },
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: (selector) => (selector === '[data-setting-id="darkMode"]' ? darkMode : null),
    createElement: element,
    addEventListener: (type, fn) => (documentListeners[type] = fn),
  };
  const documentListeners = {};
  delete globalThis.game;
  globalThis.window = { innerWidth: 1000, innerHeight: 800, frames: 0, requestAnimationFrame() { this.frames++; return 1; }, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {}, getComputedStyle: () => ({ backgroundImage: 'none', getPropertyValue: () => '' }) };
  globalThis.MutationObserver = class { observe() {} };
  globalThis.FontFace = class { constructor(family, source) { Object.assign(this, { family, source }); } load() { return Promise.resolve(this); } };
  const fonts = [];
  const ctx = {
    loadStylesheet: (path) => (ctx.stylesheet = path),
    getResourceUrl: (path) => `blob:${path}`,
    loadData: async (path) => (path === 'img/backgrounds.json' ? [{ key: 'varlamore', label: 'Varlamore' }, { key: 'nex', label: 'Nex' }] : null),
    characterStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) },
    loadModule: (path) => import(`../mod/${path}`),
    patch: (target, method) => ({ after: (fn) => (patches[`${target.name}.${method}`] = fn), replace: (fn) => (patches[`${target.name}.${method}`] = fn) }),
    settings: { section: (sectionName) => (sectionOrder.includes(sectionName) || sectionOrder.push(sectionName), { add: (list) => list.forEach((c) => { configs[c.name] = c; sectionOf[c.name] = sectionName; }), get: (key) => settings[key] ?? configs[key]?.default, set: (key, value) => (settings[key] = value) }) },
    onCharacterLoaded: (fn) => (hooks.character = fn),
    onCharacterSelectionLoaded: (fn) => (hooks.select = fn),
    onInterfaceReady: (fn) => (hooks.ready = fn),
  };
  const module = await import(`../mod/setup.mjs?${Math.random()}`);
  await module.setup(ctx);
  return { ctx, module, classes, properties, darkMode, settings, configs, patches, hooks, fonts, stored, documentListeners, sectionOf, sectionOrder };
}

test('loads the theme, points the CSS at the bundled images, and turns every feature on by default', async () => {
  const { ctx, classes, properties } = await boot();
  assert.strictEqual(ctx.stylesheet, 'theme.css');
  assert.strictEqual(properties['--osrs-hitsplat-zero'], 'url("blob:img/hitsplat-zero.png")');
  for (const name of ['osrs-theme', 'osrs-shadows', 'osrs-bevels', 'osrs-tooltips', 'osrs-hp-bars', 'osrs-texture', 'osrs-stacks', 'osrs-hitsplats', 'osrs-login', 'osrs-font', 'osrs-font-all', 'osrs-sidebar', 'osrs-buttons', 'osrs-character-select']) {
    assert.ok(classes.has(name), name);
  }
});

test('each feature has its own switch, and the main switch turns them all off', async () => {
  const { classes, configs, settings } = await boot();
  settings.bevels = false;
  configs.bevels.onChange();
  await settle();
  assert.ok(!classes.has('osrs-bevels'));
  assert.ok(classes.has('osrs-shadows'));
  settings.enabled = false;
  configs.enabled.onChange(false);
  await settle();
  assert.ok(!classes.has('osrs-theme') && !classes.has('osrs-shadows'));
});

test('adds an OSRS Theme switch right after Dark Mode', async () => {
  const { classes, darkMode, settings, hooks } = await boot();
  hooks.ready();
  const added = darkMode.next;
  assert.strictEqual(added.label, 'OSRS Theme');
  assert.strictEqual(added.getAttribute('data-size'), 'large');
  added.input.checked = false;
  added.onChange();
  assert.strictEqual(settings.enabled, false);
  assert.ok(!classes.has('osrs-theme'));
});

test('the login background only shows until a character is loaded', async () => {
  const { classes, hooks } = await boot();
  assert.ok(classes.has('osrs-character-select'));
  hooks.character();
  assert.ok(!classes.has('osrs-character-select'));
});

test('bank stacks follow the OSRS rules', async () => {
  const { module, patches } = await boot();
  assert.deepStrictEqual(module.osrsStack(65535), ['65535', 'yellow']);
  assert.deepStrictEqual(module.osrsStack(100000), ['100K', 'white']);
  assert.deepStrictEqual(module.osrsStack(9999999), ['9999K', 'white']);
  assert.deepStrictEqual(module.osrsStack(10000000), ['10M', 'green']);
  const icon = bankIcon();
  patches['BankItemIconElement.updateQuantity'].call(icon, melvorUpdate.bind(icon), { quantity: 2500000, item: { name: 'Coal Ore' } }, false);
  assert.strictEqual(icon.quantity.textContent, '2500K');
  assert.strictEqual(icon.quantity.dataset.osrsStack, 'white');
  icon.onmouseleave();
  assert.strictEqual(icon.quantity.textContent, '2500K', 'hovering off restores the OSRS format');
});

test('hitsplats show OSRS numbers: no minus sign, and a miss is a blue 0', async () => {
  const { patches } = await boot();
  globalThis.formatNumber = (n) => n.toLocaleString('en-US');
  globalThis.getLangString = (key) => ({ COMBAT_MISC_MISS: 'Miss', COMBAT_MISC_IMMUNE: 'Immune' })[key];
  const render = (splash) => {
    const element = { textContent: splash.text ?? String(splash.amount), classes: [], classList: { add: (name) => element.classes.push(name) }, offsetWidth: 48, style: {} };
    patches['SplashManager.renderSplash'].call({ container: { id: 'combat-enemy-splash-container', lastElementChild: element } }, () => {}, splash);
    return element;
  };
  const hit = render({ amount: -1015, xOffset: 100 });
  assert.strictEqual(hit.textContent, '1,015');
  assert.strictEqual(hit.style.left, 'clamp(0px, calc(100% - 24px), calc(100% - 48px))', 'a hitsplat at full hitpoints stays inside the bar');
  assert.deepStrictEqual(hit.classes, []);
  const barrierless = render({ amount: -0, xOffset: NaN });
  assert.strictEqual(barrierless.style.left, 'clamp(0px, calc(100% - 24px), calc(100% - 48px))', 'a barrier splash with no barrier (0 / 0) still lands inside the bar');
  const blocked = render({ amount: -0 });
  assert.strictEqual(blocked.textContent, '0');
  assert.deepStrictEqual(blocked.classes, ['osrs-zero']);
  const miss = render({ amount: 0, text: 'Miss' });
  assert.strictEqual(miss.textContent, '0');
  assert.deepStrictEqual(miss.classes, ['osrs-zero']);
  const overheal = render({ source: 'Overheal', amount: 12 });
  assert.deepStrictEqual(overheal.classes, ['osrs-heal'], 'a heal from a source another mod added still shows as a heal');
  const immune = render({ amount: 0, text: 'Immune' });
  assert.strictEqual(immune.textContent, 'Immune');
  assert.deepStrictEqual(immune.classes, ['osrs-text']);
  const counter = { textContent: '-3', classes: [], classList: { add: (name) => counter.classes.push(name) } };
  patches['SplashManager.renderSplash'].call({ container: { id: '', lastElementChild: counter } }, () => {}, { amount: -3 });
  assert.strictEqual(counter.textContent, '-3', 'notification counts are not hitsplats and keep their sign');
});

test('no hitsplat backlog: nothing queues during offline progress or while combat is off screen', async () => {
  const { patches } = await boot();
  const added = [];
  globalThis.game = { _isInOnlineLoop: false };
  const combat = { container: { id: 'combat-player-splash-container' } };
  patches['SplashManager.add'].call(combat, (splash) => added.push(splash), { amount: -5 });
  assert.strictEqual(added.length, 0, 'dropped during offline progress');
  patches['SplashManager.add'].call({ container: { id: '' } }, (splash) => added.push(splash), { amount: 3 });
  assert.strictEqual(added.length, 1, 'notification counts are left to Melvor');
  game._isInOnlineLoop = true;
  patches['SplashManager.add'].call(combat, (splash) => added.push(splash), { amount: -5 });
  assert.strictEqual(added.length, 2, 'kept while playing');
  let rendered = 0;
  const hidden = { container: { id: 'combat-enemy-splash-container', offsetParent: null }, queue: [{}, {}, {}] };
  patches['SplashManager.render'].call(hidden, () => rendered++);
  assert.strictEqual(rendered, 0);
  assert.deepStrictEqual(hidden.queue, [], 'stale splats thrown away');
  const visible = { container: { id: 'combat-enemy-splash-container', offsetParent: {} }, queue: [{}] };
  patches['SplashManager.render'].call(visible, () => rendered++);
  assert.strictEqual(rendered, 1);
});

test('on character select, every full-screen layer Melvor paints its art on gets the OSRS login art', async () => {
  const { hooks } = await boot();
  const element = (tag, size, layers, color = 'rgba(0, 0, 0, 0)') => ({ tagName: tag, layers, color, style: { setProperty() {} }, getClientRects: () => [], getBoundingClientRect: () => size, setAttribute(name, value) { this[name] = value; }, removeAttribute(name) { delete this[name]; } });
  const full = { width: 1000, height: 800 };
  const art = element('DIV', full, { self: 'url("abyss.jpg")' });
  const panel = element('DIV', { width: 300, height: 200 }, { self: 'url("panel.png")' });
  const plain = element('DIV', full, {});
  const picture = element('IMG', full, {});
  const fullPanel = element('DIV', full, {}, 'rgb(44, 52, 63)');
  const popup = Object.assign(element('DIV', full, {}, 'rgb(71, 62, 51)'), { closest: (selector) => selector.includes('.swal2-container') });
  const modal = Object.assign(element('DIV', full, {}, 'rgb(20, 17, 14)'), { closest: (selector) => selector.includes('[aria-modal="true"]') });
  globalThis.pageElements = [art, panel, plain, picture, fullPanel, popup, modal];
  document.body.layers = { before: 'url("bg_3.jpg")' };
  window.getComputedStyle = (el, pseudo) => ({ backgroundImage: el.layers[pseudo ? pseudo.slice(2) : 'self'] || 'none', backgroundColor: el.color || 'rgba(0, 0, 0, 0)', getPropertyValue: () => '' });
  hooks.select();
  await settle();
  assert.strictEqual(document.body['data-osrs-login'], 'before');
  assert.strictEqual(art['data-osrs-login'], 'self');
  assert.strictEqual(picture['data-osrs-login'], 'self');
  assert.strictEqual(panel['data-osrs-login'], undefined, 'small panels keep their art');
  assert.strictEqual(plain['data-osrs-login'], undefined, 'elements without a background are left alone');
  assert.strictEqual(fullPanel['data-osrs-login'], 'fill', 'a full-screen solid panel turns see-through');
  assert.strictEqual(popup['data-osrs-login'], undefined, 'a popup that fills a phone screen keeps its background');
  assert.strictEqual(modal['data-osrs-login'], undefined, 'so does another mod\'s full-screen modal, like Idle Guard\'s lock screen');
  delete globalThis.pageElements;
});

test('character select shows the OSRS login scene with two animated braziers, gone once a character loads', async () => {
  const { hooks } = await boot();
  const scene = document.body.children.find((child) => child.id === 'osrs-login-scene');
  assert.ok(scene, 'scene added behind the page');
  assert.strictEqual(scene.children.length, 2, 'one fire per brazier');
  assert.ok(window.frames > 0, 'animating');
  hooks.character();
  assert.ok(!document.body.children.includes(scene));
});

test('loads the three OSRS fonts from the mod', async () => {
  const { fonts } = await boot();
  await settle();
  assert.deepStrictEqual(fonts.map((face) => face.family).sort(), ['OSRS Bold 12', 'OSRS Plain 11', 'OSRS Plain 12']);
  assert.match(fonts[0].source, /url\("blob:fonts\/RuneScape-/);
});

test('the attack interval bar matches the HP bar\'s thickness and lines up with it, even when they share a panel', async () => {
  globalThis.Node = { DOCUMENT_POSITION_FOLLOWING: 4 };
  const bar = (box) => ({ style: {}, box, contains: () => false, querySelector: () => null, compareDocumentPosition: () => 4, getBoundingClientRect() { return { ...this.box, height: this.style.height ? 15 : this.box.height }; } });
  const health = bar({ top: 49, height: 15, left: 25, right: 300 });
  const barrier = bar({ top: 70, height: 6, left: 25, right: 300 });
  barrier.querySelector = () => ({ id: 'combat-enemy-barrier-bar' });
  const timer = bar({ top: 45, height: 10, left: 316, right: 592 });
  const panel = { parentElement: null, querySelectorAll: () => [health, barrier, timer] };
  const label = { parentElement: panel };
  const ids = { 'combat-enemy-hitpoints-bar': { parentElement: health }, 'combat-enemy-attack-speed': label };
  const { hooks } = await boot();
  document.getElementById = (id) => ids[id] || null;
  hooks.ready();
  assert.strictEqual(timer.style.height, '15px');
  assert.strictEqual(timer.style.marginTop, '4px');
  assert.strictEqual(health.style.height, undefined, 'the HP bar is left alone');
});

test('OSRS backgrounds join Melvor\'s background setting, are kept per character, and never reach Melvor\'s own saved value', async () => {
  const { classes, properties, patches, hooks, stored } = await boot();
  const options = [{ value: 0 }, { value: 2 }];
  globalThis.game = { settings: { choiceData: { backgroundImage: { options } } } };
  hooks.select();
  hooks.select();
  assert.deepStrictEqual(options.map((option) => option.value), [0, 2, 'osrs:varlamore', 'osrs:nex'], 'added once, after Melvor\'s own');
  assert.match(options[2].name, /blob:img\/backgrounds\/varlamore-thumb\.jpg/);

  const melvor = [];
  const change = (setting, value) => patches['Settings.changeChoiceSetting'].call({}, (...args) => melvor.push(args), setting, value);
  change('backgroundImage', 'osrs:nex');
  assert.deepStrictEqual(melvor, [], 'Melvor never sees an OSRS value');
  assert.strictEqual(stored.get('background'), 'nex');
  assert.ok(classes.has('osrs-background'));
  assert.strictEqual(properties['body --osrs-background'], 'url("blob:img/backgrounds/nex.jpg")');

  classes.delete('osrs-background');
  hooks.character();
  assert.ok(classes.has('osrs-background'), 'the pick comes back when the character loads');

  change('backgroundImage', 2);
  assert.deepStrictEqual(melvor, [['backgroundImage', 2]]);
  assert.strictEqual(stored.get('background'), undefined);
  assert.ok(!classes.has('osrs-background'));
  change('darkMode', 1);
  assert.deepStrictEqual(melvor.at(-1), ['darkMode', 1], 'other settings pass straight through');
  delete globalThis.game;
});

test('clicking the offline recap closes it like OK, but not on its controls or on other popups', async () => {
  const { module, documentListeners, configs } = await boot();
  assert.strictEqual(configs['click-recap'].default, true);
  assert.strictEqual(typeof documentListeners.click, 'function');
  const node = (tagName, parentElement, extra = {}) => ({ tagName, parentElement, onclick: null, matches: (selector) => selector.split(', ').includes(tagName), ...extra });
  const container = node('div', null, { contains(target) { for (let at = target; at; at = at.parentElement) if (at === this) return true; return false; } });
  const popup = node('div', container, { querySelector: (selector) => (selector === 'offline-progress' ? {} : null) });
  const heading = node('h4', popup, { onclick: () => {} });
  const eye = node('i', heading);
  const line = node('h5', popup);
  const ok = node('button', popup);
  let confirms = 0;
  const swal = { isVisible: () => true, getPopup: () => popup, getContainer: () => container, clickConfirm: () => confirms++ };
  assert.strictEqual(module.closeRecapOnClick(line, swal), true, 'a line of the recap');
  assert.strictEqual(module.closeRecapOnClick(container, swal), true, 'the backdrop around it');
  assert.strictEqual(module.closeRecapOnClick(eye, swal), false, 'a Better Offline Recap section header folds instead');
  assert.strictEqual(module.closeRecapOnClick(ok, swal), false, 'OK closes it by itself');
  const otherPopup = { ...popup, querySelector: () => null };
  assert.strictEqual(module.closeRecapOnClick(line, { ...swal, getPopup: () => otherPopup }), false, 'other popups are left alone');
  assert.strictEqual(module.closeRecapOnClick(line, { ...swal, isVisible: () => false }), false);
  assert.strictEqual(confirms, 2);
});

test('the offline recap says under its OK button that a click anywhere closes it, once', async () => {
  const { module } = await boot();
  const added = [];
  const popup = { querySelector: (selector) => (selector === 'offline-progress' ? {} : added.find(() => selector === '.osrs-recap-note') ?? null) };
  const actions = { after: (node) => added.push(node) };
  const swal = { getPopup: () => popup, getActions: () => actions };
  const doc = { createElement: (tag) => ({ tag }) };
  assert.strictEqual(module.addRecapNote(swal, doc), true);
  assert.strictEqual(module.addRecapNote(swal, doc), false, 'not twice');
  assert.match(added[0].className, /text-danger/);
  assert.match(added[0].textContent, /click anywhere in this window/);
  const other = { ...swal, getPopup: () => ({ querySelector: () => null }) };
  assert.strictEqual(module.addRecapNote(other, doc), false, 'other popups get no note');
});

test('the offline recap shows its skill icon beside Welcome Back instead of above it', async () => {
  const { module, configs } = await boot();
  assert.strictEqual(configs['compact-headers'].default, true);
  const hidden = new Set();
  const image = { getAttribute: (name) => (name === 'src' ? 'woodcutting.png' : null), classList: { add: (name) => hidden.add(name) }, cloneNode: () => ({ removeAttribute() {} }) };
  const prepended = [];
  const title = { prepend: (node) => prepended.push(node), querySelector: () => prepended[0] ?? null };
  const swal = { getPopup: () => ({ querySelector: (selector) => (selector === 'offline-progress' ? {} : null) }), getImage: () => image, getTitle: () => title };
  assert.strictEqual(module.compactRecapHeader(swal), true);
  assert.strictEqual(prepended[0].className, 'osrs-recap-icon');
  assert.ok(hidden.has('d-none'), 'the big picture is hidden');
  assert.strictEqual(module.compactRecapHeader(swal), false, 'only once');
  assert.strictEqual(module.compactRecapHeader({ ...swal, getPopup: () => ({ querySelector: () => null }) }), false, 'other popups keep their picture');
});

test('a warning ! on character select moves beside the title instead of above it', async () => {
  const { module } = await boot();
  const classes = new Set(['swal2-icon', 'swal2-warning']);
  const icon = { classList: { contains: (name) => classes.has(name), add: (name) => classes.add(name) }, cloneNode: () => ({ classList: { add() {} }, removeAttribute() {} }) };
  const prepended = [];
  const title = { textContent: 'Load Local Save', prepend: (node) => prepended.push(node), querySelector: () => prepended[0] ?? null };
  const swal = { getIcon: () => icon, getTitle: () => title };
  assert.strictEqual(module.compactWarningIcon(swal), true);
  assert.ok(classes.has('d-none'), 'the big ! is hidden');
  assert.strictEqual(module.compactWarningIcon(swal), false, 'only once');
  const success = { ...swal, getIcon: () => ({ classList: { contains: (name) => name === 'swal2-success' } }) };
  assert.strictEqual(module.compactWarningIcon(success), false, 'other icons stay');
});

test('the Abyssal level cap and Skill Tree buttons stay hidden until the Abyssal Realm unlocks', async () => {
  const { classes, configs, patches, hooks } = await boot();
  assert.strictEqual(configs['hide-abyssal-ui'].default, true);
  const realm = { isUnlocked: false };
  globalThis.game = { realms: { getObjectByID: (id) => (id === 'melvorItA:Abyssal' ? realm : undefined) } };
  hooks.ready();
  assert.ok(classes.has('osrs-hide-abyssal-ui'), 'the setting is on');
  assert.ok(classes.has('osrs-abyssal-locked'), 'locked before Into the Abyss');
  realm.isUnlocked = true;
  patches['RealmManager.onRealmRequirementMet']();
  assert.ok(!classes.has('osrs-abyssal-locked'), 'shown as soon as the realm unlocks');
  delete globalThis.game;
});

test('General keeps the main switches, Accessibility comes second, and everything smaller lives under Advanced', async () => {
  const { sectionOf, sectionOrder } = await boot();
  assert.deepStrictEqual(sectionOrder, ['General', 'Accessibility', 'Advanced']);
  const inSection = (name) => Object.keys(sectionOf).filter((key) => sectionOf[key] === name).sort();
  assert.deepStrictEqual(inSection('General'), ['bank-layout', 'enabled', 'font', 'font-all', 'hitsplats', 'login', 'slayer-masters', 'stacks', 'tooltips']);
  assert.deepStrictEqual(inSection('Accessibility'), ['bank-big-icons', 'bank-names']);
  assert.deepStrictEqual(inSection('Advanced'), ['bank-hide-upgrades', 'bank-options-below', 'bevels', 'buttons', 'cards', 'click-recap', 'compact-headers', 'debug', 'hide-abyssal-ui', 'hide-dlc', 'hp-bars', 'sell-locked', 'shadows', 'short-recap', 'sidebar', 'texture']);
});

test('Summoning reopens whichever of Marks or Tablets you had open last', async () => {
  const opened = [];
  globalThis.switchSummoningCategory = (category) => opened.push(category.id);
  const realm = {};
  const marks = { id: 'melvorD:Marks', type: 'Mark', realm };
  const tablets = { id: 'melvorD:Tablets', type: 'Tablet', realm };
  const synergies = { id: 'melvorD:Synergies', type: 'Synergy', realm };
  const { hooks, stored } = await boot();
  globalThis.switchSummoningCategory(marks);
  assert.strictEqual(stored.get('summoningTab'), undefined, 'the game opening Marks while loading is not a choice');
  stored.set('summoningTab', 'melvorD:Tablets');
  globalThis.game = { summoning: { currentRealm: realm, categories: { getObjectByID: (id) => [marks, tablets].find((c) => c.id === id) } } };
  hooks.ready();
  assert.deepStrictEqual(opened, ['melvorD:Marks', 'melvorD:Tablets'], 'Tablets reopens once the interface is ready');
  globalThis.switchSummoningCategory(marks);
  assert.strictEqual(stored.get('summoningTab'), 'melvorD:Marks');
  globalThis.switchSummoningCategory(synergies);
  assert.strictEqual(stored.get('summoningTab'), 'melvorD:Marks', 'the synergies popup is not a tab');
  delete globalThis.game;
  delete globalThis.switchSummoningCategory;
});

test("the Slayer Task box shows the OSRS Slayer Master for the task's tier, and none for Abyssal tasks or no task", async () => {
  const { existsSync } = await import('node:fs');
  globalThis.SlayerTaskMenuElement = class SlayerTaskMenuElement { setTaskMonster() {} setNoTask() {} };
  try {
    const { patches, classes, sectionOf } = await boot();
    assert.ok(classes.has('osrs-slayer-masters'), 'on by default');
    assert.strictEqual(sectionOf['slayer-masters'], 'General');
    const viewClasses = new Set();
    const view = { children: [], append(child) { this.children.push(child); }, classList: { toggle: (name, on) => (on ? viewClasses.add(name) : viewClasses.delete(name)) } };
    const menu = { monsterContainer: { parentElement: view } };
    const show = (id) => patches['SlayerTaskMenuElement.setTaskMonster'].call(menu, undefined, {}, 10, { id });
    const tiers = {
      'melvorF:Easy': 'turael', 'melvorF:Normal': 'krystilia', 'melvorF:Hard': 'mazchna', 'melvorF:Elite': 'vannaka',
      'melvorF:Master': 'nieve', 'melvorTotH:Legendary': 'duradel', 'melvorTotH:Mythical': 'mortimer',
    };
    for (const [id, file] of Object.entries(tiers)) {
      show(id);
      assert.strictEqual(view.children[0].src, `blob:img/slayer/${file}.png`, id);
      assert.ok(viewClasses.has('osrs-has-master'), id);
      assert.ok(existsSync(new URL(`../mod/img/slayer/${file}.png`, import.meta.url)), `${file}.png is bundled`);
    }
    assert.strictEqual(view.children.length, 1, 'one picture, reused across tasks');
    assert.strictEqual(view.children[0].alt, 'Mortimer');
    show('melvorItA:Woe');
    assert.ok(!viewClasses.has('osrs-has-master'), 'Abyssal tasks have no master');
    show('melvorF:Master');
    patches['SlayerTaskMenuElement.setNoTask'].call(menu);
    assert.ok(!viewClasses.has('osrs-has-master'), 'no task, no master');
  } finally {
    delete globalThis.SlayerTaskMenuElement;
  }
});

test('the Slayer Master is as wide as it needs to be to fill the task view, but never more than a third of it', async () => {
  const { fitSlayerMaster } = await import(`../mod/setup.mjs?${Math.random()}`);
  const fit = (clientWidth, clientHeight, naturalWidth, naturalHeight) => {
    const properties = {};
    const view = { clientWidth, clientHeight, classList: element('div').classList, style: { getPropertyValue: (name) => properties[name] ?? '', setProperty: (name, value) => (properties[name] = value) } };
    fitSlayerMaster(view, { naturalWidth, naturalHeight });
    return properties['--osrs-slayer-master-width'];
  };
  assert.strictEqual(fit(600, 150, 180, 360), '75px', 'half as wide as tall, at the full 150px height');
  assert.strictEqual(fit(330, 240, 180, 360), '108px', 'a tall box on a phone is capped at a third of its width');
  assert.strictEqual(fit(600, 0, 180, 360), undefined, 'nothing while the box is hidden');
  assert.strictEqual(fit(600, 150, 0, 0), undefined, 'nothing until the picture has loaded');
});

test('moving the bank options below the bank is off by default and follows its switch', async () => {
  const { classes, configs, sectionOf } = await boot();
  assert.strictEqual(configs['bank-options-below'].default, false);
  assert.strictEqual(sectionOf['bank-options-below'], 'Advanced');
  assert.ok(!classes.has('osrs-bank-options-below'), 'off by default');
  const on = await boot({ 'bank-options-below': true });
  assert.ok(on.classes.has('osrs-bank-options-below'), 'on once switched on');
});

test('the DLC bars at the top of the sidebar stay unless Hide the DLC bars is turned on', async () => {
  const off = await boot();
  assert.strictEqual(off.configs['hide-dlc'].default, false);
  assert.ok(!off.classes.has('osrs-hide-dlc'), 'off by default');
  const on = await boot({ 'hide-dlc': true });
  assert.ok(on.classes.has('osrs-hide-dlc'));
});

test('the OSRS bank tabs and items are on by default and follow their switch', async () => {
  const { classes, configs, sectionOf } = await boot();
  assert.notStrictEqual(configs['bank-layout'].default, false);
  assert.strictEqual(sectionOf['bank-layout'], 'General');
  assert.ok(classes.has('osrs-bank-layout'));
  assert.ok(!(await boot({ 'bank-layout': false })).classes.has('osrs-bank-layout'));
});

function bankIcon() {
  const holder = { after(node) { this.next = node; } };
  return { quantity: { textContent: '', dataset: {}, parentElement: holder }, holder, classList: { names: new Set(), toggle(name, on) { if (on) this.names.add(name); else this.names.delete(name); }, contains(name) { return this.names.has(name); } } };
}

const melvorUpdate = function (bankItem, enableAccessibility) {
  this.quantity.textContent = `${bankItem.quantity}${enableAccessibility ? ` ${bankItem.item.name}` : ''}`;
};

const platebody = { quantity: 12000, item: { name: 'Rune Platebody' } };

test('in the OSRS bank, a name goes in its own label under the item and the stack count keeps just the count, from Melvor\'s accessibility names or the Item names switch', async () => {
  for (const [values, accessibility] of [[{ 'bank-layout': true }, true], [{ 'bank-layout': true, 'bank-names': true }, false], [{ 'bank-layout': true, stacks: false }, true]]) {
    const { patches } = await boot(values);
    const icon = bankIcon();
    patches['BankItemIconElement.updateQuantity'].call(icon, melvorUpdate.bind(icon), platebody, accessibility);
    assert.strictEqual(icon.quantity.textContent, '12000', JSON.stringify(values));
    assert.strictEqual(icon.holder.next.textContent, 'Rune Platebody');
    assert.strictEqual(icon.holder.next.className, 'osrs-bank-name');
    assert.ok(icon.classList.contains('osrs-named'));
  }
});

test('outside the OSRS bank, Melvor\'s accessibility names stay in the stack count and no label is added', async () => {
  for (const values of [{ 'bank-layout': false }, { 'bank-layout': false, stacks: false }, { 'bank-layout': false, 'bank-names': true }]) {
    const { patches } = await boot(values);
    const icon = bankIcon();
    patches['BankItemIconElement.updateQuantity'].call(icon, melvorUpdate.bind(icon), platebody, true);
    assert.strictEqual(icon.quantity.textContent, '12000 Rune Platebody', JSON.stringify(values));
    assert.strictEqual(icon.holder.next, undefined);
    assert.ok(!icon.classList.contains('osrs-named'));
  }
});

test('the OSRS bank with no names leaves items unnamed', async () => {
  const { patches } = await boot({ 'bank-layout': true });
  const icon = bankIcon();
  patches['BankItemIconElement.updateQuantity'].call(icon, melvorUpdate.bind(icon), platebody, false);
  assert.strictEqual(icon.quantity.textContent, '12000');
  assert.strictEqual(icon.holder.next, undefined);
  assert.ok(!icon.classList.contains('osrs-named'));
});

test('Melvor\'s Minor Accessibility Features setting turns every Accessibility switch on, once per character and again when switched on, and each can still be turned off', async () => {
  const { classes, hooks, settings, configs, stored } = await boot({ 'bank-layout': true });
  const toggle = { listeners: [], addEventListener(type, fn) { this.listeners.push([type, fn]); } };
  document.querySelectorAll = (selector) => (selector === '[data-setting-id="enableAccessibility"]' ? [toggle] : []);
  globalThis.game = { settings: { enableAccessibility: true } };
  hooks.ready();
  assert.ok(classes.has('osrs-bank-big-icons') && classes.has('osrs-bank-names'), 'on at first load');
  settings['bank-names'] = false;
  configs['bank-names'].onChange(false);
  await settle();
  assert.ok(!classes.has('osrs-bank-names'), 'turned off again by the player');
  hooks.ready();
  assert.ok(!classes.has('osrs-bank-names'), 'only the first load turns them on');
  assert.strictEqual(stored.get('accessibilityDefaults'), true);
  const [[type, onChange]] = toggle.listeners;
  assert.strictEqual(type, 'change');
  onChange();
  await settle();
  assert.ok(classes.has('osrs-bank-names'), 'on again when Melvor\'s setting is switched on');
  delete globalThis.game;
});

test('a character without Melvor\'s accessibility setting keeps the Accessibility switches off', async () => {
  const { classes, hooks } = await boot({ 'bank-layout': true });
  globalThis.game = { settings: { enableAccessibility: false } };
  hooks.ready();
  assert.ok(!classes.has('osrs-bank-big-icons') && !classes.has('osrs-bank-names'));
  delete globalThis.game;
});

test('bigger bank icons are off by default and follow their switch', async () => {
  const { classes, configs } = await boot({ 'bank-layout': true });
  assert.strictEqual(configs['bank-big-icons'].default, false);
  assert.ok(!classes.has('osrs-bank-big-icons'));
  assert.ok((await boot({ 'bank-big-icons': true })).classes.has('osrs-bank-big-icons'));
});

test('if the OSRS Theme switch next to Dark Mode cannot be built, switching settings still redraws the bank', async () => {
  const icon = { item: platebody.item, calls: 0, updateQuantity() { this.calls++; } };
  const { hooks, configs, settings } = await boot({ 'bank-layout': true });
  globalThis.game = { bank: { items: new Map([[platebody.item, platebody]]) }, settings: { enableAccessibility: false } };
  document.createElement = (tag) => (tag === 'settings-switch' ? { setAttribute() {} } : element(tag));
  document.querySelectorAll = (selector) => (selector === 'bank-item-icon' ? [icon] : []);
  hooks.ready();
  const before = icon.calls;
  settings['bank-names'] = true;
  configs['bank-names'].onChange(true);
  await settle();
  assert.ok(icon.calls > before, 'the bank items were redrawn after the switch changed');
  delete globalThis.game;
});

test('the upgrade arrows on bank items are hidden by default and come back with their switch', async () => {
  const { classes, configs, sectionOf } = await boot();
  assert.strictEqual(sectionOf['bank-hide-upgrades'], 'Advanced');
  assert.notStrictEqual(configs['bank-hide-upgrades'].default, false);
  assert.ok(classes.has('osrs-bank-hide-upgrades'));
  assert.ok(!(await boot({ 'bank-hide-upgrades': false })).classes.has('osrs-bank-hide-upgrades'));
});

function lockedSale(quantity, equipped) {
  const item = { name: 'Rune Scimitar' };
  const bankItem = { item, quantity, locked: true };
  globalThis.game = { bank: { selectedBankItem: bankItem }, combat: { player: { checkEquipmentSetsForItem: (each) => equipped && each === item } } };
  const sold = [];
  const bank = { items: new Map([[item, bankItem]]) };
  const modes = [];
  const allButOneClicks = [];
  const menu = { sellItemButton: { disabled: true }, sellAllButOneButton: { onclick: () => allButOneClicks.push(1) }, sellItemQuantitySlider: { setSliderMode: (mode) => modes.push(mode) } };
  return { item, bankItem, bank, menu, sold, modes, allButOneClicks, sell: (patches, asked) => patches['Bank.sellItemOnClick'].call(bank, (each, amount) => sold.push(amount), item, asked) };
}

test('selling locked items is off by default: the Sell button stays disabled and sales go through untouched', async () => {
  const { patches, configs, sectionOf, classes } = await boot();
  assert.strictEqual(configs['sell-locked'].default, false);
  assert.strictEqual(sectionOf['sell-locked'], 'Advanced');
  assert.ok(!classes.has('osrs-sell-locked'));
  const sale = lockedSale(10, false);
  patches['BankSelectedItemMenuElement.setItemLocked'].call(sale.menu, undefined, true);
  assert.strictEqual(sale.menu.sellItemButton.disabled, true);
  sale.sell(patches, 10);
  assert.deepStrictEqual(sale.sold, [10]);
  delete globalThis.game;
});

test('with Sell locked items down to 1 on, a locked item sells all but one, and an equipped copy counts as the one kept', async () => {
  const { patches } = await boot({ 'sell-locked': true });
  const kept = lockedSale(10, false);
  patches['BankSelectedItemMenuElement.setItemLocked'].call(kept.menu, undefined, true);
  assert.strictEqual(kept.menu.sellItemButton.disabled, false, 'the Sell button works on the locked item');
  kept.sell(patches, 10);
  assert.deepStrictEqual(kept.sold, [9], 'one stays in the bank');
  kept.menu.sellAllButOneButton.onclick();
  assert.deepStrictEqual(kept.modes, [], 'All but 1 keeps one in the bank when none is equipped');

  const worn = lockedSale(10, true);
  patches['BankSelectedItemMenuElement.setItemLocked'].call(worn.menu, undefined, true);
  worn.sell(patches, 10);
  assert.deepStrictEqual(worn.sold, [10], 'the equipped copy is the one kept');
  worn.menu.sellAllButOneButton.onclick();
  assert.deepStrictEqual(worn.allButOneClicks, [1]);
  assert.deepStrictEqual(worn.modes, [2], 'All but 1 picks every copy in the bank');

  const last = lockedSale(1, false);
  patches['BankSelectedItemMenuElement.setItemLocked'].call(last.menu, undefined, true);
  assert.strictEqual(last.menu.sellItemButton.disabled, true, 'the last unequipped copy cannot be sold');
  last.sell(patches, 1);
  assert.deepStrictEqual(last.sold, [0]);
  delete globalThis.game;
});

test('Sell locked items down to 1 leaves unlocked items alone', async () => {
  const { patches } = await boot({ 'sell-locked': true });
  const sale = lockedSale(10, false);
  sale.bankItem.locked = false;
  sale.sell(patches, 10);
  assert.deepStrictEqual(sale.sold, [10]);
  delete globalThis.game;
});

test('the OSRS bank swaps Search Bank for a Search button in a bar under the items that opens the search, and Close clears it', async () => {
  const home = element('div');
  const group = element('div');
  const pane = element('div');
  group.parentElement = home;
  let focused = 0;
  let cleared = 0;
  const options = { searchBar: { value: '', closest: () => group, focus: () => focused++ }, clearSearchButton: { click: () => cleared++ } };
  const { hooks, configs, settings } = await boot();
  document.getElementById = (id) => (id === 'main-bank-options' ? options : null);
  document.querySelector = (selector) => (selector === '#bank-tab-menu .tab-content' ? pane : null);
  hooks.ready();
  const bar = pane.next;
  const [button] = bar.children;
  assert.ok(bar.className.includes('osrs-bank-footer'));
  assert.ok(bar.children.includes(group), 'Melvor\'s search box moves into the bar');
  assert.strictEqual(button.textContent, 'Search');
  button.onclick();
  assert.ok(bar.classList.contains('osrs-searching'));
  assert.strictEqual(button.textContent, 'Close');
  assert.strictEqual(focused, 1);
  button.onclick();
  assert.ok(!bar.classList.contains('osrs-searching'));
  assert.strictEqual(button.textContent, 'Search');
  assert.strictEqual(cleared, 1);
  settings['bank-layout'] = false;
  configs['bank-layout'].onChange(false);
  await settle();
  assert.ok(home.children.includes(group), 'back where Melvor had it with the OSRS bank off');
});

function recapLines(...texts) {
  const lines = texts.map((text) => ({ firstChild: typeof text === 'string' ? { nodeType: 3, textContent: text } : { nodeType: 1 } }));
  return { lines, messageContainer: { querySelectorAll: (selector) => (selector === 'h5' ? lines : []) } };
}

test('the offline recap drops "You gained", "You used" and the like by default, and the "You" from other lines', async () => {
  const { configs, sectionOf, patches, classes } = await boot();
  assert.notStrictEqual(configs['short-recap'].default, false);
  assert.strictEqual(sectionOf['short-recap'], 'Advanced');
  assert.ok(classes.has('osrs-short-recap'));
  const recap = recapLines('You gained ', 'You earned ', 'You used ', 'You ate ', 'You spent ', 'You killed 12 ', 'You leveled up Woodcutting once (1->2)', 'You have ', 'Township Health: 100%', null);
  patches['OfflineProgressElement.setMessages'].call(recap);
  assert.deepStrictEqual(recap.lines.map((line) => line.firstChild.textContent), ['', '', '', '', '', 'Killed 12 ', 'Leveled up Woodcutting once (1->2)', 'You have ', 'Township Health: 100%', undefined]);
});

test('the offline recap keeps its full lines with Shorter offline recap lines off', async () => {
  const { patches } = await boot({ 'short-recap': false });
  const recap = recapLines('You gained ');
  patches['OfflineProgressElement.setMessages'].call(recap);
  assert.strictEqual(recap.lines[0].firstChild.textContent, 'You gained ');
});

test('the Slayer Master goes away when the task box is narrower than on an average phone, and comes back when it widens', async () => {
  const { fitSlayerMaster } = await import(`../mod/setup.mjs?${Math.random()}`);
  const view = { clientWidth: 265, clientHeight: 300, classList: element('div').classList, style: { getPropertyValue: () => '', setProperty() {} } };
  const image = { naturalWidth: 180, naturalHeight: 360 };
  fitSlayerMaster(view, image);
  assert.ok(view.classList.contains('osrs-master-narrow'), 'a narrow desktop column');
  view.clientWidth = 334;
  fitSlayerMaster(view, image);
  assert.ok(!view.classList.contains('osrs-master-narrow'), 'a 390px phone');
  view.clientWidth = 265;
  fitSlayerMaster(view, image);
  view.clientWidth = 0;
  fitSlayerMaster(view, image);
  assert.ok(view.classList.contains('osrs-master-narrow'), 'unchanged while the combat page is hidden');
});
