const LAST_KEY = 'last';
const FIGHT_KEY = 'fight';
const START_CLASS = 'mobile-combat-start-on';
const JUMP_CLASS = 'mobile-combat-jump-on';
const AREA_GRID_CLASS = 'mobile-combat-area-grid-on';
const STYLES_MOVE_CLASS = 'mobile-combat-styles-on';
const CORNER_CLASS = 'mobile-combat-corner-on';
const SWITCHER_LOOKUP_MS = 1000;
const FIGHT_SCROLL_CLASS = 'mobile-combat-fight-scroll-on';
const HIDE_HP_CLASS = 'mobile-combat-hide-hp-on';
const HP_BAR_CLASS = 'mobile-combat-hp-bar';
const HIDE_FOOD_CLASS = 'mobile-combat-hide-food-on';
const FOOD_SECTION_CLASS = 'mobile-combat-food-section';
const CORNER_MENUS = [
  { tab: 0, label: 'Equipment', element: 'combat-menu-0', media: 'assets/media/bank/armour_helmet_bronze.png' },
  { tab: 1, label: 'Spellbook', element: 'combat-menu-1', media: 'assets/media/skills/combat/spellbook.png', skill: 'altMagic', active: (player) => (player.attackType === 'magic' ? player.spellSelection.attack : undefined) },
  { tab: 2, label: 'Prayer', element: 'combat-menu-2', media: 'assets/media/skills/prayer/prayer.png', skill: 'prayer', active: (player) => player.activePrayers.values().next().value, count: (player) => player.prayerPoints },
  { tab: 5, label: 'Slayer', element: 'combat-slayer-task-menu', media: 'assets/media/skills/slayer/slayer.png', count: () => (game.combat.slayerTask?.active ? game.combat.slayerTask.killsLeft : undefined) },
];
const OPEN_CARD_CLASS = 'mobile-combat-area-open';
const UNMET_CARD_CLASS = 'mobile-combat-area-unmet';
const AREA_TITLE_CLASS = 'mobile-combat-area-title';
const AREA_DETAILS_CLASS = 'mobile-combat-area-details';

const oneTarget = (current, startMethod) => ({
  remember: (skill) => [current(skill)?.id],
  recall: (skill, [id]) => {
    const action = skill.actions.getObjectByID(id);
    return action && { name: action.name, media: action.media, start: () => skill[startMethod](action) };
  },
});

const recipeSkill = (id, page, selected, select, start) => ({
  id,
  page,
  remember: (skill) => [selected(skill)?.id],
  recall: (skill, [recipeID]) => {
    const recipe = skill.actions.getObjectByID(recipeID);
    return recipe && {
      name: recipe.name,
      media: recipe.media,
      start: () => {
        if (selected(skill) !== recipe) skill[select](recipe);
        skill[start]();
      },
    };
  },
});

const SKILLS = [
  {
    id: 'melvorD:Woodcutting',
    cards: () => woodcuttingMenu.treeMenus,
    remember: (skill) => [...skill.activeTrees].map((tree) => tree.id),
    recall: (skill, ids) => {
      const trees = ids.map((id) => skill.actions.getObjectByID(id)).filter(Boolean);
      return trees.length > 0 && {
        name: trees.map((tree) => tree.name).join(' & '),
        media: trees[0].media,
        start: () => trees.forEach((tree) => skill.activeTrees.has(tree) || skill.selectTree(tree)),
      };
    },
  },
  {
    id: 'melvorD:Fishing',
    cards: () => fishingAreaMenus,
    remember: (skill) => [skill.activeFishingArea?.id],
    recall: (skill, [id]) => {
      const area = skill.areas.getObjectByID(id);
      const fish = area && skill.selectedAreaFish.get(area);
      return area && { name: fish?.name ?? area.name, media: fish?.media, start: () => skill.onAreaStartButtonClick(area) };
    },
  },
  { id: 'melvorD:Mining', cards: () => rockMenus, ...oneTarget((skill) => skill.selectedRock, 'onRockClick') },
  {
    id: 'melvorD:Thieving',
    cards: () => thievingMenu.areaPanels,
    remember: (skill) => [skill.currentArea?.id, skill.currentNPC?.id],
    recall: (skill, [areaID, npcID]) => {
      const area = skill.areas.getObjectByID(areaID);
      const npc = skill.actions.getObjectByID(npcID);
      return area && npc && { name: npc.name, media: npc.media, start: () => skill.startThieving(area, npc) };
    },
  },
  {
    id: 'melvorD:Astrology',
    cards: () => astrologyMenus.constellations,
    ...oneTarget((skill) => skill.studiedConstellation, 'studyConstellationOnClick'),
  },
  { id: 'melvorItA:Harvesting', cards: () => veinMenus, ...oneTarget((skill) => skill.selectedVein, 'onVeinClick') },
  { id: 'melvorAoD:Archaeology', cards: () => archaeologyMenus.digSites, ...oneTarget((skill) => skill.currentDigSite, 'startDigging') },
  {
    id: 'melvorD:Cooking',
    page: 'cooking-container',
    remember: (skill) => [skill.activeCookingCategory && skill.selectedRecipes.get(skill.activeCookingCategory)?.id],
    recall: (skill, [recipeID]) => {
      const recipe = skill.actions.getObjectByID(recipeID);
      return recipe && {
        name: recipe.name,
        media: recipe.media,
        start: () => {
          if (skill.selectedRecipes.get(recipe.category) !== recipe) skill.onRecipeSelectionClick(recipe);
          skill.onActiveCookButtonClick(recipe.category);
        },
      };
    },
  },
  recipeSkill('melvorD:Firemaking', 'firemaking-container', (skill) => skill.selectedRecipe, 'selectLog', 'burnLog'),
  ...['Smithing', 'Fletching', 'Crafting', 'Runecrafting', 'Herblore', 'Summoning'].map((name) => recipeSkill(`melvorD:${name}`, `${name.toLowerCase()}-container`, (skill) => skill.selectedRecipe, 'selectRecipeOnClick', 'createButtonOnClick')),
  recipeSkill('melvorD:Magic', 'magic-container', (skill) => skill.selectedSpell, 'selectSpellOnClick', 'castButtonOnClick'),
];

function registry(spec) {
  try {
    return spec.cards();
  } catch (e) {
    return undefined;
  }
}

function launcher(title, style = 'btn-success') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-lg ${style} btn-block mobile-combat-start`;
  button.innerHTML = '<span class="mobile-combat-start-line"><span class="mobile-combat-start-title"></span><img class="mobile-combat-start-icon"></span><small class="mobile-combat-start-name"></small>';
  button.querySelector('.mobile-combat-start-title').textContent = title;
  let start = null;
  button.addEventListener('click', () => start?.());
  return {
    button,
    show(target) {
      start = target.start;
      const name = button.querySelector('.mobile-combat-start-name');
      if (name.textContent !== target.name) name.textContent = target.name;
      const icon = button.querySelector('.mobile-combat-start-icon');
      if (target.media && icon.getAttribute('src') !== target.media) icon.src = target.media;
      icon.classList.toggle('d-none', !target.media);
    },
  };
}

function fightOf(combat) {
  const area = combat.selectedArea;
  if (!area || combat.activeEvent !== undefined) return undefined;
  if (game.strongholds?.getObjectByID(area.id)) return [area.id, combat.strongholdTier];
  if (game.dungeons?.getObjectByID(area.id) || game.abyssDepths?.getObjectByID(area.id)) return [area.id];
  return combat.selectedMonster && [area.id, combat.selectedMonster.id];
}

function recallFight([areaID, detail]) {
  const area = game.combatAreas.getObjectByID(areaID);
  if (!area) return undefined;
  if (game.strongholds?.getObjectByID(areaID)) return { name: area.getTierName?.(detail) ?? area.name, media: area.media, start: () => game.combat.selectStronghold(area, detail) };
  if (game.abyssDepths?.getObjectByID(areaID)) return { name: area.name, media: area.media, start: () => game.combat.selectAbyssDepth(area) };
  if (game.dungeons?.getObjectByID(areaID)) return { name: area.name, media: area.media, start: () => game.combat.selectDungeon(area) };
  const monster = game.monsters.getObjectByID(detail);
  return monster && { name: monster.name, media: monster.media, start: () => game.combat.selectMonster(monster, area) };
}

function starter(spec) {
  let section;
  let start;

  const build = () => {
    section = document.createElement('div');
    section.className = 'col-12 mobile-combat-start-section';
    start = launcher('Start Last Target');
    section.append(start.button);
  };

  const place = (cards) => {
    if (!cards) {
      const skillInfo = document.getElementById(spec.page)?.querySelector(':scope > .skill-info');
      if (skillInfo && skillInfo.nextElementSibling !== section) {
        section.className = 'mobile-combat-start-section mobile-combat-start-page';
        skillInfo.after(section);
      }
      return;
    }
    const container = [...cards.values()].find((card) => card.parentElement)?.parentElement;
    const cardSet = new Set(cards.values());
    const firstCard = container && [...container.children].find((child) => cardSet.has(child));
    if (firstCard && section.nextElementSibling !== firstCard) container.insertBefore(section, firstCard);
  };

  return {
    show(cards, skill, last) {
      if (skill.isActive || !last) {
        section?.classList.toggle('d-none', true);
        return;
      }
      if (!section) build();
      place(cards);
      start.show(last);
      section.classList.toggle('d-none', false);
    },
  };
}

export function setup(ctx) {
  ctx.loadStylesheet('style.css');
  const settings = ctx.settings.section('General');
  const bodySwitch = (className) => (on) => {
    document.body.classList.toggle(className, Boolean(on));
  };
  const switches = { 'start-last-target': bodySwitch(START_CLASS), 'jump-to-last': bodySwitch(JUMP_CLASS), 'compact-area-select': bodySwitch(AREA_GRID_CLASS), 'attack-styles-under-enemy': bodySwitch(STYLES_MOVE_CLASS), 'combat-menu-buttons': bodySwitch(CORNER_CLASS), 'scroll-on-area-fight': bodySwitch(FIGHT_SCROLL_CLASS), 'hide-hp-bars': bodySwitch(HIDE_HP_CLASS), 'hide-food': bodySwitch(HIDE_FOOD_CLASS) };
  settings.add([
    { type: 'switch', name: 'start-last-target', label: 'Start Last Target', hint: 'On a skill page while the skill is idle, a button ahead of its cards (or under the skill header) to start the last target again.', default: true, onChange: switches['start-last-target'] },
    { type: 'switch', name: 'jump-to-last', label: 'Jump To Last section', hint: 'On the combat page, a section above your Player panel with a button to fight the last enemy again once a fight ends.', default: true, onChange: switches['jump-to-last'] },
    { type: 'switch', name: 'compact-area-select', label: 'Compact Area Select', hint: 'Made for mobile. Shows the area types as a 2x2 grid in place of the Select Combat Area dropdown (the open one in red, pressed again to hide its areas), and each area as just its art and name, two to a row and dimmed if you cannot enter it yet. An opened area shows its full card and enemies across the whole width.', default: true, onChange: switches['compact-area-select'] },
    { type: 'switch', name: 'attack-styles-under-enemy', label: 'Attack Styles above the enemy stats', hint: 'Made for mobile. Moves the Attack Style section to just above the Offensive Stats of the enemy, so you can switch without scrolling back up. It is the same section, moved, so buttons other mods add to it come along.', default: false, onChange: switches['attack-styles-under-enemy'] },
    { type: 'switch', name: 'combat-menu-buttons', label: 'Combat buttons in the corner', hint: 'On the combat page, adds Equipment, Spellbook, Prayer and Slayer buttons in the bottom right, above the Skill Switcher buttons if you have that mod. Each switches to that menu, unfolds your side of the page if it is folded away, and scrolls to it. Prayer and Spellbook show the prayer you have on and the spell you are casting, with your prayer points under Prayer and the kills left on your Slayer task under Slayer. While you fight on a narrow screen, a button with the enemy on top scrolls down to the fight.', default: true, onChange: switches['combat-menu-buttons'] },
    { type: 'switch', name: 'scroll-on-area-fight', label: 'Scroll to Combat after picking an enemy', hint: 'When you start a fight from an area card (a monster, dungeon or stronghold), scrolls down to the fight.', default: true, onChange: switches['scroll-on-area-fight'] },
    { type: 'switch', name: 'hide-hp-bars', label: 'Hide the HP bars and attack intervals on the combat page', hint: 'Hides your HP bar, the enemy HP and barrier bars, and both attack interval timers (your familiar one too) on the combat page, since the combat minibar already shows them. The HP numbers stay.', default: false, onChange: switches['hide-hp-bars'] },
    { type: 'switch', name: 'hide-food', label: 'Hide the Food section on the combat page', hint: 'Hides the Food section on the combat page, since the combat minibar already has your food.', default: false, onChange: switches['hide-food'] },
  ]);
  const starters = new Map();
  let last = {};
  let fight;
  let combatButtons;
  let jump;
  let areasTagged = false;
  let stylesSection;
  let corner;
  let cornerFloat;
  let cornerFight;
  let cornerMenus;
  let prayerPoints;
  let hpBarsTagged = false;
  let foodTagged = false;
  let fightKey;

  const rememberTarget = (spec, skill) => {
    const ids = spec.remember?.(skill);
    if (!ids || ids.length === 0 || ids.some((id) => id === undefined)) return;
    if (JSON.stringify(last[spec.id]) === JSON.stringify(ids)) return;
    last = { ...last, [spec.id]: ids };
    ctx.characterStorage.setItem(LAST_KEY, last);
  };
  const lastTarget = (spec, skill) => {
    const ids = last[spec.id];
    try {
      return ids && spec.recall ? spec.recall(skill, ids) || undefined : undefined;
    } catch (e) {
      return undefined;
    }
  };

  const sync = () => {
    if (typeof game === 'undefined' || !game.skills) return;
    for (const spec of SKILLS) {
      const skill = game.skills.getObjectByID(spec.id);
      const cards = spec.cards ? registry(spec) : undefined;
      if (!skill || (spec.cards && !cards)) continue;
      if (!starters.has(spec.id)) starters.set(spec.id, starter(spec));
      if (skill.isActive) rememberTarget(spec, skill);
      starters.get(spec.id).show(cards, skill, skill.isActive ? undefined : lastTarget(spec, skill));
    }
    if (game.combat) {
      showJump(game.combat);
      closeAreasOnFight(game.combat);
      showPrayerPoints();
    }
    showCompactAreas();
    moveAttackStyles();
    showCorner();
    tagHpBars();
    tagFood();
  };

  const tagFood = () => {
    if (foodTagged) return;
    const food = document.getElementById('combat-food-select')?.closest('.block');
    if (!food) return;
    food.classList.add(FOOD_SECTION_CLASS);
    foodTagged = true;
  };

  const tagHpBars = () => {
    if (hpBarsTagged) return;
    const playerBar = document.getElementById('combat-player-hitpoints-bar')?.parentElement;
    const enemyBar = document.getElementById('combat-enemy-hitpoints-bar')?.parentElement;
    if (!playerBar || !enemyBar) return;
    const playerSpacer = playerBar.parentElement?.previousElementSibling;
    const timers = ['player', 'enemy'].map((side) => document.getElementById(`combat-progress-attack-${side}`)?.parentElement);
    const bars = [playerBar, enemyBar, document.getElementById('combat-enemy-barrier-container'), playerSpacer?.classList.contains('invisible') ? playerSpacer : null, ...timers];
    for (const bar of bars) bar?.classList.add(HP_BAR_CLASS);
    hpBarsTagged = true;
  };

  const scrollUnderHeader = (element) => {
    const header = document.getElementById('page-header');
    const covered = header && ['fixed', 'sticky'].includes(getComputedStyle(header).position) ? header.getBoundingClientRect().height : 0;
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - covered, behavior: 'smooth' });
  };

  const openCombatMenu = ({ tab, element }) => {
    const player = document.getElementById('combat-player-container');
    if (player?.classList.contains('d-mobile-none')) togglePlayerContainer();
    const target = document.getElementById(element);
    if (!target) return;
    const panel = target.closest(`#combat-menu-${tab}`);
    if (!panel) {
      scrollUnderHeader(target);
      return;
    }
    changeCombatMenu(tab);
    if (panel.classList.contains('d-none')) return;
    scrollUnderHeader(document.getElementById(`combat-menu-item-${tab}`)?.closest('.block') ?? panel);
  };

  let switcher = null;
  let switcherLookedAt = -Infinity;
  // Page-wide query, so throttled until the button turns up.
  const skillSwitcher = () => {
    if (switcher?.isConnected) return switcher;
    const now = performance.now();
    if (now - switcherLookedAt < SWITCHER_LOOKUP_MS) return null;
    switcherLookedAt = now;
    switcher = document.querySelector('.skill-switcher-button');
    return switcher;
  };

  const menuIcon = (menu) => document.getElementById(`combat-menu-item-${menu.tab}`)?.src || (typeof assets === 'undefined' ? menu.media : assets.getURI(menu.media));
  const fighter = () => (game.isGolbinRaid ? game.golbinRaid : game.combat).player;
  const setText = (element, text) => {
    if (element.textContent !== text) element.textContent = text;
  };

  const showPrayerPoints = () => {
    if (!prayerPoints?.isConnected) {
      const heading = document.querySelector('#combat-prayer-book-menu h5');
      if (!heading) return;
      prayerPoints = Object.assign(document.createElement('small'), { className: 'ml-1 text-success' });
      heading.append(prayerPoints);
    }
    setText(prayerPoints, numberWithCommas(fighter().prayerPoints));
  };

  const showCorner = () => {
    if (!corner) {
      if (!document.body.classList.contains(CORNER_CLASS)) return;
      corner = document.createElement('div');
      corner.className = 'mobile-combat-corner';
      cornerFight = document.createElement('button');
      cornerFight.type = 'button';
      cornerFight.className = 'btn btn-sm btn-light mobile-combat-corner-button mobile-combat-corner-fight d-none';
      cornerFight.title = 'Scroll to Combat';
      cornerFight.setAttribute('aria-label', 'Scroll to Combat');
      cornerFight.append(Object.assign(document.createElement('img'), { className: 'skill-icon-xs m-0' }));
      cornerFight.addEventListener('click', scrollToCombat);
      corner.append(cornerFight);
      cornerMenus = CORNER_MENUS.map((menu) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-light mobile-combat-corner-button';
        button.title = menu.label;
        button.setAttribute('aria-label', menu.label);
        const icon = Object.assign(document.createElement('img'), { className: 'skill-icon-xs m-0', src: menuIcon(menu) });
        button.append(icon);
        const count = menu.count && Object.assign(document.createElement('span'), { className: 'mobile-combat-corner-count' });
        if (count) button.append(count);
        button.classList.toggle('mobile-combat-corner-counted', Boolean(count));
        button.addEventListener('click', () => openCombatMenu(menu));
        corner.append(button);
        return { menu, button, icon, count };
      });
      cornerFloat = document.createElement('div');
      cornerFloat.className = 'sidemenu bg-white rounded mobile-combat-corner-float d-none';
      (document.getElementById('page-container') ?? document.body).append(cornerFloat);
    }
    if (game.openPage?.id !== 'melvorD:Combat') {
      corner.classList.toggle('d-none', true);
      cornerFloat.classList.toggle('d-none', true);
      return;
    }
    const switcher = skillSwitcher();
    const minibar = document.getElementById('skill-footer-minibar-container');
    let parent = cornerFloat;
    let before = null;
    if (switcher?.parentElement) {
      parent = switcher.parentElement;
      before = [...parent.children].find((child) => child.matches('.skill-switcher-top, .skill-switcher-menu, .skill-switcher-button'));
    } else if (minibar && !minibar.classList.contains('d-none')) {
      parent = minibar;
      before = minibar.lastElementChild;
    }
    if (corner.parentElement !== parent || corner.nextElementSibling !== before) parent.insertBefore(corner, before);
    corner.classList.toggle('d-none', false);
    cornerFloat.classList.toggle('d-none', parent !== cornerFloat);
    const player = fighter();
    for (const { menu, button, icon, count } of cornerMenus) {
      if (menu.skill) button.classList.toggle('d-none', !game[menu.skill].isUnlocked && !game.isGolbinRaid);
      if (menu.active) {
        const media = menu.active(player)?.media ?? menuIcon(menu);
        if (icon.dataset.media !== media) {
          icon.dataset.media = media;
          icon.src = media;
        }
      }
      if (count) {
        const value = menu.count(player);
        setText(count, value === undefined ? '' : formatNumber(value));
        button.classList.toggle('mobile-combat-corner-counted', value !== undefined);
      }
    }
    const enemyMedia = game.combat?.isActive && !game.golbinRaid?.isActive ? game.combat.selectedMonster?.media : undefined;
    cornerFight.classList.toggle('d-none', !enemyMedia);
    const enemyIcon = cornerFight.firstElementChild;
    if (enemyMedia && enemyIcon.getAttribute('src') !== enemyMedia) enemyIcon.src = enemyMedia;
  };

  const moveAttackStyles = () => {
    const styles = document.getElementById('combat-attack-styles');
    if (!styles) return;
    if (!document.body.classList.contains(STYLES_MOVE_CLASS)) {
      if (stylesSection?.contains(styles)) document.getElementById(typeof isOnMobileLayout !== 'undefined' && isOnMobileLayout ? 'combat-menu-0' : 'desktop-combat-menus')?.append(styles);
      return;
    }
    if (!stylesSection) {
      const enemyStats = document.getElementById('combat-enemy-offensive-stats')?.parentElement?.closest('.col-12');
      if (!enemyStats) return;
      stylesSection = document.createElement('div');
      stylesSection.className = 'col-12 mobile-combat-styles-section';
      stylesSection.append(Object.assign(document.createElement('div'), { className: 'block-content pt-0 w-100 px-2 px-1-mobile' }));
      enemyStats.before(stylesSection);
    }
    if (styles.parentElement !== stylesSection.firstElementChild) stylesSection.firstElementChild.append(styles);
  };

  const fightKeyOf = (combat) => (combat?.isActive ? JSON.stringify(fightOf(combat) ?? null) : undefined);

  const closeAreasOnFight = (combat) => {
    const key = fightKeyOf(combat);
    if (key === fightKey) return;
    fightKey = key;
    if (key === undefined || !document.body.classList.contains(AREA_GRID_CLASS)) return;
    if (typeof combatAreaMenus !== 'undefined' && combatAreaMenus.open !== undefined) combatAreaMenus.closeOpen();
  };

  const showCompactAreas = () => {
    if (typeof combatAreaMenus === 'undefined' || !combatAreaMenus.all?.size) return;
    if (!areasTagged) {
      const menu = document.getElementById('combat-area-category-menu');
      if (!menu?.expandDiv) return;
      menu.expandButton?.parentElement?.classList.add('mobile-combat-area-dropdown');
      menu.expandDiv.classList.add('mobile-combat-area-types');
      let infoCard;
      const compactOn = () => document.body.classList.contains(AREA_GRID_CLASS);
      for (const areaMenu of combatAreaMenus.all.values()) {
        areaMenu.container.classList.add('mobile-combat-compact-areas');
        areaMenu.container.addEventListener('click', (event) => {
          const card = event.target.closest?.('combat-area-menu');
          infoCard = compactOn() && card?.isOpen && event.target.closest('[data-toggle="dropdown"], .dropdown-menu') ? card : undefined;
          const before = fightKeyOf(game.combat);
          setTimeout(() => {
            if (!document.body.classList.contains(FIGHT_SCROLL_CLASS) || !game.combat?.isActive || fightKeyOf(game.combat) === before) return;
            closeAreasOnFight(game.combat);
            scrollToCombat();
          });
        }, true);
        areaMenu.container.addEventListener('click', () => {
          if (infoCard && !infoCard.isOpen) infoCard.openButton.onclick?.();
          infoCard = undefined;
          setTimeout(showCompactAreas);
        });
      }
      areasTagged = true;
    }
    for (const card of combatAreaMenus.all.get(combatAreaMenus.open)?.menuElems?.values() ?? []) {
      card.classList.toggle(OPEN_CARD_CLASS, card.isOpen === true);
      card.classList.toggle(UNMET_CARD_CLASS, Boolean(card.entryRequirements?.querySelector('.text-danger') || (card.lockedContainer && !card.lockedContainer.classList.contains('d-none'))));
      card.areaName?.parentElement?.classList.toggle(AREA_TITLE_CLASS, true);
      card.unlockedContainer?.classList.toggle(AREA_DETAILS_CLASS, true);
      shortenDifficulty(card, document.body.classList.contains(AREA_GRID_CLASS) && card.isOpen !== true);
    }
  };

  const shortenDifficulty = (card, short) => {
    for (const badge of card.areaName?.parentElement?.querySelectorAll('.badge') ?? []) {
      const full = badge.dataset.mobileCombatFull ?? badge.textContent.trim();
      if (!full) continue;
      if (badge.dataset.mobileCombatFull !== full) badge.dataset.mobileCombatFull = full;
      const text = short ? Array.from(full)[0] : full;
      if (badge.textContent !== text) badge.textContent = text;
      const title = short ? full : '';
      if (badge.title !== title) badge.title = title;
    }
  };

  const scrollToCombat = () => {
    const enemy = document.getElementById('combat-fight-container-enemy');
    if (enemy) scrollUnderHeader(enemy);
  };

  const showJump = (combat) => {
    const now = combat.isActive ? fightOf(combat) : undefined;
    if (now && JSON.stringify(now) !== JSON.stringify(fight)) {
      fight = now;
      ctx.characterStorage.setItem(FIGHT_KEY, fight);
    }
    const player = document.getElementById('combat-fight-container-player');
    if (!player) return;
    if (!combatButtons) {
      combatButtons = document.createElement('div');
      combatButtons.className = 'col-12 px-0 mobile-combat-jump';
      jump = launcher('Jump To Last');
      combatButtons.append(jump.button);
    }
    if (combatButtons.nextElementSibling !== player) player.before(combatButtons);
    let target;
    try {
      target = !combat.isActive && !game.golbinRaid?.isActive && fight ? recallFight(fight) : undefined;
    } catch (e) {
      target = undefined;
    }
    combatButtons.classList.toggle('d-none', !target);
    if (target) jump.show(target);
  };

  ctx.onCharacterLoaded(() => {
    for (const [name, apply] of Object.entries(switches)) apply(settings.get(name));
    last = ctx.characterStorage.getItem(LAST_KEY) || {};
    fight = ctx.characterStorage.getItem(FIGHT_KEY) || undefined;
  });
  ctx.onInterfaceReady(() => {
    sync();
    ctx.patch(Game, 'render').after(sync);
    ctx.loadModule('conflicts.mjs').then(({ warnAboutConflicts }) => warnAboutConflicts(ctx, 'Better Mobile Combat UI'));
  });
}
