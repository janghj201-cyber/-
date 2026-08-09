// 주간 경영 리포트 자동 생성 — 매주 월요일 07:30 KST (Vercel Cron: 일 22:30 UTC)
// 지난주(월~일) 데이터를 집계해 weekly_reports에 저장. 관리자 앱의 "주간 리포트" 탭이 읽는다.
// 필요 env: SUPABASE_SERVICE_ROLE_KEY, (권장) CRON_SECRET
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
  if (!KEY) { res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY 미설정' }); return; }

  const sb = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${await r.text()}`);
    return r.json();
  };

  try {
    // ── 기간: 지난주 월~일 (KST) + 추이용 6주 ──
    const nowK = new Date(Date.now() + 9 * 3600 * 1000);
    const dowK = nowK.getUTCDay();
    const thisMon = new Date(Date.UTC(nowK.getUTCFullYear(), nowK.getUTCMonth(), nowK.getUTCDate() - ((dowK + 6) % 7)));
    const wkStart = new Date(thisMon.getTime() - 7 * 86400e3);
    const wkEnd = new Date(thisMon.getTime() - 86400e3);
    const trendStart = new Date(thisMon.getTime() - 42 * 86400e3);
    const d2s = (d) => d.toISOString().slice(0, 10);
    const wsS = d2s(wkStart), weS = d2s(wkEnd), trS = d2s(trendStart);
    // KST 자정 경계 → UTC 타임스탬프 (KST = UTC+9)
    const kstIso = (d) => new Date(d.getTime() - 9 * 3600e3).toISOString();
    const wkStartTs = kstIso(wkStart), thisMonTs = kstIso(thisMon), trendTs = kstIso(trendStart);

    const tenants = await sb(`tenants?select=id&name=eq.${encodeURIComponent(TENANT_NAME)}`);
    if (!tenants.length) throw new Error(`테넌트 없음: ${TENANT_NAME}`);
    const T = tenants[0].id;

    const [stores, profiles, tasks, hos, unconf, cleanLogs] = await Promise.all([
      sb(`stores?select=id,name&tenant_id=eq.${T}&order=name&limit=100`),
      sb(`profiles?select=id,name,role,status&tenant_id=eq.${T}&limit=200`),
      sb(`daily_tasks?select=employee_id,store_id,status,task_date&tenant_id=eq.${T}&task_date=gte.${trS}&task_date=lte.${weS}&limit=20000`),
      sb(`handovers?select=store_id,from_employee,confirmed,confirmed_at,confirmed_by,closed,created_at&tenant_id=eq.${T}&created_at=gte.${trendTs}&limit=20000`),
      sb(`handovers?select=store_id,created_at&tenant_id=eq.${T}&confirmed=eq.false&closed=eq.false&limit=5000`),
      sb(`cleaning_daily_logs?select=store_id,done&tenant_id=eq.${T}&log_date=gte.${wsS}&log_date=lte.${weS}&limit=20000`),
    ]);
    const nameOf = new Map(profiles.filter((p) => (p.status ?? 'active') !== 'inactive').map((p) => [p.id, p.name]));
    const storeName = new Map(stores.map((s) => [s.id, s.name]));
    const short = (n) => String(n || '').replace('인천 ', '').replace('부천 ', '').replace('구월 ', '');

    // ── 완료율 (done / (done+pending)) ──
    const rate = (rows) => {
      const done = rows.filter((t) => t.status === 'done').length;
      const pend = rows.filter((t) => t.status === 'pending').length;
      return done + pend > 0 ? Math.round((done / (done + pend)) * 100) : null;
    };
    const weekIdx = (dstr) => Math.floor((new Date(dstr + 'T00:00:00Z') - trendStart) / (7 * 86400e3));
    const trend = [];
    for (let w = 0; w < 6; w++) {
      const rows = tasks.filter((t) => weekIdx(t.task_date) === w);
      const st = new Date(trendStart.getTime() + w * 7 * 86400e3);
      trend.push({ label: `${st.getUTCMonth() + 1}/${st.getUTCDate()}주`, v: rate(rows) });
    }
    const lastTasks = tasks.filter((t) => t.task_date >= wsS && t.task_date <= weS);
    const prevTasks = tasks.filter((t) => weekIdx(t.task_date) === 4);
    const compV = rate(lastTasks), compP = rate(prevTasks);

    // ── 인수인계 확인 시간 ──
    const avgH = (rows) => {
      const ds = rows.filter((h) => h.confirmed_at).map((h) => (new Date(h.confirmed_at) - new Date(h.created_at)) / 3600e3).filter((x) => x >= 0 && x < 24 * 14);
      return ds.length ? Math.round((ds.reduce((a, b) => a + b, 0) / ds.length) * 10) / 10 : null;
    };
    const hosLast = hos.filter((h) => h.created_at >= wkStartTs && h.created_at < thisMonTs);
    const hosPrev = hos.filter((h) => h.created_at >= kstIso(new Date(wkStart.getTime() - 7 * 86400e3)) && h.created_at < wkStartTs);
    const confV = avgH(hosLast), confP = avgH(hosPrev);

    // ── 청소 수행률 ──
    const cleanV = cleanLogs.length ? Math.round((cleanLogs.filter((c) => c.done).length / cleanLogs.length) * 100) : null;

    // ── 매장 신호등 ──
    const now = Date.now();
    const storeRows = stores.map((s) => {
      const t = lastTasks.filter((x) => x.store_id === s.id);
      const comp = rate(t);
      const un = unconf.filter((u) => u.store_id === s.id);
      const oldest = un.length ? Math.floor((now - Math.min(...un.map((u) => +new Date(u.created_at)))) / 86400e3) : 0;
      const cl = cleanLogs.filter((c) => c.store_id === s.id);
      const clr = cl.length ? Math.round((cl.filter((c) => c.done).length / cl.length) * 100) : null;
      let grade = 'good';
      const why = [];
      if (un.length >= 5) { grade = 'bad'; why.push(`미확인 인수인계 ${un.length}건${oldest >= 2 ? ` · ${oldest}일째` : ''}`); }
      else if (comp !== null && comp < 50 && t.length >= 4) { grade = 'bad'; why.push(`완료율 ${comp}%`); }
      else {
        if (un.length >= 2) { grade = 'warn'; why.push(`미확인 인수인계 ${un.length}건`); }
        if (comp !== null && comp < 75 && t.length >= 3) { grade = 'warn'; why.push(`완료율 ${comp}%`); }
        if (clr !== null && clr < 75) { grade = 'warn'; why.push(`청소 ${clr}%`); }
        if (t.length === 0) { if (grade === 'good') grade = 'warn'; why.push('업무 등록 0건'); }
      }
      if (why.length === 0) why.push(`완료 ${comp === null ? '-' : comp + '%'}${clr !== null ? ` · 청소 ${clr}%` : ''}${un.length === 0 ? ' · 적체 없음' : ''}`);
      return { name: short(s.name), grade, why: why.join(' · ') };
    });
    const gradeOrd = { bad: 0, warn: 1, good: 2 };
    storeRows.sort((a, b) => gradeOrd[a.grade] - gradeOrd[b.grade] || a.name.localeCompare(b.name));

    // ── 짚어볼 것 TOP3 ──
    const issues = storeRows.filter((s) => s.grade !== 'good').slice(0, 3).map((s) => `${s.name} — ${s.why}`);

    // ── 칭찬 ──
    const praise = [];
    const byConf = new Map();
    hosLast.filter((h) => h.confirmed_at && h.confirmed_by).forEach((h) => {
      const arr = byConf.get(h.confirmed_by) || [];
      arr.push((new Date(h.confirmed_at) - new Date(h.created_at)) / 3600e3);
      byConf.set(h.confirmed_by, arr);
    });
    let fast = null;
    byConf.forEach((arr, id) => {
      if (arr.length < 2 || !nameOf.has(id)) return;
      const a = arr.reduce((x, y) => x + y, 0) / arr.length;
      if (!fast || a < fast.a) fast = { id, a, n: arr.length };
    });
    if (fast) praise.push(`${nameOf.get(fast.id)} — 인수인계 평균 ${fast.a < 1 ? Math.round(fast.a * 60) + '분' : Math.round(fast.a * 10) / 10 + '시간'} 내 확인 (${fast.n}건)`);
    const byDone = new Map();
    lastTasks.filter((t) => t.status === 'done').forEach((t) => byDone.set(t.employee_id, (byDone.get(t.employee_id) || 0) + 1));
    let top = null;
    byDone.forEach((n, id) => { if (nameOf.has(id) && (!top || n > top.n)) top = { id, n }; });
    if (top && top.n >= 3) praise.push(`${nameOf.get(top.id)} — 이번 주 업무 ${top.n}건 완료 (최다)`);

    const payload = {
      week: { start: wsS, end: weS },
      tiles: { completion: { v: compV, prev: compP }, confirm: { v: confV, prev: confP }, clean: { v: cleanV } },
      stores: storeRows, trend, issues,
      praise: praise.join(' · ') || null,
      generated_at: new Date().toISOString(),
    };

    const up = await fetch(`${SUPABASE_URL}/rest/v1/weekly_reports?on_conflict=tenant_id,week_start`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ tenant_id: T, week_start: wsS, payload }),
    });
    if (!up.ok) throw new Error('저장 실패: ' + (await up.text()));

    res.status(200).json({ ok: true, week: `${wsS}~${weS}`, completion: compV, stores: storeRows.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
