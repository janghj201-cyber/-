const DEFAULT_STORE_KEY = "wevape_default_store";
const ROLE_KEY = "wevape_role";
const ROLE_LABELS = { staff: "직원", manager: "매니저", admin: "관리자" };

// 탭별 최소 접근 권한
const TAB_PERMISSIONS = {
  // staff 이상
  closing:          ["staff", "manager", "admin"],
  orders:           ["staff", "manager", "admin"],
  refund:           ["staff", "manager", "admin"],
  sales:            ["staff", "manager", "admin"],
  purchases:        ["staff", "manager", "admin"],
  customers:        ["staff", "manager", "admin"],
  // manager 이상
  transfer:         ["manager", "admin"],
  stocktaking:      ["manager", "admin"],
  "reorder-report": ["manager", "admin"],
  "sales-summary":  ["manager", "admin"],
  "hourly-stats":   ["manager", "admin"],
  "product-trend":  ["manager", "admin"],
  stockhistory:     ["manager", "admin"],
  inventory:        ["manager", "admin"],
  revisit:          ["manager", "admin"],
  // admin 전용
  dashboard:        ["admin"],
  "store-compare":  ["admin"],
  products:         ["admin"],
  "staff-accounts": ["admin"],
  notices:          ["admin"],
  export:           ["admin"],
};

// ── 기본 매장 ─────────────────────────────────────────────────────────────────

function getDefaultStoreId() { return localStorage.getItem(DEFAULT_STORE_KEY); }
function setDefaultStoreId(id) {
  if (id) localStorage.setItem(DEFAULT_STORE_KEY, id);
  else     localStorage.removeItem(DEFAULT_STORE_KEY);
}
function applyDefaultStore(selectEl) {
  const id = getDefaultStoreId();
  if (!id || !selectEl) return;
  selectEl.value = id;
}

// ── 권한 ───────────────────────────────────────────────────────────────────────

function getCurrentRole() { return localStorage.getItem(ROLE_KEY) || "staff"; }

function hasPermission(tab) {
  const role    = getCurrentRole();
  const allowed = TAB_PERMISSIONS[tab];
  if (!allowed) return true;
  return allowed.includes(role);
}

function applyRoleBasedUI() {
  // 1. 접근 불가 탭 버튼 숨기기
  document.querySelectorAll("#navBar button[data-tab]").forEach(btn => {
    btn.style.display = hasPermission(btn.dataset.tab) ? "" : "none";
  });

  // 2. 접근 가능한 자식이 없는 navGroup 숨기기
  document.querySelectorAll(".navGroup").forEach(group => {
    const body = group.querySelector(".navGroupBody");
    if (!body) return;
    const anyVisible = Array.from(body.querySelectorAll("button[data-tab]"))
      .some(btn => btn.style.display !== "none");
    group.style.display = anyVisible ? "" : "none";
  });
}

// ── 모듈 맵 ───────────────────────────────────────────────────────────────────

const modules = {
  orders:           OrdersModule,
  sales:            SalesHistoryModule,
  "sales-summary":  SalesSummaryModule,
  purchases:        PurchasesModule,
  transfer:         TransferModule,
  stocktaking:      StocktakingModule,
  stockhistory:     StockHistoryModule,
  refund:           RefundModule,
  closing:          ClosingModule,
  customers:        CustomersModule,
  dashboard:        DashboardModule,
  "hourly-stats":   HourlyStatsModule,
  "store-compare":  StoreCompareModule,
  "product-trend":  ProductTrendModule,
  "reorder-report": ReorderReportModule,
  inventory:        InventoryModule,
  revisit:          RevisitModule,
  products:         ProductsAdminModule,
  export:           ExportModule,
  "staff-accounts": StaffAccountsModule,
  notices:          NoticesModule,
};
const renderedTabs = new Set();

function showTab(tab) {
  // 권한 체크
  if (!hasPermission(tab)) {
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    const panel = document.getElementById("panel-" + tab);
    if (panel) {
      panel.classList.add("active");
      const minRole = (TAB_PERMISSIONS[tab] || [])[0];
      const minLabel = ROLE_LABELS[minRole] || minRole;
      panel.innerHTML = `
        <div class="card" style="text-align:center;padding:60px 20px;max-width:400px;margin:auto">
          <div style="font-size:48px;margin-bottom:16px">🔒</div>
          <div style="font-weight:700;font-size:18px;margin-bottom:8px">접근 권한이 없습니다</div>
          <div class="muted">${minLabel} 이상만 접근할 수 있는 화면입니다.</div>
          <div class="muted" style="margin-top:6px">현재 권한: ${ROLE_LABELS[getCurrentRole()] || getCurrentRole()}</div>
        </div>
      `;
    }
    document.querySelectorAll("#navBar button[data-tab]").forEach(b => b.classList.remove("active"));
    updateBottomNavActive(tab);
    document.getElementById("morePanel").style.display = "none";
    return;
  }

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
  applyRoleBasedUI();
  initUserMenu();
  initBottomNav();
  showTab("orders");
  // 공지사항 팝업 — UI 렌더 완료 후 체크
  setTimeout(checkAndShowNotices, 800);
}

// ── 사용자 메뉴 ───────────────────────────────────────────────────────────────

function initUserMenu() {
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
  const name  = localStorage.getItem("wevape_user_name") ||
                (localStorage.getItem("wevape_user_email") || "").split("@")[0] || "사용자";
  const role  = getCurrentRole();
  const roleLabel  = ROLE_LABELS[role] || role;
  const storeId = localStorage.getItem("wevape_user_store_id") || getDefaultStoreId();

  let label = `${name} · ${roleLabel}`;
  if (storeId) {
    try {
      const stores = await sbGet("stores?select=name&store_id=eq." + storeId);
      if (stores[0]) label = `${name} (${stores[0].name} · ${roleLabel})`;
    } catch (e) {}
  }
  const el = document.getElementById("userMenuLabel");
  if (el) el.textContent = label;

  const emailEl = document.getElementById("userMenuEmail");
  if (emailEl) emailEl.textContent = localStorage.getItem("wevape_user_email") || "";
}

async function openDefaultStoreModal() {
  document.getElementById("userMenuDropdown").style.display = "none";
  const modal = document.getElementById("defaultStoreModal");
  modal.style.display = "flex";
  try {
    const stores    = await sbGet("stores?select=store_id,name&order=name");
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

// ── 하단 퀵메뉴 ───────────────────────────────────────────────────────────────

function initBottomNav() {
  document.querySelectorAll("#bottomNav .bn-item[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  const moreBtn   = document.getElementById("moreBtn");
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

// ── 부트스트랩 ────────────────────────────────────────────────────────────────

(async () => {
  if (await isLoggedIn()) {
    initApp();
    scheduleTokenRefresh();
  } else {
    document.getElementById("loginView").style.display = "block";
  }
})();
