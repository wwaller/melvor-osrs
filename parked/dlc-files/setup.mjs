const CHECK_MS = 1000;
const FADE_MS = 1500;
const MAX_SFX = 6;
const JINGLE_DUCK = 0.15;
const CUT_MS = 80;
const SAMPLE_RATE = 22050;
const MAX_TRACKS_IN_MEMORY = 2;
const WEAPON_PATTERNS = [
  [/claw/i, 'claw'],
  [/crossbow/i, 'crossbow'],
  [/javelin/i, 'javelin'],
  [/knife|dart|throwing|slingshot/i, 'thrown'],
  [/bow/i, 'bow'],
  [/\b2h\b|godsword|greatsword/i, 'twohand'],
  [/battleaxe|\baxe\b|war axe/i, 'axe'],
  [/mace|hammer|club|maul|warberd/i, 'crush'],
  [/scimitar|sabre|blade|cutlass|edge/i, 'slash'],
  [/dagger|sword|rapier|spear|exiles/i, 'stab'],
  [/staff|wand/i, 'staff'],
];

export async function setup(ctx) {
  const audio = await ctx.loadData('audio.json');
  const music = ctx.settings.section('Music');
  const effects = ctx.settings.section('Sound effects');
  const later = (fn) => () => setTimeout(fn);

  music.add([
    { type: 'switch', name: 'enabled', label: 'Play OSRS music', hint: 'Each skill, combat area, dungeon and menu has its own tracks, streamed from the OSRS Wiki.', default: true, onChange: later(syncMusic) },
    { type: 'switch', name: 'shuffle', label: 'Shuffle', hint: 'Pick a random track for the current context each time one ends. Off plays them in order.', default: true },
    { type: 'number', name: 'volume', label: 'Music volume', hint: '0 to 100', default: 30, min: 0, max: 100, onChange: later(applyVolume) },
    { type: 'switch', name: 'background', label: 'Keep playing when the game is hidden (desktop)', hint: 'Off pauses sound while the window is minimized. On phones, sound always stops when you leave the app.', default: true, onChange: later(onVisibility) },
  ]);
  effects.add([
    { type: 'switch', name: 'enabled', label: 'Play OSRS sound effects', hint: 'Nothing plays during offline progress.', default: true },
    { type: 'number', name: 'volume', label: 'Sound effect volume', hint: '0 to 100', default: 40, min: 0, max: 100, onChange: later(applyVolume) },
    { type: 'switch', name: 'levelups', label: 'Level-up jingles', hint: 'Music dips while the jingle plays.', default: true },
    { type: 'switch', name: 'combat', label: 'Weapon sounds', hint: 'One sound per attack, matched to your weapon type.', default: true },
    { type: 'switch', name: 'spells', label: 'Spell sounds', hint: 'Combat spells and Alt. Magic.', default: true },
    { type: 'switch', name: 'deaths', label: 'Monster death sounds', hint: 'Only for monsters with a matching OSRS sound.', default: true },
    { type: 'switch', name: 'skilling', label: 'Skilling sounds', hint: 'Mining, fishing, firemaking, smithing, herblore, agility, farming, cooking, thieving, archaeology, cartography and harvesting.', default: true },
    { type: 'number', name: 'skilling-gap', label: 'Seconds between skilling sounds', hint: '0 plays a sound for every action.', default: 0, min: 0, max: 600 },
    { type: 'switch', name: 'pets', label: 'Pet drop chime', hint: 'The OSRS unique drop sound when you find a pet.', default: true },
    { type: 'switch', name: 'catch-up', label: 'Replay level-ups and pets from offline progress', hint: 'When you come back, plays your latest level-up jingle, then the pet chime if you found one.', default: true },
  ]);

  const percent = (section) => Math.max(0, Math.min(100, Number(section.get('volume')) || 0)) / 100;
  let engine;
  let musicGain;
  let effectsGain;
  buildEngine();
  const tracks = new Map();
  let nowPlaying = null;
  let request = 0;
  let context = null;
  let playlist = [];
  let trackIndex = 0;
  let duck = 1;
  let characterLoaded = false;
  let ready = false;

  function buildEngine() {
    engine = createEngine();
    musicGain = engine.createGain();
    effectsGain = engine.createGain();
    musicGain.connect(engine.destination);
    effectsGain.connect(engine.destination);
  }

  function rampTo(param, value, seconds) {
    const now = engine.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  function applyVolume() {
    rampTo(musicGain.gain, music.get('enabled') ? percent(music) * duck : 0, 0.25);
    rampTo(effectsGain.gain, percent(effects), 0.05);
  }

  function contextKey() {
    if (!characterLoaded || typeof game === 'undefined') return 'charselect';
    const action = game.activeAction;
    if (action === game.combat && game.combat.selectedArea) return game.combat.selectedArea.id;
    if (action === game.golbinRaid) return 'melvorD:GolbinRaid';
    if (!action || !action.id) return 'idle';
    const realm = action.currentRealm;
    if (realm && realm !== game.defaultRealm && action.namespace === 'melvorD' && audio.music[realm.id]) return realm.id;
    return action.id;
  }

  function loadTrack(url) {
    if (!tracks.has(url)) {
      tracks.set(url, fetch(url).then((response) => response.arrayBuffer())
        .then((data) => engine.decodeAudioData(data))
        .then(toMono));
      while (tracks.size > MAX_TRACKS_IN_MEMORY) tracks.delete(tracks.keys().next().value);
    }
    return tracks.get(url);
  }

  function toMono(buffer) {
    if (buffer.numberOfChannels < 2) return buffer;
    const mono = engine.createBuffer(1, buffer.length, buffer.sampleRate);
    const out = mono.getChannelData(0);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    for (let i = 0; i < out.length; i++) out[i] = (left[i] + right[i]) / 2;
    return mono;
  }

  function stopTrack(track) {
    if (!track) return;
    rampTo(track.gain.gain, 0, FADE_MS / 1000);
    track.source.onended = null;
    track.source.stop(engine.currentTime + FADE_MS / 1000 + 0.05);
  }

  function crossfadeTo(path) {
    const ticket = ++request;
    const url = path.startsWith('http') ? path : ctx.getResourceUrl(path);
    loadTrack(url).then((buffer) => {
      if (ticket === request) startTrack(buffer);
    }).catch(() => {
      tracks.delete(url);
      if (ticket === request) setTimeout(playNext, 3000);
    });
  }

  function startTrack(buffer, offset = 0) {
    const source = engine.createBufferSource();
    const gain = engine.createGain();
    source.buffer = buffer;
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(musicGain);
    const track = { source, gain, startedAt: engine.currentTime - offset };
    source.onended = () => {
      if (nowPlaying === track) playNext();
    };
    stopTrack(nowPlaying);
    nowPlaying = track;
    source.start(0, offset);
    rampTo(gain.gain, 1, FADE_MS / 1000);
  }

  function pickTrack(previous) {
    if (playlist.length < 2) return 0;
    if (!music.get('shuffle')) return (previous + 1) % playlist.length;
    const choice = Math.floor(Math.random() * (playlist.length - 1));
    return choice >= previous ? choice + 1 : choice;
  }

  function playNext() {
    if (!playlist.length) return;
    trackIndex = pickTrack(trackIndex);
    crossfadeTo(playlist[trackIndex]);
  }

  const isMobile = typeof nativeManager !== 'undefined' && (nativeManager.isIOS || nativeManager.isAndroid);
  const silencedWhileHidden = () => document.hidden && (isMobile || !music.get('background'));

  function syncMusic() {
    if (!music.get('enabled')) {
      if (nowPlaying) {
        request++;
        stopTrack(nowPlaying);
        nowPlaying = null;
      }
      context = null;
      playlist = [];
      return;
    }
    const key = contextKey();
    if (key === context) return;
    context = key;
    const list = audio.music[key] || audio.music.idle || [];
    if (list.join() === playlist.join() && nowPlaying) return;
    playlist = list;
    trackIndex = music.get('shuffle') && key !== 'charselect' ? Math.floor(Math.random() * list.length) : 0;
    if (list.length) crossfadeTo(list[trackIndex]);
  }

  function rebuildEngine() {
    const old = engine;
    const track = nowPlaying;
    const position = track ? (old.currentTime - track.startedAt) % track.source.buffer.duration || 0 : 0;
    nowPlaying = null;
    playing.clear();
    channels.clear();
    old.close().catch(() => {});
    buildEngine();
    applyVolume();
    if (track && music.get('enabled')) startTrack(track.source.buffer, position);
    engine.resume();
  }

  let wasHidden = false;
  function onVisibility() {
    if (document.hidden) {
      wasHidden = true;
      if (silencedWhileHidden()) engine.suspend();
      return;
    }
    if (isMobile && wasHidden) rebuildEngine();
    else engine.resume();
    wasHidden = false;
  }
  ['pointerdown', 'touchend', 'keydown'].forEach((type) => document.addEventListener(type, () => {
    if (engine.state !== 'running' && !document.hidden) engine.resume();
  }, true));
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => {
    wasHidden = true;
    engine.suspend();
  });
  window.addEventListener('pageshow', onVisibility);
  applyVolume();
  setInterval(syncMusic, CHECK_MS);

  const buffers = new Map();
  const playing = new Set();
  const channels = new Map();

  function loadBuffer(path) {
    if (!buffers.has(path)) {
      buffers.set(path, fetch(ctx.getResourceUrl(path))
        .then((response) => response.arrayBuffer())
        .then((data) => engine.decodeAudioData(data))
        .catch(() => null));
    }
    return buffers.get(path);
  }

  function cut(sound) {
    playing.delete(sound);
    rampTo(sound.gain.gain, 0, CUT_MS / 1000);
    sound.source.stop(engine.currentTime + CUT_MS / 1000 + 0.01);
  }

  function playEffect(path, category, channel = category, onEnded = null) {
    if (!path || !ready || !effects.get('enabled') || !effects.get(category)) return false;
    if (typeof game === 'undefined' || !game._isInOnlineLoop) return false;
    loadBuffer(path).then((buffer) => {
      if (!buffer) return;
      const previous = channels.get(channel);
      if (previous && playing.has(previous)) cut(previous);
      if (playing.size >= MAX_SFX) return;
      const source = engine.createBufferSource();
      const gain = engine.createGain();
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(effectsGain);
      const sound = { source, gain };
      playing.add(sound);
      channels.set(channel, sound);
      source.onended = () => {
        playing.delete(sound);
        gain.disconnect();
        if (onEnded) onEnded();
      };
      source.start();
    });
    return true;
  }

  function playJingle(path, then = null) {
    const restore = () => {
      duck = 1;
      applyVolume();
    };
    const ended = () => {
      restore();
      if (then) then();
    };
    if (!playEffect(path, 'levelups', 'levelups', ended)) {
      if (then) then();
      return;
    }
    duck = JINGLE_DUCK;
    applyVolume();
    setTimeout(restore, 10000);
  }

  function weaponClass(player) {
    const weapon = player.equipment.getItemInSlot('melvorD:Weapon');
    if (!weapon || weapon === game.emptyEquipmentItem) return 'unarmed';
    const match = WEAPON_PATTERNS.find(([pattern]) => pattern.test(weapon.name));
    if (match) return match[1];
    return player.attackType === 'ranged' ? 'bow' : 'slash';
  }

  const lastSkillSound = new Map();
  function onSkillAction(skill) {
    const gap = Math.max(0, Number(effects.get('skilling-gap')) || 0) * 1000;
    const now = Date.now();
    if (now - (lastSkillSound.get(skill) || 0) < gap) return;
    if (skill === game.altMagic) {
      const spell = game.altMagic.selectedSpell;
      if (spell && playEffect(audio.sfx.spells[spell.id], 'spells', `skill:${skill.id}`)) lastSkillSound.set(skill, now);
    } else if (playEffect(audio.sfx.skills[skill.id], 'skilling', `skill:${skill.id}`)) {
      lastSkillSound.set(skill, now);
    }
  }

  let missed = { levelUp: null, pet: false };
  const isOffline = () => typeof game !== 'undefined' && !game._isInOnlineLoop;

  function flushMissed() {
    if (!ready || isOffline()) return;
    const { levelUp, pet } = missed;
    missed = { levelUp: null, pet: false };
    if (!effects.get('catch-up')) return;
    const chime = pet ? () => playEffect(audio.sfx.pet, 'pets') : null;
    if (levelUp) playJingle(levelUp, chime);
    else if (chime) chime();
  }

  function onLevelUp(_result, oldLevel, newLevel) {
    if (newLevel <= oldLevel) return;
    const high = newLevel >= 50 && audio.sfx.levelUpsHigh[this.id];
    const path = high || audio.sfx.levelUps[this.id] || audio.sfx.levelUpFallback;
    if (isOffline()) missed.levelUp = path;
    else playJingle(path);
  }
  ctx.patch(Skill, 'onLevelUp').after(onLevelUp);
  if (typeof Skill.prototype.onAbyssalLevelUp === 'function') ctx.patch(Skill, 'onAbyssalLevelUp').after(onLevelUp);

  ctx.patch(PetManager, 'unlockPet').replace(function (unlockPet, pet) {
    const isNew = !this.unlocked.has(pet);
    const result = unlockPet(pet);
    if (isNew && isOffline()) missed.pet = true;
    else if (isNew) playEffect(audio.sfx.pet, 'pets');
    return result;
  });

  ctx.onCharacterLoaded(() => {
    characterLoaded = true;
    game.skills.forEach((skill) => {
      if (typeof skill.on === 'function') skill.on('action', () => onSkillAction(skill));
    });
    if (game.cartography) game.cartography.on('survey', () => onSkillAction(game.cartography));
    game.on('offlineLoopExited', () => setTimeout(flushMissed, 500));
    const player = game.combat.player;
    player.on('attack', () => {
      if (player.attackType === 'magic') {
        const spell = player.spellSelection.attack;
        if (spell) playEffect(audio.sfx.spells[spell.id], 'spells', 'attack');
      } else {
        playEffect(audio.sfx.weapons[weaponClass(player)], 'combat', 'attack');
      }
    });
    game.combat.on('monsterKilled', (event) => playEffect(audio.sfx.monsters[event.monster.id], 'deaths'));
  });
  ctx.onInterfaceReady(() => {
    ready = true;
    setTimeout(flushMissed, 500);
    new Set(Object.values(audio.sfx).flatMap((group) => (typeof group === 'string' ? [group] : Object.values(group)))).forEach(loadBuffer);
  });

  console.log(`[OSRS Sounds] ${Object.keys(audio.music).length} music contexts, ${Object.keys(audio.sfx.spells).length} spell sounds`);
}

function createEngine() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  try {
    return new AudioContextClass({ sampleRate: SAMPLE_RATE });
  } catch (e) {
    return new AudioContextClass();
  }
}
