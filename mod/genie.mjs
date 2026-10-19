export const id = 'genie';
export const title = 'the Genie';
const CHATHEAD = 'img/genie.png';

export function available({ game, lamp }) {
  return lamp.wishes(game).length > 0;
}

export function show(kit) {
  const { game, dialog, lamp, media, preview } = kit;
  const chathead = media(CHATHEAD);
  const chat = dialog.chat('Genie', chathead, `Greetings, ${game.characterName}! Please take this lamp and make your wish.`);
  const tablet = lamp.tablet(kit, () => {
    finish();
    chat.poof();
    chat.end('I hope you\'re happy with your wish. I must be leaving now, though.');
  });
  const finish = dialog.open([chat.box, tablet], chathead, preview);
}
