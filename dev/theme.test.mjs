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
    append(child) { this.children.push(child); },
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }),
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    initialize(data, onChange) { this.input.checked = data.currentValue; this.label = data.name; this.onChange = onChange; },
    setChecked(on) { this.input.checked = on; },
    after(node) { this.next = node; },
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
  const patches = {};
  const hooks = {};
  globalThis.BankItemIconElement = class BankItemIconElement { updateQuantity() {} };
  globalThis.SplashManager = class SplashManager { renderSplash() {} };
  globalThis.Settings = class Settings { changeChoiceSetting() {} };
  globalThis.saveData = () => {};
  const stored = new Map();
  globalThis.document = {
    body: { tagName: 'BODY', children: [], style: { setProperty: (name, value) => (properties[`body ${name}`] = value) }, prepend(child) { this.children.unshift(child); child.isConnected = true; child.remove = () => { this.children = this.children.filter((c) => c !== child); child.isConnected = false; }; }, querySelectorAll: () => globalThis.pageElements || [], getBoundingClientRect: () => ({ width: 1000, height: 800 }), setAttribute(name, value) { this[name] = value; }, classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) } },
    fonts: { add: (face) => fonts.push(face) },
    documentElement: { style: { setProperty: (name, value) => (properties[name] = value) } },
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: (selector) => (selector === '[data-setting-id="darkMode"]' ? darkMode : null),
    createElement: element,
  };
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
    settings: { section: () => ({ add: (list) => list.forEach((c) => (configs[c.name] = c)), get: (key) => settings[key] ?? configs[key]?.default, set: (key, value) => (settings[key] = value) }) },
    onCharacterLoaded: (fn) => (hooks.character = fn),
    onCharacterSelectionLoaded: (fn) => (hooks.select = fn),
    onInterfaceReady: (fn) => (hooks.ready = fn),
  };
  const module = await import(`../mod/setup.mjs?${Math.random()}`);
  await module.setup(ctx);
  return { ctx, module, classes, properties, darkMode, settings, configs, patches, hooks, fonts, stored };
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
  const icon = { quantity: { textContent: '', dataset: {} } };
  patches['BankItemIconElement.updateQuantity'].call(icon, undefined, { quantity: 2500000, item: { name: 'Coal Ore' } }, false);
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
  globalThis.pageElements = [art, panel, plain, picture, fullPanel, popup];
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
