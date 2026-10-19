const MONSTER_YAW = 640;
const DEATH_HOLD_MS = 700;
const FADE_MS = 350;
const RANK = { stand: 0, block: 1, attack: 2, special: 2, death: 3 };

export function createMonsterStage({ character, loadData, stage, holder, antialias, tickMs, onReady }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'osrs-character-monster';
  stage.append(canvas);
  const renderer = character.createRenderer(canvas, { antialias });
  const files = new Map();
  let shown = null;
  let kind = 'stand';
  let frame = 0;
  let timer = 0;
  let place = null;
  let hideTimer = 0;

  const load = (file) => {
    if (!files.has(file)) files.set(file, loadData(`data/monsters/${file}`).catch(() => null));
    return files.get(file);
  };

  const pose = () => shown && character.npcPose(shown.data, shown.npc, kind);

  function draw() {
    if (!shown || !place || !renderer) return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(stage.clientWidth * ratio);
    const height = Math.round(place.height * ratio);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.style.left = '0px';
    canvas.style.width = `${stage.clientWidth}px`;
    canvas.style.height = `${place.height}px`;
    const posed = character.posedNpc(shown.data, shown.lit, shown.npc, kind, frame);
    renderer.draw(posed, {
      yaw: MONSTER_YAW,
      reference: shown.reference,
      place: { fit: place.fit * ratio, x: (holder.offsetLeft + holder.clientWidth / 2) * ratio, ground: height - place.groundGap * ratio },
    });
  }

  function step() {
    const current = pose();
    if (!current) {
      draw();
      return;
    }
    draw();
    const delay = Math.max(1, current.lengths[frame % current.lengths.length]) * tickMs;
    timer = setTimeout(() => {
      if (frame + 1 < current.frames.length) {
        frame++;
      } else if (kind === 'death') {
        hideTimer = setTimeout(() => canvas.classList.add('osrs-character-monster-gone'), DEATH_HOLD_MS);
        return;
      } else if (kind === 'stand') {
        frame = 0;
      } else {
        kind = 'stand';
        frame = 0;
      }
      step();
    }, delay);
  }

  function play(next) {
    if (!shown || !shown.npc.poses[next === 'special' ? 'special' : next]) return false;
    if (RANK[next] < RANK[kind] && kind !== 'stand') return false;
    clearTimeout(timer);
    kind = next;
    frame = 0;
    step();
    return true;
  }

  return {
    get active() {
      return shown !== null;
    },
    get body() {
      return shown?.body ?? null;
    },
    get monster() {
      return shown?.monster ?? null;
    },
    async show(monster, file) {
      if (shown?.monster === monster) return;
      const data = await load(file);
      if (!data || !renderer) return;
      const npc = data.npcs[0];
      const lit = character.npcModel(data, npc);
      const reference = character.posedNpc(data, lit, npc, 'stand', 0);
      clearTimeout(timer);
      clearTimeout(hideTimer);
      shown = { monster, data, npc, lit, reference, body: character.bodyOf(reference) };
      kind = 'stand';
      frame = 0;
      stage.classList.add('osrs-character-has-monster');
      canvas.classList.remove('osrs-character-monster-gone');
      onReady();
      step();
    },
    hide() {
      clearTimeout(timer);
      clearTimeout(hideTimer);
      shown = null;
      place = null;
      stage.classList.remove('osrs-character-has-monster');
    },
    place(next) {
      place = next;
      draw();
    },
    spawn() {
      clearTimeout(hideTimer);
      canvas.classList.remove('osrs-character-monster-gone');
      kind = 'stand';
      frame = 0;
      clearTimeout(timer);
      step();
    },
    attack(special) {
      const next = special && shown?.npc.poses.special ? 'special' : 'attack';
      if (kind !== next) play(next);
    },
    block() {
      if (kind === 'stand') play('block');
    },
    die() {
      if (!play('death')) {
        clearTimeout(timer);
        hideTimer = setTimeout(() => canvas.classList.add('osrs-character-monster-gone'), FADE_MS);
      }
    },
  };
}
