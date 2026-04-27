const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTICNfcYM4ZrXvEr05Sd5n6pVk_wyRjBcl8A1EsP2Nlu-cgK8yJT1OYANoAp88ktCvHsTEAiXGquXdB/pub?gid=0&single=true&output=csv";

const INFO_DESCRIPTION =
  "Roquetas Shisha Club: especialistas en cachimbas y accesorios en Roquetas de Mar.";

const state = {
  items: [],
  categories: [],
  activeCategory: "",
  activeSubcategory: "ALL",
  searchQuery: "",
};

const ui = {
  loadingOverlay: document.getElementById("loadingOverlay"),
  subtitle: document.getElementById("subtitle"),
  status: document.getElementById("status"),
  setupPanel: document.getElementById("setupPanel"),
  catalogTitle: document.getElementById("catalogTitle"),
  categoryMenu: document.getElementById("categoryMenu"),
  subcategoryMenu: document.getElementById("subcategoryMenu"),
  gallery: document.getElementById("gallery"),
  searchInput: document.getElementById("searchInput"),
  searchClear: document.getElementById("searchClear"),
};

bootstrap();

async function bootstrap() {
  ui.subtitle.textContent = INFO_DESCRIPTION;
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
  const idx = {
    nombre: headers.indexOf("nombre"),
    categoria: headers.indexOf("categoria"),
    stock: headers.indexOf("stock"),
    url: headers.indexOf("url"),
    oferta: headers.indexOf("oferta"),
    mostrarWeb: headers.indexOf("mostrar en web"),
  };

  return rows.slice(1).map((cells) => {
    const rawCategory = getCell(cells, idx.categoria).trim();
    const categoryParts = rawCategory
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);

    const topCategory = categoryParts[0] || "General";
    const subcategoryPath = categoryParts.length > 1 ? categoryParts.slice(1).join("/") : "General";

    const rawUrl = getCell(cells, idx.url).trim();

    return {
      name: getCell(cells, idx.nombre).trim(),
      categoryPath: rawCategory || "General",
      topCategory,
      subcategoryPath,
      stock: getCell(cells, idx.stock).trim(),
      url: rawUrl,
      imageUrl: toImageUrl(rawUrl),
      isOffer: toBoolean(getCell(cells, idx.oferta), false),
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

function buildCategoryState() {
  const PRIORITY = ["cachimbas", "cazoletas"];

  const categories = [...new Set(state.items.map((item) => item.topCategory))].sort((a, b) => {
    const ai = PRIORITY.indexOf(a.toLowerCase());
    const bi = PRIORITY.indexOf(b.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "es");
  });

  state.categories = categories;

  const hasOffers = state.items.some((item) => item.isOffer);
  state.activeCategory = hasOffers ? "OFERTAS" : (categories[0] || "");
  state.activeSubcategory = "ALL";
}

function renderCategoryMenu() {
  ui.categoryMenu.innerHTML = "";

  const hasOffers = state.items.some((item) => item.isOffer);
  if (hasOffers) {
    const offerButton = createCategoryButton("OFERTAS!", "OFERTAS", true);
    ui.categoryMenu.appendChild(offerButton);
  }

  state.categories.forEach((category) => {
    const button = createCategoryButton(category, category, false);
    ui.categoryMenu.appendChild(button);
  });
}

function createCategoryButton(label, value, isOffer) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "category-chip";

  if (isOffer) {
    button.classList.add("offer-chip");
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
  });

  return button;
}

function renderSubcategoryMenu() {
  ui.subcategoryMenu.innerHTML = "";

  const subcategories = getCurrentSubcategories();
  if (!subcategories.length) {
    return;
  }

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
    });

    ui.subcategoryMenu.appendChild(button);
  });
}

function getCurrentSubcategories() {
  const selected = getCategoryItems();
  const subcategories = [...new Set(selected.map((item) => item.subcategoryPath))];

  if (subcategories.length === 1 && subcategories[0] === "General") {
    return [];
  }

  return subcategories.sort((a, b) => a.localeCompare(b, "es"));
}

function getCategoryItems() {
  if (state.activeCategory === "OFERTAS") {
    return state.items.filter((item) => item.isOffer);
  }

  return state.items.filter((item) => item.topCategory === state.activeCategory);
}

function normalize(str) {
  return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getFilteredItems() {
  if (state.searchQuery) {
    const q = normalize(state.searchQuery);
    return state.items.filter(
      (item) =>
        normalize(item.name).includes(q) ||
        normalize(item.categoryPath).includes(q)
    );
  }

  const categoryItems = getCategoryItems();

  if (state.activeSubcategory === "ALL") {
    return categoryItems;
  }

  return categoryItems.filter((item) => item.subcategoryPath === state.activeSubcategory);
}

function initSearch() {
  ui.searchInput.addEventListener("input", () => {
    state.searchQuery = ui.searchInput.value.trim();
    ui.searchClear.classList.toggle("hidden", !state.searchQuery);
    if (state.searchQuery) {
      ui.catalogTitle.textContent = `Resultados: "${state.searchQuery}"`;
    } else {
      ui.catalogTitle.textContent = state.activeCategory || "Catalogo";
    }
    renderGallery();
  });

  ui.searchClear.addEventListener("click", () => {
    ui.searchInput.value = "";
    state.searchQuery = "";
    ui.searchClear.classList.add("hidden");
    ui.catalogTitle.textContent = state.activeCategory || "Catalogo";
    renderGallery();
    ui.searchInput.focus();
  });
}

function renderGallery() {
  const items = getFilteredItems();
  ui.gallery.innerHTML = "";

  if (state.activeCategory === "OFERTAS") {
    ui.catalogTitle.textContent = "OFERTAS!";
  } else {
    ui.catalogTitle.textContent = state.activeCategory || "Catalogo";
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

    const img = document.createElement("img");
    img.alt = item.name || "Producto";
    img.loading = "lazy";
    img.src = item.imageUrl;

    const caption = document.createElement("div");
    caption.className = "image-caption";

    const textWrap = document.createElement("div");
    textWrap.className = "image-meta";

    const title = document.createElement("h3");
    title.textContent = item.name || "Sin nombre";

    const pathTag = document.createElement("span");
    pathTag.className = "image-tag";
    pathTag.textContent = item.categoryPath;

    textWrap.appendChild(title);
    textWrap.appendChild(pathTag);

    if (item.isOffer) {
      const offerTag = document.createElement("span");
      offerTag.className = "offer-badge";
      offerTag.textContent = "OFERTA";
      textWrap.appendChild(offerTag);
    }

    caption.appendChild(textWrap);
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
