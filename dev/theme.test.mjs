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
  globalThis.document = {
    body: { tagName: 'BODY', children: [], prepend(child) { this.children.unshift(child); child.isConnected = true; child.remove = () => { this.children = this.children.filter((c) => c !== child); child.isConnected = false; }; }, querySelectorAll: () => globalThis.pageElements || [], getBoundingClientRect: () => ({ width: 1000, height: 800 }), setAttribute(name, value) { this[name] = value; }, classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) } },
    documentElement: { style: { setProperty: (name, value) => (properties[name] = value) } },
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: (selector) => (selector === '[data-setting-id="darkMode"]' ? darkMode : null),
    createElement: element,
  };
  delete globalThis.game;
  globalThis.window = { innerWidth: 1000, innerHeight: 800, frames: 0, requestAnimationFrame() { this.frames++; return 1; }, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {}, getComputedStyle: () => ({ backgroundImage: 'none', getPropertyValue: () => '' }) };
  globalThis.MutationObserver = class { observe() {} };
  const ctx = {
    loadStylesheet: (path) => (ctx.stylesheet = path),
    getResourceUrl: (path) => `blob:${path}`,
    loadModule: (path) => import(`../mod/${path}`),
    patch: (target, method) => ({ after: (fn) => (patches[`${target.name}.${method}`] = fn), replace: (fn) => (patches[`${target.name}.${method}`] = fn) }),
    settings: { section: () => ({ add: (list) => list.forEach((c) => (configs[c.name] = c)), get: (key) => settings[key] ?? configs[key]?.default, set: (key, value) => (settings[key] = value) }) },
    onCharacterLoaded: (fn) => (hooks.character = fn),
    onCharacterSelectionLoaded: (fn) => (hooks.select = fn),
    onInterfaceReady: (fn) => (hooks.ready = fn),
  };
  const module = await import(`../mod/setup.mjs?${Math.random()}`);
  await module.setup(ctx);
  return { ctx, module, classes, properties, darkMode, settings, configs, patches, hooks };
}

test('loads the theme, points the CSS at the bundled images, and turns every feature on by default', async () => {
  const { ctx, classes, properties } = await boot();
  assert.strictEqual(ctx.stylesheet, 'theme.css');
  assert.strictEqual(properties['--osrs-hitsplat-zero'], 'url("blob:img/hitsplat-zero.png")');
  for (const name of ['osrs-theme', 'osrs-shadows', 'osrs-bevels', 'osrs-tooltips', 'osrs-hp-bars', 'osrs-texture', 'osrs-stacks', 'osrs-hitsplats', 'osrs-login', 'osrs-character-select']) {
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
    const element = { textContent: splash.text ?? String(splash.amount), classes: [], classList: { add: (name) => element.classes.push(name) } };
    patches['SplashManager.renderSplash'].call({ container: { lastElementChild: element } }, () => {}, splash);
    return element;
  };
  const hit = render({ amount: -1015 });
  assert.strictEqual(hit.textContent, '1,015');
  assert.deepStrictEqual(hit.classes, []);
  const blocked = render({ amount: -0 });
  assert.strictEqual(blocked.textContent, '0');
  assert.deepStrictEqual(blocked.classes, ['osrs-zero']);
  const miss = render({ amount: 0, text: 'Miss' });
  assert.strictEqual(miss.textContent, '0');
  assert.deepStrictEqual(miss.classes, ['osrs-zero']);
  const immune = render({ amount: 0, text: 'Immune' });
  assert.strictEqual(immune.textContent, 'Immune');
  assert.deepStrictEqual(immune.classes, ['osrs-text']);
});

test('no hitsplat backlog: nothing queues during offline progress or while combat is off screen', async () => {
  const { patches } = await boot();
  const added = [];
  globalThis.game = { _isInOnlineLoop: false };
  patches['SplashManager.add'].call({}, (splash) => added.push(splash), { amount: -5 });
  assert.strictEqual(added.length, 0, 'dropped during offline progress');
  game._isInOnlineLoop = true;
  patches['SplashManager.add'].call({}, (splash) => added.push(splash), { amount: -5 });
  assert.strictEqual(added.length, 1, 'kept while playing');
  let rendered = 0;
  const hidden = { container: { offsetParent: null }, queue: [{}, {}, {}] };
  patches['SplashManager.render'].call(hidden, () => rendered++);
  assert.strictEqual(rendered, 0);
  assert.deepStrictEqual(hidden.queue, [], 'stale splats thrown away');
  const visible = { container: { offsetParent: {} }, queue: [{}] };
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
  globalThis.pageElements = [art, panel, plain, picture, fullPanel];
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
