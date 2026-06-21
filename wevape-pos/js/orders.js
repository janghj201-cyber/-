const OrdersModule = (() => {
  let cart = [];
  let tenantId = null;
  let activeCustomerId = null;

  function render() {
    const el = document.getElementById("panel-orders");
    el.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <select id="ord_store" style="flex:1"><option value="">매장 로딩중...</option></select>
          <input id="ord_search" type="text" placeholder="상품명 검색" style="flex:2" />
        </div>
        <div class="muted" id="ord_storeStatus"></div>
      </div>

      <div class="card">
        <div class="muted" style="margin-bottom:8px">고객 (선택사항)</div>
        <div class="row" style="margin-bottom:8px">
          <input id="ord_phone" type="text" placeholder="전화번호" style="flex:1" />
          <button id="ord_lookupBtn">조회</button>
        </div>
        <div id="ord_customerForm" style="display:none">
          <div class="row" style="margin-bottom:8px">
            <input id="ord_custName" type="text" placeholder="이름" style="flex:1" />
            <select id="ord_custNationality" style="flex:1">
              <option value="한국">한국</option><option value="중국">중국</option><option value="일본">일본</option><option value="기타">기타</option>
            </select>
          </div>
          <select id="ord_custChannel" style="width:100%">
            <option value="">유입경로 선택 (신규 고객만)</option>
            <option value="QR">QR</option><option value="네이버">네이버</option><option value="지인소개">지인소개</option><option value="워크인">워크인</option>
          </select>
        </div>
        <div class="muted" id="ord_customerStatus" style="margin-top:6px"></div>
      </div>

      <div id="ord_results" class="card" style="display:none;max-height:220px;overflow-y:auto"></div>

      <div class="card">
        <div class="muted" style="margin-bottom:8px">장바구니 (가격 수정 가능)</div>
        <div id="ord_cartList"></div>
        <div id="ord_cartEmpty" class="muted">담은 상품이 없습니다</div>
      </div>

      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <span>합계</span>
        <span style="font-size:20px;font-weight:700" id="ord_total">0원</span>
      </div>

      <div class="row" style="margin-bottom:12px">
        <select id="ord_payment" style="flex:1">
          <option value="현금">현금</option><option value="카드">카드</option><option value="이체">이체</option><option value="Alipay">Alipay</option><option value="기타">기타</option>
        </select>
        <button id="ord_submitBtn" style="flex:1">주문 등록</button>
      </div>
      <div class="muted" id="ord_status"></div>
    `;
    bind();
    loadStores();
  }

  function bind() {
    document.getElementById("ord_lookupBtn").addEventListener("click", lookupCustomer);
    document.getElementById("ord_search").addEventListener("input", (e) => {
      clearTimeout(window._ordSearchT);
      window._ordSearchT = setTimeout(() => searchProducts(e.target.value), 250);
    });
    document.getElementById("ord_submitBtn").addEventListener("click", submitOrder);
  }

  async function loadStores() {
    const statusEl = document.getElementById("ord_storeStatus");
    try {
      const data = await sbGet("stores?select=store_id,name,tenant_id&order=name");
      tenantId = data[0]?.tenant_id;
      document.getElementById("ord_store").innerHTML = data.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
      statusEl.textContent = data.length + "개 매장 로드됨";
    } catch (err) { statusEl.textContent = "매장 로드 실패: " + err.message; }
  }

  async function lookupCustomer() {
    const phone = document.getElementById("ord_phone").value.trim();
    const statusEl = document.getElementById("ord_customerStatus");
    const form = document.getElementById("ord_customerForm");
    activeCustomerId = null;
    if (!phone) { statusEl.textContent = ""; form.style.display = "none"; return; }
    statusEl.textContent = "조회 중...";
    try {
      const data = await sbGet("customers?select=customer_id,name,nationality&phone=eq." + encodeURIComponent(phone));
      form.style.display = "block";
      if (data.length) {
        activeCustomerId = data[0].customer_id;
        document.getElementById("ord_custName").value = data[0].name || "";
        document.getElementById("ord_custNationality").value = data[0].nationality || "한국";
        document.getElementById("ord_custChannel").style.display = "none";
        statusEl.textContent = "기존 고객 — " + (data[0].name || "이름없음") + " 님 연결됨";
      } else {
        document.getElementById("ord_custChannel").style.display = "block";
        statusEl.textContent = "신규 고객입니다.";
      }
    } catch (err) { statusEl.textContent = "조회 실패: " + err.message; }
  }

  async function ensureCustomer() {
    const phone = document.getElementById("ord_phone").value.trim();
    if (!phone) return null;
    if (activeCustomerId) return activeCustomerId;
    const storeId = document.getElementById("ord_store").value;
    const created = await sbPost("customers", {
      tenant_id: tenantId, phone,
      name: document.getElementById("ord_custName").value.trim() || null,
      nationality: document.getElementById("ord_custNationality").value,
      acquisition_channel: document.getElementById("ord_custChannel").value || null,
      first_visit_store: storeId || null,
      first_visit_date: new Date().toISOString().slice(0, 10)
    }, { "Prefer": "return=representation" });
    return created[0].customer_id;
  }

  async function searchProducts(q) {
    const box = document.getElementById("ord_results");
    if (!q) { box.style.display = "none"; return; }
    box.style.display = "block";
    try {
      const data = await sbGet("products?select=product_id,code,name,price,category,line&name=ilike.*" + encodeURIComponent(q) + "*&limit=20");
      box.innerHTML = data.map(p => `
        <div class="resultRow" data-id="${p.product_id}" data-name="${p.name.replace(/"/g, '&quot;')}" data-price="${p.price || 0}">
          <div><div>${p.name}</div><div class="muted">${p.category}${p.line ? " · " + p.line : ""} · 정가 ${fmtWon(p.price)}</div></div>
          <span>+</span>
        </div>
      `).join("") || `<div class="muted">검색 결과 없음</div>`;
      box.querySelectorAll(".resultRow").forEach(row => row.addEventListener("click", () => addToCart(row.dataset.id, row.dataset.name, parseFloat(row.dataset.price) || 0)));
    } catch (err) {}
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
    document.getElementById("ord_total").textContent = fmtWon(cart.reduce((s, c) => s + c.price * c.qty, 0));
  }

  async function submitOrder() {
    const statusEl = document.getElementById("ord_status");
    const storeId = document.getElementById("ord_store").value;
    if (!storeId) { statusEl.textContent = "매장을 선택해주세요."; return; }
    if (!cart.length) { statusEl.textContent = "장바구니가 비어있습니다."; return; }
    statusEl.textContent = "등록 중...";
    try {
      const customerId = await ensureCustomer();
      const items = cart.map(c => ({ product_id: c.id, qty: c.qty, unit_price: c.price }));
      await sbRpc("register_order", {
        p_tenant_id: tenantId, p_store_id: storeId, p_customer_id: customerId,
        p_staff_id: null, p_payment_method: document.getElementById("ord_payment").value, p_items: items
      });
      statusEl.textContent = "주문 등록 완료" + (customerId ? " (고객 연결됨)" : " (비회원)");
      cart = [];
      renderCart();
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  return { render };
})();
