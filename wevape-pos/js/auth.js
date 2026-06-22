const TOKEN_KEY = "wevape_access_token";
const REFRESH_KEY = "wevape_refresh_token";
const EXPIRES_KEY = "wevape_token_expires_at";
const EMAIL_KEY = "wevape_user_email";

let refreshTimer = null;

function storeSession(data, email) {
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(REFRESH_KEY, data.refresh_token);
  localStorage.setItem(EXPIRES_KEY, String(Date.now() + (data.expires_in || 3600) * 1000));
  if (email) localStorage.setItem(EMAIL_KEY, email);
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
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(EMAIL_KEY);
  location.reload();
}

function logout() {
  forceLogout();
}

async function isLoggedIn() {
  const token = getAccessToken();
  if (!token) return false;
  const expiresAt = parseInt(localStorage.getItem(EXPIRES_KEY), 10);
  if (expiresAt && Date.now() >= expiresAt - 5 * 1000) {
    return await refreshAccessToken();
  }
  return true;
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  if (!email || !password) { errEl.textContent = "이메일과 비밀번호를 입력해주세요."; return; }
  try {
    await login(email, password);
    location.reload();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", logout);
