export const OSRS_FONTS = {
  OsrsPlain: 'fonts/RuneScape-Plain-12.ttf',
  OsrsBold: 'fonts/RuneScape-Bold-12.ttf',
  OsrsQuill: 'fonts/RuneScape-Quill-8.ttf',
};

const loaded = (globalThis.osrsFontsLoaded ??= new Set());

export async function loadFonts(ctx, fonts = OSRS_FONTS) {
  await Promise.all(Object.entries(fonts).map(async ([family, path]) => {
    if (loaded.has(family)) return;
    loaded.add(family);
    try {
      const face = new FontFace(family, await ctx.getResourceBlob(path).arrayBuffer());
      document.fonts.add(await face.load());
    } catch (error) {
      loaded.delete(family);
      console.error(`[osrs] font ${family}`, error);
    }
  }));
}
