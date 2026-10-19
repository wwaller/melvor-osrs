const API_VERSION = 1;
const QUEST_FILES = [
  'quests/cooks-assistant.mjs', 'quests/restless-ghost.mjs', 'quests/rune-mysteries.mjs', 'quests/dorics-quest.mjs', 'quests/imp-catcher.mjs',
  'quests/vampyre-slayer.mjs', 'quests/ernest-the-chicken.mjs', 'quests/goblin-diplomacy.mjs', 'quests/black-knights-fortress.mjs', 'quests/dragon-slayer.mjs',
];
const CORE_FILES = ['core/overhaul.mjs', 'core/dialog.mjs', 'core/registry.mjs', 'core/api.mjs', 'core/fonts.mjs'];
const SECTION = 'Quests';
const SIDEBAR_CATEGORY = 'Quests';
const SIDEBAR_ITEM = 'Quest List';
const JINGLE_VOLUME = 0.5;

export async function setup(ctx) {
  const [shared, dialog, registry, api, fonts, engineModule, journalModule, ...questModules] = await Promise.all(
    [...CORE_FILES, 'engine.mjs', 'journal.mjs', ...QUEST_FILES].map((path) => ctx.loadModule(path)),
  );
  shared.offerOverhaul(ctx);
  shared.dropOrphanedSongs();
  ctx.loadStylesheet('core/dialog.css');
  ctx.loadStylesheet('style.css');
  fonts.loadFonts(ctx);
  const library = await ctx.loadData('library.json');
  const media = (path) => ctx.getResourceUrl(path);

  await ctx.gameData.buildPackage((data) => {
    for (const [id, entry] of Object.entries(library.items)) {
      data.items.add({
        itemType: 'Item',
        id,
        name: entry.name,
        customDescription: entry.description,
        category: 'Misc',
        type: 'Quest Item',
        media: entry.media,
        ignoreCompletion: true,
        obtainFromItemLog: false,
        golbinRaidExclusive: false,
        sellsFor: 0,
      });
    }
  }).add();

  const settings = ctx.settings.section(SECTION);
  settings.add([
    { type: 'switch', name: 'jingle', label: 'Quest complete jingle', hint: 'Plays through the OSRS Sounds mod when it is installed, so its volume applies.', default: true },
    { type: 'switch', name: 'sort-by-status', label: 'List quests in progress first', hint: 'Otherwise the quest list is alphabetical, as in OSRS.', default: false },
  ]);

  const character = () => api.find('osrsCharacter');
  const sounds = () => api.find('osrsSounds');
  let journal = null;
  let refreshSidebar = () => {};

  const playJingle = () => {
    if (settings.get('jingle') === false || !library.jingles.length) return;
    const url = media(dialog.pick(library.jingles));
    const player = sounds();
    if (player?.playJingle) {
      player.playJingle(url);
      return;
    }
    const audio = new Audio(url);
    audio.volume = JINGLE_VOLUME;
    audio.play().catch(() => {});
  };

  const engine = engineModule.createEngine({
    game,
    storage: ctx.characterStorage,
    registry,
    dialog,
    notify: (text, image) => {
      if (typeof imageNotify === 'function') imageNotify(image ?? media('img/quest-point.png'), text, 'info');
    },
    playerHead: () => character()?.chathead?.() ?? null,
    onComplete: (quest, summary) => {
      journal?.showComplete(quest, summary);
      playJingle();
      refreshSidebar();
    },
  });

  for (const [id, entry] of Object.entries(library.npcs)) {
    engine.npcs.register({ id: `osrsQuests:${id}`, name: entry.name, chathead: media(entry.chathead) });
  }
  for (const module of questModules) engine.quests.register(module.quest);

  const talk = async (id, key) => {
    await engine.talk(id, key);
    refreshSidebar();
  };
  journal = journalModule.createJournal({
    engine,
    dialog,
    media,
    onTalk: talk,
    sortBy: () => (settings.get('sort-by-status') ? 'status' : 'name'),
  });

  const describe = (quest) => ({
    id: quest.id,
    name: quest.name,
    status: engine.status(quest.id),
    stage: engine.handle(quest.id).stage,
    questPoints: quest.questPoints ?? 0,
    difficulty: quest.difficulty ?? null,
    length: quest.length ?? null,
    series: quest.series ?? null,
  });

  api.publish(ctx, API_VERSION, {
    registerQuest: (definition) => engine.quests.register(definition),
    registerNpc: (definition) => engine.npcs.register(definition),
    npc: (id) => engine.npcs.get(id),
    npcs: () => engine.npcs.list(),
    quest: (id) => (engine.quests.has(id) ? describe(engine.quests.get(id)) : null),
    quests: () => engine.quests.list().map(describe),
    questPoints: () => engine.questPoints(),
    talk: (script, options = {}) => engine.converse(script, options),
    startQuestConversation: (id, npcKey) => talk(id, npcKey),
    openQuestList: () => journal.openList(),
    openJournal: (id) => journal.openJournal(id),
    libraryItems: () => Object.keys(library.items).map((id) => `osrsQuests:${id}`),
    on: (type, listener) => engine.on(type, listener),
    triggers: engineModule.TRIGGERS,
    dialog,
  });

  ctx.settings.section('Debug').add([
    {
      type: 'button',
      name: 'reset-quests',
      display: 'Reset all quest progress',
      color: 'danger',
      hint: 'For this character only. Quest items and rewards already received are kept.',
      onClick: () => SwalLocale.fire({ title: 'Reset all quest progress?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Reset' })
        .then((result) => {
          if (!result.isConfirmed) return;
          engine.reset();
          refreshSidebar();
        }),
    },
    {
      type: 'button',
      name: 'preview-complete',
      display: 'Preview the Quest Complete screen',
      color: 'secondary',
      hint: 'Shows the scroll for Imp Catcher without giving anything.',
      onClick: () => {
        const quest = engine.quests.get('osrsQuests:imp_catcher');
        journal.showComplete(quest, engine.rewardSummary(quest));
        playJingle();
      },
    },
  ]);

  ctx.patch(Skill, 'onLevelUp').after(function (_result, previousLevel, level) {
    engine.dispatch('levelUp', { skill: this, level, previousLevel });
  });
  ctx.patch(Bank, 'addItem').after(function (_result, item, quantity) {
    if (this === game.bank) engine.dispatch('itemAdded', { item, quantity });
  });

  ctx.onCharacterLoaded(() => {
    engine.load();
    game.combat.on('monsterKilled', (event) => engine.dispatch('monsterKilled', { monster: event.monster, area: game.combat.selectedArea }));
    game.combat.on('monsterSpawned', (event) => engine.dispatch('monsterSpawned', { monster: event.monster, area: game.combat.selectedArea }));
    for (const skill of game.skills.allObjects) skill.on?.('action', (event) => engine.dispatch('skillAction', { skill, event }));
  });

  ctx.onInterfaceReady(() => {
    const category = sidebar.category(SIDEBAR_CATEGORY, { before: 'Combat' });
    refreshSidebar = () => category.item(SIDEBAR_ITEM, {
      icon: media('img/quest-point.png'),
      aside: `${engine.questPoints()} QP`,
      onClick: () => journal.openList(),
    });
    refreshSidebar();
    engine.on('questStarted', refreshSidebar);
    engine.on('questReset', refreshSidebar);
  });
}
