const ReorderReportModule = (() => {
  let lastUrgent = [];
  let lastRecommended = [];
  let lastSufficientCount = 0;

  function render() {
    const el = document.getElementById("panel-reorder-report");
    el.innerHTML = `
      <h2 class="pageTitle">발주 알림 리포트</h2>
      <div class="card" style="margin-bottom:12px">
        <div class="row">
          <select id="rr_store" style="flex:1"><option value="">매장 선택</option></select>
          <button id="rr_loadBtn">조회</button>
        </div>
        <div class="muted" id="rr_updatedAt" style="margin-top:6px"></div>
      </div>
      <div class="card" id="rr_urgentBox" style="margin-bottom:12px"></div>
      <div class="card" id="rr_recommendedBox" style="margin-bottom:12px"></div>
      <div class="card" id="rr_sufficientBox" style="margin-bottom:12px"></div>
      <button type="button" id="rr_copyBtn" class="secondary" style="width:100%">발주 목록 복사</button>
      <div class="muted" id="rr_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
  }

  function bind() {
    document.getElementById("rr_loadBtn").addEventListener("click", loadReport);
    document.getElementById("rr_copyBtn").addEventListener("click", copyReorderList);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name&order=name");
      document.getElementById("rr_store").innerHTML = `<option value="">매장 선택</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
  }

  function fmtDate(d) { return d.toISOString().slice(0, 10); }

  async function loadReport() {
    const statusEl = document.getElementById("rr_status");
    const storeId = document.getElementById("rr_store").value;
    if (!storeId) { statusEl.textContent = "매장을 선택해주세요."; return; }
    statusEl.textContent = "분석 중...";
    try {
      const stockData = await sbRpc("get_product_stock_analysis", { p_store_id: storeId });

      const since = new Date(Date.now() - 6 * 86400000);
      const items = await sbGet(
        "order_items?select=qty,product_id,orders!inner(order_datetime,store_id)&orders.store_id=eq." + storeId +
        "&orders.order_datetime=gte." + fmtDate(since) + "T00:00:00"
      );
      const qtyMap = {};
      items.forEach(it => { qtyMap[it.product_id] = (qtyMap[it.product_id] || 0) + (it.qty || 0); });

      // 최근 7일치 데이터가 없는 신규 매장은 영업 시작일 이후 실제 경과일로 나눈다.
      let divisor = 7;
      const firstOrderRows = await sbGet("orders?select=order_datetime&store_id=eq." + storeId + "&order=order_datetime.asc&limit=1");
      if (firstOrderRows.length) {
        const daysSince = Math.floor((Date.now() - new Date(firstOrderRows[0].order_datetime).getTime()) / 86400000) + 1;
        divisor = Math.max(1, Math.min(7, daysSince));
      }

      const rows = stockData.filter(p => p.current_qty > 0).map(p => {
        const qty7 = qtyMap[p.product_id] || 0;
        const dailyAvg = qty7 / divisor;
        const daysLeft = dailyAvg > 0 ? p.current_qty / dailyAvg : Infinity;
        const recommendedQty = dailyAvg > 0 ? Math.max(10, Math.ceil((dailyAvg * 14) / 10) * 10) : 0;
        return { name: p.name, stock: p.current_qty, dailyAvg, daysLeft, recommendedQty };
      });

      lastUrgent = rows.filter(r => r.daysLeft <= 3).sort((a, b) => a.daysLeft - b.daysLeft);
      lastRecommended = rows.filter(r => r.daysLeft > 3 && r.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft);
      const sufficient = rows.filter(r => r.daysLeft > 7);
      lastSufficientCount = sufficient.length;

      renderGroups();
      document.getElementById("rr_updatedAt").textContent = "마지막 업데이트: " + new Date().toLocaleString("ko-KR");
      statusEl.textContent = "분석 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function renderRowTable(rows) {
    return `
      <table>
        <tr><th>상품명</th><th style="text-align:right">현재재고</th><th style="text-align:right">일평균판매</th><th style="text-align:right">소진예상일</th><th style="text-align:right">권장발주량</th></tr>
        ${rows.map(r => `
          <tr>
            <td>${r.name}</td>
            <td style="text-align:right">${r.stock}개</td>
            <td style="text-align:right">${r.dailyAvg.toFixed(1)}개</td>
            <td style="text-align:right">D+${Math.max(0, Math.floor(r.daysLeft))}일</td>
            <td style="text-align:right">${r.recommendedQty}개</td>
          </tr>
        `).join("")}
      </table>
    `;
  }

  function renderGroups() {
    document.getElementById("rr_urgentBox").innerHTML = `
      <div style="font-weight:700;color:var(--bad);margin-bottom:8px">🚨 긴급 발주 필요 (3일 이내 소진 예상)</div>
      ${lastUrgent.length ? renderRowTable(lastUrgent) : `<div class="muted">해당 없음</div>`}
    `;
    document.getElementById("rr_recommendedBox").innerHTML = `
      <div style="font-weight:700;color:#a87b00;margin-bottom:8px">⚠️ 발주 권장 (7일 이내 소진 예상)</div>
      ${lastRecommended.length ? renderRowTable(lastRecommended) : `<div class="muted">해당 없음</div>`}
    `;
    document.getElementById("rr_sufficientBox").innerHTML = `
      <div style="font-weight:700;color:var(--good);margin-bottom:8px">✅ 재고 충분 (7일 이상)</div>
      <div class="muted">총 ${lastSufficientCount}개 상품 재고 충분</div>
    `;
  }

  async function copyReorderList() {
    const statusEl = document.getElementById("rr_status");
    if (!lastUrgent.length && !lastRecommended.length) { statusEl.textContent = "발주 목록이 없습니다."; return; }
    const storeLabel = document.querySelector("#rr_store option:checked")?.textContent || "매장";
    const today = new Date().toISOString().slice(0, 10);
    const lines = [`[${storeLabel} 발주 요청] ${today}`, ""];
    if (lastUrgent.length) {
      lines.push("🚨 긴급");
      lastUrgent.forEach(r => lines.push(`- ${r.name} ${r.recommendedQty}개`));
      lines.push("");
    }
    if (lastRecommended.length) {
      lines.push("⚠️ 권장");
      lastRecommended.forEach(r => lines.push(`- ${r.name} ${r.recommendedQty}개`));
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n").trim());
      statusEl.textContent = "발주 목록이 클립보드에 복사되었습니다.";
    } catch (err) { statusEl.textContent = "복사 실패: " + err.message; }
  }

  return { render };
})();
