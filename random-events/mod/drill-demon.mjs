export const id = 'drill-demon';
export const title = 'the Drill Demon';
const MOVES = 4;
const EXERCISES = [
  { name: 'Push ups', sign: 'img/drill/push-up.png', order: 'Drop and give me push ups on that mat, private!' },
  { name: 'Star jumps', sign: 'img/drill/star-jump.png', order: 'I want to see you on that mat doing star jumps, private!' },
  { name: 'Jog', sign: 'img/drill/jog.png', order: 'Get yourself over there and jog on that mat, private!' },
  { name: 'Sit ups', sign: 'img/drill/sit-up.png', order: 'Get on that mat and give me sit ups, private!' },
];

export function available({ game, outfits, lamp }) {
  return outfits.missing(game, 'camo').length > 0 || lamp.wishes(game).length > 0;
}

export function show(kit) {
  const { game, dialog, outfits, lamp, loot, media, preview, random = Math.random } = kit;
  const { el, img } = dialog;
  const chathead = media('img/sergeant-damien.png');
  let order = dialog.pick(EXERCISES, random);
  let moves = 0;
  const chat = dialog.chat('Sergeant Damien', chathead, `Private ${game.characterName}, atten-SHUN! ${order.order}`);
  const pips = dialog.streak(MOVES);
  const mats = EXERCISES.map(() => {
    const sign = img('');
    const mat = el('button', 'osrs-re-mat', el('span', 'osrs-re-sign', sign), el('span', 'osrs-re-mat-floor'));
    mat.addEventListener('click', () => exercise(mat.exercise));
    return { mat, sign };
  });
  const yard = el('div', 'osrs-re-panel osrs-re-yard', el('div', 'osrs-re-mats', ...mats.map(({ mat }) => mat)), pips.node);
  const stage = el('div', 'osrs-re-stage', yard);
  const finish = dialog.open([chat.box, stage], chathead, preview);
  shuffleSigns();

  function shuffleSigns() {
    dialog.shuffle(EXERCISES, random).forEach((exercise, index) => {
      mats[index].mat.exercise = exercise;
      mats[index].mat.setAttribute('aria-label', exercise.name);
      mats[index].sign.src = media(exercise.sign);
    });
  }

  function exercise(done) {
    const right = done === order;
    moves = right ? moves + 1 : 0;
    pips.show(moves);
    if (moves === MOVES) return dismiss();
    order = dialog.pick(EXERCISES, random);
    chat.say(right ? order.order : `Wrong exercise, worm! ${order.order}`);
    shuffleSigns();
  }

  function dismiss() {
    yard.remove();
    const line = 'Well I\'ll be, you actually did it, Private. Now take this and get out of my sight.';
    const piece = outfits.missing(game, 'camo')[0];
    if (piece) {
      finish();
      loot.grant(game, { item: piece, quantity: 1 }, preview);
      return chat.end(line);
    }
    chat.say(line);
    stage.append(lamp.tablet(kit, () => {
      finish();
      chat.end(line);
    }));
  }
}
