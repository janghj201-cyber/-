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
          <input id="sa_name"  type="text"     placeholder="이름 *"    style="flex:1" />
          <input id="sa_email" type="email"    placeholder="이메일 *"  style="flex:2" />
        </div>
        <div class="row" style="margin-bottom:8px">
          <input id="sa_password" type="password" placeholder="초기 비밀번호 * (8자 이상)" style="flex:2" />
          <select id="sa_role" style="flex:1">
            <option value="staff">직원</option>
            <option value="manager">매니저</option>
            <option value="admin">관리자</option>
          </select>
          <select id="sa_store" style="flex:1"><option value="">매장 없음</option></select>
        </div>
        <div class="muted" style="margin-bottom:10px;font-size:12px">
          ℹ️ 이메일 확인 없이 즉시 로그인 가능하게 하려면 Supabase Dashboard → Authentication → Providers → Email → "Confirm email" OFF
        </div>
        <div class="row">
          <button id="sa_saveNewBtn" style="flex:1">등록</button>
          <button id="sa_cancelNewBtn" class="secondary" style="flex:1">취소</button>
        </div>
        <div class="muted" id="sa_addStatus" style="margin-top:8px"></div>
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
          "staff_accounts?select=id,name,email,role,store_id,is_active,stores(name)" +
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
    const name     = document.getElementById("sa_name").value.trim();
    const email    = document.getElementById("sa_email").value.trim();
    const password = document.getElementById("sa_password").value;
    const role     = document.getElementById("sa_role").value;
    const storeId  = document.getElementById("sa_store").value || null;

    if (!name || !email || !password) {
      statusEl.textContent = "이름, 이메일, 비밀번호는 필수입니다.";
      return;
    }
    if (password.length < 8) {
      statusEl.textContent = "비밀번호는 8자 이상이어야 합니다.";
      return;
    }

    statusEl.textContent = "등록 중...";
    document.getElementById("sa_saveNewBtn").disabled = true;
    try {
      // Supabase Auth 계정 생성 (anon key 사용, 이메일 확인 비활성화 권장)
      const signupRes = await fetch(SUPABASE_URL + "/auth/v1/signup", {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const signupData = await signupRes.json();
      if (!signupRes.ok && !signupData.id) {
        // 이미 존재하는 계정이면 계속 진행 (staff_accounts만 추가)
        const errMsg = signupData.msg || signupData.error_description || "";
        if (!errMsg.toLowerCase().includes("already") && !errMsg.toLowerCase().includes("registered")) {
          throw new Error(errMsg || "Auth 계정 생성 실패");
        }
      }

      // staff_accounts 레코드 생성
      await sbPost(
        "staff_accounts",
        { tenant_id: TENANT_ID, email, name, role, store_id: storeId, is_active: true },
        { "Prefer": "return=representation" }
      );

      statusEl.textContent = "✓ 등록 완료";
      ["sa_name", "sa_email", "sa_password"].forEach(id => {
        document.getElementById(id).value = "";
      });
      document.getElementById("sa_addForm").style.display = "none";
      await loadAll();
    } catch (err) {
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
