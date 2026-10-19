export const id = 'quiz-master';
export const title = 'the Quiz Master';
const ROUNDS = 4;
const PRIZE_GP = 10000;
const RIGHT = [
  'DING DING DING! That\'s RIGHT! Good for you! Okay, next question!',
  'Absolutely RIGHT! Keep going for the win! Okay, next question!',
  'COR-RECT! Okay, next question!',
  'Hey, you\'re good at this! CORRECT! Okay, next question!',
  'Wow, you\'re a smart one! You\'re absolutely RIGHT! Okay, next question!',
  'YES! You\'re RIGHT! Okay, next question!',
];
const WRONG = [
  'WRONG! That\'s just WRONG! Okay, next question!',
  'BZZZZZZZ! WRONG! Okay, next question!',
  'No, you\'re WRONG! Okay, next question!',
  'No, sorry. Try harder! Okay, next question!',
  'Better luck next time! Okay, next question!',
  'Nope, that\'s not it. Okay, next question!',
  'Huh...? Didn\'t you know that one? Okay, next question!',
  'No, no, no... That\'s completely WRONG! Okay, next question!',
  'WRONG WRONG WRONG! Okay, next question!',
];

export function available({ game, loot }) {
  return loot.categories(game.items.allObjects).length > 1;
}

export function mysteryBox({ game, dialog, lamp, loot, outfits }, random = Math.random) {
  const prizes = [
    () => loot.gift(game, random),
    () => loot.gems(game, random),
  ];
  const food = loot.foods(game.items.allObjects);
  if (food.length) prizes.push(() => ({ item: dialog.pick(food, random), quantity: loot.foodQuantity(random) }));
  const wishes = lamp.wishes(game);
  if (wishes.length) prizes.push(() => ({ item: dialog.pick(wishes, random).token, quantity: lamp.TOKENS }));
  const costume = [...outfits.missing(game, 'frog'), ...outfits.missing(game, 'camo')];
  if (costume.length) prizes.push(() => ({ item: dialog.pick(costume, random), quantity: 1 }));
  return dialog.pick(prizes, random)();
}

export function show(kit) {
  const { game, dialog, loot, media, preview, random = Math.random } = kit;
  const { el, img } = dialog;
  const chathead = media('img/quiz-master.png');
  const groups = loot.categories(game.items.allObjects);
  const chat = dialog.chat('Quiz Master', chathead, `Please welcome our newest contestant: ${game.characterName}! Four questions right, and then you win! You know the rules, so let's begin!`);
  const pips = dialog.streak(ROUNDS);
  const row = el('div', 'osrs-re-quiz');
  const board = el('div', 'osrs-re-panel', row, el('div', 'osrs-re-caption', 'Pick the odd one out.'), pips.node);
  const stage = el('div', 'osrs-re-stage', board);
  const finish = dialog.open([chat.box, stage], chathead, preview);
  let right = 0;
  ask();

  function ask() {
    const [same, different] = dialog.shuffle(groups, random);
    const odd = dialog.pick(different, random);
    const items = dialog.shuffle([...dialog.shuffle(same, random).slice(0, 2), odd], random);
    row.replaceChildren(...items.map((item) => {
      const icon = img(item.media);
      icon.style.animationDelay = `-${random() * 4}s`;
      const button = el('button', 'osrs-re-food', icon);
      button.setAttribute('aria-label', item.name);
      button.addEventListener('click', () => answer(item === odd));
      return button;
    }));
  }

  function answer(correct) {
    right = correct ? right + 1 : 0;
    pips.show(right);
    if (right === ROUNDS) return prize();
    chat.say(dialog.pick(correct ? RIGHT : WRONG, random));
    ask();
  }

  function prize() {
    board.remove();
    chat.say('CONGRATULATIONS! You are a WINNER! Please choose your PRIZE!');
    const options = dialog.choices([`${PRIZE_GP.toLocaleString('en-US')} GP`, 'Mystery box'], (index) => {
      options.remove();
      finish();
      loot.grant(game, index === 0 ? { gp: PRIZE_GP } : mysteryBox(kit, random), preview);
      chat.end('CONGRATULATIONS! You are a WINNER!');
    });
    stage.append(options);
  }
}
