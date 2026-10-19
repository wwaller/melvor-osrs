const NAMESPACE = 'osrsRandomEvents';
const COMBAT_SKILLS = ['Attack', 'Strength', 'Defence', 'Hitpoints', 'Ranged', 'Magic'];
const scoped = (skill, value) => [{ skillID: `melvorD:${skill}`, value }];

export const OUTFITS = {
  frog: [
    { id: 'Frog_Mask', name: 'Frog mask', slot: 'Helmet', media: 'img/costume/frog-mask.png', modifiers: { masteryXP: scoped('Fishing', 2) } },
    { id: 'Royal_Frog_Tunic', name: 'Royal frog tunic', slot: 'Platebody', media: 'img/costume/royal-frog-tunic.png', modifiers: { skillXP: scoped('Fishing', 2) } },
    { id: 'Royal_Frog_Leggings', name: 'Royal frog leggings', slot: 'Platelegs', media: 'img/costume/royal-frog-leggings.png', modifiers: { doubleItemsSkill: scoped('Fishing', 2) } },
    { id: 'Royal_Frog_Blouse', name: 'Royal frog blouse', slot: 'Platebody', media: 'img/costume/royal-frog-blouse.png', modifiers: { skillXP: scoped('Fishing', 2) } },
    { id: 'Royal_Frog_Skirt', name: 'Royal frog skirt', slot: 'Platelegs', media: 'img/costume/royal-frog-skirt.png', modifiers: { doubleItemsSkill: scoped('Fishing', 2) } },
  ],
  camo: [
    { id: 'Camo_Top', name: 'Camo top', slot: 'Platebody', media: 'img/costume/camo-top.png', modifiers: { skillXP: COMBAT_SKILLS.flatMap((skill) => scoped(skill, 2)) } },
    { id: 'Camo_Helmet', name: 'Camo helmet', slot: 'Helmet', media: 'img/costume/camo-helmet.png', modifiers: { skillXP: scoped('Thieving', 2) } },
    { id: 'Camo_Bottoms', name: 'Camo bottoms', slot: 'Platelegs', media: 'img/costume/camo-bottoms.png', modifiers: { skillXP: scoped('Agility', 2) } },
  ],
};

export async function register(ctx) {
  await ctx.gameData.buildPackage((data) => {
    for (const piece of Object.values(OUTFITS).flat()) {
      data.items.add({
        itemType: 'Equipment',
        id: piece.id,
        name: piece.name,
        customDescription: 'A costume piece from a random event.',
        category: 'Combat',
        type: 'Armour',
        media: piece.media,
        ignoreCompletion: true,
        obtainFromItemLog: false,
        golbinRaidExclusive: false,
        sellsFor: 0,
        validSlots: [piece.slot],
        occupiesSlots: [],
        equipRequirements: [],
        equipmentStats: [],
        modifiers: piece.modifiers,
      });
    }
  }).add();
}

export function missing(game, outfit) {
  return OUTFITS[outfit]
    .map((piece) => game.items.getObjectByID(`${NAMESPACE}:${piece.id}`))
    .filter((item) => item && !game.bank.hasItem(item) && !game.combat.player.checkEquipmentSetsForItem(item));
}
