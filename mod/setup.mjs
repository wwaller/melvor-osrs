const HIGHLIGHT_CLASS = 'active-first-highlight';
const ACTIVE_CLASS = 'active-first-active';

const SKILLS = [
  { id: 'melvorD:Woodcutting', cards: () => woodcuttingMenu.treeMenus, active: (skill) => [...skill.activeTrees] },
  { id: 'melvorD:Fishing', cards: () => fishingAreaMenus, active: (skill) => [skill.activeFishingArea] },
  { id: 'melvorD:Mining', cards: () => rockMenus, active: (skill) => [skill.selectedRock] },
  { id: 'melvorD:Thieving', cards: () => thievingMenu.areaPanels, active: (skill) => [skill.currentArea] },
  { id: 'melvorD:Astrology', cards: () => astrologyMenus.constellations, active: (skill) => [skill.studiedConstellation] },
  { id: 'melvorItA:Harvesting', cards: () => veinMenus, active: (skill) => [skill.selectedVein] },
  { id: 'melvorAoD:Archaeology', cards: () => archaeologyMenus.digSites, active: (skill) => [skill.currentDigSite] },
];

function registry(spec) {
  try {
    return spec.cards();
  } catch (e) {
    return undefined;
  }
}

// Tree cards keep a hidden Locked block ahead of the real one.
function shownBlock(card) {
  const hidden = (block) => {
    for (let node = block; node && node !== card.parentElement; node = node.parentElement) if (node.classList.contains('d-none')) return true;
    return false;
  };
  return [...card.querySelectorAll('.block')].find((block) => !hidden(block)) ?? card;
}

function pinner(spec) {
  const homes = new Map();
  const outlined = new Map();

  const pin = (cards, active) => {
    for (const [card, home] of homes) {
      if (active.includes(card)) continue;
      if (home.parentNode) home.replaceWith(card);
      homes.delete(card);
    }
    const container = active.find((card) => card.parentElement)?.parentElement;
    if (!container) return false;
    const cardSet = new Set(cards.values());
    let next = [...container.children].find((child) => cardSet.has(child));
    let changed = false;
    for (const card of active) {
      if (card.parentElement !== container) continue;
      if (!homes.has(card)) {
        const home = document.createComment('');
        card.before(home);
        homes.set(card, home);
        changed = true;
      }
      if (card === next) next = card.nextElementSibling;
      else container.insertBefore(card, next);
    }
    return changed;
  };

  const outline = (cards) => {
    for (const [card, block] of outlined) {
      if (cards.includes(card) && block === shownBlock(card)) continue;
      block.classList.remove(ACTIVE_CLASS);
      outlined.delete(card);
    }
    for (const card of cards) {
      if (outlined.has(card)) continue;
      const block = shownBlock(card);
      block.classList.add(ACTIVE_CLASS);
      outlined.set(card, block);
    }
  };

  return {
    show(cards, active) {
      const changed = pin(cards, active);
      outline(active);
      return changed;
    },
  };
}

export function setup(ctx) {
  ctx.loadStylesheet('style.css');
  const settings = ctx.settings.section('General');
  const highlight = (on) => {
    document.body.classList.toggle(HIGHLIGHT_CLASS, Boolean(on));
  };
  let scrollOnChange = false;
  const scrollSetting = (on) => {
    scrollOnChange = Boolean(on);
  };
  settings.add([
    { type: 'switch', name: 'highlight', label: 'Yellow border on the active card', hint: 'Draws a thin yellow border around the card in use.', default: false, onChange: highlight },
    { type: 'switch', name: 'scroll-to-active', label: 'Scroll to the active card when it changes', hint: 'When you start a different target, scrolls up so its card, now at the front of the list, sits at the top of the screen.', default: false, onChange: scrollSetting },
  ]);
  const pinners = new Map();
  let started = false;

  const scrollToCard = (card) => {
    const header = document.getElementById('page-header');
    const covered = header && ['fixed', 'sticky'].includes(getComputedStyle(header).position) ? header.getBoundingClientRect().height : 0;
    card.style.scrollMarginTop = `${covered}px`;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sync = () => {
    if (typeof game === 'undefined' || !game.skills) return;
    for (const spec of SKILLS) {
      const skill = game.skills.getObjectByID(spec.id);
      const cards = registry(spec);
      if (!skill || !cards) continue;
      if (!pinners.has(spec.id)) pinners.set(spec.id, pinner(spec));
      const active = skill.isActive ? spec.active(skill).map((action) => action && cards.get(action)).filter(Boolean) : [];
      const changed = pinners.get(spec.id).show(cards, active);
      if (changed && started && scrollOnChange && active[0]?.offsetParent) scrollToCard(active[0]);
    }
  };

  ctx.onCharacterLoaded(() => {
    highlight(settings.get('highlight'));
    scrollSetting(settings.get('scroll-to-active'));
  });
  ctx.onInterfaceReady(() => {
    sync();
    started = true;
    ctx.patch(Game, 'render').after(sync);
  });
}
