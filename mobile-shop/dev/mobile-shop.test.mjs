import assert from 'node:assert';
import { test } from 'node:test';

function element(tag, attributes = {}) {
  const names = new Set();
  const listeners = [];
  const node = {
    tag, attributes, children: [], parentElement: null, textContent: '', disabled: false,
    classList: {
      names,
      add: (...all) => all.forEach((name) => names.add(name)),
      remove: (name) => names.delete(name),
      contains: (name) => names.has(name),
      toggle: (name, on) => (on ? names.add(name) : names.delete(name)),
    },
    set className(value) { names.clear(); String(value).split(/\s+/).filter(Boolean).forEach((name) => names.add(name)); },
    get className() { return [...names].join(' '); },
    get firstElementChild() { return node.children[0] ?? null; },
    get previousElementSibling() { const siblings = node.parentElement?.children ?? []; return siblings[siblings.indexOf(node) - 1] ?? null; },
    append(...nodes) { nodes.forEach((child) => { child.parentElement = node; node.children.push(child); }); },
    prepend(child) { child.parentElement = node; node.children.unshift(child); },
    closest(selector) {
      for (let at = node; at; at = at.parentElement) {
        if (selector.startsWith('.') && at.classList.contains(selector.slice(1))) return at;
        if (selector.startsWith('#') && at.attributes.id === selector.slice(1)) return at;
      }
      return null;
    },
    querySelector(selector) {
      const want = /\[onclick\*="(\w+)"\]/.exec(selector)?.[1];
      const walk = (at) => { for (const child of at.children) { if (want && child.attributes.onclick?.includes(want)) return child; const found = walk(child); if (found) return found; } return null; };
      return walk(node);
    },
    addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
    click(target = node) {
      let stopped = false;
      const event = { target, stopPropagation: () => (stopped = true), preventDefault() {} };
      listeners.filter((l) => l.type === 'click' && l.capture).forEach((l) => l.fn(event));
      if (!stopped) node.bought = (node.bought ?? 0) + 1;
      return !stopped;
    },
  };
  return node;
}

function purchase(id, { limit = false, requirement = true, afford = true, quantity = 1 } = {}) {
  return { id, limit, requirement, afford, quantity, purchaseRequirements: [{ met: requirement }], allowQuantityPurchase: quantity !== 1 };
}

async function boot({ saved, shown = true, unlocked = { township: true, atlas: true, abyss: true } } = {}) {
  const general = { id: 'melvorD:General', name: 'General' };
  const skills = { id: 'melvorD:SkillUpgrades', name: 'Skill Upgrades' };
  const raid = { id: 'melvorD:GolbinRaid', name: 'Golbin Raid', isGolbinRaid: true };
  const township = { id: 'melvorF:Township', name: 'Township' };
  const atlas = { id: 'melvorAoD:AtlasOfDiscovery', name: 'Atlas of Discovery' };
  const abyss = { id: 'melvorItA:IntoTheAbyss', name: 'Into the Abyss' };
  const abyssalSlayer = { id: 'melvorItA:AbyssalSlayer', name: 'Abyssal Slayer' };
  const categories = [general, skills, raid, township, atlas, abyss, abyssalSlayer];
  const purchases = [purchase('a'), purchase('b', { afford: false }), purchase('c', { limit: true }), purchase('d', { requirement: false }), purchase('e'), purchase('f', { quantity: 0 })];
  const tabs = new Map();
  globalThis.ShopTabMenu = class { updateItemSelection() {} updatePurchaseCosts() {} updatePurchaseRequirements() {} updateForBuyQtyChange() {} };
  const shown_ = [];
  globalThis.ShopMenu = class {
    constructor() { this.tabs = tabs; }
    shouldShowCategory(category) { return !category.isGolbinRaid; }
    showSingleTab(category) { shown_.push(category.id); }
    showAllTabsButRaid() { shown_.push('all'); }
  };
  const makeTab = (category, list) => {
    const tab = new ShopTabMenu();
    tab.items = new Map();
    tab.itemsContainer = element('div');
    for (const each of list) {
      const container = element('div');
      const link = element('a');
      container.append(link);
      const item = { name: element('div'), costContainer: element('div'), costFlex: element('div'), mediaBody: element('div') };
      link.append(item.mediaBody);
      tab.items.set(each, { container, item });
      tab.itemsContainer.append(container);
    }
    tabs.set(category, { menu: tab });
    return tab;
  };
  const generalTab = makeTab(general, purchases);
  makeTab(skills, [purchase('s1')]);
  const shop = element('div', { id: 'new-shop' });
  const navWrap = element('div');
  const toggle = element('div');
  const nav = element('div', { id: 'horizontal-navigation-shop' });
  const list = element('ul', { id: 'shop-tab-container' });
  navWrap.append(toggle, nav);
  nav.append(list);
  const all = element('li');
  all.append(element('a', { onclick: 'shopMenu.showAllTabsButRaid();' }));
  list.append(all, ...categories.map(() => element('li')));
  globalThis.document = { getElementById: (id) => ({ 'new-shop': shop, 'shop-tab-container': list })[id] ?? null, createElement: (tag) => element(tag) };
  let observe;
  globalThis.IntersectionObserver = class { constructor(fn) { observe = fn; } observe() {} };
  const realm = { isUnlocked: unlocked.abyss };
  globalThis.game = {
    township: { isUnlocked: unlocked.township },
    archaeology: { isUnlocked: unlocked.atlas },
    cartography: { isUnlocked: false },
    realms: { getObjectByID: (id) => (id === 'melvorItA:Abyssal' ? realm : undefined) },
    checkRequirements: (requirements) => requirements.every((r) => r.met),
    shop: {
      buyQuantity: 1,
      categoryDisplayOrder: categories,
      categories: { getObjectByID: (id) => categories.find((c) => c.id === id) },
      isPurchaseAtBuyLimit: (p) => p.limit,
      capPurchaseQuantity: (p) => p.quantity,
      getPurchaseCosts: (p) => ({ checkIfOwned: () => p.afford }),
    },
  };
  globalThis.shopMenu = new ShopMenu();
  const stored = new Map(saved ? [['category', saved]] : []);
  const hooks = {};
  const ctx = {
    loadStylesheet() {},
    accountStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    patch: (target, method) => ({ after(fn) { const original = target.prototype[method]; target.prototype[method] = function (...args) { const result = original.apply(this, args); fn.call(this, result, ...args); return result; }; } }),
    onInterfaceReady: (fn) => (hooks.ready = fn),
    settings: { section: () => ({ add() {}, get: () => false }) },
  };
  const { setup } = await import(`../mod/setup.mjs?${Math.random()}`);
  setup(ctx);
  hooks.ready();
  if (shown) observe([{ isIntersecting: true }]);
  const card = (i) => generalTab.itemsContainer.children[i];
  return { generalTab, card, purchases, shown: shown_, stored, list, navWrap, nav, shop, observe, general, skills };
}

const has = (node, name) => node.classList.contains(name);

test('every card is greyed when it cannot be bought: at its buy limit, a requirement unmet, too expensive, or none left to buy', async () => {
  const { card } = await boot();
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5].map((i) => has(card(i), 'mobile-shop-locked')), [false, true, true, true, false, true]);
  assert.ok([0, 1, 2, 3, 4, 5].every((i) => has(card(i), 'mobile-shop-card')), 'every item becomes a compact card');
  assert.strictEqual(card(1).children[0].children[0].children.at(-1).disabled, true, "its Buy button is disabled");
});

test('tapping a card opens it instead of buying, tapping again closes it, and only its Buy button buys', async () => {
  const { card } = await boot();
  const link = card(0).children[0];
  assert.strictEqual(link.click(link), false, 'a tap does not reach the buy handler');
  assert.ok(has(card(0), 'mobile-shop-open'));
  const buy = link.children[0].children.at(-1);
  assert.ok(buy.classList.contains('mobile-shop-buy'));
  assert.strictEqual(link.click(buy), true, 'Buy goes through to Melvor\'s own buy');
  link.click(link);
  assert.ok(!has(card(0), 'mobile-shop-open'));
  link.click(link);
  card(4).children[0].click(card(4).children[0]);
  assert.ok(!has(card(0), 'mobile-shop-open') && has(card(4), 'mobile-shop-open'), 'one card open at a time');
});

test('nothing is worked out while the shop is off screen; it catches up when the shop is opened', async () => {
  const { card, observe } = await boot({ shown: false });
  assert.ok(!has(card(0), 'mobile-shop-card'));
  observe([{ isIntersecting: true }]);
  assert.ok(has(card(0), 'mobile-shop-card') && has(card(1), 'mobile-shop-locked'));
});

test('categories become a grid of buttons with no All entry, and only the chosen one shows, remembered for next time', async () => {
  const { shown, list, navWrap, nav, shop, stored, skills } = await boot();
  assert.ok(has(list, 'mobile-shop-categories') && has(nav, 'mobile-shop-nav'));
  assert.ok(shop.children[0] === nav && has(navWrap, 'mobile-shop-old-nav'), 'the buttons move out of the sticky header, above the cards, and the old menu toggle hides');
  assert.ok(has(list.children[0], 'mobile-shop-all'), 'the All entry is hidden');
  assert.deepStrictEqual(shown, ['melvorD:General'], 'the first category shows on its own');
  assert.ok(has(list.children[1], 'mobile-shop-selected'));
  shopMenu.showSingleTab(skills);
  assert.ok(has(list.children[2], 'mobile-shop-selected') && !has(list.children[1], 'mobile-shop-selected'));
  assert.strictEqual(stored.get('category'), 'melvorD:SkillUpgrades');
  shopMenu.showAllTabsButRaid();
  assert.deepStrictEqual(shown.slice(-2), ['all', 'melvorD:SkillUpgrades'], 'showing everything shows just the chosen category');
  const again = await boot({ saved: 'melvorD:SkillUpgrades' });
  assert.deepStrictEqual(again.shown, ['melvorD:SkillUpgrades'], 'the last category comes back next time');
  const raid = await boot({ saved: 'melvorD:GolbinRaid' });
  assert.deepStrictEqual(raid.shown, ['melvorD:General'], 'never the Golbin Raid shop');
});

test('Township, Atlas of Discovery, Into the Abyss and Abyssal Slayer only get buttons once they are unlocked', async () => {
  const { list, shown, observe } = await boot({ saved: 'melvorF:Township', unlocked: { township: false, atlas: false, abyss: false } });
  const hidden = () => [4, 5, 6, 7].map((i) => has(list.children[i], 'mobile-shop-unavailable'));
  assert.deepStrictEqual(hidden(), [true, true, true, true]);
  assert.ok(!has(list.children[1], 'mobile-shop-unavailable') && !has(list.children[2], 'mobile-shop-unavailable'), 'base game categories always show');
  assert.deepStrictEqual(shown, ['melvorD:General'], 'a saved Township tab falls back to the first category while Township is locked');
  game.township.isUnlocked = true;
  game.archaeology.isUnlocked = true;
  game.realms.getObjectByID('melvorItA:Abyssal').isUnlocked = true;
  observe([{ isIntersecting: true }]);
  assert.deepStrictEqual(hidden(), [false, false, false, false], 'they appear the next time the shop opens');
});

test('the sidebar Shop entry shows your Slayer Coins in their own box left of the GP box, kept current by Melvor', async () => {
  const { addSlayerCoins } = await import(`../mod/setup.mjs?${Math.random()}`);
  const before = [];
  const gpBox = { className: 'font-size-xs text-right lh-1-2 bg-dark rounded p-1', before: (node) => before.push(node) };
  const byId = { 'nav-shop-currency-tooltip': { parentElement: gpBox } };
  const doc = {
    getElementById: (id) => byId[id] ?? null,
    createElement: (tag) => {
      const node = element(tag);
      node.setAttribute = (name, value) => (node.attributes[name] = value);
      return node;
    },
  };
  let rendered = 0;
  const coins = { id: 'melvorD:SlayerCoins', media: 'slayer_coins.png', renderQuantities: () => rendered++ };
  const box = addSlayerCoins(doc, coins);
  assert.deepStrictEqual(before, [box], 'just before the GP box');
  assert.strictEqual(box.className, 'font-size-xs text-right lh-1-2 bg-dark rounded p-1 mr-1', 'styled like the GP box, with a small gap');
  const [icon, amount] = box.children;
  assert.strictEqual(icon.src, 'slayer_coins.png');
  assert.deepStrictEqual(amount.attributes, { 'data-currency-quantity': 'melvorD:SlayerCoins', 'data-currency-highlight': 'true' }, 'Melvor fills in and updates any element tagged with its currency');
  assert.strictEqual(rendered, 1, 'filled in straight away');
  byId[box.id] = box;
  assert.strictEqual(addSlayerCoins(doc, coins), null, 'added only once');
  assert.strictEqual(addSlayerCoins({ getElementById: () => null }, coins), null, 'nothing to do without the sidebar GP box');
});
