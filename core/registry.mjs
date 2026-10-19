const ID = /^[A-Za-z][\w-]*:[\w-]+$/;

export function createEmitter(label = 'osrs') {
  const listeners = new Map();
  const on = (type, listener) => {
    if (typeof listener !== 'function') throw new TypeError(`${label}: on('${type}') needs a function`);
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    return () => listeners.get(type)?.delete(listener);
  };
  return {
    on,
    once(type, listener) {
      const off = on(type, (...args) => {
        off();
        listener(...args);
      });
      return off;
    },
    emit(type, ...args) {
      for (const listener of [...(listeners.get(type) ?? [])]) {
        try {
          listener(...args);
        } catch (error) {
          console.error(`[${label}] a '${type}' listener failed`, error);
        }
      }
    },
  };
}

export function isId(id) {
  return typeof id === 'string' && ID.test(id);
}

// `shape` maps field names to typeof results; a trailing '?' makes the field optional.
export function check(kind, definition, shape) {
  if (!definition || typeof definition !== 'object') throw new TypeError(`${kind}: expected a definition object`);
  for (const [field, type] of Object.entries(shape)) {
    const optional = type.endsWith('?');
    const value = definition[field];
    if (value === undefined && optional) continue;
    const want = optional ? type.slice(0, -1) : type;
    const got = Array.isArray(value) ? 'array' : typeof value;
    if (!want.split('|').includes(got)) throw new TypeError(`${kind} "${definition.id ?? '?'}": ${field} should be ${want}, not ${got}`);
  }
  return definition;
}

export function createRegistry(kind, { shape = {}, validate = () => {}, emitter = createEmitter(kind) } = {}) {
  const entries = new Map();
  return {
    kind,
    register(definition) {
      check(kind, definition, shape);
      if (!isId(definition.id)) throw new TypeError(`${kind}: id "${definition.id}" should look like "yourNamespace:name"`);
      if (entries.has(definition.id)) throw new Error(`${kind}: "${definition.id}" is already registered`);
      validate(definition);
      const entry = Object.freeze({ ...definition });
      entries.set(entry.id, entry);
      emitter.emit('registered', entry);
      return () => {
        if (entries.get(entry.id) !== entry) return;
        entries.delete(entry.id);
        emitter.emit('unregistered', entry);
      };
    },
    get: (id) => entries.get(id) ?? null,
    has: (id) => entries.has(id),
    list: () => [...entries.values()],
    on: emitter.on,
  };
}
