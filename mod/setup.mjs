const CATEGORIES = ['Combat', 'Passive', 'Non-Combat'];
const COMBAT_PAGE = 'melvorD:Combat';
const GRID_ICON = 'fas fa-th-large';
const SHORTCUT_PAGES = ['melvorD:Bank', 'melvorD:Shop'];

/** Every skill page in the sidebar's order, with Combat as one entry; skips what the sidebar hides and keeps what it dims. */
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

export function setup(ctx) {
  ctx.loadStylesheet('style.css');
  const settings = ctx.settings.section('General');
  settings.add({ type: 'switch', name: 'bank-and-shop', label: 'Bank and Shop in the bottom row', hint: 'Adds the Bank and Shop next to your active skills.', default: false });
  let button;
  let icon;
  let floating;
  let flyout;

  const entries = () => skillEntries(sidebar, game);

  const showButtonIcon = () => {
    const active = entries().find(isActive);
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
      changePage(entry.page, -1, entry.skill, false, false);
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

  /** On skill pages, sit just above the minibar's collapse arrow so it shows even when the minibar is folded away; elsewhere, float in the same corner. */
  const place = () => {
    const container = document.getElementById('skill-footer-minibar-container');
    const minibarShown = container !== null && !container.classList.contains('d-none');
    if (minibarShown) container.insertBefore(button, container.lastElementChild);
    else floating.append(button);
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
    floating = document.createElement('div');
    floating.className = 'sidemenu bg-white rounded skill-switcher-float d-none';
    document.body.append(floating);
    flyout = tippy(button, {
      content: '',
      trigger: 'click',
      interactive: true,
      placement: 'left-end',
      animation: false,
      maxWidth: 'none',
      appendTo: () => document.body,
      onShow: (instance) => instance.setContent(flyoutContent()),
    });
    place();
  });
}
