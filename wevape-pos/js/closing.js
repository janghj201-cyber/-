const ClosingModule = (() => {
  let tenantId = null;
  let expectedCashAmount = 0;

  function render() {
    const el = document.getElementById("panel-closing");
    el.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <select id="cl_store" style="flex:1"><option value="">매장 선택</option></select>
          <input id="cl_date" type="date" style="flex:1" />
        </div>
        <button id="cl_loadBtn" style="width:100%">매출 요약 불러오기</button>
      </div>
      <div id="cl_summaryBox" class="card" style="display:none"></div>
      <div class="row" style="margin-bottom:8px;justify-content:space-between">
        <span>실제 센 현금</span>
        <input id="cl_actualCash" type="number" placeholder="0" style="width:140px" />
      </div>
      <input id="cl_note" type="text" placeholder="메모 (선택)" style="width:100%;margin-bottom:8px" />
      <button id="cl_submitBtn" style="width:100%">마감 등록</button>
      <div class="muted" id="cl_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
    document.getElementById("cl_date").value = new Date().toISOString().slice(0, 10);
  }

  function bind() {
    document.getElementById("cl_loadBtn").addEventListener("click", loadSummary);
    document.getElementById("cl_submitBtn").addEventListener("click", submitClosing);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name,tenant_id&order=name");
      tenantId = data[0]?.tenant_id;
      document.getElementById("cl_store").innerHTML = `<option value="">매장 선택</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
  }

  async function loadSummary() {
    const storeId = document.getElementById("cl_store").value;
    const date = document.getElementById("cl_date").value;
    const box = document.getElementById("cl_summaryBox");
    const statusEl = document.getElementById("cl_status");
    if (!storeId || !date) { statusEl.textContent = "매장과 날짜를 선택해주세요."; return; }
    statusEl.textContent = "불러오는 중...";
    try {
      const data = await sbRpc("get_daily_sales_summary", { p_store_id: storeId, p_date: date });
      expectedCashAmount = 0;
      box.style.display = "block";
      box.innerHTML = data.length ? data.map(r => {
        if (r.payment_method === "현금") expectedCashAmount = r.net_sales;
        return `<div class="row" style="justify-content:space-between"><span>${r.payment_method}</span><span>${fmtWon(r.net_sales)} (총 ${fmtWon(r.gross_sales)}, 환불 ${fmtWon(r.refund_amount)})</span></div>`;
      }).join("") : `<div class="muted">해당 날짜 매출 없음</div>`;
      statusEl.textContent = "현금 예상매출: " + fmtWon(expectedCashAmount);
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function submitClosing() {
    const statusEl = document.getElementById("cl_status");
    const storeId = document.getElementById("cl_store").value;
    const date = document.getElementById("cl_date").value;
    const actual = parseFloat(document.getElementById("cl_actualCash").value);
    if (!storeId || !date) { statusEl.textContent = "매장과 날짜를 선택해주세요."; return; }
    if (isNaN(actual)) { statusEl.textContent = "실제 현금을 입력해주세요."; return; }
    statusEl.textContent = "등록 중...";
    try {
      const result = await sbPost("daily_closings", {
        tenant_id: tenantId, store_id: storeId, closing_date: date,
        expected_cash: expectedCashAmount, actual_cash: actual, note: document.getElementById("cl_note").value || null
      }, { "Prefer": "resolution=merge-duplicates,return=representation" });
      const variance = result[0].variance;
      statusEl.textContent = "마감 등록 완료 — 차액: " + (variance >= 0 ? "+" : "") + fmtWon(variance);
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  return { render };
})();
