const HIGHLIGHT = /\*([^*]+)\*/g;
const STATUS_ORDER = { 'in-progress': 0, 'not-started': 1, completed: 2 };

export function rich(el, text, className = '') {
  const node = el('div', className);
  let last = 0;
  for (const match of String(text).matchAll(HIGHLIGHT)) {
    node.append(String(text).slice(last, match.index), el('span', 'osrs-quest-hl', match[1]));
    last = match.index + match[0].length;
  }
  node.append(String(text).slice(last));
  return node;
}

export function createJournal({ engine, dialog, media, onTalk, sortBy = () => 'name' }) {
  const { el, img } = dialog;
  const popup = (parts, className) => dialog.open(parts, null, false, { className, dismissed: null });

  function entry(quest) {
    const status = engine.status(quest.id);
    const button = el('button', `osrs-quest-entry osrs-quest-${status}`, quest.name);
    button.addEventListener('click', () => openJournal(quest.id));
    return button;
  }

  function openList() {
    const all = engine.quests.list();
    const sorted = [...all].sort((a, b) => (sortBy() === 'status' ? STATUS_ORDER[engine.status(a.id)] - STATUS_ORDER[engine.status(b.id)] : 0) || a.name.localeCompare(b.name));
    const groups = new Map();
    for (const quest of sorted) {
      const series = quest.series ?? 'Quests';
      if (!groups.has(series)) groups.set(series, []);
      groups.get(series).push(quest);
    }
    const list = el('div', 'osrs-quest-list');
    for (const [series, members] of groups) {
      if (groups.size > 1) list.append(el('div', 'osrs-quest-series', series));
      list.append(...members.map(entry));
    }
    if (!all.length) list.append(el('div', 'osrs-quest-empty', 'There are no quests yet.'));
    const points = el('div', 'osrs-quest-points', img(media('img/quest-point.png')), `Quest Points: ${engine.questPoints()}/${engine.maxQuestPoints()}`);
    popup([el('div', 'osrs-quest-tab', points, list)], 'osrs-quests-list-popup');
  }

  function openJournal(id) {
    const model = engine.journal(id);
    const { quest } = model;
    const facts = [quest.difficulty, quest.length].filter(Boolean).join(' - ');
    const scroll = el('div', 'osrs-quest-scroll', el('div', 'osrs-quest-title', quest.name));
    if (facts) scroll.append(el('div', 'osrs-quest-facts', facts));
    for (const line of model.lines) scroll.append(rich(el, line.text, `osrs-quest-line${line.done ? ' osrs-quest-done' : ''}`));
    if (model.finished) scroll.append(el('div', 'osrs-quest-finished', 'QUEST COMPLETE!'));
    const actions = el('div', 'osrs-quest-actions');
    for (const talk of model.talk) {
      const button = el('button', 'osrs-quest-talk', `Talk to ${talk.name}`);
      if (talk.locked) {
        button.disabled = true;
        button.title = 'You do not meet the requirements for this quest yet.';
      }
      button.addEventListener('click', () => onTalk(id, talk.key));
      actions.append(button);
    }
    const back = el('button', 'osrs-quest-back', 'Quest List');
    back.addEventListener('click', openList);
    actions.append(back);
    popup([scroll, actions], 'osrs-quests-journal-popup');
  }

  function showComplete(quest, summary) {
    const picture = img(summary.image ?? media('img/quest-start.png'), 'osrs-quest-reward-image');
    const rewards = el('div', 'osrs-quest-rewards', el('div', 'osrs-quest-awarded', 'You are awarded:'), ...summary.lines.map((line) => el('div', 'osrs-quest-reward', line)));
    const scroll = el('div', 'osrs-quest-scroll osrs-quest-complete',
      el('div', 'osrs-quest-congrats', 'Congratulations!'),
      el('div', 'osrs-quest-completed-line', 'You have completed ', el('span', 'osrs-quest-hl', quest.name), '!'),
      el('div', 'osrs-quest-reward-row', el('div', 'osrs-quest-reward-frame', picture), rewards),
      el('div', 'osrs-quest-total', `Quest Points: ${engine.questPoints()}`));
    popup([scroll], 'osrs-quests-complete-popup');
  }

  return { openList, openJournal, showComplete };
}
