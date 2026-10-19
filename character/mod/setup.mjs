const SECTION = 'Character Preview';
const SPRITES_NAMESPACE = 'osrsSprites';
const OSRS_ART_NAMESPACES = new Set([SPRITES_NAMESPACE, 'osrsRandomEvents']);
const CANVAS_HEIGHT = 320;
const DEFAULT_YAW = 128;
const STAGE_YAW = 1664;
const STAGE_HEIGHT = 260;
const OVERHEAD_ROOM = 30;
const MONSTER_SCALES = { XS: 0.4, S: 0.7, M: 1, L: 1.6, XL: 2.4 };
const MONSTER_TOP_ROOM = 8;
const MONSTER_SIDE_ROOM = 8;
const SIZED_CLASS = 'osrs-character-sized';
const BLOCK_DELAY_MS = 240;
const CHATHEAD_SIZE = 160;
const CHATHEAD_YAW = 256;
const CHATHEAD_FRAME = 0.36;
const CHATHEAD_DROP = 0.08;
const API_VERSION = 1;
const ART_ALPHA = 8;
const FULL_ART = { top: 0, bottom: 1, left: 0, right: 1 };
const OVERHEAD_PRAYERS = ['Protect_from_Melee', 'Protect_from_Ranged', 'Protect_from_Magic', 'Redemption', 'Retribution'];
const SHADOW_WIDTH = 90;
const DRAG_TURN = 4;
const COLLAPSED_KEY = 'collapsed';
const SIDEBAR_CATEGORY = 'osrsCharacter:Character';
const SIDEBAR_NAME = 'Character';
const SIDEBAR_HEIGHT = 210;
const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';
const TOP_CATEGORY = '';
const HAIR_PART = 0;
const SKIN_PART = 4;
const HIDEABLE_SLOTS = { hideHelm: 'melvorD:Helmet', hideCape: 'melvorD:Cape' };
const CLIENT_TICK_MS = 20;
const HIDDEN_CHECK_MS = 1000;
const PHONE_FRAME_MS = 60;
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
  const character = await ctx.loadModule('character.mjs');
  const { createRenderer, litPlayer, poseFrame, DEFAULT_COLORS, BODY_COLOR_COUNTS, STAND_POSE } = character;
  const { createMonsterStage } = await ctx.loadModule('monster.mjs');
  const [shared, api] = await Promise.all([ctx.loadModule('core/overhaul.mjs'), ctx.loadModule('core/api.mjs')]);
  shared.offerOverhaul(ctx);
  shared.dropOrphanedSongs();
  ctx.loadStylesheet('style.css');
  const [index, base, sizes, monsterFiles] = await Promise.all([ctx.loadData('data/index.json'), ctx.loadData('data/base.json'), ctx.loadData('sizes.json'), ctx.loadData('data/monsters.json').catch(() => ({}))]);
  const monsterSizes = new Map(Object.entries(sizes).flatMap(([size, ids]) => ids.map((id) => [id, size])));
  const itemFiles = new Map();
  const loadItem = (osrsId) => {
    if (!itemFiles.has(osrsId)) itemFiles.set(osrsId, ctx.loadData(`data/items/${osrsId}.json`).catch(() => null));
    return itemFiles.get(osrsId);
  };

  let panel = null;
  let sidebarCategory = null;
  let stageCanvas = null;
  let monsterStage = null;
  let overhead = null;
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
      type: 'dropdown',
      name: 'hairStyle',
      label: 'Hair style',
      hint: 'Which OSRS hairstyle your character has.',
      default: 0,
      options: numbered(Math.max(base.hair.male.length, base.hair.female.length)),
      onChange: () => setTimeout(changeOutfit),
    },
    {
      type: 'dropdown',
      name: 'hair',
      label: 'Hair colour',
      hint: 'Which OSRS hair colour your character has.',
      default: DEFAULT_COLORS[HAIR_PART],
      options: numbered(BODY_COLOR_COUNTS[HAIR_PART]),
      onChange: () => setTimeout(changeOutfit),
    },
    {
      type: 'dropdown',
      name: 'skin',
      label: 'Skin colour',
      hint: 'Which OSRS skin colour your character has.',
      default: DEFAULT_COLORS[SKIN_PART],
      options: numbered(BODY_COLOR_COUNTS[SKIN_PART]),
      onChange: () => setTimeout(changeOutfit),
    },
    {
      type: 'switch',
      name: 'hideHelm',
      label: 'Hide helm',
      hint: 'Draws your character without whatever is in the helmet slot.',
      default: false,
      onChange: () => setTimeout(changeOutfit),
    },
    {
      type: 'switch',
      name: 'hideCape',
      label: 'Hide cape',
      hint: 'Draws your character without whatever is in the cape slot.',
      default: false,
      onChange: () => setTimeout(changeOutfit),
    },
    {
      type: 'switch',
      name: 'equipment',
      label: 'Show under your equipment',
      hint: 'Draws the Character Preview below your worn gear on the Combat page.',
      default: true,
      onChange: () => setTimeout(() => {
        applyPlaces();
        rebuild();
      }),
    },
    {
      type: 'switch',
      name: 'sidebar',
      label: 'Show in the sidebar',
      hint: 'Adds a Character section under Shop and Bank, which its eye collapses.',
      default: true,
      onChange: () => setTimeout(() => {
        applyPlaces();
        rebuild();
      }),
    },
    {
      type: 'switch',
      name: 'nameplate',
      label: 'Show your name in the sidebar',
      hint: 'Floats your character name above the sidebar preview, like an OSRS nameplate.',
      default: true,
      onChange: () => setTimeout(applyPlaces),
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
    {
      type: 'switch',
      name: 'sizes',
      label: 'Monsters at their size',
      hint: 'In the combat view, each monster stands at its size next to your character: a Chicken comes up to your knee and a dragon towers over you, shrinking your character to fit. Off, the monster fills its half of the view as usual.',
      default: true,
      onChange: () => setTimeout(queuePaint),
    },
    {
      type: 'switch',
      name: 'monster-models',
      label: 'Monsters move',
      hint: 'With the OSRS Art mod, monsters with OSRS art become their OSRS models in the combat view: standing, attacking, blocking your hits and dying with their own OSRS animations. Off keeps the pictures.',
      default: true,
      onChange: () => setTimeout(queuePaint),
    },
  ]);
  const shownIn = (place) => ctx.settings.section(SECTION).get(place) !== false;
  const stageOn = () => shownIn('combat') && game.combat?.isActive === true;

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
      return OSRS_ART_NAMESPACES.has(mod.getContext({ url: item.media.split('#', 1)[0] }).namespace);
    } catch {
      return false;
    }
  };
  const osrsIdOf = (item) => index[String(item._media || '').split('?', 1)[0]];
  const hiddenSlots = () => Object.entries(HIDEABLE_SLOTS).filter(([setting]) => ctx.settings.section(SECTION).get(setting) === true).map(([, slotId]) => slotId);
  const wornOsrsIds = () => game.combat.player.equipment.equippedArray
    .filter((slot) => !hiddenSlots().includes(slot.slot?.id))
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
  const registeredSkillPoses = new Map();
  const skillPose = () => {
    if (game.combat?.isActive) return STAND_POSE;
    for (const [skillId, pose] of registeredSkillPoses) {
      const skill = game.skills.getObjectByID(skillId);
      if (skill?.isActive) return typeof pose === 'function' ? pose(skill) : pose;
    }
    if (game.fishing?.isActive) return FISHING_POSES[game.fishing.activeFish?.product?.id] ?? ROD_POSE;
    if (game.woodcutting?.isActive) return toolPose('melvorD:Axe');
    if (game.mining?.isActive) return toolPose('melvorD:Pickaxe');
    for (const skillName of Object.keys(RECIPE_POSES)) if (game[skillName]?.isActive) return recipePose(skillName);
    if (game.herblore?.isActive) return HERBLORE_POSE;
    if (game.firemaking?.isActive) return FIREMAKING_POSE;
    if (game.thieving?.isActive) return game.thieving.stunState === THIEVING_STUNNED ? STUNNED_POSE : PICKPOCKET_POSE;
    return STAND_POSE;
  };
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
    setTimeout(() => monsterStage?.block(), BLOCK_DELAY_MS);
  };
  const handItems = (poseId) => [base.poses[poseId].left, base.poses[poseId].right]
    .filter((value) => value >= HAND_ITEM_OFFSET)
    .map((value) => value - HAND_ITEM_OFFSET);

  const phone = onPhone();
  const isOpen = () => panel && !panel.classList.contains('osrs-character-collapsed');
  const isShown = (view) => view.enabled() && view.onScreen && view.canvas.clientWidth > 0 && !document.hidden;
  const anyShown = () => views.some(isShown);
  const paint = () => {
    paintRequest = 0;
    if (!posed) return;
    const ratio = window.devicePixelRatio || 1;
    for (const view of views.filter(isShown)) {
      const width = Math.round(view.canvas.clientWidth * ratio);
      const height = Math.round(view.height * ratio);
      if (view.canvas.width !== width) view.canvas.width = width;
      if (view.canvas.height !== height) view.canvas.height = height;
      const { ground, origin, scale, tilt, top, head } = view.renderer.draw(posed, { yaw: view.yaw(), headroom: (view.headroom ?? 0) * ratio, shrink: view.shrink ?? 1, reference });
      const pixels = (value) => `${Math.round(value / ratio)}px`;
      setStyleVariables(view.canvas.parentElement, {
        '--osrs-character-ground': pixels(view.canvas.height - ground),
        '--osrs-character-shadow-y': pixels(view.canvas.height - origin),
        '--osrs-character-shadow-width': pixels(SHADOW_WIDTH * scale),
        '--osrs-character-shadow-height': pixels(SHADOW_WIDTH * scale * tilt),
        '--osrs-character-head': pixels(top),
        '--osrs-character-crown': pixels(head.y),
        '--osrs-character-crown-x': `${Math.round(view.canvas.offsetLeft + head.x / ratio)}px`,
      });
      if (view.canvas === stageCanvas) sizeEnemy(view, ground, head, ratio);
    }
  };
  const artBoxes = new Map();
  const artBox = (src) => {
    if (!artBoxes.has(src)) {
      artBoxes.set(src, null);
      const probe = new Image();
      probe.crossOrigin = 'anonymous';
      probe.onload = () => {
        artBoxes.set(src, measureArt(probe));
        queuePaint();
      };
      probe.onerror = () => artBoxes.set(src, FULL_ART);
      probe.src = src;
    }
    return artBoxes.get(src);
  };
  const modelFor = (monster) => {
    const file = monster && monsterFiles[monster.id];
    return file && spritesLoaded && ctx.settings.section(SECTION).get('monster-models') !== false && showsOsrsArt(monster) ? file : null;
  };
  const placeMonster = (view, monster, groundGap, character, enabled) => {
    const body = monsterStage.body;
    const size = monsterSizes.get(monster.id) ?? 'M';
    const room = view.height - groundGap - MONSTER_TOP_ROOM;
    const reach = (body.height + body.lift) / body.height;
    const wanted = enabled ? character * MONSTER_SCALES[phone && size === 'XL' ? 'L' : size] : room / reach;
    const holder = document.getElementById('combat-enemy-img');
    const shrink = Math.min(1, room / (wanted * reach), (holder.clientWidth - MONSTER_SIDE_ROOM) / ((wanted * 2 * body.radius) / body.height));
    monsterStage.place({ fit: (wanted * shrink) / body.height, groundGap, height: view.height });
    return enabled ? shrink : 1;
  };
  const sizeEnemy = (view, ground, head, ratio) => {
    const stage = view.canvas.parentElement;
    const holder = document.getElementById('combat-enemy-img');
    const image = holder?.querySelector('img');
    const enabled = ctx.settings.section(SECTION).get('sizes') !== false;
    const current = game.combat.enemy?.monster ?? game.combat.selectedMonster;
    const file = monsterStage && modelFor(current);
    if (file && monsterStage.monster !== current.id) monsterStage.show(current.id, file);
    if (!file && monsterStage?.active) monsterStage.hide();
    if (file && monsterStage.monster === current.id) {
      stage.classList.remove(SIZED_CLASS);
      const groundGap = (view.canvas.height - ground) / ratio;
      const character = (ground - head.y) / ratio / (view.shrink ?? 1);
      const shrink = placeMonster(view, current, groundGap, character, enabled);
      if (Math.abs(shrink - (view.shrink ?? 1)) > 0.005) {
        view.shrink = shrink;
        queuePaint();
      }
      return;
    }
    const showing = enabled && image?.naturalHeight > 0;
    stage.classList.toggle(SIZED_CLASS, showing);
    if (!enabled && (view.shrink ?? 1) !== 1) {
      view.shrink = 1;
      queuePaint();
    }
    if (!showing) return;
    const box = artBox(image.src) ?? FULL_ART;
    const groundGap = (view.canvas.height - ground) / ratio;
    const character = (ground - head.y) / ratio / (view.shrink ?? 1);
    const monster = game.combat.enemy?.monster ?? game.combat.selectedMonster;
    const size = monsterSizes.get(monster?.id) ?? 'M';
    const wanted = character * MONSTER_SCALES[phone && size === 'XL' ? 'L' : size];
    const share = box.bottom - box.top;
    const widthPerHeight = ((box.right - box.left) * image.naturalWidth) / (share * image.naturalHeight);
    const shrink = Math.min(1, (view.height - groundGap - MONSTER_TOP_ROOM) / wanted, (holder.clientWidth - MONSTER_SIDE_ROOM) / (wanted * widthPerHeight));
    const imageHeight = (wanted * shrink) / share;
    setStyleVariables(stage, {
      '--osrs-enemy-height': `${imageHeight.toFixed(1)}px`,
      '--osrs-enemy-bottom': `${(groundGap - (1 - box.bottom) * imageHeight).toFixed(1)}px`,
      '--osrs-enemy-shift': `${(-50 * (box.left + box.right)).toFixed(2)}%`,
    });
    if (Math.abs(shrink - (view.shrink ?? 1)) > 0.005) {
      view.shrink = shrink;
      queuePaint();
    }
  };
  const queuePaint = () => {
    if (!paintRequest) paintRequest = requestAnimationFrame(paint);
  };
  const schedule = (delay) => {
    clearTimeout(stepTimer);
    stepTimer = setTimeout(step, delay);
  };
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
    let delay = 0;
    do {
      delay += Math.max(1, lengths[frame % lengths.length]) * CLIENT_TICK_MS;
      frame = (frame + 1) % lengths.length;
    } while (phone && delay < PHONE_FRAME_MS && frame !== 0);
    schedule(delay);
  }
  function changeOutfit() {
    outfit++;
    rebuild();
  }
  function look() {
    const settings = ctx.settings.section(SECTION);
    const female = settings.get('body') === 'female';
    const styles = base.hair[female ? 'female' : 'male'];
    const hairKit = styles[Math.min(Number(settings.get('hairStyle') ?? 0), styles.length - 1)];
    const colors = DEFAULT_COLORS.slice();
    colors[HAIR_PART] = Number(settings.get('hair') ?? colors[HAIR_PART]);
    colors[SKIN_PART] = Number(settings.get('skin') ?? colors[SKIN_PART]);
    return { female, kits: [hairKit], colors };
  }

  let chatheadCache = { key: null, url: null };
  async function chathead() {
    const osrsIds = wornOsrsIds();
    const appearance = look();
    const key = JSON.stringify([osrsIds, appearance]);
    if (chatheadCache.key === key) return chatheadCache.url;
    const files = await Promise.all(osrsIds.map(loadItem));
    const worn = { ...base, items: {}, models: { ...base.models } };
    files.forEach((file, i) => {
      if (!file) return;
      worn.items[osrsIds[i]] = file.item;
      Object.assign(worn.models, file.models);
    });
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = CHATHEAD_SIZE;
    const renderer = createRenderer(canvas);
    if (!renderer) return null;
    const model = poseFrame(worn, litPlayer(worn, osrsIds, { ...appearance, pose: STAND_POSE }), STAND_POSE, 0);
    const probe = renderer.draw(model, { yaw: CHATHEAD_YAW, place: { fit: 1, x: 0, ground: 0 } });
    const height = Math.max(1, probe.ground - probe.top);
    const fit = CHATHEAD_SIZE / (height * CHATHEAD_FRAME);
    const centre = probe.head.y + height * CHATHEAD_DROP;
    renderer.draw(model, { yaw: CHATHEAD_YAW, place: { fit, x: CHATHEAD_SIZE / 2 - probe.head.x * fit, ground: CHATHEAD_SIZE / 2 - centre * fit } });
    const url = canvas.toDataURL('image/png');
    canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext();
    chatheadCache = { key, url };
    return url;
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
    const appearance = look();
    const litFor = (poseId) => {
      const hands = `${base.poses[poseId].left},${base.poses[poseId].right}`;
      if (!restCache.has(hands)) restCache.set(hands, litPlayer(data, osrsIds, { ...appearance, pose: poseId }));
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
      <div class="px-2 pb-2 position-relative"><canvas style="display:block;width:100%;height:${CANVAS_HEIGHT}px;touch-action:pan-y;cursor:grab"></canvas></div>`;
    addSettingsGear(element.lastElementChild);
    return element;
  };

  const openSettings = () => sidebar.category('Modding').item('Mod Settings').subitems().find((subitem) => subitem.id === ctx.name)?.click();
  const addSettingsGear = (holder) => {
    const gear = Object.assign(document.createElement('i'), { className: 'fa fa-cog osrs-character-settings', title: `${SECTION} settings` });
    gear.setAttribute('role', 'button');
    gear.addEventListener('click', openSettings);
    holder.append(gear);
  };

  const createSidebar = () => {
    const order = sidebar.categories().map((category) => category.id);
    const next = order.includes(TOP_CATEGORY) ? order[order.indexOf(TOP_CATEGORY) + 1] : undefined;
    let holder = null;
    sidebarCategory = sidebar.category(SIDEBAR_CATEGORY, {
      name: SIDEBAR_NAME,
      toggleable: true,
      ...(next !== undefined ? { before: next } : {}),
      onRender: ({ toggleEl }) => toggleEl?.addEventListener('click', () => {
        ctx.accountStorage.setItem(SIDEBAR_COLLAPSED_KEY, !sidebarOpen());
        rebuild();
      }),
    });
    sidebarCategory.item('preview', {
      rootClass: 'osrs-character-sidebar',
      onRender: ({ rootEl }) => {
        holder = document.createElement('div');
        holder.className = 'px-2 pb-2 osrs-character-sidebar-stage';
        holder.innerHTML = `<canvas style="display:block;width:100%;height:${SIDEBAR_HEIGHT}px;touch-action:pan-y;cursor:grab"></canvas><span class="osrs-character-nameplate"></span>`;
        holder.lastElementChild.textContent = game.characterName ?? '';
        addSettingsGear(holder);
        rootEl.append(holder);
      },
    });
    if (ctx.accountStorage.getItem(SIDEBAR_COLLAPSED_KEY) === true) sidebarCategory.toggle(false);
    return holder?.querySelector('canvas') ?? null;
  };
  const sidebarOpen = () => !sidebarCategory?.toggleEl?.classList.contains('fa-eye-slash');
  function applyPlaces() {
    panel?.classList.toggle('d-none', !shownIn('equipment'));
    sidebarCategory?.rootEl?.classList.toggle('d-none', !shownIn('sidebar'));
    sidebarCategory?.rootEl?.querySelector('.osrs-character-nameplate')?.classList.toggle('d-none', !shownIn('nameplate'));
  }

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
    overhead = document.createElement('img');
    overhead.className = 'osrs-character-overhead d-none';
    overhead.alt = '';
    stage.append(element, enemyImage, overhead);
    Object.assign(enemyImage.style, { flex: '1 1 50%', minWidth: '0' });
    return element;
  };
  const showOverhead = () => {
    if (!overhead) return;
    const active = [...game.combat.player.activePrayers];
    const prayer = OVERHEAD_PRAYERS.find((id) => active.some((each) => each.localID === id));
    overhead.classList.toggle('d-none', !prayer);
    if (prayer && overhead.dataset.prayer !== prayer) {
      overhead.dataset.prayer = prayer;
      overhead.src = ctx.getResourceUrl(`overheads/${prayer}.png`);
    }
  };
  function applyStage() {
    if (stageCanvas) stageCanvas.classList.toggle('d-none', !stageOn());
  }
  const refreshStage = () => {
    if (!stageCanvas) return;
    const wasShown = !stageCanvas.classList.contains('d-none');
    applyStage();
    if (!stageOn()) {
      for (const view of views) view.shrink = 1;
      monsterStage?.hide();
    }
    if (stageOn() !== wasShown) rebuild();
  };

  const setCollapsed = (collapsed) => {
    panel.classList.toggle('osrs-character-collapsed', collapsed);
    panel.lastElementChild.classList.toggle('d-none', collapsed);
    panel.querySelector('.fa').classList.replace(collapsed ? 'fa-eye' : 'fa-eye-slash', collapsed ? 'fa-eye-slash' : 'fa-eye');
  };

  const enableDragToTurn = (canvas) => {
    let lastX = null;
    canvas.addEventListener('pointerdown', (event) => {
      lastX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
      blockSidebarSwipe(true);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (lastX === null) return;
      yaw = (yaw - Math.round((event.clientX - lastX) * DRAG_TURN)) & 2047;
      lastX = event.clientX;
      queuePaint();
    });
    const release = () => {
      lastX = null;
      setTimeout(() => blockSidebarSwipe(false));
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

  ctx.patch(Player, 'renderPrayerSelection').replace(function (original, ...args) {
    const changed = this.renderQueue.prayerSelection;
    const result = original(...args);
    if (changed && this === game.combat.player) showOverhead();
    return result;
  });

  api.publish(ctx, API_VERSION, {
    chathead,
    registerSkillPose(skillId, pose) {
      if (registeredSkillPoses.has(skillId)) throw new Error(`osrsCharacter: an animation is already registered for ${skillId}`);
      registeredSkillPoses.set(skillId, pose);
      return () => registeredSkillPoses.delete(skillId);
    },
    poses: Object.freeze({ stand: STAND_POSE, fishing: ROD_POSE, herblore: HERBLORE_POSE, firemaking: FIREMAKING_POSE, pickpocket: PICKPOCKET_POSE, stunned: STUNNED_POSE, ...ATTACK_POSES }),
    availablePoses: () => Object.keys(base.poses).map(Number),
    hasMonsterModel: (monsterId) => Boolean(monsterFiles[monsterId]),
  });

  ctx.patch(Character, 'attack').after(function (_result, _target, attack) {
    if (this === game.combat.enemy) monsterStage?.attack(attack !== game.normalAttack);
  });
  ctx.patch(Enemy, 'processDeath').after(function () {
    if (this === game.combat.enemy) monsterStage?.die();
  });
  ctx.patch(BaseManager, 'spawnEnemy').after(function () {
    if (this !== game.combat) return;
    monsterStage?.spawn();
    queuePaint();
  });

  ctx.patch(Player, 'attack').replace(function (originalAttack, ...args) {
    const result = originalAttack(...args);
    if (this === game.combat.player) onPlayerAttack(this);
    return result;
  });

  const addPreview = (canvas, height, enabled) => {
    const renderer = createRenderer(canvas, { antialias: !phone });
    if (!renderer) {
      canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'font-size-sm text-combat-smoke m-2', textContent: 'The Character Preview needs WebGL, which this device does not support.' }));
      return;
    }
    views.push({ canvas, renderer, height, yaw: () => yaw, enabled, onScreen: true });
    enableDragToTurn(canvas);
  };

  ctx.onInterfaceReady(() => {
    const equipment = document.getElementById('combat-menu-0')?.querySelector(':scope > .block');
    if (equipment) {
      panel = createPanel();
      equipment.after(panel);
      setCollapsed(ctx.accountStorage.getItem(COLLAPSED_KEY) === true);
      panel.firstElementChild.addEventListener('click', () => {
        const collapsed = !panel.classList.contains('osrs-character-collapsed');
        setCollapsed(collapsed);
        ctx.accountStorage.setItem(COLLAPSED_KEY, collapsed);
        rebuild();
      });
      addPreview(panel.querySelector('canvas'), CANVAS_HEIGHT, () => shownIn('equipment') && isOpen());
    }
    const sidebarCanvas = createSidebar();
    if (sidebarCanvas) addPreview(sidebarCanvas, SIDEBAR_HEIGHT, () => shownIn('sidebar') && sidebarOpen());
    applyPlaces();
    if (!views.length) return;
    stageCanvas = createStage();
    const stageRenderer = stageCanvas && createRenderer(stageCanvas, { antialias: !phone });
    if (stageRenderer) monsterStage = createMonsterStage({ character, loadData: (path) => ctx.loadData(path), stage: stageCanvas.parentElement, holder: document.getElementById('combat-enemy-img'), antialias: !phone, tickMs: CLIENT_TICK_MS, onReady: () => queuePaint() });
    if (stageRenderer) {
      views.push({ canvas: stageCanvas, renderer: stageRenderer, height: STAGE_HEIGHT, headroom: OVERHEAD_ROOM, yaw: () => STAGE_YAW, enabled: stageOn, onScreen: true });
      applyStage();
      showOverhead();
    } else {
      stageCanvas?.remove();
      stageCanvas = null;
    }
    const onScreen = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const view = views.find((candidate) => candidate.canvas === entry.target);
        if (view) view.onScreen = entry.isIntersecting;
      }
      if (rest) step();
    });
    for (const view of views) {
      new ResizeObserver(queuePaint).observe(view.canvas);
      onScreen.observe(view.canvas);
    }
    game.combat.player.on('equipmentChanged', changeOutfit);
    rebuild();
  });
}

const numbered = (count) => Array.from({ length: count }, (_, index) => ({ value: index, display: String(index + 1) }));

// Melvor toggles the mobile sidebar on a sideways swipe, which dragging the character also triggers.
function blockSidebarSwipe(blocked) {
  if (typeof disableSwipeEvents !== 'undefined') disableSwipeEvents = blocked;
}

function onPhone() {
  if (typeof nativeManager !== 'undefined' && nativeManager.isMobile) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

function measureArt(image) {
  const canvas = document.createElement('canvas');
  const width = (canvas.width = image.naturalWidth);
  const height = (canvas.height = image.naturalHeight);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  let pixels;
  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    return FULL_ART;
  }
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= ART_ALPHA) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? FULL_ART : { top: minY / height, bottom: (maxY + 1) / height, left: minX / width, right: (maxX + 1) / width };
}

function setStyleVariables(element, variables) {
  for (const [name, value] of Object.entries(variables)) {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }
}
