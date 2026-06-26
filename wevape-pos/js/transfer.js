const TransferModule = (() => {
  let tenantId = null;
  let transferCart = [];
  let adjustCart = [];

  function render() {
    const el = document.getElementById("panel-transfer");
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <button id="tr_tabT" style="flex:1">매장 간 이동</button>
        <button id="tr_tabA" class="secondary" style="flex:1">재고 실사/조정</button>
      </div>

      <div id="tr_panelT">
        <div class="card">
          <div class="row" style="margin-bottom:8px">
            <select id="tr_from" style="flex:1"><option value="">출발 매장</option></select>
            <select id="tr_to" style="flex:1"><option value="">도착 매장</option></select>
          </div>
          <input id="tr_note" type="text" placeholder="메모 (선택)" style="width:100%;margin-bottom:8px" />
          <input id="tr_search" type="text" placeholder="상품명 검색" style="width:100%" />
        </div>
        <div id="tr_results" class="card" style="display:none;max-height:180px;overflow-y:auto"></div>
        <div class="card">
          <div class="muted" style="margin-bottom:8px">이동 목록</div>
          <div id="tr_cartList"></div>
          <div id="tr_cartEmpty" class="muted">담은 상품이 없습니다</div>
        </div>
        <button id="tr_submitBtn" style="width:100%">이동 등록</button>
        <div class="muted" id="tr_status" style="margin-top:10px"></div>
      </div>

      <div id="tr_panelA" style="display:none">
        <div class="card">
          <select id="adj_store" style="width:100%;margin-bottom:8px"><option value="">매장 선택</option></select>
          <select id="adj_reason" style="width:100%;margin-bottom:8px">
            <option value="실사오차">실사오차</option><option value="파손">파손</option><option value="도난">도난</option><option value="기타">기타</option>
          </select>
          <input id="adj_search" type="text" placeholder="상품명 검색" style="width:100%" />
        </div>
        <div id="adj_results" class="card" style="display:none;max-height:180px;overflow-y:auto"></div>
        <div class="card">
          <div class="muted" style="margin-bottom:8px">조정 목록 (실사 확인된 정확한 수량 입력)</div>
          <div id="adj_cartList"></div>
          <div id="adj_cartEmpty" class="muted">담은 상품이 없습니다</div>
        </div>
        <button id="adj_submitBtn" style="width:100%">조정 등록</button>
        <div class="muted" id="adj_status" style="margin-top:10px"></div>
      </div>
    `;
    bind();
    loadStores();
  }

  function bind() {
    document.getElementById("tr_tabT").addEventListener("click", () => switchTab("T"));
    document.getElementById("tr_tabA").addEventListener("click", () => switchTab("A"));
    document.getElementById("tr_search").addEventListener("input", (e) => {
      clearTimeout(window._trT);
      window._trT = setTimeout(() => searchGeneric(e.target.value, "tr_results", addTransfer), 250);
    });
    document.getElementById("tr_submitBtn").addEventListener("click", submitTransfer);
    document.getElementById("adj_search").addEventListener("input", (e) => {
      clearTimeout(window._adjT);
      window._adjT = setTimeout(() => searchGeneric(e.target.value, "adj_results", addAdjust), 250);
    });
    document.getElementById("adj_submitBtn").addEventListener("click", submitAdjust);
  }

  function switchTab(which) {
    document.getElementById("tr_panelT").style.display = which === "T" ? "block" : "none";
    document.getElementById("tr_panelA").style.display = which === "A" ? "block" : "none";
    document.getElementById("tr_tabT").className = which === "T" ? "" : "secondary";
    document.getElementById("tr_tabA").className = which === "A" ? "" : "secondary";
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name,tenant_id&order=name");
      tenantId = data[0]?.tenant_id;
      const opts = data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
      document.getElementById("tr_from").innerHTML = `<option value="">출발 매장</option>` + opts;
      document.getElementById("tr_to").innerHTML = `<option value="">도착 매장</option>` + opts;
      document.getElementById("adj_store").innerHTML = `<option value="">매장 선택</option>` + opts;
      applyDefaultStore(document.getElementById("tr_from"));
      applyDefaultStore(document.getElementById("adj_store"));
    } catch (err) {}
  }

  async function searchGeneric(q, boxId, onPick) {
    const box = document.getElementById(boxId);
    if (!q) { box.style.display = "none"; return; }
    box.style.display = "block";
    try {
      const data = await sbGet("products?select=product_id,code,name,category,line&name=ilike.*" + encodeURIComponent(q) + "*&limit=20");
      box.innerHTML = data.map(p => `
        <div class="resultRow" data-id="${p.product_id}" data-name="${p.name.replace(/"/g, '&quot;')}">
          <div><div>${p.name}</div><div class="muted">${p.category}${p.line ? " · " + p.line : ""}</div></div><span>+</span>
        </div>
      `).join("") || `<div class="muted">검색 결과 없음</div>`;
      box.querySelectorAll(".resultRow").forEach(row => row.addEventListener("click", () => onPick(row.dataset.id, row.dataset.name)));
    } catch (err) {}
  }

  function addTransfer(id, name) {
    const ex = transferCart.find(c => c.id === id);
    if (ex) ex.qty += 1; else transferCart.push({ id, name, qty: 1 });
    renderTransferCart();
  }
  function changeTransferQty(id, d) {
    const it = transferCart.find(c => c.id === id);
    if (!it) return;
    it.qty += d;
    if (it.qty <= 0) transferCart = transferCart.filter(c => c.id !== id);
    renderTransferCart();
  }
  function renderTransferCart() {
    const list = document.getElementById("tr_cartList");
    document.getElementById("tr_cartEmpty").style.display = transferCart.length ? "none" : "block";
    list.innerHTML = transferCart.map(c => `
      <div class="cartRow">
        <div style="flex:1">${c.name}</div>
        <button data-id="${c.id}" data-d="-1" class="tqBtn secondary" style="width:28px;padding:2px">-</button>
        <span style="min-width:20px;text-align:center">${c.qty}</span>
        <button data-id="${c.id}" data-d="1" class="tqBtn secondary" style="width:28px;padding:2px">+</button>
      </div>
    `).join("");
    list.querySelectorAll(".tqBtn").forEach(b => b.addEventListener("click", () => changeTransferQty(b.dataset.id, parseInt(b.dataset.d))));
  }
  async function submitTransfer() {
    const statusEl = document.getElementById("tr_status");
    const from = document.getElementById("tr_from").value;
    const to = document.getElementById("tr_to").value;
    if (!from || !to) { statusEl.textContent = "출발/도착 매장을 모두 선택해주세요."; return; }
    if (from === to) { statusEl.textContent = "출발과 도착 매장이 같습니다."; return; }
    if (!transferCart.length) { statusEl.textContent = "이동할 상품이 없습니다."; return; }
    statusEl.textContent = "등록 중...";
    try {
      const items = transferCart.map(c => ({ product_id: c.id, qty: c.qty }));
      await sbRpc("register_transfer", { p_tenant_id: tenantId, p_from_store: from, p_to_store: to, p_note: document.getElementById("tr_note").value || null, p_items: items });
      statusEl.textContent = "이동 등록 완료";
      transferCart = [];
      renderTransferCart();
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function addAdjust(id, name) {
    if (adjustCart.find(c => c.id === id)) return;
    adjustCart.push({ id, name, qty_after: 0 });
    renderAdjustCart();
  }
  function removeAdjust(id) { adjustCart = adjustCart.filter(c => c.id !== id); renderAdjustCart(); }
  function changeAdjustQty(id, val) {
    const it = adjustCart.find(c => c.id === id);
    if (it) it.qty_after = isNaN(val) ? 0 : val;
  }
  function renderAdjustCart() {
    const list = document.getElementById("adj_cartList");
    document.getElementById("adj_cartEmpty").style.display = adjustCart.length ? "none" : "block";
    list.innerHTML = adjustCart.map(c => `
      <div class="cartRow">
        <div style="flex:1">${c.name}</div>
        <span class="muted">실사수량</span>
        <input type="number" class="aInput" data-id="${c.id}" value="${c.qty_after}" style="width:80px" />
        <button data-id="${c.id}" class="aRemove secondary" style="width:28px;padding:2px">×</button>
      </div>
    `).join("");
    list.querySelectorAll(".aInput").forEach(i => i.addEventListener("change", () => changeAdjustQty(i.dataset.id, parseInt(i.value))));
    list.querySelectorAll(".aRemove").forEach(b => b.addEventListener("click", () => removeAdjust(b.dataset.id)));
  }
  async function submitAdjust() {
    const statusEl = document.getElementById("adj_status");
    const store = document.getElementById("adj_store").value;
    if (!store) { statusEl.textContent = "매장을 선택해주세요."; return; }
    if (!adjustCart.length) { statusEl.textContent = "조정할 상품이 없습니다."; return; }
    statusEl.textContent = "등록 중...";
    try {
      const items = adjustCart.map(c => ({ product_id: c.id, qty_after: c.qty_after }));
      await sbRpc("register_adjustment", { p_tenant_id: tenantId, p_store_id: store, p_reason: document.getElementById("adj_reason").value, p_items: items });
      statusEl.textContent = "조정 등록 완료";
      adjustCart = [];
      renderAdjustCart();
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  return { render };
})();
