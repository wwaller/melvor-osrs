export const id = 'pinball';
export const title = 'Pinball';
const TAGS = 10;
const RUNES = ['melvorD:Fire_Rune', 'melvorD:Water_Rune', 'melvorD:Earth_Rune', 'melvorD:Air_Rune', 'melvorF:Nature_Rune'];

export function available() {
  return true;
}

export function show({ game, dialog, loot, media, preview, random = Math.random }) {
  const { el, img } = dialog;
  const chathead = media('img/flippa.png');
  const chat = dialog.chat('Flippa', chathead, `You want play game of pinball, ${game.characterName}? You gotta poke dem pillars. You do dat ten times, you get prize.`);
  const score = el('div', 'osrs-re-caption', 'Score: 0');
  let tags = 0;
  let lit = -1;
  const pillars = RUNES.map((runeId, index) => {
    const rune = game.items.getObjectByID(runeId);
    const pillar = el('button', 'osrs-re-pillar', rune ? img(rune.media) : '', el('span', 'osrs-re-column'));
    pillar.setAttribute('aria-label', rune ? `${rune.name} pillar` : 'Pillar');
    pillar.addEventListener('click', () => poke(index));
    return pillar;
  });
  const arena = el('div', 'osrs-re-panel osrs-re-arena', el('div', 'osrs-re-pillars', ...pillars), score);
  const finish = dialog.open([chat.box, arena], chathead, preview);
  light();

  function light() {
    const others = pillars.map((_, index) => index).filter((index) => index !== lit);
    lit = dialog.pick(others, random);
    pillars.forEach((pillar, index) => pillar.classList.toggle('osrs-re-lit', index === lit));
  }

  function poke(index) {
    if (index === lit) {
      tags++;
    } else {
      tags = 0;
      chat.say('If you poke dem ones dat don\'t have a dem flashin\' rings, den dats bad.');
    }
    score.textContent = `Score: ${tags}`;
    if (tags < TAGS) return light();
    finish();
    arena.remove();
    loot.grant(game, loot.gems(game, random), preview);
    chat.end('Yer, get going. We get break now.');
  }
}
