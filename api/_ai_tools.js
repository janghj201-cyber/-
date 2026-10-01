// AI 도우미가 필요할 때 더 찾아보는 도구(v6.23) — 「지금 기록」(최근 3일)만으로 모자란 질문
// (예: "요즘 가장 잘 운영되는 매장 어디야?", "이번 달 인수인계 확인이 늦는 곳", "직원별 이번 주 업무")에 AI 가 스스로 부른다.
// 모두 로그인한 사람의 토큰으로 읽는다(RLS 그대로 — 그 사람이 앱에서 못 보는 것은 AI 도 못 본다). 읽기만 한다.
// 사람 한 명을 평가하는 표(people_stats · attendance)는 대표 · 매니저만. 직원은 자기 것만.
// 파일 이름이 _ 로 시작해 주소로는 안 열린다.
const { mask, kstDate } = require('./_ai');

const TOOLS = [
  {
    name: 'store_stats',
    description: '매장별 운영 숫자(기간 합계): 청소 체크 · 사진, 인수인계 건수 · 종류(고장/클레임/재고) · 확인률 · 평균 확인 시간 · 지금 미확인, 업무 등록 · 완료율, 출근 기록 · 평균 출근 시각 · 평균 근무 시간, 보관기한 다씀 · 버림. 매장 비교 · 순위 · "잘 운영되는 매장" · "확인 필요한 매장" 질문에 먼저 쓴다(긴급 · 확인 필요 판정은 「앱 판정」 줄을 따른다).',
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: '오늘까지 며칠(1~90). 말이 없으면 14' }, store: { type: 'string', description: '한 매장만 볼 때 매장 이름(일부만 써도 됨)' } } },
  },
  {
    name: 'people_stats',
    description: '직원별 숫자(기간 합계): 업무 등록 · 완료 · 이월, 인수인계 작성 · 확인해 준 수, 출근 일수 · 평균 출근 시각 · 평균 근무 시간, 휴무 일수, 요청 보냄 · 받음. 대표 · 매니저만(직원은 자기 것만).',
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: '1~90, 기본 14' }, person: { type: 'string', description: '한 사람만 볼 때 이름' } } },
  },
  {
    name: 'handover_list',
    description: '인수인계 목록(내용 · 매장 · 쓴 사람 · 받는 사람 · 종류 · 상태 · 확인까지 걸린 시간). 특정 매장 · 종류 · 미확인만 볼 때.',
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: '1~60, 기본 7' }, store: { type: 'string' }, tag: { type: 'string', description: '고장 · 클레임 · 재고' }, open_only: { type: 'boolean', description: '아직 확인 안 됐거나 처리 중인 것만' } } },
  },
  {
    name: 'task_list',
    description: '업무(할 일) 목록 · 상태. 사람 · 매장 · 날짜로 좁힌다.',
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: '오늘까지 며칠(1~31), 기본 1(오늘)' }, ahead: { type: 'integer', description: '앞으로 며칠(0~14), 기본 0' }, person: { type: 'string' }, store: { type: 'string' }, open_only: { type: 'boolean' } } },
  },
  {
    name: 'attendance',
    description: '출근 · 퇴근 기록(날짜 · 사람 · 매장 · 시각). 대표 · 매니저만(직원은 자기 것만).',
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: '1~31, 기본 7' }, store: { type: 'string' }, person: { type: 'string' } } },
  },
  {
    name: 'expiry_list',
    description: '보관기한: due=챙길 것(지남 · 곧), discarded=버린 기록, used=다 쓴 기록.',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['due', 'discarded', 'used'] }, days: { type: 'integer', description: 'discarded · used 는 지난 며칠(1~90, 기본 30), due 는 앞으로 며칠(기본 3)' }, store: { type: 'string' } } },
  },
  {
    name: 'deal_list',
    description: '거래처 진행 건(누구 차례 · 다음 날짜 · 다음 할 일 · 늦어짐).',
    input_schema: { type: 'object', properties: { all: { type: 'boolean', description: '끝난 것까지' } } },
  },
  {
    name: 'booking_list',
    description: '손님 예약 · 거래처 미팅 일정(손님 이름 · 전화는 가림).',
    input_schema: { type: 'object', properties: { back: { type: 'integer', description: '지난 며칠(0~30)' }, ahead: { type: 'integer', description: '앞으로 며칠(0~30), 기본 7' }, store: { type: 'string' } } },
  },
  {
    name: 'project_list',
    description: '프로젝트(진행률 · 마지막 일지 · 답 없음 일수)와 업무 요청(보냄 · 받음 · 상태).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'board_list',
    description: '게시판 글 제목 · 종류 · 날짜.',
    input_schema: { type: 'object', properties: { days: { type: 'integer', description: '1~90, 기본 30' } } },
  },
  {
    name: 'dayoff_list',
    description: '휴무(날짜 · 사람 · 매장).',
    input_schema: { type: 'object', properties: { back: { type: 'integer', description: '지난 며칠(0~60)' }, ahead: { type: 'integer', description: '앞으로 며칠(0~60), 기본 14' } } },
  },
];

const clamp = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const md = (s) => { const x = String(s || '').slice(5, 10).split('-'); return x.length === 2 ? `${+x[0]}/${+x[1]}` : ''; };
const kst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3);
const hm = (iso) => { try { return kst(iso).toISOString().slice(11, 16); } catch (e) { return ''; } };
const mins = (iso) => { const d = kst(iso); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const hhmm = (m) => m == null ? '—' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const norm = (t) => String(t || '').replace(/\s+/g, '').toLowerCase();

function makeTools(get, me) {
  const cache = {};
  const once = (k, f) => cache[k] || (cache[k] = f().catch(() => []));
  // PostgREST 는 한 번에 1000줄 — 넘으면 이어서 읽는다(최대 max 줄)
  async function all(path, max = 20000) {
    const out = [];
    for (let off = 0; off < max; off += 1000) {
      const rows = await get(`${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${off}`);
      out.push(...rows);
      if (rows.length < 1000) break;
    }
    return out;
  }
  const stores = () => once('s', () => get('stores?select=id,name&limit=300'));
  const people = () => once('p', () => get('profiles?select=id,name,role,store_id,status&limit=1000'));
  const admin = me.role === 'owner' || me.role === 'manager';
  const since = (days) => kstDate(-(days - 1));
  async function findStore(name) {
    if (!name) return null;
    const n = norm(name), S = await stores();
    return S.find((s) => norm(s.name) === n) || S.find((s) => norm(s.name).includes(n) || n.includes(norm(s.name))) || S.find((s) => n.includes(norm(s.name).slice(-3))) || { none: true };
  }
  async function findPerson(name) {
    if (!name) return null;
    const n = norm(name), P = await people();
    return P.find((p) => norm(p.name) === n) || P.find((p) => norm(p.name).includes(n) || n.includes(norm(p.name))) || { none: true };
  }
  const maps = async () => { const [S, P] = await Promise.all([stores(), people()]); return { S: new Map(S.map((s) => [s.id, s.name])), P: new Map(P.map((p) => [p.id, p.name])) }; };

  const run = {
    async store_stats(a) {
      const days = clamp(a.days, 1, 90, 14), from = since(days), today = kstDate(0);
      const st = await findStore(a.store); if (st && st.none) return `「${a.store}」 매장을 찾지 못했어요`;
      const f = st ? `&store_id=eq.${st.id}` : '';
      const [S, ho, cl, items, tk, ws, ex] = await Promise.all([
        stores(),
        all(`handovers?select=store_id,tag,confirmed,confirmed_at,closed,working_at,created_at&deleted_at=is.null&handover_date=gte.${from}${f}`),
        all(`cleaning_daily_logs?select=store_id,log_date,photo_path&done=eq.true&log_date=gte.${from}${f}`, 60000),
        get('cleaning_daily_items?select=id&active=eq.true&limit=500').catch(() => []),
        all(`daily_tasks?select=store_id,status&task_date=gte.${from}&task_date=lte.${today}${f}`),
        all(`work_sessions?select=store_id,profile_id,work_date,started_at,ended_at&work_date=gte.${from}${f}`),
        all(`expiry_lots?select=store_id,status,due_on&due_on=gte.${from}&due_on=lte.${today}${f}`).catch(() => []),
      ]);
      const list = st ? [st] : S;
      const nowMs = Date.now();
      const lines = list.map((s) => {
        const H = ho.filter((h) => h.store_id === s.id), C = cl.filter((c) => c.store_id === s.id), K = tk.filter((t) => t.store_id === s.id), W = ws.filter((w) => w.store_id === s.id), X = ex.filter((e) => e.store_id === s.id);
        const conf = H.filter((h) => h.confirmed || h.closed);
        const lag = conf.filter((h) => h.confirmed_at).map((h) => (new Date(h.confirmed_at) - new Date(h.created_at)) / 3600e3).filter((x) => x >= 0 && x < 24 * 30);
        const open1d = H.filter((h) => !h.confirmed && !h.closed && nowMs - new Date(h.created_at) > 86400e3).length;
        const tag = (t) => H.filter((h) => h.tag === t).length;
        const cDays = new Set(C.map((c) => c.log_date)).size;
        const starts = W.filter((w) => w.started_at).map((w) => mins(w.started_at));
        const hours = W.filter((w) => w.started_at && w.ended_at).map((w) => (new Date(w.ended_at) - new Date(w.started_at)) / 3600e3).filter((x) => x > 0 && x < 20);
        const done = K.filter((t) => t.status === 'done').length;
        return `- ${s.name}: 청소 체크 ${C.length}(기록한 날 ${cDays}/${days}일 · 하루 평균 ${cDays ? (C.length / cDays).toFixed(1) : 0}/${items.length || '?'}항목) · 사진 ${C.filter((c) => c.photo_path).length}`
          + ` | 인수인계 ${H.length}건(고장 ${tag('고장')} · 클레임 ${tag('클레임')} · 재고 ${tag('재고')}) 확인률 ${pct(conf.length, H.length)}${lag.length ? ` · 평균 확인 ${avg(lag).toFixed(1)}시간` : ''} · 하루 넘게 미확인 ${open1d}`
          + ` | 업무 ${K.length}건 완료 ${done}(${pct(done, K.length)})`
          + ` | 출근 기록 ${W.length}회 · ${new Set(W.map((w) => w.profile_id)).size}명 · 평균 출근 ${hhmm(avg(starts))}${hours.length ? ` · 평균 근무 ${avg(hours).toFixed(1)}시간` : ''}`
          + (X.length ? ` | 보관기한 다씀 ${X.filter((e) => e.status === 'used').length} · 버림 ${X.filter((e) => e.status === 'discarded').length} · 기한 지나 방치 ${X.filter((e) => e.status === 'active' && e.due_on < today).length}` : '');
      });
      return `최근 ${days}일(${md(from)}~${md(today)}) 매장별 숫자\n${lines.join('\n') || '- 기록 없음'}\n(청소 항목 수 ${items.length || '?'}개 · 휴무일도 날짜 수에 들어감)`;
    },
    async people_stats(a) {
      const days = clamp(a.days, 1, 90, 14), from = since(days), today = kstDate(0);
      let who = await findPerson(a.person); if (who && who.none) return `「${a.person}」 사람을 찾지 못했어요`;
      if (!admin) who = (await people()).find((p) => p.id === me.id) || { id: me.id, name: me.name };
      const P = (await people()).filter((p) => p.status !== 'left' && p.status !== 'inactive');
      const list = who ? [who] : P;
      const [{ S }, tk, hoW, hoC, ws, off, rq] = await Promise.all([
        maps(),
        all(`daily_tasks?select=employee_id,status&task_date=gte.${from}&task_date=lte.${today}`),
        all(`handovers?select=from_employee&deleted_at=is.null&handover_date=gte.${from}`),
        all(`handovers?select=confirmed_by&deleted_at=is.null&confirmed=eq.true&handover_date=gte.${from}`).catch(() => []),
        all(`work_sessions?select=profile_id,started_at,ended_at&work_date=gte.${from}`),
        all(`dayoffs?select=profile_id&dayoff_date=gte.${from}&dayoff_date=lte.${today}`).catch(() => []),
        all(`work_requests?select=requester_id,recipient_id,status&created_at=gte.${from}T00:00:00%2B09:00`).catch(() => []),
      ]);
      const lines = list.map((p) => {
        const K = tk.filter((t) => t.employee_id === p.id), W = ws.filter((w) => w.profile_id === p.id);
        const starts = W.filter((w) => w.started_at).map((w) => mins(w.started_at));
        const hours = W.filter((w) => w.started_at && w.ended_at).map((w) => (new Date(w.ended_at) - new Date(w.started_at)) / 3600e3).filter((x) => x > 0 && x < 20);
        const done = K.filter((t) => t.status === 'done').length;
        return `- ${p.name}${p.store_id ? `(${S.get(p.store_id) || ''})` : ''}: 업무 ${K.length} 완료 ${done}(${pct(done, K.length)}) 이월 ${K.filter((t) => t.status === 'carried_over').length} | 인수인계 작성 ${hoW.filter((h) => h.from_employee === p.id).length} · 확인해 줌 ${hoC.filter((h) => h.confirmed_by === p.id).length} | 출근 ${W.length}회 · 평균 ${hhmm(avg(starts))}${hours.length ? ` · 평균 근무 ${avg(hours).toFixed(1)}시간` : ''} | 휴무 ${off.filter((o) => o.profile_id === p.id).length}일 | 요청 보냄 ${rq.filter((r) => r.requester_id === p.id).length} · 받음 ${rq.filter((r) => r.recipient_id === p.id).length}`;
      });
      return `최근 ${days}일(${md(from)}~${md(today)}) 직원별 숫자${admin ? '' : '(내 것만)'}\n${lines.join('\n') || '- 없음'}`;
    },
    async handover_list(a) {
      const days = clamp(a.days, 1, 60, 7), from = since(days);
      const st = await findStore(a.store); if (st && st.none) return `「${a.store}」 매장을 찾지 못했어요`;
      const { S, P } = await maps();
      let q = `handovers?select=store_id,content,tag,confirmed,confirmed_at,closed,working_at,handover_date,created_at,from_employee,recipient_id&deleted_at=is.null&handover_date=gte.${from}&order=created_at.desc`;
      if (st) q += `&store_id=eq.${st.id}`;
      if (a.tag) q += `&tag=eq.${encodeURIComponent(a.tag)}`;
      if (a.open_only) q += '&confirmed=eq.false&closed=eq.false';
      const rows = await all(q, 3000);
      const shown = rows.slice(0, 40);
      return `인수인계 ${rows.length}건(최근 ${days}일${st ? ` · ${st.name}` : ''}${a.tag ? ` · ${a.tag}` : ''}${a.open_only ? ' · 미확인' : ''})${rows.length > 40 ? ' — 최신 40건만' : ''}\n` + (shown.map((h) => {
        const lag = h.confirmed_at ? ` · ${Math.max(0, (new Date(h.confirmed_at) - new Date(h.created_at)) / 3600e3).toFixed(1)}시간 뒤 확인` : '';
        return `- ${md(h.handover_date)} ${S.get(h.store_id) || ''}${h.tag ? ` [${h.tag}]` : ''} ${mask(h.content).slice(0, 110)} — ${P.get(h.from_employee) || '?'}${h.recipient_id ? ` → ${P.get(h.recipient_id) || ''}` : ''} · ${h.closed ? '끝남' : h.working_at ? '처리 중' : h.confirmed ? '확인됨' : '미확인'}${lag}`;
      }).join('\n') || '- 없음');
    },
    async task_list(a) {
      const days = clamp(a.days, 1, 31, 1), ahead = clamp(a.ahead, 0, 14, 0);
      const from = since(days), to = kstDate(ahead);
      let who = await findPerson(a.person); if (who && who.none) return `「${a.person}」 사람을 찾지 못했어요`;
      const st = await findStore(a.store); if (st && st.none) return `「${a.store}」 매장을 찾지 못했어요`;
      const { S, P } = await maps();
      let q = `daily_tasks?select=employee_id,store_id,task_date,content,status&task_date=gte.${from}&task_date=lte.${to}&order=task_date.desc`;
      if (who) q += `&employee_id=eq.${who.id}`;
      if (st) q += `&store_id=eq.${st.id}`;
      if (a.open_only) q += '&status=neq.done';
      const rows = await all(q, 3000);
      const sm = { done: '완료', carried_over: '이월', pending: '남음' };
      return `업무 ${rows.length}건(${md(from)}~${md(to)}${who ? ` · ${who.name}` : ''}${st ? ` · ${st.name}` : ''}) 완료 ${rows.filter((t) => t.status === 'done').length}${rows.length > 60 ? ' — 60건만' : ''}\n` + (rows.slice(0, 60).map((t) => `- ${md(t.task_date)} ${P.get(t.employee_id) || ''}${t.store_id ? `(${S.get(t.store_id) || ''})` : ''} ${mask(t.content).slice(0, 70)} · ${sm[t.status] || t.status}`).join('\n') || '- 없음');
    },
    async attendance(a) {
      const days = clamp(a.days, 1, 31, 7), from = since(days);
      let who = await findPerson(a.person); if (who && who.none) return `「${a.person}」 사람을 찾지 못했어요`;
      if (!admin) who = { id: me.id, name: me.name };
      const st = await findStore(a.store); if (st && st.none) return `「${a.store}」 매장을 찾지 못했어요`;
      const { S, P } = await maps();
      let q = `work_sessions?select=profile_id,store_id,work_date,started_at,ended_at&work_date=gte.${from}&order=started_at.desc`;
      if (who) q += `&profile_id=eq.${who.id}`;
      if (st) q += `&store_id=eq.${st.id}`;
      const rows = await all(q, 3000);
      return `출근 기록 ${rows.length}건(최근 ${days}일${who ? ` · ${who.name}` : ''}${st ? ` · ${st.name}` : ''})${rows.length > 60 ? ' — 최신 60건만' : ''}\n` + (rows.slice(0, 60).map((w) => `- ${md(w.work_date)} ${P.get(w.profile_id) || ''} ${S.get(w.store_id) || ''} ${hm(w.started_at)}${w.ended_at ? `~${hm(w.ended_at)}` : ' (마감 전)'}`).join('\n') || '- 없음');
    },
    async expiry_list(a) {
      const kind = ['due', 'discarded', 'used'].includes(a.kind) ? a.kind : 'due';
      const st = await findStore(a.store); if (st && st.none) return `「${a.store}」 매장을 찾지 못했어요`;
      const { S } = await maps();
      let q;
      if (kind === 'due') { const days = clamp(a.days, 0, 30, 3); q = `expiry_lots?select=store_id,item_id,qty,due_on,status&status=eq.active&due_on=lte.${kstDate(days)}&order=due_on`; }
      else { const days = clamp(a.days, 1, 90, 30); q = `expiry_lots?select=store_id,item_id,qty,due_on,status,closed_at&status=eq.${kind}&due_on=gte.${since(days)}&order=due_on.desc`; }
      if (st) q += `&store_id=eq.${st.id}`;
      const rows = await all(q, 3000);
      const ids = [...new Set(rows.map((r) => r.item_id).filter(Boolean))];
      const items = ids.length ? new Map((await get(`expiry_items?select=id,name,unit&id=in.(${ids.slice(0, 300).join(',')})`).catch(() => [])).map((i) => [i.id, i])) : new Map();
      const today = kstDate(0);
      const label = { due: '챙길 것', discarded: '버린 기록', used: '다 쓴 기록' }[kind];
      return `보관기한 ${label} ${rows.length}건${rows.length > 50 ? ' — 50건만' : ''}\n` + (rows.slice(0, 50).map((l) => { const it = items.get(l.item_id) || {}; return `- ${md(l.due_on)}까지 ${it.name || '품목'} ${l.qty || ''}${it.unit || ''} · ${S.get(l.store_id) || ''}${kind === 'due' && l.due_on < today ? ' · 지남' : ''}`; }).join('\n') || '- 없음');
    },
    async deal_list(a) {
      const [rows, clients, { P }] = await Promise.all([
        all(`deals?select=title,ball,next_date,next_text,client_id,owner_id,wait_days,updated_at${a.all ? '' : '&ball=neq.done'}&order=next_date.asc`, 2000).catch(() => get(`deals?select=title,ball,next_date,next_text,client_id${a.all ? '' : '&ball=neq.done'}&order=next_date.asc&limit=200`)),
        get('clients?select=id,name&limit=1000').catch(() => []),
        maps(),
      ]);
      const cN = new Map(clients.map((c) => [c.id, c.name])), today = kstDate(0);
      return `거래처 건 ${rows.length}건\n` + (rows.slice(0, 50).map((d) => `- ${cN.get(d.client_id) || ''} ${mask(d.title).slice(0, 50)} · ${d.ball === 'us' ? '우리 차례' : d.ball === 'done' ? '끝남' : '상대 차례'}${d.next_date ? ` · 다음 ${md(d.next_date)}${d.next_date < today && d.ball !== 'done' ? '(늦어짐)' : ''}` : ''}${d.next_text ? ` ${mask(d.next_text).slice(0, 30)}` : ''}${d.owner_id ? ` · 담당 ${P.get(d.owner_id) || ''}` : ''}`).join('\n') || '- 없음');
    },
    async booking_list(a) {
      const back = clamp(a.back, 0, 30, 0), ahead = clamp(a.ahead, 0, 30, 7);
      const st = await findStore(a.store); if (st && st.none) return `「${a.store}」 매장을 찾지 못했어요`;
      const { S, P } = await maps();
      const from = new Date(`${kstDate(-back)}T00:00:00+09:00`).toISOString(), to = new Date(`${kstDate(ahead + 1)}T00:00:00+09:00`).toISOString();
      let q = `appointments?select=store_id,kind,starts_at,title,status,staff_id&starts_at=gte.${encodeURIComponent(from)}&starts_at=lt.${encodeURIComponent(to)}&order=starts_at`;
      if (st) q += `&store_id=eq.${st.id}`;
      const rows = await all(q, 3000).catch(() => []);
      return `예약 · 미팅 ${rows.length}건(${md(kstDate(-back))}~${md(kstDate(ahead))})${rows.length > 60 ? ' — 60건만' : ''}\n` + (rows.slice(0, 60).map((x) => `- ${md(kst(x.starts_at).toISOString())} ${hm(x.starts_at)} ${x.kind === 'booking' ? '손님 예약' : '미팅'} ${mask(x.title || '').slice(0, 30)} · ${S.get(x.store_id) || ''}${x.staff_id ? ` · 담당 ${P.get(x.staff_id) || ''}` : ''}${x.status && x.status !== 'booked' ? ` · ${x.status}` : ''}`).join('\n') || '- 없음');
    },
    async project_list() {
      const [pj, logs, rq, { P }] = await Promise.all([
        get('projects?select=id,title,status,progress,created_at,due_date,done_date,employee_id,proposed_to,accepted_at&status=neq.done&order=created_at.desc&limit=80').catch(() => []),
        get(`project_logs?select=project_id,created_at&created_at=gte.${encodeURIComponent(new Date(Date.now() - 60 * 86400e3).toISOString())}&order=created_at.desc&limit=1000`).catch(() => []),
        get(`work_requests?select=requester_id,recipient_id,content,status,created_at&created_at=gte.${encodeURIComponent(new Date(Date.now() - 30 * 86400e3).toISOString())}&order=created_at.desc&limit=80`).catch(() => []),
        maps(),
      ]);
      const last = new Map(); logs.forEach((l) => { if (!last.has(l.project_id)) last.set(l.project_id, l.created_at); });
      const quiet = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400e3);
      const rs = { pending: '대기', accepted: '수락', declined: '거절', done: '완료' };
      return `진행 중인 프로젝트 ${pj.length}\n` + (pj.map((p) => { const lt = last.get(p.id) || p.accepted_at || p.created_at; return `- ${mask(p.title).slice(0, 40)} · ${P.get(p.employee_id) || ''}${p.proposed_to && !p.accepted_at ? ` → ${P.get(p.proposed_to) || ''} (제안 중)` : ''} · ${p.progress || 0}% · 마지막 움직임 ${quiet(lt)}일 전${p.due_date ? ` · 마감 ${md(p.due_date)}` : ''}`; }).join('\n') || '- 없음')
        + `\n\n업무 요청(최근 30일) ${rq.length}\n` + (rq.slice(0, 40).map((r) => `- ${md(kst(r.created_at).toISOString())} ${P.get(r.requester_id) || ''} → ${P.get(r.recipient_id) || ''} ${mask(r.content || '').slice(0, 50)} · ${rs[r.status] || r.status}`).join('\n') || '- 없음');
    },
    async board_list(a) {
      const days = clamp(a.days, 1, 90, 30);
      const rows = await get(`board_posts?select=category,title,created_at,pinned&created_at=gte.${encodeURIComponent(new Date(Date.now() - days * 86400e3).toISOString())}&order=created_at.desc&limit=60`).catch(() => []);
      const cat = { notice: '공지', share: '업무공유', history: '히스토리', suggest: '건의/문의' };
      return `게시판 글 ${rows.length}(최근 ${days}일)\n` + (rows.map((b) => `- ${md(kst(b.created_at).toISOString())} [${cat[b.category] || b.category || ''}] ${mask(b.title || '').slice(0, 60)}${b.pinned ? ' · 고정' : ''}`).join('\n') || '- 없음');
    },
    async dayoff_list(a) {
      const back = clamp(a.back, 0, 60, 0), ahead = clamp(a.ahead, 0, 60, 14);
      const { S } = await maps();
      const P = await people(); const pm = new Map(P.map((p) => [p.id, p]));
      const rows = await all(`dayoffs?select=profile_id,dayoff_date,status&dayoff_date=gte.${kstDate(-back)}&dayoff_date=lte.${kstDate(ahead)}&order=dayoff_date`, 5000).catch(() => []);
      const by = {}; rows.forEach((r) => { (by[r.dayoff_date] = by[r.dayoff_date] || []).push(r); });
      return `휴무 ${rows.length}건(${md(kstDate(-back))}~${md(kstDate(ahead))})\n` + (Object.keys(by).sort().map((d) => `- ${md(d)} ${by[d].length}명: ${by[d].map((r) => { const p = pm.get(r.profile_id) || {}; return `${p.name || '?'}${p.store_id ? `(${S.get(p.store_id) || ''})` : ''}${r.status && !['dayoff', 'approved'].includes(r.status) ? ` ${r.status}` : ''}`; }).join(' · ')}`).join('\n') || '- 없음');
    },
  };

  async function exec(name, input) {
    const f = run[name];
    if (!f) return '없는 도구';
    try { const t = await f(input || {}); return String(t).slice(0, 9000); }
    catch (e) { return `읽지 못했어요(${String((e && e.message) || e).slice(0, 120)})`; }
  }
  return { exec };
}

module.exports = { TOOLS, makeTools };
