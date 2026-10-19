const AMULET = 'osrsQuests:Ghostspeak_amulet';
const SKULL = 'osrsQuests:Ghosts_skull';
const GRAVEYARDS = ['melvorD:Graveyard', 'melvorD:Undead_Graveyard'];
const SKULL_CHANCE = 0.25;

const wooo = [{ npc: 'ghost', say: 'Wooo wooo wooooo!' }, { text: 'The ghost wails at you. Without a way to understand him, it sounds like nonsense.' }];

export const quest = {
  id: 'osrsQuests:restless_ghost',
  name: 'The Restless Ghost',
  difficulty: 'Novice',
  length: 'Short',
  questPoints: 1,
  cast: { aereck: 'osrsQuests:father_aereck', urhney: 'osrsQuests:father_urhney', ghost: 'osrsQuests:restless_ghost' },
  rewards: { xp: [['melvorD:Prayer', 1125]], image: SKULL },
  stages: {
    start: {
      journal: ['I can start this quest by speaking to *Father Aereck* in the *church* next to *Lumbridge Castle*.', 'There are no requirements for this quest.'],
      talk: {
        aereck: [
          { npc: 'aereck', say: 'Welcome to the church of holy Saradomin.' },
          {
            options: [
              {
                label: 'I\'m looking for a quest!',
                then: [
                  { player: 'I\'m looking for a quest.' },
                  { npc: 'aereck', say: ['That is lucky, I need someone to do a quest for me.', 'My graveyard is haunted by a restless ghost. I need you to find out why it is restless, so it can be put to rest.', 'My friend Father Urhney lives in a shack in the swamp. He knows more about ghosts than I do.'] },
                  { player: 'Ok, I\'ll go and see him.' },
                  { do: (q) => q.setStage('urhney') },
                ],
              },
              { label: 'Who\'s Saradomin?', then: [{ player: 'Who\'s Saradomin?' }, { npc: 'aereck', say: 'Surely you have heard of the god, Saradomin? He who creates. He who brings life. We are His servants.' }] },
              { label: 'Nice place you\'ve got here.', then: [{ player: 'Nice place you\'ve got here.' }, { npc: 'aereck', say: 'It is, isn\'t it? It was built over 230 years ago.' }] },
            ],
          },
        ],
      },
    },
    urhney: {
      journal: ['*Father Aereck* asked me to help put the ghost haunting his graveyard to rest.', 'He told me to speak to *Father Urhney*, who lives in a shack in the *swamp*.'],
      talk: {
        urhney: [
          { npc: 'urhney', say: 'Go away! I\'m meditating!' },
          { player: 'Father Aereck sent me to talk to you.' },
          { npc: 'urhney', say: ['I suppose I\'d better talk to you then. What problems has he got himself into this time?', 'A ghost in his graveyard, you say? Well, he can\'t say he wasn\'t warned. Take this amulet.'] },
          { do: (q) => q.give(AMULET) },
          { item: AMULET, say: 'Father Urhney hands you an amulet.' },
          { npc: 'urhney', say: 'It is an amulet of Ghostspeak. With it you can understand what the ghost is saying. Now leave me in peace.' },
          { do: (q) => q.setStage('ghost') },
        ],
      },
    },
    ghost: {
      journal: ['*Father Urhney* gave me an *amulet of Ghostspeak*.', 'With it I should be able to talk to the *ghost* in the *graveyard*.'],
      talk: {
        ghost: [
          {
            if: (q) => !q.has(AMULET),
            then: wooo,
            else: [
              { player: 'Hello ghost, how are you?' },
              { npc: 'ghost', say: ['Not very good actually. Wait, you can understand me!', 'I think I\'ve lost my head. I mean my skull. A warlock stole it while I wasn\'t looking, and the skeletons in the graveyard have been passing it about ever since.'] },
              { player: 'I\'ll get it back for you.' },
              { npc: 'ghost', say: 'Would you? Thank you! Then I could finally rest.' },
              { do: (q) => q.setStage('skull') },
            ],
          },
        ],
      },
    },
    skull: {
      journal: (q) => [
        'The *ghost* told me a warlock stole his *skull*, and the *skeletons* in the *Graveyard* have it now.',
        { text: 'Find the ghost\'s skull', done: q.has(SKULL) },
        q.has(SKULL) ? 'I have the skull. I should take it back to the *ghost*.' : null,
      ],
      talk: {
        ghost: [
          {
            if: (q) => !q.has(AMULET),
            then: wooo,
            else: [
              {
                if: (q) => q.has(SKULL),
                then: [
                  { player: 'I\'ve found your skull!' },
                  { text: 'You place the skull with the ghost\'s remains.' },
                  { do: (q) => q.take(SKULL) },
                  { npc: 'ghost', say: 'Thank you. Now I can finally rest. Farewell, kind friend.' },
                  { poof: true },
                  { do: (q) => q.complete() },
                ],
                else: [{ npc: 'ghost', say: 'Have you found my skull yet? The skeletons in the Graveyard have it, I\'m sure of it.' }],
              },
            ],
          },
        ],
      },
      on: {
        monsterKilled({ monster, area }, q) {
          if (monster?.id !== 'melvorD:Skeleton' || !GRAVEYARDS.includes(area?.id) || q.has(SKULL) || q.random() >= SKULL_CHANCE) return;
          q.give(SKULL);
          q.notify('The skeleton drops a skull. It feels strangely cold.', 'ghost');
        },
      },
    },
  },
};
