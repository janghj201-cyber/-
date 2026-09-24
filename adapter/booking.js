// 고객 예약 — 매장 화면 (v6.12). 확인 필요 · 시간표 · 전화 · 방문 예약 · 네이버 알림 붙여넣기 · 받는 방법(설정).
// 승인된 시안(booking-sample v2)을 앱 안으로. 표: booking_resources(칸) · booking_services(시술) · appointments(kind=booking) · guests ·
// booking_waitlist · naver_product_map · booking_pages. 손님 페이지는 lp/book.html(로그인 없음, booking_public_* 함수만).
// 빈 시간 계산은 adapter/bookslots.js 한 곳 — 손님 페이지와 같은 규칙. 설정은 tenant_settings.extra.booking.
// 문자 발송 계약 전이라 확정 · 제안 · 변경 안내는 폰 문자 앱을 내용 채운 채로 연다(복사도 가능).
import { supabase as sb } from './supabase-client.js'
import { getContext } from './context.js'
import { slotsFor, openHours, dk, addD, hm, dowOf, holdOf, ACTIVE } from './bookslots.js'

const CSS = `#vbook{--ink:var(--text);--sub:var(--text-sub);--mute:var(--text-mute);--line:var(--border);--hover:var(--soft);
  --deep:var(--navy);--tint:var(--green-light);--on-main:#fff;
  --ok:#1E63C4;--ok-bg:#E2EFFE;--req:#8E5A06;--req-bg:#FEEFCF;--late:#B42A1F;--late-bg:#FBE7E4;--off:#6B7780;--off-bg:#E8EBEE;--pur:#6A3FCB;--pur-bg:#ECE5FE;
  position:fixed;inset:0;z-index:900;background:var(--bg);color:var(--ink);overflow-y:auto;overscroll-behavior:contain;font-size:14px;line-height:1.55;}
html[data-bright=dark] #vbook{--ok:#7FB0F2;--ok-bg:#1A2B42;--req:#EDB25A;--req-bg:#35280F;--late:#F08A80;--late-bg:#3A1D1A;--off:#9AA6AE;--off-bg:#232C31;--pur:#B49CF4;--pur-bg:#261F3E;}
#vbook *{box-sizing:border-box}
#vbook button,#vbook select,#vbook input,#vbook textarea{font:inherit;color:inherit}
#vbook button{cursor:pointer}
#vbook button:disabled{cursor:default}
#vbook :focus-visible{outline:2px solid var(--green);outline-offset:2px}
#vbook [hidden]{display:none!important}
#vbook .wrap{max-width:1320px;margin:0 auto;padding:14px 16px calc(48px + var(--safe-bot,0px))}
#vbook .tabs{margin-bottom:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
#vbook .tabs select{height:36px;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:0 10px;font-size:13px}
#vbook .st-err{background:var(--late-bg);color:var(--late);border-radius:10px;padding:8px 12px;font-size:13px;font-weight:600;margin-bottom:10px}
#vbook .loading{font-size:13px;color:var(--mute);padding:40px 0;text-align:center}
#vbook .sacts button{display:grid;place-items:center;padding:0 10px}
#vbook .setup{border:1.5px dashed var(--line);border-radius:14px;padding:16px;display:grid;gap:8px;justify-items:start;font-size:13.5px;color:var(--sub)}
#vbook .setup b{color:var(--ink);font-size:15px}
#vbook .setup button{border:0;background:var(--deep);color:var(--on-main);border-radius:10px;padding:9px 14px;font-weight:700}
#vbook .sr input.tx,#vbook .sr select.tx{border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--card);font-size:13px;min-width:0}
#vbook .rrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
#vbook .mini{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:5px 10px;font-size:12.5px;font-weight:700}
#vbook .msgbox{white-space:pre-wrap;background:var(--soft);border-radius:12px;padding:12px;font-size:13.5px;line-height:1.6;margin-top:10px}
#vbook .svt input[type=number]{border:1px solid var(--line);border-radius:8px;padding:4px 6px;background:var(--card);font-size:13px;width:54px}
#vbook .svtw{overflow-x:auto;max-width:100%}
#vbook .svt td:first-child{min-width:130px}
#vbook .svt td:nth-child(4) select{min-width:110px}
#vbook .svt td:last-child .mini{white-space:nowrap}
#vbook .seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card)}
#vbook .seg button{border:0;background:transparent;padding:0 14px;height:36px;font-weight:700;font-size:13px;color:var(--sub);display:inline-flex;gap:6px;align-items:center}
#vbook .seg button[aria-pressed=true]{background:var(--deep);color:var(--on-main)}
#vbook .badge{min-width:18px;height:18px;border-radius:9px;background:var(--late);color:#fff;font-size:11px;display:inline-grid;place-items:center;padding:0 5px}
#vbook .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;min-width:0}
#vbook .hint{font-size:12px;color:var(--mute)}
#vbook .store{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
@media(min-width:1080px){
#vbook .store{grid-template-columns:minmax(0,1fr) 360px;grid-template-rows:auto auto auto 1fr}
#vbook .store>.mainc{grid-column:1;grid-row:1 / span 4}
#vbook .store>.panel{grid-column:2}
}
@media(max-width:1079px){
#vbook .store>.p-todo{order:-1}
}
#vbook .top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
#vbook .top h1{font-size:22px;margin:0;letter-spacing:-.02em}
#vbook .top .sum{font-size:13px;color:var(--sub);margin-top:2px}
#vbook .btn{height:38px;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:0 14px;font-weight:700;display:inline-flex;gap:6px;align-items:center}
#vbook .btn svg{width:15px;height:15px}
#vbook .btn.main{border:0;background:var(--deep);color:var(--on-main)}
#vbook .days{display:flex;gap:6px;overflow-x:auto;padding:14px 0 10px;scrollbar-width:thin}
#vbook .days button{flex:none;min-width:62px;padding-inline:4px!important;border:1px solid var(--line);background:var(--card);border-radius:12px;padding:6px 0 7px;display:grid;justify-items:center;gap:1px;font-size:12px;color:var(--sub)}
#vbook .days button b{font-size:16px;color:var(--ink);font-variant-numeric:tabular-nums}
#vbook .days button .c{font-size:11px;font-weight:700;color:var(--ok)}
#vbook .days button .c.r{color:var(--req)}
#vbook .days button.su b,#vbook .days button.hl b{color:var(--late)}
#vbook .days button.cl{background:var(--soft);border-style:dashed}
#vbook .days button[aria-pressed=true]{border-color:var(--deep);box-shadow:inset 0 0 0 1px var(--deep)}
#vbook .closed{border-radius:12px;background:var(--soft);padding:14px;font-size:13.5px;color:var(--sub);margin-bottom:10px}
#vbook .closed b{color:var(--ink)}
#vbook .tw{overflow-x:auto;border:1px solid var(--line);border-radius:12px}
#vbook .tg{display:grid;min-width:max-content}
#vbook .tg .hd{position:sticky;top:0;background:var(--soft);font-size:12.5px;font-weight:700;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
#vbook .tg .hd small{font-weight:500;color:var(--mute);margin-left:4px}
#vbook .tg .tc{position:relative;border-left:1px solid var(--line)}
#vbook .tg .tl{position:relative}
#vbook .tg .tl span:first-child{transform:none}
#vbook .tg .tl span:last-child{transform:translateY(-15px)}
#vbook .tg .tl span{position:absolute;right:8px;font-size:11px;color:var(--mute);font-variant-numeric:tabular-nums;transform:translateY(-7px)}
#vbook .tg .ln{position:absolute;left:0;right:0;border-top:1px solid var(--line)}
#vbook .tg .ln.h{border-top-style:dashed;opacity:.6}
#vbook .tg .brk{position:absolute;left:0;right:0;background:repeating-linear-gradient(135deg,var(--soft) 0 6px,transparent 6px 12px);font-size:11px;color:var(--mute);display:grid;place-items:center}
#vbook .now{position:absolute;left:0;right:0;border-top:2px solid var(--late);z-index:3;pointer-events:none}
#vbook .now::before{content:"";position:absolute;left:-4px;top:-5px;width:8px;height:8px;border-radius:50%;background:var(--late)}
#vbook .bk{position:absolute;left:4px;right:4px;border-radius:8px;padding:3px 8px;text-align:left;border:1px solid transparent;overflow:hidden;font-size:12px;line-height:1.35;z-index:2;display:block}
#vbook .bk b{font-size:12.5px}
#vbook .bk .t{font-variant-numeric:tabular-nums;font-weight:700;margin-right:4px}
#vbook .bk small{display:block;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#vbook .bk.ok{background:var(--ok-bg);color:var(--ink)}
#vbook .bk.ok .t{color:var(--ok)}
#vbook .bk.req,#vbook .bk.offer{background:var(--card);border:1.5px dashed var(--req)}
#vbook .bk.req .t,#vbook .bk.offer .t{color:var(--req)}
#vbook .bk.done{background:var(--soft);color:var(--sub)}
#vbook .bk.noshow{background:var(--late-bg);color:var(--late)}
#vbook .bk.noshow b{text-decoration:line-through}
#vbook .bk .flag{float:right;font-size:10.5px;font-weight:800;border-radius:5px;padding:0 5px;margin-left:4px}
#vbook .flag.q{background:var(--req-bg);color:var(--req)}
#vbook .flag.n{background:var(--late-bg);color:var(--late)}
#vbook .flag.d{background:var(--card);color:var(--sub)}
#vbook .bk.half{left:4px;right:auto;width:calc(50% - 6px)}
#vbook .bk.half2{left:calc(50% + 2px);right:4px}
#vbook .legend{display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--sub);margin-top:10px}
#vbook .legend i{display:inline-block;width:12px;height:12px;border-radius:4px;vertical-align:-2px;margin-right:4px}
#vbook .panel h2{font-size:15px;margin:0 0 10px;display:flex;justify-content:space-between;gap:8px;align-items:baseline}
#vbook .panel h2 small{font-size:12px;color:var(--mute);font-weight:500}
#vbook .todo{display:grid;gap:8px}
#vbook .it{border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:grid;gap:4px}
#vbook .it .k{font-size:11.5px;font-weight:800}
#vbook .it .k.q{color:var(--req)}
#vbook .it .k.n{color:var(--late)}
#vbook .it .k.c{color:var(--pur)}
#vbook .it .k.o{color:var(--green)}
#vbook .it .k.w{color:var(--sub)}
#vbook .it b{font-size:14px}
#vbook .it .m{font-size:12.5px;color:var(--sub)}
#vbook .it .tags{display:flex;gap:4px;flex-wrap:wrap}
#vbook .tag{font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px;background:var(--soft);color:var(--sub)}
#vbook .tag.nvt{background:var(--off-bg);color:var(--off)}
#vbook .nvt2{width:100%;min-height:110px;border:1.5px solid var(--line);border-radius:10px;padding:9px 10px;font-size:13px;background:var(--card);resize:vertical}
#vbook .nvl{display:grid;gap:6px;margin-top:10px}
#vbook .nvr{border:1px solid var(--line);border-radius:10px;padding:8px 10px;display:grid;gap:3px;font-size:13px}
#vbook .nvr .k{font-size:11.5px;font-weight:800}
#vbook .nvr .k.ka{color:var(--green)}
#vbook .nvr .k.kx{color:var(--late)}
#vbook .nvr .k.ks{color:var(--mute)}
#vbook .nvr.skip{opacity:.65}
#vbook .nvr select{border:1px solid var(--line);border-radius:8px;padding:4px 6px;background:var(--card);font-size:13px}
#vbook .nvr .w{color:var(--late);font-weight:700;font-size:12.5px}
#vbook .nvr label{font-size:12px;color:var(--sub);display:flex;gap:5px;align-items:center}
#vbook .tag.new{background:var(--req-bg);color:var(--req)}
#vbook .tag.ns{background:var(--late-bg);color:var(--late)}
#vbook .tag.vip{background:var(--tint);color:var(--green)}
#vbook .it .ac{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
#vbook .it .ac button,#vbook .it .ac a{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:5px 10px;font-size:12.5px;font-weight:700;text-decoration:none;color:var(--ink)}
#vbook .it .ac .p{background:var(--deep);border-color:var(--deep);color:var(--on-main)}
#vbook .it .rs{display:flex;gap:5px;flex-wrap:wrap}
#vbook .it .rs button{border:1px solid var(--line);background:var(--soft);border-radius:999px;padding:3px 9px;font-size:12px;font-weight:600}
#vbook .empty{font-size:13px;color:var(--mute);padding:6px 0}
#vbook .link{display:flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:6px 6px 6px 10px;font-size:13px;font-variant-numeric:tabular-nums}
#vbook .link span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#vbook .link button{border:0;background:var(--soft);border-radius:8px;padding:5px 10px;font-weight:700;font-size:12.5px}
#vbook .wl{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:13px}
#vbook .wl li{display:flex;justify-content:space-between;gap:8px}
#vbook .wl small{color:var(--mute)}
#vbook .set{display:grid;gap:12px;max-width:1080px}
#vbook .sr{display:grid;grid-template-columns:200px minmax(0,1fr);gap:6px 16px;padding:14px 0;border-top:1px solid var(--line)}
#vbook .sr:first-of-type{border-top:0}
#vbook .sr>b{font-size:14px}
#vbook .sr>b small{display:block;font-weight:500;font-size:12px;color:var(--mute);margin-top:2px}
#vbook .opt{display:flex;flex-wrap:wrap;gap:6px}
#vbook .opt button{border:1.5px solid var(--line);background:var(--card);border-radius:10px;padding:6px 12px;font-size:13px;font-weight:700;color:var(--sub);text-align:left}
#vbook .opt button small{display:block;font-weight:500;font-size:11.5px;color:var(--mute)}
#vbook .opt button[aria-pressed=true]{border-color:var(--green);background:var(--tint);color:var(--ink)}
#vbook .svt{width:100%;border-collapse:collapse;font-size:13px}
#vbook .svt th{white-space:nowrap;text-align:left;font-size:12px;color:var(--mute);font-weight:600;padding:4px 6px;border-bottom:1px solid var(--line)}
#vbook .svt td{white-space:nowrap;padding:6px;border-bottom:1px solid var(--line)}
#vbook .svt select,#vbook .svt input[type=text]{border:1px solid var(--line);border-radius:8px;padding:4px 6px;background:var(--card);font-size:13px;width:100%}
#vbook .svt input[type=checkbox]{width:17px;height:17px;accent-color:var(--green)}
#vbook .later{opacity:.7}
@media(max-width:700px){
#vbook .sr{grid-template-columns:minmax(0,1fr)}
}
#vbook .scrim{position:fixed;inset:0;background:rgba(8,16,12,.45);display:grid;place-items:end center;z-index:20}
@media(min-width:700px){
#vbook .scrim{place-items:center;padding:16px}
}
#vbook .sheet{background:var(--card);width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px))}
@media(min-width:700px){
#vbook .sheet{border-radius:18px}
}
#vbook .sheet h2{margin:0 0 2px;font-size:19px}
#vbook .shd{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:6px}
#vbook .x{border:0;background:var(--soft);border-radius:9px;width:34px;height:34px;font-size:18px;flex:none}
#vbook .kv{display:grid;grid-template-columns:80px minmax(0,1fr);gap:6px 10px;font-size:13.5px;margin:10px 0}
#vbook .kv dt{color:var(--mute)}
#vbook .kv dd{margin:0}
#vbook .kv a{color:var(--ok);font-weight:700;text-decoration:none;font-variant-numeric:tabular-nums}
#vbook .sec{font-size:12.5px;font-weight:700;color:var(--sub);margin:14px 0 6px}
#vbook .log{list-style:none;margin:0;padding:0;display:grid;gap:5px;font-size:12.5px;color:var(--sub)}
#vbook .log b{color:var(--ink);font-weight:600}
#vbook .sacts{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
#vbook .sacts button{flex:1;min-width:90px;height:44px;border-radius:12px;font-weight:700;border:1px solid var(--line);background:var(--card)}
#vbook .sacts .main{background:var(--deep);border-color:var(--deep);color:var(--on-main)}
#vbook .sacts .main:disabled{background:var(--line);border-color:var(--line);color:var(--mute)}
#vbook .sacts .warn{color:var(--late)}
#vbook .same{display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13.5px}
#vbook .same input{width:17px;height:17px;accent-color:var(--green)}
#vbook .toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--bg);font-size:13px;font-weight:600;padding:9px 14px;border-radius:10px;z-index:40;max-width:calc(100% - 32px);display:flex;gap:10px;align-items:center}
#vbook .toast button{border:0;background:transparent;color:var(--bg);font-weight:800;text-decoration:underline}
@media(max-width:640px){
#vbook .card{padding:14px 12px}
#vbook .top .btn{flex:1}
}
#vbook .svc button[aria-pressed=true],#vbook .chp button[aria-pressed=true]{border-color:var(--green);background:var(--tint)}
#vbook .chp{display:flex;flex-wrap:wrap;gap:6px}
#vbook .chp button{border:1.5px solid var(--line);background:var(--card);border-radius:10px;padding:7px 12px;font-weight:700;font-size:13.5px;font-variant-numeric:tabular-nums}
#vbook .chp button:disabled{opacity:.4;text-decoration:line-through}
#vbook .cd{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
#vbook .cd button{flex:none;width:52px;border:1.5px solid var(--line);background:var(--card);border-radius:12px;padding:6px 0;display:grid;justify-items:center;font-size:11.5px;color:var(--sub)}
#vbook .cd button b{font-size:16px;color:var(--ink)}
#vbook .cd button:disabled{background:var(--soft);border-style:dashed;opacity:.75}
#vbook .cd button:disabled b{color:var(--mute)}
#vbook .cd button[aria-pressed=true]{border-color:var(--green);background:var(--tint)}
#vbook .cd button.su b{color:var(--late)}
#vbook .fl{display:grid;gap:5px;margin-bottom:10px;font-size:12.5px;font-weight:700;color:var(--sub)}
#vbook .fl input,#vbook .fl select,#vbook .fl textarea{border:1.5px solid var(--line);background:var(--card);border-radius:10px;padding:10px 11px;font-size:15px;width:100%;min-width:0;color:var(--ink);font-weight:400}
#vbook .nope{font-size:13px;color:var(--sub);background:var(--soft);border-radius:10px;padding:10px 12px;display:grid;gap:6px}
#vbook .nope button{justify-self:start;border:1px solid var(--line);background:var(--card);border-radius:8px;padding:5px 10px;font-weight:700;font-size:12.5px}
#vbook .sms{width:100%;background:var(--soft);border-radius:14px 14px 14px 4px;padding:10px 12px;font-size:12.5px;line-height:1.5;color:var(--ink)}
#vbook .sms small{display:block;color:var(--mute);margin-bottom:2px}
#vbook .sms .lk{color:var(--ok);font-weight:700}`

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const md = (k) => { const d = new Date(k + 'T00:00'); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})` }
const digits = (v) => String(v || '').replace(/\D/g, '')
const fmtPh = (v) => { const d = digits(v).slice(0, 11); if (!d) return ''; if (d.startsWith('02')) return d.replace(/^(02)(\d{0,4})(\d{0,4}).*/, (m, a, b, c) => [a, b, c].filter(Boolean).join('-')); return d.replace(/^(\d{0,3})(\d{0,4})(\d{0,4}).*/, (m, a, b, c) => [a, b, c].filter(Boolean).join('-')) }
const durTx = (m) => m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`
const minOf = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }
const SRC = { link: '예약 링크', phone: '전화', walkin: '방문', naver: '네이버', kakao: '카톡', staff: '직접' }
const DEF = { rule: 'known', range: 14, lead: 120, chg: 'eve', wait: 1, closed_holidays: false, nvUse: 'none', nvConf: 'auto', review: 1, review_url: '' }
const IC = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="13" height="13" style="vertical-align:-2px" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
}

// 네이버 예약 알림 읽기 — 스마트플레이스 알림 문구. 사진에서 뽑은 글자는 띄어쓰기가 깨지므로(예 약이) 글자 사이 공백 허용, 연도는 요일이 맞는 해
const nvSp = (w) => w.split('').join('\\s*')
const NV_RE = new RegExp(`([가-힣A-Za-z*○]{1,12})\\s*님\\s*,\\s*(.+?)\\s*,\\s*(\\d{1,2})\\s*\\.\\s*(\\d{1,2})\\s*\\.?\\s*\\(\\s*([일월화수목금토])\\s*\\)\\s*(오전|오후)\\s*(\\d{1,2})\\s*:\\s*(\\d{2})\\s*${nvSp('예약이')}\\s*(${['접수', '확정', '취소', '변경'].map(nvSp).join('|')})`, 'g')
export function nvParse(txt, today) {
  const t = String(txt || '').replace(/\s+/g, ' '), out = []; let m; NV_RE.lastIndex = 0
  while ((m = NV_RE.exec(t))) {
    let [, name, item, mo, d, dw, ap, h, mi, act] = m; act = act.replace(/\s/g, ''); h = (+h % 12) + (ap === '오후' ? 12 : 0)
    const y0 = today.getFullYear(), y = [y0, y0 + 1, y0 - 1].find((yy) => DOW[new Date(yy, mo - 1, d).getDay()] === dw)
    out.push({ act, name, item: item.trim(), date: y ? dk(new Date(y, mo - 1, d)) : null, t: h * 60 + +mi })
  }
  const labels = (t.match(new RegExp(nvSp('네이버예약'), 'g')) || []).length
  return { list: out, other: Math.max(0, labels - out.length) }
}

export async function openBooking(host = {}) {
  if (document.getElementById('vbook')) return
  const ctx = await getContext()
  const T = ctx.tenantId, ME = ctx.profileId
  const isAdmin = ['owner', 'manager'].includes(ctx.profile?.role)
  const STORES = ((host.stores && host.stores.length) ? host.stores : (ctx.stores || [])).map((s) => ({ id: s.id, name: s.name }))
  const sName = (id) => (STORES.find((s) => s.id === id) || {}).name || ''
  const CO = host.co || ''
  const ORIGIN = location.origin
  let S = { ...DEF, ...(host.booking || {}) }
  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)
  const TK = dk(TODAY)
  const myStore = (window.__vflowProfile || {}).storeId
  let store = STORES.find((s) => s.id === myStore) ? myStore : (STORES[0] || {}).id
  let tab = 'store', day = TK
  let resources = [], services = [], appts = [], guests = [], waits = [], pages = [], nvmap = [], closures = [], holidays = [], profiles = []
  let alerts = [], aseq = 0

  const root = document.createElement('div'); root.id = 'vbook'
  root.innerHTML = `<style>${CSS}</style>
  <div class="header" style="position:sticky;top:0;z-index:10;"><div><div class="header-title">고객 예약</div><div class="header-sub">확인 필요 · 시간표 · 받는 방법</div></div><button class="back-btn" type="button" data-close>닫기</button></div>
  <div class="wrap"><div data-err></div>
    <div class="tabs"><div class="seg" data-tab><button data-t="store">매장 화면<span class="badge" data-tb hidden></span></button><button data-t="set">받는 방법</button></div>${STORES.length > 1 ? '<select data-store aria-label="매장"></select>' : ''}</div>
    <div data-view><div class="loading">불러오는 중…</div></div>
  </div>`
  const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)]
  document.body.appendChild(root)
  const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
  const toast = (t, act) => { const o = root.querySelector('.toast'); if (o) o.remove(); const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `<span>${esc(t)}</span>${act ? `<button>${esc(act.t)}</button>` : ''}`; root.appendChild(d); if (act) d.querySelector('button').onclick = () => { d.remove(); act.f() }; setTimeout(() => d.remove(), act ? 4500 : 2600) }
  const fail = (what, e) => { console.warn('[book]', what, e); toast(`${what} — 저장하지 못했어요. ${e && e.message ? e.message.slice(0, 60) : '인터넷을 확인하고 다시 해 주세요'}`) }
  const onKey = (e) => { if (e.key !== 'Escape') return; const sc = root.querySelector('.scrim'); if (sc) { sc.remove(); return } close() }
  const close = () => { document.removeEventListener('keydown', onKey); root.remove(); document.body.style.overflow = prevOverflow; try { host.onClose && host.onClose() } catch (e) {} }
  document.addEventListener('keydown', onKey)
  $('[data-close]').onclick = close
  const sheet = (html) => { const sc = document.createElement('div'); sc.className = 'scrim'; sc.innerHTML = `<form class="sheet" role="dialog" aria-modal="true">${html}</form>`; root.appendChild(sc); sc.onclick = (ev) => { if (ev.target === sc) sc.remove() }; return sc }

  // ── 불러오기 ──
  async function load() {
    const from = new Date(addD(TK, -7) + 'T00:00').toISOString(), to = new Date(addD(TK, 62) + 'T00:00').toISOString()
    const q = await Promise.all([
      sb.from('booking_resources').select('*').eq('tenant_id', T).order('sort').limit(500),
      sb.from('booking_services').select('*').eq('tenant_id', T).order('sort').limit(500),
      sb.from('appointments').select('*').eq('tenant_id', T).eq('kind', 'booking').gte('starts_at', from).lte('starts_at', to).order('starts_at').limit(5000),
      sb.from('guests').select('*').eq('tenant_id', T).order('name').limit(5000),
      sb.from('booking_waitlist').select('*').eq('tenant_id', T).gte('want_date', TK).limit(1000),
      sb.from('booking_pages').select('*').eq('tenant_id', T),
      sb.from('naver_product_map').select('*').eq('tenant_id', T),
      sb.from('store_closures').select('store_id,close_date,label').eq('tenant_id', T).gte('close_date', addD(TK, -7)).lte('close_date', addD(TK, 62)),
      sb.from('public_holidays').select('date,label').gte('date', TK).lte('date', addD(TK, 62)),
      sb.from('profiles').select('id,name,status').eq('tenant_id', T).order('name').limit(1000),
    ])
    const bad = q.slice(0, 7).find((r) => r.error); if (bad) throw bad.error
    resources = q[0].data || []; services = q[1].data || []; appts = q[2].data || []; guests = q[3].data || []; waits = q[4].data || []
    pages = q[5].data || []; nvmap = q[6].data || []; closures = q[7].data || []; holidays = q[8].data || []
    profiles = (q[9].data || []).filter((p) => p.status !== 'inactive' && p.status !== 'left')
  }
  const hoursOf = (sid) => { try { return host.hours ? host.hours(sid) : { open: '10:00', close: '22:00', off: [] } } catch (e) { return { open: '10:00', close: '22:00', off: [] } } }
  const closedSet = (sid) => new Set([...closures.filter((c) => !c.store_id || c.store_id === sid).map((c) => c.close_date), ...(S.closed_holidays ? holidays.map((h) => h.date) : [])])
  const closedLabel = (sid, k) => (closures.find((c) => c.close_date === k && (!c.store_id || c.store_id === sid)) || {}).label || (S.closed_holidays ? (holidays.find((h) => h.date === k) || {}).label : '') || ''
  const RES = () => resources.filter((r) => r.store_id === store && r.active !== false)
  const SVCS = () => services.filter((s) => s.active !== false && (!s.store_id || s.store_id === store))
  const svcOf = (a) => services.find((s) => s.id === a.service_id) || { name: a.title || '예약', duration_min: a.duration_min || 60 }
  const resName = (id) => (resources.find((r) => r.id === id) || {}).name || ''
  const guestOf = (a) => guests.find((g) => g.id === a.guest_id) || { name: (a.extra && a.extra.party) || '손님', phone: null, visits: 0, noshows: 0 }
  const dayOf = (a) => dk(new Date(a.starts_at))
  const slotOpts = (extra) => ({ resources: RES(), busy: appts, hours: hoursOf(store), closed: closedSet(store), brk: S.break, lead: S.lead, ...extra })
  const slots = (date, svc, resId, extra) => slotsFor({ date, svc, resId, ...slotOpts(extra) })
  const pageOf = (sid) => pages.find((p) => p.store_id === sid && p.active !== false)
  const manageUrl = (a) => `${ORIGIN}/b/${a.manage_token}`
  const bookUrl = (sid) => { const p = pageOf(sid); return p ? `${ORIGIN}/r/${p.slug}` : '' }

  // ── 손님에게 보낼 문자 — 폰 문자 앱을 내용 채운 채로 ──
  function msgText(a, kind, extra) {
    const g = guestOf(a), sv = svcOf(a), when = `${md(dayOf(a))} ${hm(minOf(a.starts_at))}`, co = `[${CO || sName(a.store_id)}]`
    if (kind === 'confirm') return `${co} ${g.name}님, ${when} ${sv.name} 예약이 확정됐어요.\n변경 · 취소: ${manageUrl(a)}`
    if (kind === 'offer') return `${co} ${g.name}님, 요청하신 ${when}은 어려워요. ${md(dk(new Date(a.offer_starts_at)))} ${hm(minOf(a.offer_starts_at))}은 어떠세요?\n받기 · 다른 시간: ${manageUrl(a)}`
    if (kind === 'reject') return `${co} ${g.name}님, ${when} ${sv.name} 예약은 어려워요 — ${extra || '그 시간은 자리가 없어요'}.${bookUrl(a.store_id) ? `\n다른 시간 보기: ${bookUrl(a.store_id)}` : ''}`
    if (kind === 'move') return `${co} ${g.name}님, 예약 시간이 ${when}으로 바뀌었어요.\n변경 · 취소: ${manageUrl(a)}`
    if (kind === 'keep') return `${co} ${g.name}님, 바꾸려던 시간은 어려워서 ${when} 그대로 두었어요. 다른 시간이 필요하면 연락 주세요.`
    if (kind === 'wait') return `${co} ${g.name}님, 기다리시던 ${md(extra.date)} ${hm(extra.t)}에 자리가 났어요.${bookUrl(a.store_id) ? `\n먼저 잡는 분께: ${bookUrl(a.store_id)}` : ''}`
    if (kind === 'thanks') return `${co} ${g.name}님, 오늘 들러 주셔서 고마워요.${S.review && S.review_url ? `\n괜찮으셨다면 후기 한 줄 부탁드려요: ${S.review_url}` : ''}${bookUrl(a.store_id) ? `\n다음 예약: ${bookUrl(a.store_id)}` : ''}`
    return ''
  }
  function openMsg(a, kind, extra, title) {
    const g = extra && extra.guest ? extra.guest : guestOf(a), ph = digits(g.phone), txt = msgText(a, kind, extra)
    if (!txt) return
    const ios = /iPhone|iPad|Macintosh/.test(navigator.userAgent)
    const href = ph ? `sms:${ph}${ios ? '&' : '?'}body=${encodeURIComponent(txt)}` : ''
    const sc = sheet(`<div class="shd"><div><h2>${esc(title || '손님에게 문자')}</h2><div class="hint">${ph ? `${esc(fmtPh(ph))} · 폰에서는 문자 앱이 열려요` : '번호가 없어요 — 복사해서 보내기'}</div></div><button class="x" type="button" data-x aria-label="닫기">×</button></div>
      <div class="msgbox" data-mt>${esc(txt)}</div>
      <div class="sacts"><button type="button" data-c>복사</button>${href ? `<a class="main" href="${esc(href)}" style="flex:2;display:grid;place-items:center;border-radius:12px;text-decoration:none;background:var(--deep);color:var(--on-main);font-weight:700">문자 앱 열기</a>` : '<button type="button" data-x>닫기</button>'}</div>`)
    sc.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => sc.remove())
    sc.querySelector('[data-c]').onclick = async () => { try { await navigator.clipboard.writeText(txt); toast('복사했습니다'); sc.remove() } catch (e) { const r = document.createRange(); r.selectNodeContents(sc.querySelector('[data-mt]')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('글을 선택해 두었습니다 — 복사해 주세요') } }
  }

  // ── 저장 ──
  async function patchA(a, patch, what) {
    const old = { ...a }; Object.assign(a, patch)
    const { error } = await sb.from('appointments').update(patch).eq('id', a.id)
    if (error) { Object.assign(a, old); fail(what, error); render(); return false }
    return true
  }
  async function ensureGuest(name, phone) {
    const d = digits(phone)
    let g = (d && guests.find((x) => x.phone === d)) || null
    if (!g && name && !d) { const L = guests.filter((x) => x.name === name); if (L.length === 1) g = L[0] }
    if (g) return g
    const { data, error } = await sb.from('guests').insert({ tenant_id: T, name: name || '손님', phone: d.length >= 9 ? d : null }).select().single()
    if (error) { if (d) { const r = await sb.from('guests').select('*').eq('tenant_id', T).eq('phone', d).maybeSingle(); if (r.data) { guests.push(r.data); return r.data } } throw error }
    guests.push(data); return data
  }
  // 자리가 비면 — 같은 날 대기 손님 중 들어갈 수 있는 사람 찾기
  function freed(a, f) {
    if (!S.wait) return
    waits.filter((w) => w.store_id === a.store_id && w.want_date === f.date && !w.notified_at).forEach((w) => {
      const sv = services.find((s) => s.id === w.service_id) || svcOf(a)
      const ok = slots(w.want_date, sv, w.resource_id, { staff: true }).filter((s) => Math.abs(s.t - f.t) <= 30).sort((x, y) => Math.abs(x.t - f.t) - Math.abs(y.t - f.t))[0]
      if (ok && !alerts.some((x) => x.wid === w.id)) alerts.push({ id: ++aseq, wid: w.id, date: w.want_date, t: ok.t, res: ok.res })
    })
  }

  // ── 확인 필요 — 급한 순서 ──
  function todo() {
    const L = [], mine = (a) => a.store_id === store
    appts.filter((a) => mine(a) && a.status === 'confirmed' && a.reply === 'none' && dayOf(a) === TK).forEach((a) => L.push({ p: 0, a, k: 'n', kind: '전날 안내에 답 없음' }))
    alerts.forEach((x) => { const w = waits.find((v) => v.id === x.wid); if (w && w.store_id === store) L.push({ p: 1, x, k: 'o', kind: '빈 자리 · 대기 손님 있음' }) })
    appts.filter((a) => mine(a) && ['confirmed', 'request'].includes(a.status) && dayOf(a) >= TK && !a.clash_ok).forEach((a) => {
      const s0 = minOf(a.starts_at), e0 = s0 + (a.duration_min || 60), cap = (resources.find((r) => r.id === a.resource_id) || {}).capacity || 1
      const ov = appts.filter((o) => o.id !== a.id && ACTIVE.includes(o.status) && o.resource_id === a.resource_id && a.resource_id && dayOf(o) === dayOf(a) && minOf(o.starts_at) < e0 && s0 < minOf(o.starts_at) + (o.duration_min || 60))
      if (ov.length >= cap && ov.some((o) => (o.created_at || '') < (a.created_at || ''))) L.push({ p: 1.5, a, k: 'n', kind: '시간 겹침', ov: ov[0] })

    })
    appts.filter((a) => mine(a) && a.status === 'request').sort((a, b) => a.starts_at < b.starts_at ? -1 : 1).forEach((a) => L.push({ p: 2, a, k: 'q', kind: a.naver_pending ? '네이버 예약 신청 · 네이버에서 확정' : a.source === 'link' ? '새 예약 요청' : '확인 필요' }))
    appts.filter((a) => mine(a) && a.status === 'confirmed' && a.change_to).forEach((a) => L.push({ p: 3, a, k: 'c', kind: '손님이 시간 변경 요청' }))
    appts.filter((a) => mine(a) && a.status === 'offered').forEach((a) => L.push({ p: 4, a, k: 'w', kind: '다른 시간 제안 · 손님 답 기다림' }))
    return L.sort((a, b) => a.p - b.p)
  }
  const gTags = (g) => { const a = []; if (!g.visits) a.push('<span class="tag new">처음</span>'); else a.push(`<span class="tag ${g.visits >= 5 ? 'vip' : ''}">${g.visits >= 5 ? '단골 · ' : ''}${g.visits}회 방문</span>`); if (g.noshows) a.push(`<span class="tag ns">노쇼 ${g.noshows}회</span>`); return a.join('') }

  // ── 그리기 ──
  function render() {
    $$('[data-tab] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === tab))
    const sel = $('[data-store]'); if (sel) sel.innerHTML = STORES.map((s) => `<option value="${s.id}"${s.id === store ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
    const n = todo().filter((x) => x.p < 4).length; $('[data-tb]').textContent = n; $('[data-tb]').hidden = !n
    if (tab === 'store') renderStore(); else renderSet()
  }
  function renderStore() {
    const V = $('[data-view]')
    if (!RES().length || !SVCS().length) {
      V.innerHTML = `<div class="setup"><b>예약을 받으려면 두 가지만 먼저</b><span>① 예약 칸 — 디자이너 · 치료사처럼 사람이거나, 단체석 · 픽업처럼 자리<br>② 시술 · 예약 종류 — 이름과 걸리는 시간</span>${isAdmin ? '<button data-goset>받는 방법에서 넣기</button>' : '<span>관리자에게 「받는 방법」 설정을 부탁해 주세요</span>'}</div>`
      const g = V.querySelector('[data-goset]'); if (g) g.onclick = () => { tab = 'set'; render() }
      return
    }
    const L = (k) => appts.filter((a) => a.store_id === store && dayOf(a) === k && ['confirmed', 'request', 'done'].includes(a.status))
    let days = ''; for (let i = 0; i < 14; i++) {
      const k = addD(TK, i), h = openHours(k, hoursOf(store), closedSet(store)), X = L(k), rq = X.filter((a) => a.status === 'request').length
      days += `<button data-day="${k}" aria-pressed="${k === day}" class="${h ? '' : 'cl'} ${dowOf(k) === 0 ? 'su' : ''}"><span>${i === 0 ? '오늘' : DOW[dowOf(k)]}</span><b>${new Date(k + 'T00:00').getDate()}</b>${h ? (X.length ? `<span class="c">${X.length}명</span>${rq ? `<span class="c r">요청 ${rq}</span>` : ''}` : '<span class="c" style="color:var(--mute)">-</span>') : '<span class="c" style="color:var(--mute)">휴무</span>'}</button>`
    }
    const T2 = todo(), url = bookUrl(store)
    const wk = appts.filter((a) => a.store_id === store && dayOf(a) >= TK && dayOf(a) <= addD(TK, 6) && ['confirmed', 'request'].includes(a.status)).length
    V.innerHTML = `<div class="store">
      <section class="card mainc">
        <div class="top"><div><h1>${esc(sName(store))}</h1><div class="sum">오늘 ${L(TK).length}명 · 이번 주 ${wk}건 · 확인 필요 ${T2.filter((x) => x.p < 4).length}</div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${S.nvUse === 'naver' ? '<button class="btn" data-nv>네이버 알림 붙여넣기</button>' : ''}<button class="btn main" data-phone>${IC.plus}전화 · 방문 예약</button></div></div>
        <div class="days">${days}</div>
        <div data-grid></div>
        <div class="legend"><span><i style="background:var(--ok-bg)"></i>확정</span><span><i style="border:1.5px dashed var(--req)"></i>요청 · 제안 (자리는 잡아 둠)</span><span><i style="background:var(--soft)"></i>방문 완료</span><span><i style="background:var(--late-bg)"></i>노쇼</span><span>확정 예약은 캘린더에도 보여요</span></div>
      </section>
      <section class="card panel p-todo"><h2>확인 필요<small>매장 컴퓨터 · 담당자 폰</small></h2><div class="todo">${T2.map(itemHTML).join('') || '<div class="empty">지금 확인할 것 없음</div>'}</div></section>
      <section class="card panel"><h2>예약 링크<small>인스타 · 카카오 채널 · 플레이스</small></h2>
        ${url ? `<div class="link"><span>${esc(url.replace(/^https?:\/\//, ''))}</span><button data-copy>복사</button></div>` : `<div class="hint">아직 주소가 없어요${isAdmin ? ' — 받는 방법에서 만들기' : ''}</div>`}
        <p class="hint" style="margin:8px 0 0">${S.rule === 'known' ? '다녀간 손님은 바로 확정 · 처음 오는 손님과 노쇼 이력은 매장이 확인' : S.rule === 'auto' ? '모두 바로 확정' : '모두 매장이 확인한 뒤 확정'}</p></section>
      ${S.wait ? `<section class="card panel"><h2>대기 명단<small>자리 나면 알림</small></h2>${waits.filter((w) => w.store_id === store).length ? `<ul class="wl">${waits.filter((w) => w.store_id === store).map((w) => { const g = guests.find((x) => x.id === w.guest_id) || { name: '손님' }; return `<li><span><b>${esc(g.name)}</b> · ${esc((services.find((s) => s.id === w.service_id) || {}).name || '')}</span><small>${md(w.want_date)}${w.notified_at ? ' · 알림 보냄' : ''}</small></li>` }).join('')}</ul>` : '<div class="empty">대기 없음</div>'}</section>` : ''}
    </div>`
    renderGrid()
    V.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { day = b.dataset.day; renderStore() })
    V.querySelector('[data-phone]').onclick = () => openBook()
    const nv = V.querySelector('[data-nv]'); if (nv) nv.onclick = () => openNaver()
    const cp = V.querySelector('[data-copy]'); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(url); toast('링크를 복사했어요') } catch (e) { toast(url) } }
    wireTodo(V)
  }
  function renderGrid() {
    const G2 = $('[data-grid]'), h = openHours(day, hoursOf(store), closedSet(store))
    if (!h) { G2.innerHTML = `<div class="closed"><b>${md(day)} ${esc(closedLabel(store, day) || '휴무')}</b> · 예약 페이지에서도 이 날은 막혀 있어요.</div>`; return }
    const RH = 30, [o, c] = h, rows = Math.ceil((c - o) / 30), H = rows * RH, NOWm = new Date().getHours() * 60 + new Date().getMinutes()
    const L = appts.filter((a) => a.store_id === store && ['confirmed', 'request', 'done', 'noshow', 'offered'].includes(a.status) && dk(holdOf(a).at) === day)
    let lines = ''; for (let i = 0; i <= rows; i++) lines += `<div class="ln${i % 2 ? ' h' : ''}" style="top:${i * RH}px"></div>`
    const bk = S.break && S.break.start && (!S.break.days || S.break.days.includes(dowOf(day))) ? `<div class="brk" style="top:${(toM(S.break.start) - o) / 30 * RH}px;height:${(toM(S.break.end) - toM(S.break.start)) / 30 * RH}px">쉬는 시간</div>` : ''
    const now = day === TK && NOWm >= o && NOWm <= c ? `<div class="now" style="top:${(NOWm - o) / 30 * RH}px"></div>` : ''
    let hd = '<div class="hd"></div>', body = `<div class="tl" style="height:${H}px">${Array.from({ length: Math.floor(rows / 2) + 1 }, (_, i) => o + i * 60 <= c ? `<span style="top:${i * 2 * RH}px">${hm(o + i * 60)}</span>` : '').join('')}</div>`
    RES().forEach((r) => {
      const X = L.filter((a) => (holdOf(a).res || a.resource_id) === r.id).sort((a, b) => holdOf(a).at - holdOf(b).at)
      hd += `<div class="hd">${esc(r.name)}<small>${X.filter((a) => a.status !== 'noshow').length}명</small></div>`
      const blocks = X.map((a, i) => {
        const s = minOf(holdOf(a).at.toISOString()), d = a.duration_min || 60, g = guestOf(a), sv = svcOf(a)
        const ovl = (x) => { const sx = minOf(holdOf(x).at.toISOString()); return sx < s + d && s < sx + (x.duration_min || 60) }
        const ov = X.some((x, j) => j < i && ovl(x)), ov2 = X.some((x, j) => j > i && ovl(x))
        const cls = a.status === 'confirmed' ? 'ok' : a.status === 'request' ? 'req' : a.status === 'offered' ? 'offer' : a.status
        const fl = a.status === 'request' ? '<span class="flag q">요청</span>' : a.status === 'offered' ? '<span class="flag q">제안</span>' : a.status === 'done' ? '<span class="flag d">완료</span>' : a.status === 'noshow' ? '<span class="flag n">노쇼</span>' : a.change_to ? '<span class="flag q">변경 요청</span>' : ''
        return `<button class="bk ${cls}${ov ? ' half2' : ov2 ? ' half' : ''}" data-bk="${a.id}" style="top:${(s - o) / 30 * RH + 1}px;height:${Math.max(d / 30 * RH - 2, 26)}px">${fl}<span class="t">${hm(s)}</span><b>${esc(g.name)}</b>${d > 30 ? `<small>${a.source === 'naver' ? '네이버 · ' : ''}${esc(sv.name)}</small>` : ''}</button>`
      }).join('')
      body += `<div class="tc" style="height:${H}px">${lines}${bk}${now}${blocks}</div>`
    })
    G2.innerHTML = `<div class="tw"><div class="tg" style="grid-template-columns:52px repeat(${RES().length},minmax(150px,1fr))">${hd}${body}</div></div>`
    G2.querySelectorAll('[data-bk]').forEach((b) => b.onclick = () => openDetail(appts.find((a) => a.id === b.dataset.bk)))
  }
  const toM = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0) }
  function itemHTML(x) {
    if (x.x) {
      const w = waits.find((v) => v.id === x.x.wid); if (!w) return ''; const g = guests.find((q) => q.id === w.guest_id) || { name: '손님' }
      return `<div class="it"><span class="k o">${x.kind}</span><b>${md(x.x.date)} ${hm(x.x.t)} · ${esc(resName(x.x.res))}</b><span class="m">대기 · ${esc(g.name)} (${esc((services.find((s) => s.id === w.service_id) || {}).name || '')})</span>
        <div class="ac"><button class="p" data-wn="${x.x.id}">대기 손님에게 문자</button><button data-wx="${x.x.id}">그냥 두기</button></div></div>`
    }
    const a = x.a, g = guestOf(a), sv = svcOf(a), when = a.status === 'offered' ? `${md(dayOf(a))} ${hm(minOf(a.starts_at))} → 제안 ${md(dk(new Date(a.offer_starts_at)))} ${hm(minOf(a.offer_starts_at))}` : `${dayOf(a) === TK ? '오늘' : md(dayOf(a))} ${hm(minOf(a.starts_at))}`
    let ac = ''
    if (x.p === 0) ac = `${g.phone ? `<a href="tel:${esc(g.phone)}">${IC.phone} 전화</a>` : ''}<button class="p" data-ok2="${a.id}">통화함 · 오심</button><button data-cx="${a.id}">못 오심 · 취소</button>`
    else if (x.p === 1.5) ac = `<button class="p" data-mv="${a.id}">시간 · 칸 바꾸기</button><button data-ck="${a.id}">이대로 둠</button>`
    else if (x.p === 2 && a.naver_pending) ac = `<button class="p" data-nvok="${a.id}">네이버에서 확정했음</button><button data-nvno="${a.id}">네이버에서 거절함</button>`
    else if (x.p === 2) ac = `<button class="p" data-cf="${a.id}">확정</button><button data-of="${a.id}">다른 시간 제안</button><button data-rj="${a.id}">어려움</button>`
    else if (x.p === 3) { const ct = new Date(a.change_to), free = slots(dk(ct), sv, a.resource_id, { staff: true, skip: a.id }).some((s) => s.t === minOf(a.change_to)); ac = free ? `<button class="p" data-cg="${a.id}">${md(dk(ct))} ${hm(minOf(a.change_to))} · 바꾸기</button><button data-cn="${a.id}">어려움 · 그대로</button>` : `<span class="m" style="color:var(--late)">그 시간에는 이미 예약이 있어요</span><button data-of="${a.id}">다른 시간 제안</button><button data-cn="${a.id}">그대로</button>` }
    const ov = x.ov ? `<span class="m" style="color:var(--late)">${esc(resName(a.resource_id))} · ${hm(minOf(x.ov.starts_at))} ${esc(guestOf(x.ov).name)}(${SRC[x.ov.source] || ''})와 겹쳐요</span>` : ''
    const why = x.p === 2 && !a.naver_pending ? `<span class="m">${g.noshows ? '노쇼 이력이 있어 매장이 확인해요' : !g.visits ? '처음 오는 손님이라 매장이 확인해요' : '모두 매장이 확인하는 설정'}</span>` : x.p === 2 ? '<span class="m">네이버에서 확정해야 손님에게 확정 알림이 가요 · 시간은 잡아 뒀어요</span>' : ''
    return `<div class="it"><span class="k ${x.k}">${x.kind}</span><b>${when} · ${esc(g.name)}</b>
      <span class="m">${esc(sv.name)} · ${esc(resName(a.resource_id))}${a.change_to ? ` · → ${md(dayOf({ starts_at: a.change_to }))} ${hm(minOf(a.change_to))} 원함` : ''}${a.extra && a.extra.memo ? ' · ' + esc(a.extra.memo) : ''}</span>
      <div class="tags">${gTags(g)}${a.source !== 'phone' ? `<span class="tag${a.source === 'naver' ? ' nvt' : ''}">${SRC[a.source] || ''}</span>` : ''}</div>${ov}${why}
      <div class="ac">${ac}</div><div class="rs" data-rs="${a.id}" hidden>${['그 시간은 어려워요', '지금은 받지 않는 시술', '기타'].map((r) => `<button data-rr="${a.id}" data-r="${r}">${r}</button>`).join('')}</div></div>`
  }
  function wireTodo(V) {
    const A = (id) => appts.find((a) => a.id === id)
    V.querySelectorAll('[data-cf]').forEach((b) => b.onclick = async () => { const a = A(b.dataset.cf); if (await patchA(a, { status: 'confirmed' }, '확정')) { render(); openMsg(a, 'confirm', null, '확정 · 손님에게 문자') } })
    V.querySelectorAll('[data-nvok]').forEach((b) => b.onclick = async () => { if (await patchA(A(b.dataset.nvok), { status: 'confirmed', naver_pending: false }, '확정')) { render(); toast('확정으로 바꿨어요') } })
    V.querySelectorAll('[data-nvno]').forEach((b) => b.onclick = async () => { const a = A(b.dataset.nvno), f = { date: dayOf(a), t: minOf(a.starts_at) }; if (await patchA(a, { status: 'cancelled', naver_pending: false, cancel_reason: '네이버에서 거절' }, '거절')) { freed(a, f); render() } })
    V.querySelectorAll('[data-ok2]').forEach((b) => b.onclick = async () => { if (await patchA(A(b.dataset.ok2), { reply: 'yes' }, '확인')) { render(); toast('확인됨으로 남겼어요') } })
    V.querySelectorAll('[data-cx]').forEach((b) => b.onclick = () => cancelA(A(b.dataset.cx), '손님 사정'))
    V.querySelectorAll('[data-rj]').forEach((b) => b.onclick = () => { const r = V.querySelector(`[data-rs="${b.dataset.rj}"]`); r.hidden = !r.hidden })
    V.querySelectorAll('[data-rr]').forEach((b) => b.onclick = async () => { const a = A(b.dataset.rr); if (await cancelA(a, b.dataset.r, true)) openMsg(a, 'reject', b.dataset.r, '어렵다고 · 손님에게 문자') })
    V.querySelectorAll('[data-of]').forEach((b) => b.onclick = () => openPicker(A(b.dataset.of), 'offer'))
    V.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => openPicker(A(b.dataset.mv), 'move'))
    V.querySelectorAll('[data-ck]').forEach((b) => b.onclick = async () => { if (await patchA(A(b.dataset.ck), { clash_ok: true }, '겹침')) render() })
    V.querySelectorAll('[data-cg]').forEach((b) => b.onclick = async () => { const a = A(b.dataset.cg), f = { date: dayOf(a), t: minOf(a.starts_at) }; if (await patchA(a, { moved_from: a.starts_at, starts_at: a.change_to, change_to: null, reply: null, reminded_at: null }, '시간 변경')) { freed(a, f); render(); openMsg(a, 'move', null, '바꿨어요 · 손님에게 문자') } })
    V.querySelectorAll('[data-cn]').forEach((b) => b.onclick = async () => { const a = A(b.dataset.cn); if (await patchA(a, { change_to: null, reply: null }, '그대로')) { render(); openMsg(a, 'keep', null, '그대로 · 손님에게 문자') } })
    V.querySelectorAll('[data-wn]').forEach((b) => b.onclick = async () => {
      const x = alerts.find((v) => v.id == b.dataset.wn), w = waits.find((v) => v.id === x.wid), g = guests.find((q) => q.id === w.guest_id) || { name: '손님' }
      await sb.from('booking_waitlist').update({ notified_at: new Date().toISOString() }).eq('id', w.id); w.notified_at = new Date().toISOString()
      alerts = alerts.filter((v) => v !== x); render(); openMsg({ store_id: w.store_id, starts_at: new Date().toISOString() }, 'wait', { date: x.date, t: x.t, guest: g }, '대기 손님에게 문자')
    })
    V.querySelectorAll('[data-wx]').forEach((b) => b.onclick = () => { alerts = alerts.filter((v) => v.id != b.dataset.wx); render() })
  }
  async function cancelA(a, why, byStore) {
    const f = { date: dayOf(a), t: minOf(a.starts_at) }
    if (!(await patchA(a, { status: 'cancelled', cancel_reason: why }, '취소'))) return false
    freed(a, f); render(); if (!byStore) toast('취소했어요 · 자리가 다시 열렸어요')
    return true
  }

  // ── 시간 고르기 — 전화 예약 · 다른 시간 제안 · 시간 변경 공통 ──
  function pickerHTML(st) {
    let d = ''; for (let i = 0; i < 14; i++) {
      const k = addD(TK, i), h = openHours(k, hoursOf(store), closedSet(store)), n = h && st.svc ? slots(k, st.svc, st.res, { staff: true, skip: st.skip }).length : 0
      d += `<button type="button" data-pd="${k}" ${!h ? 'disabled' : ''} aria-pressed="${st.date === k}" class="${dowOf(k) === 0 ? 'su' : ''}">${i === 0 ? '오늘' : DOW[dowOf(k)]}<b>${new Date(k + 'T00:00').getDate()}</b>${!h ? '휴무' : st.svc && !n ? '마감' : ''}</button>`
    }
    const SL = st.svc && st.date ? slots(st.date, st.svc, st.res, { staff: true, skip: st.skip }) : []
    return `<div class="cd" style="margin-top:6px">${d}</div>${!st.svc ? '' : SL.length ? `<div class="chp" style="margin-top:8px">${SL.map((s) => `<button type="button" data-pt="${s.t}" data-pc="${s.res}" aria-pressed="${st.t === s.t}">${hm(s.t)}${!st.res && RES().length > 1 ? ` <small style="font-weight:500;color:var(--mute)">${esc(resName(s.res))}</small>` : ''}</button>`).join('')}</div>` : '<div class="nope" style="margin-top:8px">이 날은 빈 시간이 없어요</div>'}`
  }
  function wirePicker(sc, st, repaint) {
    sc.querySelectorAll('[data-pd]').forEach((b) => b.onclick = () => { st.date = b.dataset.pd; st.t = null; repaint() })
    sc.querySelectorAll('[data-pt]').forEach((b) => b.onclick = () => { st.t = +b.dataset.pt; st.tr = b.dataset.pc; repaint() })
  }
  function openPicker(a, mode) {
    const sv = svcOf(a), st = { svc: sv, res: mode === 'move' ? null : a.resource_id, date: dayOf(a), t: null, tr: null, skip: a.id }
    const sc = sheet(''); const F = sc.firstChild
    const paint = () => {
      F.innerHTML = `<div class="shd"><div><h2>${mode === 'offer' ? '다른 시간 제안' : '시간 · 칸 바꾸기'}</h2><div class="hint">${esc(guestOf(a).name)} · ${esc(sv.name)} · 지금 ${md(dayOf(a))} ${hm(minOf(a.starts_at))}</div></div><button class="x" type="button" data-x aria-label="닫기">×</button></div>
        <div class="fl">${pickerHTML(st)}</div>
        <div class="sacts"><button type="button" data-x>닫기</button><button class="main" ${st.t == null ? 'disabled' : ''}>${mode === 'offer' ? '제안하기' : '바꾸기'}</button></div>`
      F.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => sc.remove())
      wirePicker(F, st, paint)
      F.onsubmit = async (e) => {
        e.preventDefault(); if (st.t == null) return
        const iso = new Date(`${st.date}T${hm(st.t)}`).toISOString(), f = { date: dayOf(a), t: minOf(a.starts_at) }
        if (mode === 'offer') { if (await patchA(a, { status: 'offered', offer_starts_at: iso, offer_resource_id: st.tr, change_to: null }, '제안')) { sc.remove(); render(); openMsg(a, 'offer', null, '제안 · 손님에게 문자') } }
        else { if (await patchA(a, { moved_from: a.starts_at, starts_at: iso, resource_id: st.tr, staff_id: (resources.find((r) => r.id === st.tr) || {}).profile_id || a.staff_id, change_to: null, reminded_at: null, clash_ok: false }, '시간 변경')) { freed(a, f); sc.remove(); day = st.date; render(); openMsg(a, 'move', null, '바꿨어요 · 손님에게 문자') } }
      }
    }
    paint()
  }
  // 전화 · 방문 예약 — 매장에서 받은 것도 여기 넣어야 링크 · 네이버 예약과 안 겹친다
  function openBook() {
    const st = { svc: SVCS()[0], res: null, date: openHours(day, hoursOf(store), closedSet(store)) ? day : TK, t: null, tr: null, name: '', phone: '', memo: '', src: 'phone' }
    const sc = sheet(''); const F = sc.firstChild
    const paint = () => {
      const g = digits(st.phone).length >= 9 ? guests.find((x) => x.phone === digits(st.phone)) : null
      F.innerHTML = `<div class="shd"><div><h2>전화 · 방문 예약</h2><div class="hint">매장에서 받은 예약도 여기 넣어야 링크 예약과 안 겹쳐요</div></div><button class="x" type="button" data-x aria-label="닫기">×</button></div>
        <label class="fl">손님<input data-bn list="vbook-gl" value="${esc(st.name)}" placeholder="이름 · 번호 일부" autocomplete="off"></label><datalist id="vbook-gl">${guests.map((x) => `<option value="${esc(x.name)}">${esc(fmtPh(x.phone))}</option>`).join('')}</datalist>
        <div class="tags" style="display:flex;gap:4px;margin:-4px 0 8px">${g ? gTags(g) : ''}</div>
        <label class="fl">연락처<input data-bp inputmode="tel" value="${esc(st.phone)}" placeholder="010-0000-0000"></label>
        <div class="fl">받은 곳<div class="chp">${[['phone', '전화'], ['walkin', '방문'], ['kakao', '카톡']].map(([k, n]) => `<button type="button" data-src="${k}" aria-pressed="${st.src === k}">${n}</button>`).join('')}</div></div>
        <div class="fl">시술<div class="chp">${SVCS().map((s) => `<button type="button" data-ps="${s.id}" aria-pressed="${st.svc && st.svc.id === s.id}">${esc(s.name)} <small style="font-weight:500;color:var(--mute)">${durTx(s.duration_min)}</small></button>`).join('')}</div></div>
        ${st.svc && !st.svc.resource_id && RES().length > 1 ? `<div class="fl">칸<div class="chp"><button type="button" data-pr="" aria-pressed="${!st.res}">상관없음</button>${RES().map((r) => `<button type="button" data-pr="${r.id}" aria-pressed="${st.res === r.id}">${esc(r.name)}</button>`).join('')}</div></div>` : ''}
        <label class="fl"><span>메모 <span class="hint">선택</span></span><input data-bm value="${esc(st.memo)}" placeholder="예) 어깨 기장 · 인원 8명"></label>
        <div class="fl">날짜 · 시간${pickerHTML(st)}</div>
        <div class="sacts"><button type="button" data-x>취소</button><button class="main" ${st.t == null ? 'disabled' : ''}>${st.t == null ? '시간을 고르세요' : `${md(st.date)} ${hm(st.t)} 확정`}</button></div>`
      const Q = (s) => F.querySelector(s)
      F.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => sc.remove())
      Q('[data-bn]').oninput = (e) => { st.name = e.target.value; const L = guests.filter((x) => x.name === st.name); if (L.length === 1 && L[0].phone) { st.phone = fmtPh(L[0].phone); Q('[data-bp]').value = st.phone; F.querySelector('.tags').innerHTML = gTags(L[0]) } }
      Q('[data-bp]').oninput = (e) => { e.target.value = fmtPh(e.target.value); st.phone = e.target.value }
      Q('[data-bm]').oninput = (e) => { st.memo = e.target.value }
      F.querySelectorAll('[data-src]').forEach((b) => b.onclick = () => { st.src = b.dataset.src; paint() })
      F.querySelectorAll('[data-ps]').forEach((b) => b.onclick = () => { st.svc = services.find((s) => s.id === b.dataset.ps); st.res = null; st.t = null; paint() })
      F.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => { st.res = b.dataset.pr || null; st.t = null; paint() })
      wirePicker(F, st, paint)
      F.onsubmit = async (e) => {
        e.preventDefault(); if (st.t == null) return
        const go = F.querySelector('.main'); go.disabled = true
        try {
          const g2 = await ensureGuest(st.name.trim(), st.phone)
          const res = resources.find((r) => r.id === st.tr) || {}
          const { data, error } = await sb.from('appointments').insert({ tenant_id: T, store_id: store, kind: 'booking', title: st.svc.name, service_id: st.svc.id, resource_id: st.tr, staff_id: res.profile_id || null, guest_id: g2.id, starts_at: new Date(`${st.date}T${hm(st.t)}`).toISOString(), duration_min: st.svc.duration_min, status: 'confirmed', source: st.src, remind: 'prev18', extra: st.memo ? { memo: st.memo } : {}, created_by: ME }).select().single()
          if (error) throw error
          appts.push(data); day = st.date; sc.remove(); render()
          if (g2.phone) toast('확정했어요', { t: '확정 문자 보내기', f: () => openMsg(data, 'confirm', null, '확정 · 손님에게 문자') }); else toast('확정했어요')
        } catch (err) { go.disabled = false; fail('예약', err) }
      }
    }
    paint(); setTimeout(() => { const n = F.querySelector('[data-bn]'); if (n) n.focus() }, 30)
  }
  // 예약 한 건
  function openDetail(a) {
    const g = guestOf(a), sv = svcOf(a), sc = sheet(''), F = sc.firstChild
    const log = [`<li><b>${md(dk(new Date(a.created_at || a.starts_at)))}</b> ${SRC[a.source] || ''}${a.source === 'naver' ? '에서' : '로'} ${a.status === 'request' ? '요청' : '예약'}</li>`]
    if (a.moved_from) log.push(`<li><b>시간 변경</b> ${md(dk(new Date(a.moved_from)))} ${hm(minOf(a.moved_from))} → ${md(dayOf(a))} ${hm(minOf(a.starts_at))}</li>`)
    if (a.reply === 'yes') log.push('<li><b>손님</b> 갈게요</li>')
    if (a.change_to) log.push(`<li><b>손님</b> ${md(dk(new Date(a.change_to)))} ${hm(minOf(a.change_to))}로 변경 요청</li>`)
    F.innerHTML = `<div class="shd"><div><h2>${esc(g.name)}</h2><div class="tags" style="display:flex;gap:4px">${gTags(g)}</div></div><button class="x" type="button" data-x aria-label="닫기">×</button></div>
      <dl class="kv"><dt>시간</dt><dd>${md(dayOf(a))} ${hm(minOf(a.starts_at))}~${hm(minOf(a.starts_at) + (a.duration_min || 60))}</dd><dt>시술</dt><dd>${esc(sv.name)}</dd><dt>칸</dt><dd>${esc(resName(a.resource_id)) || '-'}</dd>
      <dt>연락처</dt><dd>${g.phone ? `<a href="tel:${esc(g.phone)}">${esc(fmtPh(g.phone))}</a>` : `<span style="display:flex;gap:6px"><input data-fph inputmode="tel" placeholder="${a.source === 'naver' ? '네이버 예약 상세에서 보고 넣기' : '010-0000-0000'}" style="flex:1;min-width:0;border:1px solid var(--line);border-radius:8px;padding:5px 8px;background:var(--card)"><button type="button" class="mini" data-fsave>저장</button></span>`}</dd>
      ${a.extra && a.extra.memo ? `<dt>메모</dt><dd>${esc(a.extra.memo)}</dd>` : ''}</dl>
      <div class="sec">기록</div><ul class="log">${log.join('')}</ul>
      <div class="sacts">${a.status === 'confirmed' ? '<button type="button" class="main" data-dn>방문 완료</button><button type="button" data-mv2>시간 변경</button><button type="button" data-ns>노쇼</button><button type="button" class="warn" data-cc>취소</button>'
        : a.status === 'request' ? '<button type="button" class="main" data-cf2>확정</button><button type="button" data-of2>다른 시간 제안</button>'
        : a.status === 'offered' ? '<button type="button" data-ud>제안 거두고 원래대로</button>' : '<button type="button" data-ud>되돌리기</button>'}</div>`
    const Q = (s) => F.querySelector(s)
    F.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => sc.remove())
    const done = (m) => { sc.remove(); render(); if (m) toast(m) }
    if (Q('[data-fph]')) { Q('[data-fph]').oninput = (e) => { e.target.value = fmtPh(e.target.value) }; Q('[data-fsave]').onclick = async () => {
      const d = digits(Q('[data-fph]').value); if (d.length < 9) return
      const same = guests.find((x) => x.phone === d)
      if (same && same.id !== g.id) { const ids = appts.filter((x) => x.guest_id === g.id).map((x) => x.id); const { error } = await sb.from('appointments').update({ guest_id: same.id }).in('id', ids); if (error) return fail('번호', error); appts.forEach((x) => { if (x.guest_id === g.id) x.guest_id = same.id }); done(`같은 번호 손님(${same.name})과 합쳤어요 · 방문 ${same.visits}회`) }
      else { const { error } = await sb.from('guests').update({ phone: d }).eq('id', g.id); if (error) return fail('번호', error); g.phone = d; done('번호를 넣었어요 · 다음 예약부터 알아봐요') }
    } }
    if (Q('[data-dn]')) Q('[data-dn]').onclick = async () => { if (await patchA(a, { status: 'done' }, '방문 완료')) { g.visits = (g.visits || 0) + 1; sc.remove(); render(); toast('방문 완료', g.phone && S.nvUse !== 'none' && S.review && S.review_url ? { t: '감사 문자 보내기', f: () => openMsg(a, 'thanks', null, '감사 문자') } : null) } }
    if (Q('[data-ns]')) Q('[data-ns]').onclick = async () => { const f = { date: dayOf(a), t: minOf(a.starts_at) }; if (await patchA(a, { status: 'noshow' }, '노쇼')) { g.noshows = (g.noshows || 0) + 1; freed(a, f); done(`노쇼 · 다음 링크 예약부터 ${g.name}님은 매장이 확인`) } }
    if (Q('[data-cc]')) Q('[data-cc]').onclick = async () => { sc.remove(); await cancelA(a, '매장에서 취소') }
    if (Q('[data-mv2]')) Q('[data-mv2]').onclick = () => { sc.remove(); openPicker(a, 'move') }
    if (Q('[data-cf2]')) Q('[data-cf2]').onclick = async () => { if (await patchA(a, { status: 'confirmed', naver_pending: false }, '확정')) { sc.remove(); render(); if (!a.naver_pending) openMsg(a, 'confirm', null, '확정 · 손님에게 문자') } }
    if (Q('[data-of2]')) Q('[data-of2]').onclick = () => { sc.remove(); openPicker(a, 'offer') }
    if (Q('[data-ud]')) Q('[data-ud]').onclick = async () => { const was = a.status; if (await patchA(a, { status: 'confirmed', offer_starts_at: null, offer_resource_id: null }, '되돌리기')) { if (was === 'done') g.visits = Math.max(0, (g.visits || 0) - 1); if (was === 'noshow') g.noshows = Math.max(0, (g.noshows || 0) - 1); done() } }
  }

  // ── 네이버 알림 붙여넣기 ──
  const nz = (x) => String(x).replace(/[\s·,]/g, '')
  function nvMatch(item) {
    const k = nz(item), m = nvmap.find((x) => x.product_key === k); if (m) return { svc: m.service_id, res: m.resource_id, mem: 1 }
    let svc = null, best = 0; SVCS().forEach((s) => { const n = nz(s.name); if (k.includes(n) && n.length > best) { best = n.length; svc = s.id } })
    let res = null; RES().forEach((r) => { const rn = nz(r.name.replace(/\s*(원장|선생님|치료사|실장)$/, '')); if (rn && k.includes(rn)) res = r.id })
    const sv = services.find((s) => s.id === svc); if (sv && sv.resource_id) res = sv.resource_id
    if (!res && RES().length === 1) res = RES()[0].id
    return { svc, res }
  }
  function openNaver() {
    let txt = '', rows = [], other = 0
    const sc = sheet(''); const F = sc.firstChild
    const same = (r) => (a) => a.status !== 'cancelled' && guestOf(a).name === r.name && dayOf(a) === r.date && minOf(a.starts_at) === r.t
    const read = () => {
      const P = nvParse(txt, TODAY); other = P.other
      rows = P.list.map((r) => {
        if (!r.date) return { ...r, kind: 'skip', why: '날짜를 못 읽었어요' }
        if (r.act === '취소') { const x = appts.find(same(r)); return x ? { ...r, kind: 'cx', x } : { ...r, kind: 'skip', why: '맞는 예약이 없어요 · 이미 취소됐거나 안 넣은 예약' } }
        if (r.date < TK) return { ...r, kind: 'skip', why: '지난 날짜' }
        if (appts.some(same(r))) return { ...r, kind: 'skip', why: '이미 들어간 예약' }
        if (r.act === '변경') { const x = appts.find((a) => a.source === 'naver' && a.status !== 'cancelled' && guestOf(a).name === r.name && dayOf(a) >= TK); if (x) return { ...r, kind: 'mv', x } }
        const mm = nvMatch(r.item); return { ...r, kind: 'new', svc: mm.svc, res: mm.res, mem: mm.mem, keep: true, pick: !mm.svc || !mm.res, ng: false }
      })
    }
    const clash = (r) => { if (!r.svc || !r.res) return null; const sv = services.find((s) => s.id === r.svc); const d = sv ? sv.duration_min : 60; return appts.find((a) => ACTIVE.includes(a.status) && a.resource_id === r.res && dayOf(a) === r.date && minOf(a.starts_at) < r.t + d && r.t < minOf(a.starts_at) + (a.duration_min || 60)) || null }
    const paint = () => {
      const n = rows.filter((r) => r.kind === 'new'), bad = n.filter((r) => !r.svc || !r.res), go = rows.filter((r) => r.kind !== 'skip')
      F.innerHTML = `<div class="shd"><div><h2>네이버 알림 붙여넣기</h2><div class="hint">스마트플레이스 알림 화면을 통째로 복사하거나, 캡처에서 글자를 뽑아 붙여넣기</div></div><button class="x" type="button" data-x aria-label="닫기">×</button></div>
        <textarea class="nvt2" data-nvt placeholder="예약신청 · 김고객님, 테라스룸, 05.21. (목) 오후 3:00 예약이 접수되었습니다.">${esc(txt)}</textarea>
        <div class="nvl">${rows.map((r, i) => {
          const hd = `${md(r.date || TK)} ${hm(r.t)} · <b>${esc(r.name)}</b>`
          if (r.kind === 'skip') return `<div class="nvr skip"><span class="k ks">건너뜀 · ${esc(r.why)}</span><span>${r.date ? hd : esc(r.name)} · ${esc(r.item)}</span></div>`
          if (r.kind === 'cx') return `<div class="nvr"><span class="k kx">취소</span><span>${hd} · ${esc(svcOf(r.x).name)} · ${esc(resName(r.x.resource_id))}</span><span class="hint">이 예약을 취소로 바꾸고 자리를 열어요</span></div>`
          if (r.kind === 'mv') return `<div class="nvr"><span class="k ka">시간 변경</span><span>${esc(r.name)} · ${md(dayOf(r.x))} ${hm(minOf(r.x.starts_at))} → ${hd}</span></div>`
          const c = clash(r), gl = guests.filter((x) => x.name === r.name)
          return `<div class="nvr"><span class="k ka">새 예약${S.nvConf === 'manual' ? ' · 네이버에서 확정 전' : ''}</span><span>${hd} · <span class="hint">네이버 상품</span> ${esc(r.item)}</span>
            ${!r.pick ? `<span>${esc((services.find((s) => s.id === r.svc) || {}).name || '')} · ${esc(resName(r.res))} <span class="hint">${r.mem ? '기억한 연결' : '이름으로 연결'}</span> <a href="#" data-ch="${i}" style="font-size:12px;color:var(--green)">바꾸기</a></span>`
              : `<span style="display:flex;gap:6px;flex-wrap:wrap"><select data-ms="${i}" aria-label="시술"><option value="">시술 고르기</option>${SVCS().map((s) => `<option value="${s.id}"${r.svc === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select><select data-mc="${i}" aria-label="칸"><option value="">칸 고르기</option>${RES().map((x) => `<option value="${x.id}"${r.res === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></span>
              <label><input type="checkbox" data-mk="${i}" ${r.keep ? 'checked' : ''}>다음부터 '${esc(r.item)}' 상품은 자동</label>`}
            ${!openHours(r.date, hoursOf(store), closedSet(store)) ? '<span class="w">매장 쉬는 날이에요 · 네이버 예약 설정의 휴무일도 확인</span>' : ''}
            ${c ? `<span class="w">같은 시간 ${esc(guestOf(c).name)}(${SRC[c.source] || ''}) 예약과 겹쳐요 · 칸을 바꾸거나 네이버에서 조정</span>` : ''}
            ${gl.length === 1 && gl[0].phone ? `<label><input type="checkbox" data-ng="${i}" ${r.ng ? '' : 'checked'}>기존 손님 ${esc(gl[0].name)}(${esc(fmtPh(gl[0].phone))}) · ${gl[0].visits}회 방문과 같은 사람</label>` : '<span class="hint">번호 없음 · 네이버 예약 상세에서 보고 넣으면 다음부터 알아봐요</span>'}</div>`
        }).join('')}
        ${other ? `<div class="hint">예약이 아닌 알림 ${other}건(리뷰 · 주문 등)은 건너뜀</div>` : ''}
        ${txt.trim() && !rows.length ? '<div class="nope">예약 알림을 못 찾았어요 · "~님, 상품, 날짜 (요일) 시간 예약이 접수되었습니다" 문구가 들어 있어야 해요</div>' : ''}</div>
        <div class="sacts"><button type="button" data-x>닫기</button><button class="main" ${!go.length || bad.length ? 'disabled' : ''}>${bad.length ? `${bad.length}건 골라 주세요` : go.length ? `${go.length}건 반영` : '붙여넣으면 읽어요'}</button></div>`
      F.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => sc.remove())
      const ta = F.querySelector('[data-nvt]'); ta.oninput = () => { txt = ta.value; const pos = ta.selectionStart; read(); paint(); const t2 = F.querySelector('[data-nvt]'); t2.focus(); t2.setSelectionRange(pos, pos) }
      F.querySelectorAll('[data-ms]').forEach((s) => s.onchange = () => { const r = rows[+s.dataset.ms]; r.svc = s.value || null; const sv = services.find((x) => x.id === r.svc); if (sv && sv.resource_id) r.res = sv.resource_id; paint() })
      F.querySelectorAll('[data-mc]').forEach((s) => s.onchange = () => { rows[+s.dataset.mc].res = s.value || null; paint() })
      F.querySelectorAll('[data-mk]').forEach((c) => c.onchange = () => { rows[+c.dataset.mk].keep = c.checked })
      F.querySelectorAll('[data-ng]').forEach((c) => c.onchange = () => { rows[+c.dataset.ng].ng = !c.checked })
      F.querySelectorAll('[data-ch]').forEach((a2) => a2.onclick = (e) => { e.preventDefault(); rows[+a2.dataset.ch].pick = true; paint() })
      F.onsubmit = async (e) => {
        e.preventDefault(); const btn = F.querySelector('.main'); btn.disabled = true
        let nA = 0, nC = 0, nM = 0
        try {
          for (const r of rows) {
            if (r.kind === 'cx') { if (await cancelA(r.x, '네이버에서 취소', true)) nC++ }
            else if (r.kind === 'mv') { const f = { date: dayOf(r.x), t: minOf(r.x.starts_at) }; if (await patchA(r.x, { moved_from: r.x.starts_at, starts_at: new Date(`${r.date}T${hm(r.t)}`).toISOString(), reminded_at: null }, '시간 변경')) { freed(r.x, f); nM++ } }
            else if (r.kind === 'new') {
              if (r.keep && r.pick) { await sb.from('naver_product_map').upsert({ tenant_id: T, product_key: nz(r.item), service_id: r.svc, resource_id: r.res }); nvmap = nvmap.filter((x) => x.product_key !== nz(r.item)).concat({ product_key: nz(r.item), service_id: r.svc, resource_id: r.res }) }
              const gl = guests.filter((x) => x.name === r.name)
              let g = gl.length === 1 && gl[0].phone && !r.ng ? gl[0] : gl.find((x) => !x.phone && !r.ng)
              if (!g) { const q2 = await sb.from('guests').insert({ tenant_id: T, name: r.name }).select().single(); if (q2.error) throw q2.error; g = q2.data; guests.push(g) }
              const sv = services.find((s) => s.id === r.svc), res = resources.find((x) => x.id === r.res) || {}
              const st2 = S.nvConf === 'manual' ? 'request' : 'confirmed'
              const { data, error } = await sb.from('appointments').insert({ tenant_id: T, store_id: store, kind: 'booking', title: sv.name, service_id: sv.id, resource_id: r.res, staff_id: res.profile_id || null, guest_id: g.id, starts_at: new Date(`${r.date}T${hm(r.t)}`).toISOString(), duration_min: sv.duration_min, status: st2, naver_pending: st2 === 'request', source: 'naver', remind: 'prev18', extra: { naver_item: r.item }, created_by: ME }).select().single()
              if (error) throw error
              appts.push(data); nA++
            }
          }
        } catch (err) { fail('네이버 반영', err) }
        sc.remove(); render(); toast([nA && `새 예약 ${nA}`, nC && `취소 ${nC}`, nM && `변경 ${nM}`].filter(Boolean).join(' · ') + ' 반영했어요')
      }
    }
    paint(); setTimeout(() => { const t2 = F.querySelector('[data-nvt]'); if (t2) t2.focus() }, 30)
  }

  // ── 받는 방법 ──
  async function saveS(patch, msg) {
    const old = S; S = { ...S, ...patch }
    try { await host.saveBooking(S); if (msg !== false) toast(msg || '바꿨어요 · 예약 페이지에 바로 반영') } catch (e) { S = old; fail('설정', e) }
    render()
  }
  function renderSet() {
    const V = $('[data-view]')
    if (!isAdmin) { V.innerHTML = '<div class="setup"><b>받는 방법은 관리자가 정해요</b><span>예약 칸 · 시술 · 예약 페이지 주소 · 확정 방식</span></div>'; return }
    const o = (k, v, n, s) => `<button type="button" data-o="${k}" data-v="${v}" aria-pressed="${String(S[k]) === String(v)}">${n}${s ? `<small>${s}</small>` : ''}</button>`
    const pg = pageOf(store), R = resources.filter((r) => r.store_id === store), SV = services.filter((s) => !s.store_id || s.store_id === store)
    V.innerHTML = `<section class="card set"><div class="top"><div><h1>받는 방법</h1><div class="sum">${esc(sName(store))} · 바꾸면 예약 페이지에 바로 반영</div></div></div>
      <div class="sr"><b>예약 페이지 주소<small>인스타 · 카카오 · 플레이스에 붙이는 링크</small></b><div>${pg ? `<div class="link" style="max-width:460px"><span>${esc(ORIGIN.replace(/^https?:\/\//, ''))}/r/${esc(pg.slug)}</span><button type="button" data-copy2>복사</button><button type="button" data-open2>열어 보기</button></div>` : `<div class="rrow"><span class="hint">${esc(ORIGIN.replace(/^https?:\/\//, ''))}/r/</span><input class="tx" data-slug placeholder="영문 소문자 · 숫자 · - (예: hair-bom)" style="width:220px"><button type="button" class="mini" data-mkslug>만들기</button></div><div class="hint">한 번 정하면 바꾸지 않는 게 좋아요 — 이미 붙인 링크가 끊겨요</div>`}</div></div>
      <div class="sr"><b>예약 칸<small>사람(디자이너 · 치료사) 또는 자리(단체석 · 픽업)</small></b><div>
        ${R.map((r) => `<div class="rrow"><input class="tx" data-rn="${r.id}" value="${esc(r.name)}" style="width:150px"><select class="tx" data-rp="${r.id}" aria-label="직원 연결"><option value="">직원 연결 없음</option>${profiles.map((p) => `<option value="${p.id}"${p.id === r.profile_id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select><span class="hint">동시에</span><input class="tx" type="number" min="1" max="50" data-rc="${r.id}" value="${r.capacity || 1}" style="width:56px"><button type="button" class="mini" data-ra="${r.id}">${r.active === false ? '다시 쓰기' : '빼기'}</button></div>`).join('')}
        <button type="button" class="mini" data-addr>+ 칸</button><div class="hint" style="margin-top:6px">직원을 연결하면 그 사람 폰으로 예약 알림이 가요</div></div></div>
      <div class="sr"><b>시술 · 예약 종류<small>걸리는 시간이 곧 자리</small></b><div><div class="svtw"><table class="svt"><thead><tr><th>이름</th><th>걸리는 시간</th><th>가격 표시</th><th>칸 고정</th><th>준비 기간</th><th>보이기</th><th></th></tr></thead><tbody>
        ${SV.map((s) => `<tr><td><input type="text" data-sn="${s.id}" value="${esc(s.name)}"></td><td><select data-sd="${s.id}">${[15, 20, 30, 40, 45, 50, 60, 90, 120, 150, 180, 240].map((m) => `<option value="${m}"${m === s.duration_min ? ' selected' : ''}>${durTx(m)}</option>`).join('')}</select></td><td><input type="text" data-sp="${s.id}" value="${esc(s.price_label || '')}" placeholder="예) 2만 원"></td>
          <td><select data-sr="${s.id}"><option value="">고르게 함</option>${R.map((r) => `<option value="${r.id}"${r.id === s.resource_id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></td><td><input type="number" min="0" max="60" data-sl="${s.id}" value="${s.lead_days || 0}"> 일</td>
          <td><input type="checkbox" data-sv="${s.id}" ${s.visible !== false ? 'checked' : ''} aria-label="예약 페이지에 보이기"></td><td><button type="button" class="mini" data-sa="${s.id}">${s.active === false ? '다시 쓰기' : '빼기'}</button></td></tr>`).join('')}</tbody></table></div>
        <button type="button" class="mini" data-adds style="margin-top:8px">+ 시술</button><div class="hint" style="margin-top:6px">준비 기간: 케이크처럼 만드는 데 시간이 걸리면 그 날수만큼 뒤부터 받아요</div></div></div>
      <div class="sr"><b>확정<small>링크로 들어온 예약</small></b><div class="opt">${o('rule', 'known', '다녀간 손님은 바로', '처음 · 노쇼 이력만 매장 확인')}${o('rule', 'manual', '모두 매장이 확인', '확정 전까지 자리는 잡아 둠')}${o('rule', 'auto', '모두 바로 확정', '')}</div></div>
      <div class="sr"><b>받는 기간</b><div class="opt">${o('range', 7, '7일 앞까지')}${o('range', 14, '14일 앞까지')}${o('range', 30, '30일 앞까지')}</div></div>
      <div class="sr"><b>마감<small>이보다 가까우면 전화로</small></b><div class="opt">${o('lead', 60, '1시간 전')}${o('lead', 120, '2시간 전')}${o('lead', 180, '3시간 전')}${o('lead', 1440, '전날까지')}</div></div>
      <div class="sr"><b>손님이 직접 변경 · 취소<small>문자 링크로</small></b><div class="opt">${o('chg', 'eve', '전날 오후 6시까지')}${o('chg', '3h', '3시간 전까지')}${o('chg', 'no', '전화로만')}</div></div>
      <div class="sr"><b>쉬는 시간<small>점심 등 · 예약 안 받음</small></b><div class="rrow"><input class="tx" type="time" data-bs value="${esc((S.break || {}).start || '')}"><span>~</span><input class="tx" type="time" data-be value="${esc((S.break || {}).end || '')}"><button type="button" class="mini" data-bsave>저장</button>${S.break && S.break.start ? '<button type="button" class="mini" data-bclr>없애기</button>' : ''}</div></div>
      <div class="sr"><b>공휴일<small>빨간 날</small></b><div class="opt">${o('closed_holidays', 'false', '공휴일에도 받기')}${o('closed_holidays', 'true', '공휴일은 쉬기')}</div></div>
      <div class="sr"><b>대기 명단<small>꽉 찬 날</small></b><div class="opt">${o('wait', 1, '받기', '취소가 나면 대기 손님을 찾아 알려 줌')}${o('wait', 0, '안 받기')}</div></div>
      <div class="sr"><b>네이버 플레이스<small>손님이 들어오는 문</small></b><div class="opt">${o('nvUse', 'naver', '네이버 예약 씀', '알림 붙여넣기로 한곳에')}${o('nvUse', 'place', '플레이스만 있음', '예약 버튼에 이 링크')}${o('nvUse', 'none', '안 씀', '카톡 · 문자 링크로')}</div></div>
      ${S.nvUse === 'naver' ? `<div class="sr"><b>네이버 예약 확정<small>스마트플레이스 설정과 같게</small></b><div class="opt">${o('nvConf', 'auto', '바로 확정', '들어오면 바로 시간표에')}${o('nvConf', 'manual', '확인 후 확정', '네이버에서 확정할 때까지 요청')}</div></div>` : ''}
      ${S.nvUse === 'place' ? `<div class="sr"><b>플레이스 「예약」 버튼<small>한 번만 하면 돼요</small></b><div class="hint" style="font-size:13px">스마트플레이스 › 업체정보 › URL 추가 › 분류 「예약」에 위 예약 페이지 주소를 붙여넣기 · 반영까지 하루쯤</div></div>` : ''}
      ${S.nvUse !== 'none' ? `<div class="sr"><b>리뷰 부탁<small>방문 완료 뒤 감사 문자</small></b><div><div class="rrow"><input class="tx" data-rv value="${esc(S.review_url || '')}" placeholder="플레이스 리뷰 링크 (https://…)" style="width:320px"><button type="button" class="mini" data-rvs>저장</button></div><div class="hint">리뷰 대가(할인 · 사은품)는 걸지 않아요 — 부탁 문구만</div></div></div>` : ''}
      <div class="sr"><b>예약 페이지 안내<small>손님 화면 맨 위</small></b><div class="rrow"><input class="tx" data-nt value="${esc(S.notice || '')}" placeholder="예) 추석 당일 9/25는 쉬어요" style="width:320px"><button type="button" class="mini" data-nts>저장</button></div></div>
      <div class="sr"><b>손님 정보 보관<small>예약 동의 문구와 같게</small></b><div class="hint" style="font-size:13px">마지막 방문(예약일)부터 1년이 지난 손님은 매일 새벽 자동으로 지워요 — 이름 · 번호 · 메모 · 요청 사항. 예약 기록(날짜 · 시술 · 담당)은 이름 없이 남아요.</div></div>
      <div class="sr"><b>문자<small>확정 · 전날 안내</small></b><div class="hint" style="font-size:13px">문자 발송 계약 전이라, 확정 · 제안 · 변경 때 폰 문자 앱이 내용을 채운 채로 열려요. 전날 안내는 담당자 폰 알림으로.</div></div>
    </section>`
    const Q = (s) => V.querySelector(s), QA = (s) => [...V.querySelectorAll(s)]
    QA('[data-o]').forEach((b) => b.onclick = () => { const k = b.dataset.o, v = b.dataset.v; saveS({ [k]: v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v }) })
    if (Q('[data-copy2]')) Q('[data-copy2]').onclick = async () => { try { await navigator.clipboard.writeText(bookUrl(store)); toast('링크를 복사했어요') } catch (e) { toast(bookUrl(store)) } }
    if (Q('[data-open2]')) Q('[data-open2]').onclick = () => window.open(bookUrl(store), '_blank')
    if (Q('[data-mkslug]')) Q('[data-mkslug]').onclick = async () => {
      const v = Q('[data-slug]').value.trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(v)) { toast('영문 소문자 · 숫자 · - 로 3~40자'); return }
      const { data, error } = await sb.from('booking_pages').insert({ slug: v, tenant_id: T, store_id: store }).select().single()
      if (error) { fail(error.code === '23505' ? '이미 쓰는 주소예요 — 다른 이름으로' : '주소', error); return }
      pages.push(data); render(); toast('예약 페이지를 만들었어요')
    }
    const upd = async (table, id, patch, arr) => { const { error } = await sb.from(table).update(patch).eq('id', id); if (error) return fail('저장', error); Object.assign(arr.find((x) => x.id === id), patch); render(); toast('저장했습니다') }
    QA('[data-rn]').forEach((i) => i.onchange = () => i.value.trim() && upd('booking_resources', i.dataset.rn, { name: i.value.trim() }, resources))
    QA('[data-rp]').forEach((i) => i.onchange = () => upd('booking_resources', i.dataset.rp, { profile_id: i.value || null }, resources))
    QA('[data-rc]').forEach((i) => i.onchange = () => upd('booking_resources', i.dataset.rc, { capacity: Math.max(1, Math.min(50, +i.value || 1)) }, resources))
    QA('[data-ra]').forEach((b) => b.onclick = () => { const r = resources.find((x) => x.id === b.dataset.ra); upd('booking_resources', r.id, { active: r.active === false }, resources) })
    Q('[data-addr]').onclick = async () => { const { data, error } = await sb.from('booking_resources').insert({ tenant_id: T, store_id: store, name: `칸 ${R.length + 1}`, sort: R.length }).select().single(); if (error) return fail('칸', error); resources.push(data); render() }
    QA('[data-sn]').forEach((i) => i.onchange = () => i.value.trim() && upd('booking_services', i.dataset.sn, { name: i.value.trim() }, services))
    QA('[data-sd]').forEach((i) => i.onchange = () => upd('booking_services', i.dataset.sd, { duration_min: +i.value }, services))
    QA('[data-sp]').forEach((i) => i.onchange = () => upd('booking_services', i.dataset.sp, { price_label: i.value.trim() || null }, services))
    QA('[data-sr]').forEach((i) => i.onchange = () => upd('booking_services', i.dataset.sr, { resource_id: i.value || null }, services))
    QA('[data-sl]').forEach((i) => i.onchange = () => upd('booking_services', i.dataset.sl, { lead_days: Math.max(0, Math.min(60, +i.value || 0)) }, services))
    QA('[data-sv]').forEach((i) => i.onchange = () => upd('booking_services', i.dataset.sv, { visible: i.checked }, services))
    QA('[data-sa]').forEach((b) => b.onclick = () => { const s = services.find((x) => x.id === b.dataset.sa); upd('booking_services', s.id, { active: s.active === false }, services) })
    Q('[data-adds]').onclick = async () => { const { data, error } = await sb.from('booking_services').insert({ tenant_id: T, store_id: null, name: `시술 ${SV.length + 1}`, duration_min: 60, sort: SV.length }).select().single(); if (error) return fail('시술', error); services.push(data); render() }
    Q('[data-bsave]').onclick = () => { const s = Q('[data-bs]').value, e = Q('[data-be]').value; if (!s || !e || s >= e) { toast('시작 · 끝 시간을 확인해 주세요'); return } saveS({ break: { start: s, end: e, days: [0, 1, 2, 3, 4, 5, 6] } }) }
    if (Q('[data-bclr]')) Q('[data-bclr]').onclick = () => saveS({ break: null })
    if (Q('[data-rvs]')) Q('[data-rvs]').onclick = () => { const v = Q('[data-rv]').value.trim(); if (v && !/^https?:\/\//.test(v)) { toast('https:// 로 시작하는 주소'); return } saveS({ review_url: v }) }
    Q('[data-nts]').onclick = () => saveS({ notice: Q('[data-nt]').value.trim() })
  }

  $$('[data-tab] button').forEach((b) => b.onclick = () => { tab = b.dataset.t; render() })
  const ss = $('[data-store]'); if (ss) ss.onchange = (e) => { store = e.target.value; day = TK; render() }
  try { await load(); $('[data-err]').innerHTML = '' } catch (e) { console.warn('[book] load', e); $('[data-err]').innerHTML = `<div class="st-err">예약을 불러오지 못했어요 — ${esc(e.message || e)}. 잠시 뒤 다시 열어 주세요</div>` }
  if (!STORES.length) { $('[data-view]').innerHTML = '<div class="setup"><b>매장이 없어요</b></div>'; return { close } }
  if (host.tab) tab = host.tab
  render()
  return { close }
}
