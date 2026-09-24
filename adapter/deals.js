// 거래처 · 진행 건 (v6.11) — 바깥 거래처와 주고받는 건을 "지금 누구 차례인가"로 본다.
// 승인된 시안(deals-sample)을 앱 안으로. 표: clients · deals(ball = us 우리 · them 상대 · done 끝) · deal_logs · appointments(미팅).
// 「진행 중인 건」(projects)은 직원 업무라서 섞지 않는다. 며칠째는 영업일(주말 · 공휴일 뺌)로 센다 — 연휴에 "답 없음"이 뜨지 않게.
// 기록 버튼 한 번이 차례를 바꾼다: 메일 받음 → 우리 차례 · 메일 보냄 → 상대 차례 + 회신 확인일. 미팅은 캘린더에 들어간다.
import { supabase as sb } from './supabase-client.js'
import { getContext } from './context.js'

const CSS = `#vdeal{--ink:var(--text);--sub:var(--text-sub);--mute:var(--text-mute);--line:var(--border);--hover:var(--soft);
  --deep:var(--navy);--tint:var(--green-light);--on-main:#fff;
  --us:#1E63C4;--us-bg:#E2EFFE;--them:#6A3FCB;--them-bg:#ECE5FE;--late:#B42A1F;--late-bg:#FBE7E4;--warn:#8E5A06;--warn-bg:#FEEFCF;
  position:fixed;inset:0;z-index:900;background:var(--bg);color:var(--ink);overflow-y:auto;overscroll-behavior:contain;font-size:14px;line-height:1.55;}
html[data-bright=dark] #vdeal{--us:#7FB0F2;--us-bg:#1A2B42;--them:#B49CF4;--them-bg:#261F3E;--late:#F08A80;--late-bg:#3A1D1A;--warn:#EDB25A;--warn-bg:#35280F;}
#vdeal *{box-sizing:border-box}
#vdeal button,#vdeal select,#vdeal input,#vdeal textarea{font:inherit;color:inherit}
#vdeal button{cursor:pointer}
#vdeal :focus-visible{outline:2px solid var(--green);outline-offset:2px}
#vdeal .wrap{max-width:1320px;margin:0 auto;padding:14px 16px calc(48px + var(--safe-bot,0px))}
#vdeal .st-err{background:var(--late-bg);color:var(--late);border-radius:10px;padding:8px 12px;font-size:13px;font-weight:600;margin-bottom:10px}
#vdeal .loading{font-size:13px;color:var(--mute);padding:40px 0;text-align:center}
#vdeal .sacts button{display:grid;place-items:center;padding:0 10px}
#vdeal .cedit{display:grid;gap:6px;margin:4px 0 10px}
#vdeal .cedit .row2 input,#vdeal .cedit .row2 select{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:6px 8px;font-size:13px;width:100%;min-width:0}
#vdeal .first{border:1.5px dashed var(--line);border-radius:14px;padding:16px;display:grid;gap:6px;font-size:13.5px;color:var(--sub)}
#vdeal .first b{color:var(--ink);font-size:15px}
#vdeal .app{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
@media(min-width:1060px){
#vdeal .app{grid-template-columns:minmax(0,1fr) 340px}
}
#vdeal .main{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;min-width:0}
#vdeal .top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
#vdeal .top h1{font-size:22px;margin:0;letter-spacing:-.02em}
#vdeal .top .sum{font-size:13px;color:var(--sub);margin-top:2px}
#vdeal .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#vdeal .srch{height:38px;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:0 12px;font-size:14px;min-width:0;width:200px}
#vdeal .add{height:38px;border:0;background:var(--deep);color:var(--on-main);border-radius:10px;padding:0 16px;font-weight:700;display:inline-flex;gap:6px;align-items:center}
#vdeal .add svg{width:15px;height:15px}
#vdeal .seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:14px 0 12px}
#vdeal .seg button{border:0;background:var(--card);padding:0 14px;height:34px;font-weight:600;font-size:13px;color:var(--sub)}
#vdeal .seg button[aria-pressed=true]{background:var(--deep);color:var(--on-main)}
#vdeal .flt{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
#vdeal .flt button{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:5px 12px;font-size:13px;font-weight:600;color:var(--sub)}
#vdeal .flt button b{font-variant-numeric:tabular-nums;color:var(--ink)}
#vdeal .flt button[aria-pressed=true]{border-color:var(--ink);color:var(--ink)}
#vdeal .grp{margin-top:14px}
#vdeal .grp h3{font-size:13px;margin:0 0 6px;color:var(--sub);display:flex;gap:8px;align-items:baseline}
#vdeal .grp h3 b{color:var(--ink)}
#vdeal .deal{width:100%;text-align:left;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;padding:11px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);margin-bottom:6px}
#vdeal .deal:hover{background:var(--hover)}
#vdeal .deal .c{font-size:12.5px;color:var(--sub);font-weight:600}
#vdeal .deal b{font-size:14.5px}
#vdeal .deal .mt{grid-column:1;font-size:12.5px;color:var(--sub)}
#vdeal .deal .rt{grid-row:1 / span 3;grid-column:2;display:grid;justify-items:end;gap:4px;align-content:center}
#vdeal .deal .amt{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
#vdeal .ball{font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;white-space:nowrap}
#vdeal .b-us{background:var(--us-bg);color:var(--us)}
#vdeal .b-them{background:var(--them-bg);color:var(--them)}
#vdeal .b-late{background:var(--late-bg);color:var(--late)}
#vdeal .b-done{background:var(--soft);color:var(--sub)}
#vdeal .age{font-size:12px;color:var(--sub);font-variant-numeric:tabular-nums;white-space:nowrap}
#vdeal .age.late{color:var(--late);font-weight:700}
#vdeal .nx{grid-column:1;font-size:12.5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#vdeal .nx .d{font-weight:700;font-variant-numeric:tabular-nums}
#vdeal .nx .d.over{color:var(--late)}
#vdeal .empty{font-size:13px;color:var(--mute);padding:16px 0}
#vdeal .cl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:11px 14px;border:1px solid var(--line);border-radius:12px;margin-bottom:6px;width:100%;text-align:left;background:var(--card)}
#vdeal .cl b{font-size:14.5px}
#vdeal .cl small{grid-column:1;color:var(--sub);font-size:12.5px}
#vdeal .cl .r{grid-row:1 / span 2;grid-column:2;text-align:right;font-size:12.5px;color:var(--sub)}
#vdeal .tg2{font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;background:var(--soft);color:var(--sub);margin-left:4px}
#vdeal .stale{color:var(--warn);font-weight:700}
#vdeal .side{display:grid;gap:12px;align-content:start}
#vdeal .panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
#vdeal .panel h2{font-size:15px;margin:0 0 8px;display:flex;justify-content:space-between;gap:8px;align-items:baseline}
#vdeal .panel h2 small{font-size:12px;color:var(--mute);font-weight:500}
#vdeal .tl2{list-style:none;margin:0;padding:0;display:grid;gap:8px}
#vdeal .tl2 li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1px 10px;font-size:13px}
#vdeal .tl2 .w{font-weight:700;color:var(--green);white-space:nowrap;font-variant-numeric:tabular-nums}
#vdeal .tl2 .w.l{color:var(--late)}
#vdeal .tl2 small{grid-column:2;color:var(--mute);font-size:12px}
#vdeal .tl2 button{grid-column:2;justify-self:start;border:1px solid var(--line);background:var(--card);border-radius:8px;padding:3px 9px;font-size:12px;font-weight:700;margin-top:2px}
#vdeal .money{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;margin:2px 0 4px}
#vdeal .hint{font-size:12px;color:var(--mute)}
#vdeal .scrim{position:fixed;inset:0;background:rgba(8,16,12,.45);display:grid;place-items:end center;z-index:20}
@media(min-width:900px){
#vdeal .scrim.drawer{place-items:stretch end}
#vdeal .scrim.drawer .sheet{border-radius:18px 0 0 18px;max-height:100vh;height:100%;max-width:560px}
}
@media(min-width:700px){
#vdeal .scrim:not(.drawer){place-items:center;padding:16px}
}
#vdeal .sheet{background:var(--card);width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px))}
@media(min-width:700px){
#vdeal .scrim:not(.drawer) .sheet{border-radius:18px}
}
#vdeal .sheet h2{margin:0;font-size:19px;letter-spacing:-.01em}
#vdeal .sheet .c{font-size:13px;color:var(--sub);font-weight:600}
#vdeal .shead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
#vdeal .x{border:0;background:var(--soft);border-radius:9px;width:34px;height:34px;font-size:18px;flex:none}
#vdeal .state{border-radius:12px;padding:12px 14px;display:grid;gap:8px;margin-bottom:12px}
#vdeal .state.us{background:var(--us-bg)}
#vdeal .state.them{background:var(--them-bg)}
#vdeal .state.late{background:var(--late-bg)}
#vdeal .state.done{background:var(--soft)}
#vdeal .state b{font-size:15px}
#vdeal .state .sw{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--card);justify-self:start}
#vdeal .state .sw button{border:0;background:transparent;padding:5px 12px;font-size:12.5px;font-weight:700;color:var(--sub)}
#vdeal .state .sw button[aria-pressed=true]{background:var(--ink);color:var(--card)}
#vdeal .logs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-bottom:10px}
#vdeal .logs button{border:1.5px solid var(--line);background:var(--card);border-radius:10px;padding:9px 4px;display:grid;justify-items:center;gap:4px;font-size:12.5px;font-weight:700}
#vdeal .logs svg{width:18px;height:18px;color:var(--sub)}
#vdeal .lf{display:grid;gap:6px;background:var(--soft);border-radius:12px;padding:10px;margin-bottom:10px}
#vdeal .lf input,#vdeal .lf textarea,#vdeal .fld input,#vdeal .fld select,#vdeal .fld textarea{border:1.5px solid var(--line);background:var(--card);border-radius:10px;padding:9px 11px;font-size:14.5px;width:100%;min-width:0;color:var(--ink)}
#vdeal .lf textarea{min-height:64px;resize:vertical;font-size:13px}
#vdeal .lf .row button{border:0;background:var(--deep);color:var(--on-main);border-radius:9px;padding:8px 14px;font-weight:700}
#vdeal .lf .row .q{background:transparent;color:var(--sub)}
#vdeal .sec{font-size:12.5px;font-weight:700;color:var(--sub);margin:14px 0 6px}
#vdeal .chips{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
#vdeal .chips button{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:4px 10px;font-size:12.5px;font-weight:600;color:var(--sub);font-variant-numeric:tabular-nums}
#vdeal .chips button[aria-pressed=true]{border-color:var(--green);background:var(--tint);color:var(--ink)}
#vdeal .chips input[type=date],#vdeal .chips input[type=time]{border:1px solid var(--line);border-radius:8px;padding:3px 6px;font-size:12.5px;background:var(--card)}
#vdeal .nxin{border:1.5px solid var(--line);background:var(--card);border-radius:10px;padding:8px 10px;font-size:14px;width:100%;margin-top:6px}
#vdeal .tlx{list-style:none;margin:0;padding:0;border-left:2px solid var(--line);margin-left:8px}
#vdeal .tlx li{position:relative;padding:0 0 12px 16px;font-size:13.5px}
#vdeal .tlx li::before{content:"";position:absolute;left:-6px;top:5px;width:10px;height:10px;border-radius:50%;background:var(--card);box-shadow:inset 0 0 0 2px var(--mute)}
#vdeal .tlx li.in::before{box-shadow:inset 0 0 0 2px var(--us)}
#vdeal .tlx li.out::before{box-shadow:inset 0 0 0 2px var(--them)}
#vdeal .tlx li.meet::before{background:var(--green);box-shadow:none}
#vdeal .tlx .h{font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums}
#vdeal .tlx .h b{color:var(--sub)}
#vdeal .ends{display:flex;gap:6px;margin-top:14px;flex-wrap:wrap}
#vdeal .ends button{flex:1;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:9px;font-weight:700;font-size:13px}
#vdeal .fld{display:grid;gap:5px;margin-top:12px;font-size:12.5px;font-weight:600;color:var(--sub)}
#vdeal .row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#vdeal .wn{font-size:12.5px;font-weight:600;color:var(--warn);background:var(--warn-bg);border-radius:8px;padding:5px 9px;margin-top:6px}
#vdeal .sacts{display:flex;gap:8px;margin-top:16px}
#vdeal .sacts button{flex:1;height:46px;border-radius:12px;font-weight:700;border:1px solid var(--line);background:var(--card)}
#vdeal .sacts .main{background:var(--deep);border-color:var(--deep);color:var(--on-main);flex:2}
#vdeal .toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--bg);font-size:13px;font-weight:600;padding:9px 14px;border-radius:10px;z-index:30;max-width:calc(100% - 32px)}
@media(max-width:640px){
#vdeal .main{padding:14px 12px}
#vdeal .srch{width:100%;order:3}
#vdeal .deal{grid-template-columns:minmax(0,1fr)}
#vdeal .deal .rt{grid-row:auto;grid-column:1;justify-items:start;display:flex;gap:8px;flex-wrap:wrap}
#vdeal .logs{grid-template-columns:repeat(3,minmax(0,1fr))}
}`

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const pad = (n) => String(n).padStart(2, '0')
const dk = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addD = (k, n) => { const d = new Date(k + 'T00:00'); d.setDate(d.getDate() + n); return dk(d) }
const md = (k) => { const d = new Date(k + 'T00:00'); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})` }
const won = (n) => !n ? '' : n >= 1e8 ? `${Math.round(n / 1e7) / 10}억` : n >= 1e4 ? `${Math.round(n / 1e4).toLocaleString()}만` : `${n.toLocaleString()}원`
const digits = (v) => String(v || '').replace(/\D/g, '')
const IC = {
  mail_in: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  mail_out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>',
  call: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  meeting: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
}
// 기록 종류 — 이름 · 타임라인 점 모양 · 차례를 어떻게 바꾸나
const LOG = { mail_in: ['메일 받음', 'in', 'us'], mail_out: ['메일 보냄', 'out', 'them'], call: ['전화', '', 'keep'], meeting: ['미팅', 'meet', 'keep'], note: ['메모', '', 'keep'], state: ['상태', '', 'keep'] }
const RES = { won: '성사', hold: '보류', lost: '무산' }
// 업종마다 거래처를 부르는 말
const KINDS = { cafe: ['공급처', '단체 고객'], convenience: ['본사 · 공급처', '협력업체'], beauty: ['공급처', '협력업체'], academy: ['학부모', '협력업체'] }

export async function openDeals(host = {}) {
  if (document.getElementById('vdeal')) return
  const ctx = await getContext()
  const T = ctx.tenantId, ME = ctx.profileId
  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)
  const TK = dk(TODAY)
  let tab = 'deals', filt = 'all', q = ''
  let clients = [], deals = [], logs = [], meets = [], last = {}, profiles = [], HOL = new Set(), industry = ''
  const kinds = () => KINDS[industry] || ['매출처', '매입처']

  const root = document.createElement('div'); root.id = 'vdeal'
  root.innerHTML = `<style>${CSS}</style>
  <div class="header" style="position:sticky;top:0;z-index:10;"><div><div class="header-title">거래처</div><div class="header-sub">진행 건 · 누구 차례 · 다음 할 일</div></div><button class="back-btn" type="button" data-close>닫기</button></div>
  <div class="wrap"><div data-err></div>
   <div class="app">
    <section class="main">
      <div class="top">
        <div><h1>거래처 · 진행 건</h1><div class="sum" data-sum></div></div>
        <div class="row"><input class="srch" data-q placeholder="거래처 · 건 찾기" aria-label="찾기">
          <button class="add" data-new><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>진행 건</button></div>
      </div>
      <div class="seg" data-tab><button data-t="deals">진행 건</button><button data-t="clients">거래처</button><button data-t="done">끝난 것</button></div>
      <div data-body><div class="loading">불러오는 중…</div></div>
    </section>
    <aside class="side">
      <section class="panel" data-today></section>
      <section class="panel" data-money></section>
    </aside>
   </div>
  </div>`
  const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)]
  document.body.appendChild(root)
  const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
  const toast = (t) => { const o = root.querySelector('.toast'); if (o) o.remove(); const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; root.appendChild(d); setTimeout(() => d.remove(), 2600) }
  const fail = (what, e) => { console.warn('[deal]', what, e); toast(`${what} — 저장하지 못했어요. 인터넷을 확인하고 다시 해 주세요`) }
  const onKey = (e) => { if (e.key !== 'Escape') return; const sc = root.querySelector('.scrim'); if (sc) { sc.remove(); render(); return } close() }
  const close = () => { document.removeEventListener('keydown', onKey); root.remove(); document.body.style.overflow = prevOverflow; try { host.onClose && host.onClose() } catch (e) {} }
  document.addEventListener('keydown', onKey)
  $('[data-close]').onclick = close

  // ── 영업일 ──
  const biz = (d) => d.getDay() !== 0 && d.getDay() !== 6 && !HOL.has(dk(d))
  const bizDays = (from) => { let n = 0; const d = new Date(from + 'T00:00'); while (dk(d) < TK) { d.setDate(d.getDate() + 1); if (biz(d)) n++ } return n }
  const addBiz = (k, n) => { const d = new Date(k + 'T00:00'); while (n > 0) { d.setDate(d.getDate() + 1); if (biz(d)) n-- } return dk(d) }

  // ── 불러오기 ──
  async function load() {
    const q2 = await Promise.all([
      sb.from('clients').select('*').eq('tenant_id', T).eq('active', true).order('name').limit(3000),
      sb.from('deals').select('*').eq('tenant_id', T).order('created_at', { ascending: false }).limit(3000),
      sb.from('deal_logs').select('*').eq('tenant_id', T).gte('log_date', addD(TK, -365)).order('log_date').limit(10000),
      sb.from('appointments').select('id,deal_id,client_id,title,starts_at,status,staff_id').eq('tenant_id', T).eq('kind', 'meeting').gte('starts_at', new Date(addD(TK, -1) + 'T00:00').toISOString()).limit(2000),
      sb.from('client_last_contact').select('client_id,last_on').limit(3000),
      sb.from('profiles').select('id,name,status').eq('tenant_id', T).order('name').limit(1000),
      sb.from('public_holidays').select('date').gte('date', addD(TK, -120)).lte('date', addD(TK, 120)),
      sb.from('tenants').select('industry').eq('id', T).maybeSingle(),
    ])
    const bad = q2.slice(0, 4).find((r) => r.error); if (bad) throw bad.error
    clients = q2[0].data || []; deals = q2[1].data || []; logs = q2[2].data || []; meets = (q2[3].data || []).filter((m) => m.status !== 'cancelled')
    last = {}; (q2[4].data || []).forEach((r) => { last[r.client_id] = r.last_on })
    profiles = (q2[5].data || []).filter((p) => p.status !== 'inactive' && p.status !== 'left')
    HOL = new Set((q2[6].data || []).map((h) => h.date)); industry = (q2[7].data || {}).industry || ''
  }
  const cli = (id) => clients.find((c) => c.id === id) || { name: '거래처', id }
  const pname = (id) => (profiles.find((p) => p.id === id) || {}).name || ''
  const dlogs = (d) => logs.filter((l) => l.deal_id === d.id)
  const lastLog = (d) => { const L = dlogs(d).filter((l) => l.log_date <= TK); return L[L.length - 1] || { log_date: dk(new Date(d.created_at)), kind: 'note', body: '시작' } }
  function info(d) {
    if (d.ball === 'done') return { cls: 'done', txt: RES[d.result] || '끝', age: 0, late: false }
    const age = bizDays(lastLog(d).log_date)
    if (d.ball === 'them') { const lim = d.wait_days || 3, late = age >= lim; return { cls: late ? 'late' : 'them', txt: late ? `답 없음 ${age}일` : '상대 차례', age, late, lim } }
    const late = (d.next_date && d.next_date < TK) || age >= 2
    return { cls: late ? 'late' : 'us', txt: late ? '우리 차례 · 늦음' : '우리 차례', age, late }
  }
  const open = () => deals.filter((d) => d.ball !== 'done')
  const match = (d) => !q || d.title.includes(q) || cli(d.client_id).name.includes(q)

  // ── 그리기 ──
  function render() {
    const O = open(), us = O.filter((d) => d.ball === 'us'), th = O.filter((d) => d.ball === 'them'), late = O.filter((d) => info(d).late)
    $('[data-sum]').textContent = `진행 중 ${O.length}건 · 우리 차례 ${us.length} · 답 기다림 ${th.length}${late.length ? ` · 늦어짐 ${late.length}` : ''}`
    $$('[data-tab] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === tab))
    const B = $('[data-body]')
    if (tab === 'deals') {
      let h = `<div class="flt">${[['all', '전체', O.length], ['us', '우리 차례', us.length], ['them', '답 기다림', th.length], ['late', '늦어짐', late.length], ['mine', '내 담당', O.filter((d) => d.owner_id === ME).length]].map(([k, n, x]) => `<button data-f="${k}" aria-pressed="${filt === k}">${n} <b>${x}</b></button>`).join('')}</div>`
      const L = O.filter(match).filter((d) => filt === 'all' || (filt === 'late' ? info(d).late : filt === 'mine' ? d.owner_id === ME : d.ball === filt))
      ;[['us', '우리 차례', '먼저 할 것'], ['them', '답 기다림', '며칠째 · 기준을 넘으면 알림']].forEach(([b, t, s]) => {
        const X = L.filter((d) => d.ball === b).sort((a, c) => (info(c).late - info(a).late) || (info(c).age - info(a).age)); if (!X.length) return
        h += `<div class="grp"><h3><b>${t}</b>${X.length}건 · ${s}</h3>${X.map(dealRow).join('')}</div>`
      })
      if (!L.length) h += deals.length ? '<div class="empty">해당하는 건이 없어요</div>' : `<div class="first"><b>첫 진행 건을 넣어 보세요</b><span>견적 · 단가 협의 · 입점 상담처럼 거래처와 주고받는 일 하나가 한 건이에요. 메일을 보냈으면 「상대 차례」, 받았으면 「우리 차례」로 시작해요.</span></div>`
      B.innerHTML = h
      $$('[data-f]').forEach((b) => b.onclick = () => { filt = b.dataset.f; render() })
    } else if (tab === 'clients') {
      const L = clients.filter((c) => !q || c.name.includes(q)).sort((a, b) => (last[a.id] || '0') < (last[b.id] || '0') ? -1 : 1)
      B.innerHTML = `<p class="hint" style="margin:0 0 10px">연락이 오래된 순서예요. 60일 넘게 연락이 없는 곳은 표시돼요 — 안부 전화 한 통이 다음 거래가 됩니다.</p>` +
        (L.map((c) => { const lo = last[c.id], ds = lo ? Math.round((TODAY - new Date(lo + 'T00:00')) / 864e5) : null, n = open().filter((d) => d.client_id === c.id).length
          return `<button class="cl" data-cli="${c.id}"><b>${esc(c.name)}${c.kind ? `<span class="tg2">${esc(c.kind)}</span>` : ''}</b><small>${[c.contact_name, c.phone, c.owner_id ? '담당 ' + pname(c.owner_id) : ''].filter(Boolean).map(esc).join(' · ') || '연락처 없음'}</small><span class="r">${n ? `진행 중 ${n}건<br>` : ''}<span class="${ds == null || ds >= 60 ? 'stale' : ''}">${ds == null ? '기록 없음' : `마지막 연락 ${ds === 0 ? '오늘' : ds + '일 전'}`}</span></span></button>` }).join('') || '<div class="empty">거래처가 없어요 — 진행 건을 넣으면 같이 만들어져요</div>')
      $$('[data-cli]').forEach((b) => b.onclick = () => openClient(clients.find((c) => c.id === b.dataset.cli)))
    } else {
      const L = deals.filter((d) => d.ball === 'done' && match(d)).sort((a, b) => (a.closed_on || '') < (b.closed_on || '') ? 1 : -1)
      B.innerHTML = L.map((d) => `<button class="deal" data-deal="${d.id}"><span class="c">${esc(cli(d.client_id).name)}</span><b>${esc(d.title)}</b><span class="mt">${d.closed_on ? md(d.closed_on) + ' 끝' : '끝'} · 담당 ${esc(pname(d.owner_id))}</span><span class="rt"><span class="ball b-done">${esc(RES[d.result] || '끝')}</span>${d.amount ? `<span class="amt">${won(d.amount)}</span>` : ''}</span></button>`).join('') || '<div class="empty">끝난 건이 없어요</div>'
    }
    $$('[data-deal]').forEach((b) => b.onclick = () => openDeal(deals.find((d) => d.id === b.dataset.deal)))
    renderSide()
  }
  function dealRow(d) {
    const i = info(d), l = lastLog(d)
    const nx = d.next_date || d.next_text ? `<span class="nx">다음 · ${d.next_date ? `<span class="d ${d.next_date < TK ? 'over' : ''}">${d.next_date === TK ? '오늘' : md(d.next_date)}</span>` : ''}${esc(d.next_text || '')}</span>` : '<span class="nx hint">다음 할 일 없음</span>'
    return `<button class="deal" data-deal="${d.id}"><span class="c">${esc(cli(d.client_id).name)}</span><b>${esc(d.title)}</b>
      <span class="mt">${md(l.log_date)} ${(LOG[l.kind] || LOG.note)[0]}${l.body ? ' · ' + esc(l.body) : ''}</span>${nx}
      <span class="rt"><span class="ball b-${i.cls}">${i.txt}</span><span class="age ${i.late ? 'late' : ''}">${d.ball === 'them' ? `${i.age ? i.age + '일째' : '오늘'} · 기준 ${i.lim}일` : i.age ? `${i.age}일째` : '오늘'}</span>${d.amount ? `<span class="amt">${won(d.amount)}</span>` : ''}<span class="hint">${esc(pname(d.owner_id))}</span></span></button>`
  }
  function renderSide() {
    const O = open(), td = O.filter((d) => d.ball === 'us' && ((d.next_date && d.next_date <= TK) || info(d).late)), nr = O.filter((d) => d.ball === 'them' && info(d).late)
    let h = '<h2>오늘 챙길 것<small>담당자 폰 · 아침 9시</small></h2><ul class="tl2">'
    td.forEach((d) => h += `<li><span class="w ${d.next_date && d.next_date < TK ? 'l' : ''}">${d.next_date && d.next_date < TK ? md(d.next_date) + ' 지남' : '오늘'}</span><span><b>${esc(cli(d.client_id).name)}</b> · ${esc(d.next_text || d.title)}</span><small>담당 ${esc(pname(d.owner_id))}</small></li>`)
    nr.forEach((d) => { const l = lastLog(d); h += `<li><span class="w l">답 없음</span><span><b>${esc(cli(d.client_id).name)}</b> · ${esc(d.title)} — ${info(d).age}영업일</span><small>${md(l.log_date)} ${(LOG[l.kind] || LOG.note)[0]} 뒤로 소식 없음</small><button data-poke="${d.id}">다시 연락 · 기록</button></li>` })
    if (!td.length && !nr.length) h += '<li><span class="w">없음</span><span>오늘 챙길 것 없음</span></li>'
    h += '</ul>'
    const mt = meets.filter((m) => m.deal_id && dk(new Date(m.starts_at)) >= TK && m.status !== 'done').sort((a, b) => a.starts_at < b.starts_at ? -1 : 1).slice(0, 6)
    if (mt.length) h += `<h2 style="margin-top:14px">잡힌 미팅<small>캘린더 · 전날 알림</small></h2><ul class="tl2">${mt.map((m) => { const t = new Date(m.starts_at); return `<li><span class="w">${md(dk(t))}</span><span><b>${esc(cli(m.client_id).name)}</b> · ${pad(t.getHours())}:${pad(t.getMinutes())} ${esc(m.title || '미팅')}</span></li>` }).join('')}</ul>`
    $('[data-today]').innerHTML = h
    $$('[data-poke]').forEach((b) => b.onclick = () => openDeal(deals.find((d) => d.id === b.dataset.poke), 'call'))
    const sum = O.reduce((a, d) => a + (Number(d.amount) || 0), 0), usS = O.filter((d) => d.ball === 'us').reduce((a, d) => a + (Number(d.amount) || 0), 0)
    const w30 = deals.filter((d) => d.ball === 'done' && d.result === 'won' && (d.closed_on || '') >= addD(TK, -30))
    $('[data-money]').innerHTML = `<h2>진행 중 금액<small>금액 넣은 건만</small></h2><div class="money">${won(sum) || '0원'}</div><div class="hint">우리 차례에 걸린 금액 ${won(usS) || '0원'} · 최근 30일 성사 ${w30.length}건 ${won(w30.reduce((a, d) => a + (Number(d.amount) || 0), 0))}</div>`
  }

  // ── 저장 ──
  async function patchDeal(d, patch, what) {
    const old = { ...d }; Object.assign(d, patch)
    const { error } = await sb.from('deals').update(patch).eq('id', d.id)
    if (error) { Object.assign(d, old); fail(what, error); return false }
    return true
  }
  async function addLog(d, kind, body, date) {
    const { data, error } = await sb.from('deal_logs').insert({ tenant_id: T, deal_id: d.id, kind, body: body || '', log_date: date || TK, author_id: ME }).select().single()
    if (error) { fail('기록', error); return null }
    logs.push(data); if ((date || TK) >= (last[d.client_id] || '')) last[d.client_id] = date || TK
    return data
  }
  function sheet(html, drawer) {
    const sc = document.createElement('div'); sc.className = 'scrim' + (drawer ? ' drawer' : ''); sc.innerHTML = html; root.appendChild(sc)
    sc.onclick = (ev) => { if (ev.target === sc) { sc.remove(); render() } }
    return sc
  }

  // ── 상세 — 누구 차례인지 제일 위에. 기록은 버튼 한 번 + 한 줄 ──
  function openDeal(d, preLog) {
    const c = cli(d.client_id); let lt = preLog || null, nd = null, busy = false
    const sc = sheet('<div class="sheet" role="dialog" aria-modal="true"></div>', true)
    const shut = () => { sc.remove(); render() }
    const paint = () => {
      const i = info(d)
      const TL = [...dlogs(d).map((l) => ({ d: l.log_date, k: l.kind, x: l.body, by: pname(l.author_id) })),
        ...meets.filter((m) => m.deal_id === d.id && m.status !== 'done').map((m) => { const t = new Date(m.starts_at); return { d: dk(t), k: 'meeting', x: `${pad(t.getHours())}:${pad(t.getMinutes())} ${m.title || '미팅'}`, by: pname(m.staff_id), plan: 1 } })]
        .sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0)
      sc.firstChild.setAttribute('aria-label', d.title)
      sc.firstChild.innerHTML = `<div class="shead"><div><div class="c">${esc(c.name)}${c.contact_name ? ' · ' + esc(c.contact_name) : ''}${c.phone ? ` · <a href="tel:${esc(digits(c.phone))}" style="color:inherit;font-variant-numeric:tabular-nums">${esc(c.phone)}</a>` : ''}</div><h2>${esc(d.title)}</h2><div class="hint">담당 ${esc(pname(d.owner_id))}${d.amount ? ` · ${won(Number(d.amount))}` : ''}</div></div><button class="x" data-x aria-label="닫기">×</button></div>
        ${d.ball === 'done' ? `<div class="state done"><b>끝 · ${esc(RES[d.result] || '')}</b><span class="hint">${d.closed_on ? md(d.closed_on) : ''}</span></div>` : `
        <div class="state ${i.cls}"><b>${d.ball === 'us' ? `지금 우리 차례 · ${i.age ? i.age + '일째' : '오늘부터'}` : i.late ? `답 없음 · ${i.age}영업일 (기준 ${i.lim}일)` : `상대 답 기다리는 중 · ${i.age ? i.age + '일째' : '오늘 보냄'}`}</b>
          <div class="sw"><button data-ball="us" aria-pressed="${d.ball === 'us'}">우리 차례</button><button data-ball="them" aria-pressed="${d.ball === 'them'}">상대 차례</button></div>
          ${d.ball === 'them' ? `<div class="chips"><span class="hint">답 기다리는 기준</span>${[1, 2, 3, 5, 7].map((n) => `<button data-lim="${n}" aria-pressed="${(d.wait_days || 3) === n}">${n}일</button>`).join('')}<span class="hint">넘으면 담당에게 알림</span></div>` : ''}</div>
        <div class="logs">${['mail_in', 'mail_out', 'call', 'meeting', 'note'].map((k) => `<button data-lt="${k}" aria-pressed="${lt === k}">${IC[k]}${LOG[k][0]}</button>`).join('')}</div>
        ${lt ? `<div class="lf"><div class="hint">${LOG[lt][0]}${lt === 'mail_in' ? ' — 우리 차례로 바뀌어요' : lt === 'mail_out' ? ` — 상대 차례로 바뀌고 ${d.wait_days || 3}영업일 안에 답 없으면 알려드려요` : lt === 'meeting' ? ' — 캘린더에 들어가고 전날 오후 6시에 알림' : ''}</div>
          ${lt === 'meeting' ? `<div class="chips"><span class="hint">날짜</span>${[1, 2, 3, 5].map((n) => { const k = addBiz(TK, n); return `<button data-md="${k}" aria-pressed="${nd === k}">${md(k)}</button>` }).join('')}<input type="date" data-mdt value="${nd || addBiz(TK, 1)}"><input type="time" data-mtm value="14:00"></div>` : ''}
          ${lt === 'mail_in' || lt === 'mail_out' ? '<textarea data-lx placeholder="한 줄 요약 · 또는 메일 내용을 붙여 넣으면 첫 줄로 요약"></textarea>' : `<input data-lx placeholder="${lt === 'meeting' ? '예) 단가 협의 · 본사 방문' : '한 줄'}">`}
          <div class="row" style="justify-content:flex-end"><button class="q" data-lc>그만</button><button data-ls>${lt === 'meeting' ? '캘린더에 넣기' : '남기기'}</button></div></div>` : ''}
        <div class="sec">다음 할 일</div>
        <div class="chips">${[['오늘', TK], ['내일', addBiz(TK, 1)], ['3일 뒤', addBiz(TK, 3)], ['1주 뒤', addBiz(TK, 5)]].map(([n, k]) => `<button data-nd="${k}" aria-pressed="${d.next_date === k}">${n}</button>`).join('')}<input type="date" data-ndt value="${d.next_date || ''}" aria-label="다음 할 일 날짜"></div>
        <input class="nxin" data-nxx value="${esc(d.next_text || '')}" placeholder="예) 회신 없으면 담당자 전화">`}
        <div class="sec">기록</div>
        <ul class="tlx">${TL.map((l) => `<li class="${(LOG[l.k] || LOG.note)[1]}"><div class="h"><b>${(LOG[l.k] || LOG.note)[0]}${l.plan ? ' · 예정' : ''}</b> · ${md(l.d)}${l.by ? ' · ' + esc(l.by) : ''}</div>${esc(l.x)}</li>`).join('') || '<li><div class="h">아직 기록 없음</div></li>'}</ul>
        ${d.ball === 'done' ? '<div class="ends"><button data-reopen>다시 열기</button></div>' : `<div class="ends">${Object.entries(RES).map(([k, r]) => `<button data-end="${k}">끝 · ${r}</button>`).join('')}</div>`}`
      const S = (x) => sc.querySelector(x)
      S('[data-x]').onclick = shut
      sc.querySelectorAll('[data-ball]').forEach((b) => b.onclick = async () => { if (d.ball === b.dataset.ball) return; const v = b.dataset.ball; if (await patchDeal(d, { ball: v }, '차례 바꾸기')) { await addLog(d, 'state', v === 'us' ? '우리 차례로 바꿈' : '상대 차례로 바꿈'); render(); paint() } })
      sc.querySelectorAll('[data-lim]').forEach((b) => b.onclick = async () => { const n = +b.dataset.lim, p = { wait_days: n }; if ((d.next_text || '').startsWith('회신 확인')) p.next_date = addBiz(lastLog(d).log_date, n); if (await patchDeal(d, p, '답 기다리는 기준')) { render(); paint() } })
      sc.querySelectorAll('[data-lt]').forEach((b) => b.onclick = () => { lt = lt === b.dataset.lt ? null : b.dataset.lt; paint(); const x = S('[data-lx]'); if (x) x.focus() })
      sc.querySelectorAll('[data-md]').forEach((b) => b.onclick = () => { nd = b.dataset.md; paint() })
      const lc = S('[data-lc]'); if (lc) lc.onclick = () => { lt = null; paint() }
      const ls = S('[data-ls]'); if (ls) ls.onclick = async () => {
        if (busy) return; busy = true
        let x = (S('[data-lx]').value || '').trim(); if (x.includes('\n')) x = x.split('\n').find((s) => s.trim()) || x
        try {
          if (lt === 'meeting') {
            const day = S('[data-mdt]').value || nd || addBiz(TK, 1), tm = S('[data-mtm]').value || '14:00'
            const { data, error } = await sb.from('appointments').insert({ tenant_id: T, kind: 'meeting', title: x || `${c.name} 미팅`, client_id: d.client_id, deal_id: d.id, staff_id: d.owner_id || ME, starts_at: new Date(`${day}T${tm}`).toISOString(), duration_min: 60, status: 'confirmed', source: 'staff', remind: 'prev18', created_by: ME }).select('id,deal_id,client_id,title,starts_at,status,staff_id').single()
            if (error) { fail('미팅', error); return }
            meets.push(data); toast(`캘린더에 넣었어요 · ${md(day)} ${tm} · 전날 오후 6시 알림`)
          } else {
            const L2 = await addLog(d, lt, x || LOG[lt][0]); if (!L2) return
            const p = {}
            if (LOG[lt][2] !== 'keep') p.ball = LOG[lt][2]
            if (lt === 'mail_out') { p.next_date = addBiz(TK, d.wait_days || 3); p.next_text = '회신 확인 · 없으면 전화' }
            else if (lt === 'mail_in') { p.next_date = addBiz(TK, 1); p.next_text = '' }
            if (Object.keys(p).length) await patchDeal(d, p, '차례')
            toast(lt === 'mail_out' ? `상대 차례 · ${md(d.next_date)}까지 답 없으면 알려드려요` : lt === 'mail_in' ? '우리 차례 · 다음 할 일 한 줄 적어 두세요' : '남겼습니다')
          }
          const focusNext = lt === 'mail_in'; lt = null; render(); paint()
          if (focusNext) { const n = S('[data-nxx]'); if (n) { n.focus(); n.scrollIntoView({ block: 'center' }) } }
        } finally { busy = false }
      }
      sc.querySelectorAll('[data-nd]').forEach((b) => b.onclick = async () => { if (await patchDeal(d, { next_date: b.dataset.nd }, '다음 할 일')) { render(); paint(); toast('다음 할 일 · 그날 아침 담당자에게 알림') } })
      const ndt = S('[data-ndt]'); if (ndt) ndt.onchange = async () => { if (await patchDeal(d, { next_date: ndt.value || null }, '다음 할 일')) { render(); paint() } }
      const nxx = S('[data-nxx]'); if (nxx) nxx.onchange = async () => { if (await patchDeal(d, { next_text: nxx.value.trim() }, '다음 할 일')) render() }
      sc.querySelectorAll('[data-end]').forEach((b) => b.onclick = async () => { const r = b.dataset.end; if (await patchDeal(d, { ball: 'done', result: r, closed_on: TK }, '끝내기')) { await addLog(d, 'state', `끝 · ${RES[r]}`); render(); paint(); toast(`끝난 것으로 옮겼어요 · ${RES[r]}`) } })
      const ro = S('[data-reopen]'); if (ro) ro.onclick = async () => { if (await patchDeal(d, { ball: 'us', result: null, closed_on: null }, '다시 열기')) { await addLog(d, 'state', '다시 열기'); render(); paint() } }
    }
    paint()
  }
  // 거래처 한 곳 — 연락처 고치기 · 이 거래처의 건
  function openClient(c) {
    const D = deals.filter((d) => d.client_id === c.id)
    const sc = sheet(`<form class="sheet" role="dialog" aria-modal="true" aria-label="${esc(c.name)}"><div class="shead"><h2>${esc(c.name)}</h2><button class="x" type="button" data-x aria-label="닫기">×</button></div>
      <div class="cedit"><div class="row2"><label class="fld">담당자 이름<input data-ct value="${esc(c.contact_name || '')}" placeholder="예) 박 팀장"></label><label class="fld">연락처<input data-ph value="${esc(c.phone || '')}" inputmode="tel"></label></div>
      <div class="row2"><label class="fld">종류<input data-kd list="vdeal-kinds" value="${esc(c.kind || '')}"></label><label class="fld">우리 담당<select data-ow><option value="">없음</option>${profiles.map((p) => `<option value="${p.id}"${p.id === c.owner_id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label></div>
      <datalist id="vdeal-kinds">${kinds().map((k) => `<option value="${esc(k)}">`).join('')}</datalist>
      <label class="fld">메모<input data-mm value="${esc(c.memo || '')}" placeholder="예) 결제일 매월 10일"></label></div>
      <div class="sec">진행 건</div>${D.map((d) => `<button type="button" class="deal" data-deal2="${d.id}"><b>${esc(d.title)}</b><span class="rt"><span class="ball b-${info(d).cls}">${info(d).txt}</span></span></button>`).join('') || '<div class="hint">아직 없음</div>'}
      <div class="sacts"><button type="button" data-nw>이 거래처로 새 건</button><button class="main">저장</button></div></form>`)
    const S = (x) => sc.querySelector(x)
    S('[data-x]').onclick = () => { sc.remove(); render() }
    sc.querySelectorAll('[data-deal2]').forEach((b) => b.onclick = () => { sc.remove(); openDeal(deals.find((d) => d.id === b.dataset.deal2)) })
    S('[data-nw]').onclick = () => { sc.remove(); openNew(c.name) }
    S('form').onsubmit = async (ev) => {
      ev.preventDefault()
      const p = { contact_name: S('[data-ct]').value.trim() || null, phone: S('[data-ph]').value.trim() || null, kind: S('[data-kd]').value.trim() || null, owner_id: S('[data-ow]').value || null, memo: S('[data-mm]').value.trim() || null }
      const { error } = await sb.from('clients').update(p).eq('id', c.id); if (error) return fail('거래처', error)
      Object.assign(c, p); sc.remove(); render(); toast('저장했습니다')
    }
  }
  // 새 진행 건 — 거래처는 이름 일부만 쳐도 찾고, 비슷한 이름이 있으면 알려준다(중복 거래처 방지)
  function openNew(pre) {
    let ball = 'us', nd = addBiz(TK, 1)
    const sc = sheet(`<form class="sheet" role="dialog" aria-modal="true" aria-label="새 진행 건"><h2>새 진행 건</h2>
      <label class="fld">거래처<input data-nc list="vdeal-cls" value="${esc(pre || '')}" placeholder="이름 일부만 쳐도 찾아요" autocomplete="off"></label>
      <datalist id="vdeal-cls">${clients.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist><div data-ncw></div>
      <label class="fld">무슨 건<input data-nt required placeholder="예) 10월 입고 견적"></label>
      <div class="fld">지금 누구 차례<div class="chips"><button type="button" data-b="us" aria-pressed="true">우리 차례 · 받은 것</button><button type="button" data-b="them" aria-pressed="false">상대 차례 · 보낸 것</button></div></div>
      <div class="row2"><label class="fld">금액 <span class="hint">선택</span><input data-na inputmode="numeric" placeholder="예) 12,500,000"></label><label class="fld">담당<select data-no>${profiles.map((p) => `<option value="${p.id}"${p.id === ME ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label></div>
      <div class="fld">다음 할 일<div class="chips">${[['오늘', TK], ['내일', addBiz(TK, 1)], ['3일 뒤', addBiz(TK, 3)]].map(([n, k]) => `<button type="button" data-d="${k}" aria-pressed="${nd === k}">${n}</button>`).join('')}</div><input data-nx placeholder="예) 비교 견적 받고 회신"></div>
      <div class="sacts"><button type="button" data-x>취소</button><button class="main" data-go>넣기</button></div></form>`)
    const S = (x) => sc.querySelector(x)
    S('[data-x]').onclick = () => { sc.remove(); render() }
    const norm = (s) => s.replace(/\s|\(주\)|주식회사|㈜/g, '')
    const chk = () => {
      const v = S('[data-nc]').value.trim(), w = S('[data-ncw]'); if (!v || clients.some((c) => c.name === v)) { w.innerHTML = ''; return }
      const nv = norm(v), sim = nv.length >= 2 && clients.find((c) => { const nc = norm(c.name); return nc.includes(nv) || nv.includes(nc) || (nc.slice(0, 2) === nv.slice(0, 2) && nv.length >= 3) })
      w.innerHTML = sim ? `<div class="wn">비슷한 거래처가 있어요: ${esc(sim.name)} — 같은 곳이면 목록에서 고르세요</div>` : '<div class="hint" style="margin-top:4px">새 거래처로 같이 만들어요</div>'
    }
    S('[data-nc]').oninput = chk; chk()
    sc.querySelectorAll('[data-b]').forEach((b) => b.onclick = () => { ball = b.dataset.b; sc.querySelectorAll('[data-b]').forEach((x) => x.setAttribute('aria-pressed', x === b)) })
    sc.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { nd = b.dataset.d; sc.querySelectorAll('[data-d]').forEach((x) => x.setAttribute('aria-pressed', x === b)) })
    S('[data-na]').oninput = (e) => { const n = +e.target.value.replace(/\D/g, ''); e.target.value = n ? n.toLocaleString() : '' }
    S('form').onsubmit = async (ev) => {
      ev.preventDefault(); const go = S('[data-go]'); if (go.disabled) return
      const name = S('[data-nc]').value.trim(), title = S('[data-nt]').value.trim(); if (!title) return
      if (!name) { S('[data-nc]').focus(); return }
      go.disabled = true
      try {
        let c = clients.find((x) => x.name === name)
        if (!c) { const r = await sb.from('clients').insert({ tenant_id: T, name, kind: kinds()[0], owner_id: S('[data-no]').value || ME }).select().single(); if (r.error) throw r.error; c = r.data; clients.push(c) }
        const amt = +S('[data-na]').value.replace(/\D/g, '') || null
        const wd = 3, next = ball === 'them' ? { next_date: addBiz(TK, wd), next_text: S('[data-nx]').value.trim() || '회신 확인 · 없으면 전화' } : { next_date: nd, next_text: S('[data-nx]').value.trim() }
        const r2 = await sb.from('deals').insert({ tenant_id: T, client_id: c.id, title, amount: amt, owner_id: S('[data-no]').value || ME, ball, wait_days: wd, ...next, created_by: ME }).select().single(); if (r2.error) throw r2.error
        deals.unshift(r2.data)
        await addLog(r2.data, ball === 'us' ? 'mail_in' : 'mail_out', ball === 'us' ? '받음' : '보냄')
        sc.remove(); tab = 'deals'; filt = 'all'; render(); openDeal(r2.data)
      } catch (e) { go.disabled = false; fail('진행 건', e) }
    }
    setTimeout(() => S(pre ? '[data-nt]' : '[data-nc]').focus(), 30)
  }

  $$('[data-tab] button').forEach((b) => b.onclick = () => { tab = b.dataset.t; render() })
  $('[data-q]').oninput = (e) => { q = e.target.value.trim(); render() }
  $('[data-new]').onclick = () => openNew()
  try { await load(); $('[data-err]').innerHTML = '' } catch (e) { console.warn('[deal] load', e); $('[data-err]').innerHTML = `<div class="st-err">거래처를 불러오지 못했어요 — ${esc(e.message || e)}. 잠시 뒤 다시 열어 주세요</div>` }
  render()
  if (host.dealId) { const d = deals.find((x) => x.id === host.dealId); if (d) openDeal(d) }
  return { close }
}
