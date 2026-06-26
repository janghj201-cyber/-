const DEFAULT_STORE_KEY = "wevape_default_store";

function getDefaultStoreId() {
  return localStorage.getItem(DEFAULT_STORE_KEY);
}
function setDefaultStoreId(id) {
  if (id) localStorage.setItem(DEFAULT_STORE_KEY, id);
  else localStorage.removeItem(DEFAULT_STORE_KEY);
}
function applyDefaultStore(selectEl) {
  const id = getDefaultStoreId();
  if (!id || !selectEl) return;
  selectEl.value = id;
}

const modules = {
  orders: OrdersModule,
  sales: SalesHistoryModule,
  "sales-summary": SalesSummaryModule,
  purchases: PurchasesModule,
  transfer: TransferModule,
  stocktaking: StocktakingModule,
  stockhistory: StockHistoryModule,
  refund: RefundModule,
  closing: ClosingModule,
  customers: CustomersModule,
  dashboard: DashboardModule,
  "hourly-stats": HourlyStatsModule,
  "store-compare": StoreCompareModule,
  "product-trend": ProductTrendModule,
  "reorder-report": ReorderReportModule,
  inventory: InventoryModule,
  revisit: RevisitModule,
  products: ProductsAdminModule,
  export: ExportModule
};
const renderedTabs = new Set();

function showTab(tab) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.getElementById("panel-" + tab).classList.add("active");
  document.querySelectorAll("#navBar button[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  if (!renderedTabs.has(tab)) {
    modules[tab].render();
    renderedTabs.add(tab);
  }
  updateBottomNavActive(tab);
  document.getElementById("morePanel").style.display = "none";
}

function updateBottomNavActive(tab) {
  document.querySelectorAll("#bottomNav .bn-item[data-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
}

function initApp() {
  document.getElementById("loginView").style.display = "none";
  document.getElementById("appView").style.display = "block";
  document.querySelectorAll("#navBar button[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
  initUserMenu();
  initBottomNav();
  showTab("orders");
}

// ── 사용자 메뉴 ──────────────────────────────────────────────────────────────

function initUserMenu() {
  const email = localStorage.getItem("wevape_user_email") || "";
  document.getElementById("userMenuEmail").textContent = email;
  updateUserMenuLabel();

  document.getElementById("userMenuBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = document.getElementById("userMenuDropdown");
    dd.style.display = dd.style.display === "none" ? "block" : "none";
  });

  document.addEventListener("click", (e) => {
    const wrapper = document.getElementById("userMenuWrapper");
    if (wrapper && !wrapper.contains(e.target)) {
      document.getElementById("userMenuDropdown").style.display = "none";
    }
  });

  document.getElementById("changeStoreBtn").addEventListener("click", openDefaultStoreModal);
}

async function updateUserMenuLabel() {
  const email = localStorage.getItem("wevape_user_email") || "";
  const userName = email.split("@")[0] || "사용자";
  const storeId = getDefaultStoreId();
  let label = userName;
  if (storeId) {
    try {
      const stores = await sbGet("stores?select=name&store_id=eq." + storeId);
      if (stores[0]) label += ` (${stores[0].name})`;
    } catch (e) {}
  }
  const el = document.getElementById("userMenuLabel");
  if (el) el.textContent = label;
}

async function openDefaultStoreModal() {
  document.getElementById("userMenuDropdown").style.display = "none";
  const modal = document.getElementById("defaultStoreModal");
  modal.style.display = "flex";
  try {
    const stores = await sbGet("stores?select=store_id,name&order=name");
    const currentId = getDefaultStoreId();
    document.getElementById("defaultStoreSelect").innerHTML =
      `<option value="">기본 매장 없음 (매번 선택)</option>` +
      stores.map(s => `<option value="${s.store_id}"${s.store_id === currentId ? " selected" : ""}>${s.name}</option>`).join("");
  } catch (err) {}

  document.getElementById("defaultStoreSaveBtn").onclick = () => {
    const id = document.getElementById("defaultStoreSelect").value;
    setDefaultStoreId(id);
    modal.style.display = "none";
    updateUserMenuLabel();
  };
  document.getElementById("defaultStoreCancelBtn").onclick = () => {
    modal.style.display = "none";
  };
}

// ── 하단 퀵메뉴 ──────────────────────────────────────────────────────────────

function initBottomNav() {
  document.querySelectorAll("#bottomNav .bn-item[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  const moreBtn = document.getElementById("moreBtn");
  const morePanel = document.getElementById("morePanel");

  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    morePanel.style.display = morePanel.style.display === "none" ? "block" : "none";
  });

  document.querySelectorAll(".bn-more-item").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  document.addEventListener("click", (e) => {
    if (!morePanel.contains(e.target) && e.target !== moreBtn && !moreBtn.contains(e.target)) {
      morePanel.style.display = "none";
    }
  });
}

// ── 부트스트랩 ──────────────────────────────────────────────────────────────

(async () => {
  if (await isLoggedIn()) {
    initApp();
    scheduleTokenRefresh();
  } else {
    document.getElementById("loginView").style.display = "block";
  }
})();
