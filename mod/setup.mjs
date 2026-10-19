const THEME_CLASS = 'osrs-theme';
const FONT_SCALES = { '--osrs-font-size': 1 };
const UI_FONT_SIZE_ADJUST = '125%';
const POPUPS = '.swal2-container, .modal, [aria-modal="true"]';
const COMBAT_SPLASH_CONTAINERS = new Set(['combat-player-splash-container', 'combat-enemy-splash-container']);
const BACKGROUND_SETTING = 'backgroundImage';
const SMOOTH_FONT_RATIO = 2;
const FONT_BASE = 16;
const CRISP_TOLERANCE = 0.12;
const RECAP_CONTROLS = 'a, button, input, select, textarea, label, [role="button"]';
const RECAP_NOTE = 'You can also click anywhere in this window to dismiss it.';
const RECAP_DROPPED = /^You (?:gained|earned|spent|used|ate) /;
const RECAP_YOU = /^You (?=killed|completed|located|leveled|found|looted)/;
const ABYSSAL_REALM = 'melvorItA:Abyssal';
const ABYSSAL_LOCKED_CLASS = 'osrs-abyssal-locked';
const SUMMONING_TAB_KEY = 'summoningTab';
const ACCESSIBILITY_DEFAULTS_KEY = 'accessibilityDefaults';
const REMEMBERED_SUMMONING_TABS = new Set(['Mark', 'Tablet']);
const SLAYER_MASTER_MAX_SHARE = 0.33;
const SLAYER_MASTER_MIN_VIEW = 320;
const FOLLOWS_MELVOR_ACCESSIBILITY = ['bank-big-icons', 'bank-names'];
const DEBUG_LOG_SIZE = 150;
const HISTORY_DATABASE = 'osrs-theme-history';
const HISTORY_SHOWN = 5000;
const MODS_KEY = 'osrsThemeLastMods';
const SCREEN_SETTLE_MS = 1000;
const ERROR_REPEAT_MS = 60 * 1000;
const IMAGE_CHECK_MS = 3000;
const MINIBAR_PARTS_SHOWN = 40;
const DEBUG_PART_MS = 5000;
const PROGRESS_ATTRIBUTE = 'data-osrs-progress';
const LEVEL_ATTRIBUTE = 'data-osrs-level';
const CAP_ATTRIBUTE = 'data-osrs-cap';
const STONES_CLASS = 'osrs-skill-stones';
const PROGRESS_PROPERTY = '--osrs-progress';
const FONT_SAMPLES = [
  ['sidebar links', '.nav-main-link-name'],
  ['sidebar headings', '.nav-main-heading'],
  ['buttons', '.btn'],
  ['headings', 'h5'],
  ['small text', '.font-size-sm'],
  ['tiny print', 'small'],
  ['page text', 'body'],
];
const SLAYER_MASTERS = {
  'melvorF:Easy': 'Turael',
  'melvorF:Normal': 'Krystilia',
  'melvorF:Hard': 'Mazchna',
  'melvorF:Elite': 'Vannaka',
  'melvorF:Master': 'Nieve',
  'melvorTotH:Legendary': 'Duradel',
  'melvorTotH:Mythical': 'Mortimer',
};

// OSRS fonts are only pixel-exact at multiples of 16 device pixels
function fontSize(scale, ratio) {
  const target = FONT_BASE * scale;
  const exact = Math.round(target * ratio) / ratio;
  if (ratio >= SMOOTH_FONT_RATIO) return exact;
  const step = FONT_BASE / ratio;
  const crisp = Math.max(1, Math.round(target / step)) * step;
  return Math.abs(crisp - target) / target <= CRISP_TOLERANCE ? crisp : exact;
}

function safe(read, fallback = '-') {
  try {
    const value = read();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function describeError(error) {
  return `${error?.name ?? 'Error'}: ${error?.message ?? error}`;
}

function checkImage(url) {
  if (typeof Image === 'undefined') return Promise.resolve('not checked');
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => resolve(`no answer after ${IMAGE_CHECK_MS / 1000}s`), IMAGE_CHECK_MS);
    image.onload = () => {
      clearTimeout(timer);
      resolve(`ok, ${image.naturalWidth}x${image.naturalHeight}`);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve('failed to load');
    };
    image.src = url;
  });
}
const FEATURES = [
  { name: 'font', label: 'OSRS font', hint: 'Titles, headings, the sidebar, buttons, tooltips, bank counts and hitsplats use the real OSRS fonts. Descriptions and stat tables stay in Melvor\'s font so they stay easy to read.' },
  { name: 'font-all', label: 'OSRS font for all text', hint: 'Also uses the OSRS fonts for descriptions, stats and small print, at Melvor\'s own text sizes. Turn off if it is hard to read.' },
  { name: 'hitsplats', label: 'OSRS hitsplats', hint: 'Damage numbers on red hitsplats, blue for a miss, green for poison, and so on.' },
  { name: 'login', label: 'OSRS login background', hint: 'The classic OSRS login art behind character select, with the braziers burning.' },
  { name: 'stacks', label: 'OSRS bank stack colours', hint: 'Yellow under 100K, white with a K up to 10M, green with an M after that.' },
  { name: 'bank-layout', label: 'OSRS bank tabs and items', hint: 'Bank tabs become OSRS folder tabs, and items sit bare on the bank with the stack count in the top left, a white box around the selected item and a padlock on locked ones. Search Bank becomes a Search button in a bar under the items.' },
  { name: 'tooltips', label: 'OSRS-style tooltips', hint: 'Translucent brown hover boxes with a thin border, like RuneLite.' },
  { name: 'skill-stones', label: 'OSRS skill stones in the sidebar', hint: 'Skills in the sidebar become a grid of stones like the OSRS Skills tab, each with its icon and your level over the level cap. Hover a stone for its name and progress. Works with Sidebar Progress Bars, Sidebar Level Bars and Hide Unlearned Skills.' },
  { name: 'level-progress', label: 'Level progress in the sidebar', hint: 'A yellow (48%) to the left of each skill\'s level in the sidebar shows how far you are to the next level, and goes away at the level cap. Works alongside Sidebar Progress Bars.' },
  { name: 'slayer-masters', label: 'OSRS Slayer Masters', hint: 'The Slayer Task box shows the OSRS Slayer Master for the task\'s tier beside the monster: Turael for Easy, then Krystilia, Mazchna, Vannaka, Nieve, Duradel, and Mortimer for Mythical. Abyssal tasks have none.' },
  { section: 'Advanced', name: 'shadows', label: 'Black text shadow', hint: 'OSRS draws all interface text with a 1px black shadow.' },
  { section: 'Advanced', name: 'bevels', label: 'Bevelled stone borders', hint: 'Panels, buttons and tabs get a light top-left edge and a dark bottom-right edge.' },
  { section: 'Advanced', name: 'hp-bars', label: 'OSRS health and timer bars', hint: 'Green over red for your hitpoints and the enemy\'s, and OSRS yellow for timers like the attack interval.' },
  { section: 'Advanced', name: 'texture', label: 'Stone texture', hint: 'A faint speckled stone texture behind panels and the sidebar.' },
  { section: 'Advanced', name: 'cards', label: 'Stone character select cards', hint: 'Save slots look like the stone OSRS login box.' },
  { section: 'Advanced', name: 'sidebar', label: 'OSRS sidebar', hint: 'Skill rows alternate dark and darker with stone edges, and section headers become bevelled title bars.' },
  { section: 'Advanced', name: 'buttons', label: 'OSRS stone buttons', hint: 'Bevelled stone buttons that match the panels, red for dangerous actions, with coloured text instead of coloured buttons.' },
  { section: 'Advanced', name: 'compact-headers', label: 'Compact popup headers', hint: 'The offline recap\'s skill icon and the ! on character select warnings sit to the left of the title instead of as big pictures above it.' },
  { section: 'Advanced', name: 'hide-abyssal-ui', label: 'Hide Abyssal extras until the Abyssal Realm unlocks', hint: 'Until you unlock the Abyssal Realm by completing Into the Abyss, skill headers hide their Abyssal level, XP and level cap button, skill pages hide their Skill Tree button, and the Prayer menu hides its Abyssal prayers tab. The Skill Tree entry in the sidebar stays.' },
  { section: 'Advanced', name: 'click-recap', label: 'Click to close the offline recap', hint: 'Clicking anywhere on the offline progress window closes it, like pressing OK. Better Offline Recap\'s section headers still fold their sections.' },
  { section: 'Advanced', name: 'short-recap', label: 'Shorter offline recap lines', hint: 'Lines in the offline recap drop "You gained", "You earned", "You used", "You ate" and "You spent", since a green count is a gain and a red one a loss. Lines like "You killed" just drop the "You".' },
  { section: 'Advanced', name: 'hide-dlc', label: 'Hide the DLC bars in the sidebar', hint: 'Hides the Throne of the Herald, Atlas of Discovery and Into the Abyss bars at the top of the sidebar that show each expansion is on.', default: false },
  { section: 'Advanced', name: 'bank-options-below', label: 'Bank options below the bank', hint: 'Moves the box with Sort, Move items, Sell Mode and Search Bank under your bank items, closer to your thumb on a phone.', default: false },
  { section: 'Advanced', name: 'bank-hide-upgrades', label: 'Hide upgrade arrows on bank items', hint: 'With OSRS bank tabs and items on, the small upgrade and downgrade arrows in the top right of bank items are hidden. Selecting an item still shows what it upgrades into.' },
  { section: 'Advanced', name: 'sell-locked', label: 'Sell locked items down to 1', hint: 'Locked bank items can be sold from the selected item\'s Sell box, always keeping one. A copy equipped in any equipment set counts as the one kept, so All but 1 sells every copy in the bank. Sell Mode and selling a whole tab still skip locked items.', default: false },
  { section: 'Accessibility', name: 'bank-big-icons', label: 'Bigger bank icons', hint: 'With OSRS bank tabs and items on, bank items are drawn bigger: 5 to a row on a phone instead of 6. Turned on for you when Melvor\'s Minor Accessibility Features setting is on, and you can turn it off again here.', default: false },
  { section: 'Accessibility', name: 'bank-names', label: 'Item names under bank items', hint: 'With OSRS bank tabs and items on, each bank item has its name written under it and the stack count stays in the top left. Melvor\'s Minor Accessibility Features setting shows the names the same way.', default: false },
  { section: 'Accessibility', name: 'crisp-text', label: 'Crisp pixel text', hint: 'With the OSRS font on, text is drawn at the OSRS fonts\' own pixel size so every letter is sharp: 16 pixels for most text, the smaller OSRS font for small print, and 32 for the biggest headings. Some pages get a little taller.', default: false },
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
  '--osrs-skill-stone': 'img/skill-stone.png',
  '--osrs-skill-stone-selected': 'img/skill-stone-selected.png',
  '--osrs-skill-stone-plain': 'img/skill-stone-plain.png',
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
  const failures = [];
  const events = [];
  const fontStatus = {};
  const shared = await ctx.loadModule('overhaul.mjs');
  const deviceLog = typeof indexedDB === 'undefined' ? null : shared.createHistory(indexedDB, HISTORY_DATABASE);
  const note = (text) => {
    events.push(`${new Date().toLocaleTimeString()} ${text}`);
    if (events.length > DEBUG_LOG_SIZE) events.shift();
    deviceLog?.add(text);
  };
  const screenText = () => safe(() => `${window.innerWidth}x${window.innerHeight} at ${window.devicePixelRatio}x, ${screen.orientation?.type ?? 'orientation not reported'}`);
  note(`opened: OSRS Theme ${safe(() => ctx.version, '?')} on Melvor ${safe(() => gameVersion, '?')}, ${safe(() => navigator.userAgent, '-')}, screen ${screenText()}`);
  shared.noteModChanges(note, MODS_KEY);
  watchForHistory(note, screenText, deviceLog);
  ctx.loadStylesheet('theme.css');
  for (const [property, path] of Object.entries(ASSETS)) document.documentElement.style.setProperty(property, `url("${ctx.getResourceUrl(path)}")`);
  for (const [family, { path, sizeAdjust }] of Object.entries(FONTS)) {
    loadFont(family, path, sizeAdjust ? { sizeAdjust } : {});
  }

  async function loadFont(family, path, descriptors) {
    const started = performance.now();
    const took = () => `${Math.round(performance.now() - started)} ms`;
    try {
      const data = await ctx.getResourceBlob(path).arrayBuffer();
      const face = new FontFace(family, data.slice(0), descriptors);
      // Firefox (Android's GeckoView app) rejects a bare name with a number in it; Chrome keeps quotes as part of the name.
      const usable = face.status === 'error' ? new FontFace(`"${family}"`, data.slice(0), descriptors) : face;
      document.fonts.add(await usable.load());
      fontStatus[family] = `loaded in ${took()} (${data.byteLength} bytes${usable === face ? '' : ', quoted name'})`;
    } catch (error) {
      fontStatus[family] = `failed after ${took()}: ${describeError(error)}`;
      failures.push(`font ${family}: ${describeError(error)}`);
      console.error(`[OSRS Theme] font ${family}`, error);
    }
    note(`font ${family} ${fontStatus[family]}`);
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
  shared.offerOverhaul(ctx);
  shared.dropOrphanedSongs();
  shared.closeOnOutsidePress(document, () => ({ toggle: document.getElementById('page-header-equipment-dropdown'), menu: document.getElementById('header-equipment-dropdown') }));
  const loginScene = createLoginScene(document, window);
  const recolorer = createRecolorer(window);
  let settingsSwitch = null;
  let minibar = null;

  const sections = { Accessibility: ctx.settings.section('Accessibility'), Advanced: ctx.settings.section('Advanced') };
  const { Accessibility: accessibility, Advanced: advanced } = sections;
  const sectionOf = (feature) => sections[feature.section] ?? section;
  const onOff = (value) => (value ? 'on' : 'off');
  const featureSwitch = ({ section: _section, ...feature }) => ({
    type: 'switch',
    default: true,
    ...feature,
    onChange: (value) => {
      note(`switched ${feature.label} ${onOff(value)}`);
      later(apply);
    },
  });
  section.add([
    { type: 'switch', name: 'enabled', label: 'OSRS Theme', hint: 'Old School RuneScape colours. Also in Settings, next to Dark Mode. Turning it off turns everything here, under Accessibility and under Advanced off too.', default: true, onChange: (value) => {
      note(`switched OSRS Theme ${onOff(value)}`);
      later(() => apply(value));
    } },
    ...FEATURES.filter((feature) => sectionOf(feature) === section).map(featureSwitch),
  ]);
  accessibility.add(FEATURES.filter((feature) => sectionOf(feature) === accessibility).map(featureSwitch));
  advanced.add([
    ...FEATURES.filter((feature) => sectionOf(feature) === advanced).map(featureSwitch),
    { type: 'button', name: 'debug', display: 'Copy theme debug info', color: 'secondary', onClick: () => {
      note('pressed Copy theme debug info');
      return showDebugInfo();
    } },
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

  const melvorAccessibilityOn = () => typeof game !== 'undefined' && Boolean(game.settings?.enableAccessibility);

  function turnOnAccessibility() {
    for (const name of FOLLOWS_MELVOR_ACCESSIBILITY) accessibility.set(name, true);
  }

  function followMelvorAccessibility() {
    if (!ctx.characterStorage.getItem(ACCESSIBILITY_DEFAULTS_KEY)) {
      ctx.characterStorage.setItem(ACCESSIBILITY_DEFAULTS_KEY, true);
      if (melvorAccessibilityOn()) turnOnAccessibility();
    }
    document.querySelectorAll('[data-setting-id="enableAccessibility"]').forEach((toggle) => toggle.addEventListener('change', () => later(() => {
      if (melvorAccessibilityOn()) turnOnAccessibility();
      apply();
    })));
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

  async function debugReport(progress = () => {}) {
    const lines = [];
    const add = (...rows) => {
      lines.push(...rows);
      progress(lines.join('\n'));
    };
    const part = async (title, read) => {
      add('', `== ${title} ==`);
      let timer;
      try {
        await Promise.race([read(), new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`gave up waiting after ${DEBUG_PART_MS / 1000}s`)), DEBUG_PART_MS);
        })]);
      } catch (error) {
        add(`(this part stopped early: ${describeError(error)})`);
      } finally {
        clearTimeout(timer);
      }
    };
    const yesNo = (value) => (value ? 'yes' : 'no');
    const has = (name) => safe(() => document.body.classList.contains(name), false);
    const count = (selector) => safe(() => document.querySelectorAll(selector).length, 0);
    const show = (value) => {
      if (!value || typeof value !== 'object') return String(value);
      if (typeof value.id === 'string') return value.id;
      return safe(() => JSON.stringify(value), Object.prototype.toString.call(value));
    };
    const agent = String(safe(() => navigator.userAgent, ''));
    const version = (pattern) => agent.match(pattern)?.[1]?.replace(/_/g, '.') ?? '-';
    const native = typeof nativeManager !== 'undefined' ? nativeManager : {};

    add(`OSRS Theme ${safe(() => ctx.version, '?')} on Melvor ${safe(() => gameVersion, '?')}, ${new Date().toString()}`);

    await part('Device', () => {
      add(`user agent: ${agent || '-'}`);
      add(`versions: Android ${version(/Android ([\d.]+)/)}, iOS ${version(/OS (\d+[_\d]*) like Mac/)}, Chrome ${version(/Chrome\/([\d.]+)/)}, Safari ${version(/Version\/([\d.]+)/)}, Firefox ${version(/Firefox\/([\d.]+)/)}`);
      add(`Melvor sees: iOS ${safe(() => native.isIOS)}, Android ${safe(() => native.isAndroid)}, phone app ${safe(() => native.isNativeApp)}, mobile ${safe(() => native.isMobile)}, Steam ${safe(() => native.isSteam)}`);
      add(`site: ${safe(() => location.origin + location.pathname)}`);
      add(`screen ${safe(() => `${screen.width}x${screen.height}`)} at ${safe(() => window.devicePixelRatio)}x, window ${safe(() => `${window.innerWidth}x${window.innerHeight}`)}, language ${safe(() => navigator.language)}`);
    });

    await part('Fonts', () => {
      add(`OSRS font switches on the page: titles and buttons ${yesNo(has('osrs-font'))}, all text ${yesNo(has('osrs-font-all'))}`);
      add(`font loading support: FontFace ${yesNo(typeof FontFace !== 'undefined')}, font list ${safe(() => document.fonts.status)}`);
      for (const family of Object.keys(FONTS)) {
        add(`${family}: ${fontStatus[family] ?? 'still loading'}, in the page's font list ${safe(() => yesNo([...document.fonts].some((face) => face.family.replace(/"/g, '') === family && face.status === 'loaded')))}`);
      }
      add(`text size: base ${safe(() => document.documentElement.style.getPropertyValue('--osrs-font-size') || undefined)}, size adjust ${UI_FONT_SIZE_ADJUST}`);
      add('what the text is drawn with right now:');
      for (const [label, selector] of FONT_SAMPLES) {
        const element = safe(() => [...document.querySelectorAll(selector)].find((each) => each.getClientRects().length > 0 && each.textContent.trim()), null);
        add(`  ${label}: ${element ? safe(() => {
          const style = window.getComputedStyle(element);
          return `${style.fontFamily.split(',')[0]} at ${style.fontSize}`;
        }) : 'none on screen'}`);
      }
    });

    await part('Images', async () => {
      const images = await Promise.all(Object.values(ASSETS).map(async (path) => [path, await safe(() => checkImage(ctx.getResourceUrl(path)), 'could not check')]));
      const loaded = images.filter(([, result]) => String(result).startsWith('ok'));
      add(`${loaded.length} of ${images.length} theme pictures load`);
      images.filter(([, result]) => !String(result).startsWith('ok')).forEach(([path, result]) => add(`  ${path}: ${result}`));
    });

    await part('Stylesheet', () => {
      const sheet = safe(() => [...document.styleSheets].find((each) => safe(() => [...each.cssRules].some((rule) => rule.selectorText?.includes(`.${THEME_CLASS}`)), false)), null);
      add(`theme.css: ${sheet ? `loaded, ${safe(() => sheet.cssRules.length)} rules` : 'not found on the page'}`);
    });

    await part('Theme switches', () => {
      add(`General / OSRS Theme: ${onOff(section.get('enabled'))}`);
      for (const feature of FEATURES) {
        const value = sectionOf(feature).get(feature.name);
        const fallback = feature.default ?? true;
        add(`${feature.section ?? 'General'} / ${feature.label}: ${onOff(value)}${value === fallback ? '' : ` (changed, default ${onOff(fallback)})`}`);
      }
    });

    await part('What the theme is doing on this page', () => {
      add(`theme look: ${has(THEME_CLASS) ? 'on' : 'off'}`);
      add(`theme classes: ${safe(() => [...document.body.classList].filter((name) => name.startsWith('osrs-')).join(' ') || undefined, 'none')}`);
      add(`screen: ${has('osrs-character-select') ? 'character select' : safe(() => game.openPage.name ?? game.openPage.id, 'unknown')}`);
      add(`login art: ${has('osrs-character-select') ? (has('osrs-login') ? 'showing' : 'switched off') : 'only shows on character select'}`);
      const realm = safe(() => game.realms.getObjectByID(ABYSSAL_REALM), null);
      add(`Abyssal Realm: ${realm ? (realm.isUnlocked ? 'unlocked' : 'locked') : 'not in this game'}, extras hidden ${yesNo(has(ABYSSAL_LOCKED_CLASS) && has('osrs-hide-abyssal-ui'))}`);
      add(`OSRS Theme switch next to Dark Mode: ${settingsSwitch ? 'added' : 'not added'}`);
      add(`skill headers ${count('skill-header')}, cooking menus ${count('cooking-menu')}`);
      add(`bank: ${count('bank-item-icon')} items drawn, ${count('bank-item-icon.osrs-named')} with names, search ${bankSearch ? 'moved under the bank' : 'not moved yet'}, Melvor accessibility ${onOff(melvorAccessibilityOn())}`);
      const master = safe(() => document.querySelector('.osrs-has-master:not(.osrs-master-narrow) > .osrs-slayer-master')?.alt, null);
      add(`slayer master: ${master ?? (count('.osrs-has-master.osrs-master-narrow') ? `hidden, the task box is narrower than ${SLAYER_MASTER_MIN_VIEW}px` : 'no task with a master on screen')}`);
      add(`background picture: ${safe(() => ctx.characterStorage.getItem('background'), 'Melvor default')}`);
      add(`combat minibar: ${minibar ? 'found and recoloured' : 'not found yet'}`);
    });

    await part(`Problems (${failures.length})`, () => {
      add(...(failures.length ? failures : ['none']));
    });

    await part('Melvor settings', () => {
      const melvorSettings = safe(() => [...Object.entries(game.settings.boolData ?? {}), ...Object.entries(game.settings.choiceData ?? {})], []);
      const isChanged = ([, data]) => show(data?.currentValue) !== show(data?.defaultValue);
      const changed = melvorSettings.filter(isChanged);
      add(`changed from default (${changed.length}):`);
      changed.forEach(([key, data]) => add(`  ${key} = ${show(data.currentValue)} (default ${show(data.defaultValue)})`));
      add(`left at default (${melvorSettings.length - changed.length}): ${melvorSettings.filter((entry) => !isChanged(entry)).map(([key, data]) => `${key}=${show(data?.currentValue)}`).join(', ') || 'none'}`);
    });

    await part('Mods loaded', () => {
      add(String(safe(() => mod.manager.getLoadedModList().map((each) => (typeof each === 'string' ? each : each?.name ?? show(each))).join(', '))));
    });

    const parts = minibar ? safe(() => [minibar, ...minibar.querySelectorAll('*')].slice(0, MINIBAR_PARTS_SHOWN), []) : [];
    await part(`Combat minibar colours (${parts.length} parts)`, () => {
      parts.forEach((element) => add(safe(() => {
        const style = window.getComputedStyle(element);
        const name = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.classList.length ? `.${[...element.classList].join('.')}` : ''}`;
        const picture = style.backgroundImage === 'none' ? '' : `, picture ${style.backgroundImage.slice(0, 60)}`;
        return `${name}: background ${style.backgroundColor}${picture}, border ${style.borderTopColor}, text ${style.color}`;
      })));
    });

    await part(`History on this device (last ${deviceLog?.days ?? 7} days)`, async () => {
      if (!deviceLog) {
        add('not kept here: this browser has no IndexedDB');
        return;
      }
      const history = await deviceLog.read();
      const stamp = (time) => new Date(time).toISOString().replace('T', ' ').slice(0, 19);
      if (history.length > HISTORY_SHOWN) add(`(${history.length - HISTORY_SHOWN} older events left out)`);
      add(...history.slice(-HISTORY_SHOWN).map((event) => `${stamp(event.t)} ${event.text}`));
    });

    await part(`Recent events (last ${events.length})`, () => {
      add(...events);
    });
    return lines.join('\n');
  }

  function copyText(box) {
    box.select?.();
    const fallback = () => safe(() => document.execCommand('copy'));
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(box.value).catch(fallback);
    else fallback();
  }

  async function showDebugInfo() {
    const box = document.createElement('textarea');
    box.className = 'form-control font-size-sm';
    box.rows = 18;
    box.readOnly = true;
    box.value = 'Collecting theme info...';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn-sm btn-secondary m-1';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => copyText(box));
    const body = document.createElement('div');
    body.append(box, copy);
    if (typeof SwalLocale !== 'undefined') SwalLocale.fire({ title: 'Theme debug info', html: body, width: '50rem' });
    try {
      box.value = await debugReport((text) => (box.value = text));
    } catch (error) {
      box.value += `\n\nThe report stopped: ${describeError(error)}`;
    }
    copyText(box);
    return box.value;
  }

  function attempt(name, fn) {
    try {
      fn();
    } catch (error) {
      failures.push(`${name}: ${describeError(error)}`);
      note(`problem with ${name}: ${describeError(error)}`);
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
    if (typeof skillNav !== 'undefined') attempt('level progress', () => game.skills.forEach(showLevelProgress));
    attempt('bank search', placeBankSearch);
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

  let bankSearch = null;

  function placeBankSearch() {
    const options = document.getElementById('main-bank-options');
    const group = options?.searchBar?.closest('.input-group');
    const pane = document.querySelector('#bank-tab-menu .tab-content');
    if (!group || !pane) return;
    if (!bankSearch) {
      const bar = document.createElement('div');
      bar.className = 'osrs-bank-footer bg-dark-bank-info';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-warning osrs-bank-search';
      const setOpen = (open) => {
        bar.classList.toggle('osrs-searching', open);
        button.textContent = open ? 'Close' : 'Search';
      };
      button.onclick = () => {
        const open = !bar.classList.contains('osrs-searching');
        setOpen(open);
        if (open) options.searchBar.focus();
        else options.clearSearchButton.click();
      };
      setOpen(false);
      bar.append(button);
      pane.after(bar);
      bankSearch = { bar, setOpen, home: group.parentElement };
    }
    if (document.body.classList.contains('osrs-bank-layout')) {
      bankSearch.bar.append(group);
      if (options.searchBar.value) bankSearch.setOpen(true);
    } else {
      bankSearch.home.append(group);
      bankSearch.setOpen(false);
    }
  }

  function showBankName(icon, name) {
    if (!icon.osrsName) {
      if (!name) return;
      icon.osrsName = document.createElement('span');
      icon.osrsName.className = 'osrs-bank-name';
      icon.quantity.parentElement.after(icon.osrsName);
    }
    if (icon.osrsName.textContent !== name) icon.osrsName.textContent = name;
  }

  ctx.patch(BankItemIconElement, 'updateQuantity').replace(function (updateQuantity, bankItem, enableAccessibility) {
    const classes = document.body.classList;
    const named = classes.contains('osrs-bank-layout') && (Boolean(enableAccessibility) || classes.contains('osrs-bank-names'));
    updateQuantity(bankItem, enableAccessibility && !named);
    this.classList.toggle('osrs-named', named);
    showBankName(this, named ? bankItem.item.name : '');
    if (!stacksOn()) {
      delete this.quantity.dataset.osrsStack;
      return;
    }
    const suffix = enableAccessibility && !named ? ` ${bankItem.item.name}` : '';
    const show = () => {
      const [text, colour] = osrsStack(bankItem.quantity);
      this.quantity.textContent = text + suffix;
      this.quantity.dataset.osrsStack = colour;
    };
    show();
    this.onmouseleave = show;
  });

  const sellLockedOn = () => document.body.classList.contains('osrs-sell-locked');
  const equippedAnywhere = (item) => Boolean(game.combat?.player?.checkEquipmentSetsForItem?.(item));
  const lockedSellable = (bankItem) => Math.max(0, bankItem.quantity - (equippedAnywhere(bankItem.item) ? 0 : 1));

  ctx.patch(Bank, 'sellItemOnClick').replace(function (sellItemOnClick, item, quantity) {
    const bankItem = this.items.get(item);
    if (bankItem?.locked && sellLockedOn()) quantity = Math.min(quantity, lockedSellable(bankItem));
    return sellItemOnClick(item, quantity);
  });

  ctx.patch(BankSelectedItemMenuElement, 'setItemLocked').after(function (_result, isLocked) {
    if (!this.osrsAllButOne) {
      this.osrsAllButOne = true;
      const allButOne = this.sellAllButOneButton.onclick;
      this.sellAllButOneButton.onclick = () => {
        allButOne();
        const bankItem = game.bank.selectedBankItem;
        if (bankItem?.locked && sellLockedOn() && equippedAnywhere(bankItem.item)) this.sellItemQuantitySlider.setSliderMode(2);
      };
    }
    const bankItem = game.bank?.selectedBankItem;
    if (isLocked && sellLockedOn() && bankItem && lockedSellable(bankItem) > 0) this.sellItemButton.disabled = false;
  });

  ctx.patch(BankSelectedItemMenuElement, 'updateItemQuantity').after(function (_result, bankItem) {
    if (bankItem.locked) this.setItemLocked(true);
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

  if (typeof OfflineProgressElement !== 'undefined') {
    ctx.patch(OfflineProgressElement, 'setMessages').after(function () {
      if (document.body.classList.contains('osrs-short-recap')) attempt('short recap', () => shortenRecapLines(this.messageContainer));
    });
  }

  if (typeof SlayerTaskMenuElement !== 'undefined') {
    ctx.patch(SlayerTaskMenuElement, 'setTaskMonster').after(function (_result, _monster, _killsLeft, category) {
      attempt('slayer master', () => showSlayerMaster(this, category));
    });
    ctx.patch(SlayerTaskMenuElement, 'setNoTask').after(function () {
      attempt('slayer master', () => showSlayerMaster(this, null));
    });
  }

  function showLevelProgress(skill) {
    const virtual = game.settings.showVirtualLevels;
    const level = virtual ? skill.virtualLevel : skill.level;
    const abyssalLevel = virtual ? skill.virtualAbyssalLevel : skill.abyssalLevel;
    const standard = levelProgress(skill.level, skill.currentLevelCap, skill.nextLevelProgress);
    const abyssal = levelProgress(skill.abyssalLevel, skill.currentAbyssalLevelCap, skill.nextAbyssalLevelProgress);
    const stones = document.body.classList.contains(STONES_CLASS);
    const onAbyssal = skill.shouldShowStandardLevels === false && skill.shouldShowAbyssalLevels === true;
    for (const { item, aside } of skillNav.getNavs(skill)) {
      mark(aside.level, PROGRESS_ATTRIBUTE, standard);
      mark(aside.abyssalLevel, PROGRESS_ATTRIBUTE, abyssal);
      mark(aside.level, LEVEL_ATTRIBUTE, String(level));
      mark(aside.level, CAP_ATTRIBUTE, String(skill.currentLevelCap));
      mark(aside.abyssalLevel, LEVEL_ATTRIBUTE, String(abyssalLevel));
      mark(aside.abyssalLevel, CAP_ATTRIBUTE, String(skill.currentAbyssalLevelCap));
      const name = item.nameEl?.textContent.trim() || skill.name;
      mark(item.rootEl, 'title', stones ? (standard ? `${name} ${standard}` : name) : null);
      const progress = onAbyssal ? (abyssal && skill.nextAbyssalLevelProgress) : (standard && skill.nextLevelProgress);
      const fraction = progress ? (Math.min(progress, 100) / 100).toFixed(3) : '';
      if (item.rootEl.style.getPropertyValue(PROGRESS_PROPERTY) !== fraction) item.rootEl.style.setProperty(PROGRESS_PROPERTY, fraction);
    }
  }

  function mark(element, attribute, text) {
    if (!element || element.getAttribute(attribute) === text) return;
    if (text === null) element.removeAttribute(attribute);
    else element.setAttribute(attribute, text);
  }

  if (typeof SkillNav !== 'undefined') {
    ctx.patch(Skill, 'renderXP').before(function () {
      if (this.renderQueue.xp) attempt('level progress', () => showLevelProgress(this));
    });
    ctx.patch(Skill, 'renderAbyssalXP').before(function () {
      if (this.renderQueue.abyssalXP) attempt('level progress', () => showLevelProgress(this));
    });
    for (const method of ['updateSkillLevel', 'updateAbyssalSkillLevel', 'updateLevelVisibility', 'updateAbyssalLevelVisibility']) {
      ctx.patch(SkillNav, method).after((_result, skill) => attempt('level progress', () => showLevelProgress(skill)));
    }
  }

  function addToGameSettings() {
    const darkMode = document.querySelector('[data-setting-id="darkMode"]');
    if (!darkMode || typeof darkMode.initialize !== 'function') return;
    const toggle = new darkMode.constructor();
    toggle.className = darkMode.className;
    toggle.setAttribute('data-size', darkMode.getAttribute('data-size') || 'small');
    toggle.initialize({ currentValue: section.get('enabled'), name: 'OSRS Theme' }, () => {
      const on = toggle.input.checked;
      section.set('enabled', on);
      apply(on);
    });
    darkMode.after(toggle);
    settingsSwitch = toggle;
    note('added the OSRS Theme switch next to Dark Mode');
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
  ctx.patch(Settings, 'toggleSetting').after(function (_result, setting) {
    note(`Melvor setting ${setting} turned ${safe(() => (this.boolData[setting].currentValue ? 'on' : 'off'))}`);
  });
  ctx.patch(Settings, 'changeChoiceSetting').replace(function (changeChoiceSetting, setting, value) {
    note(`Melvor setting ${setting} changed to ${value}`);
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
    note('character select loaded');
    const options = typeof game !== 'undefined' ? game.settings.choiceData[BACKGROUND_SETTING].options : [];
    if (!options.includes(backgrounds[0])) options.push(...backgrounds);
    [0, 500, 2000].forEach((delay) => setTimeout(markLoginLayers, delay));
    window.addEventListener('resize', onLoginResize);
  });
  ctx.onCharacterLoaded(() => {
    note('character loaded');
    attempt('abyssal lock', markAbyssalLock);
    showBackground(storedBackground());
    document.body.classList.remove('osrs-character-select');
    window.removeEventListener('resize', onLoginResize);
    loginScene.hide();
  });
  ctx.onInterfaceReady(() => {
    note('game screen ready');
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
    attempt('level progress', () => game.skills.forEach(showLevelProgress));
    attempt('accessibility defaults', followMelvorAccessibility);
    apply();
  });
}

function watchForHistory(note, screenText, deviceLog) {
  let screenTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(screenTimer);
    screenTimer = setTimeout(() => note(`screen changed: ${screenText()}`), SCREEN_SETTLE_MS);
  });
  document.addEventListener('visibilitychange', () => {
    note(`page ${document.hidden ? 'hidden' : 'visible'}`);
    if (document.hidden) deviceLog?.flush();
  });
  window.addEventListener('pagehide', () => {
    note('page closed or reloaded');
    deviceLog?.flush();
  });
  const lastErrors = new Map();
  const noteError = (kind, message, where) => {
    const key = `${kind} ${message}`;
    const seen = lastErrors.get(key);
    if (seen && Date.now() - seen.at < ERROR_REPEAT_MS) {
      seen.count++;
      return;
    }
    if (seen?.count) note(`(the last ${kind} repeated ${seen.count} more times)`);
    lastErrors.set(key, { at: Date.now(), count: 0 });
    note(`${kind}: ${message}${where ? ` at ${where}` : ''}`);
  };
  window.addEventListener('error', (event) => noteError('error', event.message, event.filename ? `${event.filename.split('/').pop()}:${event.lineno}` : ''));
  window.addEventListener('unhandledrejection', (event) => noteError('unhandled promise', describeError(event.reason), ''));
  if (typeof changePage === 'function') {
    const openPage = changePage;
    globalThis.changePage = function (page, ...rest) {
      note(`page: ${page?.id ?? page}`);
      return openPage.call(this, page, ...rest);
    };
  }
}

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

export function shortenRecapLines(container) {
  for (const line of container.querySelectorAll('h5')) {
    const text = line.firstChild;
    if (text?.nodeType !== 3) continue;
    const short = text.textContent.replace(RECAP_DROPPED, '').replace(RECAP_YOU, '');
    if (short !== text.textContent) text.textContent = short.charAt(0).toUpperCase() + short.slice(1);
  }
}

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

// The master fills the view's height, so its width follows; capped to a share of the box
export function fitSlayerMaster(view, image) {
  if (view.clientWidth) view.classList.toggle('osrs-master-narrow', view.clientWidth < SLAYER_MASTER_MIN_VIEW);
  if (!image.naturalHeight || !view.clientHeight) return;
  const width = Math.min(Math.ceil(view.clientHeight * image.naturalWidth / image.naturalHeight), Math.floor(view.clientWidth * SLAYER_MASTER_MAX_SHARE));
  if (view.style.getPropertyValue('--osrs-slayer-master-width') !== `${width}px`) view.style.setProperty('--osrs-slayer-master-width', `${width}px`);
}

export function watchSlayerMaster(view, image, win) {
  const fit = () => win.requestAnimationFrame(() => fitSlayerMaster(view, image));
  image.addEventListener('load', fit);
  if (typeof win.ResizeObserver !== 'undefined') new win.ResizeObserver(fit).observe(view);
}

export function levelProgress(level, levelCap, progress) {
  return level < levelCap ? `(${Math.floor(progress)}%)` : null;
}

export function osrsStack(quantity) {
  if (quantity < 100000) return [String(quantity), 'yellow'];
  if (quantity < 10000000) return [`${Math.floor(quantity / 1000)}K`, 'white'];
  return [`${Math.floor(quantity / 1000000)}M`, 'green'];
}
