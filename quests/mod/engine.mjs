export const NOT_STARTED = 'not-started';
export const IN_PROGRESS = 'in-progress';
export const COMPLETED = 'completed';
export const START = 'start';
export const DONE = 'done';
export const TRIGGERS = ['monsterKilled', 'monsterSpawned', 'skillAction', 'levelUp', 'itemAdded'];
const STATE_KEY = 'quests';

const lines = (entries) => (entries ?? []).filter((entry) => entry !== null && entry !== undefined && entry !== false)
  .map((entry) => (typeof entry === 'string' ? { text: entry, done: false } : { text: String(entry.text), done: Boolean(entry.done) }));

export function createEngine({ game, storage, registry, dialog, notify = () => {}, playerHead = () => null, onComplete = () => {}, random = Math.random, namespace = 'osrsQuests' }) {
  const emitter = registry.createEmitter('osrsQuests');
  const quests = registry.createRegistry('quest', {
    shape: { name: 'string', stages: 'object', difficulty: 'string?', length: 'string?', questPoints: 'number?', requirements: 'array?', rewards: 'object?', cast: 'object?', series: 'string?', description: 'string?' },
    validate(quest) {
      if (!quest.stages[START]) throw new TypeError(`quest "${quest.id}": stages needs a "${START}" stage, the one before the quest begins`);
      if (DONE in quest.stages) throw new TypeError(`quest "${quest.id}": "${DONE}" is reserved for finished quests`);
      for (const [key, stage] of Object.entries(quest.stages)) {
        for (const type of Object.keys(stage.on ?? {})) {
          if (!TRIGGERS.includes(type)) throw new TypeError(`quest "${quest.id}" stage "${key}": unknown trigger "${type}", expected one of ${TRIGGERS.join(', ')}`);
        }
      }
    },
  });
  const npcs = registry.createRegistry('npc', { shape: { name: 'string', chathead: 'string?' } });
  let state = {};
  let talking = 0;
  const pending = [];

  const save = () => storage.setItem(STATE_KEY, state);
  const recordOf = (id) => state[id] ?? { stage: START, data: {} };
  const ensure = (id) => (state[id] ??= { stage: START, data: {} });
  const questOf = (id) => {
    const quest = quests.get(id);
    if (!quest) throw new Error(`osrsQuests: no quest "${id}" is registered`);
    return quest;
  };

  function status(id) {
    const { stage } = recordOf(id);
    return stage === DONE ? COMPLETED : stage === START ? NOT_STARTED : IN_PROGRESS;
  }

  function npc(key, quest = null) {
    const alias = quest?.cast?.[key];
    return npcs.get(alias ?? key) ?? npcs.get(`${namespace}:${alias ?? key}`) ?? null;
  }

  function item(id) {
    return game.items.getObjectByID(id) ?? null;
  }

  function skillLevel(skillId) {
    return game.skills.getObjectByID(skillId)?.level ?? 0;
  }

  function questPoints() {
    return quests.list().reduce((sum, quest) => sum + (status(quest.id) === COMPLETED ? quest.questPoints ?? 0 : 0), 0);
  }

  function maxQuestPoints() {
    return quests.list().reduce((sum, quest) => sum + (quest.questPoints ?? 0), 0);
  }

  function requirements(quest) {
    return (quest.requirements ?? []).map((need) => {
      if (need.skill) {
        const skill = game.skills.getObjectByID(need.skill);
        return { label: `${need.level} ${skill?.name ?? need.skill}`, met: skillLevel(need.skill) >= need.level };
      }
      if (need.quest) return { label: quests.get(need.quest)?.name ?? need.quest, met: status(need.quest) === COMPLETED };
      if (need.questPoints) return { label: `${need.questPoints} Quest Points`, met: questPoints() >= need.questPoints };
      if (need.check) return { label: need.label ?? 'A special requirement', met: Boolean(need.check(game)) };
      return { label: need.label ?? '?', met: false };
    });
  }

  const requirementsMet = (quest) => requirements(quest).every((need) => need.met);

  function rewardSummary(quest) {
    const rewards = quest.rewards ?? {};
    const points = quest.questPoints ?? 0;
    const summary = points ? [`${points} Quest Point${points === 1 ? '' : 's'}`] : [];
    for (const [skillId, amount] of rewards.xp ?? []) summary.push(`${amount.toLocaleString('en-US')} ${game.skills.getObjectByID(skillId)?.name ?? skillId} XP`);
    for (const [itemId, quantity = 1] of rewards.items ?? []) {
      const found = item(itemId);
      if (found) summary.push(quantity > 1 ? `${quantity.toLocaleString('en-US')} x ${found.name}` : found.name);
    }
    if (rewards.gp) summary.push(`${rewards.gp.toLocaleString('en-US')} GP`);
    summary.push(...(rewards.lines ?? []));
    const image = rewards.image ? item(rewards.image)?.media ?? rewards.image : null;
    return { lines: summary, image };
  }

  function grant(quest, q) {
    const rewards = quest.rewards ?? {};
    for (const [skillId, amount] of rewards.xp ?? []) game.skills.getObjectByID(skillId)?.addXP(amount);
    for (const [itemId, quantity = 1] of rewards.items ?? []) {
      const found = item(itemId);
      if (found) game.bank.addItem(found, quantity, false, true, true);
    }
    if (rewards.gp) game.gp.add(rewards.gp);
    rewards.grant?.(q);
  }

  function handle(id) {
    const quest = questOf(id);
    const q = {
      id,
      quest,
      game,
      get stage() {
        return recordOf(id).stage;
      },
      get status() {
        return status(id);
      },
      get data() {
        return ensure(id).data;
      },
      get(key) {
        return recordOf(id).data[key];
      },
      set(key, value) {
        ensure(id).data[key] = value;
        save();
      },
      setStage(next) {
        if (!(next in quest.stages)) throw new Error(`quest "${id}": there is no stage "${next}"`);
        const record = ensure(id);
        const from = record.stage;
        if (from === next) return;
        record.stage = next;
        if (from === START) record.startedAt = Date.now();
        save();
        if (from === START) emitter.emit('questStarted', { quest, q });
        emitter.emit('stageChanged', { quest, q, from, to: next });
      },
      complete() {
        const record = ensure(id);
        if (record.stage === DONE) return;
        grant(quest, q);
        record.stage = DONE;
        record.completedAt = Date.now();
        save();
        emitter.emit('questCompleted', { quest, q });
        pending.push(quest);
        if (!talking) flush();
      },
      item,
      itemName: (itemId) => item(itemId)?.name ?? itemId,
      count: (itemId) => {
        const found = item(itemId);
        return found ? game.bank.getQty(found) : 0;
      },
      has(itemId, quantity = 1) {
        return q.count(itemId) >= quantity;
      },
      give(itemId, quantity = 1) {
        const found = item(itemId);
        if (!found) throw new Error(`quest "${id}": there is no item "${itemId}"`);
        game.bank.addItem(found, quantity, false, true, true);
      },
      take(itemId, quantity = 1) {
        const found = item(itemId);
        if (!found || game.bank.getQty(found) < quantity) return false;
        game.bank.removeItemQuantity(found, quantity, true);
        return true;
      },
      level: skillLevel,
      xp(skillId, amount) {
        game.skills.getObjectByID(skillId)?.addXP(amount);
      },
      gp(amount) {
        game.gp.add(amount);
      },
      notify(text, media = null) {
        const speaker = typeof media === 'string' && !media.includes('/') ? npc(media, quest) : null;
        notify(text, speaker?.chathead ?? media);
      },
      talk: (key) => talk(id, key),
      say: (script) => converse(script, { quest: id }),
      random,
      pick: (list) => list[Math.floor(random() * list.length)],
      player: {
        get name() {
          return game.characterName;
        },
      },
    };
    return q;
  }

  function flush() {
    while (pending.length) {
      const quest = pending.shift();
      onComplete(quest, rewardSummary(quest));
    }
  }

  async function converse(script, { quest: id = null, speakers = null } = {}) {
    const quest = id ? questOf(id) : null;
    const q = id ? handle(id) : null;
    talking++;
    try {
      return await dialog.converse(script, {
        speakers: speakers ?? ((key) => npc(key, quest) ?? { name: key, chathead: null }),
        player: { name: game.characterName, chathead: playerHead },
        items: (itemId) => item(itemId),
        context: q ?? { game },
        className: 'osrs-quests-conversation',
      });
    } finally {
      talking--;
      if (!talking) flush();
    }
  }

  function talkable(id) {
    const quest = questOf(id);
    const stage = recordOf(id).stage;
    if (stage === DONE) return [];
    const scripts = quest.stages[stage]?.talk ?? {};
    const locked = stage === START && !requirementsMet(quest);
    return Object.keys(scripts).map((key) => ({ key, name: npc(key, quest)?.name ?? key, locked }));
  }

  async function talk(id, key) {
    const quest = questOf(id);
    const stage = recordOf(id).stage;
    if (stage === START && !requirementsMet(quest)) return { locked: true };
    let script = quest.stages[stage]?.talk?.[key];
    if (!script) return null;
    if (typeof script === 'function') script = script(handle(id));
    return converse(script, { quest: id });
  }

  function journal(id) {
    const quest = questOf(id);
    const { stage } = recordOf(id);
    const q = handle(id);
    const read = (key) => {
      const entries = quest.stages[key]?.journal;
      return lines(typeof entries === 'function' ? entries(q) : entries);
    };
    let entries = [];
    if (stage === START) {
      entries = read(START);
      const needs = requirements(quest);
      if (needs.length) entries.push({ text: 'To start this quest I need:', done: false }, ...needs.map((need) => ({ text: need.label, done: need.met })));
    } else {
      const order = Object.keys(quest.stages).filter((key) => key !== START);
      const reached = stage === DONE ? order.length : order.indexOf(stage);
      order.forEach((key, index) => {
        if (index > reached) return;
        const shown = read(key);
        entries.push(...(index < reached ? shown.map((entry) => ({ ...entry, done: true })) : shown));
      });
    }
    return { quest, status: status(id), lines: entries, talk: talkable(id), finished: stage === DONE };
  }

  async function dispatch(type, payload) {
    for (const quest of quests.list()) {
      const { stage } = recordOf(quest.id);
      const handler = stage !== DONE && quest.stages[stage]?.on?.[type];
      if (!handler) continue;
      try {
        await handler(payload, handle(quest.id));
      } catch (error) {
        console.error(`[osrsQuests] ${quest.id} ${type} failed`, error);
      }
    }
  }

  function reset(id = null) {
    const before = id ? [id] : Object.keys(state);
    if (id) delete state[id];
    else state = {};
    save();
    for (const each of before) if (quests.has(each)) emitter.emit('questReset', { quest: quests.get(each) });
  }

  return {
    quests,
    npcs,
    on: emitter.on,
    load() {
      const saved = storage.getItem(STATE_KEY);
      state = saved && typeof saved === 'object' ? saved : {};
    },
    status,
    handle,
    npc,
    item,
    requirements,
    requirementsMet,
    rewardSummary,
    questPoints,
    maxQuestPoints,
    journal,
    talk,
    converse,
    dispatch,
    reset,
    get talking() {
      return talking > 0;
    },
  };
}
