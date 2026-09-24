// 손님 정보 1년 보관 뒤 삭제 — 예약 동의 문구(「마지막 방문 후 1년 보관 뒤 삭제」)를 지키는 매일 정리.
// Vercel Cron: 18:00 UTC(= 03:00 KST). 본체는 DB 함수 vf_purge_old_guests(SQL_v612) — 서비스 키로만 부를 수 있다.
// 지우는 것: 마지막 방문 · 예약 · 등록에서 1년 지난 손님(이름 · 번호 · 메모), 그 손님 예약의 요청 사항 · 이름 칸, 30일 지난 대기 신청.
// 남기는 것: 예약 자체(날짜 · 시술 · 담당 · 상태) — 매장 기록. 수동 확인: ?secret=CRON_SECRET&dry=1 (지우지 않고 셈만)
// 필요 env: SUPABASE_SERVICE_ROLE_KEY, (권장) CRON_SECRET
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vbuhueykvizmnrfvkehq.supabase.co';

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || '';
    const qs = (req.query && req.query.secret) || '';
    if (auth !== `Bearer ${secret}` && qs !== secret) { res.status(401).json({ error: 'unauthorized' }); return; }
  }
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!KEY) { res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY 미설정' }); return; }
  const dry = (req.query && req.query.dry) === '1';
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/vf_purge_old_guests`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_dry: dry }),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(text.slice(0, 300));
    res.status(200).json({ ok: true, result: JSON.parse(text) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
};
