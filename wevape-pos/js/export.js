const ExportModule = (() => {
  function render() {
    const el = document.getElementById("panel-export");
    el.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <select id="ex_store" style="flex:1"><option value="">전체 매장</option></select>
        </div>
        <div class="row">
          <input id="ex_from" type="date" style="flex:1" />
          <span class="muted">~</span>
          <input id="ex_to" type="date" style="flex:1" />
        </div>
        <div class="muted" style="margin-top:6px">※ 기간은 주문/입고 내보내기에만 적용됩니다.</div>
      </div>

      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <button id="ex_orders" style="flex:1">주문내역 내보내기</button>
          <button id="ex_purchases" style="flex:1">입고내역 내보내기</button>
        </div>
        <div class="row">
          <button id="ex_customers" style="flex:1">고객목록 내보내기</button>
          <button id="ex_products" style="flex:1">상품목록 내보내기</button>
        </div>
      </div>
      <div class="muted" id="ex_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById("ex_from").value = today;
    document.getElementById("ex_to").value = today;
  }

  function bind() {
    document.getElementById("ex_orders").addEventListener("click", exportOrders);
    document.getElementById("ex_purchases").addEventListener("click", exportPurchases);
    document.getElementById("ex_customers").addEventListener("click", exportCustomers);
    document.getElementById("ex_products").addEventListener("click", exportProducts);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name&order=name");
      document.getElementById("ex_store").innerHTML = `<option value="">전체 매장</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
  }

  function toCSV(headers, rows) {
    const esc = (v) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [headers.map(esc).join(",")].concat(rows.map(r => r.map(esc).join(","))).join("\n");
  }

  function downloadCSV(filename, csv) {
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function fmtDate(s) {
    return s ? new Date(s).toLocaleString("ko-KR") : "";
  }

  async function exportOrders() {
    const statusEl = document.getElementById("ex_status");
    const storeId = document.getElementById("ex_store").value;
    const from = document.getElementById("ex_from").value;
    const to = document.getElementById("ex_to").value;
    statusEl.textContent = "내보내는 중...";
    try {
      let path = "orders?select=order_id,order_datetime,payment_method,total_amount,stores(name),customers(name,phone)&order_datetime=gte." + from + "&order_datetime=lte." + to + "T23:59:59&order=order_datetime.desc";
      if (storeId) path += "&store_id=eq." + storeId;
      const data = await sbGet(path);
      const rows = data.map(o => [fmtDate(o.order_datetime), o.stores?.name || "", o.customers?.name || "", o.customers?.phone || "", o.payment_method, o.total_amount]);
      downloadCSV(`주문내역_${from}_${to}.csv`, toCSV(["일시", "매장", "고객명", "전화번호", "결제수단", "금액"], rows));
      statusEl.textContent = rows.length + "건 내보내기 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function exportPurchases() {
    const statusEl = document.getElementById("ex_status");
    const storeId = document.getElementById("ex_store").value;
    const from = document.getElementById("ex_from").value;
    const to = document.getElementById("ex_to").value;
    statusEl.textContent = "내보내는 중...";
    try {
      let path = "purchase_items?select=qty,unit_cost,products(name),purchases(purchase_date,stores(name),suppliers(name))&order=purchases(purchase_date).desc";
      const data = await sbGet(path);
      const filtered = data.filter(d => {
        const date = d.purchases?.purchase_date;
        const storeOk = !storeId || d.purchases?.stores?.name;
        return (!from || !date || date >= from) && (!to || !date || date <= to) && storeOk;
      });
      const rows = filtered.map(d => [d.purchases?.purchase_date || "", d.purchases?.stores?.name || "", d.purchases?.suppliers?.name || "", d.products?.name || "", d.qty, d.unit_cost, (d.qty || 0) * (d.unit_cost || 0)]);
      downloadCSV(`입고내역_${from}_${to}.csv`, toCSV(["입고일", "매장", "거래처", "상품명", "수량", "단가", "금액"], rows));
      statusEl.textContent = rows.length + "건 내보내기 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function exportCustomers() {
    const statusEl = document.getElementById("ex_status");
    statusEl.textContent = "내보내는 중...";
    try {
      const data = await sbGet("customers?select=name,phone,nationality,acquisition_channel,first_visit_date,stores(name)&order=first_visit_date.desc");
      const rows = data.map(c => [c.name || "", c.phone || "", c.nationality || "", c.acquisition_channel || "", c.first_visit_date || "", c.stores?.name || ""]);
      downloadCSV("고객목록.csv", toCSV(["이름", "전화번호", "국적", "유입경로", "첫방문일", "첫방문매장"], rows));
      statusEl.textContent = rows.length + "명 내보내기 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function exportProducts() {
    const statusEl = document.getElementById("ex_status");
    statusEl.textContent = "내보내는 중...";
    try {
      const data = await sbGet("products?select=code,name,category,line,price&order=name");
      const rows = data.map(p => [p.code || "", p.name || "", p.category || "", p.line || "", p.price || 0]);
      downloadCSV("상품목록.csv", toCSV(["코드", "상품명", "분류", "라인", "판매가"], rows));
      statusEl.textContent = rows.length + "개 내보내기 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  return { render };
})();
