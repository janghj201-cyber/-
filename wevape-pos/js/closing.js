const ClosingModule = (() => {
  const DENOMINATIONS = [
    { value: 50000, label: "5만원" },
    { value: 10000, label: "1만원" },
    { value: 5000, label: "5천원" },
    { value: 1000, label: "1천원" },
    { value: 500, label: "500원" },
    { value: 100, label: "100원" }
  ];

  let tenantId = null;
  let storeId = "";
  let closingDate = "";
  let openingCashBuffer = "";
  let openingCash = 0;
  let businessStarted = false;
  let businessStartAt = null;
  let movementType = "in";
  let movementAmountBuffer = "";
  let cashMovements = [];
  let summary = null;
  let actualCash = 0;
  let expectedCash = 0;

  function render() {
    const el = document.getElementById("panel-closing");
    el.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <select id="cl_store" style="flex:1"><option value="">매장 선택</option></select>
          <input id="cl_date" type="date" style="flex:1" />
        </div>
        <div id="cl_startSection">
          <div class="muted" style="margin-bottom:6px">영업 준비금 (시작 시재)</div>
          <div id="cl_openingDisplay" style="font-size:28px;font-weight:800;margin-bottom:10px">0원</div>
          <div id="cl_keypad" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
            ${["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "back"].map(k => `<button type="button" class="secondary cl-key" data-k="${k}" style="padding:14px;font-size:16px">${k === "back" ? "⌫" : k}</button>`).join("")}
          </div>
          <button id="cl_startBtn" style="width:100%;margin-top:10px">영업 시작</button>
        </div>
        <div id="cl_startedInfo" class="muted" style="display:none;margin-top:8px"></div>
      </div>

      <div id="cl_mainSections" style="display:none">
        <div class="card">
          <div style="font-weight:700;margin-bottom:8px">시재 입출금</div>
          <div class="row" style="margin-bottom:8px">
            <button type="button" id="cl_movIn" style="flex:1">입금</button>
            <button type="button" id="cl_movOut" class="secondary" style="flex:1">출금</button>
          </div>
          <div id="cl_movAmountDisplay" style="font-size:24px;font-weight:800;margin-bottom:8px">0원</div>
          <div id="cl_movKeypad" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px">
            ${["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "back"].map(k => `<button type="button" class="secondary cl-movKey" data-k="${k}" style="padding:14px;font-size:16px">${k === "back" ? "⌫" : k}</button>`).join("")}
          </div>
          <div class="row" style="margin-bottom:8px">
            <input id="cl_movReason" type="text" placeholder="사유" style="flex:1" />
            <button id="cl_movSubmit">등록</button>
          </div>
          <div id="cl_movList"></div>
          <div class="row" style="justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">
            <span class="muted">입금합계 / 출금합계</span>
            <span id="cl_movTotals" class="muted">0원 / 0원</span>
          </div>
        </div>

        <div class="card">
          <div class="row" style="justify-content:space-between;margin-bottom:8px">
            <div style="font-weight:700">마감 집계</div>
            <button id="cl_summaryBtn">매출 집계</button>
          </div>
          <div id="cl_summaryBox"></div>
        </div>

        <div class="card">
          <div style="font-weight:700;margin-bottom:8px">현금 시재 확인</div>
          <table>
            <tr><th>권종</th><th style="text-align:right">장수</th><th style="text-align:right">금액</th></tr>
            ${DENOMINATIONS.map(d => `
              <tr>
                <td>${d.label}</td>
                <td style="text-align:right"><input type="number" class="cl-denomInput" data-value="${d.value}" min="0" value="0" style="width:80px;text-align:right" /></td>
                <td style="text-align:right" class="cl-denomAmount" data-value="${d.value}">0원</td>
              </tr>
            `).join("")}
          </table>
          <div class="row" style="justify-content:space-between;margin-top:10px;font-size:18px;font-weight:800">
            <span>실제 현금 합계</span><span id="cl_actualCashTotal">0원</span>
          </div>
          <div class="row" style="justify-content:space-between;margin-top:6px">
            <span class="muted">예상 현금</span><span id="cl_expectedCash" class="muted">0원</span>
          </div>
          <div class="row" style="justify-content:space-between;margin-top:6px">
            <span>차액</span><span id="cl_variance" style="font-weight:700">0원</span>
          </div>
        </div>

        <input id="cl_note" type="text" placeholder="메모 (선택)" style="width:100%;margin-bottom:8px" />
        <button id="cl_confirmBtn" style="width:100%">마감 확정</button>
        <div id="cl_reportBox" style="margin-top:12px"></div>
      </div>
      <div class="muted" id="cl_status" style="margin-top:10px"></div>
    `;
    bind();
    loadStores();
    document.getElementById("cl_date").value = new Date().toISOString().slice(0, 10);
  }

  function bind() {
    document.getElementById("cl_store").addEventListener("change", checkStatus);
    document.getElementById("cl_date").addEventListener("change", checkStatus);
    document.querySelectorAll(".cl-key").forEach(b => b.addEventListener("click", () => onKeypadPress(b.dataset.k)));
    document.getElementById("cl_startBtn").addEventListener("click", startBusiness);
    document.getElementById("cl_movIn").addEventListener("click", () => selectMovementType("in"));
    document.getElementById("cl_movOut").addEventListener("click", () => selectMovementType("out"));
    document.querySelectorAll(".cl-movKey").forEach(b => b.addEventListener("click", () => onMovKeypadPress(b.dataset.k)));
    document.getElementById("cl_movSubmit").addEventListener("click", submitMovement);
    document.getElementById("cl_summaryBtn").addEventListener("click", loadSummary);
    document.querySelectorAll(".cl-denomInput").forEach(inp => inp.addEventListener("input", recalcCash));
    document.getElementById("cl_confirmBtn").addEventListener("click", confirmClosing);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name,tenant_id&order=name");
      tenantId = data[0]?.tenant_id;
      document.getElementById("cl_store").innerHTML = `<option value="">매장 선택</option>` + data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
    } catch (err) {}
  }

  function onKeypadPress(key) {
    if (businessStarted) return;
    if (key === "back") openingCashBuffer = openingCashBuffer.slice(0, -1);
    else openingCashBuffer = (openingCashBuffer + key).slice(0, 9);
    document.getElementById("cl_openingDisplay").textContent = fmtWon(parseInt(openingCashBuffer || "0", 10));
  }

  function onMovKeypadPress(key) {
    if (key === "back") movementAmountBuffer = movementAmountBuffer.slice(0, -1);
    else movementAmountBuffer = (movementAmountBuffer + key).slice(0, 9);
    document.getElementById("cl_movAmountDisplay").textContent = fmtWon(parseInt(movementAmountBuffer || "0", 10));
  }

  async function checkStatus() {
    storeId = document.getElementById("cl_store").value;
    closingDate = document.getElementById("cl_date").value;
    const statusEl = document.getElementById("cl_status");
    businessStarted = false;
    summary = null;
    openingCashBuffer = "";
    document.getElementById("cl_openingDisplay").textContent = "0원";
    document.getElementById("cl_startSection").style.display = "block";
    document.getElementById("cl_startedInfo").style.display = "none";
    document.getElementById("cl_mainSections").style.display = "none";
    document.getElementById("cl_summaryBox").innerHTML = "";
    document.getElementById("cl_reportBox").innerHTML = "";
    if (!storeId || !closingDate) return;
    statusEl.textContent = "영업 상태 확인 중...";
    try {
      const rows = await sbGet("daily_closings?select=*&store_id=eq." + storeId + "&closing_date=eq." + closingDate);
      const row = rows[0];
      if (row && row.business_start) {
        businessStarted = true;
        businessStartAt = row.business_start;
        openingCash = row.opening_cash || 0;
        document.getElementById("cl_startSection").style.display = "none";
        const startedInfo = document.getElementById("cl_startedInfo");
        startedInfo.style.display = "block";
        startedInfo.textContent = "영업 시작됨: " + new Date(row.business_start).toLocaleString("ko-KR") + " · 준비금 " + fmtWon(openingCash);
        document.getElementById("cl_mainSections").style.display = "block";
        await loadMovements();
        statusEl.textContent = "";
      } else {
        statusEl.textContent = "영업 준비금을 입력하고 영업을 시작해주세요.";
      }
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function startBusiness() {
    const statusEl = document.getElementById("cl_status");
    if (!storeId || !closingDate) { statusEl.textContent = "매장과 날짜를 선택해주세요."; return; }
    const amount = parseInt(openingCashBuffer || "0", 10);
    if (!amount) { statusEl.textContent = "영업 준비금을 입력해주세요."; return; }
    statusEl.textContent = "영업 시작 처리 중...";
    try {
      businessStartAt = new Date().toISOString();
      await sbPost("daily_closings", {
        tenant_id: tenantId, store_id: storeId, closing_date: closingDate,
        opening_cash: amount, business_start: businessStartAt
      }, { "Prefer": "resolution=merge-duplicates,return=representation" });
      openingCash = amount;
      businessStarted = true;
      document.getElementById("cl_startSection").style.display = "none";
      const startedInfo = document.getElementById("cl_startedInfo");
      startedInfo.style.display = "block";
      startedInfo.textContent = "영업 시작됨: " + new Date(businessStartAt).toLocaleString("ko-KR") + " · 준비금 " + fmtWon(openingCash);
      document.getElementById("cl_mainSections").style.display = "block";
      statusEl.textContent = "영업 시작 완료";
      await loadMovements();
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function selectMovementType(type) {
    movementType = type;
    document.getElementById("cl_movIn").className = type === "in" ? "" : "secondary";
    document.getElementById("cl_movOut").className = type === "out" ? "" : "secondary";
  }

  async function submitMovement() {
    const statusEl = document.getElementById("cl_status");
    const amount = parseInt(movementAmountBuffer || "0", 10);
    const reason = document.getElementById("cl_movReason").value.trim();
    if (!businessStarted) { statusEl.textContent = "먼저 영업을 시작해주세요."; return; }
    if (!amount) { statusEl.textContent = "금액을 입력해주세요."; return; }
    statusEl.textContent = "등록 중...";
    try {
      await sbPost("cash_movements", {
        tenant_id: tenantId, store_id: storeId, movement_date: closingDate,
        movement_type: movementType, amount, reason: reason || null
      }, { "Prefer": "return=representation" });
      movementAmountBuffer = "";
      document.getElementById("cl_movAmountDisplay").textContent = "0원";
      document.getElementById("cl_movReason").value = "";
      statusEl.textContent = "등록 완료";
      await loadMovements();
      recalcCash();
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function loadMovements() {
    try {
      cashMovements = await sbGet("cash_movements?select=*&store_id=eq." + storeId + "&movement_date=eq." + closingDate + "&order=created_at.desc");
    } catch (err) { cashMovements = []; }
    renderMovements();
  }

  function renderMovements() {
    const list = document.getElementById("cl_movList");
    list.innerHTML = cashMovements.map(m => `
      <div class="row" style="justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--line)">
        <span>${m.movement_type === "in" ? "입금" : "출금"} · ${m.reason || "-"}</span>
        <span style="font-weight:700;${m.movement_type === "out" ? "color:var(--bad)" : "color:var(--good)"}">${m.movement_type === "out" ? "-" : "+"}${fmtWon(m.amount)}</span>
      </div>
    `).join("") || `<div class="muted">입출금 내역이 없습니다.</div>`;
    document.getElementById("cl_movTotals").textContent = fmtWon(movementsTotalIn()) + " / " + fmtWon(movementsTotalOut());
  }

  function movementsTotalIn() {
    return cashMovements.filter(m => m.movement_type === "in").reduce((s, m) => s + (m.amount || 0), 0);
  }
  function movementsTotalOut() {
    return cashMovements.filter(m => m.movement_type === "out").reduce((s, m) => s + (m.amount || 0), 0);
  }
  function movementsNet() {
    return movementsTotalIn() - movementsTotalOut();
  }

  async function loadSummary() {
    const statusEl = document.getElementById("cl_status");
    if (!businessStarted) { statusEl.textContent = "먼저 영업을 시작해주세요."; return; }
    statusEl.textContent = "집계 중...";
    try {
      const data = await sbRpc("get_daily_closing_summary", { p_store_id: storeId, p_date: closingDate });
      summary = Array.isArray(data) ? data[0] : data;
      renderSummary();
      recalcCash();
      statusEl.textContent = "집계 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function renderSummary() {
    const box = document.getElementById("cl_summaryBox");
    if (!summary) { box.innerHTML = ""; return; }
    const s = summary;
    box.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
        <div>
          <div class="muted">매출 총액</div>
          <div style="font-size:30px;font-weight:800;margin-bottom:10px">${fmtWon(s.total_sales)}</div>
          <div class="row" style="justify-content:space-between;padding:4px 0;border-top:1px solid var(--line)">
            <span class="muted">순매출액</span><span style="font-weight:700">${fmtWon(s.net_sales)}</span>
          </div>
          <div class="row" style="justify-content:space-between;padding:4px 0">
            <span class="muted">환불금액</span><span style="color:var(--bad)">-${fmtWon(s.refund_amount)} (${s.refund_count || 0}건)</span>
          </div>
        </div>
        <div>
          <table>
            <tr><td>현금</td><td style="text-align:right">${fmtWon(s.cash_sales)}</td><td style="text-align:right" class="muted">${s.cash_count || 0}건</td></tr>
            <tr><td>카드</td><td style="text-align:right">${fmtWon(s.card_sales)}</td><td style="text-align:right" class="muted">${s.card_count || 0}건</td></tr>
            <tr><td>이체</td><td style="text-align:right">${fmtWon(s.transfer_sales)}</td><td></td></tr>
            <tr><td>Alipay</td><td style="text-align:right">${fmtWon(s.alipay_sales)}</td><td></td></tr>
            <tr><td>기타</td><td style="text-align:right">${fmtWon(s.other_sales)}</td><td></td></tr>
          </table>
        </div>
      </div>
      <table style="margin-top:14px;border-top:1px solid var(--line);padding-top:8px">
        <tr><td>고객수</td><td style="text-align:right">${s.customer_count || 0}명</td></tr>
        <tr><td>객단가</td><td style="text-align:right">${fmtWon(s.avg_order_value)}</td></tr>
        <tr><td>총주문건수</td><td style="text-align:right">${s.order_count || 0}건</td></tr>
        <tr><td>영업준비금</td><td style="text-align:right">${fmtWon(openingCash)}</td></tr>
        <tr><td>시재입출금합계</td><td style="text-align:right">${fmtWon(movementsNet())}</td></tr>
      </table>
    `;
  }

  function recalcCash() {
    let total = 0;
    document.querySelectorAll(".cl-denomInput").forEach(inp => {
      const value = parseInt(inp.dataset.value, 10);
      const count = parseInt(inp.value, 10) || 0;
      const amount = value * count;
      total += amount;
      const amtCell = document.querySelector('.cl-denomAmount[data-value="' + value + '"]');
      if (amtCell) amtCell.textContent = fmtWon(amount);
    });
    actualCash = total;
    document.getElementById("cl_actualCashTotal").textContent = fmtWon(total);

    const cashSales = summary ? (summary.cash_sales || 0) : 0;
    expectedCash = openingCash + cashSales + movementsNet();
    document.getElementById("cl_expectedCash").textContent = fmtWon(expectedCash);

    const variance = total - expectedCash;
    const varEl = document.getElementById("cl_variance");
    varEl.textContent = (variance >= 0 ? "+" : "") + fmtWon(variance);
    varEl.style.color = variance === 0 ? "" : (variance > 0 ? "var(--good)" : "var(--bad)");
  }

  async function confirmClosing() {
    const statusEl = document.getElementById("cl_status");
    if (!businessStarted) { statusEl.textContent = "먼저 영업을 시작해주세요."; return; }
    if (!summary) { statusEl.textContent = "먼저 매출 집계를 실행해주세요."; return; }
    recalcCash();
    const variance = actualCash - expectedCash;
    if (!confirm("마감을 확정하시겠습니까?")) return;
    statusEl.textContent = "마감 확정 중...";
    try {
      const payload = {
        tenant_id: tenantId, store_id: storeId, closing_date: closingDate,
        opening_cash: openingCash, business_start: businessStartAt, business_end: new Date().toISOString(),
        total_sales: summary.total_sales || 0,
        cash_sales: summary.cash_sales || 0, cash_count: summary.cash_count || 0,
        card_sales: summary.card_sales || 0, card_count: summary.card_count || 0,
        transfer_sales: summary.transfer_sales || 0,
        alipay_sales: summary.alipay_sales || 0,
        other_sales: summary.other_sales || 0,
        order_count: summary.order_count || 0,
        refund_count: summary.refund_count || 0, refund_amount: summary.refund_amount || 0,
        net_sales: summary.net_sales || 0, customer_count: summary.customer_count || 0,
        avg_order_value: summary.avg_order_value || 0,
        cash_movement_total: movementsNet(),
        expected_cash: expectedCash, actual_cash: actualCash, variance,
        note: document.getElementById("cl_note").value || null
      };
      const result = await sbPost("daily_closings", payload, { "Prefer": "resolution=merge-duplicates,return=representation" });
      renderReport(result && result[0] ? result[0] : payload, variance);
      statusEl.textContent = "마감 확정 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function renderReport(row, variance) {
    const box = document.getElementById("cl_reportBox");
    const color = variance === 0 ? "" : (variance > 0 ? "var(--good)" : "var(--bad)");
    box.innerHTML = `
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">마감 완료 리포트 (${closingDate})</div>
        <div class="row" style="justify-content:space-between"><span class="muted">매출 총액</span><span>${fmtWon(row.total_sales)}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted">순매출액</span><span>${fmtWon(row.net_sales)}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted">실제현금 / 예상현금</span><span>${fmtWon(row.actual_cash)} / ${fmtWon(row.expected_cash)}</span></div>
        <div class="row" style="justify-content:space-between"><span class="muted">차액</span><span style="font-weight:700;color:${color}">${variance >= 0 ? "+" : ""}${fmtWon(variance)}</span></div>
      </div>
    `;
  }

  return { render };
})();
