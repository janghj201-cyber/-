const ProductsAdminModule = (() => {
  let products = [];
  const CATEGORIES = ["일회용", "기성액상", "모드액상", "파츠", "디바이스", "기타소모품"];

  function render() {
    const el = document.getElementById("panel-products");
    el.innerHTML = `
      <!-- 신규 상품 등록 -->
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">신규 상품 등록</div>
        <div class="row" style="margin-bottom:8px">
          <input id="pa_code"     type="text"   placeholder="코드"          style="flex:1" />
          <input id="pa_name"     type="text"   placeholder="상품명"         style="flex:2" />
        </div>
        <div class="row" style="margin-bottom:8px">
          <input id="pa_category" type="text"   placeholder="분류"          style="flex:1" />
          <input id="pa_line"     type="text"   placeholder="라인 (선택)"    style="flex:1" />
          <input id="pa_price"    type="number" placeholder="판매가"         style="flex:1" />
        </div>
        <button id="pa_addBtn" style="width:100%">등록</button>
        <div class="muted" id="pa_addStatus" style="margin-top:8px"></div>
      </div>

      <!-- 일괄 가격 변경 -->
      <div class="card">
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:0">
          <span style="font-weight:700">일괄 가격 변경</span>
          <button id="pa_bulkToggle" class="secondary" style="padding:5px 12px;font-size:13px">펼치기</button>
        </div>
        <div id="pa_bulkForm" style="display:none;margin-top:12px">
          <div class="row" style="margin-bottom:8px;flex-wrap:wrap">
            <select id="pa_bulkCategory" style="flex:1">
              ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join("")}
            </select>
            <select id="pa_bulkType" style="flex:1">
              <option value="pct">정률 변경 (%)</option>
              <option value="fixed">정액 변경 (원)</option>
            </select>
            <input id="pa_bulkValue" type="number" placeholder="예: 10 (인상) / -10 (인하)" style="flex:2" />
          </div>
          <div class="muted" style="margin-bottom:10px;font-size:12px">
            정률: +10 → 10% 인상 · -10 → 10% 인하 (결과는 100원 단위 반올림)<br>
            정액: +1000 → 1,000원 인상 · -1000 → 1,000원 인하
          </div>
          <button id="pa_bulkPreviewBtn" class="secondary" style="width:100%;margin-bottom:8px">변경 미리보기</button>
          <div id="pa_bulkPreview" style="display:none;margin-bottom:10px;max-height:200px;overflow-y:auto">
            <table id="pa_bulkPreviewTable" style="font-size:12px"></table>
          </div>
          <button id="pa_bulkApplyBtn" style="width:100%;display:none">일괄 변경 적용</button>
          <div class="muted" id="pa_bulkStatus" style="margin-top:8px"></div>
        </div>
      </div>

      <!-- 상품 목록 -->
      <div class="row" style="margin-bottom:12px">
        <input id="pa_search" type="text" placeholder="상품명 검색" style="flex:1" />
      </div>
      <div id="pa_list"></div>
      <div class="muted" id="pa_status" style="margin-top:10px"></div>
    `;
    bind();
    loadProducts();
  }

  function bind() {
    document.getElementById("pa_addBtn").addEventListener("click", addProduct);
    document.getElementById("pa_search").addEventListener("input", (e) => {
      clearTimeout(window._paT);
      window._paT = setTimeout(() => loadProducts(e.target.value), 250);
    });
    document.getElementById("pa_bulkToggle").addEventListener("click", () => {
      const form = document.getElementById("pa_bulkForm");
      const btn  = document.getElementById("pa_bulkToggle");
      const open = form.style.display === "none";
      form.style.display = open ? "block" : "none";
      btn.textContent = open ? "접기" : "펼치기";
    });
    document.getElementById("pa_bulkPreviewBtn").addEventListener("click", previewBulk);
    document.getElementById("pa_bulkApplyBtn").addEventListener("click", applyBulk);
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
          <input class="pa-code"     type="text"   value="${p.code || ""}" placeholder="코드" style="flex:1" />
          <input class="pa-name"     type="text"   value="${(p.name || "").replace(/"/g, "&quot;")}" placeholder="상품명" style="flex:2" />
        </div>
        <div class="row" style="margin-bottom:8px">
          <input class="pa-category" type="text"   value="${p.category || ""}" placeholder="분류" style="flex:1" />
          <input class="pa-line"     type="text"   value="${p.line || ""}" placeholder="라인" style="flex:1" />
          <input class="pa-price"    type="number" value="${p.price || 0}" placeholder="판매가" style="flex:1" />
        </div>
        <div class="row">
          <button class="pa-save   secondary" style="flex:1">저장</button>
          <button class="pa-delete secondary" style="flex:1">삭제</button>
        </div>
      </div>
    `).join("") || `<div class="muted">상품이 없습니다.</div>`;

    box.querySelectorAll(".card").forEach(card => {
      card.querySelector(".pa-save").addEventListener("click",   () => saveProduct(card));
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
        code:     document.getElementById("pa_code").value.trim()     || null,
        name,
        category: document.getElementById("pa_category").value.trim() || null,
        line:     document.getElementById("pa_line").value.trim()     || null,
        price:    parseFloat(document.getElementById("pa_price").value) || 0
      }, { "Prefer": "return=representation" });
      statusEl.textContent = "등록 완료";
      ["pa_code", "pa_name", "pa_category", "pa_line", "pa_price"].forEach(id => {
        document.getElementById(id).value = "";
      });
      loadProducts(document.getElementById("pa_search").value);
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function saveProduct(card) {
    const statusEl = document.getElementById("pa_status");
    statusEl.textContent = "저장 중...";
    try {
      await sbPatch("products?product_id=eq." + card.dataset.id, {
        code:     card.querySelector(".pa-code").value.trim()     || null,
        name:     card.querySelector(".pa-name").value.trim(),
        category: card.querySelector(".pa-category").value.trim() || null,
        line:     card.querySelector(".pa-line").value.trim()     || null,
        price:    parseFloat(card.querySelector(".pa-price").value) || 0
      });
      statusEl.textContent = "저장 완료";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function deleteProduct(card) {
    const statusEl = document.getElementById("pa_status");
    const name = card.querySelector(".pa-name").value;
    if (!confirm(name + " 상품을 삭제하시겠습니까?")) return;
    statusEl.textContent = "삭제 중...";
    try {
      await sbDelete("products?product_id=eq." + card.dataset.id);
      statusEl.textContent = "삭제 완료";
      loadProducts(document.getElementById("pa_search").value);
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  // ── 일괄 가격 변경 ─────────────────────────────────────────────────────────

  let bulkTargets = [];

  function calcNewPrice(oldPrice, type, value) {
    if (type === "pct") {
      return Math.round(oldPrice * (1 + value / 100) / 100) * 100;
    }
    return Math.max(0, oldPrice + value);
  }

  async function previewBulk() {
    const statusEl  = document.getElementById("pa_bulkStatus");
    const category  = document.getElementById("pa_bulkCategory").value;
    const type      = document.getElementById("pa_bulkType").value;
    const valueRaw  = document.getElementById("pa_bulkValue").value;
    const value     = parseFloat(valueRaw);
    if (isNaN(value)) { statusEl.textContent = "변경값을 입력해주세요."; return; }

    statusEl.textContent = "조회 중...";
    try {
      const prods = await sbGet(
        "products?select=product_id,name,price&category=eq." + encodeURIComponent(category) + "&order=name"
      );
      bulkTargets = prods.map(p => ({
        product_id: p.product_id,
        name: p.name,
        oldPrice: p.price || 0,
        newPrice: Math.max(0, calcNewPrice(p.price || 0, type, value))
      }));

      const previewBox   = document.getElementById("pa_bulkPreview");
      const previewTable = document.getElementById("pa_bulkPreviewTable");
      const applyBtn     = document.getElementById("pa_bulkApplyBtn");

      previewTable.innerHTML = `
        <tr><th>상품명</th><th style="text-align:right">현재가</th><th style="text-align:right">변경 후</th><th style="text-align:right">차이</th></tr>
        ${bulkTargets.map(t => {
          const diff = t.newPrice - t.oldPrice;
          return `
            <tr>
              <td>${t.name}</td>
              <td style="text-align:right">${fmtWon(t.oldPrice)}</td>
              <td style="text-align:right;font-weight:700">${fmtWon(t.newPrice)}</td>
              <td style="text-align:right;color:${diff >= 0 ? "var(--good)" : "var(--bad)"}">
                ${diff >= 0 ? "+" : ""}${fmtWon(diff)}
              </td>
            </tr>
          `;
        }).join("")}
      `;
      previewBox.style.display = "block";
      applyBtn.style.display   = bulkTargets.length ? "block" : "none";
      statusEl.textContent = bulkTargets.length + "개 상품 미리보기";
    } catch (err) { statusEl.textContent = "오류: " + err.message; }
  }

  async function applyBulk() {
    const statusEl = document.getElementById("pa_bulkStatus");
    if (!bulkTargets.length) { statusEl.textContent = "먼저 미리보기를 실행해주세요."; return; }
    const category = document.getElementById("pa_bulkCategory").value;
    if (!confirm(`${category} 카테고리 ${bulkTargets.length}개 상품의 가격을 일괄 변경하시겠습니까?`)) return;

    statusEl.textContent = "변경 중...";
    document.getElementById("pa_bulkApplyBtn").disabled = true;
    try {
      await Promise.all(
        bulkTargets.map(t => sbPatch("products?product_id=eq." + t.product_id, { price: t.newPrice }))
      );
      statusEl.textContent = "✓ " + bulkTargets.length + "개 상품 가격 변경 완료";
      document.getElementById("pa_bulkPreview").style.display = "none";
      document.getElementById("pa_bulkApplyBtn").style.display = "none";
      bulkTargets = [];
      loadProducts(document.getElementById("pa_search").value);
    } catch (err) {
      statusEl.textContent = "오류: " + err.message;
    } finally {
      document.getElementById("pa_bulkApplyBtn").disabled = false;
    }
  }

  return { render };
})();
