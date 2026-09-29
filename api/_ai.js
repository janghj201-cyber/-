// AI 공통 — api/ai(도우미) · api/ai-brief(아침 요약) · api/ai-learn(주간 정리)가 같이 쓴다. 파일 이름이 _ 로 시작해 주소로는 안 열린다.
// 원칙: 모델을 다시 훈련하지 않는다. 회사 업무 노트(ai_notes) + 권한 안의 최근 기록을 그때그때 읽힌다.
//      손님 이름 · 전화번호 · 이메일은 AI 로 보내기 전에 가린다. AI 는 제안만 — 저장 · 확정은 사람이.
// 필요 env: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, (선택) AI_MODEL_FAST, AI_MODEL_SMART
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vbuhueykvizmnrfvkehq.supabase.co';
const MODEL_FAST = process.env.AI_MODEL_FAST || 'claude-haiku-4-5';
const MODEL_SMART = process.env.AI_MODEL_SMART || 'claude-sonnet-4-6';

// 서비스 키로 읽기 · 쓰기(서버 전용)
function svc() {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const h = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  return {
    get: async (path) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: h }); if (!r.ok) throw new Error(`${path.split('?')[0]}: ${(await r.text()).slice(0, 200)}`); return r.json(); },
    count: async (path) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'HEAD', headers: { ...h, Prefer: 'count=exact' } }); const c = r.headers.get('content-range') || ''; return Number(c.split('/')[1]) || 0; },
    post: async (table, row, prefer) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: { ...h, Prefer: prefer || 'return=representation' }, body: JSON.stringify(row) }); if (!r.ok) throw new Error(`${table}: ${(await r.text()).slice(0, 200)}`); const t = await r.text(); return t ? JSON.parse(t) : null; },
    patch: async (path, row) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(row) }); if (!r.ok) throw new Error(`${path.split('?')[0]}: ${(await r.text()).slice(0, 200)}`); },
    del: async (path) => { await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'DELETE', headers: h }).catch(() => {}); },
  };
}
// 로그인한 사람의 토큰으로 읽기 — RLS 가 그대로 걸린다(직원이 못 보는 것은 AI 도 못 본다)
function asUser(token) {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${(await r.text()).slice(0, 160)}`);
    return r.json();
  };
}
async function userOf(token) {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
  if (!u.ok) return null;
  return (await u.json()).id || null;
}

// 개인정보 가리기 — 전화 · 이메일 · 주민번호 · 카드번호 모양
function mask(t) {
  return String(t == null ? '' : t)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[이메일]')
    .replace(/\b\d{6}\s*-\s*[1-4]\d{6}\b/g, '[주민번호]')
    .replace(/\b(?:\d[ -]?){13,16}\b/g, '[번호]')
    .replace(/(?:\+?82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, '[전화]')
    .replace(/\b0\d{1,2}[-\s.]\d{3,4}[-\s.]\d{4}\b/g, '[전화]');
}

// 한국 시각 날짜
function kstDate(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3);
  return d.toISOString().slice(0, 10);
}

// Claude 부르기 — 앞부분(안내 지식)은 캐시해서 같은 설명을 매번 제값 내지 않는다
async function claude({ model, system, cacheSystem, messages, maxTokens = 700 }) {
  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) throw Object.assign(new Error('ANTHROPIC_API_KEY 미설정'), { code: 'nokey' });
  const sys = [];
  if (cacheSystem) sys.push({ type: 'text', text: cacheSystem, cache_control: { type: 'ephemeral' } });
  if (system) sys.push({ type: 'text', text: system });
  const call = async (m) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: m, max_tokens: maxTokens, system: sys, messages }),
  });
  let r = await call(model);
  // 모델 이름이 바뀌었으면(404) 가벼운 모델로 한 번 더
  if (r.status === 404 && model !== MODEL_FAST) r = await call(MODEL_FAST);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || `AI ${r.status}`), { code: r.status === 429 ? 'busy' : 'ai' });
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  const u = j.usage || {};
  return { text, model: j.model || model, tin: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), tout: u.output_tokens || 0 };
}

// 답에서 JSON 한 덩어리 꺼내기 — 앞뒤 말이 붙어 와도
function pickJson(t) {
  const s = String(t || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}

// 회사 AI 가 켜져 있나 — 설정 › 기능 켜기/끄기의 「AI 도우미」. 없으면 켜짐
async function aiOn(sb, T) {
  try { const r = await sb.get(`tenant_settings?select=features&tenant_id=eq.${T}`); const f = (r[0] && r[0].features) || {}; return f.ai !== false; }
  catch (e) { return true; }
}
// 업무 노트 — 규칙 먼저, 배운 것 다음
async function notesOf(sb, T) {
  try {
    const r = await sb.get(`ai_notes?select=kind,body&tenant_id=eq.${T}&active=eq.true&order=kind.desc,created_at.asc&limit=60`);
    return r;
  } catch (e) { return []; }
}
function notesText(notes) {
  const rule = notes.filter((n) => n.kind === 'rule').map((n) => `- ${n.body}`);
  const learned = notes.filter((n) => n.kind === 'learned').map((n) => `- ${n.body}`);
  return [rule.length ? `우리 회사 규칙(대표 · 매니저가 적음 — 가장 우선):\n${rule.join('\n')}` : '', learned.length ? `지금까지 배운 것(지난 질문 · 고쳐 준 말에서):\n${learned.join('\n')}` : ''].filter(Boolean).join('\n\n') || '(아직 없음)';
}

module.exports = { SUPABASE_URL, MODEL_FAST, MODEL_SMART, svc, asUser, userOf, mask, kstDate, claude, pickJson, aiOn, notesOf, notesText };
