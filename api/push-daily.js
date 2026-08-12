// 🔔 매일 아침 푸시 — 3일 이상 미확인 인수인계를 담당자·관리자에게 알림
// Vercel Cron: 매일 00:00 UTC = 09:00 KST. 수동 실행: ?secret=CRON_SECRET (&test=1 = 전체 구독자 테스트 발송)
// 필요 env: SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, (권장) CRON_SECRET
const webpush = require('web-push');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vbuhueykvizmnrfvkehq.supabase.co';
const TENANT_NAME  = process.env.TENANT_NAME || '위베이프 인천/경기 지사';

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

  const sb = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${await r.text()}`);
    return r.json();
  };
  const delSub = async (endpoint) => {
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: 'DELETE', headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    }).catch(() => {});
  };

  try {
    const tenants = await sb(`tenants?select=id&name=eq.${encodeURIComponent(TENANT_NAME)}`);
    if (!tenants.length) throw new Error(`테넌트 없음: ${TENANT_NAME}`);
    const T = tenants[0].id;

    const [subs, profiles, stores] = await Promise.all([
      sb(`push_subscriptions?select=endpoint,p256dh,auth,profile_id&tenant_id=eq.${T}&limit=1000`),
      sb(`profiles?select=id,name,role,status&tenant_id=eq.${T}&limit=200`),
      sb(`stores?select=id,name&tenant_id=eq.${T}&limit=100`),
    ]);
    const storeName = new Map(stores.map((s) => [s.id, String(s.name).replace('인천 ', '').replace('부천 ', '').replace('구월 ', '')]));
    const subsByProfile = new Map();
    subs.forEach((s) => { const a = subsByProfile.get(s.profile_id) || []; a.push(s); subsByProfile.set(s.profile_id, a); });

    const send = async (profileId, payload) => {
      const list = subsByProfile.get(profileId) || [];
      let n = 0;
      for (const s of list) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
          n++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) await delSub(s.endpoint); // 만료 구독 정리
        }
      }
      return n;
    };

    // 테스트 모드: 구독자 전원에게 테스트 알림
    if (req.query && req.query.test === '1') {
      let sent = 0;
      for (const pid of subsByProfile.keys()) {
        sent += await send(pid, { title: '🔔 V-Flow 테스트 알림', body: '푸시가 정상 작동합니다!', url: '/' });
      }
      res.status(200).json({ ok: true, mode: 'test', subscribers: subsByProfile.size, sent });
      return;
    }

    // 본편: 3일 이상 미확인 인수인계
    const cutoff = new Date(Date.now() - 3 * 86400e3).toISOString();
    const stale = await sb(`handovers?select=id,store_id,recipient_id,content,created_at&tenant_id=eq.${T}&confirmed=eq.false&closed=eq.false&deleted_at=is.null&created_at=lte.${encodeURIComponent(cutoff)}&limit=1000`);
    if (!stale.length) { res.status(200).json({ ok: true, stale: 0, sent: 0 }); return; }

    let sent = 0;
    // ① 수신 지정된 담당자에게 — 본인 것만
    const byRecipient = new Map();
    stale.filter((h) => h.recipient_id).forEach((h) => { const a = byRecipient.get(h.recipient_id) || []; a.push(h); byRecipient.set(h.recipient_id, a); });
    for (const [pid, items] of byRecipient) {
      const st = storeName.get(items[0].store_id) || '';
      sent += await send(pid, {
        title: `🔔 미확인 인수인계 ${items.length}건 (3일 이상)`,
        body: `${st} · "${String(items[0].content).slice(0, 30)}"${items.length > 1 ? ` 외 ${items.length - 1}건` : ''} — 확인해주세요`,
        url: '/',
      });
    }
    // ② 관리자(owner/manager) 전원에게 — 전체 적체 요약
    const managers = profiles.filter((p) => (p.status ?? 'active') !== 'inactive' && (p.role === 'owner' || p.role === 'manager'));
    const storeCnt = new Map();
    stale.forEach((h) => storeCnt.set(h.store_id, (storeCnt.get(h.store_id) || 0) + 1));
    const summary = [...storeCnt.entries()].map(([sid, n]) => `${storeName.get(sid) || '?'} ${n}건`).join(' · ');
    for (const m of managers) {
      sent += await send(m.id, {
        title: `⚠️ 3일 이상 미확인 인수인계 ${stale.length}건`,
        body: summary.slice(0, 120) + ' — 매장 점검이 필요해요',
        url: '/',
      });
    }
    res.status(200).json({ ok: true, stale: stale.length, sent, subscribers: subsByProfile.size });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
