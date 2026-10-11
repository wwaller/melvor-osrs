const ITEM_CHOICES_KEY = 'items';

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
  const onChange = () => setTimeout(() => {
    rebuild();
    refreshVisible();
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

  ctx.patch(NamespacedObject, 'getMediaURL').replace(function (getMediaURL, media) {
    if (enabled && !this.isModded && typeof media === 'string') {
      const sprite = spriteFor(this, media);
      if (sprite) return spriteUrl(sprite);
    }
    return getMediaURL(media);
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
