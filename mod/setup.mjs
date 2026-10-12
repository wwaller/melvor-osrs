const SECTION = 'Character Preview';
const SPRITES_NAMESPACE = 'osrsSprites';
const CANVAS_HEIGHT = 320;
const DEFAULT_YAW = 128;
const STAGE_YAW = 1664;
const STAGE_HEIGHT = 260;
const SHADOW_WIDTH = 90;
const DRAG_TURN = 4;
const COLLAPSED_KEY = 'collapsed';
const CLIENT_TICK_MS = 20;
const HIDDEN_CHECK_MS = 1000;
const HAND_ITEM_OFFSET = 512;
const ROD_POSE = 623;
const ATTACK_RETRIGGER_MS = 100;
const THIEVING_STUNNED = 1;
const FISHING_POSES = {
  'melvorD:Raw_Shrimp': 621,
  'melvorD:Raw_Lobster': 619,
  'melvorD:Raw_Crab': 619,
  'melvorD:Raw_Swordfish': 618,
  'melvorD:Raw_Shark': 618,
  'melvorD:Raw_Whale': 618,
  'melvorD:Raw_Manta_Ray': 620,
};
const TOOL_POSES = {
  'melvorD:Axe': { none: 879, beyond: 2846, tiers: { Iron_Axe: 877, Steel_Axe: 875, Black_Axe: 873, Mithril_Axe: 871, Adamant_Axe: 869, Rune_Axe: 867, Dragon_Axe: 2846 } },
  'melvorD:Pickaxe': { none: 625, beyond: 7139, tiers: { Iron_Pickaxe: 626, Steel_Pickaxe: 627, Black_Pickaxe: 3873, Mithril_Pickaxe: 629, Adamant_Pickaxe: 628, Rune_Pickaxe: 624, Dragon_Pickaxe: 7139 } },
};
const RECIPE_POSES = {
  cooking: { default: 896, categories: { 'melvorD:Fire': 897 } },
  smithing: { default: 898, categories: { 'melvorD:Bars': 899 } },
  fletching: { default: 1248, categories: { 'melvorD:Arrows': 8480, 'melvorD:Javelins': 8480, 'melvorD:Bolts': 8472, 'melvorD:Crossbows': 4436 } },
  runecrafting: {
    default: 791,
    categories: { 'melvorF:StavesWands': 7531, 'melvorF:AirMagicGear': 1249, 'melvorF:WaterMagicGear': 1249, 'melvorF:EarthMagicGear': 1249, 'melvorF:FireMagicGear': 1249 },
  },
  crafting: {
    default: 1249,
    categories: { 'melvorF:Rings': 899, 'melvorF:Necklaces': 899, 'melvorItA:AbyssalRings': 899, 'melvorItA:AbyssalAmulets': 899, 'melvorF:Urns': 883 },
  },
};
const HERBLORE_POSE = 363;
const FIREMAKING_POSE = 733;
const PICKPOCKET_POSE = 881;
const STUNNED_POSE = 424;
const ATTACK_POSES = { cast: 711, bow: 426, crossbow: 4230, thrown: 929, punch: 422, slash: 390, stab: 386 };
const MELEE_WEAPON_POSES = [[/2h|godsword/i, 407], [/dagger/i, 376], [/axe/i, 395], [/mace|hammer|maul|flail/i, 401], [/spear|halberd/i, 386]];

export async function setup(ctx) {
  const { createRenderer, litPlayer, poseFrame, STAND_POSE } = await ctx.loadModule('character.mjs');
  ctx.loadStylesheet('style.css');
  const [index, base] = await Promise.all([ctx.loadData('data/index.json'), ctx.loadData('data/base.json')]);
  const itemFiles = new Map();
  const loadItem = (osrsId) => {
    if (!itemFiles.has(osrsId)) itemFiles.set(osrsId, ctx.loadData(`data/items/${osrsId}.json`).catch(() => null));
    return itemFiles.get(osrsId);
  };

  let panel = null;
  let canvas = null;
  let stageCanvas = null;
  const views = [];
  let data = null;
  let rest = null;
  let reference = null;
  let posed = null;
  let pose = STAND_POSE;
  let poseKey = '';
  let attack = null;
  let outfit = 0;
  let restOutfit = -1;
  const restCache = new Map();
  let frame = 0;
  let yaw = DEFAULT_YAW;
  let request = 0;
  let paintRequest = 0;
  let stepTimer = 0;

  ctx.settings.section(SECTION).add([
    {
      type: 'dropdown',
      name: 'body',
      label: 'Body type',
      hint: 'Which OSRS body the Character Preview wears your gear on.',
      default: 'male',
      options: [{ value: 'male', display: 'Male' }, { value: 'female', display: 'Female' }],
      onChange: () => setTimeout(changeOutfit),
    },
    {
      type: 'switch',
      name: 'combat',
      label: 'Show in the combat view',
      hint: 'While you fight, draws your character on the left of the monster, facing it, attacking when you attack.',
      default: true,
      onChange: () => setTimeout(() => {
        applyStage();
        rebuild();
      }),
    },
  ]);
  const stageOn = () => ctx.settings.section(SECTION).get('combat') !== false && game.combat?.isActive === true;

  const spritesLoaded = (() => {
    try {
      return Boolean(mod.getContext(SPRITES_NAMESPACE));
    } catch {
      return false;
    }
  })();
  const showsOsrsArt = (item) => {
    if (!spritesLoaded) return true;
    try {
      return mod.getContext({ url: item.media.split('#', 1)[0] }).namespace === SPRITES_NAMESPACE;
    } catch {
      return false;
    }
  };
  const osrsIdOf = (item) => index[String(item._media || '').split('?', 1)[0]];
  const wornOsrsIds = () => game.combat.player.equipment.equippedArray
    .filter((slot) => !slot.isEmpty && slot.occupiedBy === undefined && osrsIdOf(slot.item) !== undefined && showsOsrsArt(slot.item))
    .map((slot) => osrsIdOf(slot.item));

  const toolPose = (chainId) => {
    const { none, beyond, tiers } = TOOL_POSES[chainId];
    const chain = game.shop.upgradeChains.getObjectByID(chainId);
    const tool = chain && game.shop.getLowestUpgradeInChain(chain.rootUpgrade);
    return tool ? tiers[tool.localID] ?? beyond : none;
  };
  const recipePose = (skillName) => {
    const poses = RECIPE_POSES[skillName];
    return poses.categories[game[skillName].activeRecipe?.category?.id] ?? poses.default;
  };
  const skillPose = () => {
    if (game.combat?.isActive) return STAND_POSE;
    if (game.fishing?.isActive) return FISHING_POSES[game.fishing.activeFish?.product?.id] ?? ROD_POSE;
    if (game.woodcutting?.isActive) return toolPose('melvorD:Axe');
    if (game.mining?.isActive) return toolPose('melvorD:Pickaxe');
    for (const skillName of Object.keys(RECIPE_POSES)) if (game[skillName]?.isActive) return recipePose(skillName);
    if (game.herblore?.isActive) return HERBLORE_POSE;
    if (game.firemaking?.isActive) return FIREMAKING_POSE;
    if (game.thieving?.isActive) return game.thieving.stunState === THIEVING_STUNNED ? STUNNED_POSE : PICKPOCKET_POSE;
    return STAND_POSE;
  };
  /** The animation to show and a key that changes whenever it should start over: the player's latest attack, else the active skill. */
  const activePose = () => {
    if (attack && performance.now() < attack.until) return { pose: attack.pose, key: `attack-${attack.serial}` };
    const pose = base.poses[skillPose()] ? skillPose() : STAND_POSE;
    return { pose, key: String(pose) };
  };
  const attackPose = (player) => {
    if (player.attackType === 'magic') return ATTACK_POSES.cast;
    const weapon = player.equipment.equippedItems['melvorD:Weapon'];
    const name = weapon && !weapon.isEmpty ? weapon.item.name : '';
    if (player.attackType === 'ranged') {
      if (/crossbow/i.test(name)) return ATTACK_POSES.crossbow;
      return /knife|dart|javelin|throwing/i.test(name) ? ATTACK_POSES.thrown : ATTACK_POSES.bow;
    }
    if (!name) return ATTACK_POSES.punch;
    const match = MELEE_WEAPON_POSES.find(([pattern]) => pattern.test(name));
    if (match) return match[1];
    return /stab/i.test(player.attackStyle?.id ?? '') ? ATTACK_POSES.stab : ATTACK_POSES.slash;
  };
  const onPlayerAttack = (player) => {
    const now = performance.now();
    if (player !== game.combat.player || (attack && now - attack.started < ATTACK_RETRIGGER_MS)) return;
    const pose = attackPose(player);
    if (!base.poses[pose]) return;
    const ticks = base.poses[pose].lengths.reduce((sum, length) => sum + Math.max(1, length), 0);
    attack = { pose, serial: (attack?.serial ?? 0) + 1, started: now, until: now + ticks * CLIENT_TICK_MS };
    if (rest && anyShown()) rebuild();
  };
  const handItems = (poseId) => [base.poses[poseId].left, base.poses[poseId].right]
    .filter((value) => value >= HAND_ITEM_OFFSET)
    .map((value) => value - HAND_ITEM_OFFSET);

  const isOpen = () => panel && !panel.classList.contains('osrs-character-collapsed');
  const isShown = (view) => view.enabled() && view.canvas.clientWidth > 0 && !document.hidden;
  const anyShown = () => views.some(isShown);
  const paint = () => {
    paintRequest = 0;
    if (!posed) return;
    const ratio = window.devicePixelRatio || 1;
    for (const view of views.filter(isShown)) {
      view.canvas.width = Math.round(view.canvas.clientWidth * ratio);
      view.canvas.height = Math.round(view.height * ratio);
      const { ground, origin, scale, tilt } = view.renderer.draw(posed, { yaw: view.yaw(), reference });
      const pixels = (value) => `${Math.round(value / ratio)}px`;
      setStyleVariables(view.canvas.parentElement, {
        '--osrs-character-ground': pixels(view.canvas.height - ground),
        '--osrs-character-shadow-y': pixels(view.canvas.height - origin),
        '--osrs-character-shadow-width': pixels(SHADOW_WIDTH * scale),
        '--osrs-character-shadow-height': pixels(SHADOW_WIDTH * scale * tilt),
      });
    }
  };
  const queuePaint = () => {
    if (!paintRequest) paintRequest = requestAnimationFrame(paint);
  };
  const schedule = (delay) => {
    clearTimeout(stepTimer);
    stepTimer = setTimeout(step, delay);
  };
  /** Shows the current animation frame, holds it for its length in client ticks, then moves on, following the active skill. */
  function step() {
    if (activePose().key !== poseKey) {
      rebuild();
      return;
    }
    if (!rest) return;
    if (!anyShown()) {
      schedule(HIDDEN_CHECK_MS);
      return;
    }
    const { lengths } = base.poses[pose];
    posed = poseFrame(data, rest, pose, frame);
    queuePaint();
    const delay = Math.max(1, lengths[frame % lengths.length]) * CLIENT_TICK_MS;
    frame = (frame + 1) % lengths.length;
    schedule(delay);
  }
  function changeOutfit() {
    outfit++;
    rebuild();
  }
  async function rebuild() {
    clearTimeout(stepTimer);
    if (!views.some((view) => view.enabled())) {
      rest = null;
      return;
    }
    const id = ++request;
    const next = activePose();
    const osrsIds = wornOsrsIds();
    const needed = [...new Set([...osrsIds, ...handItems(next.pose)])];
    const files = await Promise.all(needed.map(loadItem));
    if (id !== request) return;
    data = { ...base, items: {}, models: { ...base.models } };
    files.forEach((file, i) => {
      if (!file) return;
      data.items[needed[i]] = file.item;
      Object.assign(data.models, file.models);
    });
    pose = next.pose;
    poseKey = next.key;
    frame = 0;
    if (restOutfit !== outfit) {
      restCache.clear();
      restOutfit = outfit;
    }
    const female = ctx.settings.section(SECTION).get('body') === 'female';
    const litFor = (poseId) => {
      const hands = `${base.poses[poseId].left},${base.poses[poseId].right}`;
      if (!restCache.has(hands)) restCache.set(hands, litPlayer(data, osrsIds, { female, pose: poseId }));
      return restCache.get(hands);
    };
    rest = litFor(pose);
    reference = poseFrame(data, litFor(STAND_POSE), STAND_POSE, 0);
    step();
  }

  const createPanel = () => {
    const element = document.createElement('div');
    element.id = 'osrs-character-preview';
    element.className = 'block block-rounded-double bg-combat-inner-dark text-center p-0 mb-2';
    element.innerHTML = `<div class="block-header block-header-default bg-dark-bank-block-header px-3 py-1 mb-1 pointer-enabled">
        <h5 class="font-size-sm font-w600 mb-0 w-100 text-center"><i class="fa text-muted mr-2 font-w300 fa-eye"></i>${SECTION}</h5>
      </div>
      <div class="px-2 pb-2"><canvas style="display:block;width:100%;height:${CANVAS_HEIGHT}px;touch-action:pan-y;cursor:grab"></canvas></div>`;
    return element;
  };

  const createStage = () => {
    const enemyImage = document.getElementById('combat-enemy-img');
    if (!enemyImage) return null;
    const stage = document.createElement('div');
    stage.id = 'osrs-character-combat-stage';
    stage.style.display = 'flex';
    stage.style.setProperty('--osrs-character-stage-height', `${STAGE_HEIGHT}px`);
    enemyImage.before(stage);
    const element = document.createElement('canvas');
    element.style.cssText = `flex:1 1 50%;min-width:0;height:${STAGE_HEIGHT}px`;
    stage.append(element, enemyImage);
    Object.assign(enemyImage.style, { flex: '1 1 50%', minWidth: '0' });
    return element;
  };
  function applyStage() {
    if (stageCanvas) stageCanvas.classList.toggle('d-none', !stageOn());
  }
  const refreshStage = () => {
    if (!stageCanvas) return;
    const wasShown = !stageCanvas.classList.contains('d-none');
    applyStage();
    if (stageOn() !== wasShown) rebuild();
  };

  const setCollapsed = (collapsed) => {
    panel.classList.toggle('osrs-character-collapsed', collapsed);
    panel.lastElementChild.classList.toggle('d-none', collapsed);
    panel.querySelector('.fa').classList.replace(collapsed ? 'fa-eye' : 'fa-eye-slash', collapsed ? 'fa-eye-slash' : 'fa-eye');
  };

  const enableDragToTurn = () => {
    let lastX = null;
    canvas.addEventListener('pointerdown', (event) => {
      lastX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (lastX === null) return;
      yaw = (yaw - Math.round((event.clientX - lastX) * DRAG_TURN)) & 2047;
      lastX = event.clientX;
      queuePaint();
    });
    const release = () => {
      lastX = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  };

  for (const method of ['onSelection', 'stop']) {
    ctx.patch(CombatManager, method).replace(function (original, ...args) {
      const result = original(...args);
      if (this === game.combat) refreshStage();
      return result;
    });
  }

  ctx.patch(Player, 'attack').replace(function (originalAttack, ...args) {
    const result = originalAttack(...args);
    if (this === game.combat.player) onPlayerAttack(this);
    return result;
  });

  ctx.onInterfaceReady(() => {
    const equipment = document.getElementById('combat-menu-0')?.querySelector(':scope > .block');
    if (!equipment) return;
    panel = createPanel();
    equipment.after(panel);
    setCollapsed(ctx.accountStorage.getItem(COLLAPSED_KEY) === true);
    panel.firstElementChild.addEventListener('click', () => {
      const collapsed = !panel.classList.contains('osrs-character-collapsed');
      setCollapsed(collapsed);
      ctx.accountStorage.setItem(COLLAPSED_KEY, collapsed);
      rebuild();
    });
    canvas = panel.querySelector('canvas');
    const renderer = createRenderer(canvas);
    if (!renderer) {
      canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'font-size-sm text-combat-smoke m-2', textContent: 'The Character Preview needs WebGL, which this device does not support.' }));
      return;
    }
    views.push({ canvas, renderer, height: CANVAS_HEIGHT, yaw: () => yaw, enabled: isOpen });
    enableDragToTurn();
    stageCanvas = createStage();
    const stageRenderer = stageCanvas && createRenderer(stageCanvas);
    if (stageRenderer) {
      views.push({ canvas: stageCanvas, renderer: stageRenderer, height: STAGE_HEIGHT, yaw: () => STAGE_YAW, enabled: stageOn });
      applyStage();
    } else {
      stageCanvas?.remove();
      stageCanvas = null;
    }
    for (const view of views) new ResizeObserver(queuePaint).observe(view.canvas);
    game.combat.player.on('equipmentChanged', changeOutfit);
    rebuild();
  });
}

function setStyleVariables(element, variables) {
  for (const [name, value] of Object.entries(variables)) {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }
}
