const ProductsAdminModule = (() => {
  let tenantId = null;
  let products = [];

  function render() {
    const el = document.getElementById("panel-products");
    el.innerHTML = `
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">신규 상품 등록</div>
        <div class="row" style="margin-bottom:8px">
          <input id="pa_code" type="text" placeholder="코드" style="flex:1" />
          <input id="pa_name" type="text" placeholder="상품명" style="flex:2" />
        </div>
        <div class="row" style="margin-bottom:8px">
          <input id="pa_category" type="text" placeholder="분류" style="flex:1" />
          <input id="pa_line" type="text" placeholder="라인 (선택)" style="flex:1" />
          <input id="pa_price" type="number" placeholder="판매가" style="flex:1" />
        </div>
        <button id="pa_addBtn" style="width:100%">등록</button>
        <div class="muted" id="pa_addStatus" style="margin-top:8px"></div>
      </div>

      <div class="row" style="margin-bottom:12px">
        <input id="pa_search" type="text" placeholder="상품명 검색" style="flex:1" />
      </div>
      <div id="pa_list"></div>
      <div class="muted" id="pa_status" style="margin-top:10px"></div>
    `;
    bind();
    loadTenant();
    loadProducts();
  }

  function bind() {
    document.getElementById("pa_addBtn").addEventListener("click", addProduct);
    document.getElementById("pa_search").addEventListener("input", (e) => {
      clearTimeout(window._paT);
      window._paT = setTimeout(() => loadProducts(e.target.value), 250);
    });
  }

  async function loadTenant() {
    try {
      const data = await sbGet("stores?select=tenant_id&limit=1");
      tenantId = data[0]?.tenant_id;
    } catch (err) {}
  }

  async function loadProducts(q) {
    const statusEl = document.getElementById("pa_status");
    statusEl.textContent = "불러오는 중...";
    try {
      let path = "products?select=product_id,code,name,category,line,price&order=name";
      if (q) path += "&name=ilike.*" + encodeURIComponent(q) + "*";
      products = await sbGet(path);
      renderList();
      statusEl.textContent = products.length + "개 상품";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  function renderList() {
    const box = document.getElementById("pa_list");
    box.innerHTML = products.map(p => `
      <div class="card" data-id="${p.product_id}">
        <div class="row" style="margin-bottom:8px">
          <input class="pa-code" type="text" value="${p.code || ""}" placeholder="코드" style="flex:1" />
          <input class="pa-name" type="text" value="${(p.name || "").replace(/"/g, '&quot;')}" placeholder="상품명" style="flex:2" />
        </div>
        <div class="row" style="margin-bottom:8px">
          <input class="pa-category" type="text" value="${p.category || ""}" placeholder="분류" style="flex:1" />
          <input class="pa-line" type="text" value="${p.line || ""}" placeholder="라인" style="flex:1" />
          <input class="pa-price" type="number" value="${p.price || 0}" placeholder="판매가" style="flex:1" />
        </div>
        <div class="row">
          <button class="pa-save secondary" style="flex:1">저장</button>
          <button class="pa-delete secondary" style="flex:1">삭제</button>
        </div>
      </div>
    `).join("") || `<div class="muted">상품이 없습니다.</div>`;

    box.querySelectorAll(".card").forEach(card => {
      card.querySelector(".pa-save").addEventListener("click", () => saveProduct(card));
      card.querySelector(".pa-delete").addEventListener("click", () => deleteProduct(card));
    });
  }

  async function addProduct() {
    const statusEl = document.getElementById("pa_addStatus");
    const name = document.getElementById("pa_name").value.trim();
    if (!name) { statusEl.textContent = "상품명을 입력해주세요."; return; }
    statusEl.textContent = "등록 중...";
    try {
      await sbPost("products", {
        tenant_id: TENANT_ID,
        code: document.getElementById("pa_code").value.trim() || null,
        name,
        category: document.getElementById("pa_category").value.trim() || null,
        line: document.getElementById("pa_line").value.trim() || null,
        price: parseFloat(document.getElementById("pa_price").value) || 0
      }, { "Prefer": "return=representation" });
      statusEl.textContent = "등록 완료";
      ["pa_code", "pa_name", "pa_category", "pa_line", "pa_price"].forEach(id => document.getElementById(id).value = "");
      loadProducts(document.getElementById("pa_search").value);
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function saveProduct(card) {
    const statusEl = document.getElementById("pa_status");
    const id = card.dataset.id;
    statusEl.textContent = "저장 중...";
    try {
      await sbPatch("products?product_id=eq." + id, {
        code: card.querySelector(".pa-code").value.trim() || null,
        name: card.querySelector(".pa-name").value.trim(),
        category: card.querySelector(".pa-category").value.trim() || null,
        line: card.querySelector(".pa-line").value.trim() || null,
        price: parseFloat(card.querySelector(".pa-price").value) || 0
      });
      statusEl.textContent = "저장 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function deleteProduct(card) {
    const statusEl = document.getElementById("pa_status");
    const id = card.dataset.id;
    const name = card.querySelector(".pa-name").value;
    if (!confirm(name + " 상품을 삭제하시겠습니까?")) return;
    statusEl.textContent = "삭제 중...";
    try {
      await sbDelete("products?product_id=eq." + id);
      statusEl.textContent = "삭제 완료";
      loadProducts(document.getElementById("pa_search").value);
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  return { render };
})();
