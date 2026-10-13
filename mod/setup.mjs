const ITEM_CHOICES_KEY = 'items';
const MEDIA_PATH = /assets\/media\/[^?#"']+/;
const ITEM_MEDIA = 'assets/media/bank/';
const SETTINGS_ICON = 'assets/media/main/settings_header.png';

export async function setup(ctx) {
  const { settings, entries } = await ctx.loadData('mapping.json');
  const sectionOf = new Map(settings.map((s) => [s.name, s.section]));
  const urls = new Map();
  const spriteUrl = (sprite) => {
    if (!urls.has(sprite)) urls.set(sprite, ctx.getResourceUrl(sprite));
    return urls.get(sprite);
  };
  const isOn = (name) => ctx.settings.section(sectionOf.get(name)).get(name) !== false;
  const pathOf = (media) => media.split('?', 1)[0];

  let enabled = true;
  let active = new Map();
  let choices = loadChoices(ctx);

  const pick = (entry, followCategories) => {
    if (!entry || (followCategories && !entry.t.every(isOn))) return undefined;
    const off = (entry.v || []).filter((name) => !isOn(name)).join('+');
    return off ? entry.a && entry.a[off] : entry.s;
  };
  const spriteFor = (object, media) => {
    const choice = choices.get(object.id);
    if (choice === false) return undefined;
    return choice === true ? pick(entries[pathOf(media)], false) : active.get(pathOf(media));
  };
  const rebuild = () => {
    enabled = isOn('enabled');
    active = new Map();
    for (const [media, entry] of Object.entries(entries)) {
      const sprite = pick(entry, true);
      if (sprite) active.set(media, sprite);
    }
  };
  const refreshVisible = () => {
    document.querySelectorAll('bank-item-icon').forEach((icon) => {
      if (icon.item && icon.image) icon.image.src = icon.item.media;
    });
    const selected = typeof game !== 'undefined' && game.bank ? game.bank.selectedBankItem : undefined;
    if (selected && typeof bankSideBarMenu !== 'undefined') bankSideBarMenu.setItem(selected, game);
  };
  let itemsByMedia;
  const itemWithMedia = (media) => {
    if (!itemsByMedia && typeof game !== 'undefined' && game.items && game.items.size > 0) {
      itemsByMedia = new Map();
      for (const item of game.items.allObjects) {
        const path = pathOf(String(item._media || ''));
        if (!itemsByMedia.has(path)) itemsByMedia.set(path, item);
      }
    }
    return itemsByMedia && itemsByMedia.get(media);
  };
  /** Icons Melvor puts straight into <img> tags (skill icons, the enemy panel's stats, the combat menu's tabs) never pass through getMediaURL; item pictures among them follow that item's own choice. */
  const swapImage = (image) => {
    if (!enabled) return;
    const src = image.getAttribute('src');
    if (!src || src.startsWith('blob:')) return;
    const media = src.match(MEDIA_PATH)?.[0];
    const item = media && media.startsWith(ITEM_MEDIA) && itemWithMedia(media);
    const sprite = media && (media.startsWith(ITEM_MEDIA) ? item && spriteFor(item, media) : active.get(media));
    if (!sprite) return;
    image.dataset.osrsSpritesOriginal = src;
    image.src = spriteUrl(sprite);
  };
  const swapWithin = (root) => {
    if (root.tagName === 'IMG') swapImage(root);
    root.querySelectorAll?.('img[src]').forEach(swapImage);
  };
  const restoreImages = () => document.querySelectorAll('img[data-osrs-sprites-original]').forEach((image) => {
    image.src = image.dataset.osrsSpritesOriginal;
    delete image.dataset.osrsSpritesOriginal;
  });
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') swapImage(record.target);
      else record.addedNodes.forEach((node) => node.nodeType === Node.ELEMENT_NODE && swapWithin(node));
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

  const onChange = () => setTimeout(() => {
    rebuild();
    refreshVisible();
    restoreImages();
    swapWithin(document.body);
  });

  for (const section of new Set(settings.map((s) => s.section))) {
    ctx.settings.section(section).add(settings.filter((s) => s.section === section).map((s) => ({
      type: 'switch', name: s.name, label: s.label, hint: s.hint, default: true, onChange,
    })));
  }
  ctx.settings.section('General').add([
    {
      type: 'label',
      name: 'single-items',
      label: 'To change one item, select it in the bank, open Item Settings, and use the OSRS art switch. Screens outside the bank update after a reload.',
    },
    {
      type: 'button',
      name: 'reset-items',
      display: 'Reset single-item choices',
      color: 'secondary',
      onClick: () => {
        choices = new Map();
        saveChoices(ctx, choices);
        refreshVisible();
      },
    },
  ]);
  rebuild();
  swapWithin(document.body);

  ctx.patch(NamespacedObject, 'getMediaURL').replace(function (getMediaURL, media) {
    if (enabled && !this.isModded && typeof media === 'string') {
      /** A page's sidebar icon can be other art than its header (the Shop's is the GP coin); give both the header's OSRS art. */
      const headerMedia = this.sidebarItem && media === this.sidebarItem.icon ? this._media : undefined;
      const sprite = (headerMedia && spriteFor(this, headerMedia)) || spriteFor(this, media);
      if (sprite) return spriteUrl(sprite);
    }
    return getMediaURL(media);
  });

  /** Mod Settings shows a gear glyph rather than an image; give it the Settings page's OSRS wrench. */
  ctx.onInterfaceReady(() => {
    const sprite = enabled && active.get(SETTINGS_ICON);
    const modding = sprite && sidebar.category('Modding');
    if (modding && modding.items().some((item) => item.id === 'Mod Settings')) modding.item('Mod Settings', { icon: spriteUrl(sprite) });
  });

  ctx.patch(BankItemSettingsMenuElement, 'setItem').after(function (_result, bankItem) {
    const item = bankItem.item;
    const entry = entries[pathOf(String(item._media || ''))];
    let row = this.querySelector('.osrs-sprites-item');
    if (!row) {
      row = itemToggle();
      this.selectedItemContainer.append(row);
      row.querySelector('input').addEventListener('change', (event) => {
        choices.set(row.itemId, event.target.checked);
        saveChoices(ctx, choices);
        refreshVisible();
      });
      row.querySelector('a').addEventListener('click', () => {
        choices.delete(row.itemId);
        saveChoices(ctx, choices);
        refreshVisible();
      });
    }
    row.itemId = item.id;
    row.classList.toggle('d-none', !entry);
    if (!entry) return;
    const choice = choices.get(item.id);
    row.querySelector('input').checked = enabled && (choice === undefined ? active.has(pathOf(item._media)) : choice);
    row.querySelector('.osrs-sprites-note').textContent = choice === undefined ? 'Following Mod Settings.' : 'Set for this item only.';
    row.querySelector('a').classList.toggle('d-none', choice === undefined);
  });

  console.log(`[OSRS Sprites] ${active.size} of ${Object.keys(entries).length} images replaced`);
}

function itemToggle() {
  const row = document.createElement('div');
  row.className = 'osrs-sprites-item mt-3 mb-2';
  row.style.display = 'block';
  row.innerHTML = `
    <div class="custom-control custom-switch custom-control-lg">
      <input type="checkbox" class="custom-control-input" id="osrs-sprites-item-art">
      <label class="custom-control-label" for="osrs-sprites-item-art">OSRS art for this item</label>
    </div>
    <div class="font-size-sm text-muted mt-1" style="display: block;">
      <span class="osrs-sprites-note"></span>
      <a role="button" class="ml-2 pointer-enabled">Use Mod Settings</a>
    </div>`;
  return row;
}

function loadChoices(ctx) {
  const stored = ctx.accountStorage.getItem(ITEM_CHOICES_KEY) || {};
  return new Map([...(stored.on || []).map((id) => [id, true]), ...(stored.off || []).map((id) => [id, false])]);
}

function saveChoices(ctx, choices) {
  const on = [...choices].filter(([, v]) => v).map(([id]) => id);
  const off = [...choices].filter(([, v]) => !v).map(([id]) => id);
  try {
    ctx.accountStorage.setItem(ITEM_CHOICES_KEY, { on, off });
  } catch (e) {
    console.warn('[OSRS Sprites] Could not save single-item choices (account storage holds 8 KB per mod).', e);
  }
}
