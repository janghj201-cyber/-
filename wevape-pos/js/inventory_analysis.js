const InventoryModule = (() => {
  let tenantId = null;

  function render() {
    const el = document.getElementById("panel-inventory");
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <button id="inv_tabStock" style="flex:1">재고현황</button>
        <button id="inv_tabHistory" class="secondary" style="flex:1">상품별 구매이력</button>
      </div>

      <div id="inv_panelStock">
        <div class="card">
          <div class="row">
            <select id="inv_store" style="flex:1"><option value="">매장 선택</option></select>
            <button id="inv_loadStockBtn">조회</button>
          </div>
        </div>
        <div id="inv_stockBox"></div>
        <div class="muted" id="inv_stockStatus" style="margin-top:10px"></div>
      </div>

      <div id="inv_panelHistory" style="display:none">
        <div class="card">
          <select id="inv_historyStore" style="width:100%;margin-bottom:8px"><option value="">매장 선택</option></select>
          <input id="inv_search" type="text" placeholder="상품명 검색" style="width:100%" />
        </div>
        <div id="inv_results" class="card" style="display:none;max-height:180px;overflow-y:auto"></div>
        <div id="inv_selectedProduct" class="muted" style="margin-bottom:8px"></div>
        <button id="inv_loadHistoryBtn" style="width:100%;margin-bottom:12px">조회</button>
        <div id="inv_historyBox"></div>
        <div class="muted" id="inv_historyStatus" style="margin-top:10px"></div>
      </div>
    `;
    bind();
    loadStores();
  }

  function bind() {
    document.getElementById("inv_tabStock").addEventListener("click", () => switchTab("stock"));
    document.getElementById("inv_tabHistory").addEventListener("click", () => switchTab("history"));
    document.getElementById("inv_loadStockBtn").addEventListener("click", loadStock);
    document.getElementById("inv_search").addEventListener("input", (e) => {
      clearTimeout(window._invT);
      window._invT = setTimeout(() => searchProducts(e.target.value), 250);
    });
    document.getElementById("inv_loadHistoryBtn").addEventListener("click", loadHistory);
  }

  function switchTab(which) {
    document.getElementById("inv_panelStock").style.display = which === "stock" ? "block" : "none";
    document.getElementById("inv_panelHistory").style.display = which === "history" ? "block" : "none";
    document.getElementById("inv_tabStock").className = which === "stock" ? "" : "secondary";
    document.getElementById("inv_tabHistory").className = which === "history" ? "" : "secondary";
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name,tenant_id&order=name");
      tenantId = data[0]?.tenant_id;
      const opts = `<option value="">매장 선택</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
      document.getElementById("inv_store").innerHTML = opts;
      document.getElementById("inv_historyStore").innerHTML = opts;
    } catch (err) {}
  }

  async function loadStock() {
    const storeId = document.getElementById("inv_store").value;
    const statusEl = document.getElementById("inv_stockStatus");
    const box = document.getElementById("inv_stockBox");
    if (!storeId) { statusEl.textContent = "매장을 선택해주세요."; return; }
    statusEl.textContent = "불러오는 중...";
    try {
      const data = await sbRpc("get_product_stock_analysis", { p_store_id: storeId });
      box.innerHTML = `
        <div class="card">
          <table>
            <tr><th>상품</th><th>분류</th><th style="text-align:right">재고수량</th></tr>
            ${data.map(r => `
              <tr>
                <td>${r.name}</td>
                <td class="muted">${r.category || "-"}${r.line ? " · " + r.line : ""}</td>
                <td style="text-align:right;${r.qty_on_hand <= 5 ? "color:var(--bad);font-weight:700" : ""}">${r.qty_on_hand}</td>
              </tr>
            `).join("")}
          </table>
        </div>
      ` || "";
      statusEl.textContent = data.length ? data.length + "개 품목" : "재고 데이터가 없습니다.";
    } catch (err) {
      box.innerHTML = "";
      statusEl.textContent = "오류: " + err.message;
    }
  }

  let selectedProductId = null;

  async function searchProducts(q) {
    const box = document.getElementById("inv_results");
    if (!q) { box.style.display = "none"; return; }
    box.style.display = "block";
    try {
      const data = await sbGet("products?select=product_id,code,name,category,line&name=ilike.*" + encodeURIComponent(q) + "*&limit=20");
      box.innerHTML = data.map(p => `
        <div class="resultRow" data-id="${p.product_id}" data-name="${p.name.replace(/"/g, '&quot;')}">
          <div><div>${p.name}</div><div class="muted">${p.category}${p.line ? " · " + p.line : ""}</div></div><span>선택</span>
        </div>
      `).join("") || `<div class="muted">검색 결과 없음</div>`;
      box.querySelectorAll(".resultRow").forEach(row => row.addEventListener("click", () => {
        selectedProductId = row.dataset.id;
        document.getElementById("inv_selectedProduct").textContent = "선택된 상품: " + row.dataset.name;
        box.style.display = "none";
        document.getElementById("inv_search").value = "";
      }));
    } catch (err) {}
  }

  async function loadHistory() {
    const statusEl = document.getElementById("inv_historyStatus");
    const box = document.getElementById("inv_historyBox");
    const storeId = document.getElementById("inv_historyStore").value;
    if (!selectedProductId) { statusEl.textContent = "상품을 먼저 검색하여 선택해주세요."; return; }
    if (!storeId) { statusEl.textContent = "매장을 선택해주세요."; return; }
    statusEl.textContent = "불러오는 중...";
    try {
      const data = await sbRpc("get_product_purchase_history", { p_product_id: selectedProductId, p_store_id: storeId });
      box.innerHTML = `<div class="card">` + (data.map(d => `
        <div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0">
          <span class="muted">${d.purchase_date || "-"} · ${d.store_name || "-"} · ${d.supplier_name || "거래처없음"}</span>
          <span>${d.qty}개 × ${fmtWon(d.unit_cost)}</span>
        </div>
      `).join("") || `<div class="muted">구매 이력이 없습니다.</div>`) + `</div>`;
      statusEl.textContent = data.length + "건의 입고 이력";
    } catch (err) {
      box.innerHTML = "";
      statusEl.textContent = "오류: " + err.message;
    }
  }

  return { render };
})();
