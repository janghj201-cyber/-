// 매장 판정(v6.31) — 앱 「현황」 화면(loadCompanyStatus)과 같은 규칙을 서버에서. AI 아침 요약이 쓴다.
// 왜: 아침 요약이 기록만 보고 「손볼 곳」 같은 말을 스스로 골라, 앱 현황(긴급 · 확인 필요 · 정상)과 어긋났다.
// 규칙을 바꾸면 index.html 의 loadCompanyStatus 와 함께 바꾼다(올라오는 기준 = 설정 tenant_settings.extra.esc).
// 파일 이름이 _ 로 시작해 주소로는 안 열린다. 읽기만 한다.
const ESC_DEFAULT = { hoDays: 3, openGrace: 30, lateGrace: 10, repeatN: 3, bigLate: 60, carryDays: 3, claimHours: 24 };
const LABEL = { urgent: '긴급', check: '확인 필요', ok: '정상' };

const kst = (ms) => new Date((ms ?? Date.now()) + 9 * 3600e3);
const kDate = (offsetDays = 0) => kst(Date.now() + offsetDays * 86400e3).toISOString().slice(0, 10);
const hm2min = (hm) => { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

async function judgeStores(sb, T) {
  const safe = (p, d) => p.catch(() => d);
  const tKey = kDate(0), d30 = kDate(-30), d7 = kDate(-7);
  const now = kst();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const [stores, settings, people, ws, ho, carry] = await Promise.all([
    safe(sb.get(`stores?select=id,name&tenant_id=eq.${T}&active=is.true&limit=200`).catch(() => sb.get(`stores?select=id,name&tenant_id=eq.${T}&limit=200`)), []),
    safe(sb.get(`tenant_settings?select=extra&tenant_id=eq.${T}`).then((r) => (r[0] && r[0].extra) || {}), {}),
    safe(sb.get(`profiles?select=id,name,status,monitor_only&tenant_id=eq.${T}&limit=500`), []),
    safe(sb.get(`work_sessions?select=store_id,profile_id,work_date,started_at&tenant_id=eq.${T}&work_date=gte.${d30}&limit=10000`), []),
    safe(sb.get(`handovers?select=store_id,tag,confirmed,closed,until_date,handover_date&tenant_id=eq.${T}&deleted_at=is.null&confirmed=eq.false&closed=eq.false&limit=3000`), []),
    safe(sb.get(`daily_tasks?select=store_id,task_date&tenant_id=eq.${T}&status=eq.carried_over&task_date=gte.${d7}&limit=5000`), []),
  ]);
  const e = settings.esc || {};
  const esc = {};
  for (const k in ESC_DEFAULT) { const v = Number(e[k]); esc[k] = Number.isFinite(v) && v > 0 ? v : ESC_DEFAULT[k]; }
  const hours = settings.hours || {};
  const nameOf = {}; people.forEach((p) => { nameOf[p.id] = p.name; });
  const dow = now.getUTCDay();
  // 하루 첫 출근만(사람 · 날짜마다 가장 이른 세션) — 앱과 같다
  const first = {};
  ws.filter((r) => r.started_at).forEach((r) => { const k = r.profile_id + '|' + r.work_date; if (!first[k] || r.started_at < first[k].started_at) first[k] = r; });
  const out = {};
  stores.forEach((s) => {
    const h = hours[s.id] || {};
    const open = h.open || '10:00', openMin = hm2min(open);
    const closedToday = Array.isArray(h.off) && h.off.includes(dow);
    const issues = [];
    // 출근 없음 — 여는 시각 + 유예가 지났는데 오늘 근무 기록 없음
    if (!closedToday && nowMin > openMin + esc.openGrace && !ws.some((r) => r.store_id === s.id && r.work_date === tKey)) issues.push({ level: 'urgent', text: '출근 기록 없음' });
    // 지각 — 30일 안 반복 · 7일 안 큰 지각
    const late = {};
    Object.values(first).filter((r) => r.store_id === s.id).forEach((r) => {
      const d = kst(new Date(r.started_at).getTime());
      const m = d.getUTCHours() * 60 + d.getUTCMinutes() - openMin - esc.lateGrace;
      if (m <= 0) return;
      const x = (late[r.profile_id] = late[r.profile_id] || { n: 0, big: null }); x.n++;
      if (m >= esc.bigLate && r.work_date >= d7) x.big = m + esc.lateGrace;
    });
    Object.entries(late).forEach(([pid, v]) => {
      const nm = nameOf[pid] || '?';
      if (v.n >= esc.repeatN) issues.push({ level: 'repeat', text: `지각 반복 · ${nm} ${v.n}회` });
      if (v.big) issues.push({ level: 'urgent', text: `큰 지각 · ${nm} ${v.big}분` });
    });
    // 인수인계 — 클레임은 시간으로, 나머지는 며칠째 안 봄
    ho.filter((x) => x.store_id === s.id && !x.until_date).forEach((x) => {
      const since = x.handover_date || tKey;
      const days = Math.max(0, Math.round((new Date(tKey) - new Date(since)) / 86400e3));
      if (x.tag === '클레임') { const hrs = Math.round((Date.now() - new Date(since).getTime()) / 3600e3); if (hrs >= esc.claimHours) issues.push({ level: 'urgent', text: '클레임 미확인' }); return; }
      if (days >= esc.hoDays) issues.push({ level: 'stale', text: '인수인계 장기 미처리' });
    });
    // 미완료 이월 — 며칠 연속
    const cd = [...new Set(carry.filter((r) => r.store_id === s.id).map((r) => r.task_date))].sort();
    let run = 0, best = 0;
    for (let k = 0; k < cd.length; k++) { run = (k > 0 && (new Date(cd[k]) - new Date(cd[k - 1])) === 86400e3) ? run + 1 : 1; best = Math.max(best, run); }
    if (!closedToday && best >= esc.carryDays) issues.push({ level: 'stale', text: `미완료 이월 ${best}일 연속` });
    const level = issues.some((i) => i.level === 'urgent') ? 'urgent' : issues.length ? 'check' : 'ok';
    // 이유는 종류마다 한 줄(긴급 먼저). 사람 이름은 넣지 않는다 — 아침 요약은 사람을 짚지 않는다
    const ord = { urgent: 0, stale: 1, repeat: 2 };
    const cnt = {};
    issues.sort((a, b) => ord[a.level] - ord[b.level]).forEach((i) => { const k = i.text.split(' · ')[0]; cnt[k] = (cnt[k] || 0) + 1; });
    const reasons = Object.entries(cnt).map(([k, n]) => (n > 1 && !/연속/.test(k) ? `${k} ${n}건` : k));
    out[s.id] = { name: s.name, level, label: LABEL[level], reasons };
  });
  return { byStore: out, esc };
}

module.exports = { judgeStores, LABEL };
