const TOKEN_KEY   = "wevape_access_token";
const REFRESH_KEY = "wevape_refresh_token";
const EXPIRES_KEY = "wevape_token_expires_at";
const EMAIL_KEY   = "wevape_user_email";
const ROLE_KEY    = "wevape_role";
const USER_NAME_KEY  = "wevape_user_name";
const USER_STORE_KEY = "wevape_user_store_id";

let refreshTimer = null;

function storeSession(data, email) {
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(REFRESH_KEY, data.refresh_token);
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + (data.expires_in || 3600) * 1000));
  if (email) localStorage.setItem(EMAIL_KEY, email);
}

async function loadStaffAccount(email) {
  const rows = await sbGet(
    "staff_accounts?select=name,role,store_id,is_active" +
    "&email=eq." + encodeURIComponent(email) +
    "&tenant_id=eq." + TENANT_ID +
    "&limit=1"
  );
  if (!rows.length) throw new Error("등록된 직원 계정이 없습니다. 관리자에게 문의하세요.");
  const acct = rows[0];
  if (!acct.is_active) throw new Error("비활성화된 계정입니다. 관리자에게 문의하세요.");
  localStorage.setItem(ROLE_KEY, acct.role);
  localStorage.setItem(USER_NAME_KEY, acct.name);
  if (acct.store_id) {
    localStorage.setItem(USER_STORE_KEY, acct.store_id);
    localStorage.setItem("wevape_default_store", acct.store_id);
  } else {
    localStorage.removeItem(USER_STORE_KEY);
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
