const SOLID_CLASS = 'mobile-shop-solid';
const CATEGORY_KEY = 'category';
const CARD = 'mobile-shop-card';
const OPEN = 'mobile-shop-open';
const LOCKED = 'mobile-shop-locked';
const SELECTED = 'mobile-shop-selected';
const UNAVAILABLE = 'mobile-shop-unavailable';
const ABYSSAL_REALM = 'melvorItA:Abyssal';
const SLAYER_COINS_BOX = 'mobile-shop-slayer-coins';
const abyssUnlocked = () => Boolean(game.realms?.getObjectByID(ABYSSAL_REALM)?.isUnlocked);
const UNLOCKED_BY = {
  'melvorF:Township': () => Boolean(game.township?.isUnlocked),
  'melvorAoD:AtlasOfDiscovery': () => Boolean(game.archaeology?.isUnlocked || game.cartography?.isUnlocked),
  'melvorItA:IntoTheAbyss': abyssUnlocked,
  'melvorItA:AbyssalSlayer': abyssUnlocked,
};

export function canBuy(shop, game, purchase) {
  if (shop.isPurchaseAtBuyLimit(purchase)) return false;
  if (!game.checkRequirements(purchase.purchaseRequirements, false)) return false;
  const quantity = purchase.allowQuantityPurchase ? shop.capPurchaseQuantity(purchase, shop.buyQuantity) : 1;
  return quantity > 0 && shop.getPurchaseCosts(purchase, quantity).checkIfOwned();
}

export function addSlayerCoins(doc, coins) {
  const gp = doc.getElementById('nav-shop-currency-tooltip')?.parentElement;
  if (!gp || !coins || doc.getElementById(SLAYER_COINS_BOX)) return null;
  const icon = doc.createElement('img');
  icon.className = 'skill-icon-xxs';
  icon.src = coins.media;
  const amount = doc.createElement('span');
  amount.className = 'font-w600';
  amount.setAttribute('data-currency-quantity', coins.id);
  amount.setAttribute('data-currency-highlight', 'true');
  const box = doc.createElement('div');
  box.id = SLAYER_COINS_BOX;
  box.className = `${gp.className} mr-1`;
  box.append(icon, amount);
  gp.before(box);
  coins.renderQuantities();
  return box;
}

export function setup(ctx) {
  ctx.loadStylesheet('style.css');
  const settings = ctx.settings.section('Accessibility');
  const solid = (on) => document.body.classList.toggle(SOLID_CLASS, Boolean(on));
  settings.add([{ type: 'switch', name: 'solid-buttons', label: 'Solid shop buttons', hint: 'The category buttons and shop cards get a solid background instead of a see-through one.', default: false, onChange: solid }]);
  ctx.onInterfaceReady(() => solid(settings.get('solid-buttons')));
  let open = null;
  let selected = null;
  let nav = null;
  let shopShown = false;
  const tabs = new Set();
  const stale = new Set();
  const buttons = new Map();

  const refreshAll = () => tabs.forEach(refresh);

  const dress = (purchase, container, item) => {
    container.classList.add(CARD);
    item.name.classList.add('mobile-shop-name');
    item.costContainer.classList.add('mobile-shop-cost');
    item.costFlex.classList.add('mobile-shop-price');
    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'btn btn-sm btn-success mobile-shop-buy';
    buy.textContent = 'Buy';
    item.mediaBody.append(buy);
    item.mobileShopBuy = buy;
    container.firstElementChild.addEventListener('click', (event) => {
      if (event.target.closest('.mobile-shop-buy')) return;
      event.stopPropagation();
      event.preventDefault();
      open = open === purchase ? null : purchase;
      refreshAll();
    }, true);
  };

  function refresh(tab) {
    tabs.add(tab);
    if (!shopShown) {
      stale.add(tab);
      return;
    }
    stale.delete(tab);
    const byContainer = new Map([...tab.items].map(([purchase, entry]) => [entry.container, { purchase, ...entry }]));
    for (const container of tab.itemsContainer.children) {
      const entry = byContainer.get(container);
      if (!entry) continue;
      const { purchase, item } = entry;
      if (!container.classList.contains(CARD)) dress(purchase, container, item);
      const buyable = canBuy(game.shop, game, purchase);
      const expanded = open === purchase;
      container.classList.toggle(LOCKED, !buyable);
      container.classList.toggle(OPEN, expanded);
      if (item.mobileShopBuy.disabled === buyable) item.mobileShopBuy.disabled = !buyable;
    }
  }

  const available = (menu, category) => Boolean(category) && !category.isGolbinRaid && menu.shouldShowCategory(category) && (UNLOCKED_BY[category.id]?.() ?? true);
  const firstCategory = (menu) => game.shop.categoryDisplayOrder.find((category) => available(menu, category));
  const markSelected = () => buttons.forEach((button, category) => button.classList.toggle(SELECTED, category === selected));
  const updateCategories = () => {
    buttons.forEach((button, category) => button.classList.toggle(UNAVAILABLE, !category.isGolbinRaid && !available(shopMenu, category)));
    if (selected && !available(shopMenu, selected)) shopMenu.showSingleTab(firstCategory(shopMenu));
  };

  for (const method of ['updateItemSelection', 'updatePurchaseCosts', 'updatePurchaseRequirements', 'updateForBuyQtyChange']) {
    ctx.patch(ShopTabMenu, method).after(function () {
      refresh(this);
    });
  }
  ctx.patch(ShopMenu, 'showSingleTab').after((_result, category) => {
    if (category.isGolbinRaid) return;
    selected = category;
    open = null;
    if (ctx.accountStorage.getItem(CATEGORY_KEY) !== category.id) ctx.accountStorage.setItem(CATEGORY_KEY, category.id);
    markSelected();
  });
  ctx.patch(ShopMenu, 'showAllTabsButRaid').after(function () {
    nav?.classList.add('mobile-shop-nav');
    this.showSingleTab(selected ?? firstCategory(this));
  });

  ctx.onInterfaceReady(() => {
    addSlayerCoins(document, game.slayerCoins);
    const shop = document.getElementById('new-shop');
    const list = document.getElementById('shop-tab-container');
    if (!shop || !list || typeof shopMenu === 'undefined') return;
    nav = list.closest('#horizontal-navigation-shop');
    if (nav) {
      nav.parentElement?.classList.add('mobile-shop-old-nav');
      shop.prepend(nav);
      nav.classList.add('mobile-shop-nav');
    }
    list.classList.add('mobile-shop-categories');
    const items = [...list.children];
    items.filter((item) => item.querySelector('[onclick*="showAllTabsButRaid"]')).forEach((item) => item.classList.add('mobile-shop-all'));
    const categoryItems = items.filter((item) => !item.classList.contains('mobile-shop-all'));
    game.shop.categoryDisplayOrder.forEach((category, index) => {
      if (categoryItems[index]) buttons.set(category, categoryItems[index]);
    });
    new IntersectionObserver(([entry]) => {
      shopShown = entry.isIntersecting;
      if (!shopShown) return;
      updateCategories();
      [...stale].forEach(refresh);
    }).observe(shop);
    const saved = game.shop.categories.getObjectByID(ctx.accountStorage.getItem(CATEGORY_KEY));
    selected = available(shopMenu, saved) ? saved : firstCategory(shopMenu);
    if (selected) shopMenu.showSingleTab(selected);
    updateCategories();
    shopMenu.tabs.forEach(({ menu }) => refresh(menu));
  });
}
