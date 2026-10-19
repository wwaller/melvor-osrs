export const id = 'frog';
export const title = 'Kiss the frog';
const FROGS = 8;
const WRONG = [(royal) => `Hurrah for the frog ${royal}!`, (royal) => `Don't talk to me! Speak to the frog ${royal}!`];

export function available({ game, outfits, lamp }) {
  return outfits.missing(game, 'frog').length > 0 || lamp.wishes(game).length > 0;
}

export function show(kit) {
  const { game, dialog, outfits, lamp, loot, media, preview, random = Math.random } = kit;
  const { el, img } = dialog;
  const royal = random() < 0.5 ? 'prince' : 'princess';
  const herald = media('img/frog.png');
  const chat = dialog.chat('Frog', herald, `Greetings from the ${royal}, ${game.characterName}!`);
  const crowned = Math.floor(random() * FROGS);
  const pond = el('div', 'osrs-re-pond');
  for (let i = 0; i < FROGS; i++) {
    const frog = el('button', 'osrs-re-frog', img(media(i === crowned ? 'img/pond/frog-crowned.png' : 'img/pond/frog.png')));
    frog.style.animationDelay = `-${(random() * 1.6).toFixed(2)}s`;
    frog.setAttribute('aria-label', i === crowned ? `Frog ${royal}` : 'Frog');
    frog.addEventListener('click', () => (i === crowned ? meet() : chat.say(dialog.pick(WRONG, random)(royal))));
    pond.append(frog);
  }
  const panel = el('div', 'osrs-re-panel', pond, el('div', 'osrs-re-caption', `Find the frog ${royal}.`));
  const stage = el('div', 'osrs-re-stage', panel);
  const finish = dialog.open([chat.box, stage], herald, preview);

  function meet() {
    panel.remove();
    chat.speak(`Frog ${royal}`, media('img/frog-crowned.png'));
    chat.say('Please help me. I was transformed into a frog by a well-meaning but sadly frog-obsessed old wizard.');
    const options = dialog.choices(['Would a kiss be acceptable?', 'I\'m sorry, I\'d prefer not to do that.'], (index) => {
      options.remove();
      if (index === 0) return kiss();
      finish();
      chat.end('Maybe later.');
    });
    stage.append(options);
  }

  function kiss() {
    chat.say('Yes!');
    chat.transform(`Frog ${royal}`, media(`img/frog-${royal}.png`), () => {
      const thanks = `Thank you so much, ${game.characterName}. I must return to my fairytale kingdom.`;
      const piece = dialog.pick(outfits.missing(game, 'frog'), random);
      if (piece) {
        finish();
        loot.grant(game, { item: piece, quantity: 1 }, preview);
        return chat.end(thanks);
      }
      chat.say(thanks);
      stage.append(lamp.tablet(kit, () => {
        finish();
        chat.end(thanks);
      }));
    });
  }
}
