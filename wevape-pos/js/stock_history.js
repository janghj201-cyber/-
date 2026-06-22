const StockHistoryModule = (() => {
  function render() {
    const el = document.getElementById("panel-stockhistory");
    el.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <select id="sh2_store" style="flex:1"><option value="">전체 매장</option></select>
          <input id="sh2_product" type="text" placeholder="상품명 검색 (선택)" style="flex:2" />
        </div>
        <div class="row">
          <input id="sh2_from" type="date" style="flex:1" />
          <span class="muted">~</span>
          <input id="sh2_to" type="date" style="flex:1" />
          <button id="sh2_loadBtn" style="flex:1">조회</button>
        </div>
      </div>
      <div id="sh2_summary" class="row" style="display:none;margin-bottom:16px;flex-wrap:wrap"></div>
      <div id="sh2_timeline"></div>
      <div class="muted" id="sh2_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById("sh2_from").value = today;
    document.getElementById("sh2_to").value = today;
  }

  function bind() {
    document.getElementById("sh2_loadBtn").addEventListener("click", load);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name&order=name");
      document.getElementById("sh2_store").innerHTML = `<option value="">전체 매장</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
  }

  function fmtDate(s) {
    if (!s) return "-";
    const d = new Date(s);
    return d.toLocaleString("ko-KR", { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  async function load() {
    const storeId = document.getElementById("sh2_store").value;
    const productQuery = document.getElementById("sh2_product").value.trim();
    const from = document.getElementById("sh2_from").value;
    const to = document.getElementById("sh2_to").value;
    const statusEl = document.getElementById("sh2_status");
    const summaryBox = document.getElementById("sh2_summary");
    const timelineBox = document.getElementById("sh2_timeline");
    summaryBox.style.display = "none";
    timelineBox.innerHTML = "";
    if (!from || !to) { statusEl.textContent = "기간을 선택해주세요."; return; }
    statusEl.textContent = "불러오는 중...";
    try {
      const [sales, purchases, transfers, refunds, adjustments] = await Promise.all([
        loadSales(storeId, from, to),
        loadPurchases(storeId, from, to),
        loadTransfers(storeId, from, to),
        loadRefunds(storeId, from, to),
        loadAdjustments(storeId, from, to)
      ]);

      let entries = [...sales, ...purchases, ...transfers, ...refunds, ...adjustments];
      if (productQuery) {
        const q = productQuery.toLowerCase();
        entries = entries.filter(e => (e.product || "").toLowerCase().includes(q));
      }
      entries.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

      renderSummary(entries);
      renderTimeline(entries);
      statusEl.textContent = entries.length + "건의 재고 변동 내역";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function loadSales(storeId, from, to) {
    let path = "orders?select=order_datetime,payment_method,store_id,customers(name),order_items(qty,products(name))"
      + "&order_datetime=gte." + from + "&order_datetime=lte." + to + "T23:59:59";
    if (storeId) path += "&store_id=eq." + storeId;
    const data = await sbGet(path);
    const entries = [];
    data.forEach(o => {
      (o.order_items || []).forEach(it => {
        entries.push({
          type: "sale", icon: "🔴", label: "판매",
          datetime: o.order_datetime,
          product: it.products?.name || "?",
          qty: -(it.qty || 0),
          extra: `${o.customers?.name || "-"} · ${o.payment_method || "-"}`
        });
      });
    });
    return entries;
  }

  async function loadPurchases(storeId, from, to) {
    let path = "purchases?select=purchase_datetime,store_id,suppliers(name),purchase_items(qty,unit_cost,products(name))"
      + "&purchase_datetime=gte." + from + "&purchase_datetime=lte." + to + "T23:59:59";
    if (storeId) path += "&store_id=eq." + storeId;
    const data = await sbGet(path);
    const entries = [];
    data.forEach(p => {
      (p.purchase_items || []).forEach(it => {
        entries.push({
          type: "purchase", icon: "🟢", label: "입고",
          datetime: p.purchase_datetime,
          product: it.products?.name || "?",
          qty: it.qty || 0,
          extra: `${p.suppliers?.name || "-"} · ${fmtWon(it.unit_cost)}`
        });
      });
    });
    return entries;
  }

  async function loadTransfers(storeId, from, to) {
    let path = "stock_transfers?select=transfer_datetime,note,from_store:stores!from_store_id(name),to_store:stores!to_store_id(name),from_store_id,to_store_id,stock_transfer_items(qty,products(name))"
      + "&transfer_datetime=gte." + from + "&transfer_datetime=lte." + to + "T23:59:59";
    if (storeId) path += "&or=(from_store_id.eq." + storeId + ",to_store_id.eq." + storeId + ")";
    const data = await sbGet(path);
    const entries = [];
    data.forEach(t => {
      const route = `${t.from_store?.name || "-"} → ${t.to_store?.name || "-"}`;
      (t.stock_transfer_items || []).forEach(it => {
        if (!storeId || t.from_store_id === storeId) {
          entries.push({ type: "transfer", icon: "🔵", label: "이동출고", datetime: t.transfer_datetime, product: it.products?.name || "?", qty: -(it.qty || 0), extra: route });
        }
        if (!storeId || t.to_store_id === storeId) {
          entries.push({ type: "transfer", icon: "🔵", label: "이동입고", datetime: t.transfer_datetime, product: it.products?.name || "?", qty: it.qty || 0, extra: route });
        }
      });
    });
    return entries;
  }

  async function loadRefunds(storeId, from, to) {
    let path = "refunds?select=refund_datetime,order_id,store_id,refund_items(qty,products(name))"
      + "&refund_datetime=gte." + from + "&refund_datetime=lte." + to + "T23:59:59";
    if (storeId) path += "&store_id=eq." + storeId;
    const data = await sbGet(path);
    const entries = [];
    data.forEach(r => {
      (r.refund_items || []).forEach(it => {
        entries.push({
          type: "refund", icon: "🟡", label: "환불",
          datetime: r.refund_datetime,
          product: it.products?.name || "?",
          qty: it.qty || 0,
          extra: "원주문 " + (r.order_id ? String(r.order_id).slice(0, 8) : "-")
        });
      });
    });
    return entries;
  }

  async function loadAdjustments(storeId, from, to) {
    let path = "stock_adjustments?select=adjustment_datetime,reason,store_id,stock_adjustment_items(qty_diff,products(name))"
      + "&adjustment_datetime=gte." + from + "&adjustment_datetime=lte." + to + "T23:59:59";
    if (storeId) path += "&store_id=eq." + storeId;
    const data = await sbGet(path);
    const entries = [];
    data.forEach(a => {
      (a.stock_adjustment_items || []).forEach(it => {
        entries.push({
          type: "adjustment", icon: "⚪", label: "실사조정",
          datetime: a.adjustment_datetime,
          product: it.products?.name || "?",
          qty: it.qty_diff || 0,
          extra: a.reason || "-"
        });
      });
    });
    return entries;
  }

  function renderSummary(entries) {
    const box = document.getElementById("sh2_summary");
    const byType = { purchase: { count: 0, qty: 0 }, sale: { count: 0, qty: 0 }, transfer: { count: 0, qty: 0 }, adjustment: { count: 0, qty: 0 } };
    entries.forEach(e => {
      const bucket = byType[e.type === "refund" ? "purchase" : e.type];
      if (!bucket) return;
      bucket.count++;
      bucket.qty += Math.abs(e.qty);
    });
    box.style.display = "flex"; box.style.gap = "12px";
    box.innerHTML = `
      <div class="card" style="flex:1;min-width:120px"><div class="muted">총 입고</div><div style="font-size:18px;font-weight:700">${byType.purchase.count}건 · ${byType.purchase.qty}개</div></div>
      <div class="card" style="flex:1;min-width:120px"><div class="muted">총 판매</div><div style="font-size:18px;font-weight:700">${byType.sale.count}건 · ${byType.sale.qty}개</div></div>
      <div class="card" style="flex:1;min-width:120px"><div class="muted">총 이동</div><div style="font-size:18px;font-weight:700">${byType.transfer.count}건 · ${byType.transfer.qty}개</div></div>
      <div class="card" style="flex:1;min-width:120px"><div class="muted">총 조정</div><div style="font-size:18px;font-weight:700">${byType.adjustment.count}건 · ${byType.adjustment.qty}개</div></div>
    `;
  }

  function renderTimeline(entries) {
    const box = document.getElementById("sh2_timeline");
    box.innerHTML = entries.map(e => `
      <div class="card" style="padding:12px 16px">
        <div class="row" style="justify-content:space-between">
          <div>
            <span>${e.icon} ${e.label}</span>
            <span class="muted" style="margin-left:8px">${fmtDate(e.datetime)}</span>
          </div>
          <span style="font-weight:700;${e.qty < 0 ? "color:var(--bad)" : "color:var(--good)"}">${e.qty > 0 ? "+" : ""}${e.qty}개</span>
        </div>
        <div style="margin-top:4px">${e.product}</div>
        <div class="muted" style="font-size:12px">${e.extra}</div>
      </div>
    `).join("") || `<div class="muted">해당 조건의 재고 변동 내역이 없습니다.</div>`;
  }

  return { render };
})();
