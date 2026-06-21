const DashboardModule = (() => {
  let chartInstance = null;

  function render() {
    const el = document.getElementById("panel-dashboard");
    el.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <input id="db_from" type="date" style="flex:1" />
        <span class="muted">~</span>
        <input id="db_to" type="date" style="flex:1" />
        <button id="db_loadBtn" style="flex:1">조회</button>
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
    document.getElementById("db_to").value = today;
    document.getElementById("db_loadBtn").addEventListener("click", load);
    load();
  }

  async function load() {
    const from = document.getElementById("db_from").value;
    const to = document.getElementById("db_to").value;
    const statusEl = document.getElementById("db_status");
    if (!from || !to) { statusEl.textContent = "기간을 선택해주세요."; return; }
    statusEl.textContent = "불러오는 중...";
    try {
      const [byStore, byLine] = await Promise.all([
        sbRpc("get_sales_by_store", { p_date_from: from, p_date_to: to }),
        sbRpc("get_sales_dashboard", { p_date_from: from, p_date_to: to })
      ]);

      const totalAmount = byStore.reduce((s, r) => s + (r.gross_amount || 0), 0);
      const totalOrders = byStore.reduce((s, r) => s + (r.order_count || 0), 0);

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
        data: { labels: byStore.map(r => r.store_name), datasets: [{ label: "매출", data: byStore.map(r => r.gross_amount), backgroundColor: "#7F77DD" }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: (v) => Math.round(v / 10000) + "만" } } } }
      });

      const grouped = {};
      byLine.forEach(r => { (grouped[r.store_name] = grouped[r.store_name] || []).push(r); });

      document.getElementById("db_lineSection").innerHTML = Object.keys(grouped).map(storeName => `
        <div class="card">
          <div style="font-weight:700;margin-bottom:8px">${storeName}</div>
          ${grouped[storeName].map(r => `
            <div class="row" style="justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #f0f0f0">
              <span>${r.category}${r.line && r.line !== '-' ? ' · ' + r.line : ''}</span>
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
