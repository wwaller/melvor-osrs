import assert from 'node:assert';
import { test } from 'node:test';

function classList() {
  const names = new Set();
  return {
    names,
    add: (name) => names.add(name),
    contains: (name) => names.has(name),
    toggle: (name, on) => (on ? names.add(name) : names.delete(name)),
  };
}

function category(id, config = {}) {
  const items = [];
  const wrap = (item) => item;
  return {
    id,
    config,
    rootEl: { classList: classList() },
    items: () => items.map(wrap),
    item(itemID, itemConfig) {
      let item = items.find((i) => i.id === itemID);
      if (!item) {
        item = { id: itemID, config: itemConfig, rootEl: { classList: classList() }, clicks: 0, click() { this.clicks++; itemConfig?.onClick?.(); } };
        const at = itemConfig?.before ? items.findIndex((i) => i.id === itemConfig.before) : -1;
        items.splice(at === -1 ? items.length : at, 0, item);
      }
      return item;
    },
    removeItem(itemID) {
      const at = items.findIndex((i) => i.id === itemID);
      if (at !== -1) items.splice(at, 1);
    },
  };
}

function world({ unlocked }) {
  const skill = (id, name) => ({ id, name, media: `${name}.png`, isUnlocked: unlocked.includes(name) });
  const skills = ['Attack', 'Magic', 'Woodcutting', 'Herblore', 'Farming'].map((name) => skill(`melvorD:${name}`, name));
  const byName = Object.fromEntries(skills.map((s) => [s.name, s]));
  const pages = {
    combat: { id: 'melvorD:Combat', name: 'Combat' },
    altMagic: { id: 'melvorD:AltMagic', name: 'Alt. Magic' },
    woodcutting: { id: 'melvorD:Woodcutting', name: 'Woodcutting' },
    herblore: { id: 'melvorD:Herblore', name: 'Herblore' },
    farming: { id: 'melvorD:Farming', name: 'Farming', skillSidebarCategoryID: 'Passive' },
  };
  const pagesFor = {
    Attack: [pages.combat], Magic: [pages.combat, pages.altMagic], Woodcutting: [pages.woodcutting], Herblore: [pages.herblore], Farming: [pages.farming],
  };
  const categories = new Map(['Combat', 'Passive', 'Non-Combat'].map((id) => [id, category(id)]));
  const sidebarAPI = {
    category(id, config) {
      if (!categories.has(id)) categories.set(id, category(id, config));
      return categories.get(id);
    },
  };
  const navs = new Map();
  for (const s of skills) {
    navs.set(s, pagesFor[s.name].map((page) => {
      const categoryID = page.skillSidebarCategoryID || (page.id === 'melvorD:Combat' ? 'Combat' : 'Non-Combat');
      return { item: sidebarAPI.category(categoryID).item(s.id, { onClick: () => opened.push(`${page.id} ${s.id}`) }) };
    }));
  }
  const opened = [];
  const potionWrapper = { classList: classList() };
  return { skills, byName, sidebarAPI, categories, navs, potionWrapper, opened, pagesFor };
}

async function boot(options = {}, values = {}) {
  const w = world(options);
  const patches = {};
  let ready;
  globalThis.sidebar = w.sidebarAPI;
  globalThis.skillNav = { navs: w.navs };
  globalThis.SkillNav = class SkillNav { updateSkillLock() {} };
  globalThis.game = {
    skills: { forEach: (fn) => w.skills.forEach(fn), getObjectByID: (id) => w.skills.find((s) => s.id === id) },
    getPagesForSkill: (s) => w.pagesFor[s.name],
  };
  globalThis.document = {
    getElementById: (id) => (id === 'page-header-potions-dropdown' ? { parentElement: w.potionWrapper } : null),
    createElement: (tag) => ({ tagName: tag, className: '' }),
  };
  const ctx = {
    loadStylesheet: (path) => (ctx.stylesheet = path),
    settings: { section: () => ({ add: (config) => (ctx.setting = config), get: (name) => values[name] ?? ctx.setting?.default }) },
    patch: (target, method) => ({ after: (fn) => (patches[`${target.name}.${method}`] = fn) }),
    onInterfaceReady: (fn) => (ready = fn),
  };
  const { setup } = await import(`../mod/setup.mjs?${Math.random()}`);
  setup(ctx);
  ready();
  const unlearned = w.categories.get('Unlearned');
  return { ...w, ctx, patches, unlearned, unlock: (name) => { w.byName[name].isUnlocked = true; patches['SkillNav.updateSkillLock'](undefined, w.byName[name]); } };
}

test('locked skills leave their section for Unlearned, in sidebar order, and their copies open the same page', async () => {
  const { unlearned, categories, ctx, opened } = await boot({ unlocked: ['Attack', 'Woodcutting'] });
  assert.strictEqual(ctx.stylesheet, 'style.css');
  assert.deepStrictEqual(unlearned.config, { toggleable: true, after: 'Non-Combat' });
  assert.deepStrictEqual(unlearned.items().map((i) => i.config.name), ['Magic', 'Farming', 'Alt. Magic', 'Herblore'], 'Combat, then Passive, then Non-Combat; Magic shows under both of its pages');
  assert.ok(categories.get('Non-Combat').items().find((i) => i.id === 'melvorD:Herblore').rootEl.classList.contains('unlearned-skills-moved'));
  assert.ok(!categories.get('Non-Combat').items().find((i) => i.id === 'melvorD:Woodcutting').rootEl.classList.contains('unlearned-skills-moved'));
  assert.ok(unlearned.items().every((i) => i.config.nameClass === 'text-danger'));
  unlearned.items().find((i) => i.config.name === 'Alt. Magic').config.onClick();
  assert.deepStrictEqual(opened, ['melvorD:AltMagic melvorD:Magic']);
  assert.ok(!unlearned.rootEl.classList.contains('d-none'));
});

test('learning a skill moves it back, and the section hides once every skill is learned', async () => {
  const { unlearned, categories, unlock } = await boot({ unlocked: ['Attack', 'Woodcutting', 'Magic', 'Farming'] });
  assert.deepStrictEqual(unlearned.items().map((i) => i.config.name), ['Herblore']);
  unlock('Herblore');
  assert.deepStrictEqual(unlearned.items(), []);
  assert.ok(!categories.get('Non-Combat').items().find((i) => i.id === 'melvorD:Herblore').rootEl.classList.contains('unlearned-skills-moved'));
  assert.ok(unlearned.rootEl.classList.contains('d-none'));
});

test('a skill learned out of order slots its neighbours back in place', async () => {
  const { unlearned, byName, patches } = await boot({ unlocked: ['Attack'] });
  byName.Farming.isUnlocked = true;
  patches['SkillNav.updateSkillLock'](undefined, byName.Farming);
  byName.Farming.isUnlocked = false;
  patches['SkillNav.updateSkillLock'](undefined, byName.Farming);
  assert.deepStrictEqual(unlearned.items().map((i) => i.config.name), ['Magic', 'Farming', 'Alt. Magic', 'Woodcutting', 'Herblore']);
});

test('the potion button hides while Herblore is locked, unless the option is off', async () => {
  const locked = await boot({ unlocked: [] });
  assert.ok(locked.potionWrapper.classList.contains('unlearned-skills-moved'));
  locked.unlock('Herblore');
  assert.ok(!locked.potionWrapper.classList.contains('unlearned-skills-moved'));

  const off = await boot({ unlocked: [] }, { 'hide-potions': false });
  assert.ok(!off.potionWrapper.classList.contains('unlearned-skills-moved'));
  off.ctx.setting.onChange(true);
  assert.ok(off.potionWrapper.classList.contains('unlearned-skills-moved'));
});
