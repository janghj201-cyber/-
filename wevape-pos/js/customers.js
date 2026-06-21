const CustomersModule = (() => {
  function render() {
    const el = document.getElementById("panel-customers");
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <input id="cu_phone" type="text" placeholder="전화번호로 검색" style="flex:1" />
        <button id="cu_searchBtn">조회</button>
      </div>
      <div id="cu_info" class="card" style="display:none"></div>
      <div id="cu_stats" class="row" style="display:none;margin-bottom:12px"></div>
      <div id="cu_orders"></div>
      <div class="muted" id="cu_status" style="margin-top:10px"></div>
    `;
    document.getElementById("cu_searchBtn").addEventListener("click", search);
  }

  function fmtDate(s) {
    const d = new Date(s);
    return d.toLocaleString("ko-KR", { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  async function search() {
    const phone = document.getElementById("cu_phone").value.trim();
    const statusEl = document.getElementById("cu_status");
    const infoBox = document.getElementById("cu_info");
    const statsBox = document.getElementById("cu_stats");
    const ordersBox = document.getElementById("cu_orders");
    infoBox.style.display = "none"; statsBox.style.display = "none"; ordersBox.innerHTML = "";
    if (!phone) { statusEl.textContent = "전화번호를 입력해주세요."; return; }
    statusEl.textContent = "조회 중...";
    try {
      const custData = await sbGet("customers?select=customer_id,name,nationality,acquisition_channel,first_visit_date,stores(name)&phone=eq." + encodeURIComponent(phone));
      if (!custData.length) { statusEl.textContent = "해당 전화번호의 고객을 찾을 수 없습니다."; return; }
      const cust = custData[0];
      infoBox.style.display = "block";
      infoBox.innerHTML = `<div style="font-size:17px;font-weight:700">${cust.name || "이름없음"} 님</div>
        <div class="muted" style="margin-top:4px">${cust.nationality || "-"} · 첫방문 ${cust.first_visit_date || "-"} (${cust.stores?.name || "-"}) · 유입경로 ${cust.acquisition_channel || "-"}</div>`;

      const orders = await sbGet("orders?select=order_id,order_datetime,payment_method,total_amount,stores(name),order_items(qty,unit_price,products(name))&customer_id=eq." + cust.customer_id + "&order=order_datetime.desc");
      const totalSpent = orders.reduce((s, o) => s + (o.total_amount || 0), 0);

      statsBox.style.display = "flex"; statsBox.style.gap = "12px";
      statsBox.innerHTML = `
        <div class="card" style="flex:1;text-align:center"><div class="muted">총 구매횟수</div><div style="font-size:20px;font-weight:700">${orders.length}회</div></div>
        <div class="card" style="flex:1;text-align:center"><div class="muted">누적 구매액</div><div style="font-size:20px;font-weight:700">${fmtWon(totalSpent)}</div></div>
      `;

      statusEl.textContent = orders.length + "건의 주문 내역";
      ordersBox.innerHTML = orders.map(o => `
        <div class="card">
          <div class="row" style="justify-content:space-between;margin-bottom:6px">
            <span class="muted">${fmtDate(o.order_datetime)} · ${o.stores?.name || "-"} · ${o.payment_method}</span>
            <span style="font-weight:700">${fmtWon(o.total_amount)}</span>
          </div>
          ${(o.order_items || []).map(it => `<div class="muted" style="padding-left:8px">· ${it.products?.name || "?"} x${it.qty} (${fmtWon(it.unit_price)})</div>`).join("")}
        </div>
      `).join("") || `<div class="muted">구매 내역이 없습니다.</div>`;
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  return { render };
})();
