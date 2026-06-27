// Supabase 프로젝트 연결 정보
const SUPABASE_URL = "https://tzloiuzblkkrdvljyrdv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_He7HIvKcn0FqwX22B7AGcg_Vbc-oFU-";
const TENANT_ID = "d17327a2-6b94-4d09-a3b8-7014630ddd14";

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

async function isTokenExpiredError(res) {
  try {
    const data = await res.clone().json();
    return !!(data && data.code === "PGRST303");
  } catch (err) {
    return false;
  }
}

let refreshInFlight = null;

async function sbFetch(url, options) {
  const opts = options || {};
  const doFetch = () => fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });

  let res = await doFetch();
  if (!res.ok && (await isTokenExpiredError(res))) {
    if (!refreshInFlight) {
      refreshInFlight = refreshAccessToken().finally(() => { refreshInFlight = null; });
    }
    const refreshed = await refreshInFlight;
    if (refreshed) {
      res = await doFetch();
    } else {
      forceLogout();
      throw new Error("세션이 만료되었습니다. 다시 로그인해주세요.");
    }
  }
  return res;
}

async function sbGet(path) {
  const res = await sbFetch(SUPABASE_URL + "/rest/v1/" + path);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbPost(path, body, extraHeaders) {
  const res = await sbFetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: "POST",
    headers: extraHeaders,
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json().catch(() => null);
}

async function sbRpc(fnName, args) {
  const res = await sbFetch(SUPABASE_URL + "/rest/v1/rpc/" + fnName, {
    method: "POST",
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbPatch(path, body) {
  const res = await sbFetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json().catch(() => null);
}

async function sbDelete(path) {
  const res = await sbFetch(SUPABASE_URL + "/rest/v1/" + path, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json().catch(() => null);
}

function fmtWon(n) {
  return Math.round(n || 0).toLocaleString() + "원";
}
