// 📨 거래처 메일 자동 기록 — Resend 「메일 받기」 webhook (email.received)
// 회사마다 전용 주소 <코드>@in.dutyvo.kr. 거래처에 보낼 때 숨은 참조로 넣거나, 받은 메일을 이 주소로 전달하면 여기로 온다.
// 1) 서명 확인(Svix — Resend 가 보내는 것만) 2) 본문은 Resend API 로 따로 받는다(webhook 에는 제목 · 주소만 온다)
// 3) 받는 주소 중 @in.dutyvo.kr 의 앞부분 = 회사 코드 → DB 함수 vf_mail_ingest(SQL_v617) 가 거래처 · 건을 찾아 기록하고 차례를 바꾼다
// 필요 env: RESEND_WEBHOOK_SECRET(whsec_…), RESEND_API_KEY(받은 메일 읽기 권한), SUPABASE_SERVICE_ROLE_KEY, (선택) MAIL_IN_DOMAIN
const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vbuhueykvizmnrfvkehq.supabase.co';
const IN_DOMAIN = (process.env.MAIL_IN_DOMAIN || 'in.dutyvo.kr').toLowerCase();

// 서명은 받은 글자 그대로로 확인해야 한다 — req.body 를 건드리면 Vercel 이 먼저 JSON 으로 읽어 버리므로 스트림부터 읽는다
const readRaw = (req) => new Promise((resolve, reject) => {
  let s = '', done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
  try { req.setEncoding('utf8'); } catch (e) {}
  req.on('data', (c) => { s += c; }); req.on('end', () => fin(s)); req.on('error', reject);
  setTimeout(() => fin(s), 5000);
});
// Svix 서명: base64(HMAC-SHA256(키, `${id}.${timestamp}.${본문}`)) — 헤더에 「v1,서명」이 여러 개 올 수 있다
function verify(raw, h, secret) {
  const id = h['svix-id'], ts = h['svix-timestamp'], sig = h['svix-signature'];
  if (!id || !ts || !sig || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // 5분 넘게 늦은 것(재전송 공격) 거절
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const want = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64');
  return sig.split(' ').some((p) => { const v = p.split(',')[1] || ''; return v.length === want.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(want)); });
}
const addrOf = (x) => { const m = String(x || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/); return m ? m[0].toLowerCase() : ''; };
const stripHtml = (h) => String(h || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, RKEY = process.env.RESEND_API_KEY, WSEC = process.env.RESEND_WEBHOOK_SECRET;
  if (!KEY || !RKEY || !WSEC) { res.status(500).json({ error: 'env 미설정(SUPABASE_SERVICE_ROLE_KEY · RESEND_API_KEY · RESEND_WEBHOOK_SECRET)' }); return; }
  let raw;
  try { raw = await readRaw(req); } catch (e) { res.status(400).json({ error: 'body' }); return; }
  if (!verify(raw, req.headers || {}, WSEC)) { res.status(401).json({ error: 'bad signature' }); return; }
  let ev; try { ev = JSON.parse(raw); } catch (e) { res.status(400).json({ error: 'json' }); return; }
  if (ev.type !== 'email.received') { res.status(200).json({ ok: true, skip: ev.type }); return; }
  const d = ev.data || {};
  try {
    // 본문 · 전달받은 주소(숨은 참조는 to 에 안 보이고 received_for 에 온다)
    const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(d.email_id)}`, { headers: { Authorization: `Bearer ${RKEY}` } });
    const full = r.ok ? await r.json() : {};
    const rcpts = [...(d.to || []), ...(d.cc || []), ...(d.bcc || []), ...(full.to || []), ...(full.received_for || [])].map(addrOf).filter(Boolean);
    const ours = rcpts.find((a) => a.endsWith('@' + IN_DOMAIN));
    if (!ours) { res.status(200).json({ ok: true, skip: 'no inbound address' }); return; }
    const code = ours.split('@')[0].split('+')[0];
    const text = (full.text && String(full.text).trim()) || stripHtml(full.html);
    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/vf_mail_ingest`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_code: code, p_email_id: String(d.email_id), p_from: addrOf(full.from || d.from),
        p_to: [...new Set(rcpts)], p_subject: String(full.subject || d.subject || '').slice(0, 300),
        p_text: String(text || '').slice(0, 4000), p_received: full.created_at || ev.created_at || new Date().toISOString(),
      }),
    });
    const out = await rpc.text();
    if (!rpc.ok) throw new Error(out.slice(0, 300));
    res.status(200).json({ ok: true, result: JSON.parse(out) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) }); // 500 이면 Resend 가 다시 보낸다
  }
};
