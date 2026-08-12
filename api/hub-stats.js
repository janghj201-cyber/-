// 허브 연동용 읽기 전용 통계 — 매장별 오늘 업무 완료/미완료, 인수인계 미확인 건수 (JSON)
// GET /api/hub-stats?token=HUB_TOKEN  (읽기 전용 · 개인 식별정보 없음 · 매장 단위 숫자만)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vbuhueykvizmnrfvkehq.supabase.co';
const TENANT_NAME  = process.env.TENANT_NAME || '위베이프 인천/경기 지사';

module.exports = async (req, res) => {
  const token = process.env.HUB_TOKEN || process.env.CRON_SECRET;
  if (token && (req.query && req.query.token) !== token) { res.status(401).json({ error: 'unauthorized' }); return; }
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY) { res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY 미설정' }); return; }

  const sb = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    if (!r.ok) throw new Error(`${path.split('?')[0]}: ${await r.text()}`);
    return r.json();
  };

  try {
    const nowK = new Date(Date.now() + 9 * 3600e3);
    const today = nowK.toISOString().slice(0, 10); // KST 오늘

    const tenants = await sb(`tenants?select=id&name=eq.${encodeURIComponent(TENANT_NAME)}`);
    if (!tenants.length) throw new Error(`테넌트 없음: ${TENANT_NAME}`);
    const T = tenants[0].id;

    const [stores, tasks, unconf] = await Promise.all([
      sb(`stores?select=id,name&tenant_id=eq.${T}&order=name&limit=100`),
      sb(`daily_tasks?select=store_id,status&tenant_id=eq.${T}&task_date=eq.${today}&limit=10000`),
      sb(`handovers?select=store_id,created_at&tenant_id=eq.${T}&confirmed=eq.false&closed=eq.false&deleted_at=is.null&limit=10000`),
    ]);

    const now = Date.now();
    // 허브 표준 매장명 매핑 (허브 KPI 명단과 동일 표기)
    const HUB_NAMES = {
      '검단점': '위베이프 검단점',
      '계산점': '위베이프 계산점',
      '구월 길병원점': '위베이프 구월길병원점',
      '구월 로데오점': '위베이프 구월로데오점',
      '인천 논현점': '위베이프 논현점',
      '부천 상동점': '위베이프 부천상동점',
      '부천 신중동점': '위베이프 부천중동점',
      '인천 연수점': '위베이프 연수점',
      '인천공항점': '위베이프 인천공항점',
    };

    const rows = stores.map((s) => {
      const t = tasks.filter((x) => x.store_id === s.id);
      const un = unconf.filter((u) => u.store_id === s.id);
      const oldestDays = un.length ? Math.floor((now - Math.min(...un.map((u) => +new Date(u.created_at)))) / 86400e3) : 0;
      return {
        store_id: s.id,
        store_name: s.name,
        hub_name: HUB_NAMES[s.name] || ('위베이프 ' + String(s.name).replace(/\s+/g, '')),
        tasks_done: t.filter((x) => x.status === 'done').length,
        tasks_pending: t.filter((x) => x.status === 'pending').length,
        tasks_total: t.filter((x) => x.status === 'done' || x.status === 'pending').length,
        handover_unconfirmed: un.length,
        handover_oldest_days: oldestDays,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=600'); // 10분 캐시 — 허브가 하루 1번이면 충분
    res.status(200).json({
      ok: true,
      date: today,
      generated_at: new Date().toISOString(),
      totals: {
        tasks_done: rows.reduce((a, r) => a + r.tasks_done, 0),
        tasks_pending: rows.reduce((a, r) => a + r.tasks_pending, 0),
        handover_unconfirmed: rows.reduce((a, r) => a + r.handover_unconfirmed, 0),
      },
      stores: rows,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
