const GRID = 'quick-equip-all';

/** Every bank item that fits the slot, in the order the bank shows them. */
export function slotChoices(itemsByTab, slotID) {
  return itemsByTab.flat().filter((bankItem) => typeof bankItem.item.fitsInSlot === 'function' && bankItem.item.fitsInSlot(slotID));
}

export function setup(ctx) {
  ctx.loadStylesheet('style.css');
  ctx.patch(QuickEquipTooltipElement, 'setEquipped').replace(function (setEquipped, player, equipped) {
    if (player !== game.combat.player) return setEquipped(player, equipped);
    showChoices(this, player, equipped);
    return undefined;
  });
}

function showChoices(tooltip, player, equipped) {
  const slot = equipped.slot;
  tooltip.buttons.forEach(({ equip }) => equip.parentElement.classList.add('d-none'));
  tooltip.unequipButton.onclick = player.unequipCallback(slot);
  if (!tooltip.quickEquipAllGrid) {
    tooltip.quickEquipAllGrid = document.createElement('div');
    tooltip.quickEquipAllGrid.className = GRID;
    tooltip.buttonContainer.before(tooltip.quickEquipAllGrid);
  }
  const grid = tooltip.quickEquipAllGrid;
  (grid.tips || []).forEach((tip) => tip.destroy());
  grid.tips = [];
  const choices = slotChoices(game.bank.itemsByTab, slot.id)
    .filter(({ item }) => player.equipment.getSlotOfItem(item) === undefined)
    .map(({ item, quantity }) => ({ item, quantity, worn: false }));
  if (!equipped.isEmpty) choices.unshift({ item: equipped.item, quantity: equipped.quantity, worn: true });
  const refresh = () => showChoices(tooltip, player, player.equipment.equippedItems[slot.id]);
  grid.replaceChildren(...(choices.length ? choices.map((choice) => choiceButton(grid, player, slot, choice, refresh)) : [emptyNote()]));
}

function choiceButton(grid, player, slot, { item, quantity, worn }, refresh) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn btn-sm ${worn ? 'btn-outline-success' : 'btn-outline-secondary'} ${GRID}-item`;
  if (!worn && !game.checkRequirements(item.equipRequirements, false)) button.classList.add(`${GRID}-locked`);
  const image = document.createElement('img');
  image.className = `${GRID}-image`;
  image.src = item.media;
  button.append(image);
  if (slot.allowQuantity) {
    const count = document.createElement('small');
    count.className = `${GRID}-count`;
    count.textContent = formatNumber(quantity);
    button.append(count);
  }
  button.onclick = () => {
    const amount = worn ? (slot.allowQuantity ? game.bank.getQty(item) : 0) : slot.allowQuantity ? quantity : 1;
    if (!amount) return;
    player.equipItem(item, player.selectedEquipmentSet, slot, amount);
    // Redraw after the click finishes: the top bar's equipment menu only stays open for clicks whose button is still on the page.
    setTimeout(refresh);
  };
  grid.tips.push(tippy(button, { content: item.name, placement: 'top', animation: false }));
  return button;
}

function emptyNote() {
  const note = document.createElement('div');
  note.className = `${GRID}-empty`;
  note.textContent = 'Nothing in your bank fits this slot.';
  return note;
}
