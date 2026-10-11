const THEME_CLASS = 'osrs-theme';
const FEATURES = [
  { name: 'shadows', label: 'Black text shadow', hint: 'OSRS draws all interface text with a 1px black shadow.' },
  { name: 'bevels', label: 'Bevelled stone borders', hint: 'Panels, buttons and tabs get a light top-left edge and a dark bottom-right edge.' },
  { name: 'tooltips', label: 'OSRS-style tooltips', hint: 'Translucent brown hover boxes with a thin border, like RuneLite.' },
  { name: 'hp-bars', label: 'OSRS health bars', hint: 'Green over red for your hitpoints and the enemy\'s.' },
  { name: 'texture', label: 'Stone texture', hint: 'A faint speckled stone texture behind panels and the sidebar.' },
  { name: 'stacks', label: 'OSRS bank stack colours', hint: 'Yellow under 100K, white with a K up to 10M, green with an M after that.' },
  { name: 'hitsplats', label: 'OSRS hitsplats', hint: 'Damage numbers on red hitsplats, blue for a miss, green for poison, and so on.' },
  { name: 'login', label: 'OSRS login background', hint: 'The classic OSRS login art behind character select, with the braziers burning.' },
  { name: 'cards', label: 'Stone character select cards', hint: 'Save slots look like the stone OSRS login box.' },
];
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
};

export async function setup(ctx) {
  ctx.loadStylesheet('theme.css');
  for (const [property, path] of Object.entries(ASSETS)) document.documentElement.style.setProperty(property, `url("${ctx.getResourceUrl(path)}")`);
  const section = ctx.settings.section('General');
  const { createLoginScene } = await ctx.loadModule('fire.mjs');
  const { createRecolorer } = await ctx.loadModule('palette.mjs');
  const loginScene = createLoginScene(document, window);
  const recolorer = createRecolorer(window);
  let settingsSwitch = null;
  let minibar = null;

  section.add([
    { type: 'switch', name: 'enabled', label: 'OSRS Theme', hint: 'Old School RuneScape colours. Also in Settings, next to Dark Mode. Turning it off turns everything below off too.', default: true, onChange: (value) => later(() => apply(value)) },
    ...FEATURES.map((feature) => ({ type: 'switch', default: true, ...feature, onChange: () => later(apply) })),
    { type: 'button', name: 'debug', display: 'Copy theme debug info', color: 'secondary', onClick: showDebugInfo },
  ]);

  function showDebugInfo() {
    const root = document.getElementById('combat-footer-minibar');
    const describe = (element) => {
      const style = window.getComputedStyle(element);
      return [element.tagName.toLowerCase(), element.id, String(element.className || ''), element.getAttribute('style') || '', style.backgroundColor, style.backgroundImage.slice(0, 60), style.borderTopColor].join(' | ');
    };
    const lines = [`body: ${document.body.className}`, `minibar found: ${Boolean(root)}`, ...(root ? [root, ...root.querySelectorAll('*')].slice(0, 80).map(describe) : [])];
    const box = document.createElement('textarea');
    box.className = 'form-control font-size-sm';
    box.rows = 12;
    box.value = lines.join('\n');
    SwalLocale.fire({ title: 'Theme debug info', html: box, didOpen: () => box.select() });
    if (navigator.clipboard) navigator.clipboard.writeText(box.value).catch(() => {});
  }

  function later(fn) {
    setTimeout(fn);
  }

  function apply(on = section.get('enabled')) {
    document.body.classList.toggle(THEME_CLASS, on);
    for (const feature of FEATURES) document.body.classList.toggle(`osrs-${feature.name}`, on && section.get(feature.name));
    if (settingsSwitch) settingsSwitch.setChecked(on);
    const atLogin = document.body.classList.contains('osrs-login') && document.body.classList.contains('osrs-character-select');
    if (atLogin) loginScene.show();
    else loginScene.hide();
    if (minibar && on) recolorer.recolor(minibar);
    else recolorer.clear();
    refreshBank();
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

  ctx.patch(SplashManager, 'add').replace(function (add, splash) {
    if (hitsplatsOn() && typeof game !== 'undefined' && !game._isInOnlineLoop) return undefined;
    return add(splash);
  });

  ctx.patch(SplashManager, 'render').replace(function (render) {
    if (hitsplatsOn() && this.container.offsetParent === null) {
      this.queue = [];
      return undefined;
    }
    return render();
  });

  ctx.patch(SplashManager, 'renderSplash').replace(function (renderSplash, splash) {
    const result = renderSplash(splash);
    const element = this.container.lastElementChild;
    if (!element || !document.body.classList.contains('osrs-hitsplats')) return result;
    const isMiss = splash.text !== undefined && splash.text === getLangString('COMBAT_MISC_MISS');
    if (splash.text !== undefined && !isMiss) {
      element.classList.add('osrs-text');
    } else {
      element.textContent = formatNumber(Math.abs(splash.amount));
      if (splash.amount === 0) element.classList.add('osrs-zero');
    }
    return result;
  });

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
      if (element.id === 'osrs-login-scene') continue;
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
  ctx.onCharacterSelectionLoaded(() => {
    [0, 500, 2000].forEach((delay) => setTimeout(markLoginLayers, delay));
    window.addEventListener('resize', onLoginResize);
  });
  ctx.onCharacterLoaded(() => {
    document.body.classList.remove('osrs-character-select');
    window.removeEventListener('resize', onLoginResize);
    loginScene.hide();
  });
  ctx.onInterfaceReady(() => {
    addToGameSettings();
    watchMinibar();
    apply();
  });
}

export function osrsStack(quantity) {
  if (quantity < 100000) return [String(quantity), 'yellow'];
  if (quantity < 10000000) return [`${Math.floor(quantity / 1000)}K`, 'white'];
  return [`${Math.floor(quantity / 1000000)}M`, 'green'];
}
