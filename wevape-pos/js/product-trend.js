const ProductTrendModule = (() => {
  // sales-summary.js / closing.js 와 동일한 분류 기준
  const DISPOSABLE_LINE_MAP = {
    "그래피티C": "그래피티C",
    "그래피티2": "그래피티2",
    "그래피티(시즌1)": "그래피티1",
    "PA15": "3% 한정판",
    "PA22": "3% 한정판",
    "와카": "기타 일회용",
    "네스티바": "기타 일회용",
    "네스티블랙유니콘": "기타 일회용",
    "네스티원": "기타 일회용",
    "버블몬비어": "기타 일회용",
    "월드다이나믹": "기타 일회용",
    "릴렉스프로2": "RELX",
    "릴렉스(기타)": "RELX",
    "릴렉스포켓": "RELX",
    "릴렉스디바": "RELX",
    "릴렉스더블": "RELX",
    "릴렉스후노즈": "RELX",
    "릴렉스인피니티2": "RELX",
    "릴렉스에센셜2": "RELX",
    "릴렉스아티잔": "RELX",
    "말론바": "RELX"
  };
  const CATEGORY_ORDER = ["그래피티C", "그래피티2", "그래피티1", "3% 한정판", "RELX", "기타 일회용", "기성액상", "모드액상", "파츠", "디바이스", "기타소모품"];

  function classify(p) {
    if (!p) return "기타소모품";
    if (p.category === "일회용") return DISPOSABLE_LINE_MAP[p.line] || "기타 일회용";
    return p.category || "기타소모품";
  }

  function render() {
    const el = document.getElementById("panel-product-trend");
    el.innerHTML = `
      <h2 class="pageTitle">상품별 판매 추이</h2>
      <div class="card" style="margin-bottom:12px">
        <div class="row" style="flex-wrap:wrap">
          <select id="pt_store" style="flex:1"><option value="">전체 매장</option></select>
          <select id="pt_period">
            <option value="today">오늘</option>
            <option value="week">이번주</option>
            <option value="month" selected>이번달</option>
            <option value="custom">직접입력</option>
          </select>
          <input id="pt_from" type="date" style="display:none" />
          <input id="pt_to" type="date" style="display:none" />
          <select id="pt_category"><option value="">전체 카테고리</option>${CATEGORY_ORDER.map(c => `<option value="${c}">${c}</option>`).join("")}</select>
          <button id="pt_loadBtn">조회</button>
        </div>
      </div>
      <div class="card" id="pt_topBox" style="margin-bottom:12px"></div>
      <div class="card" id="pt_deadBox"></div>
      <div class="muted" id="pt_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
  }

  function bind() {
    document.getElementById("pt_loadBtn").addEventListener("click", loadTrend);
    document.getElementById("pt_period").addEventListener("change", (e) => {
      const isCustom = e.target.value === "custom";
      document.getElementById("pt_from").style.display = isCustom ? "inline-block" : "none";
      document.getElementById("pt_to").style.display = isCustom ? "inline-block" : "none";
    });
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name&order=name");
      document.getElementById("pt_store").innerHTML = `<option value="">전체 매장</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
    await loadTrend();
  }

  function fmtDate(d) { return d.toISOString().slice(0, 10); }

  function computeRange() {
    const period = document.getElementById("pt_period").value;
    const today = new Date();
    if (period === "today") { const s = fmtDate(today); return { from: s, to: s }; }
    if (period === "week") {
      const dow = (today.getDay() + 6) % 7; // 월요일=0
      const monday = new Date(today.getTime() - dow * 86400000);
      return { from: fmtDate(monday), to: fmtDate(today) };
    }
    if (period === "custom") {
      return { from: document.getElementById("pt_from").value, to: document.getElementById("pt_to").value };
    }
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: fmtDate(monthStart), to: fmtDate(today) };
  }

  function shiftOneMonthBack(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    d.setMonth(d.getMonth() - 1);
    return fmtDate(d);
  }

  function nextDateStr(dateStr) {
    return fmtDate(new Date(new Date(dateStr + "T00:00:00").getTime() + 86400000));
  }

  async function fetchPeriodItems(storeId, from, to) {
    let path = "order_items?select=qty,unit_price,subtotal,product_id,orders!inner(order_datetime,store_id),products(name,category,line)" +
      "&orders.order_datetime=gte." + from + "T00:00:00" +
      "&orders.order_datetime=lt." + nextDateStr(to) + "T00:00:00";
    if (storeId) path += "&orders.store_id=eq." + storeId;
    return sbGet(path);
  }

  async function loadTrend() {
    const statusEl = document.getElementById("pt_status");
    const storeId = document.getElementById("pt_store").value;
    const category = document.getElementById("pt_category").value;
    const { from, to } = computeRange();
    if (!from || !to) { statusEl.textContent = "기간을 선택해주세요."; return; }
    statusEl.textContent = "집계 중...";
    try {
      const prevFrom = shiftOneMonthBack(from);
      const prevTo = shiftOneMonthBack(to);
      const [curItems, prevItems] = await Promise.all([
        fetchPeriodItems(storeId, from, to),
        fetchPeriodItems(storeId, prevFrom, prevTo)
      ]);

      const curMap = {};
      const soldProductIds = new Set();
      curItems.forEach(it => {
        const p = it.products || {};
        if (category && classify(p) !== category) return;
        const id = it.product_id;
        if (!curMap[id]) curMap[id] = { name: p.name || "?", qty: 0, amount: 0 };
        curMap[id].qty += it.qty || 0;
        curMap[id].amount += it.subtotal != null ? it.subtotal : (it.unit_price || 0) * (it.qty || 0);
        soldProductIds.add(id);
      });

      const prevQtyMap = {};
      prevItems.forEach(it => {
        const p = it.products || {};
        if (category && classify(p) !== category) return;
        prevQtyMap[it.product_id] = (prevQtyMap[it.product_id] || 0) + (it.qty || 0);
      });

      const top10 = Object.keys(curMap)
        .map(id => ({ id, ...curMap[id], prevQty: prevQtyMap[id] || 0 }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10);

      renderTop10(top10);
      await renderDeadStock(storeId, category, soldProductIds);
      statusEl.textContent = "집계 완료 (" + from + " ~ " + to + ")";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function renderTop10(top10) {
    const box = document.getElementById("pt_topBox");
    box.innerHTML = `
      <div style="font-weight:700;margin-bottom:10px">🏆 TOP 10 판매 상품</div>
      <table>
        <tr><th>순위</th><th>상품명</th><th style="text-align:right">판매량</th><th style="text-align:right">매출액</th><th style="text-align:right">전월비</th></tr>
        ${top10.map((p, i) => {
          let momHtml;
          if (p.prevQty === 0) {
            momHtml = `<span class="muted">신규</span>`;
          } else {
            const pct = Math.round(((p.qty - p.prevQty) / p.prevQty) * 100);
            const up = pct >= 0;
            momHtml = `<span style="color:${up ? "var(--good)" : "var(--bad)"};font-weight:700">${up ? "▲" : "▼"}${Math.abs(pct)}%</span>`;
          }
          return `
            <tr>
              <td>${i + 1}</td>
              <td>${p.name}</td>
              <td style="text-align:right">${p.qty}개</td>
              <td style="text-align:right">${fmtWon(p.amount)}</td>
              <td style="text-align:right">${momHtml}</td>
            </tr>
          `;
        }).join("") || `<tr><td colspan="5" class="muted">판매 내역이 없습니다.</td></tr>`}
      </table>
    `;
  }

  async function renderDeadStock(storeId, category, soldProductIds) {
    const box = document.getElementById("pt_deadBox");
    try {
      let path = "inventory?select=product_id,qty,products(name,category,line)&qty=gt.0";
      if (storeId) path += "&store_id=eq." + storeId;
      const inv = await sbGet(path);
      const stockMap = {};
      inv.forEach(r => {
        const p = r.products || {};
        if (category && classify(p) !== category) return;
        if (!stockMap[r.product_id]) stockMap[r.product_id] = { name: p.name || "?", qty: 0 };
        stockMap[r.product_id].qty += r.qty || 0;
      });
      const dead = Object.keys(stockMap)
        .filter(id => stockMap[id].qty > 0 && !soldProductIds.has(id))
        .map(id => stockMap[id]);

      box.innerHTML = `
        <div style="font-weight:700;margin-bottom:10px">📉 판매 부진 상품 (재고 있으나 기간 내 0건)</div>
        ${dead.map(d => `<div class="row" style="justify-content:space-between;padding:3px 0"><span>${d.name}</span><span class="muted">재고 ${d.qty}개</span></div>`).join("") || `<div class="muted">해당 없음</div>`}
      `;
    } catch (err) { box.innerHTML = `<div class="muted">오류: ${err.message}</div>`; }
  }

  return { render };
})();
