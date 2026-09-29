// 📨 거래처 메일 자동 기록 — Resend 「메일 받기」 webhook (email.received)
// 회사마다 전용 주소 <코드>@in.dutyvo.kr. 거래처에 보낼 때 숨은 참조로 넣거나, 받은 메일을 이 주소로 전달하면 여기로 온다.
// 1) 서명 확인(Svix — Resend 가 보내는 것만) 2) 본문은 Resend API 로 따로 받는다(webhook 에는 제목 · 주소만 온다)
// 3) 받는 주소 중 @in.dutyvo.kr 의 앞부분 = 회사 코드 → DB 함수 vf_mail_ingest(SQL_v617) 가 거래처 · 건을 찾아 기록하고 차례를 바꾼다
// 필요 env: RESEND_WEBHOOK_SECRET(whsec_…), RESEND_API_KEY(받은 메일 읽기 권한), SUPABASE_SERVICE_ROLE_KEY, (선택) MAIL_IN_DOMAIN, (선택) ANTHROPIC_API_KEY — 있으면 AI 한 줄 요약(v6.20)
const crypto = require('crypto');
const { MODEL_FAST, svc, mask, claude, pickJson, aiOn } = require('./_ai');
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
    const subject = String(full.subject || d.subject || '').slice(0, 300);
    // AI 요약(v6.20) — AI 를 켠 회사만. 한 줄 요약 + 다음 할 일. 전화 · 이메일 모양은 가린 뒤 보낸다. 실패해도 기록은 그대로
    let summary = null;
    if (process.env.ANTHROPIC_API_KEY && text && String(text).trim().length > 20) {
      try {
        const sb = svc();
        const t = (await sb.get(`tenants?select=id&mail_code=eq.${encodeURIComponent(code.toLowerCase())}`))[0];
        if (t && await aiOn(sb, t.id)) {
          let body = String(text).split(/\n-{2,}\s*(?:original message|원본 메시지)|\n\s*On .{5,80}wrote:|\n>/i)[0];
          if (body.trim().length < 20) body = String(text); // 전달(Fwd) 메일은 본문이 아래에 있다
          const r = await claude({ model: MODEL_FAST, system: '너는 거래처 메일을 매장 운영 앱 Dutyvo 의 거래 기록 한 줄로 요약한다. 사실만, 금액 · 날짜 · 수량은 그대로. summary 40자 안, next 는 우리가 할 일(없으면 null) 25자 안. 이모지 없이. JSON 하나만: {"summary":"...","next":null}', messages: [{ role: 'user', content: `제목: ${mask(subject)}\n\n${mask(body).slice(0, 3000)}` }], maxTokens: 200 });
          const j = pickJson(r.text) || {};
          summary = [String(j.summary || '').trim(), j.next ? `다음: ${String(j.next).trim()}` : ''].filter(Boolean).join(' — ').slice(0, 200) || null;
          sb.post('ai_logs', { tenant_id: t.id, profile_id: null, feature: 'mail', question: mask(subject), answer: summary, model: r.model, tokens_in: r.tin, tokens_out: r.tout }, 'return=minimal').catch(() => {});
        }
      } catch (e) { summary = null; }
    }
    const args = {
      p_code: code, p_email_id: String(d.email_id), p_from: addrOf(full.from || d.from),
      p_to: [...new Set(rcpts)], p_subject: subject,
      p_text: String(text || '').slice(0, 4000), p_received: full.created_at || ev.created_at || new Date().toISOString(),
    };
    const call = (a) => fetch(`${SUPABASE_URL}/rest/v1/rpc/vf_mail_ingest`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(a),
    });
    let rpc = await call(summary ? { ...args, p_summary: summary } : args);
    let out = await rpc.text();
    // SQL_v620 전이면 p_summary 칸이 없다 — 요약 없이 한 번 더
    if (!rpc.ok && summary && /p_summary|function|PGRST202/i.test(out)) { rpc = await call(args); out = await rpc.text(); }
    if (!rpc.ok) throw new Error(out.slice(0, 300));
    res.status(200).json({ ok: true, result: JSON.parse(out) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) }); // 500 이면 Resend 가 다시 보낸다
  }
};
