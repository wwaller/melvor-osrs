export const id = 'sandwich-lady';
export const title = 'the Sandwich lady';
const NAME = 'Sandwich lady';
const CHATHEAD = 'img/sandwich-lady.png';
const TRAY_SIZE = 7;

export function available({ game, loot }) {
  return loot.foods(game.items.allObjects).length > 1;
}

export function show({ game, dialog, loot, media, preview, random = Math.random }) {
  const { el, img } = dialog;
  const foods = dialog.shuffle(loot.foods(game.items.allObjects), random).slice(0, TRAY_SIZE);
  const wanted = dialog.pick(foods, random);
  const chathead = media(CHATHEAD);
  const chat = dialog.chat(NAME, chathead, `You look hungry to me. I tell you what - have a ${wanted.name} on me.`);
  const tray = el('div', 'osrs-re-tray');
  const key = el('button', 'osrs-re-key', 'Key');
  key.addEventListener('click', () => tray.classList.toggle('osrs-re-keyed'));
  const plate = el('div', 'osrs-re-foods');
  for (const food of foods) {
    const icon = img(food.media);
    icon.style.animationDuration = `${3 + random() * 2}s`;
    icon.style.animationDelay = `-${random() * 5}s`;
    const button = el('button', 'osrs-re-food', icon, el('span', 'osrs-re-food-name', food.name));
    button.setAttribute('aria-label', food.name);
    button.addEventListener('click', () => take(food));
    plate.append(button);
  }
  tray.append(plate, el('div', 'osrs-re-caption-row', el('span', 'osrs-re-caption', `Have a ${wanted.name} for free!`), key));
  const finish = dialog.open([chat.box, tray], chathead, preview);

  function take(food) {
    finish();
    tray.remove();
    if (food !== wanted) return chat.end('Hey, I didn\'t say you could have that!');
    loot.grant(game, { item: food, quantity: loot.foodQuantity(random) }, preview);
    chat.end('Hope that fills you up!');
  }
}
