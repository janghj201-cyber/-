// 🔔 캘린더 알림 — 하루 두 번. 일정마다 고른 시각(remind)에 담당자 폰으로
// Vercel Cron: 00:00 UTC(= 09:00 KST) → 당일 아침 9시 알림 · 보관기한 오늘까지(관리자)
//              09:00 UTC(= 18:00 KST) → 전날 오후 6시 알림(내일 일정)
// 수동 실행: ?secret=CRON_SECRET&slot=am9|prev18 (&tenant=<id> = 한 회사만, &dry=1 = 보내지 않고 셈만)
// 보낸 일정은 reminded_at 을 찍어 두 번 가지 않게. 시간을 바꾸면 앱이 reminded_at 을 비운다.
// 담당이 없는 일정은 그 회사 관리자(owner/manager)에게. 회사마다 따로 돈다 — 한 회사 오류가 다른 회사를 막지 않는다.
// 필요 env: SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, (권장) CRON_SECRET
const webpush = require('web-push');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vbuhueykvizmnrfvkehq.supabase.co';

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || '';
    const qs = (req.query && req.query.secret) || '';
    if (auth !== `Bearer ${secret}` && qs !== secret) { res.status(401).json({ error: 'unauthorized' }); return; }
  }
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const VPUB = process.env.VAPID_PUBLIC_KEY, VPRIV = process.env.VAPID_PRIVATE_KEY;
  if (!KEY) { res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY 미설정' }); return; }
  if (!VPUB || !VPRIV) { res.status(500).json({ error: 'VAPID 키 미설정' }); return; }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:janghj201@gmail.com', VPUB, VPRIV);

  const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const sb = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${await r.text()}`);
    return r.json();
  };
  const patch = async (path, body) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${await r.text()}`);
  };
  const delSub = async (endpoint) => {
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE', headers: H }).catch(() => {});
  };

  const q = req.query || {};
  const slot = q.slot === 'am9' || q.slot === 'prev18' ? q.slot : (new Date().getUTCHours() < 5 ? 'am9' : 'prev18');
  const dry = q.dry === '1';
  // 한국 날짜 — am9 는 오늘 하루, prev18 은 내일 하루
  const kst = new Date(Date.now() + 9 * 3600e3);
  const y = kst.getUTCFullYear(), m = kst.getUTCMonth(), d = kst.getUTCDate() + (slot === 'prev18' ? 1 : 0);
  const from = new Date(Date.UTC(y, m, d) - 9 * 3600e3), to = new Date(from.getTime() + 86400e3);
  const dayKey = new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  const hm = (iso) => { const t = new Date(new Date(iso).getTime() + 9 * 3600e3); return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`; };
  const when = slot === 'am9' ? '오늘' : '내일';

  const runTenant = async (T) => {
    const appts = await sb(`appointments?select=id,staff_id,kind,title,starts_at,guest_id,client_id,extra&tenant_id=eq.${T}&remind=eq.${slot}&status=in.(request,confirmed,offered)&reminded_at=is.null&starts_at=gte.${encodeURIComponent(from.toISOString())}&starts_at=lt.${encodeURIComponent(to.toISOString())}&order=starts_at&limit=2000`);
    const lots = slot === 'am9' ? await sb(`expiry_lots?select=id,item_id,store_id,qty&tenant_id=eq.${T}&status=eq.active&due_on=eq.${dayKey}&limit=1000`) : [];
    if (!appts.length && !lots.length) return { appts: 0, lots: 0, sent: 0 };

    const [subs, profiles] = await Promise.all([
      sb(`push_subscriptions?select=endpoint,p256dh,auth,profile_id&tenant_id=eq.${T}&limit=1000`),
      sb(`profiles?select=id,name,role,status&tenant_id=eq.${T}&limit=500`),
    ]);
    const subsBy = new Map(); subs.forEach((s) => { const a = subsBy.get(s.profile_id) || []; a.push(s); subsBy.set(s.profile_id, a); });
    const admins = profiles.filter((p) => (p.status ?? 'active') !== 'inactive' && (p.role === 'owner' || p.role === 'manager')).map((p) => p.id);
    const send = async (pid, payload) => {
      if (dry) return (subsBy.get(pid) || []).length;
      let n = 0;
      for (const s of subsBy.get(pid) || []) {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload)); n++; }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await delSub(s.endpoint); }
      }
      return n;
    };
    // 손님 · 거래처 이름 — 담당자가 알림만 보고 누군지 알게
    const ids = (k) => [...new Set(appts.map((a) => a[k]).filter(Boolean))];
    const gIds = ids('guest_id'), cIds = ids('client_id');
    const [gs, cs] = await Promise.all([
      gIds.length ? sb(`guests?select=id,name&id=in.(${gIds.join(',')})`) : [],
      cIds.length ? sb(`clients?select=id,name&id=in.(${cIds.join(',')})`) : [],
    ]);
    const nameOf = (a) => (gs.find((g) => g.id === a.guest_id) || cs.find((c) => c.id === a.client_id) || {}).name || (a.extra && a.extra.party) || '';
    const line = (a) => `${hm(a.starts_at)} ${a.title || (a.kind === 'booking' ? '예약' : '미팅')}${nameOf(a) ? ' · ' + nameOf(a) : ''}`;

    let sent = 0;
    const byWho = new Map();
    appts.forEach((a) => { const to2 = a.staff_id ? [a.staff_id] : admins; to2.forEach((p) => { const l = byWho.get(p) || []; l.push(a); byWho.set(p, l); }); });
    for (const [pid, list] of byWho) {
      sent += await send(pid, { title: `${when} 일정 ${list.length}건`, body: list.slice(0, 3).map(line).join('\n') + (list.length > 3 ? `\n외 ${list.length - 3}건` : ''), url: '/?cal=1' });
    }
    if (lots.length) {
      const its = await sb(`expiry_items?select=id,name,unit&id=in.(${[...new Set(lots.map((l) => l.item_id))].join(',')})`);
      const nm = (l) => { const it = its.find((i) => i.id === l.item_id) || {}; const qn = Number(l.qty) || 0; return `${it.name || '품목'}${qn && qn !== 1 ? ` ${qn}${it.unit || ''}` : ''}`; };
      for (const pid of admins) sent += await send(pid, { title: `보관기한 오늘까지 ${lots.length}건`, body: lots.slice(0, 4).map(nm).join(', ') + (lots.length > 4 ? ` 외 ${lots.length - 4}건` : ''), url: '/?cal=1' });
    }
    if (!dry && appts.length) await patch(`appointments?id=in.(${appts.map((a) => a.id).join(',')})`, { reminded_at: new Date().toISOString() });
    return { appts: appts.length, lots: lots.length, sent };
  };

  try {
    const only = q.tenant;
    const tenants = await sb(`tenants?select=id,name${only ? `&id=eq.${encodeURIComponent(only)}` : ''}&limit=1000`);
    const results = [];
    for (const t of tenants) {
      try { results.push({ tenant: t.name, ok: true, ...(await runTenant(t.id)) }); }
      catch (e) { results.push({ tenant: t.name, ok: false, error: String((e && e.message) || e) }); }
    }
    res.status(200).json({ ok: results.every((r) => r.ok), slot, day: dayKey, dry, tenants: results });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
