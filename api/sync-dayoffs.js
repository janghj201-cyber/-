// V-Flow 휴무 자동 동기화 — 위베이프 스케줄(구글시트/Apps Script) → V-Flow dayoffs
// Vercel Cron이 매일 호출. 스케줄의 "현재 활성 월"을 읽어 그 달 휴무를 덮어쓰기(diff-sync)한다.
// 필요 환경변수(Vercel):
//   SUPABASE_SERVICE_ROLE_KEY  (필수) — Supabase service_role 키 (RLS 우회, 서버 전용)
//   CRON_SECRET                (권장) — 있으면 Vercel Cron 요청만 허용
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vbuhueykvizmnrfvkehq.supabase.co';
const SCHEDULE_URL = process.env.SCHEDULE_URL || 'https://script.google.com/macros/s/AKfycbxTkORMjTnG904crrghKNmEA2laN4WcVUpDItmbNuwArjRWlkpaZZOoxcFkTyHfBC1f/exec';
const TENANT_NAME  = process.env.TENANT_NAME || '위베이프 인천/경기 지사';

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

  try {
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

    const tenants = await sb(`tenants?select=id,name&name=eq.${encodeURIComponent(TENANT_NAME)}`).then((r) => r.json());
    if (!tenants.length) throw new Error(`테넌트 없음: ${TENANT_NAME}`);
    const TID = tenants[0].id;

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

    res.status(200).json({ ok: true, month: ym, employees: empCount, desired_offs: desired.size, deleted: toDelete.length, inserted: toInsert.length, unmatched_names: unmatched });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
};
