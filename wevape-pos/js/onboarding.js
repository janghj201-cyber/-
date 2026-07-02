// ── 온보딩(초기 설정 마법사) + 기능 관리 ─────────────────────────────────────

const ONBOARD_COMPLETE_KEY = "wevape_onboarding_complete";
const ONBOARD_DRAFT_KEY    = "wevape_onboarding_draft";
const FEATURES_KEY         = "wevape_features";
const COMPANY_KEY          = "wevape_company";

const BUSINESS_TYPES = ["전자담배", "카페", "편의점", "의류", "기타"];

// 기능 키 ↔ 사이드바 탭 매핑. 여기 없는 탭은 기능 토글 대상이 아님(항상 표시).
const FEATURE_DEFS = [
  { key: "crm",           label: "고객관리 (CRM)",                    tabs: ["customers"] },
  { key: "reports",       label: "매출 리포트 (시간대별/매장별/상품별)", tabs: ["dashboard", "hourly-stats", "store-compare", "product-trend"] },
  { key: "reorder",       label: "발주 알림",                          tabs: ["reorder-report"] },
  { key: "sales_summary", label: "분류별 매출집계",                    tabs: ["sales-summary"] },
  { key: "notices",       label: "공지사항 발송",                      tabs: ["notices"] },
  { key: "export",        label: "데이터 내보내기 (엑셀)",             tabs: ["export"] },
];

function defaultFeatures() {
  return { crm: true, reports: true, reorder: true, sales_summary: true, notices: false, export: false };
}

function loadFeatures() {
  try {
    const raw = localStorage.getItem(FEATURES_KEY);
    if (raw) return { ...defaultFeatures(), ...JSON.parse(raw) };
  } catch (err) {}
  return defaultFeatures();
}

function getFeatureKeyForTab(tab) {
  const def = FEATURE_DEFS.find(f => f.tabs.includes(tab));
  return def ? def.key : null;
}

function isFeatureEnabled(tab) {
  const key = getFeatureKeyForTab(tab);
  if (!key) return true;
  return !!loadFeatures()[key];
}

// ── 온보딩 진입 여부 판단 ─────────────────────────────────────────────────────

function needsOnboarding() {
  const params = new URLSearchParams(location.search);
  if (params.get("setup") === "true") {
    if (localStorage.getItem(ONBOARD_COMPLETE_KEY)) {
      const ok = confirm(
        "이미 설정이 완료되어 있습니다. 온보딩을 다시 진행하시겠습니까?\n" +
        "(기존 매장/계정 데이터는 삭제되지 않지만, 설정 마법사를 처음부터 다시 입력하게 됩니다.)"
      );
      if (!ok) {
        history.replaceState(null, "", location.pathname);
        return false;
      }
      localStorage.removeItem(ONBOARD_COMPLETE_KEY);
      localStorage.removeItem(ONBOARD_DRAFT_KEY);
    }
    return true;
  }
  return !localStorage.getItem(ONBOARD_COMPLETE_KEY);
}

// ── 온보딩 마법사 ─────────────────────────────────────────────────────────────

const OnboardingModule = (() => {
  let state = null;
  let step  = 1; // 1~4 = 입력 단계, 5 = 완료 화면

  function freshState() {
    return {
      company_name: "", business_type: "전자담배", owner_name: "", phone: "",
      stores: [""],
      features: defaultFeatures(),
      admin_name: "", admin_email: "", admin_password: "", admin_password2: "",
    };
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(ONBOARD_DRAFT_KEY);
      if (raw) return { ...freshState(), ...JSON.parse(raw) };
    } catch (err) {}
    return freshState();
  }

  function saveDraft() {
    const { admin_password, admin_password2, ...safe } = state;
    localStorage.setItem(ONBOARD_DRAFT_KEY, JSON.stringify(safe));
  }

  function start() {
    state = loadDraft();
    step = 1;
    document.getElementById("loginView").style.display = "none";
    document.getElementById("appView").style.display = "none";
    document.getElementById("onboardingView").style.display = "flex";
    render();
  }

  function render() {
    if (step === 5) return renderComplete();
    const el = document.getElementById("onboardingView");
    el.innerHTML = `
      <div class="ob-card">
        ${stepHeader()}
        ${step === 1 ? renderStep1() : ""}
        ${step === 2 ? renderStep2() : ""}
        ${step === 3 ? renderStep3() : ""}
        ${step === 4 ? renderStep4() : ""}
      </div>
    `;
    bindStep();
  }

  function stepHeader() {
    const dots = [1, 2, 3, 4].map(n => `<span class="ob-dot ${n <= step ? "on" : ""}"></span>`).join("");
    return `
      <div class="ob-header">
        <span class="ob-logo">🏪 POS 초기 설정</span>
        <span class="ob-progress">${step}/4 ${dots}</span>
      </div>
    `;
  }

  // ── Step 1: 업체 기본 정보 ───────────────────────────────────────────────

  function renderStep1() {
    return `
      <h2 class="ob-title">업체 기본 정보를 입력해주세요</h2>
      <label class="ob-label">업체명 *</label>
      <input id="ob_companyName" type="text" value="${escapeAttr(state.company_name)}" placeholder="예: 위베이프" />

      <label class="ob-label">업종</label>
      <select id="ob_businessType">
        ${BUSINESS_TYPES.map(t => `<option value="${t}" ${t === state.business_type ? "selected" : ""}>${t}</option>`).join("")}
      </select>

      <label class="ob-label">대표자명</label>
      <input id="ob_ownerName" type="text" value="${escapeAttr(state.owner_name)}" placeholder="대표자 이름" />

      <label class="ob-label">연락처</label>
      <input id="ob_phone" type="text" value="${escapeAttr(state.phone)}" placeholder="010-0000-0000" />

      <div id="ob_error" class="ob-error"></div>
      <div class="ob-actions">
        <span></span>
        <button id="ob_next">다음 단계 →</button>
      </div>
    `;
  }

  function bindStep1() {
    document.getElementById("ob_next").addEventListener("click", () => {
      const name = document.getElementById("ob_companyName").value.trim();
      if (!name) return showError("업체명을 입력해주세요.");
      state.company_name  = name;
      state.business_type = document.getElementById("ob_businessType").value;
      state.owner_name    = document.getElementById("ob_ownerName").value.trim();
      state.phone         = document.getElementById("ob_phone").value.trim();
      saveDraft();
      step = 2;
      render();
    });
  }

  // ── Step 2: 매장 설정 ────────────────────────────────────────────────────

  function renderStep2() {
    return `
      <h2 class="ob-title">운영 중인 매장을 등록해주세요</h2>
      <div class="ob-hint">나중에 언제든지 추가/수정 가능합니다.</div>

      <div id="ob_storeRows">
        ${state.stores.map((name, i) => `
          <div class="ob-storeRow">
            <input type="text" class="ob-storeInput" data-idx="${i}" value="${escapeAttr(name)}" placeholder="매장 ${i + 1}" />
            <button type="button" class="secondary ob-storeRemove" data-idx="${i}" ${state.stores.length <= 1 ? "disabled" : ""}>삭제</button>
          </div>
        `).join("")}
      </div>
      <button type="button" id="ob_addStore" class="secondary" ${state.stores.length >= 20 ? "disabled" : ""}>+ 매장 추가</button>

      <div id="ob_error" class="ob-error"></div>
      <div class="ob-actions">
        <button id="ob_back" class="secondary">← 이전</button>
        <button id="ob_next">다음 단계 →</button>
      </div>
    `;
  }

  function bindStep2() {
    document.getElementById("ob_addStore").addEventListener("click", () => {
      collectStoreInputs();
      if (state.stores.length >= 20) return;
      state.stores.push("");
      render();
    });
    document.querySelectorAll(".ob-storeRemove").forEach(btn => {
      btn.addEventListener("click", () => {
        collectStoreInputs();
        if (state.stores.length <= 1) return;
        state.stores.splice(Number(btn.dataset.idx), 1);
        render();
      });
    });
    document.getElementById("ob_back").addEventListener("click", () => {
      collectStoreInputs();
      saveDraft();
      step = 1;
      render();
    });
    document.getElementById("ob_next").addEventListener("click", () => {
      collectStoreInputs();
      const names = state.stores.map(s => s.trim()).filter(Boolean);
      if (!names.length) return showError("매장을 1개 이상 등록해주세요.");
      state.stores = names;
      saveDraft();
      step = 3;
      render();
    });
  }

  function collectStoreInputs() {
    document.querySelectorAll(".ob-storeInput").forEach(input => {
      state.stores[Number(input.dataset.idx)] = input.value;
    });
  }

  // ── Step 3: 기능 선택 ────────────────────────────────────────────────────

  function renderStep3() {
    return `
      <h2 class="ob-title">사용할 기능을 선택해주세요</h2>
      <div class="ob-hint">나중에 설정에서 추가/제외 가능합니다.</div>

      <div class="ob-featureGroup">
        <div class="ob-featureGroupTitle">기본 기능 (항상 포함)</div>
        <div class="ob-featureRow disabled">✅ 판매 / 주문입력</div>
        <div class="ob-featureRow disabled">✅ 환불</div>
        <div class="ob-featureRow disabled">✅ 재고관리 (입고/이동/실사)</div>
        <div class="ob-featureRow disabled">✅ 영업 시작 / 마감</div>
      </div>

      <div class="ob-featureGroup">
        <div class="ob-featureGroupTitle">선택 기능</div>
        ${FEATURE_DEFS.map(f => `
          <label class="ob-featureRow">
            <input type="checkbox" class="ob-featureToggle" data-key="${f.key}" ${state.features[f.key] ? "checked" : ""} />
            <span>${f.label}</span>
          </label>
        `).join("")}
      </div>

      <div class="ob-actions">
        <button id="ob_back" class="secondary">← 이전</button>
        <button id="ob_next">다음 단계 →</button>
      </div>
    `;
  }

  function bindStep3() {
    document.getElementById("ob_back").addEventListener("click", () => {
      step = 2;
      render();
    });
    document.getElementById("ob_next").addEventListener("click", () => {
      document.querySelectorAll(".ob-featureToggle").forEach(cb => {
        state.features[cb.dataset.key] = cb.checked;
      });
      saveDraft();
      step = 4;
      render();
    });
  }

  // ── Step 4: 관리자 계정 생성 ─────────────────────────────────────────────

  function renderStep4() {
    return `
      <h2 class="ob-title">관리자 계정을 만들어주세요</h2>

      <label class="ob-label">이름 *</label>
      <input id="ob_adminName" type="text" value="${escapeAttr(state.admin_name)}" placeholder="관리자 이름" />

      <label class="ob-label">이메일 *</label>
      <input id="ob_adminEmail" type="email" value="${escapeAttr(state.admin_email)}" placeholder="admin@example.com" />

      <label class="ob-label">비밀번호 *</label>
      <input id="ob_adminPassword" type="password" placeholder="6자 이상" />

      <label class="ob-label">비밀번호 확인 *</label>
      <input id="ob_adminPassword2" type="password" placeholder="비밀번호 확인" />

      <div class="ob-warn">⚠️ 이 계정은 모든 기능에 접근 가능한 관리자 계정입니다.</div>

      <div id="ob_error" class="ob-error"></div>
      <div class="ob-actions">
        <button id="ob_back" class="secondary">← 이전</button>
        <button id="ob_finish">설정 완료</button>
      </div>
    `;
  }

  function bindStep4() {
    document.getElementById("ob_back").addEventListener("click", () => {
      state.admin_name  = document.getElementById("ob_adminName").value.trim();
      state.admin_email = document.getElementById("ob_adminEmail").value.trim();
      saveDraft();
      step = 3;
      render();
    });
    document.getElementById("ob_finish").addEventListener("click", () => {
      const name      = document.getElementById("ob_adminName").value.trim();
      const email     = document.getElementById("ob_adminEmail").value.trim().toLowerCase();
      const password  = document.getElementById("ob_adminPassword").value;
      const password2 = document.getElementById("ob_adminPassword2").value;

      if (!name || !email || !password || !password2) return showError("모든 필수 항목을 입력해주세요.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("올바른 이메일 형식이 아닙니다.");
      if (password.length < 6) return showError("비밀번호는 6자 이상이어야 합니다.");
      if (password !== password2) return showError("비밀번호가 일치하지 않습니다.");

      state.admin_name     = name;
      state.admin_email    = email;
      state.admin_password = password;
      saveDraft();
      step = 5;
      runSetup();
    });
  }

  function bindStep() {
    if (step === 1) bindStep1();
    if (step === 2) bindStep2();
    if (step === 3) bindStep3();
    if (step === 4) bindStep4();
  }

  function showError(msg) {
    const el = document.getElementById("ob_error");
    if (el) el.textContent = msg;
  }

  // ── Step 5: 완료 화면 + 자동 설정 ────────────────────────────────────────

  function renderComplete() {
    const el = document.getElementById("onboardingView");
    const activeCount = Object.values(state.features).filter(Boolean).length;
    el.innerHTML = `
      <div class="ob-card ob-complete">
        <div class="ob-emoji">🎉</div>
        <h2 class="ob-title" style="text-align:center">설정이 완료됐습니다!</h2>

        <div class="ob-summary">
          <div><span>업체명</span><strong>${escapeHtml(state.company_name)}</strong></div>
          <div><span>매장 수</span><strong>${state.stores.length}개</strong></div>
          <div><span>관리자</span><strong>${escapeHtml(state.admin_name)}</strong></div>
          <div><span>활성 기능</span><strong>${activeCount}개</strong></div>
        </div>

        <div id="ob_progressList" class="ob-progressList"></div>
        <div id="ob_completeError" class="ob-error"></div>

        <div class="ob-actions" style="justify-content:center">
          <button id="ob_startBtn" style="display:none;min-width:200px">POS 시작하기 →</button>
          <button id="ob_retryBtn" class="secondary" style="display:none">← 이전으로 돌아가서 수정</button>
        </div>
      </div>
    `;
  }

  function setProgress(lines) {
    const el = document.getElementById("ob_progressList");
    if (el) el.innerHTML = lines.map(l => `<div>${l}</div>`).join("");
  }

  async function runSetup() {
    renderComplete();
    const lines = ["⏳ 설정을 저장하는 중..."];
    setProgress(lines);

    try {
      // 1) 관리자 계정 생성 — 이메일 중복 등 오류를 가장 먼저 확인하고,
      //    이후 매장/직원 등록은 새로 발급된 인증 세션으로 진행한다.
      const signupRes = await fetch(SUPABASE_URL + "/auth/v1/signup", {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.admin_email, password: state.admin_password }),
      });
      const signupData = await signupRes.json();
      if (!signupRes.ok) {
        const msg = signupData.msg || signupData.error_description || signupData.error || "";
        if (/registered|already exists|user_already_exists/i.test(msg)) {
          throw new Error("이미 가입된 이메일입니다. 다른 이메일을 사용해주세요.");
        }
        throw new Error(msg || "관리자 계정 생성에 실패했습니다.");
      }
      if (signupData.session || signupData.access_token) {
        storeSession(signupData, state.admin_email);
      }
      lines.push("✅ 관리자 계정 생성 완료");
      setProgress(lines);

      // 2) 매장 등록
      await Promise.all(
        state.stores.map(name => sbPost("stores", { tenant_id: TENANT_ID, name }))
      );
      lines.push(`✅ 매장 ${state.stores.length}개 등록 완료`);
      setProgress(lines);

      // 3) staff_accounts 등록 (admin, store_id: null)
      await sbPost(
        "staff_accounts",
        { tenant_id: TENANT_ID, email: state.admin_email, name: state.admin_name, role: "admin", store_id: null, is_active: true },
        { "Prefer": "return=representation" }
      );

      // 4) localStorage 저장
      localStorage.setItem(FEATURES_KEY, JSON.stringify(state.features));
      localStorage.setItem(COMPANY_KEY, state.company_name);
      localStorage.setItem(ONBOARD_COMPLETE_KEY, "true");
      localStorage.removeItem(ONBOARD_DRAFT_KEY);
      lines.push("✅ 기능 설정 완료");
      setProgress(lines);

      document.getElementById("ob_startBtn").style.display = "";
      document.getElementById("ob_startBtn").addEventListener("click", goToLogin);
    } catch (err) {
      const errEl = document.getElementById("ob_completeError");
      if (errEl) errEl.textContent = "오류: " + err.message;
      const retryBtn = document.getElementById("ob_retryBtn");
      retryBtn.style.display = "";
      retryBtn.addEventListener("click", () => { step = 4; render(); });
    }
  }

  function goToLogin() {
    // 온보딩 중 임시로 저장된 인증 세션을 정리하고, 관리자가 직접 로그인하도록 한다.
    [TOKEN_KEY, REFRESH_KEY, EXPIRES_KEY].forEach(k => localStorage.removeItem(k));
    document.getElementById("onboardingView").style.display = "none";
    document.getElementById("loginView").style.display = "block";
    const emailInput = document.getElementById("loginEmail");
    if (emailInput) emailInput.value = state.admin_email;
    document.getElementById("loginPassword")?.focus();
  }

  return { start };
})();

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

// ── 설정 → 기능 관리 ──────────────────────────────────────────────────────────

const FeatureManagementModule = (() => {
  function render() {
    const el = document.getElementById("panel-feature-management");
    const features = loadFeatures();
    el.innerHTML = `
      <h2 class="pageTitle">기능 관리</h2>

      <div class="card" style="margin-bottom:12px">
        <div style="font-weight:700;margin-bottom:10px">기본 기능 (변경 불가)</div>
        <div class="muted">✅ 판매/주문입력 &nbsp; ✅ 재고관리 &nbsp; ✅ 영업시작/마감</div>
      </div>

      <div class="card">
        <div style="font-weight:700;margin-bottom:12px">선택 기능</div>
        ${FEATURE_DEFS.map(f => `
          <label class="row" style="justify-content:space-between;padding:10px 4px;border-bottom:1px solid var(--line);cursor:pointer">
            <span>${f.label}</span>
            <input type="checkbox" class="fm-toggle" data-key="${f.key}" ${features[f.key] ? "checked" : ""} />
          </label>
        `).join("")}
        <button id="fm_saveBtn" style="margin-top:14px;width:100%">저장</button>
        <div id="fm_status" class="muted" style="margin-top:8px"></div>
      </div>
    `;
    document.getElementById("fm_saveBtn").addEventListener("click", save);
  }

  function save() {
    const features = loadFeatures();
    document.querySelectorAll(".fm-toggle").forEach(cb => { features[cb.dataset.key] = cb.checked; });
    localStorage.setItem(FEATURES_KEY, JSON.stringify(features));
    if (typeof applyRoleBasedUI === "function") applyRoleBasedUI();
    document.getElementById("fm_status").textContent = "저장됨 — 사이드바 메뉴에 반영되었습니다.";
  }

  return { render };
})();
