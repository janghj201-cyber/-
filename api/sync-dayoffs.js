// V-Flow 휴무 가져오기 — 회사 스케줄 시트(CSV 주소) → dayoffs. Vercel Cron이 매일 호출.
// 기본은 꺼짐: 휴무는 앱에서 직접 신청·승인한다. 설정 → 「휴무 가져오기」를 켜고 주소를 넣은 회사만 돈다
// (tenant_settings.extra.dayoffSync = {on:true, url}). 코드에 회사 이름·주소를 박지 않는다.
// 켜면 그 달 휴무는 시트가 원본 — 시트의 "현재 활성 월"을 읽어 그 달 휴무를 덮어쓴다(diff-sync).
// 필요 환경변수(Vercel):
//   SUPABASE_SERVICE_ROLE_KEY  (필수) — Supabase service_role 키 (RLS 우회, 서버 전용)
//   CRON_SECRET                (권장) — 있으면 Vercel Cron 요청만 허용
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vbuhueykvizmnrfvkehq.supabase.co';

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return; }
  }
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY) { res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY 미설정' }); return; }

  const sb = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });

  const runOne = async (TID, SCHEDULE_URL) => {
    const csv = await fetch(SCHEDULE_URL).then((r) => r.text());
    const lines = csv.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(','));
    if (!lines.length) throw new Error('빈 CSV');

    const titleM = (lines[0].join(',')).match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
    if (!titleM) throw new Error('제목에서 월을 못 읽음: ' + lines[0][0]);
    const year = +titleM[1], month = +titleM[2];
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    const lastDay = new Date(year, month, 0).getDate();

    const hi = lines.findIndex((c) => c.includes('성명'));
    if (hi < 0) throw new Error('헤더(성명) 못 찾음');
    const dayStart = lines[hi].indexOf('1');
    if (dayStart < 0) throw new Error('일자 컬럼(1) 못 찾음');

    const offByName = {};
    for (let i = hi + 1; i < lines.length; i++) {
      const name = (lines[i][1] || '').trim();
      if (!name) continue;
      const offs = [];
      for (let d = 1; d <= lastDay; d++) {
        const v = (lines[i][dayStart + (d - 1)] || '').trim();
        if (v === '') offs.push(`${ym}-${String(d).padStart(2, '0')}`);
      }
      offByName[name] = offs;
    }
    const empCount = Object.keys(offByName).length;
    if (empCount < 10) throw new Error(`파싱 직원 ${empCount}명 — 데이터 이상으로 중단`);

    const profiles = await sb(`profiles?select=id,name&tenant_id=eq.${TID}`).then((r) => r.json());
    const idByName = new Map(profiles.map((p) => [p.name, p.id]));

    const desired = new Map();
    const unmatched = [];
    for (const [name, offs] of Object.entries(offByName)) {
      const pid = idByName.get(name);
      if (!pid) { if (offs.length) unmatched.push(name); continue; }
      for (const date of offs) desired.set(`${pid}|${date}`, { pid, date });
    }

    const existing = await sb(`dayoffs?select=id,profile_id,dayoff_date,status&tenant_id=eq.${TID}&dayoff_date=gte.${ym}-01&dayoff_date=lte.${ym}-${lastDay}`).then((r) => r.json());
    const existKey = new Map(existing.map((r) => [`${r.profile_id}|${r.dayoff_date}`, r]));

    const toDelete = existing.filter((r) => !desired.has(`${r.profile_id}|${r.dayoff_date}`)).map((r) => r.id);
    const toInsert = [];
    for (const [k, v] of desired) {
      if (!existKey.has(k)) toInsert.push({ tenant_id: TID, profile_id: v.pid, dayoff_date: v.date, status: 'dayoff' });
    }

    if (toDelete.length) {
      const r = await sb(`dayoffs?id=in.(${toDelete.join(',')})`, { method: 'DELETE' });
      if (!r.ok) throw new Error('삭제 실패: ' + (await r.text()));
    }
    if (toInsert.length) {
      const r = await sb(`dayoffs`, { method: 'POST', body: JSON.stringify(toInsert) });
      if (!r.ok) throw new Error('삽입 실패: ' + (await r.text()));
    }

    return { tenant: TID, month: ym, employees: empCount, desired_offs: desired.size, deleted: toDelete.length, inserted: toInsert.length, unmatched_names: unmatched };
  };

  try {
    // 켜 둔 회사만 — 설정이 원본
    const rows = await sb(`tenant_settings?select=tenant_id,extra`).then((r) => r.json());
    const targets = (Array.isArray(rows) ? rows : []).filter((r) => r.extra && r.extra.dayoffSync && r.extra.dayoffSync.on && /^https?:\/\//.test(String(r.extra.dayoffSync.url || '')));
    const results = [];
    for (const t of targets) {
      try { results.push(await runOne(t.tenant_id, String(t.extra.dayoffSync.url))); }
      catch (e) { results.push({ tenant: t.tenant_id, ok: false, error: String(e && e.message || e) }); }
    }
    res.status(200).json({ ok: true, tenants: targets.length, results });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
