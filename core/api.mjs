export function publish(ctx, version, endpoints) {
  return ctx.api(Object.freeze({ version, ...endpoints }));
}

export function find(namespace, minimumVersion = 1) {
  const api = typeof mod !== 'undefined' ? mod.api?.[namespace] : undefined;
  return api && (api.version ?? 0) >= minimumVersion ? api : null;
}

// Mods publish their APIs during setup, so another mod's API is only complete once every mod has loaded.
export function whenLoaded(ctx, namespace, use, minimumVersion = 1) {
  ctx.onModsLoaded(() => {
    const api = find(namespace, minimumVersion);
    if (api) use(api);
  });
}
