const TOKEN_KEY   = "wevape_access_token";
const REFRESH_KEY = "wevape_refresh_token";
const EXPIRES_KEY = "wevape_token_expires_at";
const EMAIL_KEY   = "wevape_user_email";
const ROLE_KEY    = "wevape_role";
const USER_NAME_KEY  = "wevape_user_name";
const USER_STORE_KEY = "wevape_user_store_id";

let refreshTimer = null;

function storeSession(data, email) {
  // 신형 Supabase(sb_publishable_* 키)는 { session: { access_token, ... }, user: {...} } 형태로 응답
  // 구형 또는 표준 응답은 { access_token, ... } 형태
  const s = data?.session ?? data;
  console.log("[auth:storeSession] 응답 최상위 키:", Object.keys(data || {}));
  console.log("[auth:storeSession] session 객체 키:", Object.keys(s || {}));
  console.log("[auth:storeSession] access_token 앞30자:", (s.access_token || "").slice(0, 30) || "(없음)");
  localStorage.setItem(TOKEN_KEY,   s.access_token  || "");
  localStorage.setItem(REFRESH_KEY, s.refresh_token || "");
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + ((s.expires_in || 3600) * 1000)));
  if (email) localStorage.setItem(EMAIL_KEY, email);
  if (!s.access_token) console.error("[auth] access_token 없음 — 응답 구조:", JSON.stringify(data).slice(0, 300));
}

async function loadStaffAccount(email) {
  const token = getAccessToken();
  console.log("[auth:loadStaffAccount] email:", email);
  console.log("[auth:loadStaffAccount] token 존재?", !!token, "/ 앞20자:", (token || "").slice(0, 20) || "(없음)");
  if (!token) throw new Error("인증 토큰 저장 실패. 페이지를 새로고침 후 다시 로그인해주세요.");

  // 이전 세션의 role·store 잔여 데이터를 쿼리 전에 먼저 초기화
  [ROLE_KEY, USER_NAME_KEY, USER_STORE_KEY, "wevape_default_store"].forEach(k => localStorage.removeItem(k));

  const queryPath =
    "staff_accounts?select=name,role,store_id,is_active" +
    "&email=eq." + encodeURIComponent(email.toLowerCase()) +
    "&tenant_id=eq." + TENANT_ID +
    "&order=created_at.desc&limit=1";
  const fullUrl = SUPABASE_URL + "/rest/v1/" + queryPath;
  const hdrs = authHeaders();
  console.log("[auth:loadStaffAccount] 요청 URL:", fullUrl);
  console.log("[auth:loadStaffAccount] Authorization 헤더:", hdrs.Authorization.slice(0, 40) + "...");

  // 원시 fetch로 응답 전체 확인
  const rawRes = await fetch(fullUrl, { headers: hdrs });
  const rawText = await rawRes.text();
  console.log("[auth:loadStaffAccount] 응답 status:", rawRes.status);
  console.log("[auth:loadStaffAccount] 응답 body:", rawText);

  if (!rawRes.ok) throw new Error(rawText);
  const rows = JSON.parse(rawText);

  if (!rows.length) throw new Error("등록된 직원 계정이 없습니다. 관리자에게 문의하세요.");
  const acct = rows[0];
  if (!acct.is_active) throw new Error("비활성화된 계정입니다. 관리자에게 문의하세요.");

  localStorage.setItem(ROLE_KEY, acct.role);
  localStorage.setItem(USER_NAME_KEY, acct.name);
  if (acct.store_id) {
    localStorage.setItem(USER_STORE_KEY, acct.store_id);
    localStorage.setItem("wevape_default_store", acct.store_id);
  }
  return acct;
}

async function login(email, password) {
  const res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "로그인 실패");
  storeSession(data, email);
  return data;
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const data = await res.json();
    if (!res.ok) return false;
    storeSession(data);
    scheduleTokenRefresh();
    return true;
  } catch (err) {
    return false;
  }
}

function scheduleTokenRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  const expiresAt = parseInt(localStorage.getItem(EXPIRES_KEY), 10);
  if (!expiresAt) return;
  const delay = expiresAt - Date.now() - 5 * 60 * 1000;
  refreshTimer = setTimeout(async () => {
    const ok = await refreshAccessToken();
    if (!ok) forceLogout();
  }, Math.max(delay, 0));
}

function forceLogout() {
  if (refreshTimer) clearTimeout(refreshTimer);
  [TOKEN_KEY, REFRESH_KEY, EXPIRES_KEY, EMAIL_KEY, ROLE_KEY, USER_NAME_KEY, USER_STORE_KEY]
    .forEach(k => localStorage.removeItem(k));
  location.reload();
}

function logout() { forceLogout(); }

async function isLoggedIn() {
  const token = getAccessToken();
  if (!token) return false;
  const expiresAt = parseInt(localStorage.getItem(EXPIRES_KEY), 10);
  if (expiresAt && Date.now() >= expiresAt - 5 * 1000) {
    return await refreshAccessToken();
  }
  return true;
}

// ── 로그인 폼 이벤트 ─────────────────────────────────────────────────────────

document.getElementById("loginEmail").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("loginPassword").focus();
});

document.getElementById("loginPassword").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl    = document.getElementById("loginError");
  const btn      = document.getElementById("loginBtn");
  errEl.textContent = "";
  if (!email || !password) { errEl.textContent = "이메일과 비밀번호를 입력해주세요."; return; }
  btn.disabled = true;
  btn.textContent = "로그인 중...";
  try {
    await login(email, password);
    await loadStaffAccount(email);
    location.reload();
  } catch (err) {
    errEl.textContent = err.message;
    btn.disabled = false;
    btn.textContent = "로그인";
  }
});

document.getElementById("logoutBtn").addEventListener("click", logout);
