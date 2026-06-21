// Supabase 프로젝트 연결 정보
const SUPABASE_URL = "https://tzloiuzblkkrdvljyrdv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_He7HIvKcn0FqwX22B7AGcg_Vbc-oFU-";

function getAccessToken() {
  return localStorage.getItem("wevape_access_token");
}

function authHeaders() {
  const token = getAccessToken();
  return {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": "Bearer " + (token || SUPABASE_ANON_KEY),
    "Content-Type": "application/json"
  };
}

async function sbGet(path) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbPost(path, body, extraHeaders) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: "POST",
    headers: { ...authHeaders(), ...(extraHeaders || {}) },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json().catch(() => null);
}

async function sbRpc(fnName, args) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + fnName, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbPatch(path, body) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json().catch(() => null);
}

function fmtWon(n) {
  return Math.round(n || 0).toLocaleString() + "원";
}
