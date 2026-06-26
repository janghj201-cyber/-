const RevisitModule = (() => {
  function render() {
    const el = document.getElementById("panel-revisit");
    el.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <select id="rv_store" style="flex:1"><option value="">전체 매장</option></select>
        </div>
        <div class="row">
          <input id="rv_from" type="date" style="flex:1" />
          <span class="muted">~</span>
          <input id="rv_to" type="date" style="flex:1" />
          <button id="rv_loadBtn" style="flex:1">조회</button>
        </div>
      </div>
      <div id="rv_metrics" class="row" style="display:none;margin-bottom:16px"></div>
      <div id="rv_buckets"></div>
      <div class="muted" id="rv_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 3);
    document.getElementById("rv_from").value = monthAgo.toISOString().slice(0, 10);
    document.getElementById("rv_to").value = today.toISOString().slice(0, 10);
  }

  function bind() {
    document.getElementById("rv_loadBtn").addEventListener("click", load);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name&order=name");
      document.getElementById("rv_store").innerHTML = `<option value="">전체 매장</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
  }

  async function load() {
    const storeId = document.getElementById("rv_store").value;
    const from = document.getElementById("rv_from").value;
    const to = document.getElementById("rv_to").value;
    const statusEl = document.getElementById("rv_status");
    const metricsBox = document.getElementById("rv_metrics");
    const bucketsBox = document.getElementById("rv_buckets");
    metricsBox.style.display = "none";
    bucketsBox.innerHTML = "";
    if (!from || !to) { statusEl.textContent = "기간을 선택해주세요."; return; }
    statusEl.textContent = "불러오는 중...";
    try {
      let path = "orders?select=customer_id,order_datetime&tenant_id=eq." + TENANT_ID + "&customer_id=not.is.null&order_datetime=gte." + from + "&order_datetime=lte." + to + "T23:59:59&order=order_datetime.asc";
      if (storeId) path += "&store_id=eq." + storeId;
      const orders = await sbGet(path);

      const byCustomer = {};
      orders.forEach(o => {
        (byCustomer[o.customer_id] = byCustomer[o.customer_id] || []).push(new Date(o.order_datetime));
      });

      const buckets = { "7일 이내": 0, "8~14일": 0, "15~30일": 0, "31~60일": 0, "60일 초과": 0 };
      let allDiffs = [];
      let revisitCustomerCount = 0;

      Object.values(byCustomer).forEach(dates => {
        if (dates.length < 2) return;
        revisitCustomerCount++;
        for (let i = 1; i < dates.length; i++) {
          const days = Math.round((dates[i] - dates[i - 1]) / 86400000);
          allDiffs.push(days);
          if (days <= 7) buckets["7일 이내"]++;
          else if (days <= 14) buckets["8~14일"]++;
          else if (days <= 30) buckets["15~30일"]++;
          else if (days <= 60) buckets["31~60일"]++;
          else buckets["60일 초과"]++;
        }
      });

      const avgDays = allDiffs.length ? Math.round(allDiffs.reduce((s, d) => s + d, 0) / allDiffs.length) : 0;

      metricsBox.style.display = "flex"; metricsBox.style.gap = "12px";
      metricsBox.innerHTML = `
        <div class="card" style="flex:1"><div class="muted">재방문 고객수</div><div style="font-size:22px;font-weight:700">${revisitCustomerCount}명</div></div>
        <div class="card" style="flex:1"><div class="muted">평균 재방문 주기</div><div style="font-size:22px;font-weight:700">${avgDays}일</div></div>
      `;

      bucketsBox.innerHTML = `
        <div class="card">
          <div style="font-weight:700;margin-bottom:8px">재방문 주기 분포</div>
          ${Object.keys(buckets).map(k => `
            <div class="row" style="justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f0f0f0">
              <span>${k}</span>
              <span class="muted">${buckets[k]}건${allDiffs.length ? " (" + Math.round(buckets[k] / allDiffs.length * 100) + "%)" : ""}</span>
            </div>
          `).join("")}
        </div>
      `;

      statusEl.textContent = `${from} ~ ${to} · 주문 ${orders.length}건 기준`;
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  return { render };
})();
