const RefundModule = (() => {
  let tenantId = null;

  function render() {
    const el = document.getElementById("panel-refund");
    const today = new Date().toISOString().slice(0, 10);
    el.innerHTML = `
      <h2 class="pageTitle">환불</h2>
      <div class="card" style="margin-bottom:12px">
        <div class="row">
          <select id="rf_store" style="flex:1"><option value="">매장 선택</option></select>
          <input id="rf_date" type="date" value="${today}" style="flex:1" />
          <button id="rf_loadBtn">조회</button>
        </div>
      </div>
      <div class="card" style="overflow-x:auto">
        <table>
          <tr>
            <th>시간</th><th>고객명</th><th>상품 요약</th><th>결제수단</th>
            <th style="text-align:right">금액</th><th>상태</th><th>액션</th>
          </tr>
          <tbody id="rf_tableBody"></tbody>
        </table>
      </div>
      <div class="muted" id="rf_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
  }

  function bind() {
    document.getElementById("rf_loadBtn").addEventListener("click", loadOrders);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name,tenant_id&order=name");
      tenantId = data[0]?.tenant_id;
      document.getElementById("rf_store").innerHTML = `<option value="">매장 선택</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
  }

  function nextDateStr(dateStr) {
    return new Date(new Date(dateStr + "T00:00:00").getTime() + 86400000).toISOString().slice(0, 10);
  }

  async function loadOrders() {
    const statusEl = document.getElementById("rf_status");
    const storeId = document.getElementById("rf_store").value;
    const date = document.getElementById("rf_date").value;
    const tbody = document.getElementById("rf_tableBody");
    if (!storeId || !date) { statusEl.textContent = "매장과 날짜를 선택해주세요."; return; }
    statusEl.textContent = "조회 중...";
    try {
      const orders = await sbGet(
        "orders?select=order_id,order_datetime,payment_method,total_amount,customer_id,customers(name),order_items(qty,products(name))" +
        "&store_id=eq." + storeId +
        "&order_datetime=gte." + date + "T00:00:00" +
        "&order_datetime=lt." + nextDateStr(date) + "T00:00:00" +
        "&order=order_datetime.desc"
      );
      let refundedSet = new Set();
      if (orders.length) {
        const refunds = await sbGet("refunds?select=order_id&order_id=in.(" + orders.map(o => o.order_id).join(",") + ")");
        refundedSet = new Set(refunds.map(r => r.order_id));
      }
      renderTable(orders, refundedSet, storeId);
      statusEl.textContent = orders.length + "건의 판매 내역";
    } catch (err) { tbody.innerHTML = ""; statusEl.textContent = "오류: " + err.message; }
  }

  function renderTable(orders, refundedSet, storeId) {
    const tbody = document.getElementById("rf_tableBody");
    tbody.innerHTML = orders.map(o => {
      const isRefunded = refundedSet.has(o.order_id);
      const items = o.order_items || [];
      const summary = items.length ? (items[0].products?.name || "?") + (items.length > 1 ? ` 외 ${items.length - 1}건` : "") : "-";
      const timeStr = new Date(o.order_datetime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      return `
        <tr>
          <td>${timeStr}</td>
          <td>${o.customers?.name || "(비회원)"}</td>
          <td>${summary}</td>
          <td>${o.payment_method}</td>
          <td style="text-align:right">${fmtWon(o.total_amount)}</td>
          <td>${isRefunded ? "환불완료" : "정상"}</td>
          <td>${isRefunded ? "-" : `<button type="button" class="secondary rf-refundBtn" data-id="${o.order_id}">환불</button>`}</td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="7" class="muted">해당 날짜의 판매 내역이 없습니다.</td></tr>`;

    tbody.querySelectorAll(".rf-refundBtn").forEach(b => b.addEventListener("click", () => confirmRefund(b.dataset.id, storeId)));
  }

  async function confirmRefund(orderId, storeId) {
    if (!confirm("이 주문을 환불하시겠습니까? 재고가 자동 복원됩니다.")) return;
    const statusEl = document.getElementById("rf_status");
    statusEl.textContent = "환불 처리 중...";
    try {
      const orderItems = await sbGet("order_items?select=order_item_id,product_id,qty,unit_price&order_id=eq." + orderId);
      const items = orderItems.map(it => ({ order_item_id: it.order_item_id, product_id: it.product_id, qty: it.qty, unit_price: it.unit_price }));
      await sbRpc("register_refund", {
        p_tenant_id: tenantId, p_order_id: orderId, p_store_id: storeId, p_reason: "전체 환불", p_items: items
      });
      statusEl.textContent = "환불 등록 완료 (재고 복원됨)";
      await loadOrders();
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  return { render };
})();
