const PUFFS = 7;
const TRANSFORM_MS = 450;

export function el(tag, className = '', ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  if (tag === 'button') node.type = 'button';
  return node;
}

export function img(src, className = '') {
  const node = el('img', className);
  node.src = src;
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

export function chat(name, chathead, line) {
  const face = img(chathead);
  const head = el('div', 'osrs-re-head', face);
  const speaker = el('div', 'osrs-re-name', name);
  const words = el('div', 'osrs-re-words', line);
  const more = el('button', 'osrs-re-continue', 'Click here to continue');
  more.hidden = true;
  more.addEventListener('click', () => Swal.close());
  const box = el('div', 'osrs-re-chat', head, el('div', 'osrs-re-text', speaker, words, more));
  const poof = () => {
    head.classList.add('osrs-re-gone');
    for (let i = 0; i < PUFFS; i++) head.append(el('span', 'osrs-re-puff'));
  };
  return {
    box,
    poof,
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
      poof();
      setTimeout(() => {
        speaker.textContent = newName;
        face.src = newChathead;
        head.classList.remove('osrs-re-gone');
        then();
      }, TRANSFORM_MS);
    },
  };
}

export function choices(labels, onPick, title = 'Select an option') {
  const list = el('div', 'osrs-re-choices');
  if (title) list.append(el('div', 'osrs-re-choices-title', title));
  labels.forEach((label, index) => {
    const button = el('button', 'osrs-re-choice', label);
    button.addEventListener('click', () => onPick(index));
    list.append(button);
  });
  return list;
}

export function streak(total) {
  const pips = Array.from({ length: total }, () => el('span', 'osrs-re-pip'));
  return {
    node: el('div', 'osrs-re-pips', ...pips),
    show(count) {
      pips.forEach((pip, index) => pip.classList.toggle('osrs-re-pip-on', index < count));
    },
  };
}

export function open(parts, chathead, preview) {
  let finished = false;
  const body = el('div', 'osrs-re-event', ...parts);
  if (preview) body.append(el('div', 'osrs-re-preview', 'This is a preview, so no reward is given.'));
  SwalLocale.fire({
    html: body,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { container: 'swal-infront', popup: 'osrs-re-popup' },
  }).then(() => {
    if (!finished && typeof imageNotify === 'function') imageNotify(chathead, 'Maybe later.', 'info');
  });
  return () => {
    finished = true;
  };
}
