const DashboardModule = (() => {
  let chartInstance = null;

  function render() {
    const el = document.getElementById("panel-dashboard");
    el.innerHTML = `
      <h2 class="pageTitle">매출 현황</h2>

      <!-- 오늘 전체 현황 -->
      <div class="card" style="margin-bottom:16px">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-weight:700">🏪 오늘 전체 현황</span>
          <div class="row" style="gap:8px;align-items:center">
            <span class="muted" style="font-size:12px" id="db_overviewDate"></span>
            <button id="db_refreshBtn" class="secondary" style="padding:5px 10px;font-size:12px">↻ 새로고침</button>
          </div>
        </div>
        <div id="db_overview"><div class="muted">불러오는 중...</div></div>
      </div>

      <!-- 기간별 분석 -->
      <div class="card" style="margin-bottom:12px">
        <div style="font-weight:700;margin-bottom:10px">📊 기간별 분석</div>
        <div class="row">
          <input id="db_from" type="date" style="flex:1" />
          <span class="muted">~</span>
          <input id="db_to" type="date" style="flex:1" />
          <button id="db_loadBtn" style="flex:1">조회</button>
        </div>
      </div>
      <div id="db_metrics" class="row" style="display:none;margin-bottom:16px"></div>
      <div id="db_chartWrap" style="display:none;position:relative;width:100%;height:240px;margin-bottom:24px">
        <canvas id="db_chart" role="img" aria-label="매장별 매출 막대그래프"></canvas>
      </div>
      <div id="db_lineSection"></div>
      <div class="muted" id="db_status" style="margin-top:10px"></div>
    `;

    const today = new Date().toISOString().slice(0, 10);
    document.getElementById("db_from").value = today;
    document.getElementById("db_to").value   = today;
    document.getElementById("db_loadBtn").addEventListener("click", loadPeriod);
    document.getElementById("db_refreshBtn").addEventListener("click", loadTodayOverview);
    loadTodayOverview();
    loadPeriod();
  }

  // ── 오늘 전체 현황 ──────────────────────────────────────────────────────────

  function fmtDate(d) { return d.toISOString().slice(0, 10); }

  async function loadTodayOverview() {
    const today     = fmtDate(new Date());
    const tomorrow  = fmtDate(new Date(Date.now() + 86400000));
    const dateEl    = document.getElementById("db_overviewDate");
    const box       = document.getElementById("db_overview");
    if (dateEl) dateEl.textContent = today + " 기준";
    if (!box) return;
    box.innerHTML = `<div class="muted">불러오는 중...</div>`;
    try {
      const [stores, orders, closings] = await Promise.all([
        sbGet("stores?select=store_id,name&order=name"),
        sbGet(
          "orders?select=store_id,total_amount" +
          "&tenant_id=eq." + TENANT_ID +
          "&order_datetime=gte." + today + "T00:00:00" +
          "&order_datetime=lt."  + tomorrow + "T00:00:00"
        ),
        sbGet(
          "daily_closings?select=store_id,business_start,business_end" +
          "&tenant_id=eq." + TENANT_ID + "&closing_date=eq." + today
        )
      ]);

      // aggregate orders by store
      const salesMap = {};
      orders.forEach(o => {
        if (!salesMap[o.store_id]) salesMap[o.store_id] = { amount: 0, count: 0 };
        salesMap[o.store_id].amount += o.total_amount || 0;
        salesMap[o.store_id].count++;
      });

      const closingMap = {};
      closings.forEach(c => { closingMap[c.store_id] = c; });

      const rows = stores.map(s => {
        const c     = closingMap[s.store_id];
        const sales = salesMap[s.store_id] || { amount: 0, count: 0 };
        let statusText, statusColor;
        if (!c || !c.business_start)  { statusText = "미시작";  statusColor = "#8a8674"; }
        else if (!c.business_end)      { statusText = "🟢 영업중"; statusColor = "var(--good)"; }
        else                           { statusText = "🔴 마감완료"; statusColor = "var(--bad)"; }
        return { name: s.name, statusText, statusColor, amount: sales.amount, count: sales.count };
      });

      const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
      const totalCount  = rows.reduce((s, r) => s + r.count, 0);

      box.innerHTML = rows.length ? `
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>매장</th>
                <th>상태</th>
                <th style="text-align:right">오늘 매출</th>
                <th style="text-align:right">주문건수</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td style="font-weight:600">${r.name}</td>
                  <td style="color:${r.statusColor};font-weight:600;font-size:13px">${r.statusText}</td>
                  <td style="text-align:right;font-weight:600">${fmtWon(r.amount)}</td>
                  <td style="text-align:right">${r.count}건</td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid var(--line)">
                <td colspan="2" style="font-weight:700">전체 합계</td>
                <td style="text-align:right;font-weight:700;font-size:15px">${fmtWon(totalAmount)}</td>
                <td style="text-align:right;font-weight:700">${totalCount}건</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : `<div class="muted">등록된 매장이 없습니다.</div>`;
    } catch (err) {
      if (box) box.innerHTML = `<div class="muted">오류: ${err.message}</div>`;
    }
  }

  // ── 기간별 분석 ─────────────────────────────────────────────────────────────

  async function loadPeriod() {
    const from     = document.getElementById("db_from").value;
    const to       = document.getElementById("db_to").value;
    const statusEl = document.getElementById("db_status");
    if (!from || !to) { statusEl.textContent = "기간을 선택해주세요."; return; }
    statusEl.textContent = "불러오는 중...";
    try {
      const [byStore, byLine] = await Promise.all([
        sbRpc("get_sales_by_store",     { p_date_from: from, p_date_to: to }),
        sbRpc("get_sales_dashboard",    { p_date_from: from, p_date_to: to })
      ]);

      const totalAmount = byStore.reduce((s, r) => s + (r.gross_amount || 0), 0);
      const totalOrders = byStore.reduce((s, r) => s + (r.order_count  || 0), 0);

      const metricsBox = document.getElementById("db_metrics");
      metricsBox.style.display = "flex"; metricsBox.style.gap = "12px";
      metricsBox.innerHTML = `
        <div class="card" style="flex:1"><div class="muted">총 매출</div><div style="font-size:22px;font-weight:700">${fmtWon(totalAmount)}</div></div>
        <div class="card" style="flex:1"><div class="muted">총 주문건수</div><div style="font-size:22px;font-weight:700">${totalOrders}건</div></div>
      `;

      document.getElementById("db_chartWrap").style.display = "block";
      if (chartInstance) chartInstance.destroy();
      chartInstance = new Chart(document.getElementById("db_chart"), {
        type: "bar",
        data: {
          labels: byStore.map(r => r.store_name),
          datasets: [{ label: "매출", data: byStore.map(r => r.gross_amount), backgroundColor: "#7F77DD" }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { ticks: { callback: (v) => Math.round(v / 10000) + "만" } } }
        }
      });

      const grouped = {};
      byLine.forEach(r => { (grouped[r.store_name] = grouped[r.store_name] || []).push(r); });

      document.getElementById("db_lineSection").innerHTML =
        Object.keys(grouped).map(storeName => `
          <div class="card">
            <div style="font-weight:700;margin-bottom:8px">${storeName}</div>
            ${grouped[storeName].map(r => `
              <div class="row" style="justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f0f0f0">
                <span>${r.category}${r.line && r.line !== "-" ? " · " + r.line : ""}</span>
                <span class="muted">${r.qty}개 · ${fmtWon(r.gross_amount)}</span>
              </div>
            `).join("")}
          </div>
        `).join("") || `<div class="muted">해당 기간 매출 데이터가 없습니다.</div>`;

      statusEl.textContent = `${from} ~ ${to} 매출 데이터`;
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  return { render };
})();
