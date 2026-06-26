const StoreCompareModule = (() => {
  let rows = [];
  let sortKey = "totalSales";
  let sortDir = "desc";

  function render() {
    const el = document.getElementById("panel-store-compare");
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + "01";
    el.innerHTML = `
      <h2 class="pageTitle">매장별 비교 대시보드</h2>
      <div class="card" style="margin-bottom:12px">
        <div class="row">
          <input id="sc_from" type="date" value="${monthStart}" />
          <span class="muted">~</span>
          <input id="sc_to" type="date" value="${today}" />
          <button id="sc_loadBtn">조회</button>
        </div>
      </div>
      <div class="card" id="sc_chartBox" style="margin-bottom:12px"></div>
      <div class="card" style="overflow-x:auto">
        <table>
          <tr>
            <th class="sc-sortHeader" data-key="name" style="cursor:pointer">매장</th>
            <th class="sc-sortHeader" data-key="totalSales" style="cursor:pointer;text-align:right">매출총액</th>
            <th class="sc-sortHeader" data-key="visits" style="cursor:pointer;text-align:right">방문객</th>
            <th class="sc-sortHeader" data-key="avgOrder" style="cursor:pointer;text-align:right">객단가</th>
            <th class="sc-sortHeader" data-key="newCustomers" style="cursor:pointer;text-align:right">신규고객</th>
            <th class="sc-sortHeader" data-key="revisitRate" style="cursor:pointer;text-align:right">재방문율</th>
          </tr>
          <tbody id="sc_tableBody"></tbody>
          <tfoot id="sc_totalRow"></tfoot>
        </table>
      </div>
      <div class="muted" id="sc_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStats();
  }

  function bind() {
    document.getElementById("sc_loadBtn").addEventListener("click", loadStats);
    document.querySelectorAll(".sc-sortHeader").forEach(h => h.addEventListener("click", () => {
      const key = h.dataset.key;
      if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
      else { sortKey = key; sortDir = "desc"; }
      renderTable();
    }));
  }

  function nextDateStr(dateStr) {
    return new Date(new Date(dateStr + "T00:00:00").getTime() + 86400000).toISOString().slice(0, 10);
  }

  async function loadStats() {
    const statusEl = document.getElementById("sc_status");
    const from = document.getElementById("sc_from").value;
    const to = document.getElementById("sc_to").value;
    if (!from || !to) { statusEl.textContent = "기간을 선택해주세요."; return; }
    statusEl.textContent = "집계 중...";
    try {
      const stores = await sbGet("stores?select=store_id,name&order=name");
      const byStore = await sbRpc("get_sales_by_store", { p_date_from: from, p_date_to: to });

      rows = await Promise.all(stores.map(async (store) => {
        const matched = byStore.find(r => r.store_name === store.name);
        const totalSales = matched?.gross_amount || 0;
        const visits = matched?.order_count || 0;
        const avgOrder = visits ? Math.round(totalSales / visits) : 0;

        let newCustomers = 0, revisitRate = 0;
        try {
          const orders = await sbGet(
            "orders?select=customer_id&tenant_id=eq." + TENANT_ID + "&store_id=eq." + store.store_id +
            "&order_datetime=gte." + from + "T00:00:00" +
            "&order_datetime=lt." + nextDateStr(to) + "T00:00:00" +
            "&customer_id=not.is.null"
          );
          const ids = [...new Set(orders.map(o => o.customer_id))];
          if (ids.length) {
            const custs = await sbGet("customers?select=customer_id,first_visit_date,total_visits&tenant_id=eq." + TENANT_ID + "&customer_id=in.(" + ids.join(",") + ")");
            newCustomers = custs.filter(c => c.first_visit_date >= from && c.first_visit_date <= to).length;
            const revisitCount = custs.filter(c => (c.total_visits || 0) > 1).length;
            revisitRate = Math.round((revisitCount / ids.length) * 100);
          }
        } catch (err) {}

        return { storeId: store.store_id, name: store.name, totalSales, visits, avgOrder, newCustomers, revisitRate };
      }));

      renderChart();
      renderTable();
      statusEl.textContent = "집계 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function renderChart() {
    const box = document.getElementById("sc_chartBox");
    const ranked = [...rows].sort((a, b) => b.totalSales - a.totalSales);
    const maxSales = Math.max(1, ...ranked.map(r => r.totalSales));
    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:10px">매출총액 순위</div>
      ${ranked.map(r => {
        const pct = Math.round((r.totalSales / maxSales) * 100);
        return `
          <div class="row" style="align-items:center;gap:8px;margin-bottom:5px">
            <span style="width:90px" class="muted">${r.name}</span>
            <div style="flex:1;background:#f0ede3;border-radius:4px;height:16px;overflow:hidden">
              <div style="height:100%;border-radius:4px;width:${pct}%;background:var(--ink)"></div>
            </div>
            <span style="min-width:100px;text-align:right">${fmtWon(r.totalSales)}</span>
          </div>
        `;
      }).join("")}
    `;
  }

  function renderTable() {
    const body = document.getElementById("sc_tableBody");
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return sortDir === "asc" ? cmp : -cmp;
    });
    body.innerHTML = sorted.map(r => `
      <tr class="resultRow sc-row" data-id="${r.storeId}" style="cursor:pointer">
        <td>${r.name}</td>
        <td style="text-align:right">${fmtWon(r.totalSales)}</td>
        <td style="text-align:right">${r.visits}명</td>
        <td style="text-align:right">${fmtWon(r.avgOrder)}</td>
        <td style="text-align:right">${r.newCustomers}명</td>
        <td style="text-align:right">${r.revisitRate}%</td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="muted">데이터가 없습니다.</td></tr>`;

    const totalSales = rows.reduce((s, r) => s + r.totalSales, 0);
    const totalVisits = rows.reduce((s, r) => s + r.visits, 0);
    const totalAvgOrder = totalVisits ? Math.round(totalSales / totalVisits) : 0;
    const totalNew = rows.reduce((s, r) => s + r.newCustomers, 0);
    document.getElementById("sc_totalRow").innerHTML = `
      <tr style="font-weight:700;border-top:2px solid var(--line)">
        <td>전체합계</td>
        <td style="text-align:right">${fmtWon(totalSales)}</td>
        <td style="text-align:right">${totalVisits}명</td>
        <td style="text-align:right">${fmtWon(totalAvgOrder)}</td>
        <td style="text-align:right">${totalNew}명</td>
        <td style="text-align:right">${rows.length ? Math.round(rows.reduce((s, r) => s + r.revisitRate, 0) / rows.length) : 0}%</td>
      </tr>
    `;

    body.querySelectorAll(".sc-row").forEach(tr => tr.addEventListener("click", () => goToStoreDetail(tr.dataset.id)));
  }

  function goToStoreDetail(storeId) {
    showTab("hourly-stats");
    const apply = () => {
      const sel = document.getElementById("hs_store");
      if (sel && sel.options.length > 1) {
        sel.value = storeId;
        document.getElementById("hs_loadBtn").click();
      } else {
        setTimeout(apply, 100);
      }
    };
    setTimeout(apply, 50);
  }

  return { render };
})();
