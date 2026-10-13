const SECTION = 'Unlearned';
const SKILL_CATEGORIES = ['Combat', 'Passive', 'Non-Combat'];
const COMBAT_PAGE = 'melvorD:Combat';
const MAGIC = 'melvorD:Magic';
const HERBLORE = 'melvorD:Herblore';
const MOVED = 'unlearned-skills-moved';

function sidebarCategory(page) {
  return page.skillSidebarCategoryID || (page.id === COMBAT_PAGE ? 'Combat' : 'Non-Combat');
}

const keyOf = (categoryID, skillID) => `${categoryID}/${skillID}`;

export function setup(ctx) {
  ctx.loadStylesheet('style.css');
  const settings = ctx.settings.section('General');
  let section;
  const ranks = new Map();
  const copies = new Set();

  const showPotions = (hide = settings.get('hide-potions')) => {
    const herblore = game.skills.getObjectByID(HERBLORE);
    const button = document.getElementById('page-header-potions-dropdown');
    button?.parentElement?.classList.toggle(MOVED, Boolean(hide && herblore && !herblore.isUnlocked));
  };
  settings.add({
    type: 'switch',
    name: 'hide-potions',
    label: 'Hide the potion button until Herblore is learned',
    hint: 'The potion slot in the top bar stays hidden while Herblore is locked.',
    default: true,
    onChange: (value) => showPotions(value),
  });

  const copyBefore = (key) => [...copies].filter((other) => ranks.get(other) > ranks.get(key)).sort((a, b) => ranks.get(a) - ranks.get(b))[0];

  /** Each sidebar entry of a locked skill hides in place and a copy shows under Unlearned; clicking the copy clicks the original, so the game's own unlock prompt still opens. */
  const place = (skill) => {
    const navs = skillNav.navs.get(skill) || [];
    const pages = game.getPagesForSkill(skill) || [];
    navs.forEach((nav, index) => {
      const page = pages[index];
      if (!page) return;
      const key = keyOf(sidebarCategory(page), skill.id);
      const locked = !skill.isUnlocked;
      nav.item.rootEl?.classList.toggle(MOVED, locked);
      if (locked && !copies.has(key)) {
        const before = copyBefore(key);
        const aside = document.createElement('i');
        aside.className = 'fa fa-lock text-danger mr-1';
        section.item(key, {
          icon: skill.media,
          name: skill.id === MAGIC && page.id !== COMBAT_PAGE ? page.name : skill.name,
          nameClass: 'text-danger',
          aside,
          onClick: () => nav.item.click(),
          ...(before ? { before } : {}),
        });
        copies.add(key);
      } else if (!locked && copies.has(key)) {
        section.removeItem(key);
        copies.delete(key);
      }
    });
    section.rootEl?.classList.toggle('d-none', copies.size === 0);
  };

  ctx.patch(SkillNav, 'updateSkillLock').after((_result, skill) => {
    if (!section) return;
    place(skill);
    if (skill.id === HERBLORE) showPotions();
  });

  ctx.onInterfaceReady(() => {
    let rank = 0;
    for (const categoryID of SKILL_CATEGORIES) {
      for (const item of sidebar.category(categoryID).items()) ranks.set(keyOf(categoryID, item.id), rank++);
    }
    section = sidebar.category(SECTION, { toggleable: true, after: 'Non-Combat' });
    game.skills.forEach(place);
    showPotions();
  });
}
