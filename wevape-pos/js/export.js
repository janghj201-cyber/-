const ExportModule = (() => {

  function render() {
    const el = document.getElementById("panel-export");
    el.innerHTML = `
      <h2 class="pageTitle">데이터 백업 / 내보내기</h2>

      <div class="card" style="margin-bottom:12px">
        <div style="font-weight:700;margin-bottom:10px">필터</div>
        <div class="row" style="margin-bottom:8px">
          <input id="ex_from" type="date" style="flex:1" />
          <span class="muted" style="padding:0 6px;line-height:38px">~</span>
          <input id="ex_to" type="date" style="flex:1" />
        </div>
        <select id="ex_store" style="width:100%;margin-bottom:8px">
          <option value="">전체 매장</option>
        </select>
        <div class="muted" style="font-size:12px">기간은 매출·입고·마감에 적용 / 매장은 모든 내보내기에 적용됩니다.</div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div style="font-weight:700;margin-bottom:12px">내보내기</div>
        <div class="row" style="margin-bottom:8px">
          <button id="ex_orders"    style="flex:1">📋 매출 내역</button>
          <button id="ex_purchases" style="flex:1">📦 입고 내역</button>
        </div>
        <div class="row" style="margin-bottom:8px">
          <button id="ex_customers" style="flex:1">👥 고객 목록</button>
          <button id="ex_closings"  style="flex:1">🗓 마감 내역</button>
        </div>
        <div class="row">
          <button id="ex_inventory" style="flex:1">📊 재고 현황</button>
          <button id="ex_products"  style="flex:1">🏷 상품 목록</button>
        </div>
      </div>
      <div class="muted" id="ex_status" style="margin-top:10px;font-size:13px"></div>
    `;
    bind();
    loadStores();
    const today    = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    document.getElementById("ex_from").value = monthAgo;
    document.getElementById("ex_to").value   = today;
  }

  function bind() {
    document.getElementById("ex_orders")   .addEventListener("click", exportOrders);
    document.getElementById("ex_purchases").addEventListener("click", exportPurchases);
    document.getElementById("ex_customers").addEventListener("click", exportCustomers);
    document.getElementById("ex_closings") .addEventListener("click", exportClosings);
    document.getElementById("ex_inventory").addEventListener("click", exportInventory);
    document.getElementById("ex_products") .addEventListener("click", exportProducts);
  }

  async function loadStores() {
    try {
      const data = await sbGet("stores?select=store_id,name&order=name");
      document.getElementById("ex_store").innerHTML =
        `<option value="">전체 매장</option>` +
        data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
      applyDefaultStore(document.getElementById("ex_store"));
    } catch (err) {}
  }

  // ── SheetJS 헬퍼 ─────────────────────────────────────────────────────────────

  function makeSheet(headers, rows, colWidths) {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    if (colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }));
    return ws;
  }

  function saveXlsx(wb, filename) {
    XLSX.writeFile(wb, filename);
  }

  function setLoading(id, on) {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = on;
  }

  function getFilters() {
    return {
      storeId: document.getElementById("ex_store").value,
      from:    document.getElementById("ex_from").value,
      to:      document.getElementById("ex_to").value,
    };
  }

  function fmtDt(s) { return s ? new Date(s).toLocaleString("ko-KR") : ""; }
  function fmtD(s)  { return s ? String(s).slice(0, 10) : ""; }
  function n(v)     { return v == null ? 0 : Number(v); }

  // ── 매출 내역 (주문 요약 + 주문 상세 시트) ──────────────────────────────────

  async function exportOrders() {
    const statusEl        = document.getElementById("ex_status");
    const { storeId, from, to } = getFilters();
    if (!from || !to) { statusEl.textContent = "기간을 선택해주세요."; return; }
    setLoading("ex_orders", true);
    statusEl.textContent = "매출 데이터 조회 중...";
    try {
      let path =
        "orders?select=order_id,order_datetime,payment_method,total_amount" +
        ",stores(name),customers(name,phone)" +
        ",order_items(qty,unit_price,subtotal,products(name,category,line))" +
        "&tenant_id=eq." + TENANT_ID +
        "&order_datetime=gte." + from + "T00:00:00" +
        "&order_datetime=lte." + to   + "T23:59:59" +
        "&order=order_datetime.desc&limit=20000";
      if (storeId) path += "&store_id=eq." + storeId;

      const orders = await sbGet(path);

      // 시트 1: 주문 요약
      const sumHdr = ["주문번호", "일시", "매장", "고객명", "전화번호", "결제수단", "합계금액(원)"];
      const sumRows = orders.map(o => [
        o.order_id, fmtDt(o.order_datetime),
        o.stores?.name || "", o.customers?.name || "", o.customers?.phone || "",
        o.payment_method || "", n(o.total_amount)
      ]);

      // 시트 2: 주문 상세 (주문 × 상품 펼침)
      const detHdr = ["주문번호", "일시", "매장", "결제수단", "상품명", "분류", "라인", "수량", "단가(원)", "소계(원)"];
      const detRows = [];
      orders.forEach(o => {
        const items = o.order_items || [];
        if (!items.length) {
          detRows.push([o.order_id, fmtDt(o.order_datetime), o.stores?.name || "",
            o.payment_method || "", "", "", "", 0, 0, 0]);
        } else {
          items.forEach(it => {
            detRows.push([
              o.order_id, fmtDt(o.order_datetime), o.stores?.name || "", o.payment_method || "",
              it.products?.name || "", it.products?.category || "", it.products?.line || "",
              n(it.qty), n(it.unit_price), n(it.subtotal ?? (it.qty * it.unit_price))
            ]);
          });
        }
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, makeSheet(sumHdr, sumRows, [14,20,10,10,13,8,14]), "주문 요약");
      XLSX.utils.book_append_sheet(wb, makeSheet(detHdr, detRows, [14,20,10,8,22,8,10,6,10,12]), "주문 상세");
      saveXlsx(wb, `매출내역_${from}_${to}.xlsx`);
      statusEl.textContent = `✓ 주문 ${orders.length}건 내보내기 완료`;
    } catch (err) {
      statusEl.textContent = "오류: " + err.message;
    } finally {
      setLoading("ex_orders", false);
    }
  }

  // ── 입고 내역 ─────────────────────────────────────────────────────────────────

  async function exportPurchases() {
    const statusEl        = document.getElementById("ex_status");
    const { storeId, from, to } = getFilters();
    if (!from || !to) { statusEl.textContent = "기간을 선택해주세요."; return; }
    setLoading("ex_purchases", true);
    statusEl.textContent = "입고 데이터 조회 중...";
    try {
      const data = await sbGet(
        "purchase_items?select=qty,unit_cost" +
        ",products(name,category,line)" +
        ",purchases(purchase_date,stores(store_id,name),suppliers(name))" +
        "&limit=20000"
      );
      const rows = data
        .filter(d => {
          const date = d.purchases?.purchase_date || "";
          const sid  = d.purchases?.stores?.store_id || "";
          return (!from || date >= from) && (!to || date <= to) &&
                 (!storeId || sid === storeId);
        })
        .map(d => [
          fmtD(d.purchases?.purchase_date),
          d.purchases?.stores?.name || "",
          d.purchases?.suppliers?.name || "",
          d.products?.name || "",
          d.products?.category || "",
          d.products?.line || "",
          n(d.qty), n(d.unit_cost), n(d.qty) * n(d.unit_cost)
        ]);

      const headers = ["입고일", "매장", "거래처", "상품명", "분류", "라인", "수량", "단가(원)", "금액(원)"];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, makeSheet(headers, rows, [12,10,12,22,8,10,6,10,12]), "입고 내역");
      saveXlsx(wb, `입고내역_${from}_${to}.xlsx`);
      statusEl.textContent = `✓ 입고 ${rows.length}건 내보내기 완료`;
    } catch (err) {
      statusEl.textContent = "오류: " + err.message;
    } finally {
      setLoading("ex_purchases", false);
    }
  }

  // ── 고객 목록 ─────────────────────────────────────────────────────────────────

  async function exportCustomers() {
    const statusEl        = document.getElementById("ex_status");
    const { storeId }     = getFilters();
    setLoading("ex_customers", true);
    statusEl.textContent = "고객 데이터 조회 중...";
    try {
      let path =
        "customers?select=name,phone,gender,nationality,acquisition_channel" +
        ",first_visit_date,visit_count,total_spent,points,stores(name)" +
        "&tenant_id=eq." + TENANT_ID + "&order=first_visit_date.desc&limit=20000";
      if (storeId) path += "&store_id=eq." + storeId;

      const data = await sbGet(path);
      const headers = ["이름", "전화번호", "성별", "국적", "유입경로", "첫방문일", "첫방문매장", "방문횟수", "총구매액(원)", "포인트"];
      const rows    = data.map(c => [
        c.name || "", c.phone || "", c.gender || "", c.nationality || "",
        c.acquisition_channel || "", fmtD(c.first_visit_date),
        c.stores?.name || "", n(c.visit_count), n(c.total_spent), n(c.points)
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, makeSheet(headers, rows, [10,13,6,8,10,12,10,8,14,8]), "고객 목록");
      saveXlsx(wb, `고객목록_${new Date().toISOString().slice(0,10)}.xlsx`);
      statusEl.textContent = `✓ 고객 ${rows.length}명 내보내기 완료`;
    } catch (err) {
      statusEl.textContent = "오류: " + err.message;
    } finally {
      setLoading("ex_customers", false);
    }
  }

  // ── 마감 내역 ─────────────────────────────────────────────────────────────────

  async function exportClosings() {
    const statusEl        = document.getElementById("ex_status");
    const { storeId, from, to } = getFilters();
    if (!from || !to) { statusEl.textContent = "기간을 선택해주세요."; return; }
    setLoading("ex_closings", true);
    statusEl.textContent = "마감 데이터 조회 중...";
    try {
      let path =
        "daily_closings?select=closing_date,business_start,business_end" +
        ",opening_cash,total_sales,cash_sales,cash_count,special_notes,stores(name)" +
        "&tenant_id=eq." + TENANT_ID +
        "&closing_date=gte." + from + "&closing_date=lte." + to +
        "&order=closing_date.desc&limit=5000";
      if (storeId) path += "&store_id=eq." + storeId;

      const data = await sbGet(path);
      const headers = ["날짜", "매장", "영업시작", "마감시간", "준비금(원)", "총매출(원)", "현금매출(원)", "현금건수", "특이사항"];
      const rows    = data.map(d => [
        fmtD(d.closing_date),
        d.stores?.name || "",
        fmtDt(d.business_start),
        d.business_end ? fmtDt(d.business_end) : "미마감",
        n(d.opening_cash), n(d.total_sales), n(d.cash_sales), n(d.cash_count),
        d.special_notes || ""
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, makeSheet(headers, rows, [12,10,20,20,10,12,12,8,30]), "마감 내역");
      saveXlsx(wb, `마감내역_${from}_${to}.xlsx`);
      statusEl.textContent = `✓ 마감 ${rows.length}건 내보내기 완료`;
    } catch (err) {
      statusEl.textContent = "오류: " + err.message;
    } finally {
      setLoading("ex_closings", false);
    }
  }

  // ── 재고 현황 (매장별 시트) ───────────────────────────────────────────────────

  async function exportInventory() {
    const statusEl    = document.getElementById("ex_status");
    const { storeId } = getFilters();
    setLoading("ex_inventory", true);
    statusEl.textContent = "재고 데이터 조회 중...";
    try {
      const allStores = storeId
        ? await sbGet("stores?select=store_id,name&store_id=eq." + storeId)
        : await sbGet("stores?select=store_id,name&order=name");

      const wb      = XLSX.utils.book_new();
      const headers = ["매장", "상품명", "분류", "라인", "재고수량", "상태"];
      let total = 0;

      for (const store of allStores) {
        let rows = [];
        try {
          const data = await sbRpc("get_product_stock_analysis", { p_store_id: store.store_id });
          rows = data.map(r => [
            store.name, r.name || "", r.category || "", r.line || "",
            n(r.qty_on_hand),
            r.qty_on_hand <= 0 ? "품절"
              : r.days_left != null && r.days_left <= 3 ? "긴급발주"
              : r.days_left != null && r.days_left <= 7 ? "발주필요"
              : "정상"
          ]);
          total += rows.length;
        } catch {
          rows = [[store.name, "(조회실패)", "", "", 0, ""]];
        }
        const sheetName = store.name.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, makeSheet(headers, rows, [10,22,8,10,8,8]), sheetName);
      }

      saveXlsx(wb, `재고현황_${new Date().toISOString().slice(0,10)}.xlsx`);
      statusEl.textContent = `✓ ${allStores.length}개 매장 / ${total}개 품목 내보내기 완료`;
    } catch (err) {
      statusEl.textContent = "오류: " + err.message;
    } finally {
      setLoading("ex_inventory", false);
    }
  }

  // ── 상품 목록 ─────────────────────────────────────────────────────────────────

  async function exportProducts() {
    const statusEl = document.getElementById("ex_status");
    setLoading("ex_products", true);
    statusEl.textContent = "상품 데이터 조회 중...";
    try {
      const data = await sbGet("products?select=code,name,category,line,price&order=category,name&limit=10000");
      const headers = ["코드", "상품명", "분류", "라인", "판매가(원)"];
      const rows    = data.map(p => [p.code || "", p.name || "", p.category || "", p.line || "", n(p.price)]);
      const wb      = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, makeSheet(headers, rows, [10,25,8,12,10]), "상품 목록");
      saveXlsx(wb, `상품목록_${new Date().toISOString().slice(0,10)}.xlsx`);
      statusEl.textContent = `✓ 상품 ${rows.length}개 내보내기 완료`;
    } catch (err) {
      statusEl.textContent = "오류: " + err.message;
    } finally {
      setLoading("ex_products", false);
    }
  }

  return { render };
})();
