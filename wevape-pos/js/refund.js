const RefundModule = (() => {
  let tenantId = null;
  let loadedOrderItems = [];

  function render() {
    const el = document.getElementById("panel-refund");
    el.innerHTML = `
      <div class="card">
        <select id="rf_store" style="width:100%;margin-bottom:8px"><option value="">매장 선택</option></select>
        <input id="rf_orderId" type="text" placeholder="주문 ID 붙여넣기" style="width:100%;margin-bottom:8px" />
        <button id="rf_loadBtn" style="width:100%">주문 불러오기</button>
      </div>
      <div id="rf_orderItemsBox"></div>
      <input id="rf_reason" type="text" placeholder="환불 사유" style="width:100%;margin:12px 0" />
      <button id="rf_submitBtn" style="width:100%">환불 등록</button>
      <div class="muted" id="rf_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
  }

  function bind() {
    document.getElementById("rf_loadBtn").addEventListener("click", loadOrder);
    document.getElementById("rf_submitBtn").addEventListener("click", submitRefund);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name,tenant_id&order=name");
      tenantId = data[0]?.tenant_id;
      document.getElementById("rf_store").innerHTML = `<option value="">매장 선택</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
  }

  async function loadOrder() {
    const orderId = document.getElementById("rf_orderId").value.trim();
    const box = document.getElementById("rf_orderItemsBox");
    const statusEl = document.getElementById("rf_status");
    if (!orderId) { statusEl.textContent = "주문 ID를 입력해주세요."; return; }
    statusEl.textContent = "불러오는 중...";
    try {
      const data = await sbGet("order_items?select=order_item_id,product_id,qty,unit_price,products(name)&order_id=eq." + orderId);
      if (!data.length) { box.innerHTML = ""; statusEl.textContent = "해당 주문을 찾을 수 없습니다."; return; }
      loadedOrderItems = data.map(d => ({ order_item_id: d.order_item_id, product_id: d.product_id, name: d.products?.name || "?", max_qty: d.qty, unit_price: d.unit_price, refund_qty: d.qty }));
      statusEl.textContent = data.length + "개 품목 불러옴";
      renderItems();
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function renderItems() {
    const box = document.getElementById("rf_orderItemsBox");
    box.innerHTML = `<div class="card">` + loadedOrderItems.map(it => `
      <div class="cartRow">
        <div style="flex:1">${it.name} <span class="muted">(구매 ${it.max_qty})</span></div>
        <span class="muted">환불수량</span>
        <input type="number" class="rfQtyInput" data-id="${it.order_item_id}" value="${it.refund_qty}" min="0" max="${it.max_qty}" style="width:70px" />
      </div>
    `).join("") + `</div>`;
    box.querySelectorAll(".rfQtyInput").forEach(inp => {
      inp.addEventListener("change", () => {
        const it = loadedOrderItems.find(x => x.order_item_id === inp.dataset.id);
        if (it) it.refund_qty = parseInt(inp.value) || 0;
      });
    });
  }

  async function submitRefund() {
    const statusEl = document.getElementById("rf_status");
    const storeId = document.getElementById("rf_store").value;
    const orderId = document.getElementById("rf_orderId").value.trim();
    if (!storeId) { statusEl.textContent = "매장을 선택해주세요."; return; }
    if (!loadedOrderItems.length) { statusEl.textContent = "먼저 주문을 불러와주세요."; return; }
    const items = loadedOrderItems.filter(it => it.refund_qty > 0).map(it => ({ order_item_id: it.order_item_id, product_id: it.product_id, qty: it.refund_qty, unit_price: it.unit_price }));
    if (!items.length) { statusEl.textContent = "환불 수량을 입력해주세요."; return; }
    statusEl.textContent = "등록 중...";
    try {
      await sbRpc("register_refund", { p_tenant_id: tenantId, p_order_id: orderId, p_store_id: storeId, p_reason: document.getElementById("rf_reason").value || null, p_items: items });
      statusEl.textContent = "환불 등록 완료 (재고 복원됨)";
      loadedOrderItems = [];
      document.getElementById("rf_orderItemsBox").innerHTML = "";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  return { render };
})();
