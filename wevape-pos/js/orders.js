const OrdersModule = (() => {
  const CATEGORY_TABS = [
    { key: "graffitiC", label: "그래피티C", filter: { line: "그래피티C" } },
    { key: "graffiti2", label: "그래피티2", filter: { line: "그래피티2" } },
    { key: "graffitiS1", label: "그래피티(시즌1)", filter: { line: "그래피티(시즌1)" } },
    { key: "waka", label: "와카", filter: { line: "와카" } },
    { key: "nasty", label: "네스티바", filter: { line: "네스티바" } },
    { key: "relx", label: "릴렉스", filter: { line: "릴렉스" } },
    { key: "premade", label: "기성액상", filter: { category: "기성액상" } },
    { key: "mod", label: "모드액상", filter: { category: "모드액상" } },
    { key: "parts", label: "파츠/디바이스", filter: { categoryIn: ["파츠", "디바이스"] } },
    { key: "search", label: "전체검색", filter: null }
  ];

  const GENDER_OPTIONS = [
    { v: "남", label: "남" },
    { v: "여", label: "여" },
    { v: "미입력", label: "미입력" }
  ];

  const NATIONALITY_OPTIONS = [
    { v: "한국", label: "내국인" },
    { v: "중국", label: "중국인" },
    { v: "일본", label: "일본인" },
    { v: "기타", label: "기타외국인" }
  ];

  let cart = [];
  let tenantId = null;
  let activeCategoryKey = CATEGORY_TABS[0].key;
  let products = [];
  let stockMap = {};
  let salesMap = {};
  let discountType = "amount";
  let discountValue = 0;
  let selectedCustomer = null;
  let newGender = "미입력";
  let newNationality = "한국";

  function render() {
    const el = document.getElementById("panel-orders");
    el.innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <select id="ord_store" style="width:100%"><option value="">매장 로딩중...</option></select>
        <div class="muted" id="ord_storeStatus" style="margin-top:6px"></div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div class="row" style="justify-content:space-between;align-items:center">
          <div id="ord_custSummary" class="muted">비회원으로 진행 중</div>
          <div class="row">
            <button type="button" id="ord_custClearBtn" class="secondary" style="display:none">해제</button>
            <button type="button" id="ord_custBtn" class="secondary">고객 조회</button>
          </div>
        </div>
      </div>

      <div id="ord_custModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;align-items:center;justify-content:center" class="row">
        <div class="card" style="width:480px;max-width:92vw;max-height:86vh;overflow:auto;background:#fff">
          <div id="ord_custModalSearch">
            <div style="font-weight:700;margin-bottom:10px">고객 조회</div>
            <div class="row" style="margin-bottom:10px">
              <input id="ord_custSearchInput" type="text" placeholder="이름 또는 전화번호" style="flex:1" />
              <button id="ord_custSearchBtn">검색</button>
            </div>
            <div id="ord_custResults"></div>
            <div class="row" style="justify-content:space-between;margin-top:14px;padding-top:10px;border-top:1px solid var(--line)">
              <button type="button" id="ord_custNewBtn" class="secondary">신규 고객 등록</button>
              <button type="button" id="ord_custCloseBtn" class="secondary">닫기</button>
            </div>
          </div>
          <div id="ord_custModalNew" style="display:none">
            <div style="font-weight:700;margin-bottom:10px">신규 고객 등록</div>
            <div class="row" style="margin-bottom:8px">
              <input id="ord_newName" type="text" placeholder="이름" style="flex:1" />
              <input id="ord_newPhone" type="text" placeholder="전화번호" style="flex:1" />
            </div>
            <input id="ord_newBirth" type="date" style="width:100%;margin-bottom:8px" />
            <div class="row" style="margin-bottom:8px;align-items:center">
              <span class="muted" style="width:64px">성별</span>
              ${GENDER_OPTIONS.map(g => `<button type="button" class="secondary ord-genderBtn" data-v="${g.v}">${g.label}</button>`).join("")}
            </div>
            <div class="row" style="margin-bottom:8px;flex-wrap:wrap;align-items:center">
              <span class="muted" style="width:64px">고객유형</span>
              ${NATIONALITY_OPTIONS.map(n => `<button type="button" class="secondary ord-natBtn" data-v="${n.v}">${n.label}</button>`).join("")}
            </div>
            <input id="ord_newMemo" type="text" placeholder="특이사항" style="width:100%;margin-bottom:10px" />
            <div class="row" style="justify-content:space-between">
              <button id="ord_newSaveBtn">저장 후 선택</button>
              <button type="button" id="ord_newCancelBtn" class="secondary">취소</button>
            </div>
            <div class="muted" id="ord_newStatus" style="margin-top:8px"></div>
          </div>
        </div>
      </div>

      <div class="posLayout">
        <div class="posLeft">
          <div class="catTabs" id="ord_catTabs">
            ${CATEGORY_TABS.map(t => `<button class="secondary" data-key="${t.key}">${t.label}</button>`).join("")}
          </div>
          <input id="ord_search" type="text" placeholder="상품명 검색" style="width:100%;margin-bottom:10px;display:none" />
          <div id="ord_grid" class="prodGrid"></div>
          <div class="muted" id="ord_gridStatus" style="margin-top:8px"></div>
        </div>
        <div class="posRight">
          <div class="card">
            <div class="muted" style="margin-bottom:8px">장바구니</div>
            <div id="ord_cartList"></div>
            <div id="ord_cartEmpty" class="muted">담은 상품이 없습니다</div>
            <div class="row" style="justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
              <span>합계</span>
              <span style="font-size:24px;font-weight:800" id="ord_total">0원</span>
            </div>
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
              <div class="muted" style="margin-bottom:6px">할인 적용</div>
              <div class="row" style="margin-bottom:6px">
                <button type="button" id="ord_discAmount" class="secondary" style="flex:1">금액할인</button>
                <button type="button" id="ord_discPercent" class="secondary" style="flex:1">퍼센트할인</button>
              </div>
              <input id="ord_discValue" type="number" min="0" value="0" placeholder="할인 금액 또는 %" style="width:100%;margin-bottom:6px" />
              <div class="row" style="justify-content:space-between">
                <span class="muted">할인액</span><span id="ord_discAmountDisplay" class="muted">0원</span>
              </div>
              <div class="row" style="justify-content:space-between;margin-top:4px">
                <span style="font-weight:700">최종 결제금액</span>
                <span style="font-weight:800;font-size:18px" id="ord_finalTotal">0원</span>
              </div>
            </div>
          </div>
          <div class="payGrid" id="ord_payGrid">
            <button data-method="현금">현금</button>
            <button data-method="카드">카드</button>
            <button data-method="이체">이체</button>
            <button data-method="Alipay">Alipay</button>
            <button data-method="기타" style="grid-column:1 / span 2">기타</button>
          </div>
          <div class="muted" id="ord_status" style="margin-top:10px"></div>
        </div>
      </div>
    `;
    bind();
    updateDiscountButtons();
    renderCustomerSummary();
    updateGenderButtons();
    updateNatButtons();
    loadStores();
    handleTossRedirect();
  }

  async function handleTossRedirect() {
    const result = PaymentModule.consumePaymentResultFromUrl();
    if (!result) return;
    const statusEl = document.getElementById("ord_status");

    if (result.status === "fail") {
      PaymentModule.takePendingOrder(result.orderId);
      statusEl.textContent = "카드 결제 실패: " + (result.message || "사용자가 결제를 취소했거나 오류가 발생했습니다.");
      return;
    }

    const pending = PaymentModule.takePendingOrder(result.orderId);
    if (!pending) {
      statusEl.textContent = "결제 정보를 찾을 수 없습니다. 다시 시도해주세요.";
      return;
    }

    statusEl.textContent = "결제 승인 처리 중...";
    try {
      await PaymentModule.confirmPayment(result.paymentKey, result.orderId, result.amount);
      await sbRpc("register_order", {
        p_tenant_id: TENANT_ID, p_store_id: pending.storeId, p_customer_id: pending.customerId,
        p_staff_id: null, p_payment_method: "카드", p_items: pending.items
      });
      await bumpCustomerStats(pending.customerId, pending.amount);
      statusEl.textContent = "카드 결제 완료" + (pending.customerId ? " (고객 연결됨)" : " (비회원)");
      cart = [];
      resetDiscount();
      renderCart();
      await loadStockAndSales(pending.storeId);
      if (activeCategoryKey !== "search") renderGrid();
    } catch (err) {
      statusEl.textContent = "결제 승인/주문 등록 오류: " + err.message;
    }
  }

  function bind() {
    document.getElementById("ord_store").addEventListener("change", async (e) => {
      await loadStockAndSales(e.target.value);
      renderGrid();
    });
    document.querySelectorAll("#ord_catTabs button").forEach(b => b.addEventListener("click", () => selectCategory(b.dataset.key)));
    document.getElementById("ord_search").addEventListener("input", (e) => {
      clearTimeout(window._ordSearchT);
      window._ordSearchT = setTimeout(() => searchProducts(e.target.value), 250);
    });
    document.querySelectorAll("#ord_payGrid button").forEach(b => b.addEventListener("click", () => submitOrder(b.dataset.method)));
    document.getElementById("ord_discAmount").addEventListener("click", () => selectDiscountType("amount"));
    document.getElementById("ord_discPercent").addEventListener("click", () => selectDiscountType("percent"));
    document.getElementById("ord_discValue").addEventListener("input", (e) => {
      discountValue = parseFloat(e.target.value) || 0;
      renderCart();
    });

    document.getElementById("ord_custBtn").addEventListener("click", openCustomerModal);
    document.getElementById("ord_custClearBtn").addEventListener("click", clearCustomer);
    document.getElementById("ord_custSearchBtn").addEventListener("click", searchCustomers);
    document.getElementById("ord_custSearchInput").addEventListener("keydown", (e) => { if (e.key === "Enter") searchCustomers(); });
    document.getElementById("ord_custNewBtn").addEventListener("click", showCustNewView);
    document.getElementById("ord_custCloseBtn").addEventListener("click", closeCustomerModal);
    document.getElementById("ord_newCancelBtn").addEventListener("click", showCustSearchView);
    document.getElementById("ord_newSaveBtn").addEventListener("click", saveNewCustomer);
    document.querySelectorAll(".ord-genderBtn").forEach(b => b.addEventListener("click", () => { newGender = b.dataset.v; updateGenderButtons(); }));
    document.querySelectorAll(".ord-natBtn").forEach(b => b.addEventListener("click", () => { newNationality = b.dataset.v; updateNatButtons(); }));
  }

  function updateDiscountButtons() {
    document.getElementById("ord_discAmount").classList.toggle("active", discountType === "amount");
    document.getElementById("ord_discAmount").classList.toggle("secondary", discountType !== "amount");
    document.getElementById("ord_discPercent").classList.toggle("active", discountType === "percent");
    document.getElementById("ord_discPercent").classList.toggle("secondary", discountType !== "percent");
  }

  function selectDiscountType(type) {
    discountType = type;
    updateDiscountButtons();
    renderCart();
  }

  function cartSubtotal() {
    return cart.reduce((s, c) => s + c.price * c.qty, 0);
  }

  function computeDiscountAmount() {
    const subtotal = cartSubtotal();
    if (!subtotal || !discountValue) return 0;
    const raw = discountType === "percent" ? subtotal * (discountValue / 100) : discountValue;
    return Math.round(Math.max(0, Math.min(raw, subtotal)));
  }

  function cartFinalTotal() {
    return cartSubtotal() - computeDiscountAmount();
  }

  // 할인을 각 품목 unit_price에 비율로 반영해 order_items에 그대로 저장할 수 있게 한다.
  function buildDiscountedItems() {
    const subtotal = cartSubtotal();
    const discountAmount = computeDiscountAmount();
    if (!discountAmount) return cart.map(c => ({ product_id: c.id, qty: c.qty, unit_price: c.price }));
    const ratio = (subtotal - discountAmount) / subtotal;
    return cart.map(c => ({ product_id: c.id, qty: c.qty, unit_price: Math.round(c.price * ratio) }));
  }

  function resetDiscount() {
    discountType = "amount";
    discountValue = 0;
    document.getElementById("ord_discValue").value = "0";
    updateDiscountButtons();
  }

  async function loadStores() {
    const statusEl = document.getElementById("ord_storeStatus");
    try {
      const data = await sbGet("stores?select=store_id,name,tenant_id&order=name");
      tenantId = data[0]?.tenant_id;
      document.getElementById("ord_store").innerHTML = data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
      applyDefaultStore(document.getElementById("ord_store"));
      statusEl.textContent = data.length + "개 매장 로드됨";
      const storeId = document.getElementById("ord_store").value;
      await loadStockAndSales(storeId);
      selectCategory(activeCategoryKey);
    } catch (err) { statusEl.textContent = "매장 로드 실패: " + err.message; }
  }

  function openCustomerModal() {
    document.getElementById("ord_custModal").style.display = "flex";
    document.getElementById("ord_custSearchInput").value = "";
    document.getElementById("ord_custResults").innerHTML = "";
    showCustSearchView();
  }

  function closeCustomerModal() {
    document.getElementById("ord_custModal").style.display = "none";
  }

  function showCustSearchView() {
    document.getElementById("ord_custModalSearch").style.display = "block";
    document.getElementById("ord_custModalNew").style.display = "none";
  }

  function showCustNewView() {
    document.getElementById("ord_custModalSearch").style.display = "none";
    document.getElementById("ord_custModalNew").style.display = "block";
    document.getElementById("ord_newName").value = "";
    document.getElementById("ord_newPhone").value = "";
    document.getElementById("ord_newBirth").value = "";
    document.getElementById("ord_newMemo").value = "";
    document.getElementById("ord_newStatus").textContent = "";
    newGender = "미입력";
    newNationality = "한국";
    updateGenderButtons();
    updateNatButtons();
  }

  function updateGenderButtons() {
    document.querySelectorAll(".ord-genderBtn").forEach(b => {
      const isActive = b.dataset.v === newGender;
      b.classList.toggle("active", isActive);
      b.classList.toggle("secondary", !isActive);
    });
  }

  function updateNatButtons() {
    document.querySelectorAll(".ord-natBtn").forEach(b => {
      const isActive = b.dataset.v === newNationality;
      b.classList.toggle("active", isActive);
      b.classList.toggle("secondary", !isActive);
    });
  }

  function calcAge(birthDate) {
    if (!birthDate) return null;
    const b = new Date(birthDate);
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
    return age;
  }

  async function searchCustomers() {
    const q = document.getElementById("ord_custSearchInput").value.trim();
    const box = document.getElementById("ord_custResults");
    if (!q) { box.innerHTML = `<div class="muted">검색어를 입력해주세요.</div>`; return; }
    box.innerHTML = `<div class="muted">검색 중...</div>`;
    try {
      const data = await sbGet("customers?select=customer_id,name,phone,birth_date,nationality,gender,points&tenant_id=eq." + TENANT_ID + "&or=(name.ilike.*" + encodeURIComponent(q) + "*,phone.ilike.*" + encodeURIComponent(q) + "*)&limit=20");
      if (!data.length) { box.innerHTML = `<div class="muted">검색 결과가 없습니다.</div>`; return; }
      box.innerHTML = data.map(c => {
        const age = calcAge(c.birth_date);
        return `
          <div class="resultRow">
            <div>${c.name || "이름없음"} · ${c.phone || "-"}${age !== null ? " · " + age + "세" : ""}</div>
            <button type="button" class="secondary ord-custSelectBtn" data-id="${c.customer_id}">선택</button>
          </div>
        `;
      }).join("");
      box.querySelectorAll(".ord-custSelectBtn").forEach(btn => btn.addEventListener("click", () => {
        const c = data.find(x => x.customer_id === btn.dataset.id);
        selectCustomer(c);
      }));
    } catch (err) { box.innerHTML = `<div class="muted">오류: ${err.message}</div>`; }
  }

  function selectCustomer(c) {
    selectedCustomer = c;
    closeCustomerModal();
    renderCustomerSummary();
  }

  function clearCustomer() {
    selectedCustomer = null;
    renderCustomerSummary();
  }

  function renderCustomerSummary() {
    const el = document.getElementById("ord_custSummary");
    const clearBtn = document.getElementById("ord_custClearBtn");
    if (!selectedCustomer) {
      el.textContent = "비회원으로 진행 중";
      clearBtn.style.display = "none";
    } else {
      const name = selectedCustomer.name || "이름없음";
      const phone = selectedCustomer.phone || "-";
      const points = (selectedCustomer.points || 0).toLocaleString();
      el.innerHTML = `👤 ${name} | 📞 ${phone} | 🎁 포인트: ${points}P`;
      clearBtn.style.display = "inline-block";
    }
  }

  async function saveNewCustomer() {
    const statusEl = document.getElementById("ord_newStatus");
    const name = document.getElementById("ord_newName").value.trim();
    const phone = document.getElementById("ord_newPhone").value.trim();
    const birth = document.getElementById("ord_newBirth").value || null;
    const memo = document.getElementById("ord_newMemo").value.trim() || null;
    if (!phone) { statusEl.textContent = "전화번호를 입력해주세요."; return; }
    statusEl.textContent = "저장 중...";
    try {
      const storeId = document.getElementById("ord_store").value;
      const nowIso = new Date().toISOString();
      const created = await sbPost("customers", {
        tenant_id: TENANT_ID, phone, name: name || null,
        birth_date: birth, gender: newGender, nationality: newNationality, memo,
        first_visit_store: storeId || null,
        first_visit_date: nowIso.slice(0, 10),
        first_visit_at: nowIso
      }, { "Prefer": "return=representation" });
      selectCustomer(created[0]);
    } catch (err) { statusEl.textContent = "저장 실패: " + err.message; }
  }

  async function bumpCustomerStats(customerId, amount) {
    if (!customerId) return;
    try {
      const rows = await sbGet("customers?select=total_visits,total_amount,first_visit_at,points&tenant_id=eq." + TENANT_ID + "&customer_id=eq." + customerId);
      const cur = rows[0] || {};
      const nowIso = new Date().toISOString();
      const earnedPoints = Math.floor((amount || 0) * 0.01);
      await sbPatch("customers?customer_id=eq." + customerId, {
        total_visits: (cur.total_visits || 0) + 1,
        total_amount: (cur.total_amount || 0) + (amount || 0),
        last_visit_at: nowIso,
        first_visit_at: cur.first_visit_at || nowIso,
        points: (cur.points || 0) + earnedPoints
      });
    } catch (err) {}
  }

  function selectCategory(key) {
    activeCategoryKey = key;
    document.querySelectorAll("#ord_catTabs button").forEach(b => {
      const isActive = b.dataset.key === key;
      b.classList.toggle("active", isActive);
      b.classList.toggle("secondary", !isActive);
    });
    const searchInput = document.getElementById("ord_search");
    if (key === "search") {
      searchInput.style.display = "block";
      searchInput.value = "";
      products = [];
      renderGrid();
      document.getElementById("ord_gridStatus").textContent = "상품명을 검색해주세요.";
    } else {
      searchInput.style.display = "none";
      loadCategoryProducts(key);
    }
  }

  async function loadCategoryProducts(key) {
    const tab = CATEGORY_TABS.find(t => t.key === key);
    const statusEl = document.getElementById("ord_gridStatus");
    statusEl.textContent = "불러오는 중...";
    try {
      let path = "products?select=product_id,code,name,price,category,line&order=name&limit=100";
      if (tab.filter.line) path += "&line=eq." + encodeURIComponent(tab.filter.line);
      else if (tab.filter.category) path += "&category=eq." + encodeURIComponent(tab.filter.category);
      else if (tab.filter.categoryIn) path += "&category=in.(" + tab.filter.categoryIn.join(",") + ")";
      products = await sbGet(path);
      renderGrid();
      statusEl.textContent = products.length + "개 상품";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function searchProducts(q) {
    const statusEl = document.getElementById("ord_gridStatus");
    if (!q) { products = []; renderGrid(); statusEl.textContent = "상품명을 검색해주세요."; return; }
    statusEl.textContent = "검색 중...";
    try {
      products = await sbGet("products?select=product_id,code,name,price,category,line&name=ilike.*" + encodeURIComponent(q) + "*&limit=50");
      renderGrid();
      statusEl.textContent = products.length + "개 검색됨";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function loadStockAndSales(storeId) {
    stockMap = {}; salesMap = {};
    if (!storeId) return;
    try {
      const stockData = await sbRpc("get_product_stock_analysis", { p_store_id: storeId });
      stockData.forEach(r => { stockMap[r.product_id] = r.qty_on_hand; });
    } catch (err) {}
    try {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const salesData = await sbGet("order_items?select=product_id,qty,orders!inner(order_datetime,store_id)&orders.store_id=eq." + storeId + "&orders.order_datetime=gte." + since);
      salesData.forEach(s => { salesMap[s.product_id] = (salesMap[s.product_id] || 0) + (s.qty || 0); });
    } catch (err) {}
  }

  function buildStockBadge(stock, sales30) {
    if (stock === undefined || stock === null) return { html: "", disabled: false };
    if (stock <= 0) return { html: `<span style="color:var(--bad);font-weight:700;font-size:12px">품절</span>`, disabled: true };
    if (!sales30) return { html: `<span class="muted" style="font-size:12px">재고 ${stock}개</span>`, disabled: false };
    const daysLeft = Math.round(stock / (sales30 / 30));
    if (daysLeft <= 3) return { html: `<span style="color:var(--bad);font-weight:700;font-size:12px">🔴 긴급발주 (${daysLeft}일)</span>`, disabled: false };
    if (daysLeft <= 7) return { html: `<span style="color:#a87b00;font-weight:700;font-size:12px">🟡 발주필요 (${daysLeft}일)</span>`, disabled: false };
    return { html: `<span class="muted" style="font-size:12px">재고 ${stock}개</span>`, disabled: false };
  }

  function renderGrid() {
    const grid = document.getElementById("ord_grid");
    grid.innerHTML = products.map(p => {
      const badge = buildStockBadge(stockMap[p.product_id], salesMap[p.product_id]);
      const cardStyle = badge.disabled
        ? "background:#f0f0f0;border:1px solid #e7e3d6"
        : "background:#ffffff;border:1px solid #e7e3d6";
      const nameStyle = badge.disabled ? "color:#aaaaaa;font-weight:600" : "color:#15140f;font-weight:600";
      const priceStyle = badge.disabled ? "color:#aaaaaa" : "color:#4a4840";
      return `
        <button type="button" class="prodCard${badge.disabled ? " soldout" : ""}" style="${cardStyle}" data-id="${p.product_id}" data-name="${p.name.replace(/"/g, '&quot;')}" data-price="${p.price || 0}" ${badge.disabled ? "disabled" : ""}>
          <div class="pName" style="${nameStyle}">${p.name}</div>
          <div class="pPrice" style="${priceStyle}">${fmtWon(p.price)}</div>
          <div class="pBadge">${badge.html}</div>
        </button>
      `;
    }).join("") || `<div class="muted">상품이 없습니다.</div>`;
    grid.querySelectorAll(".prodCard:not(.soldout)").forEach(btn => btn.addEventListener("click", () => addToCart(btn.dataset.id, btn.dataset.name, parseFloat(btn.dataset.price) || 0)));
  }

  function addToCart(id, name, price) {
    const ex = cart.find(c => c.id === id);
    if (ex) ex.qty += 1; else cart.push({ id, name, price, qty: 1 });
    renderCart();
  }
  function changeQty(id, d) {
    const it = cart.find(c => c.id === id);
    if (!it) return;
    it.qty += d;
    if (it.qty <= 0) cart = cart.filter(c => c.id !== id);
    renderCart();
  }
  function changePrice(id, val) {
    const it = cart.find(c => c.id === id);
    if (it) it.price = isNaN(val) ? 0 : val;
    renderCart();
  }
  function renderCart() {
    const list = document.getElementById("ord_cartList");
    document.getElementById("ord_cartEmpty").style.display = cart.length ? "none" : "block";
    list.innerHTML = cart.map(c => `
      <div class="cartRow">
        <div style="flex:1">${c.name}</div>
        <button data-id="${c.id}" data-d="-1" class="qBtn secondary" style="width:28px;padding:2px">-</button>
        <span style="min-width:20px;text-align:center">${c.qty}</span>
        <button data-id="${c.id}" data-d="1" class="qBtn secondary" style="width:28px;padding:2px">+</button>
        <input type="number" class="pInput" data-id="${c.id}" value="${c.price}" style="width:90px" />
        <span style="min-width:70px;text-align:right">${fmtWon(c.price * c.qty)}</span>
      </div>
    `).join("");
    list.querySelectorAll(".qBtn").forEach(b => b.addEventListener("click", () => changeQty(b.dataset.id, parseInt(b.dataset.d))));
    list.querySelectorAll(".pInput").forEach(i => i.addEventListener("change", () => changePrice(i.dataset.id, parseFloat(i.value))));
    document.getElementById("ord_total").textContent = fmtWon(cartSubtotal());
    document.getElementById("ord_discAmountDisplay").textContent = fmtWon(computeDiscountAmount());
    document.getElementById("ord_finalTotal").textContent = fmtWon(cartFinalTotal());
  }

  async function submitOrder(paymentMethod) {
    const statusEl = document.getElementById("ord_status");
    const storeId = document.getElementById("ord_store").value;
    if (!storeId) { statusEl.textContent = "매장을 선택해주세요."; return; }
    if (!cart.length) { statusEl.textContent = "장바구니가 비어있습니다."; return; }

    // 오프라인 처리: 카드 결제는 온라인 필요, 나머지는 IndexedDB 임시저장
    if (!navigator.onLine) {
      if (paymentMethod === "카드") {
        statusEl.textContent = "카드 결제는 온라인 상태에서만 가능합니다.";
        return;
      }
      const customerId = selectedCustomer ? selectedCustomer.customer_id : null;
      const items = buildDiscountedItems();
      try {
        await offlineSaveOrder({
          p_tenant_id: TENANT_ID, p_store_id: storeId, p_customer_id: customerId,
          p_staff_id: null, p_payment_method: paymentMethod, p_items: items
        });
        statusEl.textContent = `[오프라인] ${paymentMethod} 주문 임시저장 완료 — 온라인 복귀 시 자동 업로드`;
        cart = [];
        resetDiscount();
        clearCustomer();
        renderCart();
      } catch (e) {
        statusEl.textContent = "임시저장 오류: " + e.message;
      }
      return;
    }

    if (paymentMethod === "카드") {
      await submitCardOrder(storeId);
      return;
    }

    statusEl.textContent = "등록 중...";
    try {
      const customerId = selectedCustomer ? selectedCustomer.customer_id : null;
      const items      = buildDiscountedItems();
      const amount     = cartFinalTotal();

      // 영수증용 데이터: cart 비우기 전에 캡처
      const storeEl    = document.getElementById("ord_store");
      const receiptSnap = {
        storeName:     storeEl?.selectedOptions?.[0]?.text?.trim() || "",
        paymentMethod,
        items:         cart.map(c => ({ name: c.name, qty: c.qty, price: c.price })),
        discount:      computeDiscountAmount(),
        total:         amount,
        customer:      selectedCustomer ? { name: selectedCustomer.name, phone: selectedCustomer.phone } : null,
        datetime:      new Date()
      };

      const result = await sbRpc("register_order", {
        p_tenant_id: TENANT_ID, p_store_id: storeId, p_customer_id: customerId,
        p_staff_id: null, p_payment_method: paymentMethod, p_items: items
      });
      await bumpCustomerStats(customerId, amount);
      statusEl.textContent = paymentMethod + " 결제 완료" + (customerId ? " (고객 연결됨)" : " (비회원)");
      cart = [];
      resetDiscount();
      clearCustomer();
      renderCart();
      await loadStockAndSales(storeId);
      if (activeCategoryKey !== "search") renderGrid();

      // 영수증 모달
      const orderId = Array.isArray(result) ? result[0]?.order_id : result?.order_id;
      showReceipt({ ...receiptSnap, orderId });
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function submitCardOrder(storeId) {
    const statusEl = document.getElementById("ord_status");
    statusEl.textContent = "결제창 호출 중...";
    try {
      const customerId = selectedCustomer ? selectedCustomer.customer_id : null;
      const items = buildDiscountedItems();
      const amount = cartFinalTotal();
      const orderName = cart.length === 1 ? cart[0].name : `${cart[0].name} 외 ${cart.length - 1}건`;
      await PaymentModule.requestPayment(amount, orderName, selectedCustomer ? selectedCustomer.name : undefined, {
        tenantId, storeId, customerId, items, amount
      });
    } catch (err) { statusEl.textContent = "결제 요청 오류: " + err.message; }
  }

  return { render };
})();
