// 🔔 바로 알림 — 매분(Vercel Pro). 하루 두 번 도는 push-remind 와 따로.
// ① 손님이 예약 링크로 한 일 → 1분 안에 매장 폰으로: 새 예약 요청 · 바로 확정된 새 예약 · 손님 취소 · 시간 변경 요청 · 제안한 시간 받음
//    대상: 그 회사 관리자(owner/manager) + 그 예약 담당자. 누르면 고객 예약 화면(?rsv=1)
//    표시: appointments.alerted_at(SQL_v612). 비어 있는 건 한 번 보고 찍는다 — 매장에서 직접 넣은 예약은 알리지 않고 찍기만.
//    손님 관리 링크에서 취소 · 변경 · 제안 받기를 하면 DB 함수가 alerted_at 을 다시 비운다.
// ③ 운영자 — 새 회사 가입 · Dutyvo 문의 → 운영자, 답 → 물어본 사람(v6.14)
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
    // ③ 운영자(v6.14) — 새 회사 가입 · 새 문의는 운영자 폰으로, 운영자가 단 답은 물어본 사람 폰으로.
    //    SQL_v614 전이면 표 · 칸이 없어 조용히 건너뛴다(예약 알림은 그대로)
    let ops = { cos: [], tks: [], ans: [] };
    try {
      const [cos2, tks2, ans2, pa] = await Promise.all([
        sb(`tenants?select=id,name,industry&ops_alerted_at=is.null&limit=50`),
        sb(`support_tickets?select=id,tenant_id,kind,body&alerted_at=is.null&limit=100`),
        sb(`support_tickets?select=id,profile_id,answer&status=eq.answered&answer_alerted_at=is.null&limit=100`),
        sb(`platform_admins?select=user_id`),
      ]);
      ops = { cos: cos2, tks: tks2, ans: ans2 };
      const opsIds = pa.map((x) => x.user_id);
      const pids = [...new Set([...opsIds, ...ans2.map((x) => x.profile_id).filter(Boolean)])];
      if (pids.length && (cos2.length || tks2.length || ans2.length)) {
        const subs2 = await sb(`push_subscriptions?select=endpoint,p256dh,auth,profile_id&profile_id=${inList(pids)}&limit=2000`);
        const tn = tks2.length ? await sb(`tenants?select=id,name&id=${inList(tks2.map((x) => x.tenant_id))}`) : [];
        const push2 = async (pid, payload) => {
          const mine = subs2.filter((x) => x.profile_id === pid);
          if (dry) return mine.length;
          let n = 0;
          for (const x of mine) {
            try { await webpush.sendNotification({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, JSON.stringify(payload)); n++; }
            catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await delSub(x.endpoint); }
          }
          return n;
        };
        const IND = { cafe: '카페', convenience: '편의점', beauty: '뷰티', academy: '학원', etc: '기타', restaurant: '음식점', wholesale: '도매 · 유통', clinic: '의원 · 치료' };
        const KIND = { ask: '질문', bug: '불편한 점', idea: '기능 제안', close: '회사 정리 요청', export: '데이터 받기 요청' };
        for (const pid of opsIds) {
          if (cos2.length) sent += await push2(pid, { title: `새 회사 가입 ${cos2.length}곳`, body: cos2.slice(0, 3).map((c) => `${c.name} · ${IND[c.industry] || c.industry}`).join('\n'), url: '/?ops=1' });
          for (const k of tks2.slice(0, 5)) sent += await push2(pid, { title: `Dutyvo 문의 · ${KIND[k.kind] || k.kind}`, body: `${(tn.find((t) => t.id === k.tenant_id) || {}).name || ''} — ${String(k.body).slice(0, 80)}`, url: '/?ops=1' });
          if (tks2.length > 5) sent += await push2(pid, { title: `Dutyvo 문의 ${tks2.length - 5}건 더`, body: '운영 화면에서 확인', url: '/?ops=1' });
        }
        for (const k of ans2) if (k.profile_id) sent += await push2(k.profile_id, { title: 'Dutyvo 답변이 왔어요', body: String(k.answer).slice(0, 100), url: '/?ask=1' });
      }
    } catch (e) { ops = { cos: [], tks: [], ans: [], skipped: String((e && e.message) || e).slice(0, 120) }; }
    // ④ 거래처 메일(v6.17) — 자동 기록된 「받은 메일」은 그 건 담당자에게(우리 차례), 못 찾은 메일은 관리자에게 「분류 필요」.
    //    SQL_v617 전이면 표가 없어 조용히 건너뛴다
    let mails = [];
    try {
      mails = await sb(`mail_inbox?select=id,tenant_id,direction,status,subject,deal_id,client_id&alerted_at=is.null&limit=200`);
      const inLogged = mails.filter((m) => m.status === 'logged' && m.direction === 'in' && m.deal_id), pend = mails.filter((m) => m.status === 'pending');
      if (inLogged.length || pend.length) {
        const dls = inLogged.length ? await sb(`deals?select=id,title,owner_id,client_id&id=${inList(inLogged.map((m) => m.deal_id))}`) : [];
        const cls = dls.length ? await sb(`clients?select=id,name&id=${inList(dls.map((x) => x.client_id))}`) : [];
        const tIds = [...new Set(pend.map((m) => m.tenant_id))];
        const adm = tIds.length ? await sb(`profiles?select=id,tenant_id,role,status&tenant_id=${inList(tIds)}&role=in.(owner,manager)`) : [];
        const pids = [...new Set([...dls.map((x) => x.owner_id).filter(Boolean), ...adm.filter((p) => (p.status ?? 'active') !== 'inactive').map((p) => p.id)])];
        const subs3 = pids.length ? await sb(`push_subscriptions?select=endpoint,p256dh,auth,profile_id&profile_id=${inList(pids)}&limit=2000`) : [];
        const push3 = async (pid, payload) => { const mine = subs3.filter((x) => x.profile_id === pid); if (dry) return mine.length; let n = 0; for (const x of mine) { try { await webpush.sendNotification({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, JSON.stringify(payload)); n++; } catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await delSub(x.endpoint); } } return n; };
        for (const m of inLogged) { const dl = dls.find((x) => x.id === m.deal_id); if (dl && dl.owner_id) sent += await push3(dl.owner_id, { title: `거래처 메일 · ${(cls.find((c) => c.id === dl.client_id) || {}).name || ''} — 우리 차례`, body: `${dl.title} · ${String(m.subject || '').slice(0, 60)}`, url: '/?deal=1' }); }
        for (const T of tIds) { const n = pend.filter((m) => m.tenant_id === T).length; for (const a of adm.filter((p) => p.tenant_id === T)) sent += await push3(a.id, { title: `거래처 메일 분류 필요 ${n}건`, body: '거래처 · 건을 못 찾은 메일 — 거래처 화면에서 건 고르기', url: '/?deal=1' }); }
      }
    } catch (e) { mails = []; }
    if (!dry) {
      const stamp = new Date().toISOString();
      if (mails.length) await patch(`mail_inbox?id=${inList(mails.map((m) => m.id))}`, { alerted_at: stamp });
      if (ops.cos.length) await patch(`tenants?id=${inList(ops.cos.map((x) => x.id))}`, { ops_alerted_at: stamp });
      if (ops.tks.length) await patch(`support_tickets?id=${inList(ops.tks.map((x) => x.id))}`, { alerted_at: stamp });
      if (ops.ans.length) await patch(`support_tickets?id=${inList(ops.ans.map((x) => x.id))}`, { answer_alerted_at: stamp });
      if (fresh.length) await patch(`appointments?id=${inList(fresh.map((a) => a.id))}`, { alerted_at: stamp });
      if (soon.length) await patch(`appointments?id=${inList(soon.map((a) => a.id))}`, { reminded_at: stamp });
    }
    res.status(200).json({ ok: true, dry, checked: fresh.length, alerts: events.length, soon: soon.length, ops: { cos: ops.cos.length, tks: ops.tks.length, ans: ops.ans.length, skipped: ops.skipped }, mails: mails.length, sent });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
