export const TOKENS = 5;

export function wishes(game) {
  return game.skills.allObjects.flatMap((skill) => {
    const token = skill.isUnlocked ? skill.masteryTokens?.get(game.defaultRealm)?.[0] : undefined;
    return token ? [{ skill, token }] : [];
  });
}

export function tablet({ game, dialog, loot, preview }, onWish) {
  const { el, img } = dialog;
  const confirm = el('button', 'osrs-re-confirm', 'Confirm');
  confirm.disabled = true;
  const grid = el('div', 'osrs-re-skills');
  const buttons = [];
  let chosen;
  for (const wish of wishes(game)) {
    const button = el('button', 'osrs-re-skill', img(wish.skill.media));
    button.title = wish.skill.name;
    button.setAttribute('aria-label', wish.skill.name);
    button.addEventListener('click', () => {
      chosen = wish;
      buttons.forEach((other) => other.classList.toggle('osrs-re-chosen', other === button));
      confirm.disabled = false;
    });
    buttons.push(button);
    grid.append(button);
  }
  const node = el('div', 'osrs-re-tablet', el('div', 'osrs-re-tablet-title', 'Choose the stat you wish to be advanced!'), grid, confirm);
  confirm.addEventListener('click', () => {
    if (!chosen) return;
    node.remove();
    loot.grant(game, { item: chosen.token, quantity: TOKENS }, preview);
    onWish(chosen);
  });
  return node;
}
