// 보관기한 (v6.10) — 들어온 것을 넣고, 기한 가까운 것만 챙기고, 버린 것은 이유와 함께 남긴다.
// 승인된 시안(expiry-sample v2)을 앱 안으로. 표: expiry_items(품목) · expiry_lots(들어온 묶음). 기한(due_on)은 DB 트리거가 계산한다
// — 포장에 적힌 날(label_date)과 뜯은 뒤 기한(opened_on + open_days) 중 빠른 날, 직접 만든 것은 들어온 날 + keep_days.
// 평소엔 누를 것이 없다: 지남 · 오늘 · 내일까지만 버튼이 있고, 나머지는 접혀 있다. 알림은 api/push-remind 가 아침 · 저녁에.
import { supabase as sb } from './supabase-client.js'
import { getContext } from './context.js'

const CSS = `#vexp{--ink:var(--text);--sub:var(--text-sub);--mute:var(--text-mute);--line:var(--border);--hover:var(--soft);
  --deep:var(--navy);--tint:var(--green-light);--on-main:#fff;
  --over:#B42A1F;--over-bg:#FBE7E4;--today:#9A5A06;--today-bg:#FEEFCF;--soon:#8E5A06;--soon-bg:#FFF7E6;--ok:#1C7A57;--ok-bg:#E4F3EA;
  --cold:#1E63C4;--cold-bg:#E2EFFE;--frz:#3F4BC0;--frz-bg:#E6E8FC;--room:#7A5B2E;--room-bg:#F3ECE0;
  position:fixed;inset:0;z-index:900;background:var(--bg);color:var(--ink);overflow-y:auto;overscroll-behavior:contain;font-size:14px;line-height:1.55;}
html[data-bright=dark] #vexp{--over:#F08A80;--over-bg:#3A1D1A;--today:#F2B35A;--today-bg:#35280F;--soon:#E9C27A;--soon-bg:#2A2412;--ok:#6CCB9A;--ok-bg:#163527;
  --cold:#7FB0F2;--cold-bg:#1A2B42;--frz:#9EA6F5;--frz-bg:#1F2244;--room:#D8B98A;--room-bg:#2E2618;}
#vexp *{box-sizing:border-box}
#vexp button,#vexp select,#vexp input{font:inherit;color:inherit}
#vexp button{cursor:pointer}
#vexp :focus-visible{outline:2px solid var(--green);outline-offset:2px}
#vexp .wrap{max-width:1320px;margin:0 auto;padding:14px 16px calc(48px + var(--safe-bot,0px))}
#vexp .st-err{background:var(--over-bg);color:var(--over);border-radius:10px;padding:8px 12px;font-size:13px;font-weight:600;margin-bottom:10px}
#vexp .loading{font-size:13px;color:var(--mute);padding:40px 0;text-align:center}
#vexp .sacts button{display:grid;place-items:center;padding:0 10px}
#vexp .starter{border:1.5px dashed var(--line);border-radius:14px;padding:16px;display:grid;gap:8px;justify-items:start;font-size:13.5px;color:var(--sub)}
#vexp .starter b{color:var(--ink);font-size:15px}
#vexp .starter button{border:0;background:var(--deep);color:var(--on-main);border-radius:10px;padding:9px 14px;font-weight:700}
#vexp .tbl .hide{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:5px 9px;font-size:12px;font-weight:600;color:var(--sub);white-space:nowrap}
#vexp .note2{font-size:12.5px;color:var(--mute);margin-top:10px}
#vexp .app{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
@media(min-width:1060px){
#vexp .app{grid-template-columns:minmax(0,1fr) 340px}
}
#vexp .main{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;min-width:0}
#vexp .top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
#vexp .top h1{font-size:22px;margin:0;letter-spacing:-.02em}
#vexp .top .sum{font-size:13px;color:var(--sub);margin-top:2px}
#vexp .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#vexp select.s{height:36px;border:1px solid var(--line);background:var(--card);border-radius:9px;padding:0 10px;font-size:13px}
#vexp .add{height:38px;border:0;background:var(--deep);color:var(--on-main);border-radius:10px;padding:0 16px;font-weight:700;display:inline-flex;gap:6px;align-items:center}
#vexp .add svg{width:15px;height:15px}
#vexp .seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:14px 0 12px}
#vexp .seg button{border:0;background:var(--card);padding:0 14px;height:34px;font-weight:600;font-size:13px;color:var(--sub)}
#vexp .seg button[aria-pressed=true]{background:var(--deep);color:var(--on-main)}
#vexp .flt{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
#vexp .flt button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:5px 12px;font-size:13px;font-weight:600;color:var(--sub)}
#vexp .flt button b{font-variant-numeric:tabular-nums;color:var(--ink)}
#vexp .flt button[aria-pressed=true]{border-color:var(--ink);color:var(--ink)}
#vexp .flt i{width:8px;height:8px;border-radius:50%}
#vexp .grp{margin-top:14px}
#vexp .grp h3{font-size:13px;margin:0 0 6px;display:flex;align-items:center;gap:8px;color:var(--sub)}
#vexp .grp h3 b{color:var(--ink)}
#vexp .lot{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:2px 12px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card);margin-bottom:6px}
#vexp .lot .dd{grid-row:1 / span 2;width:64px;text-align:center;border-radius:10px;padding:6px 0;font-weight:700;font-size:13px;line-height:1.2;font-variant-numeric:tabular-nums}
#vexp .lot .dd small{display:block;font-size:11px;font-weight:600}
#vexp .st-over .dd{background:var(--over-bg);color:var(--over)}
#vexp .st-today .dd{background:var(--today-bg);color:var(--today)}
#vexp .st-tmr .dd{background:var(--soon-bg);color:var(--soon)}
#vexp .st-soon .dd{background:var(--soft);color:var(--sub)}
#vexp .st-ok .dd{background:var(--ok-bg);color:var(--ok)}
#vexp .st-over{border-color:var(--over)}
#vexp .lot .nm{font-weight:700;font-size:14.5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#vexp .lot .nm .q{font-weight:600;color:var(--sub);font-size:13px}
#vexp .lot .mt{grid-column:2;font-size:12.5px;color:var(--sub);font-variant-numeric:tabular-nums}
#vexp .lot .acts{grid-row:1 / span 2;grid-column:3;display:flex;gap:6px}
#vexp .lot .acts button{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:600;white-space:nowrap}
#vexp .lot .acts button:hover{background:var(--hover)}
#vexp .lot .acts .bin{color:var(--over)}
#vexp .tagk{font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px}
#vexp .k-cold{background:var(--cold-bg);color:var(--cold)}
#vexp .k-frz{background:var(--frz-bg);color:var(--frz)}
#vexp .k-room{background:var(--room-bg);color:var(--room)}
#vexp .tago{font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px;background:var(--soft);color:var(--sub)}
#vexp .empty{font-size:13px;color:var(--mute);padding:16px 0}
#vexp .tbl{width:100%;border-collapse:collapse;font-size:13.5px}
#vexp .tblw{overflow-x:auto}
#vexp .tbl th{font-size:12px;color:var(--mute);font-weight:600;text-align:left;padding:8px;border-bottom:1px solid var(--line);white-space:nowrap}
#vexp .tbl td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:middle}
#vexp .tbl input,#vexp .tbl select{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:6px 8px;font-size:13.5px;width:100%;min-width:0}
#vexp .tbl input.n{width:70px;text-align:right;font-variant-numeric:tabular-nums}
#vexp .tbl .u{color:var(--mute);font-size:12px;white-space:nowrap}
#vexp .addrow{margin-top:10px;border:1px dashed var(--line);background:transparent;border-radius:10px;padding:9px;width:100%;font-weight:700;color:var(--sub)}
#vexp .hint{font-size:12px;color:var(--mute)}
#vexp .wtot{display:flex;gap:18px;flex-wrap:wrap;background:var(--soft);border-radius:12px;padding:12px 14px;margin-bottom:12px}
#vexp .wtot div{font-size:12.5px;color:var(--sub)}
#vexp .wtot b{display:block;font-size:18px;color:var(--ink);font-variant-numeric:tabular-nums}
#vexp .wl{display:grid;grid-template-columns:70px minmax(0,1fr) auto;gap:2px 10px;padding:9px 0;border-top:1px solid var(--line);font-size:13.5px}
#vexp .wl .d{color:var(--mute);font-variant-numeric:tabular-nums}
#vexp .wl .w{text-align:right;font-variant-numeric:tabular-nums;color:var(--sub)}
#vexp .wl small{grid-column:2;color:var(--sub);font-size:12px}
#vexp .side{display:grid;gap:12px;align-content:start}
#vexp .panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
#vexp .panel h2{font-size:15px;margin:0 0 8px;display:flex;justify-content:space-between;gap:8px;align-items:baseline}
#vexp .panel h2 small{font-size:12px;color:var(--mute);font-weight:500}
#vexp .al{list-style:none;margin:0;padding:0;display:grid;gap:9px}
#vexp .al li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1px 10px;font-size:13px}
#vexp .al .w{font-weight:700;color:var(--green);white-space:nowrap;font-variant-numeric:tabular-nums}
#vexp .al small{grid-column:2;color:var(--mute);font-size:12px}
#vexp .push{margin-top:10px;background:var(--soft);border-radius:12px;padding:10px 12px;display:grid;grid-template-columns:28px minmax(0,1fr);gap:0 10px}
#vexp .push .ic{width:28px;height:28px;border-radius:7px;background:var(--deep);display:grid;place-items:center}
#vexp .push .ic svg{width:16px;height:16px;color:var(--on-main)}
#vexp .push b{font-size:12.5px}
#vexp .push p{margin:1px 0 0;font-size:12.5px;color:var(--sub)}
#vexp .push .from{font-size:11px;color:var(--mute)}
#vexp .bars{display:grid;gap:6px;margin-top:4px}
#vexp .bar{display:grid;grid-template-columns:70px minmax(0,1fr) 44px;gap:8px;align-items:center;font-size:12.5px}
#vexp .bar .t{height:8px;border-radius:4px;background:var(--soft);overflow:hidden}
#vexp .bar .t i{display:block;height:100%;background:var(--over);opacity:.75}
#vexp .bar .v{text-align:right;color:var(--sub);font-variant-numeric:tabular-nums}
#vexp .scrim{position:fixed;inset:0;background:rgba(8,16,12,.45);display:grid;place-items:end center;z-index:20}
@media(min-width:700px){
#vexp .scrim{place-items:center;padding:16px}
}
#vexp .sheet{background:var(--card);width:100%;max-width:620px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px))}
@media(min-width:700px){
#vexp .sheet{border-radius:18px}
}
#vexp .sheet h2{margin:0 0 4px;font-size:18px}
#vexp .sheet .sub{font-size:13px;color:var(--sub);margin:0 0 12px}
#vexp .srch{width:100%;border:1.5px solid var(--line);background:var(--card);border-radius:10px;padding:10px 12px;font-size:15px}
#vexp .kf{display:flex;gap:6px;margin:10px 0}
#vexp .kf button{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:4px 12px;font-size:12.5px;font-weight:600;color:var(--sub)}
#vexp .kf button[aria-pressed=true]{border-color:var(--ink);color:var(--ink)}
#vexp .pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px}
#vexp .pick button{border:1.5px solid var(--line);background:var(--card);border-radius:10px;padding:8px 10px;text-align:left;display:grid;gap:1px;position:relative}
#vexp .pick button b{font-size:13.5px}
#vexp .pick button small{font-size:11.5px;color:var(--mute)}
#vexp .pick button .cnt{position:absolute;top:6px;right:8px;min-width:20px;height:20px;border-radius:999px;background:var(--deep);color:var(--on-main);font-size:11.5px;font-weight:700;display:grid;place-items:center;padding:0 5px}
#vexp .pick button.on{border-color:var(--green);background:var(--tint)}
#vexp .cart{margin-top:12px;border-top:1px solid var(--line);padding-top:10px;display:grid;gap:6px}
#vexp .ci{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:4px 10px;align-items:center;font-size:13.5px}
#vexp .ci b{font-weight:700}
#vexp .ci small{grid-column:1;color:var(--sub);font-size:12px}
#vexp .stp{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:8px;overflow:hidden}
#vexp .stp button{border:0;background:var(--card);width:30px;height:30px;font-weight:700}
#vexp .stp span{min-width:26px;text-align:center;font-variant-numeric:tabular-nums;font-weight:700}
#vexp .lbl{grid-row:1 / span 2;grid-column:3;font-size:12px;color:var(--sub);display:flex;gap:4px;align-items:center}
#vexp .lbl input[type=date]{border:1px solid var(--line);border-radius:7px;padding:3px 6px;font-size:12px;background:var(--card)}
#vexp .sacts{display:flex;gap:8px;margin-top:14px}
#vexp .sacts button{flex:1;height:46px;border-radius:12px;font-weight:700;border:1px solid var(--line);background:var(--card)}
#vexp .sacts .main{background:var(--deep);border-color:var(--deep);color:var(--on-main);flex:2}
#vexp .sacts .main:disabled{opacity:.45;cursor:default}
#vexp .rs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
#vexp .rs button{border:1.5px solid var(--line);background:var(--card);border-radius:999px;padding:6px 13px;font-size:13px;font-weight:600;color:var(--sub)}
#vexp .rs button[aria-pressed=true]{border-color:var(--over);color:var(--over);background:var(--over-bg)}
#vexp .toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--bg);font-size:13px;font-weight:600;padding:9px 14px;border-radius:10px;z-index:30;max-width:calc(100% - 32px)}
#vexp .due{border:1.5px solid var(--green);background:var(--tint);border-radius:14px;padding:12px 14px;margin-bottom:12px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center}
#vexp .due b{font-size:14.5px}
#vexp .due small{grid-column:1;color:var(--sub);font-size:12.5px}
#vexp .due .acts{grid-row:1 / span 2;grid-column:2;display:flex;gap:6px}
#vexp .due .acts button{border:1px solid var(--line);background:var(--card);border-radius:9px;padding:8px 12px;font-weight:700;font-size:13px;white-space:nowrap}
#vexp .due .acts .go{background:var(--deep);border-color:var(--deep);color:var(--on-main)}
#vexp .due.done{border-color:var(--line);background:var(--card)}
#vexp .lot .acts .snz{color:var(--sub)}
#vexp .lot .who{color:var(--mute)}
#vexp .fold{width:100%;border:1px dashed var(--line);background:transparent;border-radius:10px;padding:9px;font-weight:700;color:var(--sub);margin-top:6px}
#vexp .quiet .lot{padding:8px 12px}
#vexp .quiet .lot .acts button{padding:5px 9px;font-size:12px}
#vexp .chips{display:flex;flex-wrap:wrap;gap:4px;grid-column:1 / -1;align-items:center}
#vexp .chips .cl{font-size:12px;color:var(--sub);margin-right:2px}
#vexp .chips button{border:1px solid var(--line);background:var(--card);border-radius:999px;padding:3px 9px;font-size:12px;font-weight:600;color:var(--sub);font-variant-numeric:tabular-nums}
#vexp .chips button[aria-pressed=true]{border-color:var(--green);background:var(--tint);color:var(--ink)}
#vexp .chips input[type=date]{border:1px solid var(--line);border-radius:7px;padding:2px 6px;font-size:12px;background:var(--card)}
#vexp .again{display:grid;gap:6px;margin-bottom:10px}
#vexp .again button{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid var(--line);background:var(--soft);border-radius:10px;padding:9px 12px;text-align:left;font-size:13px}
#vexp .again button b{white-space:nowrap}
#vexp .again button span{color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#vexp .storeln{font-size:12.5px;color:var(--sub);margin-bottom:8px}
#vexp .storeln button{border:0;background:none;color:var(--green);font-weight:700;padding:0;text-decoration:underline}
#vexp .push .pa{display:flex;gap:6px;margin-top:8px}
#vexp .push .pa button{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:5px 10px;font-size:12px;font-weight:700}
@media(max-width:640px){
#vexp .main{padding:14px 12px}
#vexp .lot{grid-template-columns:auto minmax(0,1fr)}
#vexp .lot .acts{grid-row:auto;grid-column:1 / -1;justify-content:flex-end;margin-top:4px}
#vexp .ci{grid-template-columns:minmax(0,1fr) auto}
#vexp .lbl{grid-row:auto;grid-column:1 / -1}
}`

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const pad = (n) => String(n).padStart(2, '0')
const dk = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addD = (k, n) => { const d = new Date(k + 'T00:00'); d.setDate(d.getDate() + n); return dk(d) }
const md = (k) => { const d = new Date(k + 'T00:00'); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})` }
const won = (n) => n >= 10000 ? `${Math.round(n / 1000) / 10}만 원` : `${Math.round(n).toLocaleString()}원`
const KIND = { cold: '냉장', frz: '냉동', room: '실온' }
const HOW = { label: '포장에 적힌 날짜', days: '들어온 날부터' }
const ST = { over: '지남', today: '오늘까지', tmr: '내일까지', soon: '3일 안', ok: '여유' }
const REASONS = ['기한 지남', '상함', '파손', '개봉 후 남음', '기타']
// 업종 기본 품목 — 품목이 하나도 없을 때 한 번에 넣는 출발점. 이름 · 보관 · 정하는 법 · 일수 · 개봉 후 · 단위 · 단가 · 위치
const STARTER = {
  cafe: [['우유 1L', 'cold', 'label', 9, 3, '개', 2400, '냉장고'], ['생크림 1L', 'cold', 'label', 12, 2, '개', 7800, '냉장고'], ['크림치즈', 'cold', 'label', 30, 5, '개', 9500, '냉장고'], ['시럽', 'room', 'label', 365, 30, '병', 9000, '창고'], ['원두 1kg', 'room', 'label', 90, 14, '봉', 28000, '창고'], ['조각 케이크', 'cold', 'days', 3, 0, '개', 3500, '쇼케이스'], ['직접 만든 청', 'cold', 'days', 7, 0, '병', 0, '냉장고']],
  convenience: [['삼각김밥', 'cold', 'label', 1, 0, '개', 1300, '도시락 냉장'], ['도시락', 'cold', 'label', 1, 0, '개', 4500, '도시락 냉장'], ['샌드위치', 'cold', 'label', 2, 0, '개', 3200, '도시락 냉장'], ['우유 200ml', 'cold', 'label', 10, 0, '개', 1100, '음료 냉장'], ['요구르트', 'cold', 'label', 14, 0, '개', 900, '음료 냉장'], ['빵(봉지)', 'room', 'label', 5, 0, '개', 1800, '빵 진열대']],
  beauty: [['염모제', 'room', 'label', 365, 1, '개', 8000, '약제장'], ['산화제', 'room', 'label', 365, 30, '통', 6000, '약제장'], ['파마약', 'room', 'label', 365, 14, '통', 11000, '약제장'], ['클리닉 앰플', 'cold', 'label', 90, 7, '개', 15000, '소형 냉장고']],
}
const IC = { bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>' }

export async function openExpiry(host = {}) {
  if (document.getElementById('vexp')) return
  const ctx = await getContext()
  const T = ctx.tenantId, ME = ctx.profileId
  const isAdmin = ['owner', 'manager'].includes(ctx.profile?.role)
  const STORES = ((host.stores && host.stores.length) ? host.stores : (ctx.stores || [])).map((s) => ({ id: s.id, name: s.name }))
  const sName = (id) => (STORES.find((s) => s.id === id) || {}).name || ''
  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)
  const TK = dk(TODAY)
  const diff = (k) => Math.round((new Date(k + 'T00:00') - TODAY) / 864e5)
  const myStore = host.store || (window.__vflowProfile || {}).storeId // 근무 마감 · 대기 화면에서 열면 그 매장
  let tab = 'now', filt = 'urgent', store = STORES.find((s) => s.id === myStore) ? myStore : 'all', foldOpen = false
  let here = store !== 'all' ? store : (STORES[0] || {}).id
  let items = [], lots = [], waste = [], recent = [], names = {}, industry = ''

  const root = document.createElement('div'); root.id = 'vexp'
  root.innerHTML = `<style>${CSS}</style>
  <div class="header" style="position:sticky;top:0;z-index:10;"><div><div class="header-title">보관기한</div><div class="header-sub">들어온 것 · 챙길 것 · 버린 기록</div></div><button class="back-btn" type="button" data-close>닫기</button></div>
  <div class="wrap"><div data-err></div>
   <div class="app">
    <section class="main">
      <div class="top">
        <div><h1>보관기한</h1><div class="sum" data-sum></div></div>
        <div class="row"><select class="s" data-store aria-label="매장"></select>
          <button class="add" data-in><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>들어온 것</button></div>
      </div>
      <div class="seg" data-tab><button data-t="now">보관 중</button><button data-t="items">품목</button><button data-t="waste">버린 기록</button></div>
      <div data-body><div class="loading">불러오는 중…</div></div>
    </section>
    <aside class="side">
      <section class="panel" data-alerts></section>
      <section class="panel" data-wsum></section>
    </aside>
   </div>
  </div>`
  const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)]
  document.body.appendChild(root)
  const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
  const toast = (t) => { const o = root.querySelector('.toast'); if (o) o.remove(); const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; root.appendChild(d); setTimeout(() => d.remove(), 2600) }
  const fail = (what, e) => { console.warn('[exp]', what, e); toast(`${what} — 저장하지 못했어요. 인터넷을 확인하고 다시 해 주세요`) }
  const onKey = (e) => { if (e.key !== 'Escape') return; const sc = root.querySelector('.scrim'); if (sc) { sc.remove(); return } close() }
  const close = () => { document.removeEventListener('keydown', onKey); root.remove(); document.body.style.overflow = prevOverflow; try { host.onClose && host.onClose() } catch (e) {} }
  document.addEventListener('keydown', onKey)
  $('[data-close]').onclick = close
  const sheet = (html) => { const sc = document.createElement('div'); sc.className = 'scrim'; sc.innerHTML = html; root.appendChild(sc); sc.onclick = (ev) => { if (ev.target === sc) sc.remove() }; sc.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => sc.remove()); return sc }

  // ── 불러오기 ──
  const itemOf = (r) => ({ id: r.id, n: r.name, k: KIND[r.category] ? r.category : 'room', how: r.how || 'label', d: r.keep_days ?? 7, o: r.open_days || 0, u: r.unit || '개', p: r.price || 0, loc: r.place || '', active: r.active !== false })
  const lotOf = (r) => ({ id: r.id, itemId: r.item_id, in: r.received_on, q: Number(r.qty) || 0, store: r.store_id, opened: r.opened_on, label: r.label_date, due: r.due_on, who: r.created_by, snooze: r.snooze_until, status: r.status, reason: r.discard_reason, closedAt: r.closed_at, row: r })
  async function load() {
    const monthStart = TK.slice(0, 8) + '01', from60 = addD(TK, -60)
    const q = await Promise.all([
      sb.from('expiry_items').select('*').eq('tenant_id', T).order('name').limit(2000),
      sb.from('expiry_lots').select('*').eq('tenant_id', T).eq('status', 'active').order('due_on').limit(5000),
      sb.from('expiry_lots').select('*').eq('tenant_id', T).eq('status', 'discarded').gte('closed_at', new Date(addD(monthStart, -31) + 'T00:00').toISOString()).limit(3000),
      sb.from('expiry_lots').select('item_id,store_id,received_on,qty').eq('tenant_id', T).gte('received_on', from60).lte('received_on', addD(TK, -1)).limit(5000),
      sb.from('profiles').select('id,name').eq('tenant_id', T).limit(1000),
      sb.from('tenants').select('industry').eq('id', T).maybeSingle(),
    ])
    const bad = q.slice(0, 5).find((r) => r.error); if (bad) throw bad.error
    items = (q[0].data || []).map(itemOf); lots = (q[1].data || []).map(lotOf); waste = (q[2].data || []).map(lotOf); recent = q[3].data || []
    names = {}; (q[4].data || []).forEach((p) => { names[p.id] = p.name }); industry = (q[5].data || {}).industry || ''
  }
  const item = (id) => items.find((i) => i.id === id) || { n: '품목', k: 'room', how: 'days', d: 7, o: 0, u: '개', p: 0, loc: '' }
  const due = (l) => l.due
  const stat = (l) => { const n = diff(due(l)); return n < 0 ? 'over' : n === 0 ? 'today' : n === 1 ? 'tmr' : n <= 3 ? 'soon' : 'ok' }
  const ddText = (l) => { const n = diff(due(l)); return n < 0 ? `${-n}일<small>지남</small>` : n === 0 ? `오늘<small>까지</small>` : `D-${n}<small>${md(due(l))}</small>` }
  const vis = () => lots.filter((l) => store === 'all' || l.store === store)
  const urgent = (l) => ['over', 'today', 'tmr'].includes(stat(l))
  const snoozed = (l) => l.snooze && l.snooze > TK

  // ── 그리기 ──
  function render() {
    $('[data-store]').innerHTML = '<option value="all">전체 매장</option>' + STORES.map((s) => `<option value="${s.id}"${store === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
    const v = vis(), c = {}; v.forEach((l) => { const s = stat(l); c[s] = (c[s] || 0) + 1 })
    const u = (c.over || 0) + (c.today || 0) + (c.tmr || 0)
    $('[data-sum]').textContent = `챙길 것 ${u}건 · 보관 중 ${v.length}건`
    $$('[data-tab] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === tab))
    const B = $('[data-body]')
    if (tab === 'now') {
      let h = ''
      if (!items.length) h += starterBox()
      if (items.length || v.length) h += `<div class="flt">${[['urgent', '챙길 것', u], ['over', '지남', c.over || 0], ['today', '오늘까지', c.today || 0], ['tmr', '내일까지', c.tmr || 0], ['all', '전체', v.length]].map(([k, n, x]) => `<button data-f="${k}" aria-pressed="${filt === k}">${n} <b>${x}</b></button>`).join('')}</div>`
      const order = ['over', 'today', 'tmr'], pick = filt === 'urgent' || filt === 'all' ? order : [filt]
      pick.forEach((s) => {
        const L = v.filter((l) => stat(l) === s).sort((a, b) => due(a) < due(b) ? -1 : 1); if (!L.length) return
        h += `<div class="grp"><h3><b>${ST[s]}</b>${L.length}건${s === 'over' ? ' · 버림으로 정리해 주세요' : s === 'tmr' ? ' · 오늘 저녁 알림' : ''}</h3>${L.map((l) => lotRow(l, true)).join('')}</div>`
      })
      if ((filt === 'urgent' || filt === 'all') && !u && items.length) h += '<div class="empty">오늘 챙길 것 없음</div>'
      // 여유 있는 것 — 평소엔 접어 둔다
      if (filt === 'urgent' || filt === 'all') {
        const R = v.filter((l) => !urgent(l)).sort((a, b) => due(a) < due(b) ? -1 : 1)
        if (R.length) h += (foldOpen || filt === 'all') ? `<div class="grp quiet"><h3><b>그 뒤</b>${R.length}건</h3>${R.map((l) => lotRow(l, false)).join('')}</div>${filt === 'all' ? '' : '<button class="fold" data-fold>접기</button>'}` : `<button class="fold" data-fold>그 뒤 ${R.length}건 펼치기</button>`
      }
      B.innerHTML = h
      $$('[data-f]').forEach((b) => b.onclick = () => { filt = b.dataset.f; render() })
      const f = $('[data-fold]'); if (f) f.onclick = () => { foldOpen = !foldOpen; render() }
      wireStarter(B); wireLots(B)
    } else if (tab === 'items') {
      const L = items.filter((i) => i.active)
      B.innerHTML = (L.length ? '' : starterBox()) + `<p class="hint" style="margin:0 0 10px">포장 제품은 <b>포장에 적힌 날짜</b>(소비기한)로, 직접 만들거나 손질한 것은 <b>들어온 날부터</b> 며칠로 계산해요. 포장 제품의 일수는 "보통 며칠 남은 채로 들어오는지" — 넣을 때 날짜 칩의 기본값이 됩니다.</p>
        <div class="tblw"><table class="tbl"><thead><tr><th>품목</th><th>보관</th><th>기한 정하는 법</th><th>일수</th><th>개봉하면</th><th>단위</th><th>위치</th><th>단가</th><th></th></tr></thead><tbody>${L.map((it) => `<tr>
        <td><input value="${esc(it.n)}" data-i="${it.id}" data-f="n" aria-label="품목 이름" style="min-width:110px"></td>
        <td><select data-i="${it.id}" data-f="k" aria-label="보관">${Object.entries(KIND).map(([k, n]) => `<option value="${k}"${it.k === k ? ' selected' : ''}>${n}</option>`).join('')}</select></td>
        <td><select data-i="${it.id}" data-f="how" aria-label="기한 정하는 법">${Object.entries(HOW).map(([k, n]) => `<option value="${k}"${it.how === k ? ' selected' : ''}>${n}</option>`).join('')}</select></td>
        <td><input class="n" type="number" min="0" value="${it.d}" data-i="${it.id}" data-f="d" aria-label="일수" style="width:60px"> <span class="u">${it.how === 'label' ? '일쯤 남음' : '일'}</span></td>
        <td><input class="n" type="number" min="0" value="${it.o}" data-i="${it.id}" data-f="o" aria-label="개봉 후 일수" style="width:56px"> <span class="u">${it.o ? '일' : '없음'}</span></td>
        <td><input value="${esc(it.u)}" data-i="${it.id}" data-f="u" aria-label="단위" style="width:56px"></td>
        <td><input value="${esc(it.loc)}" data-i="${it.id}" data-f="loc" aria-label="위치" placeholder="선택" style="min-width:90px"></td>
        <td><input class="n" type="number" min="0" step="100" value="${it.p}" data-i="${it.id}" data-f="p" aria-label="단가" style="width:84px"> <span class="u">원</span></td>
        <td><button class="hide" data-hide="${it.id}">빼기</button></td></tr>`).join('')}</tbody></table></div>
        <button class="addrow" data-additem>+ 품목</button>
        <p class="note2">일수 · 개봉 후 일수를 바꾸면 보관 중인 것의 기한도 다시 계산돼요. 「빼기」는 목록에서만 빠지고 기록은 남아요.</p>`
      const COL = { n: 'name', k: 'category', how: 'how', d: 'keep_days', o: 'open_days', u: 'unit', loc: 'place', p: 'price' }
      $$('.tbl [data-f]').forEach((el) => el.onchange = async () => {
        const it = items.find((x) => x.id === el.dataset.i), f = el.dataset.f, old = { ...it }
        let v2 = ['d', 'o', 'p'].includes(f) ? Math.max(0, Math.round(+el.value || 0)) : el.value.trim()
        if (f === 'n' && !v2) { el.value = it.n; return }
        it[f] = v2
        const dbv = f === 'o' ? (v2 || null) : v2
        const { error } = await sb.from('expiry_items').update({ [COL[f]]: dbv }).eq('id', it.id)
        if (error) { Object.assign(it, old); render(); fail(error.code === '23505' ? '같은 이름의 품목이 있어요' : '품목', error); return }
        if (f === 'd' || f === 'o') { await reloadLots() }
        render(); toast('저장했습니다')
      })
      $$('[data-hide]').forEach((b) => b.onclick = async () => {
        const it = items.find((x) => x.id === b.dataset.hide), n = lots.filter((l) => l.itemId === it.id).length
        if (n && !confirm(`${it.n} — 보관 중인 것이 ${n}건 있어요. 목록에서 빼도 기록은 남습니다. 뺄까요?`)) return
        const { error } = await sb.from('expiry_items').update({ active: false }).eq('id', it.id); if (error) return fail('품목 빼기', error)
        it.active = false; render(); toast(`${it.n} 뺐습니다`)
      })
      $('[data-additem]').onclick = async () => {
        let n = '새 품목', i = 2; while (items.some((x) => x.n === n)) n = `새 품목 ${i++}`
        const { data, error } = await sb.from('expiry_items').insert({ tenant_id: T, name: n, category: 'cold', how: 'label', keep_days: 7, unit: '개' }).select().single()
        if (error) return fail('품목 넣기', error)
        items.push(itemOf(data)); render(); const ins = $$('.tbl input[data-f=n]'); const last = ins.find((x) => x.dataset.i === data.id); if (last) last.select()
      }
      wireStarter(B)
    } else {
      const ym = TK.slice(0, 7), m = waste.filter((w) => (w.closedAt || '').slice(0, 7) === ym || dk(new Date(w.closedAt)).slice(0, 7) === ym)
      const amt = m.reduce((a, w) => a + item(w.itemId).p * w.q, 0), byR = {}; m.forEach((w) => byR[w.reason || '기타'] = (byR[w.reason || '기타'] || 0) + w.q)
      const W = waste.filter((w) => store === 'all' || w.store === store).sort((a, b) => a.closedAt < b.closedAt ? 1 : -1)
      B.innerHTML = `<div class="wtot"><div>이번 달 버린 것<b>${m.reduce((a, w) => a + w.q, 0)}개</b></div><div>금액(단가 기준)<b>${won(amt)}</b></div><div>가장 많은 이유<b>${esc(Object.entries(byR).sort((a, b) => b[1] - a[1])[0]?.[0] || '-')}</b></div></div>
        ${W.map((w) => { const it = item(w.itemId); return `<div class="wl"><span class="d">${md(dk(new Date(w.closedAt)))}</span><span><b>${esc(it.n)}</b> ${w.q}${esc(it.u)}</span><span class="w">${it.p ? won(it.p * w.q) : '-'}</span><small>${esc(w.reason || '')} · ${esc(sName(w.store))}${w.row.closed_by && names[w.row.closed_by] ? ' · ' + esc(names[w.row.closed_by]) : ''}</small></div>` }).join('') || '<div class="empty">버린 기록이 없어요</div>'}`
    }
    renderSide()
  }
  function starterBox() {
    const S = STARTER[industry]
    return `<div class="starter"><b>품목부터 넣어 주세요</b>${S ? `<span>업종 기본 품목 ${S.length}가지를 한 번에 넣고, 안 쓰는 건 빼면 돼요.</span><button data-starter>기본 품목 넣기</button>` : '<span>품목 탭에서 「+ 품목」 — 이름 · 보관 · 기한 정하는 법만 넣으면 돼요.</span>'}</div>`
  }
  function wireStarter(r) {
    const b = r.querySelector('[data-starter]'); if (!b) return
    b.onclick = async () => {
      b.disabled = true
      const rows = STARTER[industry].filter(([n]) => !items.some((i) => i.n === n)).map(([n, k, how, d, o, u, p, loc]) => ({ tenant_id: T, name: n, category: k, how, keep_days: d, open_days: o || null, unit: u, price: p, place: loc }))
      const { data, error } = await sb.from('expiry_items').insert(rows).select()
      if (error) { b.disabled = false; return fail('기본 품목', error) }
      items.push(...(data || []).map(itemOf)); tab = 'items'; render(); toast(`${rows.length}가지 넣었습니다 — 안 쓰는 건 「빼기」`)
    }
  }
  function lotRow(l, act) {
    const it = item(l.itemId), s = stat(l), snz = snoozed(l)
    const btns = act ? (s === 'over' ? `<button class="bin" data-bin="${l.id}">버림</button><button data-used="${l.id}">다 씀</button>`
      : `<button data-used="${l.id}">다 씀</button>${snz ? '' : `<button class="snz" data-snz="${l.id}">아직 있음</button>`}<button class="bin" data-bin="${l.id}">버림</button>`)
      : `${it.o && !l.opened ? `<button data-open="${l.id}">개봉</button>` : ''}<button data-used="${l.id}">다 씀</button>`
    const openDue = l.opened && it.o ? addD(l.opened, it.o) : null
    const dueTxt = openDue && openDue === due(l) ? `개봉 후 기한 ${md(due(l))}` : l.label ? `소비기한 ${md(due(l))}` : `${md(l.in)}+${it.d}일 → ${md(due(l))}`
    return `<div class="lot st-${s}"><div class="dd">${ddText(l)}</div>
      <div class="nm">${esc(it.n)} <span class="q">${l.q}${esc(it.u)}</span><span class="tagk k-${it.k}">${KIND[it.k]}</span>${l.opened ? '<span class="tago">개봉</span>' : ''}${snz ? '<span class="tago">아직 있음 · 내일 아침 다시</span>' : ''}</div>
      <div class="mt">${dueTxt} · ${esc(sName(l.store))}${it.loc ? ' ' + esc(it.loc) : ''} · <span class="who">${md(l.in)}${names[l.who] ? ' ' + esc(names[l.who]) : ''} 넣음</span></div>
      <div class="acts">${btns}</div></div>`
  }
  const L = (id) => lots.find((x) => x.id === id)
  async function patchLot(l, patch, what) {
    const { data, error } = await sb.from('expiry_lots').update(patch).eq('id', l.id).select().single()
    if (error) { fail(what, error); return null }
    return lotOf(data)
  }
  function wireLots(r) {
    r.querySelectorAll('[data-used]').forEach((b) => b.onclick = async () => {
      const l = L(b.dataset.used); const n = await patchLot(l, { status: 'used', closed_at: new Date().toISOString(), closed_by: ME }, '다 씀'); if (!n) return
      lots = lots.filter((x) => x !== l); render(); toast(`${item(l.itemId).n} 다 쓴 것으로 정리했습니다`)
    })
    r.querySelectorAll('[data-snz]').forEach((b) => b.onclick = async () => {
      const l = L(b.dataset.snz); const n = await patchLot(l, { snooze_until: addD(TK, 1) }, '아직 있음'); if (!n) return
      Object.assign(l, n); render(); toast(`${item(l.itemId).n} — 내일 아침에 한 번 더 물어볼게요`)
    })
    r.querySelectorAll('[data-open]').forEach((b) => b.onclick = async () => {
      const l = L(b.dataset.open); const n = await patchLot(l, { opened_on: TK }, '개봉'); if (!n) return
      Object.assign(l, n); render(); toast(`${item(l.itemId).n} 개봉 — 기한 ${md(l.due)}`)
    })
    r.querySelectorAll('[data-bin]').forEach((b) => b.onclick = () => openBin(L(b.dataset.bin)))
  }
  async function reloadLots() {
    const { data, error } = await sb.from('expiry_lots').select('*').eq('tenant_id', T).eq('status', 'active').order('due_on').limit(5000)
    if (!error) lots = (data || []).map(lotOf)
  }
  // 알림 — 실제로 보내는 것만(api/push-remind). 매장 컴퓨터 · 마감 체크 연결은 아직
  function renderSide() {
    const v = vis(), tm = v.filter((l) => diff(due(l)) === 1), td = v.filter((l) => diff(due(l)) === 0 && !snoozed(l)), ov = v.filter((l) => diff(due(l)) < 0)
    const nm = (a) => a.slice(0, 4).map((l) => `${item(l.itemId).n} ${l.q}${item(l.itemId).u}`).join(', ') + (a.length > 4 ? ` 외 ${a.length - 4}건` : '')
    const hr = new Date().getHours(), li = []
    if (td.length || ov.length) li.push(`<li${hr >= 9 ? ' style="opacity:.6"' : ''}><span class="w">오늘 09:00</span><span>${td.length ? `오늘까지 ${td.length}건 — ${esc(nm(td))}` : ''}${td.length && ov.length ? ' · ' : ''}${ov.length ? `기한 지난 ${ov.length}건 정리 전` : ''}</span><small>관리자에게${hr >= 9 ? ' 보냄' : ''}</small></li>`)
    if (tm.length) li.push(`<li${hr >= 18 ? ' style="opacity:.6"' : ''}><span class="w">오늘 18:00</span><span>내일까지 ${tm.length}건 — ${esc(nm(tm))}</span><small>관리자 · 오늘 그 매장 근무자에게${hr >= 18 ? ' 보냄' : ''}</small></li>`)
    const perm = typeof Notification !== 'undefined' && Notification.permission === 'granted'
    $('[data-alerts]').innerHTML = `<h2>알림<small>당일 아침 · 전날 저녁</small></h2><ul class="al">${li.join('') || '<li><span class="w">없음</span><span>보낼 알림 없음</span></li>'}</ul>
      ${perm ? '' : '<p class="hint" style="margin:10px 0 0">이 기기는 알림이 꺼져 있어요 — 내 계정 › 알림에서 켜면 폰으로 받아요</p>'}
      <p class="hint" style="margin:8px 0 0">캘린더의 보관기한 층에도 같은 날짜로 보여요. 「아직 있음」을 누른 것은 다음 날 아침에 다시 물어요.</p>`
    const ym = TK.slice(0, 7), m = waste.filter((w) => w.closedAt && dk(new Date(w.closedAt)).slice(0, 7) === ym && (store === 'all' || w.store === store)), by = {}
    m.forEach((w) => by[w.itemId] = (by[w.itemId] || 0) + w.q)
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 4), mx = top[0] ? top[0][1] : 1
    const amt = m.reduce((a, w) => a + item(w.itemId).p * w.q, 0)
    $('[data-wsum]').innerHTML = `<h2>이번 달 버린 것<small>${m.reduce((a, w) => a + w.q, 0)}개 · ${won(amt)}</small></h2><div class="bars">${top.map(([id, q]) => `<div class="bar"><span>${esc(item(id).n)}</span><span class="t"><i style="width:${q / mx * 100}%"></i></span><span class="v">${q}${esc(item(id).u)}</span></div>`).join('') || '<div class="empty">없음</div>'}</div>
      ${top[0] && top[0][1] >= 3 ? `<p class="hint" style="margin:10px 0 0">${esc(item(top[0][0]).n)}을(를) 가장 많이 버렸어요. 한 번에 들이는 양을 줄이면 버리는 게 줄어요.</p>` : ''}`
  }

  // ── 들어온 것 — 지난번과 같이 한 번에, 또는 누를 때마다 1개. 포장 날짜는 칩 한 번 ──
  function lastBatch(st) {
    const R = recent.filter((r) => r.store_id === st); if (!R.length) return null
    const d = R.map((r) => r.received_on).sort().pop(), lines = {}
    R.filter((r) => r.received_on === d).forEach((r) => { if (items.find((i) => i.id === r.item_id && i.active)) lines[r.item_id] = (lines[r.item_id] || 0) + (Number(r.qty) || 0) })
    return Object.keys(lines).length ? { d, lines } : null
  }
  function openIn() {
    if (!STORES.length) { toast('매장이 없어요'); return }
    let kf = 'all', q = '', cart = {}, lbl = {}, st = here || STORES[0].id
    const sc = sheet(`<div class="sheet" role="dialog" aria-modal="true" aria-label="들어온 것"><h2>들어온 것</h2><p class="sub">누를 때마다 1개. 포장 제품은 포장에 적힌 날짜를 칩으로 한 번.</p>
      <div class="storeln" data-stln></div><div data-again></div>
      <input class="srch" data-q placeholder="품목 찾기">
      <div class="kf" data-kf></div><div class="pick" data-pick></div><div class="cart" data-cart></div>
      <div class="sacts"><button data-x>닫기</button><button class="main" data-put disabled>넣기</button></div></div>`)
    const Q = (s) => sc.querySelector(s)
    const paintSt = () => {
      Q('[data-stln]').innerHTML = `${esc(sName(st))}에 넣어요${STORES.length > 1 ? ' · <button data-chst>바꾸기</button>' : ''}`
      const cs = Q('[data-chst]'); if (cs) cs.onclick = () => { const i = STORES.findIndex((s) => s.id === st); st = STORES[(i + 1) % STORES.length].id; paintSt() }
      const lb = lastBatch(st)
      Q('[data-again]').innerHTML = lb ? `<div class="again"><button data-ag><b>지난번과 같이</b><span>${md(lb.d)} · ${Object.entries(lb.lines).map(([id, x]) => `${esc(item(id).n)} ${x}`).join(' · ')}</span></button></div>` : ''
      const ag = Q('[data-ag]'); if (ag) ag.onclick = () => { Object.entries(lb.lines).forEach(([id, x]) => cart[id] = x); paint() }
    }
    const chips = (id) => {
      const it = item(id), cur = lbl[id] || addD(TK, it.d)
      const opts = [...new Set([1, 2, 3, 5, 7, it.d, 10, 14, 30].filter((x) => x <= Math.max(it.d * 2, 14)))].sort((a, b) => a - b).slice(0, 7)
      return `<div class="chips"><span class="cl">포장 날짜</span>${opts.map((x) => { const d = addD(TK, x); return `<button data-c="${id}" data-d="${d}" aria-pressed="${cur === d}">${md(d).replace(/\(.\)/, '')}${x === it.d ? ' 보통' : ''}</button>` }).join('')}<input type="date" value="${cur}" data-l="${id}" aria-label="${esc(it.n)} 포장 날짜 직접"></div>`
    }
    const paint = () => {
      Q('[data-kf]').innerHTML = [['all', '전체'], ...Object.entries(KIND)].map(([k, n]) => `<button data-k="${k}" aria-pressed="${kf === k}">${n}</button>`).join('')
      const Lst = items.filter((it) => it.active && (kf === 'all' || it.k === kf) && (!q || it.n.includes(q)))
      Q('[data-pick]').innerHTML = Lst.map((it) => `<button class="${cart[it.id] ? 'on' : ''}" data-n="${it.id}"><b>${esc(it.n)}</b><small>${KIND[it.k]} · ${it.how === 'label' ? '포장 날짜' : it.d + '일'}</small>${cart[it.id] ? `<span class="cnt">${cart[it.id]}</span>` : ''}</button>`).join('') || `<div class="empty">${items.length ? '찾는 품목이 없어요 — 품목 탭에서 먼저 넣어 주세요' : '품목이 없어요 — 품목 탭에서 먼저 넣어 주세요'}</div>`
      const ks = Object.keys(cart)
      Q('[data-cart]').innerHTML = ks.length ? ks.map((id) => { const it = item(id); return `<div class="ci"><b>${esc(it.n)}</b><span class="stp"><button data-m="${id}" aria-label="빼기">−</button><span>${cart[id]}</span><button data-p="${id}" aria-label="더하기">+</button></span>${it.how === 'label' ? chips(id) : `<small>${it.d}일 뒤 · ${md(addD(TK, it.d))}까지</small>`}</div>` }).join('') : '<div class="hint">고른 것이 여기 모여요</div>'
      Q('[data-put]').disabled = !ks.length; Q('[data-put]').textContent = ks.length ? `${ks.length}가지 넣기` : '넣기'
      sc.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { kf = b.dataset.k; paint() })
      sc.querySelectorAll('.pick [data-n]').forEach((b) => b.onclick = () => { cart[b.dataset.n] = (cart[b.dataset.n] || 0) + 1; paint() })
      sc.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { cart[b.dataset.p]++; paint() })
      sc.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { if (--cart[b.dataset.m] <= 0) { delete cart[b.dataset.m]; delete lbl[b.dataset.m] } paint() })
      sc.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { lbl[b.dataset.c] = b.dataset.d; paint() })
      sc.querySelectorAll('[data-l]').forEach((inp) => inp.onchange = () => { if (inp.value) lbl[inp.dataset.l] = inp.value; paint() })
    }
    Q('[data-q]').oninput = (e) => { q = e.target.value.trim(); paint() }
    Q('[data-put]').onclick = async () => {
      const ks = Object.keys(cart); const b = Q('[data-put]'); b.disabled = true
      const rows = ks.map((id) => { const it = item(id); return { tenant_id: T, store_id: st, item_id: id, received_on: TK, qty: cart[id], label_date: it.how === 'label' ? (lbl[id] || addD(TK, it.d)) : null, created_by: ME } })
      const { data, error } = await sb.from('expiry_lots').insert(rows).select()
      if (error) { b.disabled = false; return fail('들어온 것', error) }
      lots.push(...(data || []).map(lotOf)); here = st; sc.remove(); tab = 'now'; filt = 'urgent'; render()
      toast(`${ks.length}가지 넣었습니다 · 기한 전날 저녁에 알려드려요`); askOld(ks, st)
    }
    paintSt(); paint(); setTimeout(() => Q('[data-q]').focus(), 30)
  }
  // 같은 품목이 새로 들어오면 이전 것 확인 — 먼저 들어온 것부터 쓰도록
  function askOld(ids, st) {
    const old = lots.filter((l) => ids.includes(l.itemId) && l.in < TK && l.store === st).sort((a, b) => a.in < b.in ? -1 : 1)
    if (!old.length) return
    const sc = sheet(`<div class="sheet" role="dialog" aria-modal="true" aria-label="이전 것 확인"><h2>이전에 들어온 것은요?</h2><p class="sub">새로 들어온 것보다 먼저 써야 해요. 남아 있으면 그대로 두세요.</p>
      ${old.map((l) => `<div class="ci" style="padding:8px 0;border-top:1px solid var(--line)"><b>${esc(item(l.itemId).n)} ${l.q}${esc(item(l.itemId).u)}</b><span class="stp" style="border:0;gap:6px"><button data-u="${l.id}" style="width:auto;padding:0 12px;border:1px solid var(--line);border-radius:8px;height:32px">다 씀</button><button data-k2="${l.id}" style="width:auto;padding:0 12px;border:1px solid var(--line);border-radius:8px;height:32px">남음</button></span><small>${md(l.in)} 들어옴 · 기한 ${md(due(l))}</small></div>`).join('')}
      <div class="sacts"><button class="main" data-x>확인</button></div></div>`)
    sc.querySelectorAll('[data-u]').forEach((b) => b.onclick = async () => {
      const l = L(b.dataset.u); const n = await patchLot(l, { status: 'used', closed_at: new Date().toISOString(), closed_by: ME }, '다 씀'); if (!n) return
      lots = lots.filter((x) => x !== l); b.closest('.ci').style.opacity = 0.4; b.parentNode.innerHTML = '<span class="hint">다 씀</span>'; render()
    })
    sc.querySelectorAll('[data-k2]').forEach((b) => b.onclick = () => { b.closest('.ci').style.opacity = 0.4; b.parentNode.innerHTML = '<span class="hint">남음</span>' })
  }
  // 버림 — 이유 한 번. 일부만 버리면 그만큼 떼어 기록하고 나머지는 그대로
  function openBin(l) {
    const it = item(l.itemId); let r = stat(l) === 'over' ? '기한 지남' : '', q = l.q
    const sc = sheet(`<div class="sheet" role="dialog" aria-modal="true" aria-label="버림"><h2>${esc(it.n)} 버림</h2><p class="sub">기한 ${md(due(l))} · ${esc(sName(l.store))}</p>
      <div class="hint">이유</div><div class="rs">${REASONS.map((x) => `<button data-r="${x}" aria-pressed="${x === r}">${x}</button>`).join('')}</div>
      <div class="row"><span class="hint">수량</span><span class="stp"><button data-m aria-label="빼기">−</button><span data-bq>${q}</span><button data-p aria-label="더하기">+</button></span><span class="hint">/ ${l.q}${esc(it.u)}</span></div>
      <div class="sacts"><button data-x>취소</button><button class="main" data-go${r ? '' : ' disabled'}>버림으로 기록</button></div></div>`)
    const Q = (s) => sc.querySelector(s)
    const paint = () => { sc.querySelectorAll('[data-r]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.r === r)); Q('[data-bq]').textContent = q; Q('[data-go]').disabled = !r }
    sc.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { r = b.dataset.r; paint() })
    Q('[data-p]').onclick = () => { q = Math.min(l.q, q + 1); paint() }; Q('[data-m]').onclick = () => { q = Math.max(1, q - 1); paint() }
    Q('[data-go]').onclick = async () => {
      Q('[data-go]').disabled = true
      const closed = { status: 'discarded', discard_reason: r, closed_at: new Date().toISOString(), closed_by: ME }
      if (q >= l.q) {
        const n = await patchLot(l, closed, '버림'); if (!n) { Q('[data-go]').disabled = false; return }
        lots = lots.filter((x) => x !== l); waste.push(n)
      } else {
        const rw = l.row
        const ins = await sb.from('expiry_lots').insert({ tenant_id: T, store_id: rw.store_id, item_id: rw.item_id, received_on: rw.received_on, qty: q, label_date: rw.label_date, opened_on: rw.opened_on, created_by: rw.created_by, ...closed }).select().single()
        if (ins.error) { Q('[data-go]').disabled = false; return fail('버림', ins.error) }
        const n = await patchLot(l, { qty: l.q - q }, '남은 수량'); if (!n) { Q('[data-go]').disabled = false; return }
        Object.assign(l, n); waste.push(lotOf(ins.data))
      }
      sc.remove(); render(); toast(`${it.n} ${q}${it.u} 버림 — ${r}`)
    }
  }

  // ── 움직이기 ──
  $('[data-store]').onchange = (e) => { store = e.target.value; if (store !== 'all') here = store; render() }
  $$('[data-tab] button').forEach((b) => b.onclick = () => { tab = b.dataset.t; render() })
  $('[data-in]').onclick = () => openIn()
  try { await load(); $('[data-err]').innerHTML = '' } catch (e) { console.warn('[exp] load', e); $('[data-err]').innerHTML = `<div class="st-err">보관기한을 불러오지 못했어요 — ${esc(e.message || e)}. 잠시 뒤 다시 열어 주세요</div>` }
  if (host.tab) tab = host.tab
  render()
  return { close }
}
