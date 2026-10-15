const THEME_CLASS = 'osrs-theme';
const FONT_SCALES = { '--osrs-font-size': 1 };
const UI_FONT_SIZE_ADJUST = '125%';
const POPUPS = '.swal2-container, .modal';
const COMBAT_SPLASH_CONTAINERS = new Set(['combat-player-splash-container', 'combat-enemy-splash-container']);
const BACKGROUND_SETTING = 'backgroundImage';
const SMOOTH_FONT_RATIO = 2;
const FONT_BASE = 16;
const CRISP_TOLERANCE = 0.12;
const RECAP_CONTROLS = 'a, button, input, select, textarea, label, [role="button"]';
const RECAP_NOTE = 'You can also click anywhere in this window to dismiss it.';
const ABYSSAL_REALM = 'melvorItA:Abyssal';
const ABYSSAL_LOCKED_CLASS = 'osrs-abyssal-locked';
const SUMMONING_TAB_KEY = 'summoningTab';
const REMEMBERED_SUMMONING_TABS = new Set(['Mark', 'Tablet']);
const SLAYER_MASTER_MAX_SHARE = 0.33;
const SLAYER_MASTERS = {
  'melvorF:Easy': 'Turael',
  'melvorF:Normal': 'Krystilia',
  'melvorF:Hard': 'Mazchna',
  'melvorF:Elite': 'Vannaka',
  'melvorF:Master': 'Nieve',
  'melvorTotH:Legendary': 'Duradel',
  'melvorTotH:Mythical': 'Mortimer',
};

/** The OSRS fonts are pixel-exact at multiples of 16 device pixels: use one when it is close to the wanted size, else the wanted size. */
function fontSize(scale, ratio) {
  const target = FONT_BASE * scale;
  const exact = Math.round(target * ratio) / ratio;
  if (ratio >= SMOOTH_FONT_RATIO) return exact;
  const step = FONT_BASE / ratio;
  const crisp = Math.max(1, Math.round(target / step)) * step;
  return Math.abs(crisp - target) / target <= CRISP_TOLERANCE ? crisp : exact;
}
const FEATURES = [
  { name: 'font', label: 'OSRS font', hint: 'Titles, headings, the sidebar, buttons, tooltips, bank counts and hitsplats use the real OSRS fonts. Descriptions and stat tables stay in Melvor\'s font so they stay easy to read.' },
  { name: 'font-all', label: 'OSRS font for all text', hint: 'Also uses the OSRS fonts for descriptions, stats and small print, at Melvor\'s own text sizes. Turn off if it is hard to read.' },
  { name: 'hitsplats', label: 'OSRS hitsplats', hint: 'Damage numbers on red hitsplats, blue for a miss, green for poison, and so on.' },
  { name: 'login', label: 'OSRS login background', hint: 'The classic OSRS login art behind character select, with the braziers burning.' },
  { name: 'stacks', label: 'OSRS bank stack colours', hint: 'Yellow under 100K, white with a K up to 10M, green with an M after that.' },
  { name: 'tooltips', label: 'OSRS-style tooltips', hint: 'Translucent brown hover boxes with a thin border, like RuneLite.' },
  { name: 'slayer-masters', label: 'OSRS Slayer Masters', hint: 'The Slayer Task box shows the OSRS Slayer Master for the task\'s tier beside the monster: Turael for Easy, then Krystilia, Mazchna, Vannaka, Nieve, Duradel, and Mortimer for Mythical. Abyssal tasks have none.' },
  { section: 'Advanced', name: 'shadows', label: 'Black text shadow', hint: 'OSRS draws all interface text with a 1px black shadow.' },
  { section: 'Advanced', name: 'bevels', label: 'Bevelled stone borders', hint: 'Panels, buttons and tabs get a light top-left edge and a dark bottom-right edge.' },
  { section: 'Advanced', name: 'hp-bars', label: 'OSRS health and timer bars', hint: 'Green over red for your hitpoints and the enemy\'s, and OSRS yellow for timers like the attack interval.' },
  { section: 'Advanced', name: 'texture', label: 'Stone texture', hint: 'A faint speckled stone texture behind panels and the sidebar.' },
  { section: 'Advanced', name: 'cards', label: 'Stone character select cards', hint: 'Save slots look like the stone OSRS login box.' },
  { section: 'Advanced', name: 'sidebar', label: 'OSRS sidebar', hint: 'Skill rows alternate dark and darker with stone edges, and section headers become bevelled title bars.' },
  { section: 'Advanced', name: 'buttons', label: 'OSRS stone buttons', hint: 'Bevelled stone buttons that match the panels, red for dangerous actions, with coloured text instead of coloured buttons.' },
  { section: 'Advanced', name: 'compact-headers', label: 'Compact popup headers', hint: 'The offline recap\'s skill icon and the ! on character select warnings sit to the left of the title instead of as big pictures above it.' },
  { section: 'Advanced', name: 'hide-abyssal-ui', label: 'Hide Abyssal extras until the Abyssal Realm unlocks', hint: 'Until you unlock the Abyssal Realm by completing Into the Abyss, skill headers hide their Abyssal level, XP and level cap button, and skill pages hide their Skill Tree button. The Skill Tree entry in the sidebar stays.' },
  { section: 'Advanced', name: 'click-recap', label: 'Click to close the offline recap', hint: 'Clicking anywhere on the offline progress window closes it, like pressing OK. Better Offline Recap\'s section headers still fold their sections.' },
  { section: 'Advanced', name: 'hide-dlc', label: 'Hide the DLC bars in the sidebar', hint: 'Hides the Throne of the Herald, Atlas of Discovery and Into the Abyss bars at the top of the sidebar that show each expansion is on.', default: false },
  { section: 'Advanced', name: 'bank-options-below', label: 'Bank options below the bank', hint: 'Moves the box with Sort, Move items, Sell Mode and Search Bank under your bank items, closer to your thumb on a phone.', default: false },
];
const FONTS = {
  'OSRS Plain 11': { path: 'fonts/RuneScape-Plain-11.ttf' },
  'OSRS Plain 12': { path: 'fonts/RuneScape-Plain-12.ttf', sizeAdjust: UI_FONT_SIZE_ADJUST },
  'OSRS Bold 12': { path: 'fonts/RuneScape-Bold-12.ttf', sizeAdjust: UI_FONT_SIZE_ADJUST },
};
const ASSETS = {
  '--osrs-stone': 'img/stone.png',
  '--osrs-login': 'img/login.jpg',
  '--osrs-titlebox': 'img/titlebox.png',
  '--osrs-titlebutton': 'img/titlebutton.png',
  '--osrs-hitsplat-damage': 'img/hitsplat-damage.png',
  '--osrs-hitsplat-max-hit': 'img/hitsplat-max-hit.png',
  '--osrs-hitsplat-tinted': 'img/hitsplat-tinted.png',
  '--osrs-hitsplat-zero': 'img/hitsplat-zero.png',
  '--osrs-hitsplat-poison': 'img/hitsplat-poison.png',
  '--osrs-hitsplat-venom': 'img/hitsplat-venom.png',
  '--osrs-hitsplat-burn': 'img/hitsplat-burn.png',
  '--osrs-hitsplat-bleed': 'img/hitsplat-bleed.png',
  '--osrs-hitsplat-heal': 'img/hitsplat-heal.png',
  '--osrs-hitsplat-corruption': 'img/hitsplat-corruption.png',
  '--osrs-recipe-book': 'img/recipe-book.png',
};

export async function setup(ctx) {
  ctx.loadStylesheet('theme.css');
  for (const [property, path] of Object.entries(ASSETS)) document.documentElement.style.setProperty(property, `url("${ctx.getResourceUrl(path)}")`);
  for (const [family, { path, sizeAdjust }] of Object.entries(FONTS)) {
    new FontFace(family, `url("${ctx.getResourceUrl(path)}")`, sizeAdjust ? { sizeAdjust } : {}).load().then((face) => document.fonts.add(face)).catch(() => {});
  }
  const sizeFont = () => {
    const ratio = window.devicePixelRatio || 1;
    for (const [property, scale] of Object.entries(FONT_SCALES)) {
      document.documentElement.style.setProperty(property, `${fontSize(scale, ratio)}px`);
    }
  };
  sizeFont();
  window.addEventListener('resize', sizeFont);
  const section = ctx.settings.section('General');
  const { createLoginScene } = await ctx.loadModule('fire.mjs');
  const { createRecolorer } = await ctx.loadModule('palette.mjs');
  (await ctx.loadModule('overhaul.mjs')).offerOverhaul(ctx);
  const loginScene = createLoginScene(document, window);
  const recolorer = createRecolorer(window);
  let settingsSwitch = null;
  let minibar = null;

  const advanced = ctx.settings.section('Advanced');
  const sectionOf = (feature) => (feature.section === 'Advanced' ? advanced : section);
  const featureSwitch = ({ section: _section, ...feature }) => ({ type: 'switch', default: true, ...feature, onChange: () => later(apply) });
  section.add([
    { type: 'switch', name: 'enabled', label: 'OSRS Theme', hint: 'Old School RuneScape colours. Also in Settings, next to Dark Mode. Turning it off turns everything here and under Advanced off too.', default: true, onChange: (value) => later(() => apply(value)) },
    ...FEATURES.filter((feature) => sectionOf(feature) === section).map(featureSwitch),
  ]);
  advanced.add([
    ...FEATURES.filter((feature) => sectionOf(feature) === advanced).map(featureSwitch),
    { type: 'button', name: 'debug', display: 'Copy theme debug info', color: 'secondary', onClick: showDebugInfo },
  ]);

  document.addEventListener('click', (event) => {
    if (!document.body.classList.contains('osrs-click-recap') || typeof Swal === 'undefined' || String(window.getSelection?.() ?? '')) return;
    closeRecapOnClick(event.target, Swal);
  });
  new MutationObserver(() => {
    if (typeof Swal === 'undefined' || !document.body.classList.contains('swal2-shown')) return;
    if (document.body.classList.contains('osrs-compact-headers')) {
      compactRecapHeader(Swal);
      if (document.body.classList.contains('osrs-character-select')) compactWarningIcon(Swal);
    }
    if (document.body.classList.contains('osrs-click-recap')) addRecapNote(Swal, document);
  }).observe(document.body, { childList: true });

  function markAbyssalLock() {
    const realm = typeof game !== 'undefined' ? game.realms?.getObjectByID(ABYSSAL_REALM) : undefined;
    document.body.classList.toggle(ABYSSAL_LOCKED_CLASS, !realm?.isUnlocked);
  }
  if (typeof RealmManager !== 'undefined') ctx.patch(RealmManager, 'onRealmRequirementMet').after(markAbyssalLock);

  let summoningRestored = false;
  const switchSummoning = typeof switchSummoningCategory === 'function' ? switchSummoningCategory : null;
  if (switchSummoning) {
    globalThis.switchSummoningCategory = (category) => {
      if (summoningRestored && REMEMBERED_SUMMONING_TABS.has(category?.type)) ctx.characterStorage.setItem(SUMMONING_TAB_KEY, category.id);
      return switchSummoning(category);
    };
  }
  function restoreSummoningTab() {
    const summoning = typeof game !== 'undefined' ? game.summoning : undefined;
    const category = summoning?.categories?.getObjectByID(ctx.characterStorage.getItem(SUMMONING_TAB_KEY));
    if (switchSummoning && category && category.realm === summoning.currentRealm) switchSummoning(category);
    summoningRestored = true;
  }

  function labelRecipeButtons() {
    const label = typeof getLangString === 'function' ? getLangString('MENU_TEXT_SELECT_COOKING_RECIPE') : '';
    for (const menu of document.querySelectorAll('cooking-menu')) {
      const button = menu.selectRecipeButton;
      if (!button) continue;
      button.title = label;
      button.setAttribute('aria-label', label);
    }
  }

  function showDebugInfo() {
    const root = document.getElementById('combat-footer-minibar');
    const describe = (element) => {
      const style = window.getComputedStyle(element);
      return [element.tagName.toLowerCase(), element.id, String(element.className || ''), element.getAttribute('style') || '', style.backgroundColor, style.backgroundImage.slice(0, 60), style.borderTopColor].join(' | ');
    };
    const realm = typeof game !== 'undefined' ? game.realms?.getObjectByID(ABYSSAL_REALM) : undefined;
    const lines = [
      `body: ${document.body.className}`,
      `abyssal realm: ${realm ? (realm.isUnlocked ? 'unlocked' : 'locked') : 'missing'}`,
      `skill headers: ${document.querySelectorAll('skill-header').length}, cooking menus: ${document.querySelectorAll('cooking-menu').length}`,
      `slayer master: ${document.querySelector('.osrs-has-master > .osrs-slayer-master')?.alt || 'none'}`,
      `failures: ${failures.join('; ') || 'none'}`,
      `minibar found: ${Boolean(root)}`,
      ...(root ? [root, ...root.querySelectorAll('*')].slice(0, 80).map(describe) : []),
    ];
    const box = document.createElement('textarea');
    box.className = 'form-control font-size-sm';
    box.rows = 12;
    box.value = lines.join('\n');
    SwalLocale.fire({ title: 'Theme debug info', html: box, didOpen: () => box.select() });
    if (navigator.clipboard) navigator.clipboard.writeText(box.value).catch(() => {});
  }

  const failures = [];
  function attempt(name, fn) {
    try {
      fn();
    } catch (error) {
      failures.push(`${name}: ${error?.message ?? error}`);
      console.error(`[OSRS Theme] ${name}`, error);
    }
  }

  function later(fn) {
    setTimeout(fn);
  }

  function apply(on = section.get('enabled')) {
    document.body.classList.toggle(THEME_CLASS, on);
    for (const feature of FEATURES) document.body.classList.toggle(`osrs-${feature.name}`, on && sectionOf(feature).get(feature.name));
    if (settingsSwitch) settingsSwitch.setChecked(on);
    const atLogin = document.body.classList.contains('osrs-login') && document.body.classList.contains('osrs-character-select');
    if (atLogin) loginScene.show();
    else loginScene.hide();
    if (minibar && on) recolorer.recolor(minibar);
    else recolorer.clear();
    alignCombatBars();
    refreshBank();
  }

  function alignCombatBars() {
    for (const side of ['player', 'enemy']) {
      const health = document.getElementById(`combat-${side}-hitpoints-bar`)?.parentElement;
      const label = document.getElementById(`combat-${side}-attack-speed`);
      const timer = health && label && timerBarBefore(label, health);
      if (!timer) continue;
      timer.style.height = '';
      timer.style.marginTop = '';
      if (!document.body.classList.contains('osrs-hp-bars')) continue;
      const healthBox = health.getBoundingClientRect();
      const timerBox = timer.getBoundingClientRect();
      const sideBySide = healthBox.right <= timerBox.left || timerBox.right <= healthBox.left;
      if (!healthBox.height || !timerBox.height || !sideBySide || Math.abs(healthBox.top - timerBox.top) > healthBox.height * 3) continue;
      timer.style.height = `${healthBox.height}px`;
      timer.style.marginTop = `${healthBox.top - timerBox.top}px`;
    }
  }

  function timerBarBefore(label, health) {
    for (let node = label.parentElement; node; node = node.parentElement) {
      const bars = [...node.querySelectorAll('.progress')].filter((bar) => bar !== health
        && !bar.contains(health) && !health.contains(bar) && !bar.querySelector('[id*="barrier"]')
        && bar.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (bars.length) return bars[bars.length - 1];
    }
    return null;
  }

  function watchCombatBars() {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => window.requestAnimationFrame(alignCombatBars));
    for (const side of ['player', 'enemy']) {
      const health = document.getElementById(`combat-${side}-hitpoints-bar`)?.parentElement;
      if (health) observer.observe(health);
    }
  }

  function watchMinibar() {
    minibar = document.getElementById('combat-footer-minibar');
    if (!minibar) return;
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        if (document.body.classList.contains(THEME_CLASS)) recolorer.recolor(minibar);
      }, 100);
    }).observe(minibar, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }

  const stacksOn = () => document.body.classList.contains('osrs-stacks');

  function refreshBank() {
    if (typeof game === 'undefined' || !game.bank) return;
    document.querySelectorAll('bank-item-icon').forEach((icon) => {
      const bankItem = icon.item && game.bank.items.get(icon.item);
      if (bankItem) icon.updateQuantity(bankItem, game.settings.enableAccessibility);
    });
  }

  ctx.patch(BankItemIconElement, 'updateQuantity').after(function (_result, bankItem, enableAccessibility) {
    if (!stacksOn()) {
      delete this.quantity.dataset.osrsStack;
      return;
    }
    const suffix = enableAccessibility ? ` ${bankItem.item.name}` : '';
    const show = () => {
      const [text, colour] = osrsStack(bankItem.quantity);
      this.quantity.textContent = text + suffix;
      this.quantity.dataset.osrsStack = colour;
    };
    show();
    this.onmouseleave = show;
  });

  const hitsplatsOn = () => document.body.classList.contains('osrs-hitsplats');

  const isCombatSplash = (manager) => COMBAT_SPLASH_CONTAINERS.has(manager.container?.id);
  ctx.patch(SplashManager, 'add').replace(function (add, splash) {
    if (isCombatSplash(this) && hitsplatsOn() && typeof game !== 'undefined' && !game._isInOnlineLoop) return undefined;
    return add(splash);
  });

  ctx.patch(SplashManager, 'render').replace(function (render) {
    if (isCombatSplash(this) && hitsplatsOn() && this.container.offsetParent === null) {
      this.queue = [];
      return undefined;
    }
    return render();
  });

  ctx.patch(SplashManager, 'renderSplash').replace(function (renderSplash, splash) {
    const result = renderSplash(splash);
    const element = this.container.lastElementChild;
    if (!element || !isCombatSplash(this) || !document.body.classList.contains('osrs-hitsplats')) return result;
    const isMiss = splash.text !== undefined && splash.text === getLangString('COMBAT_MISC_MISS');
    if (splash.text !== undefined && !isMiss) {
      element.classList.add('osrs-text');
    } else {
      element.textContent = formatNumber(Math.abs(splash.amount));
      if (splash.amount === 0) element.classList.add('osrs-zero');
      else if (splash.amount > 0) element.classList.add('osrs-heal');
    }
    const half = element.offsetWidth / 2;
    const at = Number.isFinite(splash.xOffset) ? splash.xOffset : 100;
    element.style.left = `clamp(0px, calc(${at}% - ${half}px), calc(100% - ${half * 2}px))`;
    return result;
  });

  function showSlayerMaster(menu, category) {
    const view = menu.monsterContainer?.parentElement;
    if (!view) return;
    if (!menu.osrsSlayerMaster) {
      menu.osrsSlayerMaster = document.createElement('img');
      menu.osrsSlayerMaster.className = 'osrs-slayer-master';
      view.append(menu.osrsSlayerMaster);
      watchSlayerMaster(view, menu.osrsSlayerMaster, window);
    }
    const name = SLAYER_MASTERS[category?.id];
    view.classList.toggle('osrs-has-master', Boolean(name));
    if (!name) return;
    menu.osrsSlayerMaster.src = ctx.getResourceUrl(`img/slayer/${name.toLowerCase()}.png`);
    menu.osrsSlayerMaster.alt = name;
    menu.osrsSlayerMaster.title = name;
  }

  if (typeof SlayerTaskMenuElement !== 'undefined') {
    ctx.patch(SlayerTaskMenuElement, 'setTaskMonster').after(function (_result, _monster, _killsLeft, category) {
      attempt('slayer master', () => showSlayerMaster(this, category));
    });
    ctx.patch(SlayerTaskMenuElement, 'setNoTask').after(function () {
      attempt('slayer master', () => showSlayerMaster(this, null));
    });
  }

  function addToGameSettings() {
    const darkMode = document.querySelector('[data-setting-id="darkMode"]');
    if (!darkMode || typeof darkMode.initialize !== 'function') return;
    settingsSwitch = document.createElement(darkMode.tagName.toLowerCase());
    settingsSwitch.className = darkMode.className;
    settingsSwitch.setAttribute('data-size', darkMode.getAttribute('data-size') || 'small');
    settingsSwitch.initialize({ currentValue: section.get('enabled'), name: 'OSRS Theme' }, () => {
      const on = settingsSwitch.input.checked;
      section.set('enabled', on);
      apply(on);
    });
    darkMode.after(settingsSwitch);
  }

  function markLoginLayers() {
    const marked = [...document.querySelectorAll('[data-osrs-login]')];
    marked.forEach((element) => element.removeAttribute('data-osrs-login'));
    const screen = window.innerWidth * window.innerHeight;
    for (const element of [document.body, ...document.body.querySelectorAll('*')]) {
      if (element.id === 'osrs-login-scene' || element.closest?.(POPUPS)) continue;
      const rect = element.getBoundingClientRect();
      if (element !== document.body && rect.width * rect.height < screen / 2) continue;
      const style = (layer) => window.getComputedStyle(element, layer === 'self' ? null : `::${layer}`);
      const layer = element.tagName === 'IMG' ? 'self' : ['self', 'before', 'after'].find((name) => style(name).backgroundImage.includes('url('));
      if (layer) element.setAttribute('data-osrs-login', layer);
      else if (element !== document.body && !/rgba\([^)]*,\s*0\)|transparent/.test(style('self').backgroundColor)) element.setAttribute('data-osrs-login', 'fill');
    }
    if (document.body.classList.contains(THEME_CLASS)) {
      recolorer.recolorElements([...document.body.querySelectorAll('*')].filter((element) => element.getClientRects().length > 0));
    }
  }

  let resizeTimer = null;
  function onLoginResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(markLoginLayers, 200);
  }

  document.body.classList.add('osrs-character-select');
  apply();
  const backgrounds = (await ctx.loadData('img/backgrounds.json')).map(({ key, label }) => ({
    value: `osrs:${key}`,
    key,
    name: `<img src="${ctx.getResourceUrl(`img/backgrounds/${key}-thumb.jpg`)}" style="width:256px" title="${label}"/>`,
  }));
  const storedBackground = () => backgrounds.find((option) => option.key === ctx.characterStorage.getItem('background'));
  const showBackground = (option) => {
    document.body.classList.toggle('osrs-background', option !== undefined);
    if (option) document.body.style.setProperty('--osrs-background', `url("${ctx.getResourceUrl(`img/backgrounds/${option.key}.jpg`)}")`);
  };
  const showChoice = (option) => {
    document.querySelectorAll(`settings-dropdown[data-setting-id="${BACKGROUND_SETTING}"]`).forEach((dropdown) => dropdown.updateValue(option));
  };
  // Kept out of Melvor's save: a background value it does not know stops the character loading once this mod is gone.
  ctx.patch(Settings, 'changeChoiceSetting').replace(function (changeChoiceSetting, setting, value) {
    if (setting !== BACKGROUND_SETTING) return changeChoiceSetting(setting, value);
    const option = backgrounds.find((each) => each.value === value);
    if (!option) {
      ctx.characterStorage.removeItem('background');
      showBackground(undefined);
      return changeChoiceSetting(setting, value);
    }
    ctx.characterStorage.setItem('background', option.key);
    showBackground(option);
    showChoice(option);
    saveData();
    return undefined;
  });

  ctx.onCharacterSelectionLoaded(() => {
    const options = typeof game !== 'undefined' ? game.settings.choiceData[BACKGROUND_SETTING].options : [];
    if (!options.includes(backgrounds[0])) options.push(...backgrounds);
    [0, 500, 2000].forEach((delay) => setTimeout(markLoginLayers, delay));
    window.addEventListener('resize', onLoginResize);
  });
  ctx.onCharacterLoaded(() => {
    attempt('abyssal lock', markAbyssalLock);
    showBackground(storedBackground());
    document.body.classList.remove('osrs-character-select');
    window.removeEventListener('resize', onLoginResize);
    loginScene.hide();
  });
  ctx.onInterfaceReady(() => {
    attempt('background', () => {
      const background = storedBackground();
      if (background) showChoice(background);
    });
    attempt('game settings switch', addToGameSettings);
    attempt('recipe button labels', labelRecipeButtons);
    attempt('abyssal lock', markAbyssalLock);
    attempt('summoning tab', restoreSummoningTab);
    attempt('minibar', watchMinibar);
    attempt('combat bars', watchCombatBars);
    apply();
  });
}

/** Clicking the offline recap closes it the way its OK button does, except on its own controls, like Better Offline Recap's foldable section headers. */
export function closeRecapOnClick(target, swal) {
  if (!swal.isVisible()) return false;
  const popup = swal.getPopup();
  const container = swal.getContainer();
  if (!popup?.querySelector('offline-progress') || !container?.contains(target)) return false;
  for (let node = target; node && node !== popup && node !== container; node = node.parentElement) {
    if (node.matches?.(RECAP_CONTROLS) || typeof node.onclick === 'function') return false;
  }
  swal.clickConfirm();
  return true;
}

/** Puts the offline recap's skill icon inline before its title, in place of the large picture above it. */
export function compactRecapHeader(swal) {
  const popup = swal.getPopup();
  const image = swal.getImage();
  const title = swal.getTitle();
  if (!popup?.querySelector('offline-progress') || !image?.getAttribute('src') || !title || title.querySelector('.osrs-recap-icon')) return false;
  const icon = image.cloneNode();
  icon.className = 'osrs-recap-icon';
  icon.removeAttribute('style');
  title.prepend(icon);
  image.classList.add('d-none');
  return true;
}

/** Puts a popup's warning ! inline before its title, in place of the large circle above it. */
export function compactWarningIcon(swal) {
  const icon = swal.getIcon();
  const title = swal.getTitle();
  if (!icon?.classList.contains('swal2-warning') || icon.classList.contains('d-none') || !title?.textContent || title.querySelector('.osrs-inline-icon')) return false;
  const inline = icon.cloneNode(true);
  inline.classList.add('osrs-inline-icon');
  inline.removeAttribute('style');
  title.prepend(inline);
  icon.classList.add('d-none');
  return true;
}

/** A red line under the offline recap's OK button saying a click anywhere closes it too. */
export function addRecapNote(swal, doc) {
  const popup = swal.getPopup();
  const actions = swal.getActions();
  if (!popup?.querySelector('offline-progress') || !actions || popup.querySelector('.osrs-recap-note')) return false;
  const note = doc.createElement('small');
  note.className = 'osrs-recap-note text-danger d-block text-center mt-2';
  note.textContent = RECAP_NOTE;
  actions.after(note);
  return true;
}

/** The Slayer Master fills the task view's height, so its width follows the view's height: the text beside it wraps to make room, up to a share of the box. */
export function fitSlayerMaster(view, image) {
  if (!image.naturalHeight || !view.clientHeight) return;
  const width = Math.min(Math.ceil(view.clientHeight * image.naturalWidth / image.naturalHeight), Math.floor(view.clientWidth * SLAYER_MASTER_MAX_SHARE));
  if (view.style.getPropertyValue('--osrs-slayer-master-width') !== `${width}px`) view.style.setProperty('--osrs-slayer-master-width', `${width}px`);
}

export function watchSlayerMaster(view, image, win) {
  const fit = () => win.requestAnimationFrame(() => fitSlayerMaster(view, image));
  image.addEventListener('load', fit);
  if (typeof win.ResizeObserver !== 'undefined') new win.ResizeObserver(fit).observe(view);
}

export function osrsStack(quantity) {
  if (quantity < 100000) return [String(quantity), 'yellow'];
  if (quantity < 10000000) return [`${Math.floor(quantity / 1000)}K`, 'white'];
  return [`${Math.floor(quantity / 1000000)}M`, 'green'];
}
