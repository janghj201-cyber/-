// 홈페이지 「문제 · 의견 보내기」(v6.38) — 로그인 없는 사람도 보낼 수 있게 서버가 대신 넣는다.
// 표: site_reports(SQL_v638). 브라우저는 이 표에 바로 넣지 못한다(insert 정책 없음) — 여기서 서비스 키로만.
// 막는 것: 같은 곳(IP 해시)에서 1분에 1번 · 전체 1시간 200건 · 숨은 칸(로봇이 채움) · 글자 수.
// 운영자 알림은 api/remind-now(매분)가 alerted_at 이 빈 것을 보고 보낸다.
// 필요 env: SUPABASE_SERVICE_ROLE_KEY (이미 있는 것)
const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vbuhueykvizmnrfvkehq.supabase.co';
const KINDS = ['bug', 'inconvenience', 'idea', 'etc'];
const cut = (v, n) => String(v == null ? '' : v).replace(/\s+$/g, '').slice(0, n);

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: '보내기만 됩니다' }); return; }
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY) { res.status(500).json({ ok: false, error: '서버 설정이 아직 안 됐어요' }); return; }
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  // 숨은 칸이 채워져 있으면 로봇 — 받은 척만 한다
  if (b.hp) { res.status(200).json({ ok: true }); return; }
  const body = cut(b.body, 2000).trim();
  if (body.length < 2) { res.status(400).json({ ok: false, error: '내용을 두 글자 이상 적어 주세요' }); return; }
  const kind = KINDS.includes(b.kind) ? b.kind : 'etc';
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const ipHash = crypto.createHash('sha256').update(`dutyvo-site:${ip}`).digest('hex').slice(0, 24);
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
  try {
    const since1 = new Date(Date.now() - 60e3).toISOString();
    const sinceH = new Date(Date.now() - 3600e3).toISOString();
    const [mine, all] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/site_reports?select=id&ip_hash=eq.${ipHash}&created_at=gt.${since1}&limit=1`, { headers: H }).then((r) => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/site_reports?select=id&created_at=gt.${sinceH}&limit=201`, { headers: H }).then((r) => r.json()),
    ]);
    if (Array.isArray(mine) && mine.length) { res.status(429).json({ ok: false, error: '조금 전에 보내셨어요 — 1분 뒤에 다시 보내 주세요' }); return; }
    if (Array.isArray(all) && all.length > 200) { res.status(429).json({ ok: false, error: '지금 보내는 사람이 많아요 — 잠시 뒤 다시 보내 주세요' }); return; }
    const row = {
      kind, body,
      contact: cut(b.contact, 120).trim() || null,
      page: cut(b.page, 300) || null,
      ua: cut(req.headers['user-agent'], 300) || null,
      screen: cut(b.screen, 40) || null,
      ip_hash: ipHash,
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/site_reports`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) { res.status(500).json({ ok: false, error: '저장하지 못했어요 — 잠시 뒤 다시 보내 주세요' }); return; }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: '저장하지 못했어요 — 잠시 뒤 다시 보내 주세요' });
  }
};
