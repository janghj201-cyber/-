const SalesSummaryModule = (() => {
  // 일회용(category) 내 line → 세부 분류 매핑. 비일회용은 products.category 값을 그대로 사용.
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

  let stores = [];
  let collapsedMap = {};

  function classify(p) {
    if (!p) return "기타소모품";
    if (p.category === "일회용") return DISPOSABLE_LINE_MAP[p.line] || "기타 일회용";
    return p.category || "기타소모품";
  }

  function render() {
    const el = document.getElementById("panel-sales-summary");
    const today = new Date().toISOString().slice(0, 10);
    el.innerHTML = `
      <h2 class="pageTitle">분류별 매출집계</h2>
      <div class="card" style="margin-bottom:12px">
        <div class="row" style="flex-wrap:wrap">
          <select id="ss_store" style="flex:1"><option value="">전체 매장</option></select>
          <input id="ss_from" type="date" value="${today}" />
          <span class="muted">~</span>
          <input id="ss_to" type="date" value="${today}" />
          <button id="ss_loadBtn">조회</button>
        </div>
      </div>
      <div class="row" style="margin-bottom:8px;gap:8px">
        <button type="button" id="ss_expandAll" class="secondary">전체 펼치기</button>
        <button type="button" id="ss_collapseAll" class="secondary">전체 접기</button>
      </div>
      <div class="card" id="ss_totalBox" style="margin-bottom:12px"></div>
      <div id="ss_categoryBox"></div>
      <div class="muted" id="ss_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
  }

  function bind() {
    document.getElementById("ss_loadBtn").addEventListener("click", loadSummary);
    document.getElementById("ss_expandAll").addEventListener("click", () => setAllCollapsed(false));
    document.getElementById("ss_collapseAll").addEventListener("click", () => setAllCollapsed(true));
  }

  async function loadStores() {
    try {
      stores = await sbGet("stores?select=store_id,name&order=name");
      document.getElementById("ss_store").innerHTML =
        `<option value="">전체 매장</option>` + stores.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
      applyDefaultStore(document.getElementById("ss_store"));
    } catch (err) {}
    await loadSummary();
  }

  function setAllCollapsed(collapsed) {
    Object.keys(collapsedMap).forEach(k => { collapsedMap[k] = collapsed; });
    renderCategories(lastResult);
  }

  let lastResult = null;

  async function loadSummary() {
    const statusEl = document.getElementById("ss_status");
    const storeId = document.getElementById("ss_store").value;
    const from = document.getElementById("ss_from").value;
    const to = document.getElementById("ss_to").value;
    if (!from || !to) { statusEl.textContent = "조회 기간을 선택해주세요."; return; }
    statusEl.textContent = "집계 중...";
    try {
      const fromIso = from + "T00:00:00";
      const toExclusive = new Date(new Date(to + "T00:00:00").getTime() + 86400000).toISOString().slice(0, 19);
      let path = "order_items?select=qty,unit_price,subtotal,orders!inner(order_datetime,store_id),products(name,category,line)" +
        "&orders.order_datetime=gte." + fromIso + "&orders.order_datetime=lt." + toExclusive;
      if (storeId) path += "&orders.store_id=eq." + storeId;
      const items = await sbGet(path);

      const categoryMap = {};
      let totalCount = 0, totalAmount = 0;
      items.forEach(it => {
        const p = it.products || {};
        const bucket = classify(p);
        const amt = it.subtotal != null ? it.subtotal : (it.unit_price || 0) * (it.qty || 0);
        if (!categoryMap[bucket]) categoryMap[bucket] = { count: 0, amount: 0, products: {} };
        categoryMap[bucket].count += 1;
        categoryMap[bucket].amount += amt;
        const pname = p.name || "기타";
        if (!categoryMap[bucket].products[pname]) categoryMap[bucket].products[pname] = { price: it.unit_price || 0, qty: 0, amount: 0 };
        categoryMap[bucket].products[pname].qty += (it.qty || 0);
        categoryMap[bucket].products[pname].amount += amt;
        totalCount += 1;
        totalAmount += amt;
      });

      lastResult = { categoryMap, totalCount, totalAmount };
      CATEGORY_ORDER.forEach(k => { if (!(k in collapsedMap)) collapsedMap[k] = true; });

      document.getElementById("ss_totalBox").innerHTML = `
        <div class="row" style="justify-content:space-between">
          <span style="font-weight:700">합계</span>
          <span style="font-weight:800;font-size:18px">${totalCount}건  ${fmtWon(totalAmount)}</span>
        </div>
      `;
      renderCategories(lastResult);
      statusEl.textContent = "집계 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function renderCategories(result) {
    const box = document.getElementById("ss_categoryBox");
    if (!result) { box.innerHTML = ""; return; }
    const { categoryMap } = result;
    box.innerHTML = CATEGORY_ORDER.filter(k => categoryMap[k]).map(key => {
      const c = categoryMap[key];
      const collapsed = collapsedMap[key];
      const productRows = Object.keys(c.products).map(name => {
        const p = c.products[name];
        return `
          <div class="row" style="justify-content:space-between;padding:3px 0 3px 18px">
            <span class="muted">${name}</span>
            <span class="muted">${fmtWon(p.price)}  ×${p.qty}  ${fmtWon(p.amount)}</span>
          </div>
        `;
      }).join("");
      return `
        <div class="card" style="margin-bottom:8px">
          <div class="row ss-catHeader" data-key="${key}" style="justify-content:space-between;cursor:pointer">
            <span style="font-weight:700">${collapsed ? "▶" : "▼"} [${key}]</span>
            <span style="font-weight:700">${c.count}건  ${fmtWon(c.amount)}</span>
          </div>
          <div class="ss-catBody" data-key="${key}" style="display:${collapsed ? "none" : "block"};margin-top:6px">
            ${productRows}
          </div>
        </div>
      `;
    }).join("") || `<div class="muted">집계된 매출이 없습니다.</div>`;

    box.querySelectorAll(".ss-catHeader").forEach(h => h.addEventListener("click", () => {
      const key = h.dataset.key;
      collapsedMap[key] = !collapsedMap[key];
      renderCategories(lastResult);
    }));
  }

  return { render };
})();
