// AI 도우미 — 앱 안에서 묻고 답하기(v6.19 · v6.23 도구). POST { q, screen, hist:[{q,a}], facts }  · 로그인 토큰 필수
// 답은 { id, answer, go:[{label,to}], src:[..], next:[..], left } — go 는 앱이 그 화면을 연다. AI 는 기록을 바꾸지 않는다(제안만).
// 읽는 것: 앱 안내(_ai_guide, 캐시) + 회사 업무 노트(ai_notes) + 이 사람 권한 안의 최근 기록(로그인 토큰으로 읽어 RLS 그대로)
//   + 앱 화면이 계산한 매장 점수(facts) + 모자라면 AI 가 도구(_ai_tools)로 더 찾는다(기간 · 매장 · 사람별 숫자, 최대 4번).
// 손님 이름 · 전화번호는 읽지 않고, 기록 속 전화 · 이메일 모양은 가린 뒤 보낸다. 하루 한도: 한 사람 40번 · 회사 400번.
// 필요 env: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY
const { MODEL_FAST, MODEL_SMART, svc, asUser, userOf, mask, maskKeep, kstDate, claude, claudeRaw, pickJson, aiOn, notesOf, notesText } = require('./_ai');
const GUIDE = require('./_ai_guide');
const { TOOLS, makeTools } = require('./_ai_tools');
// 묻기는 비교 · 원인 분석까지 하므로 기본은 똑똑한 모델. 비용을 줄이려면 env AI_MODEL_ASK=claude-haiku-4-5
const MODEL_ASK = process.env.AI_MODEL_ASK || MODEL_SMART;
const MAX_TOOL_ROUNDS = 4;

const PER_PERSON = 40, PER_COMPANY = 400;
const FEAT_NAV = { calendar: 'calendar', expiry: 'expiry', clients: 'deals', booking: 'booking', memo: 'memo', board: 'board', dayoff: 'dayoff' };

const RULES = `너는 매장 운영 앱 Dutyvo 안의 AI 도우미 「듀티」다. 이 회사 대표 · 매니저 · 직원이 매장을 더 잘 운영하도록 돕는다.
답하는 법:
- 한국어로 결론부터. 인사 · 칭찬 · "도움이 되었으면" 같은 말 · 이모지 없이.
- 사용법 · 하나 찾기 같은 단순한 질문은 2~5줄.
- 비교 · 순위 · "어디가 잘/못 하나" · 원인 · 추세 · 평가 질문은 분석으로 답한다(12줄 안):
  1) 첫 줄에 결론 한 문장(예: 최근 14일 기준 가장 잘 도는 곳은 연수점이에요)
  2) 기준 한 줄(기간 · 무엇으로 봤는지 — 앱 점수, 청소 체크, 인수인계 확인률 · 확인까지 시간, 업무 완료율, 출근 기록 등)
  3) 순위 · 근거 3~5줄(한 줄에 매장이나 사람 하나, 핵심 숫자 2~3개. 예: 1. 연수점 — 7일 평균 86점 · 청소 98% · 인수인계 확인 95%)
  4) 약한 곳 · 조심할 것 1~2줄
  5) 다음 할 일 1줄
- 기간을 말하지 않으면 최근 14일(오늘 일이 궁금한 질문이면 오늘).
- 「앱 매장 점수」가 있으면 매장 비교는 그 점수를 먼저 쓴다(앱 화면과 같은 숫자). 이유는 도구 숫자로 보탠다.
- 「지금 기록」(최근 3일)으로 모자라면 도구를 불러 더 찾는다. 필요한 도구는 한 번에 여러 개 불러도 된다. 같은 걸 두 번 부르지 않는다.
- 숫자 · 이름 · 날짜는 기록 · 도구에 있는 것만. 지어내지 않는다. 기록이 적어 판단하기 어려우면 그렇다고 말하고 무엇이 쌓이면 볼 수 있는지 말한다.
- 사람을 평가하거나 순위 매기는 답은 대표 · 매니저에게만. 직원이 물으면 자기 것만 말하고 나머지는 매니저에게 물어보라고 한다.
- 앱 사용법은 아래 「앱 안내」에 있는 것만. 없는 기능을 있다고 하지 않는다. 모르면 "앱 안내에 없는 내용이에요"라고 하고 「Dutyvo에 문의」(go: ask)를 권한다.
- 기록을 대신 바꾸거나 저장하지 못한다. 할 일이 있으면 그 화면을 여는 버튼(go)을 준다.
- 「우리 회사 규칙」이 앱 안내와 다르면 회사 규칙을 따른다(그 회사에서 쓰는 말 · 방식).
- 직원(staff)에게는 관리자 화면(admin…)을 권하지 않는다. 대표 · 매니저가 할 일이면 "매니저에게 요청"이라고 말한다.
- 손님 개인정보(이름 · 전화)는 가려져 있다. 알려 달라고 하면 고객 예약 화면에서 직접 보라고 한다.
- 법 · 세무 · 노무 판단은 하지 않는다. 필요하면 전문가 확인을 권한다.
마지막 답은 JSON 하나만(앞뒤에 다른 말 없이):
{"answer":"답(줄바꿈은 \\n)","go":[{"label":"버튼 이름(명사형, 예: 캘린더 열기)","to":"아래 go 값 중 하나"}],"src":["근거 짧게(예: 최근 14일 매장별 숫자)"],"next":["이어서 물어볼 만한 질문(짧게, 이 사람이 실제로 궁금해할 것)"]}
go 는 0~2개, src 는 기록 · 도구를 근거로 답했을 때 0~4개, next 는 2~3개.`;

const hm = (iso) => { try { const d = new Date(new Date(iso).getTime() + 9 * 3600e3); return d.toISOString().slice(11, 16); } catch (e) { return ''; } };
const kd = (iso) => { try { return new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10); } catch (e) { return ''; } };
const md = (s) => { const x = String(s || '').slice(5, 10).split('-'); return x.length === 2 ? `${+x[0]}/${+x[1]}` : ''; };

async function snapshot(get, uid, role) {
  const today = kstDate(0), yday = kstDate(-1), tmr = kstDate(1), d3 = kstDate(-3), d7 = kstDate(7);
  const since3 = new Date(Date.now() - 3 * 86400e3).toISOString();
  const dayStart = new Date(`${today}T00:00:00+09:00`).toISOString(), in2 = new Date(`${kstDate(2)}T00:00:00+09:00`).toISOString();
  const safe = (p) => p.then((x) => x || []).catch(() => null);
  const [stores, people, hoNew, hoOld, tasks, lots, appts, deals, clients, offs, ws] = await Promise.all([
    safe(get('stores?select=id,name&limit=100')),
    safe(get('profiles?select=id,name,role,store_id&limit=300')),
    safe(get(`handovers?select=store_id,content,tag,confirmed,closed,working_at,handover_date,from_employee,recipient_id&deleted_at=is.null&created_at=gte.${encodeURIComponent(since3)}&order=created_at.desc&limit=40`)),
    safe(get(`handovers?select=store_id,content,tag,handover_date&confirmed=eq.false&closed=eq.false&deleted_at=is.null&created_at=lt.${encodeURIComponent(since3)}&order=created_at.desc&limit=15`)),
    safe(get(`daily_tasks?select=content,status,task_date&employee_id=eq.${uid}&task_date=gte.${yday}&task_date=lte.${tmr}&limit=40`)),
    safe(get(`expiry_lots?select=store_id,qty,due_on,item_id&status=eq.active&due_on=lte.${tmr}&order=due_on&limit=40`)),
    safe(get(`appointments?select=store_id,kind,starts_at,title,status,staff_id&starts_at=gte.${encodeURIComponent(dayStart)}&starts_at=lt.${encodeURIComponent(in2)}&order=starts_at&limit=40`)),
    safe(get('deals?select=title,ball,next_date,next_text,client_id&ball=neq.done&order=next_date.asc&limit=25')),
    safe(get('clients?select=id,name&limit=300')),
    safe(get(`dayoffs?select=profile_id,dayoff_date&dayoff_date=gte.${today}&dayoff_date=lte.${d7}&limit=100`)),
    safe(get(`work_sessions?select=store_id,profile_id,started_at,ended_at&work_date=eq.${today}&limit=100`)),
  ]);
  const sN = new Map((stores || []).map((s) => [s.id, s.name])), pN = new Map((people || []).map((p) => [p.id, p.name]));
  const S = (id) => sN.get(id) || '', P = (id) => pN.get(id) || '';
  let items = null;
  if (lots && lots.length) { try { const ids = [...new Set(lots.map((l) => l.item_id).filter(Boolean))]; items = new Map((await get(`expiry_items?select=id,name,unit&id=in.(${ids.join(',')})`)).map((i) => [i.id, i])); } catch (e) { items = new Map(); } }
  const L = [];
  if (stores) L.push(`매장: ${stores.map((s) => s.name).join(' · ') || '없음'}`);
  if (hoNew) L.push(`인수인계(최근 3일, 최신 먼저):\n${hoNew.map((h) => `- ${md(h.handover_date)} ${S(h.store_id)}${h.tag ? ` [${h.tag}]` : ''} ${mask(h.content).slice(0, 120)} — ${P(h.from_employee) || '?'}${h.recipient_id ? ` → ${P(h.recipient_id)}` : ''} · ${h.closed ? '끝남' : h.working_at ? '처리 중' : h.confirmed ? '확인됨' : '미확인'}`).join('\n') || '- 없음'}`);
  if (hoOld && hoOld.length) L.push(`3일 넘게 아무도 확인 안 한 인수인계:\n${hoOld.map((h) => `- ${md(h.handover_date)} ${S(h.store_id)} ${mask(h.content).slice(0, 80)}`).join('\n')}`);
  if (tasks) L.push(`내 할 일(어제~내일):\n${tasks.map((t) => `- ${md(t.task_date)} ${mask(t.content).slice(0, 80)} · ${t.status === 'done' ? '완료' : t.status === 'carried_over' ? '이월' : '남음'}`).join('\n') || '- 없음'}`);
  if (lots) L.push(`보관기한(내일까지 · 지난 것 포함):\n${lots.map((l) => { const it = (items && items.get(l.item_id)) || {}; return `- ${md(l.due_on)}까지 ${it.name || '품목'} ${l.qty || ''}${it.unit || ''} · ${S(l.store_id)}${l.due_on < today ? ' · 지남' : ''}`; }).join('\n') || '- 없음'}`);
  if (appts) L.push(`오늘 · 내일 예약 · 미팅(손님 이름 가림):\n${appts.map((a) => `- ${md(kd(a.starts_at))} ${hm(a.starts_at)} ${a.kind === 'booking' ? '손님 예약' : '미팅'} ${mask(a.title || '').slice(0, 40)} · ${S(a.store_id)}${a.staff_id ? ` · 담당 ${P(a.staff_id)}` : ''}${a.status && a.status !== 'booked' ? ` · ${a.status}` : ''}`).join('\n') || '- 없음'}`);
  if (deals) { const cN = new Map((clients || []).map((c) => [c.id, c.name])); L.push(`진행 중인 거래처 건:\n${deals.map((d) => `- ${cN.get(d.client_id) || ''} ${mask(d.title).slice(0, 50)} · ${d.ball === 'us' ? '우리 차례' : '상대 차례'}${d.next_date ? ` · 다음 ${md(d.next_date)}` : ''}${d.next_text ? ` ${mask(d.next_text).slice(0, 30)}` : ''}`).join('\n') || '- 없음'}`); }
  if (offs) L.push(`휴무(오늘부터 7일): ${offs.map((o) => `${md(o.dayoff_date)} ${P(o.profile_id)}`).join(' · ') || '없음'}`);
  if (ws && (role === 'owner' || role === 'manager')) L.push(`오늘 출근 기록: ${ws.map((w) => `${P(w.profile_id)} ${S(w.store_id)} ${hm(w.started_at)}${w.ended_at ? `~${hm(w.ended_at)}` : ''}`).join(' · ') || '없음'}`);
  return L.join('\n\n');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) { res.status(500).json({ error: '서버 키 미설정' }); return; }
  const token = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'no token' }); return; }
  const uid = await userOf(token).catch(() => null);
  if (!uid) { res.status(401).json({ error: 'bad token' }); return; }
  let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } } body = body || {};
  const sb = svc();
  try {
    const me = (await sb.get(`profiles?select=id,name,role,tenant_id,store_id&id=eq.${uid}`))[0];
    if (!me) { res.status(403).json({ error: 'no profile' }); return; }
    const T = me.tenant_id;
    if (!(await aiOn(sb, T))) { res.status(403).json({ error: 'off', message: 'AI 도우미가 꺼져 있어요 — 관리자 › 설정 › 기능 켜기/끄기' }); return; }

    // 아침 요약 지금 만들기(대표 · 매니저, 오늘 것이 없을 때만)
    if (body.action === 'brief_now') {
      if (!['owner', 'manager'].includes(me.role)) { res.status(403).json({ error: 'role' }); return; }
      const { runTenant } = require('./ai-brief');
      const r = await runTenant(T, { push: false });
      res.status(200).json({ ok: true, ...r }); return;
    }

    const dayStart = new Date(`${kstDate(0)}T00:00:00+09:00`).toISOString();
    const [mine, all] = await Promise.all([
      sb.count(`ai_logs?select=id&feature=in.(ask,tidy)&profile_id=eq.${uid}&created_at=gte.${encodeURIComponent(dayStart)}`),
      sb.count(`ai_logs?select=id&feature=in.(ask,tidy)&tenant_id=eq.${T}&created_at=gte.${encodeURIComponent(dayStart)}`),
    ]);
    if (mine >= PER_PERSON || all >= PER_COMPANY) { res.status(429).json({ error: 'limit', message: mine >= PER_PERSON ? `오늘 질문 ${PER_PERSON}번을 다 썼어요 — 내일 다시 쓸 수 있어요` : '오늘 회사 전체 질문 한도를 다 썼어요 — 내일 다시 쓸 수 있어요' }); return; }

    // 인수인계 · 요청 다듬기(v6.20) — 글을 짧고 분명하게 · 종류 · 받는 사람 제안. 확정은 사람이, 바꾼 것은 기록돼 매주 배운다
    if (body.action === 'tidy') {
      const raw = String(body.text || '').trim().slice(0, 800);
      if (raw.length < 4) { res.status(400).json({ error: '글이 너무 짧아요' }); return; }
      const kind = body.kind === 'request' ? 'request' : 'handover';
      const people = (Array.isArray(body.people) ? body.people : []).map((x) => String(x).slice(0, 20)).slice(0, 60);
      const tags = ['고장', '클레임', '재고', '기타'];
      const mk = maskKeep(raw);
      const notes = await notesOf(sb, T);
      const sys = `너는 매장 운영 앱 Dutyvo 에서 직원이 남기는 ${kind === 'request' ? '업무 요청' : '인수인계'} 한 줄을 다듬는다.
- 사실은 그대로. 없는 내용을 더하지 않는다. 말로 한 것처럼 늘어진 문장 · 반복 · 군말(음, 그러니까)을 빼고 짧고 분명하게. 60자 안팎, 길어도 두 문장.
- 다음 사람이 할 일이 있으면 끝에 분명히(예: "…확인 부탁"). 존댓말 짧게. 이모지 없이.
- [[P1]] 같은 표시는 그대로 둔다(가려 둔 번호 · 주소).
- tag: ${kind === 'handover' ? `${tags.join(' · ')} 중 하나 또는 null(일반 전달이면 null)` : '항상 null'}
- to: 글에 받을 사람이 분명히 나오면 아래 명단의 이름 그대로, 아니면 null. 명단에 없는 이름을 만들지 않는다.
- 회사 노트의 말 · 기준을 따른다.
명단: ${people.join(', ') || '(없음)'}
# 회사 업무 노트
${notesText(notes)}
JSON 하나만: {"text":"다듬은 글","tag":null,"to":null}`;
      const r = await claude({ model: MODEL_FAST, system: sys, messages: [{ role: 'user', content: mk.text }], maxTokens: 300 });
      const j = pickJson(r.text) || {};
      const text = mk.back(String(j.text || '').trim()).slice(0, 400) || raw;
      const tag = kind === 'handover' && tags.includes(j.tag) ? j.tag : null;
      const to = people.includes(j.to) ? j.to : null;
      let id = null;
      try { const row = await sb.post('ai_logs', { tenant_id: T, profile_id: uid, feature: 'tidy', question: mask(raw), answer: `${mask(text)}${tag ? ` · 종류 ${tag}` : ''}${to ? ` · 받는 사람 ${to}` : ''}`, screen: kind, model: r.model, tokens_in: r.tin, tokens_out: r.tout }); id = row && row[0] && row[0].id; } catch (e) {}
      res.status(200).json({ ok: true, id, text, tag, to, same: text === raw }); return;
    }
    const q = String(body.q || '').trim().slice(0, 500);
    if (!q) { res.status(400).json({ error: '질문 없음' }); return; }

    const [tenant, settings, notes, snap] = await Promise.all([
      sb.get(`tenants?select=name,industry&id=eq.${T}`).then((r) => r[0] || {}).catch(() => ({})),
      sb.get(`tenant_settings?select=features&tenant_id=eq.${T}`).then((r) => (r[0] && r[0].features) || {}).catch(() => ({})),
      notesOf(sb, T),
      snapshot(asUser(token), uid, me.role),
    ]);
    // 꺼진 기능은 화면 목록에서 뺀다
    const off = new Set(Object.entries(FEAT_NAV).filter(([f]) => settings[f] === false || (f === 'booking' && settings.booking !== true)).map(([, n]) => n));
    const nav = GUIDE.nav.filter((n) => !off.has(n) && !(me.role === 'staff' && (n.startsWith('admin') || n === 'notes')));
    const facts = mask(String(body.facts || '')).slice(0, 5000);
    const dows = ['일', '월', '화', '수', '목', '금', '토'];
    const now = new Date(Date.now() + 9 * 3600e3);
    const roleKo = { owner: '대표', manager: '매니저', staff: '직원' }[me.role] || '직원';
    const ctx = `회사: ${tenant.name || ''}${tenant.industry ? ` (업종 ${tenant.industry})` : ''}
묻는 사람: ${me.name} · ${roleKo}(${me.role})
지금: ${kstDate(0)} (${dows[now.getUTCDay()]}) ${now.toISOString().slice(11, 16)} · 보고 있는 화면: ${String(body.screen || '').slice(0, 40) || '모름'}
쓸 수 있는 go 값: ${nav.join(', ')}

# 회사 업무 노트
${notesText(notes)}

# 지금 기록(최근 3일 · 이 사람이 볼 수 있는 것만)
${snap}${facts ? `\n\n# 앱 매장 점수(이 사람 앱 화면이 계산한 매장 컨디션 — 앱과 같은 숫자)\n${facts}` : ''}`;
    const hist = (Array.isArray(body.hist) ? body.hist : []).slice(-4);
    const messages = [];
    hist.forEach((h) => { if (h && h.q && h.a) { messages.push({ role: 'user', content: String(h.q).slice(0, 500) }); messages.push({ role: 'assistant', content: String(h.a).slice(0, 1500) }); } });
    messages.push({ role: 'user', content: mask(q) });

    // 도구 돌리기 — AI 가 더 찾아보겠다고 하면 읽어서 돌려준다(최대 4번). 마지막 번엔 도구 없이 답만
    const tools = makeTools(asUser(token), me);
    let r = null, tin = 0, tout = 0, model = MODEL_ASK; const used = [];
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      r = await claudeRaw({ model: MODEL_ASK, cacheSystem: `${RULES}\n\n${GUIDE.text}`, system: ctx, messages, tools: round < MAX_TOOL_ROUNDS ? TOOLS : undefined, maxTokens: 1400 });
      tin += r.tin; tout += r.tout; model = r.model;
      const calls = r.content.filter((c) => c.type === 'tool_use');
      if (r.stop !== 'tool_use' || !calls.length) break;
      messages.push({ role: 'assistant', content: r.content });
      const results = await Promise.all(calls.map(async (c) => { used.push(c.name); return { type: 'tool_result', tool_use_id: c.id, content: await tools.exec(c.name, c.input) }; }));
      messages.push({ role: 'user', content: results });
    }
    const text = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
    const j = pickJson(text) || { answer: text };
    const answer = String(j.answer || '').trim().slice(0, 2000) || '답을 만들지 못했어요. 다시 물어봐 주세요';
    const go = (Array.isArray(j.go) ? j.go : []).filter((g) => g && nav.includes(g.to)).slice(0, 2).map((g) => ({ label: String(g.label || '열기').slice(0, 20), to: g.to }));
    const src = (Array.isArray(j.src) ? j.src : []).slice(0, 4).map((x) => String(x).slice(0, 40));
    const next = (Array.isArray(j.next) ? j.next : []).slice(0, 3).map((x) => String(x).slice(0, 50)).filter(Boolean);
    let id = null;
    try { const row = await sb.post('ai_logs', { tenant_id: T, profile_id: uid, feature: 'ask', question: mask(q), answer, screen: String(body.screen || '').slice(0, 40) + (used.length ? ` · 도구 ${[...new Set(used)].join(',')}` : ''), model, tokens_in: tin, tokens_out: tout }); id = row && row[0] && row[0].id; } catch (e) {}
    res.status(200).json({ ok: true, id, answer, go, src, next, left: Math.max(0, PER_PERSON - mine - 1) });
  } catch (e) {
    const code = e && e.code;
    res.status(code === 'nokey' ? 503 : code === 'busy' ? 429 : 500).json({ ok: false, error: code || 'err', message: code === 'nokey' ? 'AI 키가 아직 설정되지 않았어요' : code === 'busy' ? 'AI 가 잠시 바빠요 — 조금 뒤 다시 물어봐 주세요' : '답을 받지 못했어요 — 다시 물어봐 주세요', detail: String((e && e.message) || e).slice(0, 200) });
  }
};
