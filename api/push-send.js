// 🔔 한 일 하나에 알림 하나 — 인수인계·요청·답·제안·도움·공지가 생긴 즉시 상대 폰으로
// 호출: 앱에서 로그인 토큰과 함께 POST { to:{...}, title, body, url? }
//   to = { profile_ids:[uuid], names:['김형진'], store_id:uuid(그 매장 기본 근무자), project_id:uuid(참여자), managers:true, all:true }
// 보낸 사람은 빠진다. 같은 회사 사람에게만. 한 번에 30명까지. 00~08시(한국)는 보내지 않고 quiet 로 답.
// 필요 env: SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (push-daily 와 같음)
const webpush = require('web-push');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vbuhueykvizmnrfvkehq.supabase.co';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const VPUB = process.env.VAPID_PUBLIC_KEY, VPRIV = process.env.VAPID_PRIVATE_KEY;
  if (!KEY || !VPUB || !VPRIV) { res.status(500).json({ error: '서버 키 미설정' }); return; }

  // 1) 보낸 사람 확인 — 로그인 토큰이 없으면 아무것도 안 한다
  const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'no token' }); return; }
  let uid = null;
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
    if (!u.ok) throw new Error('bad token');
    uid = (await u.json()).id;
  } catch (e) { res.status(401).json({ error: 'bad token' }); return; }

  const sb = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${await r.text()}`);
    return r.json();
  };
  const delSub = (endpoint) => fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: 'DELETE', headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  }).catch(() => {});

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    const to = body.to || {};
    const title = String(body.title || '').slice(0, 60).trim();
    const text = String(body.body || '').slice(0, 120).trim();
    const url = /^\/[^\s]*$/.test(String(body.url || '')) ? String(body.url) : '/';
    if (!title) { res.status(400).json({ error: 'title 없음' }); return; }

    // 2) 자정~아침 8시(한국)엔 보내지 않는다 — 매장은 22시 넘어도 일하므로 그때까지는 간다. 아침 9시 요약(push-daily)이 덮는다
    const kstHour = (new Date(Date.now() + 9 * 3600e3)).getUTCHours();
    if (kstHour < 8) { res.status(200).json({ ok: true, quiet: true, sent: 0 }); return; }

    // 3) 보낸 사람의 회사 안에서만 받는 사람을 고른다
    const me = (await sb(`profiles?select=id,tenant_id&id=eq.${uid}`))[0];
    if (!me) { res.status(403).json({ error: 'no profile' }); return; }
    const T = me.tenant_id;
    const people = await sb(`profiles?select=id,name,role,status,store_id&tenant_id=eq.${T}&limit=500`);
    const active = people.filter((p) => (p.status ?? 'active') !== 'inactive');
    const ids = new Set();
    (Array.isArray(to.profile_ids) ? to.profile_ids : []).forEach((id) => { if (active.some((p) => p.id === id)) ids.add(id); });
    (Array.isArray(to.names) ? to.names : []).forEach((n) => { active.filter((p) => p.name === n).forEach((p) => ids.add(p.id)); });
    if (to.store_id) active.filter((p) => p.store_id === to.store_id).forEach((p) => ids.add(p.id));
    if (to.managers) active.filter((p) => p.role === 'owner' || p.role === 'manager').forEach((p) => ids.add(p.id));
    if (to.all) active.forEach((p) => ids.add(p.id));
    if (to.project_id && /^[0-9a-f-]{36}$/i.test(to.project_id)) {
      const mem = await sb(`project_members?select=profile_id&project_id=eq.${to.project_id}&tenant_id=eq.${T}`);
      mem.forEach((m) => { if (active.some((p) => p.id === m.profile_id)) ids.add(m.profile_id); });
      const pj = await sb(`projects?select=employee_id&id=eq.${to.project_id}&tenant_id=eq.${T}`);
      pj.forEach((p) => { if (p.employee_id && active.some((a) => a.id === p.employee_id)) ids.add(p.employee_id); });
    }
    ids.delete(uid); // 내가 한 일은 나에게 알리지 않는다
    const targets = [...ids].slice(0, 30);
    if (!targets.length) { res.status(200).json({ ok: true, sent: 0, recipients: 0 }); return; }

    // 4) 구독 기기마다 보낸다 — 만료된 구독은 지운다
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:janghj201@gmail.com', VPUB, VPRIV);
    const subs = await sb(`push_subscriptions?select=endpoint,p256dh,auth,profile_id&tenant_id=eq.${T}&profile_id=in.(${targets.join(',')})&limit=500`);
    const payload = JSON.stringify({ title, body: text, url });
    let sent = 0;
    for (const s of subs) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await delSub(s.endpoint); }
    }
    res.status(200).json({ ok: true, recipients: targets.length, devices: subs.length, sent });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
