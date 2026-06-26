const SalesHistoryModule = (() => {
  let orders = [];
  let expandedId = null;

  function render() {
    const el = document.getElementById("panel-sales");
    el.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <select id="sh_store" style="flex:1"><option value="">전체 매장</option></select>
          <select id="sh_payment" style="flex:1">
            <option value="">전체 결제수단</option>
            <option value="현금">현금</option><option value="카드">카드</option><option value="이체">이체</option><option value="Alipay">Alipay</option><option value="기타">기타</option>
          </select>
        </div>
        <div class="row">
          <input id="sh_from" type="date" style="flex:1" />
          <span class="muted">~</span>
          <input id="sh_to" type="date" style="flex:1" />
          <button id="sh_loadBtn" style="flex:1">조회</button>
        </div>
      </div>
      <div id="sh_summary" class="row" style="display:none;margin-bottom:16px"></div>
      <div id="sh_list"></div>
      <div class="muted" id="sh_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById("sh_from").value = today;
    document.getElementById("sh_to").value = today;
  }

  function bind() {
    document.getElementById("sh_loadBtn").addEventListener("click", load);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name&order=name");
      document.getElementById("sh_store").innerHTML = `<option value="">전체 매장</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
  }

  function fmtDate(s) {
    const d = new Date(s);
    return d.toLocaleString("ko-KR", { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  async function load() {
    const storeId = document.getElementById("sh_store").value;
    const payment = document.getElementById("sh_payment").value;
    const from = document.getElementById("sh_from").value;
    const to = document.getElementById("sh_to").value;
    const statusEl = document.getElementById("sh_status");
    const summaryBox = document.getElementById("sh_summary");
    const listBox = document.getElementById("sh_list");
    summaryBox.style.display = "none";
    listBox.innerHTML = "";
    if (!from || !to) { statusEl.textContent = "기간을 선택해주세요."; return; }
    statusEl.textContent = "불러오는 중...";
    try {
      let path = "orders?select=order_id,order_datetime,payment_method,total_amount,stores(name),customers(name),order_items(qty,unit_price,products(name))"
        + "&tenant_id=eq." + TENANT_ID
        + "&order_datetime=gte." + from + "&order_datetime=lte." + to + "T23:59:59"
        + "&order=order_datetime.desc";
      if (storeId) path += "&store_id=eq." + storeId;
      if (payment) path += "&payment_method=eq." + encodeURIComponent(payment);
      orders = await sbGet(path);
      expandedId = null;

      const totalAmount = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
      summaryBox.style.display = "flex"; summaryBox.style.gap = "12px";
      summaryBox.innerHTML = `
        <div class="card" style="flex:1"><div class="muted">주문건수</div><div style="font-size:20px;font-weight:700">${orders.length}건</div></div>
        <div class="card" style="flex:1"><div class="muted">합계</div><div style="font-size:20px;font-weight:700">${fmtWon(totalAmount)}</div></div>
      `;

      renderList();
      statusEl.textContent = `${from} ~ ${to} · ${orders.length}건`;
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function renderList() {
    const listBox = document.getElementById("sh_list");
    listBox.innerHTML = orders.map(o => {
      const itemsSummary = (o.order_items || []).map(it => `${it.products?.name || "?"} x${it.qty}`).join(", ");
      const isOpen = expandedId === o.order_id;
      return `
        <div class="card sh-row" data-id="${o.order_id}" style="cursor:pointer">
          <div class="row" style="justify-content:space-between">
            <div style="flex:1">
              <div>${fmtDate(o.order_datetime)} · ${o.stores?.name || "-"}</div>
              <div class="muted">${itemsSummary || "-"}</div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:700">${fmtWon(o.total_amount)}</div>
              <div class="muted">${o.payment_method} · ${o.customers?.name || "-"}</div>
            </div>
          </div>
          ${isOpen ? `
            <div style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">
              ${(o.order_items || []).map(it => `
                <div class="row" style="justify-content:space-between;font-size:13px;padding:3px 0">
                  <span>${it.products?.name || "?"}</span>
                  <span class="muted">${it.qty}개 × ${fmtWon(it.unit_price)} = ${fmtWon(it.qty * it.unit_price)}</span>
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      `;
    }).join("") || `<div class="muted">해당 조건의 판매 내역이 없습니다.</div>`;

    listBox.querySelectorAll(".sh-row").forEach(row => {
      row.addEventListener("click", () => {
        const id = row.dataset.id;
        expandedId = expandedId === id ? null : id;
        renderList();
      });
    });
  }

  return { render };
})();
