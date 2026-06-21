async function login(email, password) {
  const res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "로그인 실패");
  localStorage.setItem("wevape_access_token", data.access_token);
  localStorage.setItem("wevape_user_email", email);
  return data;
}

function logout() {
  localStorage.removeItem("wevape_access_token");
  localStorage.removeItem("wevape_user_email");
  location.reload();
}

function isLoggedIn() {
  return !!getAccessToken();
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
