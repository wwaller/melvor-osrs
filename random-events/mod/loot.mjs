const MIN_FOOD = 5;
const MAX_FOOD = 25;
const QUIZ_TYPES = {
  Logs: 'Logs',
  Ore: 'Ores',
  Bar: 'Bars',
  Gem: 'Gems',
  Rune: 'Runes',
  Seeds: 'Seeds',
  Food: 'Food',
  'Cooked Fish': 'Food',
  Weapon: 'Weapons',
  Armour: 'Armour',
  Bones: 'Bones',
  Herb: 'Herbs',
  Arrows: 'Arrows',
};
const GIFTS = [
  [10, { gp: 800 }],
  [10, { gp: 1600 }],
  [6, { gp: 2400 }],
  [10, { gp: 3200 }],
  [10, { gp: 4800 }],
  [10, { gp: 6400 }],
  [30, { food: true }],
  [32, { gem: 'melvorD:Sapphire', quantity: 3 }],
  [16, { gem: 'melvorD:Emerald', quantity: 3 }],
  [8, { gem: 'melvorD:Ruby', quantity: 3 }],
  [4, { gem: 'melvorD:Topaz', quantity: 3 }],
  [4, { gem: 'melvorD:Diamond', quantity: 3 }],
];
const PINBALL = [
  [3, { gem: 'melvorD:Sapphire', quantity: 5 }],
  [3, { gem: 'melvorD:Emerald', quantity: 5 }],
  [3, { gem: 'melvorD:Ruby', quantity: 5 }],
  [1, { gem: 'melvorD:Diamond', quantity: 2 }],
];

export function foods(game) {
  const seen = new Set();
  return game.items.allObjects.filter((item) => {
    if (!(item instanceof FoodItem) || item === game.emptyFoodItem || item.ignoreCompletion || item.golbinRaidExclusive || seen.has(item.media)) return false;
    seen.add(item.media);
    return true;
  });
}

export function foodQuantity(random = Math.random) {
  return MIN_FOOD + Math.floor(random() * (MAX_FOOD - MIN_FOOD + 1));
}

export function categories(items) {
  const seen = new Set();
  const groups = new Map();
  for (const item of items) {
    const group = QUIZ_TYPES[item.type];
    if (!group || item.golbinRaidExclusive || seen.has(item.media)) continue;
    seen.add(item.media);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(item);
  }
  return [...groups.values()].filter((list) => list.length >= 3);
}

function roll(table, random) {
  let left = random() * table.reduce((sum, [weight]) => sum + weight, 0);
  for (const [weight, entry] of table) {
    left -= weight;
    if (left < 0) return entry;
  }
  return table[table.length - 1][1];
}

function resolve(game, entry, random) {
  if (entry.gp) return { gp: entry.gp };
  if (entry.food) {
    const list = foods(game);
    return list.length ? { item: list[Math.floor(random() * list.length)], quantity: foodQuantity(random) } : { gp: 800 };
  }
  return { item: game.items.getObjectByID(entry.gem), quantity: entry.quantity };
}

export function gift(game, random = Math.random) {
  return resolve(game, roll(GIFTS, random), random);
}

export function gems(game, random = Math.random) {
  return resolve(game, roll(PINBALL, random), random);
}

export function grant(game, reward, preview) {
  if (preview || !reward) return;
  if (reward.gp) game.gp.add(reward.gp);
  else if (reward.item) game.bank.addItem(reward.item, reward.quantity, false, true, true);
}
