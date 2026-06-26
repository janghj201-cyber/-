const PurchasesModule = (() => {
  let cart = [];
  let tenantId = null;

  function render() {
    const el = document.getElementById("panel-purchases");
    el.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <select id="pu_store" style="flex:1"><option value="">매장 로딩중...</option></select>
          <input id="pu_search" type="text" placeholder="상품명 검색" style="flex:2" />
        </div>
        <div class="muted" id="pu_storeStatus"></div>
      </div>

      <div class="card">
        <div class="muted" style="margin-bottom:8px">거래처 (선택)</div>
        <div class="row">
          <select id="pu_supplier" style="flex:1"><option value="">거래처 없음</option></select>
          <input id="pu_newSupplier" type="text" placeholder="신규 거래처명" style="flex:1" />
          <button id="pu_addSupplier">추가</button>
        </div>
        <div class="muted" id="pu_supplierStatus" style="margin-top:6px"></div>
      </div>

      <div id="pu_results" class="card" style="display:none;max-height:200px;overflow-y:auto"></div>

      <div class="card">
        <div class="muted" style="margin-bottom:8px">입고 목록 (매입단가 입력)</div>
        <div id="pu_cartList"></div>
        <div id="pu_cartEmpty" class="muted">담은 상품이 없습니다</div>
      </div>

      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <span>매입 합계</span><span style="font-size:20px;font-weight:700" id="pu_total">0원</span>
      </div>
      <button id="pu_submitBtn" style="width:100%">입고 등록</button>
      <div class="muted" id="pu_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
  }

  function bind() {
    document.getElementById("pu_search").addEventListener("input", (e) => {
      clearTimeout(window._puT);
      window._puT = setTimeout(() => searchProducts(e.target.value), 250);
    });
    document.getElementById("pu_addSupplier").addEventListener("click", addSupplier);
    document.getElementById("pu_submitBtn").addEventListener("click", submitPurchase);
  }

  async function loadStores() {
    const statusEl = document.getElementById("pu_storeStatus");
    try {
      const data = await sbGet("stores?select=store_id,name,tenant_id&order=name");
      tenantId = data[0]?.tenant_id;
      document.getElementById("pu_store").innerHTML = data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
      applyDefaultStore(document.getElementById("pu_store"));
      statusEl.textContent = data.length + "개 매장 로드됨";
      loadSuppliers();
    } catch (err) { statusEl.textContent = "매장 로드 실패"; }
  }

  async function loadSuppliers() {
    try {
      const data = await sbGet("suppliers?select=supplier_id,name&order=name");
      document.getElementById("pu_supplier").innerHTML = `<option value="">거래처 없음</option>` + data.map(s => `<option value="${s.supplier_id}">${s.name}</option>`).join("");
    } catch (err) {}
  }

  async function addSupplier() {
    const name = document.getElementById("pu_newSupplier").value.trim();
    const statusEl = document.getElementById("pu_supplierStatus");
    if (!name) { statusEl.textContent = "거래처명을 입력해주세요."; return; }
    try {
      const created = await sbPost("suppliers", { tenant_id: tenantId, name }, { "Prefer": "return=representation" });
      await loadSuppliers();
      document.getElementById("pu_supplier").value = created[0].supplier_id;
      document.getElementById("pu_newSupplier").value = "";
      statusEl.textContent = name + " 추가됨";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function searchProducts(q) {
    const box = document.getElementById("pu_results");
    if (!q) { box.style.display = "none"; return; }
    box.style.display = "block";
    try {
      const data = await sbGet("products?select=product_id,code,name,category,line&name=ilike.*" + encodeURIComponent(q) + "*&limit=20");
      box.innerHTML = data.map(p => `
        <div class="resultRow" data-id="${p.product_id}" data-name="${p.name.replace(/"/g, '&quot;')}">
          <div><div>${p.name}</div><div class="muted">${p.category}${p.line ? " · " + p.line : ""}</div></div><span>+</span>
        </div>
      `).join("") || `<div class="muted">검색 결과 없음</div>`;
      box.querySelectorAll(".resultRow").forEach(row => row.addEventListener("click", () => addToCart(row.dataset.id, row.dataset.name)));
    } catch (err) {}
  }

  function addToCart(id, name) {
    const ex = cart.find(c => c.id === id);
    if (ex) ex.qty += 1; else cart.push({ id, name, qty: 1, cost: 0 });
    renderCart();
  }
  function changeQty(id, d) {
    const it = cart.find(c => c.id === id);
    if (!it) return;
    it.qty += d;
    if (it.qty <= 0) cart = cart.filter(c => c.id !== id);
    renderCart();
  }
  function changeQtyDirect(id, val) {
    const it = cart.find(c => c.id === id);
    if (!it) return;
    it.qty = val;
    if (it.qty <= 0) cart = cart.filter(c => c.id !== id);
    renderCart();
  }
  function changeCost(id, val) {
    const it = cart.find(c => c.id === id);
    if (it) it.cost = isNaN(val) ? 0 : val;
    renderCart();
  }
  function renderCart() {
    const list = document.getElementById("pu_cartList");
    document.getElementById("pu_cartEmpty").style.display = cart.length ? "none" : "block";
    list.innerHTML = cart.map(c => `
      <div class="cartRow">
        <div style="flex:1">${c.name}</div>
        <button data-id="${c.id}" data-d="-1" class="qBtn secondary" style="width:28px;padding:2px">-</button>
        <input type="number" class="qtyInput" data-id="${c.id}" value="${c.qty}" min="0" max="9999" style="width:60px;text-align:center;padding:3px 4px" />
        <button data-id="${c.id}" data-d="1" class="qBtn secondary" style="width:28px;padding:2px">+</button>
        <input type="number" class="cInput" data-id="${c.id}" value="${c.cost}" placeholder="매입단가" style="width:100px" />
        <span style="min-width:70px;text-align:right">${fmtWon(c.cost * c.qty)}</span>
      </div>
    `).join("");
    list.querySelectorAll(".qBtn").forEach(b => b.addEventListener("click", () => changeQty(b.dataset.id, parseInt(b.dataset.d))));
    list.querySelectorAll(".qtyInput").forEach(i => {
      i.addEventListener("click", () => i.select());
      i.addEventListener("keydown", (e) => {
        if (!["0","1","2","3","4","5","6","7","8","9","Backspace","Delete","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Tab","Enter"].includes(e.key)) e.preventDefault();
      });
      i.addEventListener("change", () => {
        let v = parseInt(i.value, 10);
        if (isNaN(v) || v < 0) v = 0;
        if (v > 9999) v = 9999;
        i.value = v;
        changeQtyDirect(i.dataset.id, v);
      });
    });
    list.querySelectorAll(".cInput").forEach(i => i.addEventListener("change", () => changeCost(i.dataset.id, parseFloat(i.value))));
    document.getElementById("pu_total").textContent = fmtWon(cart.reduce((s, c) => s + c.cost * c.qty, 0));
  }

  async function submitPurchase() {
    const statusEl = document.getElementById("pu_status");
    const storeId = document.getElementById("pu_store").value;
    if (!storeId) { statusEl.textContent = "매장을 선택해주세요."; return; }
    if (!cart.length) { statusEl.textContent = "입고할 상품이 없습니다."; return; }
    statusEl.textContent = "등록 중...";
    try {
      const items = cart.map(c => ({ product_id: c.id, qty: c.qty, unit_cost: c.cost }));
      await sbRpc("register_purchase", {
        p_tenant_id: tenantId, p_store_id: storeId,
        p_supplier_id: document.getElementById("pu_supplier").value || null, p_items: items
      });
      statusEl.textContent = "입고 등록 완료";
      cart = [];
      renderCart();
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  return { render };
})();
