export const id = 'certer';
export const title = 'a Certer';
const CERTERS = ['Niles', 'Miles', 'Giles'];

export function available({ game, loot }) {
  return loot.categories(game.items.allObjects).length > 0;
}

export function show({ game, dialog, loot, media, preview, random = Math.random }) {
  const { el, img } = dialog;
  const name = dialog.pick(CERTERS, random);
  const chathead = media(`img/${name.toLowerCase()}.png`);
  const chat = dialog.chat(name, chathead, `Greetings ${game.characterName}, I need your help.`);
  const [answer, ...others] = dialog.shuffle(dialog.pick(loot.categories(game.items.allObjects), random), random).slice(0, 3);
  const options = dialog.shuffle([answer, ...others], random);
  const panel = el('div', 'osrs-re-panel osrs-re-certer', img(answer.media, 'osrs-re-certer-item'), el('div', 'osrs-re-caption', 'What is this item?'));
  panel.append(dialog.choices(options.map((item) => item.name), (index) => {
    finish();
    panel.remove();
    if (options[index] !== answer) return chat.end('Sorry, that\'s just not the right answer!');
    loot.grant(game, loot.gift(game, random), preview);
    chat.end('Thank you, I hope you like your present. I must be leaving now though.');
  }, null));
  const finish = dialog.open([chat.box, panel], chathead, preview);
}
