const HourlyStatsModule = (() => {
  function render() {
    const el = document.getElementById("panel-hourly-stats");
    const today = new Date().toISOString().slice(0, 10);
    el.innerHTML = `
      <h2 class="pageTitle">시간대별 매출 / 방문객 분석</h2>
      <div class="card" style="margin-bottom:12px">
        <div class="row" style="flex-wrap:wrap">
          <select id="hs_store" style="flex:1"><option value="">매장 선택</option></select>
          <input id="hs_from" type="date" value="${today}" />
          <span class="muted">~</span>
          <input id="hs_to" type="date" value="${today}" />
          <button id="hs_loadBtn">조회</button>
        </div>
      </div>
      <div class="card" id="hs_chartBox" style="margin-bottom:12px"></div>
      <div class="card" id="hs_footerBox"></div>
      <div class="muted" id="hs_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
  }

  function bind() {
    document.getElementById("hs_loadBtn").addEventListener("click", loadStats);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name&order=name");
      document.getElementById("hs_store").innerHTML = `<option value="">매장 선택</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
  }

  function nextDateStr(dateStr) {
    return new Date(new Date(dateStr + "T00:00:00").getTime() + 86400000).toISOString().slice(0, 10);
  }

  function dayCount(from, to) {
    const ms = new Date(to + "T00:00:00").getTime() - new Date(from + "T00:00:00").getTime();
    return Math.max(1, Math.round(ms / 86400000) + 1);
  }

  async function loadStats() {
    const statusEl = document.getElementById("hs_status");
    const storeId = document.getElementById("hs_store").value;
    const from = document.getElementById("hs_from").value;
    const to = document.getElementById("hs_to").value;
    if (!storeId || !from || !to) { statusEl.textContent = "매장과 날짜를 선택해주세요."; return; }
    statusEl.textContent = "집계 중...";
    try {
      const orders = await sbGet(
        "orders?select=order_datetime,total_amount&tenant_id=eq." + TENANT_ID + "&store_id=eq." + storeId +
        "&order_datetime=gte." + from + "T00:00:00" +
        "&order_datetime=lt." + nextDateStr(to) + "T00:00:00"
      );
      const hourMap = {};
      let totalAmount = 0, totalCount = 0;
      orders.forEach(o => {
        const h = new Date(o.order_datetime).getHours();
        if (!hourMap[h]) hourMap[h] = { amount: 0, count: 0 };
        hourMap[h].amount += o.total_amount || 0;
        hourMap[h].count += 1;
        totalAmount += o.total_amount || 0;
        totalCount += 1;
      });

      const days = dayCount(from, to);
      const isRange = days > 1;
      const hours = Object.keys(hourMap).map(h => parseInt(h, 10)).sort((a, b) => a - b);
      const displayHours = hours.map(h => ({
        hour: h,
        amount: isRange ? hourMap[h].amount / days : hourMap[h].amount,
        count: isRange ? hourMap[h].count / days : hourMap[h].count
      }));

      renderChart(displayHours, isRange);
      renderFooter(displayHours, totalAmount, totalCount, isRange);
      statusEl.textContent = isRange ? `${days}일 평균으로 표시 중` : "집계 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function renderChart(displayHours, isRange) {
    const box = document.getElementById("hs_chartBox");
    if (!displayHours.length) { box.innerHTML = `<div class="muted">해당 기간의 주문 내역이 없습니다.</div>`; return; }
    const maxAmount = Math.max(...displayHours.map(h => h.amount));
    const peakHour = displayHours.reduce((best, h) => h.amount > best.amount ? h : best, displayHours[0]).hour;
    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:10px">📊 시간대별 매출${isRange ? " (일평균)" : ""}</div>
      ${displayHours.map(h => {
        const pct = maxAmount ? Math.round((h.amount / maxAmount) * 100) : 0;
        const isPeak = h.hour === peakHour;
        return `
          <div class="row" style="align-items:center;gap:8px;margin-bottom:5px">
            <span style="width:34px" class="muted">${h.hour}시</span>
            <div style="flex:1;background:#f0ede3;border-radius:4px;height:18px;overflow:hidden">
              <div style="height:100%;border-radius:4px;width:${pct}%;background:${isPeak ? "var(--amber)" : "var(--ink)"}"></div>
            </div>
            <span style="min-width:90px;text-align:right">${fmtWon(Math.round(h.amount))}</span>
            <span class="muted" style="min-width:55px;text-align:right">(${(isRange ? h.count.toFixed(1) : h.count)}건)</span>
            ${isPeak ? `<span style="color:var(--amber-deep);font-weight:700;white-space:nowrap">← 피크</span>` : ""}
          </div>
        `;
      }).join("")}
    `;
  }

  function renderFooter(displayHours, totalAmount, totalCount, isRange) {
    const box = document.getElementById("hs_footerBox");
    if (!displayHours.length) { box.innerHTML = ""; return; }
    const peak = displayHours.reduce((best, h) => h.amount > best.amount ? h : best, displayHours[0]);
    const avgOrderValue = totalCount ? Math.round(totalAmount / totalCount) : 0;
    const totalVisits = Math.round(displayHours.reduce((s, h) => s + h.count, 0));
    box.innerHTML = `
      <div class="row" style="justify-content:space-between;padding:4px 0"><span>🏆 피크타임</span><span style="font-weight:700">${peak.hour}시 (${fmtWon(Math.round(peak.amount))} / ${(isRange ? peak.count.toFixed(1) : peak.count)}건)</span></div>
      <div class="row" style="justify-content:space-between;padding:4px 0"><span>📊 평균 객단가</span><span style="font-weight:700">${fmtWon(avgOrderValue)}</span></div>
      <div class="row" style="justify-content:space-between;padding:4px 0"><span>👥 총 방문${isRange ? " (일평균)" : ""}</span><span style="font-weight:700">${totalVisits}명</span></div>
    `;
  }

  return { render };
})();
