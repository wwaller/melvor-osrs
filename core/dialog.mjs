const PUFFS = 7;
const TRANSFORM_MS = 450;
const CONTINUE = 'Click here to continue';
const SELECT = 'Select an Option';
const CONTINUE_KEYS = new Set([' ', 'Enter']);

export function el(tag, className = '', ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  if (tag === 'button') node.type = 'button';
  return node;
}

export function img(src, className = '') {
  const node = el('img', className);
  if (src) node.src = src;
  node.alt = '';
  return node;
}

export function pick(list, random = Math.random) {
  return list[Math.floor(random() * list.length)];
}

export function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function popupOpen() {
  return typeof Swal !== 'undefined' && Swal.isVisible();
}

function puffs(head) {
  head.classList.add('osrs-dialog-gone');
  for (let i = 0; i < PUFFS; i++) head.append(el('span', 'osrs-dialog-puff'));
}

export function chat(name, chathead, line) {
  const face = img(chathead);
  const head = el('div', 'osrs-dialog-head', face);
  const speaker = el('div', 'osrs-dialog-name', name);
  const words = el('div', 'osrs-dialog-words', line);
  const more = el('button', 'osrs-dialog-continue', CONTINUE);
  more.hidden = true;
  more.addEventListener('click', () => Swal.close());
  const box = el('div', 'osrs-dialog-chat', head, el('div', 'osrs-dialog-text', speaker, words, more));
  return {
    box,
    poof: () => puffs(head),
    say(text) {
      words.textContent = text;
    },
    end(text) {
      words.textContent = text;
      more.hidden = false;
    },
    speak(newName, newChathead) {
      speaker.textContent = newName;
      face.src = newChathead;
    },
    transform(newName, newChathead, then) {
      puffs(head);
      setTimeout(() => {
        speaker.textContent = newName;
        face.src = newChathead;
        head.classList.remove('osrs-dialog-gone');
        head.querySelectorAll('.osrs-dialog-puff').forEach((puff) => puff.remove());
        then();
      }, TRANSFORM_MS);
    },
  };
}

export function choices(labels, onPick, title = SELECT) {
  const list = el('div', 'osrs-dialog-choices');
  if (title) list.append(el('div', 'osrs-dialog-choices-title', title));
  labels.forEach((label, index) => {
    const button = el('button', 'osrs-dialog-choice', label);
    button.addEventListener('click', () => onPick(index));
    list.append(button);
  });
  return list;
}

export function streak(total) {
  const pips = Array.from({ length: total }, () => el('span', 'osrs-dialog-pip'));
  return {
    node: el('div', 'osrs-dialog-pips', ...pips),
    show(count) {
      pips.forEach((pip, index) => pip.classList.toggle('osrs-dialog-pip-on', index < count));
    },
  };
}

// Opens the OSRS-styled popup. The returned function marks it finished, so closing it afterwards is not a dismissal.
export function open(parts, chathead, preview, { className = '', dismissed = 'Maybe later.', onDismiss = null, focus = null } = {}) {
  let finished = false;
  const body = el('div', 'osrs-dialog', ...parts);
  if (preview) body.append(el('div', 'osrs-dialog-preview', 'This is a preview, so no reward is given.'));
  SwalLocale.fire({
    html: body,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { container: 'swal-infront', popup: `osrs-dialog-popup ${className}`.trim() },
    didOpen: () => focus?.focus?.({ preventScroll: true }),
  }).then(() => {
    if (finished) return;
    if (onDismiss) onDismiss();
    if (dismissed && chathead && typeof imageNotify === 'function') imageNotify(chathead, dismissed, 'info');
  });
  return () => {
    finished = true;
  };
}

export function compile(script) {
  const program = [];
  const labels = new Map();
  const emit = (op) => program.push(op) - 1;
  const walk = (node) => {
    if (node === null || node === undefined || node === false) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object') throw new TypeError(`dialogue: a script step should be an object, not ${JSON.stringify(node)}`);
    if ('label' in node) {
      if (labels.has(node.label)) throw new Error(`dialogue: label "${node.label}" is used twice`);
      labels.set(node.label, program.length);
      return;
    }
    if ('goto' in node) {
      emit({ op: 'goto', label: node.goto });
      return;
    }
    if ('if' in node) {
      const branch = emit({ op: 'branch', test: node.if, otherwise: -1 });
      walk(node.then);
      const skip = emit({ op: 'jump', to: -1 });
      program[branch].otherwise = program.length;
      walk(node.else);
      program[skip].to = program.length;
      return;
    }
    if ('options' in node) {
      const list = Array.isArray(node.options) ? node.options : Object.entries(node.options).map(([label, then]) => ({ label, then }));
      const choice = emit({ op: 'choose', title: node.title, choices: [] });
      const exits = [];
      for (const option of list) {
        program[choice].choices.push({ label: option.label, if: option.if, at: program.length });
        walk(option.then);
        exits.push(emit({ op: 'jump', to: -1 }));
      }
      for (const exit of exits) program[exit].to = program.length;
      return;
    }
    if (!STEPS.some((key) => key in node)) throw new TypeError(`dialogue: unknown step ${JSON.stringify(Object.keys(node))}`);
    emit({ op: 'step', node });
  };
  walk(script);
  for (const op of program) {
    if (op.op === 'goto' && !labels.has(op.label)) throw new Error(`dialogue: there is no label "${op.label}"`);
  }
  return { program, labels };
}

const STEPS = ['npc', 'player', 'item', 'text', 'do', 'end', 'widget', 'call', 'poof', 'wait'];

const pages = (said) => (Array.isArray(said) ? said : [said]);

export function view(container) {
  const face = img('');
  const head = el('div', 'osrs-dialog-head', face);
  const speaker = el('div', 'osrs-dialog-name');
  const words = el('div', 'osrs-dialog-words');
  const more = el('button', 'osrs-dialog-continue', CONTINUE);
  const text = el('div', 'osrs-dialog-text', speaker, words, more);
  const box = el('div', 'osrs-dialog-chat', head, text);
  box.tabIndex = -1;
  const slot = el('div', 'osrs-dialog-slot', box);
  container.append(slot);
  let advance = null;
  let chooseKey = null;

  const show = (node) => slot.replaceChildren(node);
  // Listening in the capture phase keeps Space from also pressing whatever button has focus, like the popup's close button.
  const keydown = (event) => {
    if (advance && CONTINUE_KEYS.has(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      advance();
    } else if (chooseKey && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      chooseKey(Number(event.key) - 1);
    }
  };
  document.addEventListener('keydown', keydown, true);
  box.addEventListener('click', () => advance?.());

  return {
    node: slot,
    focusTarget: box,
    line({ name = '', head: chathead = null, side = 'left', kind = 'speech', words: said }) {
      box.className = `osrs-dialog-chat osrs-dialog-${kind} osrs-dialog-${side}`;
      head.classList.remove('osrs-dialog-gone');
      head.querySelectorAll('.osrs-dialog-puff').forEach((puff) => puff.remove());
      head.hidden = !chathead;
      speaker.hidden = !name;
      speaker.textContent = name;
      words.textContent = said;
      more.hidden = false;
      if (chathead && typeof chathead.then === 'function') {
        face.removeAttribute('src');
        chathead.then((src) => {
          if (src && box.contains(face)) face.src = src;
        });
      } else if (chathead) {
        face.src = chathead;
      }
      show(box);
      return new Promise((resolve) => {
        advance = () => {
          advance = null;
          resolve();
        };
      });
    },
    choose(title, labels) {
      return new Promise((resolve) => {
        const done = (index) => {
          if (index >= labels.length || !chooseKey) return;
          chooseKey = null;
          resolve(index);
        };
        chooseKey = done;
        show(choices(labels, done, title));
      });
    },
    widget(node) {
      show(node);
    },
    poof() {
      puffs(head);
    },
    detach() {
      document.removeEventListener('keydown', keydown, true);
      advance?.();
      chooseKey?.(-1);
    },
  };
}

export function interpolate(text, values) {
  return String(text).replace(/\{(\w+)\}/g, (whole, key) => (key in values ? String(values[key]) : whole));
}

// Plays a dialogue script in the OSRS chat box. Resolves with the value of an `end` step,
// undefined when the script runs out, or { dismissed: true } if the player closes it first.
export function converse(script, {
  speakers = {},
  player = {},
  items = () => null,
  context = {},
  values = {},
  target = null,
  preview = false,
  className = '',
} = {}) {
  const { program, labels } = compile(script);
  const resolveValue = async (value) => (typeof value === 'function' ? value(context) : value);
  const say = async (value) => interpolate(await resolveValue(value), { player: player.name ?? '', ...values });
  const speaker = (key) => {
    const found = typeof speakers === 'function' ? speakers(key) : speakers[key];
    return found ?? { name: key, chathead: null };
  };
  const playerHead = () => {
    const head = typeof player.chathead === 'function' ? player.chathead() : player.chathead;
    return head ?? null;
  };

  return new Promise((resolve) => {
    let ended = false;
    let finishPopup = null;
    let ui;
    const finish = (result) => {
      if (ended) return;
      ended = true;
      ui.detach();
      if (finishPopup) {
        finishPopup();
        Swal.close();
      }
      resolve(result);
    };
    if (target) {
      ui = view(target);
    } else {
      const holder = el('div', 'osrs-dialog-conversation');
      ui = view(holder);
      finishPopup = open([holder], null, preview, {
        className,
        dismissed: null,
        focus: ui.focusTarget,
        onDismiss: () => {
          if (ended) return;
          ended = true;
          ui.detach();
          resolve({ dismissed: true });
        },
      });
    }

    const perform = async (node) => {
      if ('npc' in node) {
        const who = speaker(await resolveValue(node.npc));
        for (const page of pages(await resolveValue(node.say))) {
          if (ended) return null;
          await ui.line({ name: who.name, head: who.chathead, side: 'left', words: await say(page) });
        }
      } else if ('player' in node) {
        for (const page of pages(await resolveValue(node.player))) {
          if (ended) return null;
          await ui.line({ name: player.name ?? '', head: playerHead(), side: 'right', words: await say(page) });
        }
      } else if ('item' in node) {
        const id = await resolveValue(node.item);
        const found = items(id);
        await ui.line({ head: found?.media ?? id, kind: 'item', words: await say(node.say ?? '') });
      } else if ('text' in node) {
        for (const page of pages(await resolveValue(node.text))) {
          if (ended) return null;
          await ui.line({ kind: 'plain', words: await say(page) });
        }
      } else if ('do' in node) {
        await node.do(context);
      } else if ('call' in node) {
        const nested = await node.call(context);
        if (nested) {
          const { program: inner } = compile(nested);
          if (inner.length) return { call: nested };
        }
      } else if ('widget' in node) {
        await new Promise((done) => ui.widget(node.widget(context, done)));
      } else if ('poof' in node) {
        ui.poof();
      } else if ('wait' in node) {
        await new Promise((done) => setTimeout(done, node.wait));
      } else if ('end' in node) {
        return { end: await resolveValue(node.end) };
      }
      return null;
    };

    const run = async (code, marks) => {
      let at = 0;
      while (at < code.length && !ended) {
        const op = code[at++];
        if (op.op === 'jump') {
          at = op.to;
        } else if (op.op === 'goto') {
          at = marks.get(op.label);
        } else if (op.op === 'branch') {
          if (!(await resolveValue(op.test))) at = op.otherwise;
        } else if (op.op === 'choose') {
          const shown = [];
          for (const option of op.choices) {
            if (option.if === undefined || (await resolveValue(option.if))) shown.push(option);
          }
          if (!shown.length) continue;
          const labelsShown = await Promise.all(shown.map((option) => say(option.label)));
          const picked = await ui.choose(await say(op.title ?? SELECT), labelsShown);
          if (picked < 0) return null;
          at = shown[picked].at;
        } else {
          const outcome = await perform(op.node);
          if (outcome?.end !== undefined) return outcome;
          if (outcome?.call) {
            const inner = compile(outcome.call);
            const result = await run(inner.program, inner.labels);
            if (result?.end !== undefined) return result;
          }
        }
      }
      return null;
    };

    run(program, labels)
      .then((outcome) => finish(outcome?.end))
      .catch((error) => {
        console.error('[osrs] dialogue failed', error);
        finish({ error });
      });
  });
}
