const CHECK_MS = 1000;
const FADE_MS = 1500;
const MAX_SFX = 8;
const FADE_OUT_MS = 60;
const DEBUG_LOG_SIZE = 200;
const CLOCK_SAMPLE_MS = 500;
const LEVEL_SAMPLES = 5;
const SILENT_TICKS = 3;
const TEST_TONE_SECONDS = 0.6;
const TEST_CHIME_WAIT_MS = 4000;
const RELEVANT_ERROR = /audio|decode|sound|media|play\(|osrs/i;
const CLOCK_CHECK_MS = 1000;
const CLOCK_RETRIES = 3;
const JINGLE_DUCK = 0.15;
const CUT_MS = 80;
const SAMPLE_RATE = 22050;
const MAX_TRACKS_IN_MEMORY = 2;
const RESTART_AFTER_SECONDS = 3;
const HISTORY_SIZE = 50;
const REPEAT_KEY = 'repeat-one';
const SONG_KEY = 'songs';
const FREE_CONTEXTS = new Set(['charselect', 'idle']);
const MEAN_WAIT_HOURS = [4, 20, 48, 72, 96];
const DEFAULT_ACTION_MS = 3000;
const HARVEST_COUNTS_AS_MS = 10 * 60 * 1000;
const MAX_SONG_TOASTS = 3;
const GUIDE = [
  {
    heading: 'Unlocking songs',
    rows: [
      ['icon', 'Every place has its own songs', 'Each skill and combat area has its own OSRS songs, as in OSRS. The login and idle music is always unlocked.'],
      ['assets/media/skills/woodcutting/woodcutting.png', 'The first song', 'A skill or combat area unlocks its first song the moment you train it or step into it, with a message at the top of the screen.'],
      ['assets/media/skills/combat/combat.png', 'The rest', 'Each action or attack after that has a small chance to unlock the next song.'],
    ],
  },
];
const UNLOCKED_GREEN = '#0dc10d';
const LOCKED_RED = '#ff2b2b';
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
  ctx.loadStylesheet('style.css');
  const audio = await ctx.loadData('audio.json');
  const music = ctx.settings.section('Music');
  const effects = ctx.settings.section('Sound effects');
  const debugLog = [];
  const note = (event) => {
    debugLog.push(`${new Date().toLocaleTimeString()} ${event}`);
    if (debugLog.length > DEBUG_LOG_SIZE) debugLog.shift();
  };
  const later = (name, fn) => (value) => {
    note(`setting ${name} changed to ${value}`);
    setTimeout(fn);
  };

  const musicSettings = [
    { type: 'switch', name: 'enabled', label: 'Play OSRS music', hint: 'Each skill, combat area, dungeon and menu has its own tracks, streamed from the OSRS Wiki.', default: true, onChange: later('enabled', syncMusic) },
    {
      type: 'dropdown',
      name: 'shuffle-mode',
      label: 'Shuffle',
      hint: 'No shuffle plays the tracks for what you are doing in order. Per-skill shuffle picks at random from them. Full shuffle picks from every track in the mod, whatever you are doing.',
      default: 'skill',
      options: [{ value: 'off', display: 'No shuffle' }, { value: 'skill', display: 'Per-skill shuffle' }, { value: 'all', display: 'Full shuffle' }],
      onChange: later('shuffle-mode', reshuffle),
    },
    { type: 'number', name: 'volume', label: 'Music volume', hint: '0 to 100', default: 30, min: 0, max: 100, onChange: later('volume', applyVolume) },
    { type: 'switch', name: 'animated-icon', label: 'Animated music button', hint: 'The music button in the top bar shows moving bars while a song plays. Off always shows the harp.', default: true, onChange: later('animated-icon', renderPlayer) },
    { type: 'switch', name: 'background', label: 'Keep playing in the background (desktop)', hint: 'Off pauses sound while the game window is minimized or another window is in front. On phones, sound always stops when you leave the app.', default: true, onChange: later('background', onVisibility) },
    { type: 'button', name: 'guide', display: '? How this mod works', color: 'info', onClick: () => showGuide() },
    { type: 'button', name: 'debug', display: 'Copy sound debug info', color: 'secondary', onClick: () => showDebugInfo() },
  ];
  const effectsSettings = [
    { type: 'switch', name: 'effects-enabled', label: 'Play OSRS sound effects', hint: 'Nothing plays during offline progress.', default: true },
    { type: 'number', name: 'effects-volume', label: 'Sound effect volume', hint: '0 to 100', default: 40, min: 0, max: 100, onChange: later('effects-volume', applyVolume) },
    { type: 'switch', name: 'levelups', label: 'Level-up jingles', hint: 'Music dips while the jingle plays.', default: true },
    { type: 'switch', name: 'combat', label: 'Weapon sounds', hint: 'One sound per attack, matched to your weapon type.', default: true },
    { type: 'switch', name: 'spells', label: 'Spell sounds', hint: 'Combat spells and Alt. Magic.', default: true },
    { type: 'switch', name: 'deaths', label: 'Death sounds', hint: 'The "You Are Dead!" jingle, and monster deaths that have an OSRS sound.', default: true },
    { type: 'switch', name: 'skilling', label: 'Skilling sounds', hint: 'The sound OSRS plays for each action, like the axe chop, the anvil or the furnace.', default: true },
    { type: 'number', name: 'skilling-gap', label: 'Seconds between skilling sounds', hint: '0 plays a sound for every action.', default: 0, min: 0, max: 600 },
    { type: 'switch', name: 'prayers', label: 'Prayer sounds', hint: 'Turning each prayer on and off, and burying bones.', default: true },
    { type: 'switch', name: 'eating', label: 'Eating sound', hint: 'Every time you eat, including auto-eat.', default: true },
    { type: 'switch', name: 'pets', label: 'Pet drop chime', hint: 'The OSRS unique drop sound when you find a pet.', default: true },
    { type: 'switch', name: 'catch-up', label: 'Replay what happened during offline progress', hint: 'When you come back, plays one jingle (your death, otherwise your latest level-up), then the pet chime if you found one.', default: true },
  ];
  music.add(musicSettings);
  effects.add(effectsSettings);
  ctx.settings.section('DANGER').add([
    { type: 'button', name: 'danger-unlock-all', display: 'Unlock All Songs', color: 'danger', onClick: () => confirmUnlockAll() },
  ]);

  const percent = (section, name) => Math.max(0, Math.min(100, Number(section.get(name)) || 0)) / 100;
  let engine;
  let masterGain;
  let musicGain;
  let effectsGain;
  let analyser;
  let enginesBuilt = 0;
  const stats = {
    trackLoads: 0, trackFailures: 0, lastTrackError: 'none', lastTrackLoadMs: null, lastTrackStarted: null,
    effectsPlayed: 0, lastEffect: 'none', effectsSkipped: {}, gestures: 0, lastGesture: null, clockStalls: 0, silentEpisodes: 0,
  };
  const resumeEngine = (reason) => {
    const target = engine;
    target.resume().then(() => note(`${reason}: resumed, now ${target.state}`)).catch((error) => note(`${reason}: resume failed: ${error}`));
  };

  buildEngine();
  const tracks = new Map();
  let nowPlaying = null;
  let request = 0;
  let context = null;
  let playlist = [];
  let trackIndex = 0;
  let duck = 1;
  let paused = null;
  let repeatOne = false;
  const history = [];
  const player = {};
  let characterLoaded = false;
  let ready = false;

  function buildEngine() {
    engine = createEngine();
    const built = engine;
    const number = ++enginesBuilt;
    built.onstatechange = () => note(`engine ${number} state ${built.state}`);
    built.addEventListener?.('sinkchange', () => note(`engine ${number} output device changed to ${built.sinkId || 'default'}`));
    built.addEventListener?.('error', (event) => note(`engine ${number} error: ${describeError(event.error ?? event)}`));
    masterGain = engine.createGain();
    musicGain = engine.createGain();
    effectsGain = engine.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(engine.destination);
    musicGain.connect(masterGain);
    effectsGain.connect(masterGain);
    analyser = engine.createAnalyser?.();
    if (analyser) {
      analyser.fftSize = 2048;
      masterGain.connect(analyser);
    }
    note(`built engine ${number}: ${built.state}, ${built.sampleRate} Hz`);
  }

  function signalLevel(meter = analyser) {
    if (!meter) return null;
    const samples = new Float32Array(meter.fftSize);
    if (meter.getFloatTimeDomainData) meter.getFloatTimeDomainData(samples);
    else {
      const bytes = new Uint8Array(meter.fftSize);
      meter.getByteTimeDomainData(bytes);
      bytes.forEach((byte, i) => (samples[i] = (byte - 128) / 128));
    }
    let peak = 0;
    let sum = 0;
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs(sample));
      sum += sample * sample;
    }
    return { peak, rms: Math.sqrt(sum / samples.length) };
  }

  function fadeIn() {
    rampTo(masterGain.gain, 1, 0.1);
  }

  function fadeOutAndSuspend() {
    rampTo(masterGain.gain, 0, FADE_OUT_MS / 1000);
    setTimeout(() => {
      if (inBackground()) engine.suspend();
    }, FADE_OUT_MS + 20);
  }

  /** iOS can freeze the page the moment it is hidden, so a fade might never finish: mute at once, and leave stopping the audio to a timer as before. */
  function muteThenSuspend() {
    const now = engine.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(0, now);
    setTimeout(() => {
      if (inBackground()) engine.suspend();
    }, FADE_OUT_MS + 20);
  }

  function rampTo(param, value, seconds) {
    const now = engine.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  function applyVolume() {
    rampTo(musicGain.gain, music.get('enabled') ? percent(music, 'volume') * duck : 0, 0.25);
    rampTo(effectsGain.gain, percent(effects, 'effects-volume'), 0.05);
  }

  function contextKey() {
    if (!characterLoaded || typeof game === 'undefined') return 'charselect';
    if (game.combat.isActive && game.combat.selectedArea) return game.combat.selectedArea.id;
    const action = game.activeAction;
    if (action === game.golbinRaid) return 'melvorD:GolbinRaid';
    // Multitasking-style mods make activeAction a wrapper around the actions they run.
    const running = action && !audio.music[action.id] && game.activeActions?.allObjects.find((each) => each !== action && each.isActive);
    if (running) return actionKey(running);
    if (action && action.id) return actionKey(action);
    return 'idle';
  }

  /** Base-game skills trained in another realm (the Abyss) play that realm's tracks; expansion skills keep their own. */
  function actionKey(action) {
    const realm = action.currentRealm;
    if (realm && realm !== game.defaultRealm && action.namespace === 'melvorD' && audio.music[realm.id]) return realm.id;
    return action.id;
  }

  function loadTrack(url) {
    if (!tracks.has(url)) {
      const started = Date.now();
      stats.trackLoads++;
      tracks.set(url, fetch(url).then(checkedBytes)
        .then((data) => engine.decodeAudioData(data))
        .then((buffer) => {
          stats.lastTrackLoadMs = Date.now() - started;
          return toMono(buffer);
        }));
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

  function crossfadeTo(path, remember = true) {
    const ticket = ++request;
    const url = path.startsWith('http') ? path : ctx.getResourceUrl(path);
    if (remember) {
      history.push(path);
      if (history.length > HISTORY_SIZE) history.shift();
    }
    if (playlist.includes(path)) trackIndex = playlist.indexOf(path);
    loadTrack(url).then((buffer) => {
      if (ticket === request) startTrack(buffer, 0, path);
    }).catch((error) => {
      tracks.delete(url);
      stats.trackFailures++;
      stats.lastTrackError = `${trackTitle(path)}: ${describeError(error)}`;
      note(`song failed: ${stats.lastTrackError}`);
      if (ticket === request) setTimeout(playNext, 3000);
    });
  }

  function startTrack(buffer, offset, path) {
    const source = engine.createBufferSource();
    const gain = engine.createGain();
    source.buffer = buffer;
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(musicGain);
    const track = { source, gain, path, startedAt: engine.currentTime - offset };
    source.onended = () => {
      if (nowPlaying !== track) return;
      if (repeatOne) {
        startTrack(track.source.buffer, 0, track.path);
        return;
      }
      playNext();
    };
    stopTrack(nowPlaying);
    nowPlaying = track;
    source.start(0, offset);
    stats.lastTrackStarted = Date.now();
    note(`playing ${trackTitle(path)}${offset ? ` from ${offset.toFixed(0)}s` : ''}, audio ${engine.state}`);
    rampTo(gain.gain, 1, FADE_MS / 1000);
    renderPlayer();
  }

  const positionOf = (track) => (engine.currentTime - track.startedAt) % track.source.buffer.duration || 0;

  function pauseMusic() {
    if (!nowPlaying) return;
    paused = { path: nowPlaying.path, buffer: nowPlaying.source.buffer, position: positionOf(nowPlaying) };
    request++;
    stopTrack(nowPlaying);
    nowPlaying = null;
    renderPlayer();
  }

  function resumeMusic() {
    const was = paused;
    paused = null;
    if (was) startTrack(was.buffer, was.position, was.path);
    else if (playlist.length) crossfadeTo(playlist[trackIndex]);
    renderPlayer();
  }

  function skipForward() {
    paused = null;
    playNext();
  }

  function pickSong(path) {
    if (!path || !isUnlocked(path)) return;
    paused = null;
    crossfadeTo(path);
  }

  function toggleRepeat() {
    repeatOne = !repeatOne;
    ctx.accountStorage?.setItem(REPEAT_KEY, repeatOne);
    renderPlayer();
  }

  /** Like any music player: early in a song, back goes to the previous one; later on, it starts this one again. */
  function skipBack() {
    const position = nowPlaying ? positionOf(nowPlaying) : paused?.position ?? 0;
    paused = null;
    if (history.length > 1 && position <= RESTART_AFTER_SECONDS) history.pop();
    const target = history.at(-1);
    if (target) crossfadeTo(target, false);
  }

  function pickTrack(previous) {
    if (playlist.length < 2) return 0;
    if (music.get('shuffle-mode') === 'off') return (previous + 1) % playlist.length;
    const choice = Math.floor(Math.random() * (playlist.length - 1));
    return choice >= previous ? choice + 1 : choice;
  }

  function playNext() {
    if (!playlist.length) return;
    trackIndex = pickTrack(trackIndex);
    crossfadeTo(playlist[trackIndex]);
  }

  const isMobile = typeof nativeManager !== 'undefined' && (nativeManager.isIOS || nativeManager.isAndroid);
  let windowFocused = true;
  const inBackground = () => document.hidden || !windowFocused;
  const silencedInBackground = () => inBackground() && !music.get('background');

  let allTracks = null;
  const everyTrack = () => (allTracks ??= [...new Set(Object.entries(audio.music).filter(([key]) => key !== 'charselect').flatMap(([, list]) => list))]);

  function reshuffle() {
    context = null;
    syncMusic();
  }

  function syncMusic() {
    if (!music.get('enabled')) {
      if (nowPlaying) {
        request++;
        stopTrack(nowPlaying);
        nowPlaying = null;
      }
      paused = null;
      context = null;
      playlist = [];
      renderPlayer();
      return;
    }
    const key = contextKey();
    unlockFirstSong(key);
    const shuffle = music.get('shuffle-mode');
    const list = playableSongs(key, shuffle);
    if (key === context || (shuffle === 'all' && nowPlaying && list.includes(nowPlaying.path))) {
      context = key;
      if (list.join() !== playlist.join()) {
        playlist = list;
        trackIndex = Math.max(0, list.indexOf(nowPlaying?.path));
      }
      return;
    }
    note(`music for ${key}: ${list.length} unlocked song${list.length === 1 ? '' : 's'}`);
    context = key;
    if (list.join() === playlist.join() && nowPlaying) return;
    playlist = list;
    trackIndex = shuffle !== 'off' && key !== 'charselect' ? Math.floor(Math.random() * list.length) : 0;
    if (list.length && !paused && !(nowPlaying && repeatOne)) crossfadeTo(list[trackIndex]);
  }

  /** Only unlocked songs play; a place with none of its own (or none unlocked yet) falls back to the idle music. */
  function playableSongs(key, shuffle) {
    const pool = shuffle === 'all' && key !== 'charselect' ? everyTrack() : audio.music[key] || audio.music.idle || [];
    const list = pool.filter(isUnlocked);
    return list.length ? list : (audio.music.idle || []);
  }

  const songStem = (path) => decodeURIComponent(path.split('?')[0].split('/').pop()).replace(/\.ogg$/i, '');
  const freeSongs = new Set([...FREE_CONTEXTS].flatMap((key) => audio.music[key] ?? []).map(songStem));
  let unlocked = new Set();
  let missedSongs = [];
  const isUnlocked = (path) => freeSongs.has(songStem(path)) || unlocked.has(songStem(path));

  function unlockSong(path) {
    if (!path || isUnlocked(path)) return;
    unlocked.add(songStem(path));
    ctx.characterStorage.setItem(SONG_KEY, [...unlocked]);
    if (isOffline()) missedSongs.push(path);
    else announceSongs([path]);
    renderPlayer();
  }

  function unlockFirstSong(key) {
    const list = audio.music[key];
    if (characterLoaded && list && !FREE_CONTEXTS.has(key) && !isUnlocked(list[0])) unlockSong(list[0]);
  }

  /** Like OSRS: a place's first song unlocks the moment you are there; after that every action or attack has a small chance at the next one, about 4 hours of play for the second and a day for the third. */
  function rollForSong(key, intervalMs) {
    const list = audio.music[key];
    if (!list || FREE_CONTEXTS.has(key)) return;
    if (!isUnlocked(list[0])) {
      unlockSong(list[0]);
      return;
    }
    const have = list.filter(isUnlocked).length;
    if (have >= list.length) return;
    const hours = MEAN_WAIT_HOURS[Math.min(have - 1, MEAN_WAIT_HOURS.length - 1)];
    if (Math.random() < (Number(intervalMs) || DEFAULT_ACTION_MS) / (hours * 3600000)) unlockSong(list.find((path) => !isUnlocked(path)));
  }

  function announceSongs(paths) {
    if (typeof fireTopToast !== 'function' || paths.length === 0) return;
    const congrats = typeof getLangString === 'function' ? getLangString('COMPLETION_CONGRATS') : 'Congratulations!';
    const toast = (message) => fireTopToast(`<div class="block block-rounded-double bg-dark p-2">
  <div class="media d-flex align-items-center push">
    <div class="mr-2"><img class="skill-icon-md" src="${ctx.getResourceUrl('icon.png')}"></div>
    <div class="media-body text-left">
      <div class="font-w700 font-size-lg text-success">${escapeHtml(congrats)}</div>
      <div class="font-size-sm">${message}</div>
    </div>
  </div>
</div>`, 5000);
    if (paths.length > MAX_SONG_TOASTS) toast(`You have unlocked ${paths.length} new music tracks.`);
    else paths.forEach((path) => toast(`You have unlocked a new music track: <span class="font-w600">${escapeHtml(trackTitle(path))}</span>`));
  }

  function unlockEverySong() {
    if (!characterLoaded) return;
    const fresh = songList().filter((path) => !isUnlocked(path));
    fresh.forEach((path) => unlocked.add(songStem(path)));
    ctx.characterStorage.setItem(SONG_KEY, [...unlocked]);
    announceSongs(fresh);
    renderPlayer();
  }

  /** Unlocking everything skips the whole progression, so it warns hard and defaults to cancel. */
  function confirmUnlockAll() {
    if (!characterLoaded || typeof SwalLocale === 'undefined') return;
    const element = (tag, className = '', text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
    const body = element('div', 'osrs-music-danger font-size-sm text-left');
    const words = element('div');
    words.append(
      element('p', '', 'Songs r earned as u play, same as OSRS. Train a skill or step into a combat area and its first song unlocks right away. After that, every action or attack has a small chance at the next one.'),
      element('p', 'text-danger font-w700 mb-0', 'This skips all of that and gives this character every song at once. No more "You have unlocked a new music track!" popups. Only do it if u really, really want to :\'('),
    );
    body.append(Object.assign(element('img', 'osrs-music-crying'), { src: ctx.getResourceUrl('cry.gif'), width: 82, height: 206, alt: '' }), words);
    SwalLocale.fire({
      title: 'Unlock All Songs?',
      html: body,
      showCancelButton: true,
      focusCancel: true,
      reverseButtons: true,
      cancelButtonText: "Nah, I'll earn them",
      confirmButtonText: "I don't care, unlock all",
      customClass: { container: 'swal-infront', title: 'text-danger', confirmButton: 'btn btn-danger m-1', cancelButton: 'btn btn-success m-1' },
    }).then((result) => {
      if (result.isConfirmed) unlockEverySong();
    });
  }

  function flushSongs() {
    if (isOffline()) return;
    const paths = missedSongs;
    missedSongs = [];
    announceSongs(paths);
  }

  let allSongs = null;
  const songList = () => (allSongs ??= [...new Set(Object.values(audio.music).flat())].sort((a, b) => trackTitle(a).localeCompare(trackTitle(b))));
  const songPlaces = new Map();
  for (const [key, list] of Object.entries(audio.music)) for (const path of list) songPlaces.set(path, [...(songPlaces.get(path) ?? []), key]);
  /** In Adventure mode a song only shows in the list once one of the skills it plays for is unlocked, or if it also plays outside a skill. */
  const songShown = (path) => songPlaces.get(path).some((key) => {
    const skill = typeof game !== 'undefined' ? game.skills?.getObjectByID?.(key) : undefined;
    return !skill || skill.isUnlocked !== false;
  });

  /**
   * The music button in the top bar, next to the potions: moving bars while a song plays, otherwise the harp, and a player with the
   * song's name, pause, back, next, repeat, and the OSRS song list (green for unlocked, red for locked).
   */
  function buildPlayer() {
    const potions = typeof document.getElementById === 'function' ? document.getElementById('page-header-potions-dropdown') : null;
    const bar = potions?.closest('.d-flex');
    if (!bar) {
      note(`music button not added: top bar ${potions ? 'row' : 'potions button'} not found`);
      return;
    }
    const element = (tag, className = '') => Object.assign(document.createElement(tag), { className });
    const image = (path, className) => Object.assign(element('img', className), { src: ctx.getResourceUrl(path), alt: '' });
    const root = element('div', 'dropdown d-inline-block mr-1 osrs-music');
    const button = element('button', 'btn btn-sm btn-dual text-combat-smoke osrs-music-button');
    button.type = 'button';
    button.setAttribute('data-toggle', 'dropdown');
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    const bars = element('span', 'osrs-music-bars');
    for (let i = 0; i < 4; i++) bars.append(element('i'));
    button.append(bars, image('icon.png', 'osrs-music-harp'));
    const panel = element('div', 'dropdown-menu dropdown-menu-right font-size-sm osrs-music-panel');
    panel.addEventListener('click', (event) => event.stopPropagation());
    const help = element('button', 'btn btn-sm btn-link osrs-music-help');
    help.type = 'button';
    help.title = 'How this mod works';
    help.setAttribute('aria-label', 'How this mod works');
    help.append(element('i', 'fa fa-question-circle'));
    help.addEventListener('click', () => {
      if (typeof $ === 'function') $(button).dropdown('hide');
      showGuide();
    });
    panel.append(help);
    const label = element('div', 'osrs-music-label');
    const title = element('div', 'osrs-music-title');
    const controls = element('div', 'osrs-music-controls');
    const control = (action, name, onClick) => {
      const control = element('button', 'btn btn-sm btn-secondary');
      control.type = 'button';
      control.setAttribute('data-action', action);
      control.addEventListener('click', onClick);
      const icon = element('i');
      control.append(icon);
      return { control, icon, name };
    };
    const back = control('back', 'Previous', skipBack);
    const toggle = control('toggle', 'Pause', () => (paused ? resumeMusic() : pauseMusic()));
    const next = control('next', 'Next', skipForward);
    const repeat = control('repeat', 'Repeat this song', toggleRepeat);
    repeat.badge = element('span', 'osrs-music-repeat-one');
    repeat.badge.textContent = '1';
    repeat.control.append(repeat.badge);
    controls.append(back.control, toggle.control, next.control, repeat.control);
    const songs = element('div', 'osrs-music-picker');
    const songsToggle = element('button', 'btn btn-sm btn-secondary btn-block osrs-music-picker-toggle');
    songsToggle.type = 'button';
    songsToggle.setAttribute('aria-haspopup', 'listbox');
    const songsLabel = element('span', 'osrs-music-picker-label');
    songsToggle.append(songsLabel, element('i', 'fa fa-caret-down'));
    const songsList = element('div', 'osrs-music-song-list d-none');
    songsList.setAttribute('role', 'listbox');
    const songItems = new Map();
    for (const path of songList()) {
      const item = element('button', 'dropdown-item osrs-music-song');
      item.type = 'button';
      item.textContent = trackTitle(path);
      item.addEventListener('click', () => {
        songsList.classList.add('d-none');
        pickSong(path);
      });
      songItems.set(path, item);
      songsList.append(item);
    }
    const songsCount = element('div', 'osrs-music-count');
    songsToggle.addEventListener('click', () => {
      songsList.classList.toggle('d-none');
      renderSongList();
      const current = songItems.get(nowPlaying?.path ?? paused?.path);
      if (current && typeof current.offsetTop === 'number') songsList.scrollTop = current.offsetTop - songsList.clientHeight / 2;
    });
    songs.append(songsToggle, songsList, songsCount);
    panel.append(label, title, controls, songs);
    root.append(button, panel);
    bar.prepend(root);
    repeatOne = ctx.accountStorage?.getItem(REPEAT_KEY) === true;
    Object.assign(player, { root, button, label, title, back, toggle, next, repeat, songsToggle, songsLabel, songsList, songsCount, songItems });
    renderPlayer();
  }

  /** Like the OSRS music tab: unlocked songs in green at the top, locked ones in red below, each group alphabetical. */
  let guide = null;
  /** The mod's guide, laid out like Melvor's own Game Guide. */
  function showGuide() {
    if (typeof $ !== 'function' || typeof document.createElement !== 'function') return;
    if (typeof Swal !== 'undefined' && Swal.isVisible?.()) Swal.close();
    if (!guide) guide = buildGuide();
    $(guide).modal('show');
  }

  function buildGuide() {
    const element = (tag, className = '', text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
    const media = (path) => (path === 'icon' ? ctx.getResourceUrl('icon.png') : typeof assets !== 'undefined' ? assets.getURI(path) : path);
    const image = (path, size, className = 'm-2') => Object.assign(element('img', className), { src: media(path), height: size, alt: '' });
    const modal = element('div', 'modal osrs-music-guide');
    modal.tabIndex = -1;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const dialog = element('div', 'modal-dialog modal-lg');
    const content = element('div', 'modal-content');
    const block = element('div', 'block block-themed block-transparent mb-0');
    const header = element('div', 'block-header bg-primary-dark');
    const close = element('button', 'btn-block-option');
    close.type = 'button';
    close.setAttribute('data-dismiss', 'modal');
    close.setAttribute('aria-label', 'Close');
    close.append(element('i', 'fa fa-fw fa-times'));
    const options = element('div', 'block-options');
    options.append(close);
    header.append(element('h3', 'block-title', 'Game Guide'), options);
    const body = element('div', 'block-content block-content-full');
    const page = element('div', 'py-2 text-center');
    const title = element('h2', 'h1 mb-2');
    title.append(image('icon', 64), document.createTextNode('OSRS Music & Sounds'));
    page.append(title, element('h5', 'font-w400 mb-5', 'Old School RuneScape music and sound effects for Melvor Idle. Songs unlock as you play :3'));
    const columns = element('div', 'row row-deck');
    for (const section of GUIDE) {
      const column = element('div', 'col-12');
      const inner = element('div', 'block-content block-content-full');
      const heading = element('div', 'py-2 text-left');
      heading.append(element('h4', 'mb-2', section.heading));
      inner.append(heading);
      for (const [icon, name, text] of section.rows) {
        const row = element('div', 'media d-flex align-items-center push');
        const art = element('div', 'mr-3');
        art.append(image(icon, 48));
        const words = element('div', 'media-body text-left');
        words.append(element('div', 'font-w600', name), element('div', 'font-w400 font-size-sm', text));
        row.append(art, words);
        inner.append(row);
      }
      column.append(inner);
      columns.append(column);
    }
    const grid = element('div', 'col-12');
    grid.append(columns);
    page.append(grid);
    body.append(page);
    block.append(header, body);
    content.append(block);
    dialog.append(content);
    modal.append(dialog);
    document.body.append(modal);
    return modal;
  }

  function renderSongList() {
    let shown = 0;
    let open = 0;
    let reordered = false;
    for (const [path, item] of player.songItems) {
      const visible = songShown(path);
      const free = isUnlocked(path);
      if (item.classList.contains('d-none') === visible) item.classList.toggle('d-none', !visible);
      if (item.classList.contains('osrs-music-unlocked') !== free || item.classList.contains('osrs-music-locked') === free) {
        item.classList.toggle('osrs-music-unlocked', free);
        item.classList.toggle('osrs-music-locked', !free);
        item.disabled = !free;
        item.title = free ? '' : 'Not unlocked yet';
        item.style.setProperty('color', free ? UNLOCKED_GREEN : LOCKED_RED, 'important');
        reordered = true;
      }
      if (visible) {
        shown++;
        if (free) open++;
      }
    }
    if (reordered) {
      const paths = [...player.songItems.keys()];
      const items = (paths) => paths.map((path) => player.songItems.get(path));
      player.songsList.append(...items(paths.filter(isUnlocked)), ...items(paths.filter((path) => !isUnlocked(path))));
    }
    player.songsCount.textContent = `${open} of ${shown} songs unlocked`;
  }

  function renderPlayer() {
    if (!player.button) return;
    renderSongList();
    const on = music.get('enabled') !== false;
    const current = nowPlaying?.path ?? paused?.path;
    const playingNow = Boolean(on && nowPlaying);
    player.button.classList.toggle('is-playing', playingNow);
    player.button.classList.toggle('is-animated', music.get('animated-icon') !== false);
    player.button.title = playingNow ? `Now playing: ${trackTitle(current)}` : 'OSRS music';
    player.label.textContent = !on ? 'Music is off' : paused ? 'Paused' : 'Now playing';
    player.title.textContent = on && current ? trackTitle(current) : '-';
    const icons = { back: 'fa-step-backward', toggle: paused ? 'fa-play' : 'fa-pause', next: 'fa-step-forward', repeat: 'fa-redo' };
    for (const key of ['back', 'toggle', 'next', 'repeat']) {
      const { control, icon, name } = player[key];
      const label = key === 'toggle' && paused ? 'Resume' : name;
      icon.className = `fa ${icons[key]}`;
      control.title = label;
      control.setAttribute('aria-label', label);
      control.disabled = !on;
    }
    player.repeat.control.classList.toggle('active', repeatOne);
    player.repeat.control.setAttribute('aria-pressed', String(repeatOne));
    player.songsToggle.disabled = !on;
    player.songsLabel.textContent = on && current ? trackTitle(current) : 'Play a song...';
    for (const [path, item] of player.songItems) {
      const playingThis = on && path === current;
      if (item.classList.contains('active') !== playingThis) item.classList.toggle('active', playingThis);
    }
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
    fadeIn();
    try {
      if (track && music.get('enabled')) startTrack(track.source.buffer, position, track.path);
    } catch (error) {
      note(`restarting the song failed: ${error}`);
    }
    note(`rebuilt audio (song ${track ? 'restarted' : 'none playing'})`);
    resumeEngine('rebuild');
  }

  /**
   * After a quick lock and unlock, iOS can hand back an audio context that says "running" while its clock never moves,
   * so nothing plays and no fade completes. Rebuild until the clock moves; if it never does, the next tap rebuilds it.
   */
  let clockStuck = false;
  function watchClock(retriesLeft) {
    const watched = engine;
    const start = watched.currentTime;
    setTimeout(() => {
      if (watched !== engine || document.hidden || watched.state !== 'running') return;
      clockStuck = watched.currentTime === start;
      if (!clockStuck) return;
      note(`audio clock stuck at ${start.toFixed(1)}s`);
      if (retriesLeft > 0) {
        rebuildEngine();
        watchClock(retriesLeft - 1);
      }
    }, CLOCK_CHECK_MS);
  }

  let wasHidden = false;
  function onVisibility() {
    note(`page ${document.hidden ? 'hidden' : 'visible'}, audio ${engine.state}`);
    if (isMobile && document.hidden) {
      wasHidden = true;
      muteThenSuspend();
      return;
    }
    if (!isMobile && inBackground()) {
      if (silencedInBackground()) fadeOutAndSuspend();
      return;
    }
    if (isMobile && (wasHidden || engine.state !== 'running')) {
      rebuildEngine();
      watchClock(CLOCK_RETRIES);
    } else {
      resumeEngine('page visible');
      fadeIn();
    }
    wasHidden = false;
  }
  ['pointerdown', 'touchend', 'keydown'].forEach((type) => document.addEventListener(type, () => {
    stats.gestures++;
    stats.lastGesture = Date.now();
    if (inBackground()) return;
    if (clockStuck) {
      note(`${type} tap: rebuilding stuck audio`);
      clockStuck = false;
      rebuildEngine();
      watchClock(0);
      return;
    }
    if (engine.state === 'running') return;
    resumeEngine(`${type} tap`);
    fadeIn();
  }, true));
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => {
    note('page hide');
    wasHidden = true;
    if (isMobile) muteThenSuspend();
    else fadeOutAndSuspend();
  });
  if (!isMobile) {
    window.addEventListener('blur', () => {
      windowFocused = false;
      onVisibility();
    });
    window.addEventListener('focus', () => {
      windowFocused = true;
      onVisibility();
    });
  }
  window.addEventListener('pageshow', onVisibility);
  document.addEventListener('freeze', () => note('page frozen by the browser'));
  document.addEventListener('resume', () => note(`page unfrozen, audio ${engine.state}`));
  window.addEventListener('error', (event) => {
    const text = `${event.message ?? ''} ${event.filename ?? ''}`;
    if (RELEVANT_ERROR.test(text)) note(`page error: ${text.trim()}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const text = describeError(event.reason);
    if (RELEVANT_ERROR.test(text)) note(`unhandled: ${text}`);
  });

  const songAudible = () => Boolean(nowPlaying && music.get('enabled') && percent(music, 'volume') > 0
    && engine.currentTime - nowPlaying.startedAt < nowPlaying.source.buffer.duration);

  let clockSample = null;
  let clockStalled = false;
  let silentTicks = 0;
  /** Once a second: is the device still taking sound from the game, and is a playing song making any sound? */
  function watchHealth() {
    const now = Date.now();
    const previous = clockSample;
    clockSample = { engine, time: engine.currentTime, wall: now };
    if (!previous || previous.engine !== engine || engine.state !== 'running' || document.hidden) return;
    const wall = (now - previous.wall) / 1000;
    const moved = clockSample.time - previous.time;
    const stalled = wall > 0.5 && moved < wall * 0.1;
    if (stalled !== clockStalled) {
      clockStalled = stalled;
      if (stalled) stats.clockStalls++;
      note(stalled ? `audio clock stopped: the device is not taking sound from the game (${moved.toFixed(2)}s in ${wall.toFixed(2)}s)` : 'audio clock moving again');
    }
    const level = signalLevel();
    if (!level || !songAudible() || masterGain.gain.value < 0.01) {
      silentTicks = 0;
      return;
    }
    silentTicks = level.peak > 0 ? 0 : silentTicks + 1;
    if (silentTicks === SILENT_TICKS) {
      stats.silentEpisodes++;
      note(`${trackTitle(nowPlaying.path)} is playing but the game's sound has been silent for ${SILENT_TICKS}s`);
    }
  }

  async function measureOutput() {
    const target = engine;
    const startClock = target.currentTime;
    const startWall = performance.now();
    const startStamp = attempt(() => target.getOutputTimestamp());
    let peak = null;
    let rms = 0;
    for (let i = 0; i < LEVEL_SAMPLES; i++) {
      await wait(CLOCK_SAMPLE_MS / LEVEL_SAMPLES);
      const level = signalLevel();
      if (level) {
        peak = Math.max(peak ?? 0, level.peak);
        rms = Math.max(rms, level.rms);
      }
    }
    const wall = (performance.now() - startWall) / 1000;
    const moved = target.currentTime - startClock;
    const endStamp = attempt(() => target.getOutputTimestamp());
    const moving = moved > wall * 0.5;
    const lines = [`audio clock: moved ${moved.toFixed(2)}s in ${wall.toFixed(2)}s of real time (${moving ? 'the device is taking sound from the game' : 'NOT moving: the device is not taking sound from the game'})`];
    if (startStamp && endStamp) {
      const running = endStamp.performanceTime > startStamp.performanceTime;
      lines.push(`speaker timestamp: ${startStamp.performanceTime.toFixed(0)} to ${endStamp.performanceTime.toFixed(0)} ms (${running ? 'output running' : 'output not running'})`);
    } else {
      lines.push('speaker timestamp: not reported');
    }
    lines.push(`game sound level now: ${peak === null ? 'cannot be measured here' : `peak ${decibels(peak)}, average ${decibels(rms)}`}`);
    let verdict;
    if (target.state !== 'running') verdict = `audio is ${target.state}: the phone or browser has not let the game start sound. Tap anywhere in the game once, then copy this again.`;
    else if (!moving) verdict = 'the audio engine says running, but the device is not taking any sound from it. Another app may be holding the audio, or the phone paused the app. Closing and reopening the app usually fixes it.';
    else if (peak === 0 && songAudible()) verdict = 'the device is taking sound, but the game is sending silence while a song should be playing. Check the volumes above.';
    else if (peak > 0) verdict = 'the game is sending sound to the device right now. If you hear nothing, the sound is lost after the game: media volume, silent mode, Bluetooth, or another output.';
    else verdict = 'the device is taking sound from the game, but nothing is playing at this moment.';
    return { lines, verdict };
  }

  async function debugReport() {
    const lines = [];
    const add = (...rows) => lines.push(...rows);
    const heading = (title) => add('', `== ${title} ==`);
    const native = typeof nativeManager !== 'undefined' ? nativeManager : {};
    const flag = (name) => safe(() => native[name]);
    const agent = String(safe(() => navigator.userAgent, ''));
    const version = (pattern) => agent.match(pattern)?.[1]?.replace(/_/g, '.') ?? '-';
    const gain = (node) => safe(() => node.gain.value.toFixed(2));
    const show = (value) => (value && typeof value === 'object' ? JSON.stringify(value) : String(value));

    add(`OSRS Sounds ${safe(() => ctx.version || undefined, '?')} on Melvor ${safe(() => gameVersion, '?')}, ${new Date().toString()}`);

    heading('Device');
    add(`user agent: ${agent}`);
    add(`app engine: ${appEngine(agent)}`);
    add(`versions: Android ${version(/Android ([\d.]+)/)}, iOS ${version(/OS (\d+[_\d]*) like Mac/)}, Chrome ${version(/Chrome\/([\d.]+)/)}, Firefox ${version(/Firefox\/([\d.]+)/)}, Safari ${version(/Version\/([\d.]+)/)}`);
    add(`browser: ${safe(() => navigator.userAgentData.brands.map((brand) => `${brand.brand} ${brand.version}`).join(', '))}, platform ${safe(() => navigator.userAgentData?.platform || navigator.platform)}`);
    add(`Melvor sees: iOS ${flag('isIOS')}, Android ${flag('isAndroid')}, GeckoView ${flag('isGeckoView')}, mobile ${flag('isMobile')}, phone app ${flag('isNativeApp')}, Steam ${flag('isSteam')}, Epic ${flag('isEpicGames')}`);
    add(`site: ${safe(() => location.origin + location.pathname)}`);
    add(`screen: ${safe(() => `${screen.width}x${screen.height}`)} at ${safe(() => devicePixelRatio)}x, window ${safe(() => `${innerWidth}x${innerHeight}`)}`);
    add(`cores ${safe(() => navigator.hardwareConcurrency)}, memory ${safe(() => navigator.deviceMemory)} GB, language ${safe(() => navigator.language)}`);
    add(`network: online ${safe(() => navigator.onLine)}, type ${safe(() => navigator.connection.effectiveType)}, data saver ${safe(() => navigator.connection.saveData)}`);
    const battery = await settle(attempt(() => navigator.getBattery?.()));
    add(`battery: ${battery ? `${Math.round(battery.level * 100)}%, ${battery.charging ? 'charging' : 'not charging'}` : 'not reported'}`);
    add(`page: ${safe(() => document.visibilityState)}, hidden ${document.hidden}, focused ${safe(() => document.hasFocus())}, open for ${(performance.now() / 60000).toFixed(1)} min, reloaded after the phone dropped it ${safe(() => document.wasDiscarded)}`);

    heading('Permission to play sound');
    add(`page touched or clicked yet: ${safe(() => navigator.userActivation.hasBeenActive)}, being touched now ${safe(() => navigator.userActivation.isActive)}`);
    add(`taps and keys seen by this mod: ${stats.gestures}, last ${ago(stats.lastGesture)}`);
    add(`autoplay policy (Firefox and GeckoView only): audio engine ${safe(() => navigator.getAutoplayPolicy?.('audiocontext'))}, audio players ${safe(() => navigator.getAutoplayPolicy?.('mediaelement'))}`);
    add(`iOS audio session: ${safe(() => navigator.audioSession?.type)}, state ${safe(() => navigator.audioSession?.state)}`);
    add(`media session: ${safe(() => navigator.mediaSession?.playbackState, 'none')}`);
    const probe = attempt(() => document.createElement('audio'));
    const can = (type) => {
      const answer = safe(() => probe?.canPlayType?.(type));
      return answer === '' ? 'no' : answer;
    };
    add(`formats: Ogg Vorbis ${can('audio/ogg; codecs="vorbis"')}, Ogg Opus ${can('audio/ogg; codecs="opus"')}, MP3 ${can('audio/mpeg')}, WAV ${can('audio/wav')}`);
    add(`Web Audio: ${safe(() => (window.AudioContext ? 'AudioContext' : window.webkitAudioContext ? 'webkitAudioContext (old)' : 'missing'))}`);

    heading("Is the device playing the game's sound?");
    add(`audio engine ${enginesBuilt}: ${engine.state}, ${engine.sampleRate} Hz (asked for ${SAMPLE_RATE}), latency ${safe(() => engine.baseLatency?.toFixed(3), '-')}s, output latency ${safe(() => engine.outputLatency?.toFixed(3), '-')}s, output device ${safe(() => engine.sinkId || (engine.sinkId === '' ? 'default' : undefined))}`);
    add(`engine rebuilt ${enginesBuilt - 1} times, stuck clock flag ${clockStuck}, clock stops seen ${stats.clockStalls}, silent songs seen ${stats.silentEpisodes}`);
    const measured = await measureOutput();
    add(...measured.lines);
    add(`volumes: master ${gain(masterGain)}, music ${gain(musicGain)}, effects ${gain(effectsGain)}, jingle duck ${duck}`);
    const devices = await settle(attempt(() => navigator.mediaDevices?.enumerateDevices()));
    add(`audio outputs the browser can see: ${devices ? devices.filter((device) => device.kind === 'audiooutput').length : 'not reported'}`);
    add(`verdict: ${measured.verdict}`);

    heading('Music');
    add(`music ${music.get('enabled') ? 'on' : 'off'}, volume ${music.get('volume')}, shuffle ${music.get('shuffle-mode')}, repeat one ${repeatOne}`);
    add(safe(() => (nowPlaying
      ? `now playing: ${trackTitle(nowPlaying.path)} at ${positionOf(nowPlaying).toFixed(0)}s of ${nowPlaying.source.buffer.duration.toFixed(0)}s, song volume ${gain(nowPlaying.gain)}, ${nowPlaying.source.buffer.sampleRate} Hz`
      : paused ? `paused: ${trackTitle(paused.path)} at ${paused.position.toFixed(0)}s` : 'nothing playing')));
    add(`playing for: ${safe(contextKey)} (last chosen ${context})`);
    add(`playlist (${playlist.length}): ${playlist.map(trackTitle).join(', ') || 'empty'}`);
    add(`recently played: ${history.slice(-5).map(trackTitle).join(', ') || 'none'}`);
    add(`songs downloaded ${stats.trackLoads}, failed ${stats.trackFailures}, last download took ${stats.lastTrackLoadMs ?? '-'} ms, last song started ${ago(stats.lastTrackStarted)}, kept in memory ${tracks.size}`);
    add(`last song error: ${stats.lastTrackError}`);
    add(`music button: ${player.button ? (player.root.isConnected === false ? 'made but missing from the page' : 'in the top bar') : 'not made'}`);
    add(`character loaded ${characterLoaded}, game ready ${ready}, offline progress running ${isOffline()}`);

    heading('Sound effects');
    const failedFiles = [...bufferStatus].filter(([, status]) => status !== 'ready' && status !== 'loading');
    const count = (status) => [...bufferStatus.values()].filter((each) => each === status).length;
    add(`sound files: ${count('ready')} ready, ${count('loading')} loading, ${failedFiles.length} failed, of ${bufferStatus.size}`);
    failedFiles.slice(0, 10).forEach(([path, status]) => add(`  failed ${songStem(path)}: ${status}`));
    add(`sounds played ${stats.effectsPlayed}, last ${stats.lastEffect}, playing now ${playing.size}`);
    add(`sounds skipped: ${Object.entries(stats.effectsSkipped).map(([reason, times]) => `${reason} ${times}`).join(', ') || 'none'}`);

    heading('Mod settings');
    for (const [name, section, list] of [['Music', music, musicSettings], ['Sound effects', effects, effectsSettings]]) {
      for (const config of list.filter((each) => each.type !== 'button')) {
        const value = section.get(config.name);
        add(`${name} / ${config.label}: ${show(value)}${value === config.default ? '' : ` (changed, default ${show(config.default)})`}`);
      }
    }

    heading('Character');
    add(`game mode: ${safe(() => `${game.currentGamemode.name} (${game.currentGamemode.id})`, 'no character loaded')}`);
    add(`doing: ${safe(() => (game.combat.isActive ? `combat in ${game.combat.selectedArea?.name}` : game.activeAction?.name), 'nothing')}`);
    const unlockedSongs = songList().filter(isUnlocked);
    add(`songs unlocked: ${unlockedSongs.length} of ${songList().length} (${songList().filter((path) => freeSongs.has(songStem(path))).length} always free), saved for this character ${unlocked.size}`);
    add(`unlocked: ${unlockedSongs.map(trackTitle).join(', ') || 'none'}`);

    heading('Melvor settings');
    const melvorSettings = attempt(() => [...Object.entries(game.settings.boolData ?? {}), ...Object.entries(game.settings.choiceData ?? {})]) ?? [];
    const isChanged = ([, data]) => show(data?.currentValue) !== show(data?.defaultValue);
    const changed = melvorSettings.filter(isChanged);
    add(`changed from default (${changed.length}):`);
    changed.forEach(([key, data]) => add(`  ${key} = ${show(data.currentValue)} (default ${show(data.defaultValue)})`));
    add(`left at default (${melvorSettings.length - changed.length}): ${melvorSettings.filter((entry) => !isChanged(entry)).map(([key, data]) => `${key}=${show(data?.currentValue)}`).join(', ') || 'none'}`);

    heading('Mods loaded');
    add(safe(() => (typeof mod !== 'undefined' ? mod.manager.getLoadedModList().map((each) => (typeof each === 'string' ? each : each?.name ?? show(each))).join(', ') : undefined)));

    heading(`Recent events (last ${debugLog.length})`);
    add(...debugLog);
    return lines.join('\n');
  }

  async function soundTest() {
    const lines = ['', '== Test sounds =='];
    try {
      await engine.resume();
    } catch (error) {
      lines.push(`resume failed: ${describeError(error)}`);
    }
    lines.push(`audio engine: ${engine.state}`);
    try {
      const target = engine;
      const tone = target.createOscillator();
      const level = target.createGain();
      const meter = target.createAnalyser();
      meter.fftSize = 2048;
      tone.frequency.value = 440;
      level.gain.value = 0.15;
      tone.connect(level);
      level.connect(meter);
      level.connect(target.destination);
      const startClock = target.currentTime;
      tone.start();
      tone.stop(startClock + TEST_TONE_SECONDS);
      let peak = 0;
      for (let i = 0; i < LEVEL_SAMPLES; i++) {
        await wait((TEST_TONE_SECONDS * 1000) / LEVEL_SAMPLES);
        peak = Math.max(peak, signalLevel(meter)?.peak ?? 0);
      }
      await wait(100);
      level.disconnect();
      lines.push(`1. beep through the game's audio engine: clock moved ${(target.currentTime - startClock).toFixed(2)}s during a ${TEST_TONE_SECONDS}s beep, level ${decibels(peak)}`);
    } catch (error) {
      lines.push(`1. beep through the game's audio engine failed: ${describeError(error)}`);
    }
    const chime = audio.sfx.pet || audio.sfx.levelUpFallback;
    try {
      const element = new Audio(ctx.getResourceUrl(chime));
      element.volume = 0.6;
      const finished = new Promise((resolve) => {
        element.onended = () => resolve('played to the end');
        element.onerror = () => resolve(`error ${element.error?.code}: ${element.error?.message || 'no message'}`);
        setTimeout(() => resolve(`still going after ${TEST_CHIME_WAIT_MS / 1000}s, at ${element.currentTime.toFixed(1)}s`), TEST_CHIME_WAIT_MS);
      });
      await element.play();
      lines.push(`2. chime through a plain audio player (${songStem(chime)}): started, ${await finished}`);
    } catch (error) {
      lines.push(`2. chime through a plain audio player failed: ${describeError(error)}`);
    }
    lines.push('Did you hear 1 (a beep), 2 (a chime), both, or neither? Please say which when you send this.');
    note('ran the test sounds');
    return lines.join('\n');
  }

  function debugButton(text, icon, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-sm btn-secondary m-1';
    const glyph = document.createElement('i');
    glyph.className = `fa ${icon} mr-1`;
    button.append(glyph, document.createTextNode(text));
    button.addEventListener('click', onClick);
    return button;
  }

  function copyText(box) {
    box.select?.();
    const fallback = () => attempt(() => document.execCommand('copy'));
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(box.value).catch(fallback);
    else fallback();
  }

  async function showDebugInfo() {
    const box = document.createElement('textarea');
    box.className = 'form-control font-size-sm osrs-music-debug';
    box.rows = 18;
    box.readOnly = true;
    box.value = 'Collecting sound info...';
    const copy = debugButton('Copy', 'fa-copy', () => copyText(box));
    const test = debugButton('Play test sounds', 'fa-volume-up', async () => {
      test.disabled = true;
      box.value += `\n${await soundTest()}`;
      test.disabled = false;
      copyText(box);
    });
    const body = document.createElement('div');
    const buttons = document.createElement('div');
    buttons.className = 'osrs-music-debug-buttons';
    buttons.append(copy, test);
    body.append(box, buttons);
    if (typeof SwalLocale !== 'undefined') SwalLocale.fire({ title: 'Sound debug info', html: body, width: '50rem' });
    box.value = await debugReport();
    copyText(box);
    return box.value;
  }
  applyVolume();
  fadeIn();
  setInterval(() => {
    syncMusic();
    watchHealth();
  }, CHECK_MS);

  const buffers = new Map();
  const bufferStatus = new Map();
  const playing = new Set();
  const channels = new Map();

  function loadBuffer(path) {
    if (!buffers.has(path)) {
      bufferStatus.set(path, 'loading');
      buffers.set(path, fetch(ctx.getResourceUrl(path))
        .then(checkedBytes)
        .then((data) => engine.decodeAudioData(data))
        .then((buffer) => {
          bufferStatus.set(path, 'ready');
          return buffer;
        })
        .catch((error) => {
          bufferStatus.set(path, describeError(error));
          return null;
        }));
    }
    return buffers.get(path);
  }

  function cut(sound) {
    playing.delete(sound);
    rampTo(sound.gain.gain, 0, CUT_MS / 1000);
    sound.source.stop(engine.currentTime + CUT_MS / 1000 + 0.01);
  }

  const skipEffect = (reason) => {
    stats.effectsSkipped[reason] = (stats.effectsSkipped[reason] || 0) + 1;
    return false;
  };

  function playEffect(path, category, channel = category, onEnded = null) {
    if (!path) return skipEffect('no OSRS sound for it');
    if (!ready) return skipEffect('game still loading');
    if (!effects.get('effects-enabled') || !effects.get(category)) return skipEffect(`${category} turned off`);
    if (typeof game === 'undefined' || !game._isInOnlineLoop) return skipEffect('offline progress');
    loadBuffer(path).then((buffer) => {
      if (!buffer) {
        skipEffect('sound file failed to load');
        return;
      }
      const previous = channels.get(channel);
      if (previous && playing.has(previous)) cut(previous);
      if (playing.size >= MAX_SFX) cut(playing.values().next().value);
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
      stats.effectsPlayed++;
      stats.lastEffect = `${songStem(path)} at ${new Date().toLocaleTimeString()}, audio ${engine.state}`;
    });
    return true;
  }

  function playJingle(path, category, then = null) {
    const restore = () => {
      duck = 1;
      applyVolume();
    };
    const ended = () => {
      restore();
      if (then) then();
    };
    if (!playEffect(path, category, 'jingle', ended)) {
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

  function actionSound(skill) {
    if (skill === game.thieving && skill.stunState === 1) return audio.sfx.stunned;
    const category = skill.selectedRecipe && skill.selectedRecipe.category;
    return (category && audio.sfx.categories[category.id]) || audio.sfx.skills[skill.id];
  }

  const lastSkillSound = new Map();
  function onSkillAction(skill) {
    const gap = Math.max(0, Number(effects.get('skilling-gap')) || 0) * 1000;
    const now = Date.now();
    if (now - (lastSkillSound.get(skill) || 0) < gap) return;
    if (skill === game.altMagic) {
      const spell = game.altMagic.selectedSpell;
      if (spell && playEffect(audio.sfx.spells[spell.id], 'spells', `skill:${skill.id}`)) lastSkillSound.set(skill, now);
    } else if (playEffect(actionSound(skill), 'skilling', `skill:${skill.id}`)) {
      lastSkillSound.set(skill, now);
    }
  }

  let missed = { death: false, levelUp: null, pet: false };
  const isOffline = () => typeof game !== 'undefined' && !game._isInOnlineLoop;

  function flushMissed() {
    if (!ready || isOffline()) return;
    const { death, levelUp, pet } = missed;
    missed = { death: false, levelUp: null, pet: false };
    if (!effects.get('catch-up')) return;
    const chime = pet ? () => playEffect(audio.sfx.pet, 'pets') : null;
    if (death && effects.get('deaths')) playJingle(audio.sfx.playerDeath, 'deaths', chime);
    else if (levelUp) playJingle(levelUp, 'levelups', chime);
    else if (chime) chime();
  }

  function onLevelUp(_result, oldLevel, newLevel) {
    if (newLevel <= oldLevel) return;
    const high = newLevel >= 50 && audio.sfx.levelUpsHigh[this.id];
    const path = high || audio.sfx.levelUps[this.id] || audio.sfx.levelUpFallback;
    if (isOffline()) missed.levelUp = path;
    else playJingle(path, 'levelups');
  }
  ctx.patch(Skill, 'onLevelUp').after(onLevelUp);
  if (typeof Skill.prototype.onAbyssalLevelUp === 'function') ctx.patch(Skill, 'onAbyssalLevelUp').after(onLevelUp);

  ctx.patch(Player, 'togglePrayer').replace(function (togglePrayer, prayer, render) {
    const wasActive = this.activePrayers.has(prayer);
    const result = togglePrayer(prayer, render);
    const isActive = this.activePrayers.has(prayer);
    if (isActive !== wasActive) playEffect(isActive ? audio.sfx.prayers[prayer.id] : audio.sfx.prayerOff, 'prayers', 'prayer');
    return result;
  });

  ctx.patch(Player, 'eatFood').replace(function (eatFood, ...args) {
    const before = this.hitpoints;
    const result = eatFood(...args);
    if (this.hitpoints > before) playEffect(audio.sfx.eat, 'eating', 'eat');
    return result;
  });

  ctx.patch(Bank, 'buryItemOnClick').replace(function (buryItemOnClick, item, quantity) {
    const before = this.getQty(item);
    const result = buryItemOnClick(item, quantity);
    if (this.getQty(item) < before) playEffect(audio.sfx.bury, 'prayers', 'bury');
    return result;
  });

  ctx.patch(BaseManager, 'onPlayerDeath').after(() => {
    if (isOffline()) missed.death = true;
    else playJingle(audio.sfx.playerDeath, 'deaths');
  });

  ctx.patch(PetManager, 'unlockPet').replace(function (unlockPet, pet) {
    const isNew = !this.unlocked.has(pet);
    const result = unlockPet(pet);
    if (isNew && isOffline()) missed.pet = true;
    else if (isNew) playEffect(audio.sfx.pet, 'pets');
    return result;
  });

  ctx.onCharacterLoaded(() => {
    characterLoaded = true;
    unlocked = new Set(ctx.characterStorage.getItem(SONG_KEY) || []);
    game.skills.forEach((skill) => {
      if (typeof skill.on === 'function') {
        skill.on('action', () => {
          onSkillAction(skill);
          rollForSong(actionKey(skill), skill.actionInterval);
        });
      }
    });
    if (game.cartography) {
      game.cartography.on('survey', () => {
        onSkillAction(game.cartography);
        rollForSong(actionKey(game.cartography), game.cartography.actionInterval);
      });
    }
    game.on('offlineLoopExited', () => setTimeout(() => {
      flushMissed();
      flushSongs();
    }, 500));
    game.farming.on('harvest', () => {
      playEffect(audio.sfx.harvest, 'skilling', 'skill:melvorD:Farming');
      rollForSong(game.farming.id, HARVEST_COUNTS_AS_MS);
    });
    const player = game.combat.player;
    player.on('attack', () => {
      rollForSong(game.combat.selectedArea?.id, player.stats?.attackInterval);
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
    buildPlayer();
    setTimeout(() => {
      flushMissed();
      flushSongs();
    }, 500);
    new Set(Object.values(audio.sfx).flatMap((group) => (typeof group === 'string' ? [group] : Object.values(group)))).forEach(loadBuffer);
  });

  console.log(`[OSRS Sounds] ${Object.keys(audio.music).length} music contexts, ${Object.keys(audio.sfx.spells).length} spell sounds`);
}

function describeError(error) {
  if (error && typeof error === 'object' && 'message' in error) return `${error.name || 'Error'}: ${error.message}`;
  return String(error);
}

async function checkedBytes(response) {
  if (response.ok === false) throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
  return response.arrayBuffer();
}

function safe(read, fallback = 'not reported') {
  try {
    const value = read();
    return value === undefined || value === null ? fallback : value;
  } catch (error) {
    return error instanceof TypeError || error instanceof ReferenceError ? fallback : `unreadable (${describeError(error)})`;
  }
}

function attempt(read) {
  try {
    return read();
  } catch {
    return undefined;
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function settle(promise, ms = 1000) {
  if (!promise || typeof promise.then !== 'function') return Promise.resolve(null);
  return Promise.race([promise.catch(() => null), wait(ms).then(() => null)]);
}

const decibels = (value) => (value > 0 ? `${(20 * Math.log10(value)).toFixed(1)} dB` : 'silent');
const ago = (time) => (time ? `${Math.round((Date.now() - time) / 1000)}s ago` : 'never');

/** Melvor's phone apps are GoNative wrappers; the Android one ships with either Chrome's WebView or Firefox's GeckoView. */
function appEngine(agent) {
  if (agent.includes('gonative_android')) return agent.includes('geckoview') ? `Android app on GeckoView, Firefox's engine${agent.includes('paid') ? ' (paid version)' : ''}` : "Android app on Android System WebView, Chrome's engine";
  if (agent.includes('gonative_ios')) return "iOS app on WKWebView, Safari's engine";
  return 'not the phone app (a browser or the desktop app)';
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** A song's name from its OSRS Wiki file, like "Scape_Main.ogg". */
export function trackTitle(path) {
  return decodeURIComponent(path.split('?')[0].split('/').pop()).replace(/\.ogg$/i, '').replace(/_/g, ' ');
}

function createEngine() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  try {
    return new AudioContextClass({ sampleRate: SAMPLE_RATE });
  } catch (e) {
    return new AudioContextClass();
  }
}
