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
  sortBy: "featured",
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
};

bootstrap();

async function bootstrap() {
  ui.subtitle.textContent = INFO_DESCRIPTION;
  initOpeningStatus();
  initLightbox();
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
    precio: headers.findIndex((h) => ["precio", "precios", "pvp"].includes(h)),
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
      price: getCell(cells, idx.precio).trim(),
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

function initSort() {
  ui.sortSelect.addEventListener("change", () => {
    state.sortBy = ui.sortSelect.value;
    renderGallery();
  });
}

function initOpeningStatus() {
  if (!ui.shopOpenStatus) {
    return;
  }

  const getSlotsForDay = (day) => {
    if (day >= 1 && day <= 5) {
      return [[7 * 60, 13 * 60], [15 * 60, 19 * 60]];
    }
    if (day === 6) {
      return [[7 * 60 + 30, 12 * 60]];
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

function openLightbox(src, altText) {
  ui.lightboxImage.src = src;
  ui.lightboxImage.alt = altText || "Imagen de producto";
  ui.lightboxCaption.textContent = altText || "Producto";
  ui.imageLightbox.classList.remove("hidden");
  ui.imageLightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("lightbox-open");
}

function closeLightbox() {
  ui.imageLightbox.classList.add("hidden");
  ui.imageLightbox.setAttribute("aria-hidden", "true");
  ui.lightboxImage.src = "";
  document.body.classList.remove("lightbox-open");
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
    img.style.cursor = "zoom-in";
    img.addEventListener("click", () => openLightbox(item.imageUrl, item.name || "Producto"));

    const caption = document.createElement("div");
    caption.className = "image-caption";

    const title = document.createElement("h3");
    title.textContent = item.name || "Sin nombre";

    caption.appendChild(title);

    if (item.price) {
      const priceTag = document.createElement("span");
      priceTag.className = "image-price-tag";
      priceTag.textContent = item.price;
      caption.appendChild(priceTag);
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
