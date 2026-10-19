const CATEGORIES = ['Combat', 'Passive', 'Non-Combat'];
const COMBAT_PAGE = 'melvorD:Combat';
const ENEMY_PANEL = 'combat-fight-container-enemy';
const GRID_ICON = 'fas fa-th-large';
const SHORTCUT_PAGES = ['melvorD:Bank', 'melvorD:Shop'];
const ABOVE_SIDEBAR_CLASS = 'skill-switcher-above-sidebar';
const TOP_SIDE_CLASS = 'skill-switcher-top-side';
const TOP_POSITIONS = [
  { value: 'stack', display: 'Above the menu button' },
  { value: 'arrow', display: 'Above the down arrow' },
  { value: 'side', display: 'Left of the down arrow, or of the switcher' },
];
const LONG_PRESS_MS = 500;
const TIP_KEY = 'long-press-tip-shown';
const TIP_MS = 6000;
const TIP_EARLIEST_MS = 2 * 60 * 1000;
const TIP_LATEST_MS = 10 * 60 * 1000;
const TIP_GAP_PX = 6;

export function skillEntries(sidebarAPI, gameAPI) {
  const entries = [];
  for (const categoryID of CATEGORIES) {
    for (const item of sidebarAPI.category(categoryID).items()) {
      const classes = item.rootEl?.classList;
      if (classes?.contains('d-none')) continue;
      const dimmed = Boolean(classes?.contains('opacity-50'));
      if (categoryID === 'Combat') {
        if (entries.some((entry) => entry.page.id === COMBAT_PAGE)) continue;
        const page = gameAPI.pages.getObjectByID(COMBAT_PAGE);
        if (page) entries.push({ page, skill: undefined, name: page.name, media: page.media, dimmed });
        continue;
      }
      const skill = gameAPI.skills.getObjectByID(item.id);
      const page = skill && (gameAPI.getPagesForSkill(skill) || []).find((candidate) => sidebarCategory(candidate) === categoryID);
      if (!page) continue;
      entries.push({ page, skill, name: skill.id === 'melvorD:Magic' ? page.name : skill.name, media: skill.media, dimmed });
    }
  }
  return entries;
}

function sidebarCategory(page) {
  return page.skillSidebarCategoryID || (page.id === COMBAT_PAGE ? 'Combat' : 'Non-Combat');
}

const isActive = (entry) => entry.page.action?.isActive === true;

function showFight() {
  const enemy = document.getElementById(ENEMY_PANEL);
  if (!enemy) return;
  const header = document.getElementById('page-header');
  const covered = header && ['fixed', 'sticky'].includes(getComputedStyle(header).position) ? header.getBoundingClientRect().height : 0;
  window.scrollTo({ top: enemy.getBoundingClientRect().top + window.scrollY - covered });
}

export function setup(ctx) {
  ctx.loadStylesheet('style.css');
  const settings = ctx.settings.section('General');
  let menuButton;
  let topButton;
  const aboveSidebar = (on) => {
    document.body.classList.toggle(ABOVE_SIDEBAR_CLASS, Boolean(on));
  };
  settings.add([
    { type: 'switch', name: 'bank-and-shop', label: 'Bank and Shop in the bottom row', hint: 'Adds the Bank and Shop next to your active skills.', default: false },
    {
      type: 'switch',
      name: 'menu-button',
      label: 'Menu button above the switcher',
      hint: 'Adds a button above the skill switcher that opens the sidebar, so you do not have to reach the top left.',
      default: false,
      onChange: (on) => {
        menuButton?.classList.toggle('d-none', !on);
      },
    },
    {
      type: 'switch',
      name: 'top-button',
      label: 'Jump to Top button',
      hint: 'Adds an up arrow above the menu button (or above the skill switcher) that scrolls back to the top of the page.',
      default: true,
      onChange: (on) => {
        topButton?.classList.toggle('d-none', !on);
      },
    },
    {
      type: 'dropdown',
      name: 'top-position',
      label: 'Jump to Top position',
      hint: 'Where the up arrow sits: at the top of the stack, between the skill switcher and the minibar\'s down arrow, or to the left of the down arrow (to the left of the skill switcher where there is no down arrow).',
      default: 'stack',
      options: TOP_POSITIONS,
      onChange: (position) => {
        if (button) place(position);
      },
    },
    {
      type: 'switch',
      name: 'above-sidebar',
      label: 'Keep these buttons over the sidebar on mobile',
      hint: 'On small screens the sidebar covers the whole page. This keeps the switcher (and the menu and Jump to Top buttons) showing on top of it, to switch skills or close it from the corner.',
      default: false,
      onChange: aboveSidebar,
    },
  ]);
  let button;
  let icon;
  let floating;
  let flyout;

  const entries = () => skillEntries(sidebar, game);

  const activeEntry = () => entries().find(isActive);

  const goTo = (entry) => {
    changePage(entry.page, -1, entry.skill, false, false);
    if (!window.matchMedia('(min-width: 992px)').matches && document.getElementById('page-container')?.classList.contains('sidebar-o-xs')) One.layout('sidebar_close');
    if (entry.page.id === COMBAT_PAGE && isActive(entry)) showFight();
  };

  let tip = null;
  const hideTip = () => {
    tip?.remove();
    tip = null;
  };
  const scheduleTip = () => setTimeout(showTip, TIP_EARLIEST_MS + Math.random() * (TIP_LATEST_MS - TIP_EARLIEST_MS));
  function showTip() {
    if (ctx.accountStorage.getItem(TIP_KEY)) return;
    const box = button.getBoundingClientRect();
    if (!activeEntry() || flyout.state.isVisible || box.width === 0) {
      scheduleTip();
      return;
    }
    ctx.accountStorage.setItem(TIP_KEY, true);
    const beside = topButton.classList.contains(TOP_SIDE_CLASS) && topButton.nextElementSibling === button && topButton.getClientRects().length ? topButton.getBoundingClientRect() : box;
    tip = Object.assign(document.createElement('div'), { className: 'skill-switcher-tip', textContent: 'Try long pressing instead!' });
    Object.assign(tip.style, { top: `${box.top + box.height / 2}px`, right: `${window.innerWidth - beside.left + TIP_GAP_PX}px` });
    document.body.append(tip);
    setTimeout(hideTip, TIP_MS);
  }

  const showButtonIcon = () => {
    const active = activeEntry();
    icon.replaceChildren(active ? Object.assign(document.createElement('img'), { className: 'skill-icon-xs m-0', src: active.media }) : Object.assign(document.createElement('i'), { className: `${GRID_ICON} text-white` }));
  };

  const tile = (entry) => {
    const tileButton = document.createElement('button');
    tileButton.type = 'button';
    tileButton.className = 'btn btn-sm skill-switcher-tile';
    if (isActive(entry)) tileButton.classList.add('skill-switcher-active');
    if (game.openPage === entry.page) tileButton.classList.add('skill-switcher-current');
    if (entry.dimmed) tileButton.classList.add('skill-switcher-dimmed');
    tileButton.title = entry.name;
    tileButton.setAttribute('aria-label', entry.name);
    tileButton.append(Object.assign(document.createElement('img'), { src: entry.media, alt: '' }));
    tileButton.onclick = () => {
      flyout.hide();
      goTo(entry);
    };
    return tileButton;
  };

  const flyoutContent = () => {
    const all = entries();
    const panel = document.createElement('div');
    panel.className = 'skill-switcher';
    const grid = document.createElement('div');
    grid.className = 'skill-switcher-grid';
    grid.append(...all.filter((entry) => !isActive(entry)).map(tile));
    panel.append(grid);
    const shortcuts = settings.get('bank-and-shop')
      ? SHORTCUT_PAGES.map((id) => game.pages.getObjectByID(id)).filter(Boolean).map((page) => ({ page, skill: undefined, name: page.name, media: page.media, dimmed: false }))
      : [];
    const bottom = [...all.filter(isActive), ...shortcuts];
    if (bottom.length) {
      const row = document.createElement('div');
      row.className = 'skill-switcher-grid skill-switcher-active-row';
      row.append(...bottom.map(tile));
      panel.append(row);
    }
    return panel;
  };

  // Sits above the minibar's collapse arrow so it stays visible when the minibar is folded away.
  const place = (position = settings.get('top-position')) => {
    const container = document.getElementById('skill-footer-minibar-container');
    const minibarShown = container !== null && !container.classList.contains('d-none');
    if (minibarShown) container.insertBefore(button, container.lastElementChild);
    else floating.append(button);
    button.before(menuButton);
    const arrowShown = minibarShown && container.lastElementChild.getClientRects().length > 0;
    if (position === 'arrow' || (position === 'side' && arrowShown)) button.after(topButton);
    else if (position === 'side') button.before(topButton);
    else menuButton.before(topButton);
    topButton.classList.toggle(TOP_SIDE_CLASS, position === 'side');
    floating.classList.toggle('d-none', minibarShown);
    showButtonIcon();
  };

  ctx.patch(Minibar, 'setSkill').after(() => {
    if (button) place();
  });
  ctx.patch(Game, 'renderActiveSkills').replace(function (renderActiveSkills) {
    const changed = this.renderQueue.activeSkills;
    renderActiveSkills();
    if (changed && button) showButtonIcon();
  });

  ctx.onInterfaceReady(() => {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-light skill-switcher-button';
    button.setAttribute('aria-label', 'Switch skill');
    icon = document.createElement('span');
    button.append(icon);
    let pressTimer = 0;
    let longPressed = false;
    button.addEventListener('pointerdown', () => {
      longPressed = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        const active = activeEntry();
        if (!active) return;
        longPressed = true;
        ctx.accountStorage.setItem(TIP_KEY, true);
        flyout.hide();
        goTo(active);
      }, LONG_PRESS_MS);
    });
    for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, () => clearTimeout(pressTimer));
    button.addEventListener('click', (event) => {
      if (!longPressed) return;
      longPressed = false;
      event.stopImmediatePropagation();
    }, true);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    menuButton = document.createElement('button');
    menuButton.type = 'button';
    menuButton.className = 'btn btn-sm btn-light skill-switcher-menu';
    menuButton.setAttribute('aria-label', 'Toggle the sidebar');
    menuButton.append(Object.assign(document.createElement('i'), { className: 'fas fa-bars text-white' }));
    menuButton.onclick = () => One.layout('sidebar_toggle');
    menuButton.classList.toggle('d-none', !settings.get('menu-button'));
    topButton = document.createElement('button');
    topButton.type = 'button';
    topButton.className = 'btn btn-sm btn-light skill-switcher-top';
    topButton.setAttribute('aria-label', 'Jump to top');
    topButton.title = 'Jump to Top';
    topButton.append(Object.assign(document.createElement('i'), { className: 'fas fa-arrow-up text-white' }));
    topButton.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    topButton.classList.toggle('d-none', !settings.get('top-button'));
    floating = document.createElement('div');
    floating.className = 'sidemenu bg-white rounded skill-switcher-float d-none';
    (document.getElementById('page-container') ?? document.body).append(floating);
    aboveSidebar(settings.get('above-sidebar'));
    flyout = tippy(button, {
      content: '',
      trigger: 'click',
      interactive: true,
      placement: 'left-end',
      animation: false,
      maxWidth: 'none',
      appendTo: () => document.body,
      onShow: (instance) => {
        hideTip();
        instance.setContent(flyoutContent());
      },
    });
    place();
    scheduleTip();
  });
}
