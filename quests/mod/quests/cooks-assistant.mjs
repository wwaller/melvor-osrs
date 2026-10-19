const EGG = 'osrsQuests:Egg';
const MILK = 'osrsQuests:Bucket_of_milk';
const FLOUR = 'osrsQuests:Pot_of_flour';
const INGREDIENTS = [[EGG, 'an egg'], [MILK, 'a bucket of milk'], [FLOUR, 'a pot of flour']];
const FARMLANDS = ['melvorD:Farmlands', 'melvorD:Chicken_Coop'];
const DROP_CHANCE = 0.3;
const FLOUR_CHANCE = 0.25;

const missing = (q) => INGREDIENTS.filter(([item]) => !q.has(item));
const list = (words) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0]);

function find(q, item, chance, text) {
  if (q.has(item) || q.random() >= chance) return;
  q.give(item);
  q.notify(text, item === FLOUR ? null : 'cook');
}

export const quest = {
  id: 'osrsQuests:cooks_assistant',
  name: 'Cook\'s Assistant',
  difficulty: 'Novice',
  length: 'Short',
  questPoints: 1,
  cast: { cook: 'osrsQuests:cook' },
  rewards: { xp: [['melvorD:Cooking', 300]], lines: ['Permission to use the Cook\'s range'], image: EGG },
  stages: {
    start: {
      journal: ['I can start this quest by speaking to the *Cook* in the *Lumbridge Castle* kitchen.', 'There are no requirements for this quest.'],
      talk: {
        cook: [
          { npc: 'cook', say: 'What am I to do?' },
          {
            options: [
              {
                label: 'What\'s wrong?',
                then: [
                  { player: 'What\'s wrong?' },
                  { npc: 'cook', say: ['Oh dear, oh dear, oh dear, I\'m in a terrible terrible mess! It\'s the Duke\'s birthday today, and I should be making him a lovely big birthday cake.', 'I\'ve forgotten to buy the ingredients. I\'ll never get them in time now. He\'ll sack me! What will I do? I have four children and a goat to look after.'] },
                  {
                    options: [
                      {
                        label: 'I\'m always happy to help a cook in distress.',
                        then: [
                          { player: 'Yes, I\'ll help you.' },
                          { npc: 'cook', say: ['Oh thank you, thank you. I need milk, an egg and flour. I\'d be very grateful if you can get them for me.', 'The chickens and cows out in the Farmlands should do for the egg and milk, and a farmer will have some flour on him.'] },
                          { do: (q) => q.setStage('ingredients') },
                        ],
                      },
                      { label: 'I can\'t right now, maybe later.', then: [{ player: 'I can\'t right now, maybe later.' }, { npc: 'cook', say: 'Fine. I always knew you Adventurer types were callous beasts. Go on your merry way!' }] },
                    ],
                  },
                ],
              },
              { label: 'Can you make me a cake?', then: [{ player: 'You\'re a cook, why don\'t you bake me a cake?' }, { npc: 'cook', say: '*sniff* Don\'t talk to me about cakes...' }] },
              { label: 'You don\'t look very happy.', then: [{ player: 'You don\'t look very happy.' }, { npc: 'cook', say: 'No, I\'m not. The world is caving in around me. I am overcome by dark feelings of impending doom.' }] },
            ],
          },
        ],
      },
    },
    ingredients: {
      journal: (q) => [
        'It\'s the *Duke of Lumbridge\'s* birthday and I have to help his *Cook* make him a *birthday cake*. To do this I need to bring him the following ingredients:',
        { text: 'An *egg*, from a chicken in the *Farmlands*', done: q.has(EGG) },
        { text: 'A *bucket of milk*, from a cow in the *Farmlands*', done: q.has(MILK) },
        { text: 'A *pot of flour*, from pickpocketing *Bob the Farmer*', done: q.has(FLOUR) },
        missing(q).length ? null : 'I have everything. I should take it all to the *Cook*.',
      ],
      talk: {
        cook: [
          { npc: 'cook', say: 'How are you getting on with finding the ingredients?' },
          {
            if: (q) => missing(q).length === 0,
            then: [
              { player: 'Here\'s all the items!' },
              { text: 'You give the Cook an egg, a bucket of milk and a pot of flour.' },
              { do: (q) => INGREDIENTS.forEach(([item]) => q.take(item)) },
              { npc: 'cook', say: ['You\'ve brought me everything I need! I am saved! Thank you!', 'Well, maybe one day I\'ll be important enough to sit on the Duke\'s table. Feel free to use my range whenever you like.'] },
              { do: (q) => q.complete() },
            ],
            else: [
              { player: 'I haven\'t got everything yet.' },
              { npc: 'cook', say: (q) => `Please hurry! I still need ${list(missing(q).map(([, name]) => name))}.` },
            ],
          },
        ],
      },
      on: {
        monsterKilled({ monster, area }, q) {
          if (!FARMLANDS.includes(area?.id)) return;
          if (monster?.id === 'melvorD:Chicken') find(q, EGG, DROP_CHANCE, 'The chicken leaves behind a fresh egg.');
          if (monster?.id === 'melvorD:Cow') find(q, MILK, DROP_CHANCE, 'You fill a bucket with milk from the cow.');
        },
        skillAction({ event }, q) {
          if (event?.npc?.id === 'melvorF:BOB_THE_FARMER') find(q, FLOUR, FLOUR_CHANCE, 'You find a pot of flour in Bob the Farmer\'s pocket.');
        },
      },
    },
  },
};
