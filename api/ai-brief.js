// AI 아침 요약 — 매일 08:00(한국) 어제 매장별로 있었던 일을 세 줄로. 대표 · 매니저 폰 알림 + 홈 맨 위 카드(ai_briefs)
// Vercel Cron 23:00 UTC. 수동: ?secret=CRON_SECRET (&tenant=<id> 한 회사만, &nopush=1 알림 없이)
// 어제 아무 기록도 없는 회사는 건너뛴다(쓸 말이 없는데 돈을 쓰지 않는다). AI 를 끈 회사도 건너뛴다.
// 손님 이름 · 전화는 읽지 않고, 인수인계 글 속 전화 · 이메일 모양은 가린 뒤 보낸다.
// 필요 env: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, (권장) CRON_SECRET
const { MODEL_SMART, svc, mask, kstDate, claude, pickJson, aiOn, notesOf, notesText } = require('./_ai');
const { judgeStores } = require('./_judge');

const PROMPT = `너는 매장 운영 앱 Dutyvo 가 대표 · 매니저에게 아침마다 보내는 요약을 쓴다.
아래 「어제 기록」만 보고, 사장님이 오늘 아침 확인해야 할 것을 먼저 쓴다.
- lines: 세 줄 이하. 한 줄 45자 안팎. 매장 이름을 앞에. 문제 · 할 일이 먼저, 잘된 것은 마지막 한 줄에만.
- 다 정상이면 lines 한 줄로 "어제는 모든 매장이 정상이었어요" 식으로.
- stores: 매장마다 한 줄(없으면 빈 배열). 확인할 것이 있는 매장만.
- 기록에 없는 숫자 · 이름 · 원인을 지어내지 않는다. 사람을 탓하는 말투 금지. 이모지 없이.
- 「우리 회사 규칙」이 있으면 그 말과 기준을 따른다.
- 매장 판정은 각 매장의 「앱 판정」 줄만 따른다(긴급 · 확인 필요 · 정상 — 앱 「현황」 화면과 같은 판정). 판정이 정상인 매장을 문제 매장처럼 쓰지 않고, 판정을 새로 만들지 않는다.
- 「손볼 곳」 「문제 매장」 「위험」 같은 다른 판정 말은 쓰지 않는다. 긴급 · 확인 필요인 매장은 그 말을 그대로 쓰고 이유를 짧게 붙인다(예: "검단점 긴급 — 클레임 미확인").
- 긴급이 있으면 그 매장이 첫 줄. 판정이 정상이어도 어제 기록에 볼 것이 있으면 "알아 둘 것"으로 사실만 쓴다.
JSON 하나만: {"lines":["..."],"stores":[{"store":"매장","text":"..."}]}`;

const short = (n) => String(n || '').replace(/^(인천|부천|구월)\s+/, '');

async function collect(sb, T, J) {
  const y = kstDate(-1), t = kstDate(0);
  const yS = new Date(`${y}T00:00:00+09:00`).toISOString(), tS = new Date(`${t}T00:00:00+09:00`).toISOString(), d3 = new Date(Date.now() - 3 * 86400e3).toISOString();
  const safe = (p) => p.catch(() => []);
  const [stores, people, ho, stale, tasks, clean, ws, lots, appts, deals] = await Promise.all([
    safe(sb.get(`stores?select=id,name&tenant_id=eq.${T}&limit=100`)),
    safe(sb.get(`profiles?select=id,name,role,status&tenant_id=eq.${T}&limit=300`)),
    safe(sb.get(`handovers?select=store_id,content,tag,confirmed,closed,working_at&tenant_id=eq.${T}&deleted_at=is.null&created_at=gte.${encodeURIComponent(yS)}&created_at=lt.${encodeURIComponent(tS)}&limit=300`)),
    safe(sb.get(`handovers?select=store_id&tenant_id=eq.${T}&confirmed=eq.false&closed=eq.false&deleted_at=is.null&created_at=lt.${encodeURIComponent(d3)}&limit=1000`)),
    safe(sb.get(`daily_tasks?select=store_id,status&tenant_id=eq.${T}&task_date=eq.${y}&limit=5000`)),
    safe(sb.get(`cleaning_daily_logs?select=store_id,done&tenant_id=eq.${T}&log_date=eq.${y}&limit=5000`)),
    safe(sb.get(`work_sessions?select=store_id,profile_id,started_at,ended_at&tenant_id=eq.${T}&work_date=eq.${y}&limit=500`)),
    safe(sb.get(`expiry_lots?select=store_id,due_on,status&tenant_id=eq.${T}&status=eq.active&due_on=lte.${t}&limit=500`)),
    safe(sb.get(`appointments?select=store_id,kind,status&tenant_id=eq.${T}&starts_at=gte.${encodeURIComponent(tS)}&starts_at=lt.${encodeURIComponent(new Date(`${kstDate(1)}T00:00:00+09:00`).toISOString())}&limit=500`)),
    safe(sb.get(`deals?select=ball,next_date&tenant_id=eq.${T}&ball=eq.us&next_date=lte.${t}&limit=500`)),
  ]);
  const act = ho.length + tasks.length + clean.length + ws.length;
  const sN = new Map(stores.map((s) => [s.id, short(s.name)]));
  const lines = stores.map((s) => {
    const id = s.id, L = [];
    const h = ho.filter((x) => x.store_id === id);
    if (h.length) {
      const tags = h.filter((x) => x.tag).map((x) => `[${x.tag}${x.closed ? ' 끝남' : x.working_at ? ' 처리 중' : ' 미처리'}] ${mask(x.content).slice(0, 50)}`);
      L.push(`인수인계 ${h.length}건(미확인 ${h.filter((x) => !x.confirmed && !x.closed).length})${tags.length ? ' · ' + tags.join(' / ') : ''}`);
    }
    const st = stale.filter((x) => x.store_id === id).length; if (st) L.push(`3일 넘게 안 본 인수인계 ${st}건`);
    const tk = tasks.filter((x) => x.store_id === id); if (tk.length) L.push(`할 일 ${tk.length}건 중 완료 ${tk.filter((x) => x.status === 'done').length} · 이월 ${tk.filter((x) => x.status === 'carried_over' || x.status === 'pending').length}`);
    const cl = clean.filter((x) => x.store_id === id); if (cl.length) L.push(`청소 ${cl.filter((x) => x.done).length}/${cl.length}`); else L.push('청소 기록 없음');
    const w = ws.filter((x) => x.store_id === id); L.push(w.length ? `출근 ${new Set(w.map((x) => x.profile_id)).size}명 · 마감 누른 사람 ${w.filter((x) => x.ended_at).length}` : '출근 기록 없음(쉬는 날일 수 있음)');
    const lt = lots.filter((x) => x.store_id === id); if (lt.length) L.push(`보관기한 오늘까지 · 지난 것 ${lt.length}건`);
    const ap = appts.filter((x) => x.store_id === id && x.status !== 'cancelled'); if (ap.length) L.push(`오늘 예약 · 미팅 ${ap.length}건`);
    const j = J && J.byStore[id];
    if (j) L.unshift(`앱 판정: ${j.label}${j.reasons.length ? ` — ${j.reasons.join(' · ')}` : ''}`);
    return `## ${sN.get(id)}\n- ${L.join('\n- ')}`;
  });
  if (deals.length) lines.push(`## 거래처\n- 오늘까지 우리 차례인 건 ${deals.length}건`);
  const managers = people.filter((p) => (p.status ?? 'active') !== 'inactive' && (p.role === 'owner' || p.role === 'manager'));
  return { act, text: `어제(${y}) 기록\n\n${lines.join('\n\n')}`, managers, y, t };
}

async function runTenant(T, { push = true } = {}) {
  const sb = svc();
  if (!(await aiOn(sb, T))) return { skip: 'off' };
  const today = kstDate(0);
  const had = await sb.get(`ai_briefs?select=brief_date&tenant_id=eq.${T}&brief_date=eq.${today}`).catch(() => []);
  if (had.length) return { skip: 'done' };
  const J = await judgeStores(sb, T).catch(() => null); // 판정을 못 읽으면 판정 줄 없이(예전처럼)
  const c = await collect(sb, T, J);
  if (!c.act) return { skip: 'quiet' };
  if (!c.managers.length) return { skip: 'nomanager' };
  const notes = await notesOf(sb, T);
  const r = await claude({ model: MODEL_SMART, cacheSystem: PROMPT, system: `# 회사 업무 노트\n${notesText(notes)}`, messages: [{ role: 'user', content: c.text }], maxTokens: 600 });
  const j = pickJson(r.text) || {};
  const lines = (Array.isArray(j.lines) ? j.lines : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
  if (!lines.length) return { skip: 'empty' };
  const stores = (Array.isArray(j.stores) ? j.stores : []).slice(0, 12).map((s) => ({ store: String(s.store || '').slice(0, 20), text: String(s.text || '').slice(0, 120) }));
  await sb.post('ai_briefs', { tenant_id: T, brief_date: today, body: { lines, stores, day: c.y } }, 'return=minimal,resolution=ignore-duplicates');
  await sb.post('ai_logs', { tenant_id: T, profile_id: null, feature: 'brief', question: null, answer: lines.join('\n'), model: r.model, tokens_in: r.tin, tokens_out: r.tout }, 'return=minimal').catch(() => {});
  let sent = 0;
  if (push && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    const webpush = require('web-push');
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:janghj201@gmail.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const ids = c.managers.map((m) => m.id);
    const subs = await sb.get(`push_subscriptions?select=endpoint,p256dh,auth,profile_id&tenant_id=eq.${T}&profile_id=in.(${ids.join(',')})&limit=500`).catch(() => []);
    const payload = JSON.stringify({ title: '아침 요약', body: lines.join(' · ').slice(0, 120), url: '/?ai=brief' });
    for (const s of subs) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await sb.del(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`); }
    }
  }
  return { lines: lines.length, sent };
}

const handler = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || '';
    const qs = (req.query && req.query.secret) || '';
    if (auth !== `Bearer ${secret}` && qs !== secret) { res.status(401).json({ error: 'unauthorized' }); return; }
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ANTHROPIC_API_KEY) { res.status(500).json({ error: 'env 미설정(SUPABASE_SERVICE_ROLE_KEY · ANTHROPIC_API_KEY)' }); return; }
  try {
    const sb = svc();
    const only = req.query && req.query.tenant;
    const tenants = await sb.get(`tenants?select=id,name${only ? `&id=eq.${encodeURIComponent(only)}` : ''}&limit=1000`);
    const results = [];
    for (const t of tenants) {
      try { results.push({ tenant: t.name, ok: true, ...(await runTenant(t.id, { push: !(req.query && req.query.nopush === '1') })) }); }
      catch (e) { results.push({ tenant: t.name, ok: false, error: String((e && e.message) || e).slice(0, 200) }); }
    }
    res.status(200).json({ ok: results.every((r) => r.ok), tenants: results });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
};
module.exports = handler;
module.exports.runTenant = runTenant;
