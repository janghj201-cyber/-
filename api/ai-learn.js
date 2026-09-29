// AI 주간 정리 — 매주 월요일 06:00(한국) 지난 한 주의 질문 · 「아니에요」 · 고쳐 준 말을 읽고 회사 업무 노트 「배운 것」을 다시 쓴다.
// 모델을 훈련하지 않는다. 노트(ai_notes, kind=learned)만 바뀌고, 옛 노트는 끈 채로(active=false) 남긴다 — 무엇을 배웠는지 되짚을 수 있게.
// 대표 · 매니저는 「AI가 배운 것」에서 보고 끌 수 있다. 90일 지난 질문 기록(ai_logs)은 여기서 지운다.
// Vercel Cron 일 21:00 UTC. 수동: ?secret=CRON_SECRET (&tenant=<id>)
// 필요 env: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, (권장) CRON_SECRET
const { MODEL_SMART, svc, mask, claude, pickJson, aiOn, notesOf } = require('./_ai');

const PROMPT = `너는 매장 운영 앱 Dutyvo 의 도우미가 이 회사에 맞춰 일하도록 「배운 것」 노트를 정리한다.
받는 것: 지금 노트(우리 회사 규칙 · 지금까지 배운 것)와 지난 한 주의 질문 · 답 · 평가(맞아요 +1 / 아니에요 -1) · 고쳐 준 말.
할 일: 다음 주 도우미가 읽을 「배운 것」을 새로 쓴다(지금 배운 것을 고치거나 합치거나 빼도 된다).
- 고쳐 준 말 · 아니에요는 가장 중요하다. 틀렸던 답을 다음에 바르게 하도록 사실로 적는다(예: "휴무 승인은 관리자 › 휴무에서 한다").
- 자주 묻는 것은 "직원들이 ○○를 자주 묻는다 — △△부터 안내" 식으로.
- 이 회사가 쓰는 말 · 매장 별명 · 일하는 방식이 드러나면 적는다.
- 사람 이름 · 전화 · 손님 정보는 적지 않는다. 한 사람을 평가하는 말 금지.
- 「우리 회사 규칙」과 부딪치는 것은 적지 않는다(규칙이 우선).
- 한 줄 100자 안, 최대 12줄. 확실하지 않은 것은 빼라.
JSON 하나만: {"notes":["...","..."]}`;

async function runTenant(T) {
  const sb = svc();
  const cutoff90 = new Date(Date.now() - 90 * 86400e3).toISOString();
  await sb.del(`ai_logs?tenant_id=eq.${T}&created_at=lt.${encodeURIComponent(cutoff90)}`);
  if (!(await aiOn(sb, T))) return { skip: 'off' };
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const logs = await sb.get(`ai_logs?select=question,answer,feedback,correction,screen&tenant_id=eq.${T}&feature=eq.ask&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=300`).catch(() => []);
  if (logs.length < 3 && !logs.some((l) => l.correction || l.feedback === -1)) return { skip: 'quiet', logs: logs.length };
  const notes = await notesOf(sb, T);
  // 고쳐 준 것 · 아니에요는 전부, 나머지는 질문만 최근 150개
  const hard = logs.filter((l) => l.correction || l.feedback === -1).slice(0, 60);
  const rest = logs.filter((l) => !(l.correction || l.feedback === -1)).slice(0, 150);
  const text = `# 지금 노트
우리 회사 규칙:
${notes.filter((n) => n.kind === 'rule').map((n) => `- ${n.body}`).join('\n') || '- 없음'}
지금까지 배운 것:
${notes.filter((n) => n.kind === 'learned').map((n) => `- ${n.body}`).join('\n') || '- 없음'}

# 틀렸다고 한 답 · 고쳐 준 말(${hard.length})
${hard.map((l) => `- 질문: ${mask(l.question).slice(0, 150)}\n  답: ${mask(l.answer).slice(0, 200)}\n  평가: ${l.feedback === -1 ? '아니에요' : l.feedback === 1 ? '맞아요' : '-'}${l.correction ? `\n  고쳐 준 말: ${mask(l.correction).slice(0, 200)}` : ''}`).join('\n') || '- 없음'}

# 그 밖의 질문(${rest.length}, 최신 먼저)
${rest.map((l) => `- ${mask(l.question).slice(0, 100)}${l.feedback === 1 ? ' (맞아요)' : ''}`).join('\n') || '- 없음'}`;
  const r = await claude({ model: MODEL_SMART, cacheSystem: PROMPT, messages: [{ role: 'user', content: text }], maxTokens: 900 });
  const j = pickJson(r.text) || {};
  const list = (Array.isArray(j.notes) ? j.notes : []).map((x) => mask(String(x).trim()).slice(0, 200)).filter(Boolean).slice(0, 12);
  if (!list.length) return { skip: 'empty', logs: logs.length };
  await sb.patch(`ai_notes?tenant_id=eq.${T}&kind=eq.learned&active=eq.true`, { active: false });
  await sb.post('ai_notes', list.map((body) => ({ tenant_id: T, kind: 'learned', body })), 'return=minimal');
  await sb.post('ai_logs', { tenant_id: T, profile_id: null, feature: 'learn', answer: list.join('\n'), model: r.model, tokens_in: r.tin, tokens_out: r.tout }, 'return=minimal').catch(() => {});
  return { logs: logs.length, notes: list.length };
}

module.exports = async (req, res) => {
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
      try { results.push({ tenant: t.name, ok: true, ...(await runTenant(t.id)) }); }
      catch (e) { results.push({ tenant: t.name, ok: false, error: String((e && e.message) || e).slice(0, 200) }); }
    }
    res.status(200).json({ ok: results.every((r) => r.ok), tenants: results });
  } catch (e) { res.status(500).json({ ok: false, error: String((e && e.message) || e) }); }
};
module.exports.runTenant = runTenant;
