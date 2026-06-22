const modules = {
  orders: OrdersModule,
  purchases: PurchasesModule,
  transfer: TransferModule,
  refund: RefundModule,
  closing: ClosingModule,
  customers: CustomersModule,
  dashboard: DashboardModule,
  inventory: InventoryModule,
  revisit: RevisitModule,
  products: ProductsAdminModule,
  export: ExportModule
};
const renderedTabs = new Set();

function showTab(tab) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.getElementById("panel-" + tab).classList.add("active");
  document.querySelectorAll("#navBar button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  if (!renderedTabs.has(tab)) {
    modules[tab].render();
    renderedTabs.add(tab);
  }
}

function initApp() {
  document.getElementById("loginView").style.display = "none";
  document.getElementById("appView").style.display = "block";
  document.querySelectorAll("#navBar button").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
  showTab("orders");
}

if (isLoggedIn()) {
  initApp();
} else {
  document.getElementById("loginView").style.display = "block";
}
