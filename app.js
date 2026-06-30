const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTICNfcYM4ZrXvEr05Sd5n6pVk_wyRjBcl8A1EsP2Nlu-cgK8yJT1OYANoAp88ktCvHsTEAiXGquXdB/pub?gid=0&single=true&output=csv";

const INFO_DESCRIPTION =
  "Tienda de cachimbas y accesorios. L-V 07:00-14:30. S 07:00-11:30. Carretera de la Mojonera 282.";
const WHATSAPP_ORDER_PHONE = "34651441589";
const INVALID_DEEP_LINK_MESSAGE =
  "La seccion, producto o categoria que te han compartido no se encuentra disponible en este momento.";
const VALID_TABS = ["historia", "catalogo", "pedidos"];
const VALID_SORTS = ["featured", "price-asc", "price-desc", "name-asc", "name-desc"];
const DEEP_LINK_KEYS = ["tab", "cat", "sub", "q", "sort", "product"];

const state = {
  items: [],
  categories: [],
  activeCategory: "",
  activeSubcategory: "ALL",
  searchQuery: "",
  sortBy: "featured",
  activeTab: "historia",
  activeProduct: "",
  activeProductName: "",
  isApplyingUrlState: false,
  deepLinkNoticeTimer: null,
};

const ui = {
  loadingOverlay: document.getElementById("loadingOverlay"),
  subtitle: document.getElementById("subtitle"),
  shopOpenStatus: document.getElementById("shopOpenStatus"),
  status: document.getElementById("status"),
  setupPanel: document.getElementById("setupPanel"),
  catalogTitle: document.getElementById("catalogTitle"),
  categoryMenu: document.getElementById("categoryMenu"),
  subcategoryMenu: document.getElementById("subcategoryMenu"),
  gallery: document.getElementById("gallery"),
  searchInput: document.getElementById("searchInput"),
  searchClear: document.getElementById("searchClear"),
  sortSelect: document.getElementById("sortSelect"),
  imageLightbox: document.getElementById("imageLightbox"),
  lightboxImage: document.getElementById("lightboxImage"),
  lightboxCaption: document.getElementById("lightboxCaption"),
  lightboxClose: document.getElementById("lightboxClose"),
  lightboxWhatsapp: document.getElementById("lightboxWhatsapp"),
  lightboxShare: document.getElementById("lightboxShare"),
  deepLinkNotice: document.getElementById("deepLinkNotice"),
};

bootstrap();

async function bootstrap() {
  initTabs();
  applyTabFromUrl();
  ui.subtitle.textContent = INFO_DESCRIPTION;
  initOpeningStatus();
  initLightbox();
  initHistoryNavigation();
  showLoading(true);

  try {
    setStatus("Cargando CSV...");
    const rawCsv = await fetchCsv(CSV_URL);
    const rows = parseCsv(rawCsv);
    state.items = normalizeRows(rows).filter((item) => item.showInWeb);

    buildCategoryState();
    renderCategoryMenu();
    renderSubcategoryMenu();
    renderGallery();
    initSearch();
    initSort();
    applyCatalogStateFromUrl();
    syncUrlFromState();

    ui.setupPanel.style.display = "none";
    document.body.classList.add("connected");
    setStatus(`Catalogo cargado: ${state.items.length} productos`);
  } catch (error) {
    console.error(error);
    ui.setupPanel.style.display = "block";
    setStatus(`Error cargando CSV: ${error.message}`, true);
    ui.gallery.innerHTML = "";

    const empty = document.createElement("article");
    empty.className = "empty-state";
    empty.textContent = "No se pudo cargar el catalogo. Contacta con nosotros en Ig o en Whatsapp.";
    ui.gallery.appendChild(empty);
  } finally {
    showLoading(false);
  }
}

async function fetchCsv(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

function parseCsv(csvText) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }

      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeRows(rows) {
  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const findHeader = (...names) => {
    const normalizedNames = names.map((name) => normalize(name));
    return headers.findIndex((header) => normalizedNames.includes(normalize(header)));
  };

  const idx = {
    nombre: findHeader("nombre"),
    categoria: findHeader("categoria"),
    stock: findHeader("stock"),
    sinStock: findHeader("sin stock"),
    url: findHeader("url"),
    oferta: findHeader("oferta"),
    liquidacion: findHeader("liquidacion"),
    aniversario: findHeader("5 aniversario"),
    segundaMano: findHeader("#2Mano", "2mano", "segunda mano"),
    mostrarWeb: findHeader("mostrar en web"),
    precio: findHeader("precio", "precios", "pvp"),
    precioOferta: findHeader("precio oferta", "precio-oferta", "oferta precio"),
  };

  return rows.slice(1).map((cells) => {
    const rawCategory = getCell(cells, idx.categoria).trim();
    const hasCategory = Boolean(rawCategory);
    const categoryParts = hasCategory
      ? rawCategory
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
      : [];

    const topCategory = categoryParts[0] || "";
    const subcategoryPath = categoryParts.length > 1 ? categoryParts.slice(1).join("/") : (hasCategory ? "General" : "");

    const rawUrl = getCell(cells, idx.url).trim();

    return {
      name: getCell(cells, idx.nombre).trim(),
      categoryPath: rawCategory,
      topCategory,
      subcategoryPath,
      stock: getCell(cells, idx.stock).trim(),
      price: getCell(cells, idx.precio).trim(),
      salePrice: getCell(cells, idx.precioOferta).trim(),
      url: rawUrl,
      imageUrl: toImageUrl(rawUrl),
      isOutOfStock: toBoolean(getCell(cells, idx.sinStock), false),
      isOffer: toBoolean(getCell(cells, idx.oferta), false),
      isLiquidation: toBoolean(getCell(cells, idx.liquidacion), false),
      isAnniversary: toBoolean(getCell(cells, idx.aniversario), false),
      isSecondHand: toBoolean(getCell(cells, idx.segundaMano), false),
      showInWeb: toBoolean(getCell(cells, idx.mostrarWeb), true),
    };
  });
}

function getCell(cells, index) {
  if (index < 0 || index >= cells.length) {
    return "";
  }

  return cells[index] ?? "";
}

function toBoolean(value, defaultValue) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return defaultValue;
  }

  return ["true", "1", "si", "sí", "yes", "y", "verdadero"].includes(normalized);
}

function toImageUrl(originalUrl) {
  const fileIdMatch = originalUrl.match(/\/file\/d\/([^/]+)/);
  if (fileIdMatch) {
    return `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w1200`;
  }

  const idMatch = originalUrl.match(/[?&]id=([^&]+)/);
  if (idMatch) {
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1200`;
  }

  return originalUrl;
}

function stripSpecialCategoryMarker(category) {
  return String(category || "").trim().replace(/^!+\s*/, "");
}

function buildCategoryState() {
  const PRIORITY = ["cachimbas", "cazoletas"];
  const isPinnedCategory = (category) => String(category || "").trim().startsWith("!");
  const categorySortLabel = (category) => stripSpecialCategoryMarker(category);

  const categories = [...new Set(state.items
    .filter((item) => item.topCategory)
    .map((item) => item.topCategory))].sort((a, b) => {
    const aPinned = isPinnedCategory(a);
    const bPinned = isPinnedCategory(b);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    const aLabel = categorySortLabel(a);
    const bLabel = categorySortLabel(b);

    const ai = PRIORITY.indexOf(aLabel.toLowerCase());
    const bi = PRIORITY.indexOf(bLabel.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return aLabel.localeCompare(bLabel, "es");
  });

  state.categories = categories;

  const hasAnniversary = state.items.some((item) => item.isAnniversary);
  const hasOffers = state.items.some((item) => item.isOffer);
  state.activeCategory = hasAnniversary
    ? "ANIVERSARIO"
    : (hasOffers ? "OFERTAS" : (categories[0] || ""));
  state.activeSubcategory = "ALL";
}

function renderCategoryMenu() {
  ui.categoryMenu.innerHTML = "";

  const isPinnedCategory = (category) => String(category || "").trim().startsWith("!");
  const categoryDisplayLabel = (category) => stripSpecialCategoryMarker(category);

  const hasAnniversary = state.items.some((item) => item.isAnniversary);
  if (hasAnniversary) {
    const anniversaryButton = createCategoryButton("5 Aniversario", "ANIVERSARIO", "anniversary");
    ui.categoryMenu.appendChild(anniversaryButton);
  }

  const hasOffers = state.items.some((item) => item.isOffer);
  if (hasOffers) {
    const offerButton = createCategoryButton("OFERTAS!", "OFERTAS", "offer");
    ui.categoryMenu.appendChild(offerButton);
  }

  const hasLiquidation = state.items.some((item) => item.isLiquidation);
  if (hasLiquidation) {
    const liquidationButton = createCategoryButton("Liquidación", "LIQUIDACION", "offer");
    ui.categoryMenu.appendChild(liquidationButton);
  }

  state.categories.forEach((category) => {
    const button = createCategoryButton(
      categoryDisplayLabel(category),
      category,
      isPinnedCategory(category) ? "pinned" : "default"
    );
    ui.categoryMenu.appendChild(button);
  });

  const hasSecondHand = state.items.some((item) => item.isSecondHand);
  if (hasSecondHand) {
    const secondHandButton = createCategoryButton("#2Mano", "2MANO", "offer");
    ui.categoryMenu.appendChild(secondHandButton);
  }
}

function initTabs() {
  const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
  const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));

  const setActiveTab = (tab, shouldSyncUrl = true) => {
    const selectedTab = VALID_TABS.includes(tab) ? tab : "historia";
    state.activeTab = selectedTab;

    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === selectedTab;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    tabPanels.forEach((panel) => {
      const isActive = panel.id === `tab-${selectedTab}`;
      panel.classList.toggle("hidden", !isActive);
    });

    if (shouldSyncUrl) {
      syncUrlFromState();
    }
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveTab(btn.dataset.tab || "historia", true);
    });
  });

  state.setActiveTab = setActiveTab;
}

function showDeepLinkNotice(message) {
  if (!ui.deepLinkNotice) {
    return;
  }

  ui.deepLinkNotice.textContent = message;
  ui.deepLinkNotice.classList.remove("hidden");

  if (state.deepLinkNoticeTimer) {
    window.clearTimeout(state.deepLinkNoticeTimer);
  }

  state.deepLinkNoticeTimer = window.setTimeout(() => {
    ui.deepLinkNotice.classList.add("hidden");
  }, 6000);
}

function hideDeepLinkNotice() {
  if (!ui.deepLinkNotice) {
    return;
  }

  if (state.deepLinkNoticeTimer) {
    window.clearTimeout(state.deepLinkNoticeTimer);
    state.deepLinkNoticeTimer = null;
  }

  ui.deepLinkNotice.classList.add("hidden");
}

function applyTabFromUrl() {
  const params = getUrlParams();
  const tab = params.get("tab");
  if (typeof state.setActiveTab === "function") {
    state.setActiveTab(tab || "historia", false);
  }
}

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const hasKnownParams = DEEP_LINK_KEYS.some((key) => params.has(key));

  if (hasKnownParams) {
    return params;
  }

  const entries = Array.from(params.entries());
  if (entries.length !== 1 || entries[0][1] !== "") {
    return params;
  }

  const maybeEncodedQuery = entries[0][0] || "";
  const decoded = decodeURIComponent(maybeEncodedQuery).replace(/^\?+/, "");
  if (!decoded.includes("=")) {
    return params;
  }

  return new URLSearchParams(decoded);
}

function initHistoryNavigation() {
  window.addEventListener("popstate", () => {
    state.isApplyingUrlState = true;
    try {
      applyTabFromUrl();
      if (state.items.length) {
        applyCatalogStateFromUrl();
      }
    } finally {
      state.isApplyingUrlState = false;
    }
  });
}

function slugify(value) {
  return normalize(String(value || ""))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapCategoryToParam(categoryValue) {
  if (!categoryValue) return "";
  const cleanCategory = stripSpecialCategoryMarker(categoryValue);
  const normalized = normalize(cleanCategory);
  if (normalized === "aniversario") return "aniversario";
  if (normalized === "ofertas") return "ofertas";
  if (normalized === "liquidacion") return "liquidacion";
  if (normalized === "2mano") return "2mano";
  return slugify(cleanCategory);
}

function mapParamToCategory(categoryParam) {
  const value = slugify(categoryParam || "");
  if (!value) return "";
  if (value === "aniversario") return "ANIVERSARIO";
  if (value === "ofertas") return "OFERTAS";
  if (value === "liquidacion") return "LIQUIDACION";
  if (value === "2mano") return "2MANO";

  const match = state.categories.find((category) => slugify(stripSpecialCategoryMarker(category)) === value);
  return match || "";
}

function toProductParam(item) {
  return slugify(item.name || "producto");
}

function findItemByProductParam(productParam) {
  const target = slugify(productParam || "");
  if (!target) {
    return null;
  }
  return state.items.find((item) => toProductParam(item) === target) || null;
}

function deriveCategoryForItem(item) {
  if (!item) {
    return state.activeCategory;
  }

  if (item.topCategory) {
    return item.topCategory;
  }

  if (item.isAnniversary) {
    return "ANIVERSARIO";
  }

  if (item.isOffer) {
    return "OFERTAS";
  }

  if (item.isLiquidation) {
    return "LIQUIDACION";
  }

  if (item.isSecondHand) {
    return "2MANO";
  }

  return state.activeCategory;
}

function applyCatalogStateFromUrl() {
  const params = getUrlParams();
  const tab = params.get("tab");
  const categoryParam = params.get("cat");
  const subcategoryParam = params.get("sub");
  const searchParam = params.get("q");
  const sortParam = params.get("sort");
  const productParam = params.get("product");

  const hasCatalogIntent = Boolean(categoryParam || subcategoryParam || searchParam || productParam);
  let hasInvalidDeepLink = false;

  if (tab && !VALID_TABS.includes(tab)) {
    hasInvalidDeepLink = true;
  }

  if (typeof state.setActiveTab === "function") {
    state.setActiveTab(tab || (hasCatalogIntent ? "catalogo" : (state.activeTab || "historia")), false);
  }

  const requestedProduct = findItemByProductParam(productParam);
  if (productParam && !requestedProduct) {
    hasInvalidDeepLink = true;
  }

  const mappedCategory = mapParamToCategory(categoryParam);

  if (requestedProduct) {
    state.activeCategory = deriveCategoryForItem(requestedProduct);
    state.activeSubcategory = requestedProduct.subcategoryPath || "ALL";
  } else {
    if (categoryParam && !mappedCategory) {
      hasInvalidDeepLink = true;
    }

    if (mappedCategory) {
      state.activeCategory = mappedCategory;
    }

    if (subcategoryParam) {
      const currentSubcategories = getCurrentSubcategories();
      const subMatch = currentSubcategories.find((sub) => slugify(sub) === slugify(subcategoryParam));
      state.activeSubcategory = subMatch || "ALL";
      if (!subMatch) {
        hasInvalidDeepLink = true;
      }
    } else {
      state.activeSubcategory = "ALL";
    }
  }

  state.searchQuery = (searchParam || "").trim();
  ui.searchInput.value = state.searchQuery;
  ui.searchClear.classList.toggle("hidden", !state.searchQuery);

  if (VALID_SORTS.includes(sortParam || "")) {
    state.sortBy = sortParam;
  } else if (sortParam) {
    hasInvalidDeepLink = true;
  }
  ui.sortSelect.value = state.sortBy;

  renderCategoryMenu();
  renderSubcategoryMenu();
  renderGallery();

  if (requestedProduct && state.activeTab === "catalogo") {
    state.activeProduct = toProductParam(requestedProduct);
    openLightbox(
      requestedProduct.imageUrl,
      requestedProduct.name || "Producto",
      requestedProduct.price || "",
      requestedProduct.salePrice || ""
    );
  } else {
    state.activeProduct = "";
    closeLightbox();
  }

  if (hasInvalidDeepLink) {
    showDeepLinkNotice(INVALID_DEEP_LINK_MESSAGE);
  } else {
    hideDeepLinkNotice();
  }
}

function syncUrlFromState() {
  if (state.isApplyingUrlState) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const activeTab = state.activeTab || "historia";

  if (activeTab !== "historia") {
    params.set("tab", activeTab);
  } else {
    params.delete("tab");
  }

  if (activeTab === "catalogo") {
    const categoryParam = mapCategoryToParam(state.activeCategory);
    if (categoryParam) {
      params.set("cat", categoryParam);
    } else {
      params.delete("cat");
    }

    if (state.activeSubcategory && state.activeSubcategory !== "ALL") {
      params.set("sub", slugify(state.activeSubcategory));
    } else {
      params.delete("sub");
    }

    if (state.searchQuery) {
      params.set("q", state.searchQuery);
    } else {
      params.delete("q");
    }

    if (state.sortBy && state.sortBy !== "featured") {
      params.set("sort", state.sortBy);
    } else {
      params.delete("sort");
    }

    if (state.activeProduct) {
      params.set("product", state.activeProduct);
    } else {
      params.delete("product");
    }
  } else {
    params.delete("cat");
    params.delete("sub");
    params.delete("q");
    params.delete("sort");
    params.delete("product");
  }

  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function createCategoryButton(label, value, variant = "default") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "category-chip";

  if (variant === "offer") {
    button.classList.add("offer-chip");
  } else if (variant === "anniversary") {
    button.classList.add("anniversary-chip");
  } else if (variant === "pinned") {
    button.classList.add("pinned-chip");
  }

  if (state.activeCategory === value) {
    button.classList.add("active");
  }

  button.textContent = label;
  button.addEventListener("click", () => {
    if (state.activeCategory === value) {
      return;
    }

    state.activeCategory = value;
    state.activeSubcategory = "ALL";
    renderCategoryMenu();
    renderSubcategoryMenu();
    renderGallery();
    syncUrlFromState();
  });

  return button;
}

function renderSubcategoryMenu() {
  ui.subcategoryMenu.innerHTML = "";

  const subcategories = getCurrentSubcategories();
  if (!subcategories.length) {
    ui.subcategoryMenu.style.display = "none";
    return;
  }

  ui.subcategoryMenu.style.display = "";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = `category-chip ${state.activeSubcategory === "ALL" ? "active" : ""}`;
  allButton.textContent = "Todas";
  allButton.addEventListener("click", () => {
    if (state.activeSubcategory === "ALL") {
      return;
    }

    state.activeSubcategory = "ALL";
    renderSubcategoryMenu();
    renderGallery();
    syncUrlFromState();
  });
  ui.subcategoryMenu.appendChild(allButton);

  subcategories.forEach((subcategory) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `category-chip ${
      subcategory === state.activeSubcategory ? "soft-active" : ""
    }`;
    button.textContent = subcategory;
    button.addEventListener("click", () => {
      if (state.activeSubcategory === subcategory) {
        return;
      }

      state.activeSubcategory = subcategory;
      renderSubcategoryMenu();
      renderGallery();
      syncUrlFromState();
    });

    ui.subcategoryMenu.appendChild(button);
  });
}

function getCurrentSubcategories() {
  const selected = getCategoryItems();
  const subcategories = [...new Set(selected.map((item) => item.subcategoryPath).filter(Boolean))];

  if (!subcategories.length) {
    return [];
  }

  if (subcategories.length === 1 && subcategories[0] === "General") {
    return [];
  }

  const SUBCATEGORY_PRIORITY = {
    cachimbas: ["Económicas (50-99)", "Standar (100-150)", "Premium (+150)"],
  };

  const priorityList = SUBCATEGORY_PRIORITY[state.activeCategory.toLowerCase()] || [];

  return subcategories.sort((a, b) => {
    const ai = priorityList.findIndex((p) => normalize(p) === normalize(a));
    const bi = priorityList.findIndex((p) => normalize(p) === normalize(b));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "es");
  });
}

function getCategoryItems() {
  if (state.activeCategory === "ANIVERSARIO") {
    return state.items.filter((item) => item.isAnniversary);
  }

  if (state.activeCategory === "OFERTAS") {
    return state.items.filter((item) => item.isOffer);
  }

  if (state.activeCategory === "LIQUIDACION") {
    return state.items.filter((item) => item.isLiquidation);
  }

  if (state.activeCategory === "2MANO") {
    return state.items.filter((item) => item.isSecondHand);
  }

  return state.items.filter((item) => item.topCategory === state.activeCategory);
}

function normalize(str) {
  return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getFilteredItems() {
  const sortItems = (list) => {
    const sorted = [...list];

    if (state.sortBy === "name-asc") {
      return sorted.sort((a, b) => normalize(a.name).localeCompare(normalize(b.name), "es"));
    }

    if (state.sortBy === "name-desc") {
      return sorted.sort((a, b) => normalize(b.name).localeCompare(normalize(a.name), "es"));
    }

    if (state.sortBy === "price-asc" || state.sortBy === "price-desc") {
      const dir = state.sortBy === "price-asc" ? 1 : -1;
      return sorted.sort((a, b) => {
        const pa = parsePriceValue(a.price);
        const pb = parsePriceValue(b.price);

        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return (pa - pb) * dir;
      });
    }

    return sorted;
  };

  if (state.searchQuery) {
    const q = normalize(state.searchQuery);
    return sortItems(state.items.filter(
      (item) =>
        normalize(item.name).includes(q) ||
        normalize(item.categoryPath).includes(q)
    ));
  }

  const categoryItems = getCategoryItems();

  if (state.activeSubcategory === "ALL") {
    return sortItems(categoryItems);
  }

  return sortItems(categoryItems.filter((item) => item.subcategoryPath === state.activeSubcategory));
}

function parsePriceValue(priceText) {
  const raw = String(priceText || "").trim();
  if (!raw) {
    return null;
  }

  const clean = raw.replace(/\s/g, "").replace(/€/g, "").replace(/[^\d,.-]/g, "");
  if (!clean) {
    return null;
  }

  const normalized =
    clean.includes(",") && clean.includes(".")
      ? clean.replace(/\./g, "").replace(",", ".")
      : clean.replace(",", ".");

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function initSearch() {
  ui.searchInput.addEventListener("input", () => {
    state.searchQuery = ui.searchInput.value.trim();
    state.activeProduct = "";
    ui.searchClear.classList.toggle("hidden", !state.searchQuery);
    if (state.searchQuery) {
      ui.catalogTitle.textContent = `Resultados: "${state.searchQuery}"`;
    } else {
      ui.catalogTitle.textContent = stripSpecialCategoryMarker(state.activeCategory) || "Catalogo";
    }
    renderGallery();
    syncUrlFromState();
  });

  ui.searchClear.addEventListener("click", () => {
    ui.searchInput.value = "";
    state.searchQuery = "";
    state.activeProduct = "";
    ui.searchClear.classList.add("hidden");
    ui.catalogTitle.textContent = stripSpecialCategoryMarker(state.activeCategory) || "Catalogo";
    renderGallery();
    syncUrlFromState();
    ui.searchInput.focus();
  });
}

function initSort() {
  ui.sortSelect.addEventListener("change", () => {
    state.sortBy = ui.sortSelect.value;
    renderGallery();
    syncUrlFromState();
  });
}

function initOpeningStatus() {
  if (!ui.shopOpenStatus) {
    return;
  }

  const getSlotsForDay = (day) => {
    if (day >= 1 && day <= 5) {
      return [[7 * 60, 14 * 60 + 30]];
    }
    if (day === 6) {
      return [[7 * 60, 11 * 60 + 30]];
    }
    return [];
  };

  const formatTime = (minutes) => {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const dayName = (day) => ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"][day];

  const updateOpeningStatus = () => {
    const now = new Date();
    const day = now.getDay();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const todaySlots = getSlotsForDay(day);
    const activeSlot = todaySlots.find(([start, end]) => minutes >= start && minutes < end);
    const isOpen = Boolean(activeSlot);

    document.body.classList.toggle("shop-open", isOpen);
    document.body.classList.toggle("shop-closed", !isOpen);

    ui.shopOpenStatus.classList.remove("open", "closed");
    ui.shopOpenStatus.classList.add(isOpen ? "open" : "closed");

    if (isOpen) {
      ui.shopOpenStatus.textContent = `Ahora mismo abiertos · cerramos a las ${formatTime(activeSlot[1])}`;
    } else {
      let nextOpening = null;
      let nextDay = day;

      const upcomingToday = todaySlots.find(([start]) => start > minutes);
      if (upcomingToday) {
        nextOpening = upcomingToday[0];
      } else {
        for (let i = 1; i <= 7; i += 1) {
          const checkDay = (day + i) % 7;
          const slots = getSlotsForDay(checkDay);
          if (slots.length) {
            nextDay = checkDay;
            nextOpening = slots[0][0];
            break;
          }
        }
      }

      if (nextOpening === null) {
        ui.shopOpenStatus.textContent = "Ahora cerrados · sin horario configurado para proximas aperturas.";
      } else if (nextDay === day) {
        ui.shopOpenStatus.textContent = `Ahora cerrados · abrimos hoy a las ${formatTime(nextOpening)}`;
      } else {
        ui.shopOpenStatus.textContent = `Ahora cerrados · abrimos ${dayName(nextDay)} a las ${formatTime(nextOpening)}`;
      }
    }
  };

  updateOpeningStatus();
  setInterval(updateOpeningStatus, 60000);
}

function initLightbox() {
  ui.lightboxClose.addEventListener("click", closeLightbox);

  ui.lightboxShare.addEventListener("click", async () => {
    if (!state.activeProductName) {
      return;
    }

    syncUrlFromState();
    const shareText = `He encontrado ${state.activeProductName} en Roquetas Shisha Club miralo en este enlace: ${window.location.href}`;
    const copied = await copyToClipboard(shareText);

    const originalLabel = ui.lightboxShare.textContent;
    ui.lightboxShare.textContent = copied ? "Copiado" : "No se pudo copiar";
    window.setTimeout(() => {
      ui.lightboxShare.textContent = originalLabel;
    }, 1500);
  });

  ui.imageLightbox.addEventListener("click", (event) => {
    if (event.target === ui.imageLightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ui.imageLightbox.classList.contains("hidden")) {
      closeLightbox();
    }
  });
}

function openLightbox(src, altText, price = "", salePrice = "") {
  ui.lightboxImage.src = src;
  ui.lightboxImage.alt = altText || "Imagen de producto";
  const pieces = [altText || "Producto"];

  if (price && salePrice) {
    pieces.push(`${price} -> ${salePrice}`);
  } else if (salePrice) {
    pieces.push(salePrice);
  } else if (price) {
    pieces.push(price);
  }

  ui.lightboxCaption.textContent = pieces.join(" | ");
  state.activeProductName = altText || "Producto";

  // Ensure the shared link points to the currently opened product.
  syncUrlFromState();
  const productLink = window.location.href;

  const productName = altText || "este producto";
  const message = `Hola, buenas! Me interesa ${productName}. Quería preguntaros disponibilidad y cómo podría pedirlo. Enlace del producto: ${productLink}. Gracias!`;
  ui.lightboxWhatsapp.href = `https://api.whatsapp.com/send/?phone=${WHATSAPP_ORDER_PHONE}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;

  ui.imageLightbox.classList.remove("hidden");
  ui.imageLightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("lightbox-open");
}

function closeLightbox() {
  ui.imageLightbox.classList.add("hidden");
  ui.imageLightbox.setAttribute("aria-hidden", "true");
  ui.lightboxImage.src = "";
  ui.lightboxWhatsapp.href = "#";
  state.activeProductName = "";
  document.body.classList.remove("lightbox-open");

  if (state.activeProduct) {
    state.activeProduct = "";
    syncUrlFromState();
  }
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      return false;
    }
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (error) {
    copied = false;
  }

  document.body.removeChild(helper);
  return copied;
}

function renderGallery() {
  const items = getFilteredItems();
  ui.gallery.innerHTML = "";

  if (state.activeCategory === "ANIVERSARIO") {
    ui.catalogTitle.textContent = "5 Aniversario";
  } else if (state.activeCategory === "OFERTAS") {
    ui.catalogTitle.textContent = "OFERTAS!";
  } else if (state.activeCategory === "LIQUIDACION") {
    ui.catalogTitle.textContent = "Liquidación";
  } else if (state.activeCategory === "2MANO") {
    ui.catalogTitle.textContent = "#2Mano";
  } else {
    ui.catalogTitle.textContent = stripSpecialCategoryMarker(state.activeCategory) || "Catalogo";
  }

  if (!items.length) {
    const empty = document.createElement("article");
    empty.className = "empty-state";
    empty.textContent = "No hay productos para este filtro.";
    ui.gallery.appendChild(empty);
    setStatus("Sin resultados");
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "image-card";

    if (item.isOffer) {
      card.classList.add("offer-item");
    }

    if (item.isOutOfStock) {
      card.classList.add("out-of-stock");
    }

    const img = document.createElement("img");
    img.alt = item.name || "Producto";
    img.loading = "lazy";
    img.src = item.imageUrl;
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => {
      state.activeProduct = toProductParam(item);
      openLightbox(
        item.imageUrl,
        item.name || "Producto",
        item.price || "",
        item.salePrice || ""
      );
    });

    if (item.isAnniversary) {
      const stamp = document.createElement("span");
      stamp.className = "anniversary-stamp";
      stamp.setAttribute("aria-hidden", "true");

      const stampImg = document.createElement("img");
      stampImg.src = "5aniversario.png";
      stampImg.alt = "";
      stampImg.loading = "lazy";
      stamp.appendChild(stampImg);

      card.appendChild(stamp);
    }

    if (item.isOutOfStock) {
      const stockOverlay = document.createElement("span");
      stockOverlay.className = "stock-overlay";
      stockOverlay.textContent = "Sin Stock";
      stockOverlay.setAttribute("aria-hidden", "true");
      card.appendChild(stockOverlay);
    }

    const caption = document.createElement("div");
    caption.className = "image-caption";

    const title = document.createElement("h3");
    title.textContent = item.name || "Sin nombre";

    caption.appendChild(title);

    if (item.price || item.salePrice) {
      const priceWrap = document.createElement("div");
      priceWrap.className = "image-price-wrap";

      if (item.price) {
        const priceTag = document.createElement("span");
        priceTag.className = item.salePrice ? "image-price-tag strikethrough" : "image-price-tag";
        priceTag.textContent = item.price;
        priceWrap.appendChild(priceTag);
      }

      if (item.salePrice) {
        const salePriceTag = document.createElement("span");
        salePriceTag.className = "image-price-tag sale-price";
        salePriceTag.textContent = item.salePrice;
        priceWrap.appendChild(salePriceTag);
      }

      caption.appendChild(priceWrap);
    }

    card.appendChild(img);
    card.appendChild(caption);
    ui.gallery.appendChild(card);
  });

  setStatus(`Mostrando ${items.length} producto(s)`);
}

function setStatus(message, isError = false) {
  ui.status.textContent = message;
  ui.status.classList.toggle("error", isError);
}

function showLoading(isVisible) {
  ui.loadingOverlay.classList.toggle("hidden", !isVisible);
}
