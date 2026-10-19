export const id = 'pillory';
export const title = 'the Pillory';
const START_LOCKS = 3;
const MAX_LOCKS = 6;
const KEYS = 3;
const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon'];

export function available() {
  return true;
}

export function show({ game, dialog, loot, media, preview, random = Math.random }) {
  const { el } = dialog;
  const chathead = media('img/pillory-guard.png');
  const chat = dialog.chat('Pillory Guard', chathead, 'You\'re under arrest! I\'ve come to lock you up.');
  const keyhole = el('span', 'osrs-re-shape');
  const locks = el('div', 'osrs-re-padlocks');
  const keys = el('div', 'osrs-re-keys');
  const panel = el('div', 'osrs-re-panel osrs-re-pillory', locks, el('div', 'osrs-re-lock', el('span', 'osrs-re-shackle'), el('span', 'osrs-re-lock-body', keyhole)), keys, el('div', 'osrs-re-caption', 'Pick the key that fits the lock.'));
  const finish = dialog.open([chat.box, panel], chathead, preview);
  let needed = START_LOCKS;
  let opened = 0;
  let shape;
  round();

  function round() {
    shape = dialog.pick(SHAPES, random);
    keyhole.className = `osrs-re-shape osrs-re-${shape}`;
    const choices = dialog.shuffle([shape, ...dialog.shuffle(SHAPES.filter((other) => other !== shape), random).slice(0, KEYS - 1)], random);
    keys.replaceChildren(...choices.map((option) => {
      const key = el('button', 'osrs-re-pkey', el('span', `osrs-re-shape osrs-re-${option}`), el('span', 'osrs-re-shaft'));
      key.style.animationDelay = `-${random() * 2}s`;
      key.setAttribute('aria-label', `${option} key`);
      key.addEventListener('click', () => turn(option));
      return key;
    }));
    locks.replaceChildren(...Array.from({ length: needed }, (_, index) => el('span', index < opened ? 'osrs-re-padlock osrs-re-open' : 'osrs-re-padlock')));
  }

  function turn(option) {
    if (option === shape) {
      opened++;
    } else {
      needed = Math.min(MAX_LOCKS, needed + 1);
      opened = 0;
    }
    if (opened < needed) return round();
    finish();
    panel.remove();
    loot.grant(game, loot.gift(game, random), preview);
    chat.end('Hmmph!');
  }
}
