const StaffAccountsModule = (() => {
  let allStores = [];

  function render() {
    const el = document.getElementById("panel-staff-accounts");
    el.innerHTML = `
      <h2 class="pageTitle">직원 계정 관리</h2>

      <div class="card" style="margin-bottom:12px">
        <div class="row" style="justify-content:space-between;align-items:center">
          <span style="font-weight:600">직원 목록</span>
          <button id="sa_addBtn" style="padding:7px 14px">+ 새 직원 추가</button>
        </div>
      </div>

      <div id="sa_addForm" class="card" style="display:none;margin-bottom:12px">
        <div style="font-weight:700;margin-bottom:12px">신규 직원 등록</div>
        <div class="row" style="margin-bottom:8px">
          <input id="sa_name"  type="text"  placeholder="이름 *"   style="flex:1" />
          <input id="sa_email" type="email" placeholder="이메일 *" style="flex:2" />
        </div>
        <div class="row" style="margin-bottom:10px">
          <select id="sa_role" style="flex:1">
            <option value="staff">직원</option>
            <option value="manager">매니저</option>
            <option value="admin">관리자</option>
          </select>
          <select id="sa_store" style="flex:2"><option value="">매장 없음</option></select>
        </div>
        <div style="background:#1e1c14;border:1px solid #3a3820;border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px;line-height:1.7;color:#c8b96a">
          <div style="font-weight:700;margin-bottom:6px">📋 2단계 등록 절차</div>
          <div><strong>1단계 (여기서)</strong> — 이름·이메일·권한·매장을 입력하고 등록 버튼 클릭</div>
          <div><strong>2단계 (Supabase Dashboard)</strong> — Authentication → Users → Add user 에서<br>
          &nbsp;&nbsp;&nbsp;동일한 이메일 + 초기 비밀번호를 입력해 Auth 계정 생성</div>
          <div style="margin-top:6px;color:#888">두 이메일이 일치하면 로그인 시 권한·매장이 자동 매핑됩니다.</div>
        </div>
        <div class="row">
          <button id="sa_saveNewBtn" style="flex:1">1단계: 직원 정보 등록</button>
          <button id="sa_cancelNewBtn" class="secondary" style="flex:1">취소</button>
        </div>
        <div id="sa_addStatus" style="margin-top:8px;font-size:13px"></div>
      </div>

      <div class="card" style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>매장</th>
              <th>권한</th>
              <th>상태</th>
              <th style="text-align:center">액션</th>
            </tr>
          </thead>
          <tbody id="sa_tableBody">
            <tr><td colspan="6" class="muted">불러오는 중...</td></tr>
          </tbody>
        </table>
      </div>
      <div class="muted" id="sa_status" style="margin-top:10px"></div>
    `;
    bind();
    loadAll();
  }

  function bind() {
    document.getElementById("sa_addBtn").addEventListener("click", toggleAddForm);
    document.getElementById("sa_saveNewBtn").addEventListener("click", saveNew);
    document.getElementById("sa_cancelNewBtn").addEventListener("click", () => {
      document.getElementById("sa_addForm").style.display = "none";
    });
  }

  function toggleAddForm() {
    const form = document.getElementById("sa_addForm");
    const isHidden = form.style.display === "none";
    form.style.display = isHidden ? "block" : "none";
    if (isHidden) {
      document.getElementById("sa_store").innerHTML =
        `<option value="">매장 없음</option>` +
        allStores.map(s => `<option value="${s.store_id}">${s.name}</option>`).join("");
      document.getElementById("sa_name").focus();
    }
  }

  async function loadAll() {
    const statusEl = document.getElementById("sa_status");
    try {
      const [accounts, stores] = await Promise.all([
        sbGet(
          "staff_accounts?select=id,name,email,role,store_id,is_active" +
          "&tenant_id=eq." + TENANT_ID + "&order=name"
        ),
        sbGet("stores?select=store_id,name&order=name")
      ]);
      allStores = stores;
      renderTable(accounts);
      statusEl.textContent = accounts.length + "명의 직원 계정";
    } catch (err) {
      statusEl.textContent = "오류: " + err.message;
    }
  }

  function renderTable(accounts) {
    const tbody = document.getElementById("sa_tableBody");
    if (!accounts.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">등록된 직원이 없습니다.</td></tr>`;
      return;
    }

    const storeOptions = allStores.map(s =>
      `<option value="${s.store_id}">${s.name}</option>`
    ).join("");

    tbody.innerHTML = accounts.map(a => `
      <tr data-id="${a.id}">
        <td><strong>${a.name}</strong></td>
        <td class="muted" style="font-size:12px">${a.email}</td>
        <td>
          <select class="sa-storeSelect" data-id="${a.id}" style="padding:4px 6px;font-size:13px">
            <option value="">없음</option>
            ${allStores.map(s => `<option value="${s.store_id}"${s.store_id === a.store_id ? " selected" : ""}>${s.name}</option>`).join("")}
          </select>
        </td>
        <td>
          <select class="sa-roleSelect" data-id="${a.id}" style="padding:4px 6px;font-size:13px">
            <option value="staff"   ${a.role === "staff"   ? "selected" : ""}>직원</option>
            <option value="manager" ${a.role === "manager" ? "selected" : ""}>매니저</option>
            <option value="admin"   ${a.role === "admin"   ? "selected" : ""}>관리자</option>
          </select>
        </td>
        <td>
          <span style="color:${a.is_active ? "var(--good)" : "var(--bad)"}">
            ${a.is_active ? "● 활성" : "○ 비활성"}
          </span>
        </td>
        <td style="text-align:center;white-space:nowrap">
          <button class="sa-saveBtn secondary" data-id="${a.id}" style="padding:4px 10px;font-size:12px;margin-right:4px">저장</button>
          <button class="sa-toggleBtn ${a.is_active ? "secondary" : ""}" data-id="${a.id}" data-active="${a.is_active}" style="padding:4px 10px;font-size:12px">
            ${a.is_active ? "비활성화" : "활성화"}
          </button>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll(".sa-saveBtn").forEach(btn => {
      btn.addEventListener("click", () => saveEdit(btn.dataset.id));
    });
    tbody.querySelectorAll(".sa-toggleBtn").forEach(btn => {
      btn.addEventListener("click", () => toggleActive(btn.dataset.id, btn.dataset.active === "true"));
    });
  }

  async function saveNew() {
    const statusEl = document.getElementById("sa_addStatus");
    const name    = document.getElementById("sa_name").value.trim();
    const email   = document.getElementById("sa_email").value.trim().toLowerCase();
    const role    = document.getElementById("sa_role").value;
    const storeId = document.getElementById("sa_store").value || null;

    if (!name || !email) {
      statusEl.style.color = "var(--bad)";
      statusEl.textContent = "이름과 이메일은 필수입니다.";
      return;
    }

    statusEl.style.color = "";
    statusEl.textContent = "등록 중...";
    document.getElementById("sa_saveNewBtn").disabled = true;
    try {
      await sbPost(
        "staff_accounts",
        { tenant_id: TENANT_ID, email, name, role, store_id: storeId, is_active: true },
        { "Prefer": "return=representation" }
      );

      statusEl.style.color = "var(--good)";
      statusEl.innerHTML =
        `✓ 1단계 완료 — <strong>${email}</strong> 직원 정보가 저장됐습니다.<br>` +
        `<span style="color:#c8b96a">Supabase Dashboard → Authentication → Users → Add user 에서 동일한 이메일로 Auth 계정을 생성해주세요.</span>`;

      document.getElementById("sa_name").value  = "";
      document.getElementById("sa_email").value = "";
      await loadAll();
    } catch (err) {
      statusEl.style.color = "var(--bad)";
      statusEl.textContent = "오류: " + err.message;
    } finally {
      document.getElementById("sa_saveNewBtn").disabled = false;
    }
  }

  async function saveEdit(id) {
    const statusEl = document.getElementById("sa_status");
    const row      = document.querySelector(`tr[data-id="${id}"]`);
    const role     = row.querySelector(".sa-roleSelect").value;
    const storeId  = row.querySelector(".sa-storeSelect").value || null;
    statusEl.textContent = "저장 중...";
    try {
      await sbPatch("staff_accounts?id=eq." + id, { role, store_id: storeId });
      statusEl.textContent = "저장됨";
      await loadAll();
    } catch (err) {
      statusEl.textContent = "오류: " + err.message;
    }
  }

  async function toggleActive(id, isActive) {
    const statusEl = document.getElementById("sa_status");
    const msg = isActive ? "이 계정을 비활성화하시겠습니까?" : "이 계정을 활성화하시겠습니까?";
    if (!confirm(msg)) return;
    statusEl.textContent = "처리 중...";
    try {
      await sbPatch("staff_accounts?id=eq." + id, { is_active: !isActive });
      statusEl.textContent = isActive ? "비활성화됨" : "활성화됨";
      await loadAll();
    } catch (err) {
      statusEl.textContent = "오류: " + err.message;
    }
  }

  return { render };
})();
