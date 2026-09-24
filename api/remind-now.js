// 🔔 바로 알림 — 매분(Vercel Pro). 하루 두 번 도는 push-remind 와 따로.
// ① 손님이 예약 링크로 한 일 → 1분 안에 매장 폰으로: 새 예약 요청 · 바로 확정된 새 예약 · 손님 취소 · 시간 변경 요청 · 제안한 시간 받음
//    대상: 그 회사 관리자(owner/manager) + 그 예약 담당자. 누르면 고객 예약 화면(?rsv=1)
//    표시: appointments.alerted_at(SQL_v612). 비어 있는 건 한 번 보고 찍는다 — 매장에서 직접 넣은 예약은 알리지 않고 찍기만.
//    손님 관리 링크에서 취소 · 변경 · 제안 받기를 하면 DB 함수가 alerted_at 을 다시 비운다.
// ② 「1시간 전」 알림(remind = '1h') — 시작 60분 안으로 들어온 일정을 담당자(없으면 관리자)에게 한 번. reminded_at 으로 두 번 안 감.
// 수동 실행: ?secret=CRON_SECRET&dry=1 (보내지 않고 셈만 · 찍지도 않음)
// 필요 env: SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, (권장) CRON_SECRET
const webpush = require('web-push');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vbuhueykvizmnrfvkehq.supabase.co';
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

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
  const dry = (req.query && req.query.dry) === '1';

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
  const inList = (a) => `in.(${[...new Set(a)].join(',')})`;
  // 한국 시각으로 「9/25(금) 14:00」
  const kst = (iso) => { const t = new Date(new Date(iso).getTime() + 9 * 3600e3); return t; };
  const hm = (iso) => { const t = kst(iso); return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`; };
  const when = (iso) => { const t = kst(iso); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}(${DOW[t.getUTCDay()]}) ${hm(iso)}`; };

  try {
    const now = new Date(), in60 = new Date(now.getTime() + 60 * 60e3);
    const COLS = 'id,tenant_id,kind,title,status,source,reply,starts_at,change_to,moved_from,staff_id,guest_id,client_id,service_id,extra';
    const [fresh, soon] = await Promise.all([
      sb(`appointments?select=${COLS}&alerted_at=is.null&order=created_at&limit=500`),
      sb(`appointments?select=${COLS}&remind=eq.1h&reminded_at=is.null&status=in.(request,offered,confirmed)&starts_at=gt.${encodeURIComponent(now.toISOString())}&starts_at=lte.${encodeURIComponent(in60.toISOString())}&limit=500`),
    ]);
    // 알릴 것만 — 링크로 들어온 예약, 손님이 링크로 취소 · 변경 요청한 것. 나머지(매장에서 직접 넣은 것)는 찍기만
    const kindOf = (a) => {
      if (a.kind !== 'booking') return null;
      if (a.reply === 'cancel' && a.status === 'cancelled') return 'cancel';
      if (a.reply === 'change' && a.change_to && ['confirmed', 'request'].includes(a.status)) return 'change';
      if (a.source !== 'link') return null;
      if (a.status === 'request') return 'request';
      if (a.status === 'confirmed' && a.moved_from) return 'accept';
      if (a.status === 'confirmed') return 'new';
      return null;
    };
    const events = fresh.map((a) => ({ a, k: kindOf(a) })).filter((x) => x.k);
    const all = [...events.map((x) => x.a), ...soon];
    const tenants = [...new Set(all.map((a) => a.tenant_id))];
    let sent = 0;
    if (tenants.length) {
      const gIds = all.map((a) => a.guest_id).filter(Boolean), cIds = all.map((a) => a.client_id).filter(Boolean), vIds = all.map((a) => a.service_id).filter(Boolean);
      const [profiles, subs, gs, cs, vs] = await Promise.all([
        sb(`profiles?select=id,tenant_id,role,status&tenant_id=${inList(tenants)}&limit=2000`),
        sb(`push_subscriptions?select=endpoint,p256dh,auth,profile_id&tenant_id=${inList(tenants)}&limit=5000`),
        gIds.length ? sb(`guests?select=id,name&id=${inList(gIds)}`) : [],
        cIds.length ? sb(`clients?select=id,name&id=${inList(cIds)}`) : [],
        vIds.length ? sb(`booking_services?select=id,name&id=${inList(vIds)}`) : [],
      ]);
      const subsBy = new Map(); subs.forEach((s) => { const x = subsBy.get(s.profile_id) || []; x.push(s); subsBy.set(s.profile_id, x); });
      const admins = (T) => profiles.filter((p) => p.tenant_id === T && (p.status ?? 'active') !== 'inactive' && (p.role === 'owner' || p.role === 'manager')).map((p) => p.id);
      const who = (a) => (gs.find((g) => g.id === a.guest_id) || cs.find((c) => c.id === a.client_id) || {}).name || (a.extra && a.extra.party) || '';
      const what = (a) => a.title || (vs.find((v) => v.id === a.service_id) || {}).name || (a.kind === 'booking' ? '예약' : '미팅');
      const send = async (pid, payload) => {
        if (dry) return (subsBy.get(pid) || []).length;
        let n = 0;
        for (const s of subsBy.get(pid) || []) {
          try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload)); n++; }
          catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await delSub(s.endpoint); }
        }
        return n;
      };
      // ① 링크 예약 — 한 건씩(보통 몇 분에 한 건). 한 사람에게 한 번에 4건 넘게 몰리면 묶어서
      const TITLE = { request: '새 예약 요청', new: '새 예약', cancel: '손님이 예약 취소', change: '손님이 시간 변경 요청', accept: '제안한 시간으로 확정' };
      const line = (x) => {
        const a = x.a, nm = who(a);
        if (x.k === 'change') return `${when(a.starts_at)} → ${when(a.change_to)} · ${nm}${nm ? ' · ' : ''}${what(a)}`;
        return `${when(a.starts_at)} · ${nm}${nm ? ' · ' : ''}${what(a)}${x.k === 'request' ? ' — 확정 · 다른 시간 · 어려움' : ''}`;
      };
      const byWho = new Map();
      events.forEach((x) => { [...new Set([...admins(x.a.tenant_id), ...(x.a.staff_id ? [x.a.staff_id] : [])])].forEach((p) => { const l = byWho.get(p) || []; l.push(x); byWho.set(p, l); }); });
      for (const [pid, list] of byWho) {
        if (list.length > 4) sent += await send(pid, { title: `예약 알림 ${list.length}건`, body: list.slice(0, 3).map((x) => `${TITLE[x.k]} · ${line(x)}`).join('\n') + `\n외 ${list.length - 3}건`, url: '/?rsv=1' });
        else for (const x of list) sent += await send(pid, { title: TITLE[x.k], body: line(x), url: '/?rsv=1' });
      }
      // ② 1시간 전
      for (const a of soon) {
        const to = a.staff_id ? [a.staff_id] : admins(a.tenant_id), nm = who(a);
        for (const pid of to) sent += await send(pid, { title: `1시간 뒤 · ${hm(a.starts_at)} ${what(a)}`, body: nm ? `${nm}${a.kind === 'booking' ? ' 손님' : ''}` : '곧 시작해요', url: a.kind === 'booking' ? '/?rsv=1' : '/?cal=1' });
      }
    }
    if (!dry) {
      const stamp = new Date().toISOString();
      if (fresh.length) await patch(`appointments?id=${inList(fresh.map((a) => a.id))}`, { alerted_at: stamp });
      if (soon.length) await patch(`appointments?id=${inList(soon.map((a) => a.id))}`, { reminded_at: stamp });
    }
    res.status(200).json({ ok: true, dry, checked: fresh.length, alerts: events.length, soon: soon.length, sent });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
