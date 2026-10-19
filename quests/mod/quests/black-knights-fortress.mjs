const CASTLE = 'melvorD:Castle_of_Kings';
const KNIGHT = 'melvorD:BlackKnight';
const CABBAGE = 'melvorD:Cabbage';
const KNIGHTS_TO_DEFEAT = 5;

export const quest = {
  id: 'osrsQuests:black_knights_fortress',
  name: 'Black Knights\' Fortress',
  difficulty: 'Novice',
  length: 'Short',
  questPoints: 3,
  requirements: [{ questPoints: 12 }],
  cast: { amik: 'osrsQuests:sir_amik_varze' },
  rewards: { gp: 2500, image: CABBAGE },
  stages: {
    start: {
      journal: ['I can start this quest by speaking to *Sir Amik Varze* in the *White Knights\' Castle* in *Falador*.'],
      talk: {
        amik: [
          { npc: 'amik', say: 'Ahh, it\'s good to see a warrior of your calibre. Have you come to help the White Knights?' },
          {
            options: {
              'I seek a quest!': [
                { player: 'I seek a quest!' },
                { npc: 'amik', say: ['Well, I need some spy work doing. The Black Knights are building a secret weapon in their fortress, and I need someone to find out what it is.', 'They know all my knights by sight. Fight your way into their castle, find out what they are up to, and sabotage it if you can.'] },
                { player: 'I\'ll do it.' },
                { do: (q) => q.setStage('fortress') },
              ],
              'I don\'t, I\'m just looking around.': [{ player: 'I don\'t, I\'m just looking around.' }, { npc: 'amik', say: 'Ok. Don\'t break anything.' }],
            },
          },
        ],
      },
    },
    fortress: {
      journal: (q) => [
        '*Sir Amik Varze* asked me to find out what the *Black Knights* are building in their fortress.',
        { text: `Fight my way into the fortress at the *Castle of Kings* (${Math.min(q.get('knights') ?? 0, KNIGHTS_TO_DEFEAT)}/${KNIGHTS_TO_DEFEAT} Black Knights)`, done: (q.get('knights') ?? 0) >= KNIGHTS_TO_DEFEAT },
      ],
      on: {
        monsterKilled({ monster, area }, q) {
          if (monster?.id !== KNIGHT || area?.id !== CASTLE) return;
          const knights = (q.get('knights') ?? 0) + 1;
          q.set('knights', knights);
          if (knights < KNIGHTS_TO_DEFEAT) return;
          q.notify('Inside the fortress, you overhear the Witch: her invincibility potion needs only one more ingredient, a cabbage!', 'amik');
          q.setStage('cabbage');
        },
      },
    },
    cabbage: {
      journal: (q) => [
        'I got into the fortress and overheard the Black Knights\' plan. Their *Witch* is brewing an *invincibility potion*, and the last ingredient is a *cabbage*.',
        { text: 'A rotten *cabbage* dropped down the grill should spoil it. Fight at the *Castle of Kings* again with a *cabbage* in my bank.', done: q.has(CABBAGE) },
      ],
      on: {
        monsterKilled({ monster, area }, q) {
          if (monster?.id !== KNIGHT || area?.id !== CASTLE || !q.take(CABBAGE)) return;
          q.notify('You drop a cabbage down the grill. The potion boils over and is ruined!', 'amik');
          q.setStage('report');
        },
      },
    },
    report: {
      journal: ['I ruined the *Witch\'s* potion with a cabbage. I should tell *Sir Amik Varze*.'],
      talk: {
        amik: [
          { player: 'I have ruined the Black Knights\' invincibility potion.' },
          { npc: 'amik', say: ['Yes, we have just received a message from the Black Knights saying they withdraw their demands, which seems to confirm your story.', 'You have done the White Knights a great service. Take this reward with our thanks.'] },
          { do: (q) => q.complete() },
        ],
      },
    },
  },
};
