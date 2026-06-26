const StocktakingModule = (() => {
  const CATEGORY_ORDER = ["일회용", "기성액상", "모드액상", "파츠", "디바이스", "기타소모품"];

  let tenantId = null;
  let storeId = null;
  let staffName = "";
  let auditDate = "";
  let stockItems = [];

  function render() {
    const el = document.getElementById("panel-stocktaking");
    el.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <select id="st_store" style="flex:1"><option value="">매장 선택</option></select>
          <input id="st_staff" type="text" placeholder="담당 직원" style="flex:1" />
          <input id="st_date" type="date" style="flex:1" />
        </div>
        <button id="st_startBtn" style="width:100%">실사 시작</button>
      </div>

      <div id="st_itemsSection" style="display:none">
        <div class="card">
          <div class="row" style="justify-content:space-between;margin-bottom:8px">
            <span class="muted">엑셀(CSV) 업로드 — 품목코드,실사수량</span>
            <input id="st_csvUpload" type="file" accept=".csv" />
          </div>
        </div>
        <div id="st_groupedList"></div>
        <div class="row" style="margin-bottom:12px">
          <button id="st_diffBtn" class="secondary" style="flex:1">차이 확인</button>
          <button id="st_confirmBtn" style="flex:1">실사 확정</button>
        </div>
        <div id="st_diffBox"></div>
        <div id="st_reportBox"></div>
      </div>
      <div class="muted" id="st_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
    document.getElementById("st_date").value = new Date().toISOString().slice(0, 10);
  }

  function bind() {
    document.getElementById("st_startBtn").addEventListener("click", startCount);
    document.getElementById("st_csvUpload").addEventListener("change", handleCSVUpload);
    document.getElementById("st_diffBtn").addEventListener("click", showDiff);
    document.getElementById("st_confirmBtn").addEventListener("click", confirmCount);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name,tenant_id&order=name");
      tenantId = data[0]?.tenant_id;
      document.getElementById("st_store").innerHTML = `<option value="">매장 선택</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
      applyDefaultStore(document.getElementById("st_store"));
    } catch (err) {}
  }

  async function startCount() {
    const statusEl = document.getElementById("st_status");
    storeId = document.getElementById("st_store").value;
    staffName = document.getElementById("st_staff").value.trim();
    auditDate = document.getElementById("st_date").value;
    if (!storeId) { statusEl.textContent = "매장을 선택해주세요."; return; }
    if (!staffName) { statusEl.textContent = "담당 직원을 입력해주세요."; return; }
    statusEl.textContent = "품목/재고 불러오는 중...";
    try {
      const [stockData, products] = await Promise.all([
        sbRpc("get_product_stock_analysis", { p_store_id: storeId }),
        sbGet("products?select=product_id,code&order=name")
      ]);
      const codeMap = {};
      products.forEach(p => { codeMap[p.product_id] = p.code; });
      stockItems = stockData.map(r => ({
        product_id: r.product_id,
        code: codeMap[r.product_id] || "-",
        name: r.name,
        category: CATEGORY_ORDER.includes(r.category) ? r.category : "기타소모품",
        system_qty: r.qty_on_hand,
        actual_qty: null
      }));
      document.getElementById("st_itemsSection").style.display = "block";
      document.getElementById("st_diffBox").innerHTML = "";
      document.getElementById("st_reportBox").innerHTML = "";
      renderGroupedList();
      statusEl.textContent = stockItems.length + "개 품목 로드됨 — 실사수량을 입력해주세요.";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function diffBadge(item) {
    if (item.actual_qty === null || item.actual_qty === undefined || item.actual_qty === "") return "";
    const diff = item.actual_qty - item.system_qty;
    if (diff === 0) return `<span class="muted">±0</span>`;
    const color = diff < 0 ? "var(--bad)" : "var(--good)";
    return `<span style="color:${color};font-weight:700">${diff > 0 ? "+" : ""}${diff}</span>`;
  }

  function renderGroupedList() {
    const box = document.getElementById("st_groupedList");
    const groups = {};
    stockItems.forEach(it => { (groups[it.category] = groups[it.category] || []).push(it); });
    const orderedCategories = CATEGORY_ORDER.filter(c => groups[c]);

    box.innerHTML = orderedCategories.map(cat => `
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">${cat} (${groups[cat].length})</div>
        <table>
          <tr><th>코드</th><th>품목명</th><th style="text-align:right">시스템재고</th><th style="text-align:right">실사수량</th><th style="text-align:right">차이</th></tr>
          ${groups[cat].map(it => `
            <tr data-id="${it.product_id}">
              <td class="muted">${it.code}</td>
              <td>${it.name}</td>
              <td style="text-align:right">${it.system_qty}</td>
              <td style="text-align:right"><input type="number" class="st-actualInput" data-id="${it.product_id}" value="${it.actual_qty === null ? "" : it.actual_qty}" style="width:80px;text-align:right" /></td>
              <td style="text-align:right" class="st-diffCell" data-id="${it.product_id}">${diffBadge(it)}</td>
            </tr>
          `).join("")}
        </table>
      </div>
    `).join("");

    box.querySelectorAll(".st-actualInput").forEach(inp => {
      inp.addEventListener("input", () => {
        const item = stockItems.find(i => i.product_id === inp.dataset.id);
        if (!item) return;
        item.actual_qty = inp.value === "" ? null : parseInt(inp.value);
        const diffCell = box.querySelector(`.st-diffCell[data-id="${inp.dataset.id}"]`);
        if (diffCell) diffCell.innerHTML = diffBadge(item);
      });
    });
  }

  function handleCSVUpload(e) {
    const file = e.target.files[0];
    const statusEl = document.getElementById("st_status");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const lines = reader.result.split(/\r?\n/).filter(l => l.trim());
        let applied = 0;
        lines.forEach(line => {
          const [code, qtyRaw] = line.split(",").map(s => s.trim());
          const qty = parseInt(qtyRaw);
          if (!code || isNaN(qty)) return;
          const item = stockItems.find(i => i.code === code);
          if (item) { item.actual_qty = qty; applied++; }
        });
        renderGroupedList();
        statusEl.textContent = applied + "개 품목에 CSV 수량 적용됨";
      } catch (err) { statusEl.textContent = "CSV 처리 오류: " + err.message; }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function showDiff() {
    const box = document.getElementById("st_diffBox");
    const diffItems = stockItems.filter(it => it.actual_qty !== null && it.actual_qty !== it.system_qty);
    const shortage = diffItems.filter(it => it.actual_qty < it.system_qty).length;
    const excess = diffItems.filter(it => it.actual_qty > it.system_qty).length;

    box.innerHTML = `
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">차이 요약 — 총 ${diffItems.length}개 항목 차이 / 부족 ${shortage}개 / 초과 ${excess}개</div>
        ${diffItems.length ? `
          <table>
            <tr><th>품목명</th><th style="text-align:right">시스템재고</th><th style="text-align:right">실사수량</th><th style="text-align:right">차이</th></tr>
            ${diffItems.map(it => `
              <tr style="background:${it.actual_qty < it.system_qty ? "#fdecea" : "#e9f7ef"}">
                <td>${it.name}</td>
                <td style="text-align:right">${it.system_qty}</td>
                <td style="text-align:right">${it.actual_qty}</td>
                <td style="text-align:right">${diffBadge(it)}</td>
              </tr>
            `).join("")}
          </table>
        ` : `<div class="muted">차이가 있는 항목이 없습니다.</div>`}
      </div>
    `;
  }

  async function confirmCount() {
    const statusEl = document.getElementById("st_status");
    const countedItems = stockItems.filter(it => it.actual_qty !== null && it.actual_qty !== undefined);
    if (!countedItems.length) { statusEl.textContent = "실사수량을 입력한 품목이 없습니다."; return; }
    if (!confirm(countedItems.length + "개 품목의 실사 결과를 확정하시겠습니까?")) return;
    statusEl.textContent = "확정 중...";
    try {
      const items = countedItems.map(it => ({ product_id: it.product_id, qty_after: it.actual_qty }));
      await sbRpc("register_adjustment", {
        p_tenant_id: tenantId, p_store_id: storeId,
        p_reason: "월간실사-" + staffName, p_items: items
      });
      renderReport(countedItems);
      statusEl.textContent = "실사 확정 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function renderReport(countedItems) {
    const box = document.getElementById("st_reportBox");
    const diffItems = countedItems.filter(it => it.actual_qty !== it.system_qty);
    box.innerHTML = `
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">실사 확정 리포트 (${auditDate} · ${staffName})</div>
        ${diffItems.length ? `
          <table>
            <tr><th>품목명</th><th style="text-align:right">실사 전</th><th style="text-align:right">실사 후</th><th style="text-align:right">차이</th></tr>
            ${diffItems.map(it => `
              <tr>
                <td>${it.name}</td>
                <td style="text-align:right">${it.system_qty}</td>
                <td style="text-align:right">${it.actual_qty}</td>
                <td style="text-align:right">${diffBadge(it)}</td>
              </tr>
            `).join("")}
          </table>
        ` : `<div class="muted">차이가 있는 항목이 없습니다.</div>`}
      </div>
    `;
  }

  return { render };
})();
