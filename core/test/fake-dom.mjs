export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

export function element(tag) {
  const names = new Set();
  const listeners = {};
  const node = {
    tagName: tag.toUpperCase(),
    children: [],
    style: {},
    attributes: {},
    dataset: {},
    hidden: false,
    disabled: false,
    get className() { return [...names].join(' '); },
    set className(value) { names.clear(); String(value).split(' ').filter(Boolean).forEach((name) => names.add(name)); },
    classList: {
      add: (name) => names.add(name),
      remove: (name) => names.delete(name),
      contains: (name) => names.has(name),
      toggle: (name, on = !names.has(name)) => (on ? names.add(name) : names.delete(name), on),
    },
    get textContent() { return node.children.map((child) => (typeof child === 'string' ? child : child.textContent)).join(''); },
    set textContent(value) { node.children = [String(value)]; },
    append(...children) {
      for (const child of children) {
        if (typeof child !== 'string') {
          child.remove?.();
          child.parent = node;
        }
      }
      node.children.push(...children);
    },
    replaceChildren(...children) {
      node.children.forEach((child) => { if (typeof child !== 'string') child.parent = null; });
      node.children = [];
      node.append(...children);
    },
    remove() {
      if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node);
      node.parent = null;
    },
    contains(other) {
      for (let at = other; at; at = at.parent) if (at === node) return true;
      return false;
    },
    querySelectorAll(selector) {
      return all(node, selector.replace(/^\./, '')).filter((found) => found !== node);
    },
    setAttribute(name, value) { node.attributes[name] = value; },
    removeAttribute(name) { delete node.attributes[name]; if (name === 'src') delete node.src; },
    addEventListener(type, fn) { listeners[type] = fn; },
    click() { if (!node.disabled && listeners.click) listeners.click(); },
  };
  return node;
}

export function all(root, className) {
  if (!root || typeof root === 'string') return [];
  return [...(root.classList.contains(className) ? [root] : []), ...root.children.flatMap((child) => all(child, className))];
}

export const one = (root, className) => all(root, className)[0];
export const visible = (node) => {
  for (let at = node; at; at = at.parent) if (at.hidden) return false;
  return true;
};

export function installDom() {
  const toasts = [];
  const popup = { open: false, html: null, options: null, close: null, opened: 0 };
  const keyListeners = new Set();
  globalThis.document = {
    createElement: element,
    fonts: { add() {} },
    addEventListener: (type, fn) => type === 'keydown' && keyListeners.add(fn),
    removeEventListener: (type, fn) => type === 'keydown' && keyListeners.delete(fn),
  };
  globalThis.FontFace = class { load() { return Promise.resolve(this); } };
  globalThis.imageNotify = (media, message, theme) => toasts.push({ media, message, theme });
  globalThis.Swal = {
    isVisible: () => popup.open,
    close: () => popup.close?.(),
  };
  globalThis.SwalLocale = {
    fire: (options) => {
      popup.close?.();
      popup.open = true;
      popup.opened++;
      popup.html = options.html;
      popup.options = options;
      return new Promise((resolve) => {
        popup.close = () => {
          popup.open = false;
          popup.close = null;
          resolve({ isDismissed: true });
        };
      });
    },
  };
  const press = (key) => {
    const event = { key, preventDefault() {}, stopPropagation() {} };
    [...keyListeners].forEach((listener) => listener(event));
  };
  return { toasts, popup, press, keyListeners };
}

// Reads what the conversation in the open popup is showing: a line of dialogue or a menu of options.
export function screen(popup) {
  const choices = all(popup.html, 'osrs-dialog-choice').filter(visible);
  if (choices.length) return { options: choices.map((choice) => choice.textContent), choices };
  const words = one(popup.html, 'osrs-dialog-words');
  const name = one(popup.html, 'osrs-dialog-name');
  const box = one(popup.html, 'osrs-dialog-chat');
  return { words: words?.textContent, name: name && visible(name) ? name.textContent : '', side: box?.className.includes('osrs-dialog-right') ? 'right' : 'left', box };
}
