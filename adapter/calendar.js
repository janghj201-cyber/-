// 새 월간 캘린더 (v6.9) — 손님 예약 · 거래처 미팅 · 보관기한 · 고정업무 · 휴무를 한 달력에.
// 승인된 시안(calendar-sample)을 앱 안으로 옮긴 것. 표는 SQL_v69 (appointments · expiry_lots · calendar_marks · store_closures).
// 고정업무 · 영업시간 · 기능 켜기는 index.html 이 가진 값을 host 로 넘겨받는다(같은 규칙 한 곳).
// 화면 · 색 · 배치는 보는 사람 기기(localStorage)에만. 기능 켜기/끄기는 회사 설정(features.cal_*) — 관리자만.
import { supabase as sb } from './supabase-client.js'
import { getContext } from './context.js'

const CSS = `#vcal{--ink:var(--text);--sub:var(--text-sub);--mute:var(--text-mute);--line:var(--border);--hover:var(--soft);
  --deep:var(--navy);--tint:var(--green-light);--light:var(--green);--on-main:#fff;
  --hol:var(--red);--hol-bg:var(--red-light);
  --rsv:#1E6BC6;--rsv-bg:#E2EFFE;--mtg:#6A45D0;--mtg-bg:#ECE5FE;--exp:#C27A12;--exp-bg:#FEEFCF;--fix:#238B65;--fix-bg:#DAF3E6;--off:#8A949C;--off-bg:#E8EBEE;
  --rsvF:#0B6FD1;--mtgF:#3A1F7A;--onF:#FFFFFF;--expT:#B45309;
  --st-star:#D99A0B;--st-flag:#238B65;--st-alert:#C8352B;--st-heart:#D14D7E;--st-party:#6A45D0;
  position:fixed;inset:0;z-index:900;background:var(--bg);color:var(--ink);overflow-y:auto;overscroll-behavior:contain;
  font-size:14px;line-height:1.55;}
html[data-bright=dark] #vcal{--rsv:#7FB0F2;--rsv-bg:#1A2B42;--mtg:#B49CF4;--mtg-bg:#261F3E;--exp:#EDB25A;--exp-bg:#35280F;--fix:#6CCB9A;--fix-bg:#163527;--off:#9AA59F;--off-bg:#1F2A25;
  --rsvF:#5AAEF5;--mtgF:#C9B6FA;--onF:#0B1712;--expT:#F2A93B;--st-star:#F2C14E;--st-flag:#6CCB9A;--st-alert:#F08A80;--st-heart:#F29AB9;--st-party:#B49CF4;}
#vcal *{box-sizing:border-box}
#vcal button,#vcal select,#vcal input,#vcal textarea{font:inherit;color:inherit}
#vcal button{cursor:pointer}
#vcal :focus-visible{outline:2px solid var(--green);outline-offset:2px}
#vcal .wrap{max-width:1560px;margin:0 auto;padding:14px 16px calc(48px + var(--safe-bot,0px))}
#vcal .frame{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
#vcal .lpanel{display:none}
#vcal .st-err{background:var(--hol-bg);color:var(--hol);border-radius:10px;padding:8px 12px;font-size:13px;font-weight:600;margin-bottom:10px}
#vcal .loading{font-size:13px;color:var(--mute);padding:40px 0;text-align:center}
#vcal .rec{width:100%;margin-top:8px;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:9px;font-weight:600;font-size:13px;color:var(--sub)}
#vcal .tag.s-req{background:var(--exp-bg);color:var(--expT)}
#vcal .fixnote{margin-top:12px;font-size:13px;color:var(--sub);background:var(--soft);border-radius:10px;padding:10px 12px}
#vcal .ro{font-size:12px;color:var(--mute)}
#vcal .sacts button{display:grid;place-items:center;padding:0 10px}
#vcal .app{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
@media(min-width:1100px){
#vcal .app{grid-template-columns:minmax(0,1fr) 350px}
}
#vcal .main{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 18px 14px;min-width:0}
#vcal .top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
#vcal .top h1{font-size:22px;margin:0;letter-spacing:-.02em;display:flex;align-items:baseline;gap:10px;font-variant-numeric:tabular-nums}
#vcal .top h1 small{font-size:13px;color:var(--mute);font-weight:500}
#vcal .nav{display:flex;gap:6px;align-items:center}
#vcal .ib{width:34px;height:34px;border:1px solid var(--line);background:var(--card);border-radius:9px;display:grid;place-items:center}
#vcal .ib:hover{background:var(--hover)}
#vcal .ib svg{width:16px;height:16px}
#vcal .tbtn{height:34px;border:1px solid var(--line);background:var(--card);border-radius:9px;padding:0 12px;font-weight:600;font-size:13px}
#vcal .seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}
#vcal .seg button{border:0;background:var(--card);padding:0 14px;height:32px;font-weight:600;font-size:13px;color:var(--sub)}
#vcal .seg button[aria-pressed=true]{background:var(--deep);color:var(--on-main)}
#vcal .add{height:36px;border:0;background:var(--deep);color:var(--on-main);border-radius:10px;padding:0 14px;font-weight:700;display:inline-flex;gap:6px;align-items:center}
#vcal .add svg{width:15px;height:15px}
#vcal .bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0 12px}
#vcal .bar select{height:34px;border:1px solid var(--line);background:var(--card);border-radius:9px;padding:0 10px;font-size:13px}
#vcal .lays{display:flex;flex-wrap:wrap;gap:8px}
#vcal .lay{display:inline-flex;flex:none;align-items:center;gap:7px;height:34px;padding:0 12px 0 9px;border:1px solid var(--line);background:var(--card);border-radius:9px;font-size:13px;font-weight:600;color:var(--sub)}
#vcal .sw{width:9px;height:9px;border-radius:50%;flex:none;display:inline-block}
#vcal .sw.k-rsv{background:var(--rsv)}
#vcal .sw.k-mtg{background:var(--mtg)}
#vcal .sw.k-exp{background:var(--exp)}
#vcal .sw.k-fix{background:var(--fix)}
#vcal .sw.k-off{background:var(--off)}
#vcal .lay .ck{width:16px;height:16px;border-radius:4px;background:var(--deep);display:grid;place-items:center;flex:none}
#vcal .lay .ck svg{width:11px;height:11px;color:var(--on-main)}
#vcal .lay[aria-pressed=false] .ck{background:transparent;box-shadow:inset 0 0 0 1.5px var(--line)}
#vcal .lay[aria-pressed=false] .ck svg{opacity:0}
#vcal .lay[aria-pressed=false]{color:var(--mute)}
#vcal .lay .n{font-size:11.5px;color:var(--mute);font-weight:500;font-variant-numeric:tabular-nums}
#vcal .grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid var(--line);border-radius:12px;overflow:hidden}
#vcal .dow{font-size:12px;font-weight:600;color:var(--mute);text-align:center;padding:8px 0;background:var(--soft);border-bottom:1px solid var(--line)}
#vcal .dow.su{color:var(--hol)}
#vcal .dow.sa{color:var(--sub)}
#vcal .cell{min-height:112px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:6px 6px 6px;display:flex;flex-direction:column;gap:3px;background:var(--card);text-align:left;border-top:0;border-left:0;min-width:0}
#vcal .cell:nth-child(7n){border-right:0}
#vcal .cell:hover{background:var(--hover)}
#vcal .cell.out{background:var(--soft)}
#vcal .cell.out .dn{color:var(--mute);opacity:.6}
#vcal .cell.sel{box-shadow:inset 0 0 0 2px var(--green);background:var(--tint)}
#vcal .dh{display:flex;align-items:center;justify-content:space-between;gap:4px;min-height:24px}
#vcal .dn{font-weight:600;font-size:13px;width:24px;height:24px;display:grid;place-items:center;border-radius:50%;font-variant-numeric:tabular-nums}
#vcal .cell.today .dn{background:var(--deep);color:var(--on-main)}
#vcal .cell.su .dn,#vcal .cell.hol .dn{color:var(--hol)}
#vcal .cell.today.su .dn,#vcal .cell.today.hol .dn{color:var(--on-main)}
#vcal .hn{font-size:11px;color:var(--hol);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#vcal .chip{display:flex;align-items:center;gap:6px;border-radius:7px;padding:4px 7px;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
#vcal .chip .t{font-variant-numeric:tabular-nums;font-weight:600}
#vcal .chip svg{width:13px;height:13px;flex:none}
#vcal .chip span:last-child{overflow:hidden;text-overflow:ellipsis}
#vcal .k-rsv{background:var(--rsv-bg)}
#vcal .k-mtg{background:var(--mtg-bg)}
#vcal .k-exp{background:var(--exp-bg)}
#vcal .k-fix{background:var(--fix-bg)}
#vcal .k-off{background:var(--off-bg)}
#vcal .chip{color:var(--ink)}
#vcal .chip.k-rsv svg{color:var(--rsv)}
#vcal .chip.k-mtg svg{color:var(--mtg)}
#vcal .chip.k-exp svg{color:var(--exp)}
#vcal .chip.k-fix svg{color:var(--fix)}
#vcal .chip.k-off svg{color:var(--off)}
#vcal .tag.k-rsv{color:var(--rsv)}
#vcal .tag.k-mtg{color:var(--mtg)}
#vcal .tag.k-exp{color:var(--exp)}
#vcal .tag.k-fix{color:var(--fix)}
#vcal .tag.k-off{color:var(--off)}
#vcal .more{font-size:11.5px;color:var(--sub);font-weight:600;padding-left:4px}
#vcal .dots{display:none;gap:3px;flex-wrap:wrap;justify-content:center}
#vcal .dots i{width:7px;height:7px;border-radius:50%}
#vcal .dots i.k-rsv{background:var(--rsv)}
#vcal .dots i.k-mtg{background:var(--mtg)}
#vcal .dots i.k-exp{background:var(--exp)}
#vcal .dots i.k-fix{background:var(--fix)}
#vcal .dots i.k-off{background:var(--off)}
#vcal .week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
#vcal .wdy{border:1px solid var(--line);border-radius:12px;padding:8px;min-height:280px;display:flex;flex-direction:column;gap:5px;background:var(--card);text-align:left;min-width:0}
#vcal .wdy.sel{box-shadow:inset 0 0 0 2px var(--green)}
#vcal .wdy h3{margin:0 0 4px;font-size:12.5px;color:var(--sub);font-weight:600;display:flex;gap:6px;align-items:baseline}
#vcal .wdy h3 b{font-size:18px;color:var(--ink);font-variant-numeric:tabular-nums}
#vcal .wdy .chip{white-space:normal}
#vcal .list{display:grid;gap:14px}
#vcal .lg h3{margin:0 0 6px;font-size:13px;color:var(--sub);font-weight:600}
#vcal .lg h3 b{color:var(--ink)}
#vcal .side{display:grid;gap:12px;align-content:start}
#vcal .panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
#vcal .ph{display:flex;align-items:center;gap:8px;justify-content:flex-start}
#vcal .ph>.psub,#vcal .ph>#fold{margin-left:auto}
#vcal #slStrip:empty{display:none}
#vcal .ph h2{margin:0;font-size:18px;letter-spacing:-.01em}
#vcal .pill{font-size:11.5px;font-weight:700;border-radius:999px;padding:2px 9px;background:var(--tint);color:var(--green)}
#vcal .psub{font-size:12.5px;color:var(--mute);margin:2px 0 10px}
#vcal .alerts{display:grid;gap:8px;margin-bottom:10px}
#vcal .al{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:2px 10px;align-items:center;background:var(--exp-bg);border-radius:12px;padding:10px 12px}
#vcal .al svg{width:18px;height:18px;color:var(--exp);grid-row:1 / span 2}
#vcal .al b{font-size:13.5px}
#vcal .al small{grid-column:2;color:var(--sub);font-size:12px}
#vcal .al button{grid-row:1 / span 2;grid-column:3;border:1px solid var(--exp);background:transparent;color:var(--exp);border-radius:8px;padding:5px 10px;font-weight:700;font-size:12.5px}
#vcal .al.done{opacity:.55}
#vcal .al.done b{text-decoration:line-through}
#vcal .tl{display:grid}
#vcal .ev{display:grid;grid-template-columns:52px minmax(0,1fr);gap:2px 12px;padding:12px 0;border-top:1px solid var(--line)}
#vcal .ev:first-child{border-top:0}
#vcal .ev .tm{font-weight:700;font-variant-numeric:tabular-nums;font-size:14px;padding-top:1px}
#vcal .ev .tm.all{font-size:12px;color:var(--mute);font-weight:600}
#vcal .ev .bd{display:grid;gap:3px;min-width:0}
#vcal .ev .tg{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#vcal .tag{font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px}
#vcal .ev b{font-size:14.5px}
#vcal .ev .meta{font-size:12.5px;color:var(--sub)}
#vcal .ev .rm{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--mute)}
#vcal .ev .rm svg{width:13px;height:13px}
#vcal .ev .rm.on{color:var(--green)}
#vcal .ev .acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
#vcal .ev .acts button{border:1px solid var(--line);background:var(--card);border-radius:8px;padding:4px 10px;font-size:12.5px;font-weight:600}
#vcal .ev .acts button:hover{background:var(--hover)}
#vcal .empty{font-size:13px;color:var(--mute);padding:14px 0}
#vcal .addday{width:100%;margin-top:6px;border:1px dashed var(--line);background:transparent;border-radius:10px;padding:10px;font-weight:700;color:var(--sub)}
#vcal .remind h2{font-size:15px}
#vcal .remind ul{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}
#vcal .remind li{display:grid;grid-template-columns:auto minmax(0,1fr);gap:1px 10px;font-size:13px}
#vcal .remind li .w{font-weight:700;font-variant-numeric:tabular-nums;color:var(--green);white-space:nowrap}
#vcal .remind li small{grid-column:2;color:var(--mute);font-size:12px}
#vcal .push{margin-top:10px;background:var(--soft);border-radius:12px;padding:10px 12px;display:grid;grid-template-columns:28px minmax(0,1fr);gap:0 10px;align-items:start}
#vcal .push .ic{width:28px;height:28px;border-radius:7px;background:var(--deep);display:grid;place-items:center}
#vcal .push .ic svg{width:16px;height:16px;color:var(--on-main)}
#vcal .push b{font-size:12.5px}
#vcal .push p{margin:1px 0 0;font-size:12.5px;color:var(--sub)}
#vcal .push .from{font-size:11px;color:var(--mute)}
#vcal .scrim{position:fixed;inset:0;background:rgba(8,16,12,.45);display:grid;place-items:end center;z-index:20;padding:0}
@media(min-width:700px){
#vcal .scrim{place-items:center;padding:16px}
}
#vcal .sheet{background:var(--card);width:100%;max-width:520px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px))}
@media(min-width:700px){
#vcal .sheet{border-radius:18px}
}
#vcal .sheet h2{margin:0 0 12px;font-size:18px}
#vcal .kinds{display:grid;grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:6px}
#vcal .kinds button{border:1.5px solid var(--line);background:var(--card);border-radius:10px;padding:9px 6px;font-weight:700;font-size:13px;display:flex;gap:6px;justify-content:center;align-items:center}
#vcal .kinds button .sw{margin-right:2px}
#vcal .kinds button[aria-pressed=true]{border-color:var(--ink)}
#vcal .fld{display:grid;gap:5px;margin-top:12px;font-size:12.5px;font-weight:600;color:var(--sub)}
#vcal .fld input,#vcal .fld select,#vcal .fld textarea{border:1.5px solid var(--line);background:var(--card);border-radius:10px;padding:9px 11px;font-size:14.5px;color:var(--ink);width:100%;min-width:0}
#vcal .row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#vcal .rms{display:flex;flex-wrap:wrap;gap:6px}
#vcal .rms button{border:1.5px solid var(--line);background:var(--card);border-radius:999px;padding:5px 12px;font-size:13px;font-weight:600;color:var(--sub)}
#vcal .rms button[aria-pressed=true]{border-color:var(--green);color:var(--green);background:var(--tint)}
#vcal .hint{font-size:12px;color:var(--mute);font-weight:400}
#vcal .sacts{display:flex;gap:8px;margin-top:16px}
#vcal .sacts button{flex:1;height:44px;border-radius:12px;font-weight:700;border:1px solid var(--line);background:var(--card)}
#vcal .sacts .main{background:var(--deep);border-color:var(--deep);color:var(--on-main);flex:2}
#vcal .msg{margin-top:12px;background:var(--soft);border-radius:12px;padding:12px;font-size:13.5px;white-space:pre-wrap;line-height:1.6}
#vcal .toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--bg);font-size:13px;font-weight:600;padding:9px 14px;border-radius:10px;z-index:30;max-width:calc(100% - 32px)}
#vcal .k-rsv{--kc:var(--rsv)}
#vcal .k-mtg{--kc:var(--mtg)}
#vcal .k-exp{--kc:var(--exp)}
#vcal .k-fix{--kc:var(--fix)}
#vcal .k-off{--kc:var(--off)}
#vcal [data-chip=dot] .chip svg{display:none}
#vcal [data-chip=dot] .chip::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--kc);flex:none}
#vcal [data-chip=fill] .chip.k-rsv{background:var(--rsvF);color:var(--onF)}
#vcal [data-chip=fill] .chip.k-mtg{background:var(--mtgF);color:var(--onF)}
#vcal [data-chip=fill] .chip.k-rsv svg,#vcal [data-chip=fill] .chip.k-mtg svg{color:var(--onF)}
#vcal [data-chip=fill] .chip.k-exp{background:var(--exp-bg);color:var(--expT);box-shadow:inset 0 0 0 1.5px var(--exp);font-weight:700}
#vcal [data-chip=fill] .chip.k-fix{background:transparent;color:var(--fix);font-weight:600;padding-left:2px}
#vcal [data-chip=fill] .chip.k-off{background:repeating-linear-gradient(135deg,var(--off-bg) 0 4px,transparent 4px 8px);color:var(--sub)}
#vcal .chip .imp{width:11px!important;height:11px!important;color:var(--st-star)!important;display:inline-block!important;margin-left:-2px}
#vcal .stk{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;border-radius:999px;padding:1px 7px 1px 3px;background:var(--card);box-shadow:inset 0 0 0 1.5px var(--sc);color:var(--sc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
#vcal .stk i{width:16px;height:16px;border-radius:50%;background:var(--sc);display:grid;place-items:center;flex:none}
#vcal .stk i svg{width:10px;height:10px;color:#fff}
#vcal .stk.only{padding:1px}
#vcal .cell.has-stk{box-shadow:inset 0 3px 0 var(--sc)}
#vcal .cell.has-stk.sel{box-shadow:inset 0 0 0 2px var(--green),inset 0 5px 0 var(--sc)}
#vcal .s-star{--sc:var(--st-star)}
#vcal .s-flag{--sc:var(--st-flag)}
#vcal .s-alert{--sc:var(--st-alert)}
#vcal .s-heart{--sc:var(--st-heart)}
#vcal .s-party{--sc:var(--st-party)}
#vcal .dayst{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-4px 0 10px}
#vcal .dayst .stk{font-size:12.5px;padding:3px 10px 3px 4px}
#vcal .dayst .stk i{width:20px;height:20px}
#vcal .dayst .stk i svg{width:12px;height:12px}
#vcal .stbtn{border:1px dashed var(--line);background:transparent;border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:600;color:var(--sub)}
#vcal .stpick{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:4px}
#vcal .stpick button{border:1.5px solid var(--line);background:var(--card);border-radius:12px;padding:10px 4px;display:grid;justify-items:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--sub)}
#vcal .stpick button i{width:30px;height:30px;border-radius:50%;background:var(--sc);display:grid;place-items:center}
#vcal .stpick button i svg{width:16px;height:16px;color:#fff}
#vcal .stpick button[aria-pressed=true]{border-color:var(--sc);color:var(--ink)}
#vcal .ev .star{border:0;background:transparent;padding:0;display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;color:var(--mute)}
#vcal .ev .star svg{width:14px;height:14px}
#vcal .ev .star[aria-pressed=true]{color:var(--st-star)}
#vcal .dots i.stdot{width:auto;height:auto;background:none;border-radius:0}
#vcal .vset{position:relative}
#vcal .pop{position:absolute;right:0;top:40px;z-index:15;background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 14px 34px -14px rgba(10,20,15,.35);padding:14px;width:min(410px,calc(100vw - 32px))}
#vcal .pop h3{margin:0 0 8px;font-size:13px;color:var(--sub);font-weight:700}
#vcal .pop h3+.opts{margin-bottom:14px}
#vcal .opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px}
#vcal .opt{border:1.5px solid var(--line);background:var(--card);border-radius:10px;padding:8px;display:grid;gap:6px;justify-items:center;font-size:12.5px;font-weight:600;color:var(--sub)}
#vcal .opt[aria-pressed=true]{border-color:var(--green);color:var(--ink);background:var(--tint)}
#vcal .opt svg.wf{width:100%;height:auto;max-width:130px}
#vcal .opt .chip{width:100%}
#vcal .pop small{display:block;font-size:11.5px;color:var(--mute)}
@media(min-width:1100px){
#vcal [data-layout=left] .frame{display:grid;grid-template-columns:260px minmax(0,1fr)!important;gap:16px}
#vcal [data-layout=left] .lpanel{display:flex;flex-direction:column;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;align-self:start}
#vcal [data-layout=left] .app{grid-template-columns:minmax(0,1fr)!important}
#vcal [data-layout=left] .side{display:none}
}
#vcal .lpanel .lbl{font-size:12.5px;font-weight:700;color:var(--sub);margin-bottom:6px}
#vcal .lpanel select{width:100%;height:38px;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:0 10px}
#vcal .lpanel .lays{flex-direction:column;gap:2px}
#vcal .lpanel .lay{border:0;background:transparent;height:32px;padding:0 4px}
#vcal .lpanel .remind{border:0;padding:0}
#vcal .mini{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums}
#vcal .mini .mh{color:var(--mute);font-size:11px;padding:2px 0}
#vcal .mini button{border:0;background:transparent;height:28px;border-radius:50%;font-size:12px;position:relative}
#vcal .mini button.o{color:var(--mute);opacity:.5}
#vcal .mini button.t{background:var(--deep);color:var(--on-main);font-weight:700}
#vcal .mini button.s:not(.t){box-shadow:inset 0 0 0 1.5px var(--green)}
#vcal .mini button.e::after{content:"";position:absolute;left:50%;bottom:2px;width:4px;height:4px;border-radius:50%;background:var(--green);transform:translateX(-50%)}
#vcal .mini button.t.e::after{background:var(--on-main)}
#vcal .mtop{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-weight:700}
#vcal .mtop button{border:0;background:transparent;width:26px;height:26px;border-radius:7px}
#vcal #day.strip{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:14px;overflow-x:auto;margin-top:14px}
#vcal #day.strip .sh{flex:none;padding-right:14px;border-right:1px solid var(--line)}
#vcal #day.strip .sh h2{margin:0;font-size:17px}
#vcal #day.strip .sh .psub{margin:2px 0 0}
#vcal #day.strip .sc{flex:none;display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 8px;align-items:center;border:0;border-radius:12px;padding:10px 14px;min-width:210px;max-width:260px;text-align:left}
#vcal #day.strip .sc svg{width:15px;height:15px;color:var(--kc)}
#vcal #day.strip .sc b{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#vcal #day.strip .sc small{grid-column:2;color:var(--sub);font-size:12px}
#vcal #day.strip .more2{flex:none;width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:var(--card)}
#vcal .kc{display:grid;gap:8px;margin-bottom:12px}
#vcal .kc-row{display:grid;grid-template-columns:84px minmax(0,1fr);align-items:center;gap:8px;font-size:12.5px;font-weight:600}
#vcal .kc-sw{display:flex;flex-wrap:wrap;gap:5px}
#vcal .kc-sw button{width:19px;height:19px;border-radius:50%;border:0;padding:0;background:var(--c)}
#vcal .kc-sw button[aria-pressed=true]{box-shadow:0 0 0 2px var(--card),0 0 0 4px var(--ink)}
#vcal .pop h3 small{display:inline;font-weight:500;color:var(--mute);margin-left:6px}
#vcal .reset{border:0;background:none;color:var(--sub);text-decoration:underline;font-size:12px;padding:0;margin-bottom:12px}
#vcal .cpick{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
#vcal .cbtn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:5px 12px 5px 6px;font-size:12.5px;font-weight:600}
#vcal .cbtn i{width:18px;height:18px;border-radius:50%}
#vcal .cbtn span{color:var(--mute);font-weight:500}
#vcal .pk-top{display:flex;align-items:center;gap:8px;margin-bottom:10px}
#vcal .pk-top .tbtn{width:34px;padding:0}
#vcal .pk-prev{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:12px}
#vcal .bgprev{grid-column:1 / -1;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px}
#vcal .bgprev .c{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px;display:grid;gap:4px}
#vcal .pk-lbl{font-size:12px;color:var(--sub);font-weight:600}
#vcal input.hue{-webkit-appearance:none;appearance:none;width:100%;height:26px;border-radius:999px;margin:6px 0 12px;background:linear-gradient(90deg,hsl(0 70% 50%),hsl(60 70% 50%),hsl(120 70% 45%),hsl(180 70% 45%),hsl(240 70% 55%),hsl(300 70% 50%),hsl(359 70% 50%));cursor:pointer}
#vcal input.hue.soft{background:linear-gradient(90deg,hsl(0 45% 88%),hsl(60 45% 86%),hsl(120 40% 86%),hsl(180 40% 86%),hsl(240 45% 90%),hsl(300 40% 90%),hsl(359 45% 88%))}
#vcal input.hue::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#fff;border:3px solid var(--ink);box-shadow:0 2px 6px rgba(0,0,0,.3)}
#vcal input.hue::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid var(--ink)}
#vcal .pk-pre{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
#vcal .pre{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);background:var(--card);border-radius:999px;padding:3px 9px 3px 4px;font-size:12px;font-weight:600;color:var(--sub)}
#vcal .pre i{width:16px;height:16px;border-radius:50%}
#vcal .pk-warn{font-size:12.5px;font-weight:600;color:var(--hol);margin-bottom:8px}
#vcal .fsw{display:grid;margin-bottom:14px;border:1px solid var(--line);border-radius:10px;padding:2px 10px}
#vcal .fsw label{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid var(--line);font-size:13px;font-weight:600;cursor:pointer;position:relative}
#vcal .fsw label:first-child{border-top:0}
#vcal .fsw input.swi{position:absolute;opacity:0;width:1px;height:1px}
#vcal .sw2{width:38px;height:22px;border-radius:999px;background:var(--line);position:relative;flex:none;transition:background .15s}
#vcal .sw2::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s}
#vcal .swi:checked+.sw2{background:var(--green)}
#vcal .swi:checked+.sw2::after{left:19px}
#vcal .swi:focus-visible+.sw2{box-shadow:0 0 0 3px var(--tint)}
#vcal .pop{max-height:calc(100vh - 140px);overflow:auto}
#vcal .tag.s-done{background:var(--soft);color:var(--sub)}
#vcal .tag.s-noshow{background:var(--hol-bg);color:var(--hol)}
#vcal .tag.s-cancel{background:var(--soft);color:var(--mute)}
#vcal .tag.s-rep{background:var(--soft);color:var(--sub)}
#vcal .ev b.cx{text-decoration:line-through;color:var(--mute)}
#vcal .wn{font-size:12.5px;font-weight:600;color:var(--hol);background:var(--hol-bg);border-radius:8px;padding:4px 8px;margin-top:2px}
#vcal .sheet .wn{margin-top:8px}
#vcal .pcl{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font-size:12.5px;color:var(--sub);background:var(--soft);border-radius:10px;padding:8px 10px;margin:8px 0 4px}
#vcal .pcl b{color:var(--ink);width:100%}
#vcal .pcl span{font-variant-numeric:tabular-nums}
#vcal .chip.s-cancel{text-decoration:line-through;opacity:.5}
#vcal .chip.s-noshow{opacity:.6;text-decoration:line-through}
#vcal .chip.s-done{opacity:.75}
#vcal .ev .acts .xtra{display:contents}
#vcal .ev .acts .xtra[hidden]{display:none}
#vcal .ev .acts .more3{min-width:34px}
@media(max-width:720px){
#vcal .main{padding:14px 12px 12px}
#vcal .top h1{font-size:19px}
#vcal .cell{min-height:58px;padding:4px 2px;align-items:center}
#vcal .dh{justify-content:center}
#vcal .hn,#vcal .cell .chip,#vcal .cell .more{display:none}
#vcal .dots{display:flex}
#vcal .cell .dh{flex-direction:column;gap:1px;min-height:0}
#vcal .cell .stk{font-size:0;padding:0;box-shadow:none;background:none;gap:0;max-width:none}
#vcal .cell .stk i{width:14px;height:14px}
#vcal .cell .stk i svg{width:8px;height:8px}
#vcal .lays{flex-wrap:nowrap;overflow-x:auto;width:100%;padding-bottom:2px;scrollbar-width:none}
#vcal .bar select{flex:1}
#vcal .week{grid-template-columns:1fr}
#vcal .wdy{min-height:0}
}`

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const pad = (n) => String(n).padStart(2, '0')
const dk = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const same = (a, b) => dk(a) === dk(b)
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const md2 = (k) => { const d = new Date(k + 'T00:00'); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})` }
const ampm = (t) => { const [h, m] = t.split(':').map(Number); return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시${m ? ` ${m}분` : ''}` }
const digits = (v) => String(v || '').replace(/\D/g, '')
const fmtPh = (v) => { const d = digits(v); if (!d) return ''; if (d.startsWith('02')) return d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3'); return d.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3') }
const LS = { get(k, d) { try { return localStorage.getItem(k) || d } catch (e) { return d } }, set(k, v) { try { localStorage.setItem(k, v) } catch (e) {} } }

const IC = {
  rsv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  mtg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/></svg>',
  exp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  fix: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m8 12 3 3 5-6"/></svg>',
  off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  starO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
}
const STK = {
  star: { n: '중요', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>' },
  alert: { n: '꼭 챙기기', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v9M12 19h.01"/></svg>' },
  flag: { n: '마감', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 21V4h11l-1.5 4L16 12H7v9z"/></svg>' },
  party: { n: '행사', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>' },
  heart: { n: '기념일', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>' },
}
const KC = { rsv: 1, mtg: 1, exp: 1, fix: 1, off: 1 }
const KN0 = { rsv: '손님 예약', mtg: '거래처 미팅', exp: '보관기한', fix: '고정업무', off: '휴무' }
// 알림 — 담당자 폰으로. 아침 9시 · 오후 6시는 하루 두 번 도는 작업, 「1시간 전」은 매분 도는 작업(api/remind-now, v6.12 Pro)
const RM = { none: '알림 없음', '1h': '1시간 전', am9: '당일 아침 9시', prev18: '전날 오후 6시' }
const DEF_RM = { rsv: 'prev18', mtg: 'prev18', exp: 'am9', fix: 'none', off: 'none' }
const STS = { plan: '', done: '완료', noshow: '노쇼', cancel: '취소' }
const ST_DB = { plan: 'confirmed', done: 'done', noshow: 'noshow', cancel: 'cancelled' }
const FK = { rsv: 'cal_rsv', mtg: 'cal_mtg', exp: 'cal_exp', stk: 'cal_stk', msg: 'cal_msg', rem: 'cal_rem', deco: 'cal_deco' }

export async function openCalendar(host = {}) {
  if (document.getElementById('vcal')) return
  const ctx = await getContext()
  const T = ctx.tenantId, ME = ctx.profileId
  const isAdmin = ['owner', 'manager'].includes(ctx.profile?.role)
  const STORES = ((host.stores && host.stores.length) ? host.stores : (ctx.stores || [])).map((s) => ({ id: s.id, name: s.name }))
  const storeName = (id) => (id ? (STORES.find((s) => s.id === id) || {}).name || '' : '전 매장')
  const CO = host.co || (window.__vflowTenant || {}).name || ''

  // ── 상태 ──
  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0)
  let view = LS.get('dv_cal_view', 'month'), cur = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1), sel = new Date(TODAY)
  const on = { rsv: 1, mtg: 1, exp: 1, fix: 1, off: 1 }
  let fStore = 'all', fWho = 'all', stripOpen = false, loadSeq = 0, loadedRange = null
  const feat = {}
  const featFrom = (f) => { Object.entries(FK).forEach(([k, key]) => { feat[k] = (f || {})[key] === false ? 0 : 1 }) }
  featFrom(host.features)
  const KN = { ...KN0, ...((host.features || {}).cal_names || {}) }
  const kinds = () => Object.keys(KC).filter((k) => !(k in FK) || feat[k])
  // 데이터
  let profiles = [], guests = [], clients = [], items = [], services = []
  let appts = [], lots = [], dayoffs = [], closures = [], marks = [], hol = {}
  let events = []

  // ── 뼈대 ──
  const root = document.createElement('div'); root.id = 'vcal'
  root.innerHTML = `<style>${CSS}</style><style data-pal></style>
  <div class="header" style="position:sticky;top:0;z-index:10;"><div><div class="header-title">캘린더</div><div class="header-sub">예약 · 미팅 · 보관기한 · 고정업무 · 휴무</div></div><button class="back-btn" type="button" data-close>닫기</button></div>
  <div class="wrap" data-wrap data-layout="side" data-chip="icon">
   <div data-err></div>
   <div class="frame">
    <aside class="lpanel" aria-label="거르기">
      <div><div class="lbl">매장</div><div data-lp="store"></div></div>
      <div><div class="lbl">담당자</div><div data-lp="who"></div></div>
      <div data-mini></div>
      <div><div class="lbl">일정 종류</div><div data-lp="layers"></div></div>
      <div data-lp="remind"></div>
    </aside>
    <div class="app">
     <section class="main" aria-label="월간 캘린더">
      <div class="top">
        <div class="nav">
          <button class="ib" data-prev aria-label="이전"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
          <h1 data-ttl></h1>
          <button class="ib" data-next aria-label="다음"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
          <button class="tbtn" data-today>오늘</button>
        </div>
        <div class="nav">
          <div class="seg" data-view><button data-v="month">월</button><button data-v="week">주</button><button data-v="list">목록</button></div>
          <div class="vset"><button class="tbtn" data-vbtn aria-expanded="false" aria-haspopup="true">보기</button><div class="pop" data-pop hidden></div></div>
          <button class="add" data-add><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>일정</button>
        </div>
      </div>
      <div class="bar">
        <span data-sl="store"><select data-fstore aria-label="매장"></select></span>
        <span data-sl="who"><select data-fwho aria-label="담당자"></select></span>
        <span data-sl="layers" style="display:contents"><div data-layers class="lays"></div></span>
      </div>
      <div data-body><div class="loading">불러오는 중…</div></div>
     </section>
     <div data-sl="strip" id="slStrip"></div>
     <aside class="side">
      <div data-sl="day"><section class="panel" id="day" data-day aria-live="polite"></section></div>
      <div data-sl="remind"><section class="panel remind" data-remind></section></div>
     </aside>
    </div>
   </div>
  </div>`
  const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)]
  document.body.appendChild(root)
  const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'

  const toast = (t) => { const o = root.querySelector('.toast'); if (o) o.remove(); const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; root.appendChild(d); setTimeout(() => d.remove(), 2400) }
  const fail = (what, e) => { console.warn('[cal]', what, e); toast(`${what} — 저장하지 못했어요. 인터넷을 확인하고 다시 해 주세요`) }
  const close = () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onDoc); removeEventListener('resize', onResize); root.remove(); document.body.style.overflow = prevOverflow; try { host.onClose && host.onClose() } catch (e) {} }
  const onKey = (e) => { if (e.key !== 'Escape') return; const sc = root.querySelector('.scrim'); if (sc) { sc.remove(); return } if (!$('[data-pop]').hidden) { $('[data-pop]').hidden = true; return } close() }
  document.addEventListener('keydown', onKey)
  $('[data-close]').onclick = close

  // ── 불러오기 ──
  function gridRange() {
    let a, b
    if (view === 'week') { a = weekStart(sel); b = new Date(a); b.setDate(a.getDate() + 6) }
    else if (view === 'list') { a = new Date(TODAY); b = new Date(TODAY); b.setDate(b.getDate() + 45) }
    else { const f = new Date(cur.getFullYear(), cur.getMonth(), 1); a = new Date(f); a.setDate(1 - f.getDay()); b = new Date(a); b.setDate(a.getDate() + 41) }
    // 알림 칸이 쓰는 어제 · 오늘 · 내일은 늘 같이
    const y = new Date(TODAY); y.setDate(y.getDate() - 1); const t2 = new Date(TODAY); t2.setDate(t2.getDate() + 1)
    if (y < a) a = y; if (t2 > b) b = t2
    return [dk(a), dk(b)]
  }
  async function loadStatic() {
    const q = await Promise.all([
      sb.from('profiles').select('id,name,role,status,store_id').eq('tenant_id', T).order('name'),
      sb.from('guests').select('id,name,phone,visits,noshows').eq('tenant_id', T).order('name').limit(3000),
      sb.from('clients').select('id,name,phone').eq('tenant_id', T).order('name').limit(2000),
      sb.from('expiry_items').select('id,name,unit').eq('tenant_id', T).limit(2000),
      sb.from('booking_services').select('id,name,duration_min').eq('tenant_id', T).limit(500),
    ])
    const bad = q.find((r) => r.error); if (bad) throw bad.error
    profiles = (q[0].data || []).filter((p) => p.status !== 'inactive' && p.status !== 'left')
    guests = q[1].data || []; clients = q[2].data || []; items = q[3].data || []; services = q[4].data || []
  }
  async function loadRange(force) {
    const [a, b] = gridRange()
    if (!force && loadedRange && loadedRange[0] <= a && loadedRange[1] >= b) return
    const seq = ++loadSeq
    const from = new Date(a + 'T00:00').toISOString(), to = new Date(b + 'T23:59:59').toISOString()
    const q = await Promise.all([
      sb.from('appointments').select('*').eq('tenant_id', T).gte('starts_at', from).lte('starts_at', to).order('starts_at').limit(3000),
      sb.from('expiry_lots').select('*').eq('tenant_id', T).in('status', ['active', 'used']).gte('due_on', a).lte('due_on', b).limit(3000),
      sb.from('dayoffs').select('id,profile_id,dayoff_date').eq('tenant_id', T).gte('dayoff_date', a).lte('dayoff_date', b).limit(3000),
      sb.from('store_closures').select('*').eq('tenant_id', T).gte('close_date', a).lte('close_date', b),
      sb.from('calendar_marks').select('*').eq('tenant_id', T).gte('mark_date', a).lte('mark_date', b),
      sb.from('public_holidays').select('date,label').gte('date', a).lte('date', b),
    ])
    if (seq !== loadSeq) return
    const bad = q.find((r) => r.error); if (bad) throw bad.error
    appts = q[0].data || []; lots = q[1].data || []; dayoffs = q[2].data || []; closures = q[3].data || []; marks = q[4].data || []
    hol = {}; (q[5].data || []).forEach((h) => { hol[h.date] = h.label })
    loadedRange = [a, b]
  }
  const prof = (id) => profiles.find((p) => p.id === id)
  const tOf = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
  const dOf = (iso) => dk(new Date(iso))
  function build() {
    events = []
    appts.forEach((r) => {
      const g = r.guest_id ? guests.find((x) => x.id === r.guest_id) : null
      const c = r.client_id ? clients.find((x) => x.id === r.client_id) : null
      const sv = r.service_id ? services.find((x) => x.id === r.service_id) : null
      const x = g ? { c: g.name, p: fmtPh(g.phone), gid: g.id } : c ? { c: c.name, p: c.phone || '', cid: c.id } : (r.extra && r.extra.party) ? { c: r.extra.party, p: r.extra.phone || '' } : null
      const st = r.status === 'done' ? 'done' : r.status === 'noshow' ? 'noshow' : r.status === 'cancelled' ? 'cancel' : 'plan'
      events.push({ id: 'a' + r.id, row: r, k: r.kind === 'booking' ? 'rsv' : 'mtg', date: dOf(r.starts_at), t: tOf(r.starts_at), title: r.title || (sv && sv.name) || (r.kind === 'booking' ? '예약' : '미팅'),
        storeId: r.store_id, store: storeName(r.store_id), whoId: r.staff_id, who: (prof(r.staff_id) || {}).name || '', x, rm: r.remind || 'none', dur: r.duration_min || 60, st,
        req: r.status === 'request' ? '요청' : r.status === 'offered' ? '제안' : '', sid: r.series_id, repl: r.series_rule,
        moved: r.moved_from ? `${md2(dOf(r.moved_from))} ${tOf(r.moved_from)} → ${md2(dOf(r.starts_at))} ${tOf(r.starts_at)}` : '', note: r.note || '', imp: !!r.important, src: r.source })
    })
    lots.forEach((r) => {
      const it = items.find((i) => i.id === r.item_id) || {}
      const q = Number(r.qty) || 0
      events.push({ id: 'l' + r.id, row: r, k: 'exp', date: r.due_on, t: null, title: `${it.name || '품목'}${q && q !== 1 ? ` ${q}${it.unit || ''}` : ''}`, storeId: r.store_id, store: storeName(r.store_id), whoId: null, who: '', rm: 'am9', st: r.status === 'used' ? 'done' : 'plan' })
    })
    // 고정업무 — 규칙에서 나온다(설정 › 일하는 방식 › 고정업무)
    if (host.rulesFor && loadedRange) {
      const d = new Date(loadedRange[0] + 'T00:00'), end = new Date(loadedRange[1] + 'T00:00'); let i = 0
      while (d <= end) {
        let list = []; try { list = host.rulesFor(d.getFullYear(), d.getMonth(), d.getDate()) || [] } catch (e) {}
        list.forEach((title) => events.push({ id: `f${dk(d)}-${i++}`, k: 'fix', date: dk(d), t: null, title, storeId: null, store: '전 매장', whoId: null, who: '', rm: 'none', st: 'plan' }))
        d.setDate(d.getDate() + 1)
      }
    }
    dayoffs.forEach((r) => { const p = prof(r.profile_id); events.push({ id: 'd' + r.id, row: r, k: 'off', date: r.dayoff_date, t: null, title: `${p ? p.name : '직원'} 휴무`, storeId: p ? p.store_id : null, store: p ? storeName(p.store_id) : '', whoId: r.profile_id, who: p ? p.name : '', rm: 'none', st: 'plan' }) })
    closures.forEach((r) => events.push({ id: 'c' + r.id, row: r, k: 'off', date: r.close_date, t: null, title: `${r.label || '휴무'}${r.store_id ? '' : ' · 전 매장'}`, storeId: r.store_id, store: storeName(r.store_id), whoId: null, who: '', rm: 'none', st: 'plan', closure: 1 }))
  }
  const markOf = (k) => { const m = marks.filter((x) => x.mark_date === k); return m.find((x) => fStore !== 'all' && x.store_id === fStore) || m.find((x) => !x.store_id) || (fStore === 'all' ? m[0] : null) || null }

  // ── 거르기 ──
  function visible() {
    return events.filter((e) => on[e.k] && kinds().includes(e.k)
      && (fStore === 'all' || !e.storeId || e.storeId === fStore)
      && (fWho === 'all' || e.whoId === fWho || (!e.whoId && e.k !== 'rsv' && e.k !== 'mtg')))
  }
  const sortEv = (a) => a.slice().sort((x, y) => (x.k === 'exp' ? -1 : 0) - (y.k === 'exp' ? -1 : 0) || ((x.t || '00:00') < (y.t || '00:00') ? -1 : 1))
  const P = (e) => e.k === 'rsv' || e.k === 'mtg'
  function clashOf(e, list) {
    if (!e.t || !P(e) || e.st === 'cancel' || e.st === 'noshow' || !e.whoId) return null
    const a = toMin(e.t), b = a + (e.dur || 60)
    return (list || events).find((o) => o.id !== e.id && P(o) && o.date === e.date && o.whoId === e.whoId && o.t && o.st !== 'cancel' && o.st !== 'noshow' && toMin(o.t) < b && a < toMin(o.t) + (o.dur || 60)) || null
  }
  const guestBy = (name, phone) => { const d = digits(phone); return (d && guests.find((g) => g.phone === d)) || (name && guests.filter((g) => g.name === name).length === 1 ? guests.find((g) => g.name === name) : null) || null }
  function chip(e) {
    const tm = (feat.stk && e.imp ? `<svg class="imp" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>` : '') + (e.t ? `<span class="t">${e.t}</span>` : '')
    const tt = e.k === 'exp' ? `${esc(e.title)} 기한` : esc(e.title)
    return `<div class="chip k-${e.k}${e.st && e.st !== 'plan' ? ' s-' + e.st : ''}">${IC[e.k]}${tm}<span>${tt}</span></div>`
  }
  const stk = (k, label, cls) => { const x = STK[k] || STK.star; return `<span class="stk s-${k}${label ? '' : ' only'}${cls ? ' ' + cls : ''}"><i>${x.svg}</i>${label ? esc(label) : ''}</span>` }
  function renderFilters() {
    $('[data-fstore]').innerHTML = '<option value="all">전체 매장</option>' + STORES.map((s) => `<option value="${s.id}"${fStore === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
    $('[data-fwho]').innerHTML = '<option value="all">모든 담당자</option>' + profiles.map((p) => `<option value="${p.id}"${fWho === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')
  }
  function renderLayers() {
    const mk = dk(cur).slice(0, 7), v = events.filter((e) => e.date.startsWith(mk))
    $('[data-layers]').innerHTML = kinds().map((k) => `<button class="lay" data-k="${k}" aria-pressed="${!!on[k]}"><span class="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></span><span class="sw k-${k}"></span>${esc(KN[k])}<span class="n">${v.filter((e) => e.k === k).length}</span></button>`).join('')
    $$('.lay').forEach((b) => b.onclick = () => { on[b.dataset.k] = on[b.dataset.k] ? 0 : 1; render() })
  }
  const weekStart = (d) => { const w = new Date(d); w.setDate(d.getDate() - d.getDay()); return w }
  const closedWeekly = (d) => { if (fStore === 'all' || !host.hours) return false; try { return (host.hours(fStore).off || []).includes(d.getDay()) } catch (e) { return false } }

  // ── 그리기 ──
  function render() {
    place(); renderLayers()
    const y = cur.getFullYear(), m = cur.getMonth()
    $('[data-ttl]').innerHTML = view === 'week' ? `${sel.getMonth() + 1}월 <small>${weekStart(sel).getDate()}일 주</small>` : view === 'list' ? '다가오는 일정' : `${y}년 ${m + 1}월`
    $$('[data-view] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === view))
    const vis = visible(), by = {}; vis.forEach((e) => (by[e.date] = by[e.date] || []).push(e))
    const B = $('[data-body]')
    if (view === 'month') {
      const first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay())
      let h = DOW.map((d, i) => `<div class="dow${i === 0 ? ' su' : i === 6 ? ' sa' : ''}">${d}</div>`).join('')
      const cells = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7) * 7
      for (let i = 0; i < cells; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i); const k = dk(d), list = sortEv(by[k] || []), out = d.getMonth() !== m
        const st = feat.stk ? markOf(k) : null
        const cls = ['cell', st && !out ? 'has-stk s-' + st.sticker : '', out ? 'out' : '', same(d, TODAY) ? 'today' : '', same(d, sel) ? 'sel' : '', d.getDay() === 0 ? 'su' : '', d.getDay() === 6 ? 'sa' : '', hol[k] ? 'hol' : ''].join(' ')
        const wk = closedWeekly(d) ? '정기 휴무' : ''
        h += `<button class="${cls}" data-d="${k}" aria-label="${d.getMonth() + 1}월 ${d.getDate()}일 일정 ${list.length}개"><div class="dh"><span class="dn">${d.getDate()}</span>${st && !out ? stk(st.sticker, st.label) : hol[k] ? `<span class="hn">${esc(hol[k])}</span>` : wk ? `<span class="hn" style="color:var(--mute)">${wk}</span>` : ''}</div>` +
          list.slice(0, 3).map(chip).join('') + (list.length > 3 ? `<div class="more">+${list.length - 3}개 더</div>` : '') +
          `<div class="dots">${list.slice(0, 4).map((e) => `<i class="k-${e.k}"></i>`).join('')}</div></button>`
      }
      B.innerHTML = `<div class="grid">${h}</div>`
      $$('.cell').forEach((c) => c.onclick = () => { sel = new Date(c.dataset.d + 'T00:00'); if (sel.getMonth() !== cur.getMonth()) { cur = new Date(sel.getFullYear(), sel.getMonth(), 1); refresh() } else render() })
    } else if (view === 'week') {
      const ws = weekStart(sel); let h = ''
      for (let i = 0; i < 7; i++) {
        const d = new Date(ws); d.setDate(ws.getDate() + i); const k = dk(d), list = sortEv(by[k] || []), st = feat.stk ? markOf(k) : null
        h += `<button class="wdy${same(d, sel) ? ' sel' : ''}" data-d="${k}"><h3><b style="${d.getDay() === 0 || hol[k] ? 'color:var(--hol)' : ''}">${d.getDate()}</b>${DOW[d.getDay()]}${hol[k] ? ` · ${esc(hol[k])}` : ''}</h3>${st ? stk(st.sticker, st.label) : ''}${list.map(chip).join('') || '<span class="empty" style="padding:0">없음</span>'}</button>`
      }
      B.innerHTML = `<div class="week">${h}</div>`
      $$('.wdy').forEach((c) => c.onclick = () => { sel = new Date(c.dataset.d + 'T00:00'); render() })
    } else {
      const keys = Object.keys(by).filter((k) => k >= dk(TODAY)).sort()
      B.innerHTML = `<div class="list">${keys.map((k) => { const d = new Date(k + 'T00:00'); return `<div class="lg"><h3><b>${d.getMonth() + 1}월 ${d.getDate()}일</b> ${DOW[d.getDay()]}${same(d, TODAY) ? ' · 오늘' : ''}</h3><div class="tl">${sortEv(by[k]).map(evRow).join('')}</div></div>` }).join('') || '<div class="empty">다가오는 일정 없음</div>'}</div>`
      wireRows(B)
    }
    renderDay(); renderRemind(); renderMini()
  }
  function rmLine(e) {
    if (!feat.rem || !e.rm || e.rm === 'none' || !RM[e.rm]) return ''
    const tgt = e.who ? `${esc(e.who)}${e.x && e.x.c ? ' · 관리자' : ''}` : '관리자'
    return `<div class="rm on">${IC.bell}${RM[e.rm]} 알림 · ${tgt}</div>`
  }
  function evRow(e) {
    const x = e.x || {}
    const meta = [e.store, e.who ? `담당 ${e.who}` : ''].filter(Boolean).join(' · ')
    const who = x.c ? `<div class="meta">${esc(x.c)}${x.p ? ` · <a href="tel:${esc(digits(x.p))}" style="color:inherit;font-variant-numeric:tabular-nums">${esc(x.p)}</a>` : ''}</div>` : ''
    const acts = !P(e) ? '' : e.st === 'plan' ? `<div class="acts">${feat.msg ? `<button data-msg="${e.id}">안내 문자</button>` : ''}${e.k === 'rsv' ? `<button data-done="${e.id}">방문 완료</button>` : `<button data-note="${e.id}">미팅 끝 · 한 줄 남기기</button>`}<button class="more3" data-more aria-expanded="false" aria-label="더 보기">…</button><span class="xtra" hidden>${e.k === 'rsv' ? `<button data-ns="${e.id}">노쇼</button>` : ''}<button data-mv="${e.id}">시간 변경</button><button data-cx="${e.id}">취소</button></span></div>`
      : `<div class="acts"><button data-undo="${e.id}">되돌리기</button></div>`
    const cl = P(e) && e.st === 'plan' ? clashOf(e) : null
    const g = e.k === 'rsv' && x.gid ? guests.find((q) => q.id === x.gid) : null
    const warn = (cl ? `<div class="wn">시간 겹침 · 같은 담당 ${esc(cl.t)} ${esc(cl.title)}</div>` : '') + (g && g.noshows && e.st === 'plan' ? `<div class="wn">이 손님 노쇼 ${g.noshows}회 — 전날 안내 문자 꼭</div>` : '')
    const extra = (e.moved ? `<div class="meta">시간 변경 · ${esc(e.moved)}</div>` : '') + (e.note ? `<div class="meta">메모 · ${esc(e.note)}</div>` : '')
    const dur = e.t && P(e) ? ` · ${e.dur >= 60 ? (e.dur / 60) + '시간' : e.dur + '분'}` : ''
    return `<div class="ev"><div class="tm${e.t ? '' : ' all'}">${e.t || '하루'}</div><div class="bd"><div class="tg"><span class="tag k-${e.k}">${esc(KN[e.k])}</span>${e.req ? `<span class="tag s-req">${e.req}</span>` : ''}${e.st && STS[e.st] ? `<span class="tag s-${e.st}">${STS[e.st]}</span>` : ''}${e.repl ? `<span class="tag s-rep">반복 · ${esc(e.repl)}</span>` : ''}${feat.stk && P(e) ? `<button class="star" data-imp="${e.id}" aria-pressed="${e.imp}" aria-label="중요 표시">${e.imp ? IC.star : IC.starO}${e.imp ? '중요' : ''}</button>` : ''}</div><b class="${e.st === 'cancel' ? 'cx' : ''}">${esc(e.title)}</b><div class="meta">${esc(meta)}${dur}</div>${who}${warn}${extra}${e.st === 'plan' ? rmLine(e) : ''}${acts}</div></div>`
  }
  const E = (id) => events.find((x) => x.id === id)
  function wireRows(r) {
    r.querySelectorAll('[data-imp]').forEach((b) => b.onclick = () => { const e = E(b.dataset.imp); patchAppt(e, { important: !e.imp }, '중요 표시') })
    r.querySelectorAll('[data-msg]').forEach((b) => b.onclick = () => openMsg(E(b.dataset.msg)))
    r.querySelectorAll('[data-more]').forEach((b) => b.onclick = () => { const x = b.nextElementSibling; x.hidden = !x.hidden; b.setAttribute('aria-expanded', !x.hidden) })
    r.querySelectorAll('[data-done]').forEach((b) => b.onclick = () => setSt(E(b.dataset.done), 'done', '방문 완료'))
    r.querySelectorAll('[data-ns]').forEach((b) => b.onclick = () => { const e = E(b.dataset.ns); setSt(e, 'noshow', `노쇼로 남겼습니다${e.x && e.x.c ? ` — ${e.x.c}님 다음 예약 때 표시돼요` : ''}`) })
    r.querySelectorAll('[data-cx]').forEach((b) => b.onclick = () => setSt(E(b.dataset.cx), 'cancel', '취소로 남겼습니다 · 알림도 안 가요'))
    r.querySelectorAll('[data-undo]').forEach((b) => b.onclick = () => setSt(E(b.dataset.undo), 'plan', '되돌렸습니다'))
    r.querySelectorAll('[data-note]').forEach((b) => b.onclick = () => openNote(E(b.dataset.note)))
    r.querySelectorAll('[data-mv]').forEach((b) => b.onclick = () => openMove(E(b.dataset.mv)))
  }

  // ── 저장 ──
  async function patchAppt(e, patch, what, msg) {
    const row = e.row, old = { ...row }
    Object.assign(row, patch); build(); render()
    const { error } = await sb.from('appointments').update(patch).eq('id', row.id)
    if (error) { Object.assign(row, old); build(); render(); fail(what, error); return false }
    if (msg) toast(msg)
    return true
  }
  const setSt = (e, st, msg) => patchAppt(e, { status: ST_DB[st] }, '상태 바꾸기', msg)
  async function ensureGuest(name, phone) {
    const d = digits(phone); if (!name && !d) return null
    let g = guestBy(name, d); if (g) return g
    const { data, error } = await sb.from('guests').insert({ tenant_id: T, name: name || '손님', phone: d.length >= 9 ? d : null }).select('id,name,phone,visits,noshows').single()
    if (error) { if (d) { const r = await sb.from('guests').select('id,name,phone,visits,noshows').eq('tenant_id', T).eq('phone', d).maybeSingle(); if (r.data) { guests.push(r.data); return r.data } } throw error }
    guests.push(data); return data
  }
  async function ensureClient(name) {
    const n = (name || '').trim(); if (!n) return null
    const c = clients.find((x) => x.name.replace(/\s/g, '') === n.replace(/\s/g, '')); if (c) return c
    const { data, error } = await sb.from('clients').insert({ tenant_id: T, name: n, owner_id: ME }).select('id,name,phone').single()
    if (error) throw error
    clients.push(data); return data
  }
  async function ensureItem(name) {
    const n = name.trim(); let it = items.find((i) => i.name === n); if (it) return it
    const { data, error } = await sb.from('expiry_items').insert({ tenant_id: T, name: n, how: 'label' }).select('id,name,unit').single()
    if (error) { const r = await sb.from('expiry_items').select('id,name,unit').eq('tenant_id', T).eq('name', n).maybeSingle(); if (r.data) { items.push(r.data); return r.data } throw error }
    items.push(data); return data
  }

  // ── 그날 ──
  const placeB = () => feat.deco && LS.get('dv_cal_layout', 'side') === 'left' && innerWidth >= 1100
  function renderDay() {
    const k = dk(sel), list = sortEv(visible().filter((e) => e.date === k)), exp = list.filter((e) => e.k === 'exp'), rest = list.filter((e) => e.k !== 'exp')
    const isT = same(sel, TODAY), D = $('[data-day]'), st = feat.stk ? markOf(k) : null
    const strip = placeB() && !stripOpen
    D.classList.toggle('strip', strip)
    if (strip) {
      D.innerHTML = `<div class="sh"><h2>${sel.getMonth() + 1}월 ${sel.getDate()}일 ${DOW[sel.getDay()]}요일</h2><div class="psub">${st ? stk(st.sticker, st.label) + ' ' : ''}일정 ${list.length}개</div></div>` +
        list.map((e) => `<button class="sc k-${e.k}" data-open="1">${IC[e.k]}<b>${e.k === 'exp' ? (isT ? '오늘까지 · ' : '') + esc(e.title) : (e.t ? e.t + ' ' : '') + esc(e.title)}</b><small>${esc(e.k === 'exp' ? KN.exp + ' · ' : '')}${esc(e.store)}${e.who && e.k !== 'exp' ? ' · 담당 ' + esc(e.who) : ''}</small></button>`).join('') +
        `<button class="more2" data-open="1" aria-label="자세히">…</button>`
      D.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { stripOpen = true; renderDay() })
      return
    }
    D.innerHTML = `<div class="ph"><h2>${sel.getMonth() + 1}월 ${sel.getDate()}일 ${DOW[sel.getDay()]}요일</h2>${isT ? '<span class="pill">오늘</span>' : ''}${placeB() ? '<button class="tbtn" data-fold>접기</button>' : ''}</div>
      <div class="psub">${hol[k] ? esc(hol[k]) + ' · ' : ''}일정 ${list.length}개</div>
      ${feat.stk && (st || isAdmin) ? `<div class="dayst">${st ? stk(st.sticker, st.label) : ''}${isAdmin ? `<button class="stbtn" data-stbtn>${st ? '표시 바꾸기' : '+ 중요한 날 표시'}</button>` : ''}</div>` : ''}
      ${exp.length ? `<div class="alerts">${exp.map((e) => `<div class="al${e.st === 'done' ? ' done' : ''}">${IC.exp}<b>${isT ? '오늘까지' : `${sel.getMonth() + 1}/${sel.getDate()}까지`} · ${esc(e.title)}</b><small>${esc(KN.exp)} · ${esc(e.store)}</small><button data-ex="${e.id}">${e.st === 'done' ? '되돌리기' : '다 씀'}</button></div>`).join('')}</div>` : ''}
      <div class="tl">${rest.map(evRow).join('') || (exp.length ? '' : '<div class="empty">이 날은 일정 없음</div>')}</div>
      <button class="addday" data-addday>+ 이 날짜에 일정</button>
      ${host.openDayRecord ? '<button class="rec" data-rec>그날 업무 · 인수인계 기록</button>' : ''}`
    D.querySelectorAll('[data-ex]').forEach((b) => b.onclick = async () => {
      const e = E(b.dataset.ex), r = e.row, old = { ...r }, used = r.status !== 'used'
      Object.assign(r, used ? { status: 'used', closed_at: new Date().toISOString(), closed_by: ME } : { status: 'active', closed_at: null, closed_by: null }); build(); render()
      const { error } = await sb.from('expiry_lots').update({ status: r.status, closed_at: r.closed_at, closed_by: r.closed_by }).eq('id', r.id)
      if (error) { Object.assign(r, old); build(); render(); fail('보관기한', error) } else toast(used ? '다 씀으로 남겼어요' : '되돌렸어요')
    })
    wireRows(D)
    D.querySelector('[data-addday]').onclick = () => openAdd(k)
    const sb2 = D.querySelector('[data-stbtn]'); if (sb2) sb2.onclick = () => openSticker(k)
    const f = D.querySelector('[data-fold]'); if (f) f.onclick = () => { stripOpen = false; renderDay() }
    const rc = D.querySelector('[data-rec]'); if (rc) rc.onclick = () => { close(); host.openDayRecord(k) }
  }
  function openSticker(k) {
    const cur0 = markOf(k); let pick = cur0 ? cur0.sticker : 'star'
    const d = new Date(k + 'T00:00')
    const sc = sheet(`<form class="sheet" role="dialog" aria-modal="true" aria-label="중요한 날 표시"><h2>${d.getMonth() + 1}월 ${d.getDate()}일 표시</h2>
      <div class="stpick">${Object.entries(STK).map(([id, x]) => `<button type="button" class="s-${id}" data-s="${id}" aria-pressed="${id === pick}"><i>${x.svg}</i>${x.n}</button>`).join('')}</div>
      <label class="fld">달력에 보일 말 <span class="hint">짧게 · 비워 두면 모양만</span><input data-stt maxlength="12" value="${esc(cur0 ? cur0.label : '')}" placeholder="예) 본사 점검 · 오픈 1주년"></label>
      <div class="fld">보는 사람 <span class="hint">회사 전체 달력에 보여요</span></div>
      <div class="sacts">${cur0 ? '<button type="button" data-del>표시 지우기</button>' : '<button type="button" data-x>취소</button>'}<button type="submit" class="main">붙이기</button></div></form>`)
    const paint = () => sc.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === pick))
    sc.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { pick = b.dataset.s; paint() })
    const del = sc.querySelector('[data-del]')
    if (del) del.onclick = async () => { const { error } = await sb.from('calendar_marks').delete().eq('id', cur0.id); if (error) return fail('표시 지우기', error); marks = marks.filter((m) => m.id !== cur0.id); sc.remove(); render(); toast('표시를 지웠습니다') }
    sc.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault(); const label = sc.querySelector('[data-stt]').value.trim()
      const q = cur0 ? sb.from('calendar_marks').update({ sticker: pick, label }).eq('id', cur0.id).select().single()
        : sb.from('calendar_marks').insert({ tenant_id: T, store_id: null, mark_date: k, sticker: pick, label, created_by: ME }).select().single()
      const { data, error } = await q; if (error) return fail('중요한 날 표시', error)
      marks = marks.filter((m) => m.id !== data.id).concat(data); sc.remove(); render(); toast('표시했습니다')
    }
  }
  // 알림 — 무엇이 언제 누구에게 가는지 미리
  function renderRemind() {
    const R = $('[data-remind]'); if (!feat.rem) { R.hidden = true; return } R.hidden = false
    const K = (e) => kinds().includes(e.k) && e.st === 'plan'
    const t = new Date(TODAY); t.setDate(t.getDate() + 1); const tk = dk(t), td = dk(TODAY), hr = new Date().getHours()
    const who = (a) => [...new Set(a.map((e) => e.who).filter(Boolean))].join(' · ') || '관리자'
    const items2 = []
    const am = events.filter((e) => e.date === td && K(e) && P(e) && e.rm === 'am9')
    if (am.length) items2.push({ w: '오늘 09:00', sent: hr >= 9, t: `오늘 일정 ${am.length}건`, s: `${who(am)}에게${hr >= 9 ? ' 보냄' : ''}` })
    const h1 = events.filter((e) => e.date === td && K(e) && P(e) && e.rm === '1h')
    if (h1.length) items2.push({ w: '시작 1시간 전', t: `오늘 ${h1.length}건 — ${h1.slice(0, 4).map((e) => (e.t ? e.t + ' ' : '') + e.title).join(', ')}${h1.length > 4 ? ' …' : ''}`, s: `${who(h1)}에게 · 하나씩` })
    const ex0 = events.filter((e) => e.k === 'exp' && e.date === td && K(e))
    if (ex0.length) items2.push({ w: '오늘 09:00', sent: hr >= 9, t: `${KN.exp} ${ex0.length}건 — ${ex0.map((e) => e.title).join(', ')}`, s: `관리자에게${hr >= 9 ? ' 보냄' : ''}` })
    const tm = events.filter((e) => e.date === tk && K(e) && e.rm === 'prev18')
    if (tm.length) items2.push({ w: '오늘 18:00', sent: hr >= 18, t: `내일 일정 ${tm.length}건 — ${tm.slice(0, 4).map((e) => (e.t ? e.t + ' ' : '') + e.title).join(', ')}${tm.length > 4 ? ' …' : ''}`, s: `${who(tm)}에게${hr >= 18 ? ' 보냄' : ''}` })
    const ex = events.filter((e) => e.k === 'exp' && e.date === tk && K(e))
    if (ex.length) items2.push({ w: '내일 09:00', t: `${KN.exp} ${ex.length}건 — ${ex.map((e) => e.title).join(', ')}`, s: '관리자에게' })
    const tdl = events.filter((e) => e.date === td && K(e))
    const pcl = `<div class="pcl"><b>오늘</b>${['rsv', 'mtg', 'exp'].filter((k) => kinds().includes(k)).map((k) => `<span>${esc(KN[k])} ${tdl.filter((e) => e.k === k).length}</span>`).join('')}</div>`
    const perm = (typeof Notification !== 'undefined' && Notification.permission === 'granted')
    R.innerHTML = `<div class="ph"><h2>알림</h2><span class="psub" style="margin:0 0 0 auto">일정마다 정한 대로 자동</span></div>${pcl}
      <ul>${items2.map((i) => `<li${i.sent ? ' style="opacity:.6"' : ''}><span class="w">${i.w}</span><span>${esc(i.t)}</span><small>${esc(i.s)}</small></li>`).join('') || '<li><span class="w">없음</span><span>예정된 알림 없음</span></li>'}</ul>
      ${perm ? '' : '<div class="ro" style="margin-top:8px">이 기기는 알림이 꺼져 있어요 — 내 계정 › 알림에서 켜면 폰으로 받아요</div>'}`
  }
  // 안내 문자 — 문자 발송 계약 전: 폰 문자 앱을 내용 채운 채로 열거나 복사
  function msgText(e) {
    const d = new Date(e.date + 'T00:00'), x = e.x || {}
    const when = `${d.getMonth() + 1}월 ${d.getDate()}일(${DOW[d.getDay()]})${e.t ? ' ' + ampm(e.t) : ''}`
    const to = x.c ? `${x.c.replace(/ .*$/, '')}님, ` : ''
    const co = CO ? `[${CO}] ` : ''
    if (e.moved) return `${co}${to}예약 시간이 ${when}(으)로 바뀌었습니다.\n다른 시간이 필요하시면 이 번호로 연락 주세요.`
    return e.k === 'rsv' ? `${co}${to}${when} ${e.store && e.store !== '전 매장' ? e.store + ' ' : ''}${e.title} 예약 안내드립니다.\n변경이나 취소는 이 번호로 연락 주세요.`
      : `${co}${to}${when} ${e.title} 일정 다시 안내드립니다.\n장소 · 시간 변경이 있으면 알려 주세요.${e.who ? ` — 담당 ${e.who}` : ''}`
  }
  function openMsg(e) {
    const txt = msgText(e), ph = digits(e.x && e.x.p)
    const ios = /iPhone|iPad|Macintosh/.test(navigator.userAgent)
    const smsHref = ph ? `sms:${ph}${ios ? '&' : '?'}body=${encodeURIComponent(txt)}` : ''
    const sc = sheet(`<div class="sheet" role="dialog" aria-modal="true" aria-label="안내 문자"><h2>안내 문자</h2><div class="hint">${ph ? `${esc(e.x.p)} · 폰에서는 문자 앱이 열려요` : '연락처가 없어요 — 복사해서 카톡 · 문자로'}</div><div class="msg" data-mtxt>${esc(txt)}</div><div class="sacts"><button data-c>복사</button>${smsHref ? `<a class="main" href="${esc(smsHref)}" style="display:grid;place-items:center;text-decoration:none;border-radius:12px;flex:2;background:var(--deep);color:var(--on-main);font-weight:700">문자 앱 열기</a>` : '<button data-x>닫기</button>'}</div></div>`)
    sc.querySelector('[data-c]').onclick = async () => { try { await navigator.clipboard.writeText(txt); toast('복사했습니다'); sc.remove() } catch (err) { const r = document.createRange(); r.selectNodeContents(sc.querySelector('[data-mtxt]')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('글을 선택해 두었습니다 — 복사해 주세요') } }
  }
  function openNote(e) {
    const sc = sheet(`<form class="sheet" role="dialog" aria-modal="true" aria-label="미팅 한 줄"><h2>${esc(e.title)}</h2><div class="hint">${esc(e.x && e.x.c || '')}${e.x && e.x.cid ? ' · 거래처 기록에도 남아요' : ''}</div>
      <label class="fld">한 줄<input data-nt placeholder="예) 단가 3% 인하 요청 — 다음 주 수요일까지 회신" value="${esc(e.note)}"></label>
      <label class="fld">다음 할 일 날짜 <span class="hint">넣으면 달력 · 알림에 잡혀요</span><input data-nd type="date"></label>
      <div class="sacts"><button type="button" data-x>닫기</button><button class="main">남기기</button></div></form>`)
    setTimeout(() => sc.querySelector('[data-nt]').focus(), 30)
    sc.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault(); const note = sc.querySelector('[data-nt]').value.trim(), nd = sc.querySelector('[data-nd]').value
      const ok = await patchAppt(e, { note, status: 'done' }, '미팅 기록'); if (!ok) return
      const r = e.row
      if (r.deal_id && note) await sb.from('deal_logs').insert({ tenant_id: T, deal_id: r.deal_id, kind: 'meeting', body: note, author_id: ME })
      if (nd) {
        const row = { tenant_id: T, kind: 'meeting', title: `회신 · ${(e.x && e.x.c) || e.title}`, store_id: r.store_id, staff_id: r.staff_id, client_id: r.client_id, deal_id: r.deal_id, starts_at: new Date(nd + 'T10:00').toISOString(), duration_min: 30, status: 'confirmed', source: 'staff', remind: 'prev18', extra: r.extra || {}, created_by: ME }
        const { data, error } = await sb.from('appointments').insert(row).select().single()
        if (error) fail('다음 할 일', error); else { appts.push(data); build(); render() }
      }
      sc.remove(); toast(nd ? '남겼습니다 · 다음 할 일을 달력에 넣었어요' : '남겼습니다')
    }
  }
  function openMove(e) {
    const sc = sheet(`<form class="sheet" role="dialog" aria-modal="true" aria-label="시간 변경"><h2>시간 변경</h2><div class="hint">${esc(e.title)} · 지금 ${md2(e.date)} ${e.t}</div>
      <div class="row2"><label class="fld">날짜<input data-mvd type="date" value="${e.date}"></label><label class="fld">시간<input data-mvt type="time" value="${e.t}"></label></div>
      <div class="wn" data-mvw hidden></div>
      ${feat.msg ? '<label class="same" style="display:flex;gap:8px;margin-top:12px;font-size:13.5px"><input type="checkbox" data-mvm checked>바꾼 다음 안내 문자 열기</label>' : ''}
      <div class="sacts"><button type="button" data-x>취소</button><button class="main">바꾸기</button></div></form>`)
    const chk = () => { const t = { ...e, date: sc.querySelector('[data-mvd]').value, t: sc.querySelector('[data-mvt]').value }; const c = clashOf(t); const w = sc.querySelector('[data-mvw]'); w.hidden = !c; if (c) w.textContent = `같은 담당 ${c.t} ${c.title}과 겹쳐요` }
    sc.querySelector('[data-mvd]').oninput = chk; sc.querySelector('[data-mvt]').oninput = chk; chk()
    sc.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault(); const nd = sc.querySelector('[data-mvd]').value, nt = sc.querySelector('[data-mvt]').value; if (!nd || !nt) return
      const openM = feat.msg && sc.querySelector('[data-mvm]') && sc.querySelector('[data-mvm]').checked
      const ok = await patchAppt(e, { starts_at: new Date(`${nd}T${nt}`).toISOString(), moved_from: e.row.starts_at, reminded_at: null }, '시간 변경', '바꿨습니다 · 알림도 새 시간으로')
      if (!ok) return
      sc.remove(); sel = new Date(nd + 'T00:00'); cur = new Date(sel.getFullYear(), sel.getMonth(), 1); await refresh()
      if (openM) { const ne = events.find((x) => x.row && x.row.id === e.row.id); if (ne) openMsg(ne) }
    }
  }
  function sheet(html) {
    const sc = document.createElement('div'); sc.className = 'scrim'; sc.innerHTML = html; root.appendChild(sc)
    sc.onclick = (ev) => { if (ev.target === sc) sc.remove() }
    sc.querySelectorAll('[data-x]').forEach((b) => b.onclick = () => sc.remove())
    return sc
  }

  // ── 일정 넣기 — 종류를 고르면 필요한 칸만 ──
  function openAdd(k) {
    const ks = kinds().filter((x) => x !== 'fix' || isAdmin)
    let kind = ks[0] || 'off', rm = feat.rem ? DEF_RM[kind] : 'none'
    const stores = STORES.map((s) => `<option value="${s.id}"${fStore === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')
    const staff = profiles.map((p) => `<option value="${p.id}"${p.id === (fWho !== 'all' ? fWho : ME) ? ' selected' : ''}>${esc(p.name)}</option>`).join('')
    const sc = sheet(`<form class="sheet" role="dialog" aria-modal="true" aria-label="일정 넣기"><h2>일정 넣기</h2>
      <div class="kinds">${ks.map((x) => `<button type="button" data-k="${x}" aria-pressed="${x === kind}"><span class="sw k-${x}"></span>${esc(KN[x])}</button>`).join('')}</div>
      <div data-fixnote class="fixnote" hidden>고정업무는 규칙으로 만들어요 — 「매달 25일」 「매주 월요일」처럼 한 번 넣으면 달력에 계속 나와요.<br><button type="button" class="rec" data-fixgo style="margin-top:8px">설정 › 고정업무 열기</button></div>
      <div data-main>
      <label class="fld"><span data-tl>제목</span><input data-title required></label>
      <div class="row2"><label class="fld"><span data-dl>날짜</span><input data-date type="date" value="${k || dk(sel)}"></label><label class="fld" data-tw>시간<input data-time type="time" value="14:00"></label></div>
      <div class="row2"><label class="fld" data-sw>매장<select data-store><option value="">전 매장</option>${stores}</select></label><label class="fld" data-ww>담당<select data-who>${isAdmin ? '' : ''}${staff}</select></label></div>
      <label class="fld" data-dw>길이<select data-dur><option value="30">30분</option><option value="60" selected>1시간</option><option value="90">1시간 30분</option><option value="120">2시간</option><option value="150">2시간 30분</option><option value="180">3시간</option></select></label>
      <div class="wn" data-wn hidden></div>
      <div class="row2" data-cw><label class="fld"><span data-cl>상대</span><input data-c list="vcal-people" autocomplete="off"></label><label class="fld">연락처<input data-p inputmode="tel" placeholder="010-0000-0000"></label></div>
      <datalist id="vcal-people"></datalist>
      <div class="hint" data-g style="margin-top:4px"></div>
      <div class="fld" data-rw${feat.rem ? '' : ' hidden'}>알림 <span class="hint">담당자 폰으로</span><div class="rms">${Object.keys(RM).map((r) => `<button type="button" data-r="${r}">${RM[r]}</button>`).join('')}</div></div>
      <label class="fld" data-repw>반복<select data-rep><option value="0">안 함</option><option value="w">매주 같은 요일 · 8번</option><option value="2w">2주마다 · 6번</option><option value="m">매월 같은 날 · 6번</option></select></label>
      </div>
      <div class="sacts"><button type="button" data-x>취소</button><button type="submit" class="main" data-go>넣기</button></div></form>`)
    const Q = (s) => sc.querySelector(s)
    const offWho = () => { // 휴무: 직원은 본인만. 관리자는 매장 휴무(하루)도
      Q('[data-who]').innerHTML = (isAdmin ? '<option value="store">매장 휴무 (그 매장 전체)</option>' : '') + profiles.filter((p) => isAdmin || p.id === ME).map((p) => `<option value="${p.id}"${p.id === ME ? ' selected' : ''}>${esc(p.name)}</option>`).join('')
    }
    const paint = () => {
      sc.querySelectorAll('[data-k]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.k === kind)); sc.querySelectorAll('[data-r]').forEach((b) => { b.setAttribute('aria-pressed', b.dataset.r === rm); if (b.dataset.r === '1h') b.hidden = !['rsv', 'mtg'].includes(kind) })
      const fx = kind === 'fix'; Q('[data-fixnote]').hidden = !fx; Q('[data-main]').hidden = fx; Q('[data-go]').hidden = fx
      const Pk = kind === 'rsv' || kind === 'mtg'
      Q('[data-cw]').hidden = !Pk; Q('[data-dw]').hidden = !Pk; Q('[data-tw]').style.visibility = Pk ? 'visible' : 'hidden'; Q('[data-rw]').hidden = !feat.rem || !Pk; Q('[data-repw]').hidden = !Pk
      Q('[data-ww]').hidden = kind === 'exp'; Q('[data-sw]').hidden = kind === 'off'
      Q('[data-tl]').textContent = kind === 'exp' ? '품목' : kind === 'off' ? '말 (선택)' : '제목'
      Q('[data-dl]').textContent = kind === 'exp' ? '기한 (포장에 적힌 날)' : '날짜'
      Q('[data-cl]').textContent = kind === 'rsv' ? '손님' : '거래처'
      Q('[data-title]').required = kind !== 'off'
      Q('[data-title]').placeholder = kind === 'exp' ? '예) 우유' : kind === 'mtg' ? '예) 납품 단가 협의' : kind === 'off' ? '예) 추석 휴무' : '예) 단체 방문 6명'
      Q('[data-c]').placeholder = kind === 'rsv' ? '이름 · 번호로 찾기' : '거래처 이름'
      Q('#vcal-people').innerHTML = (kind === 'rsv' ? guests.map((g) => `<option value="${esc(g.name)}">${esc(fmtPh(g.phone))}</option>`) : clients.map((c) => `<option value="${esc(c.name)}">`)).join('')
      if (kind === 'off') offWho(); else if (Q('[data-who]').querySelector('option[value=store]') || Q('[data-who]').options.length !== profiles.length) Q('[data-who]').innerHTML = staff
      if (kind === 'exp' && !Q('[data-store]').value && STORES[0]) Q('[data-store]').value = STORES[0].id
      chk()
    }
    sc.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { kind = b.dataset.k; rm = feat.rem ? DEF_RM[kind] : 'none'; paint() })
    sc.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { rm = b.dataset.r; paint() })
    const fg = Q('[data-fixgo]'); if (fg) fg.onclick = () => { sc.remove(); close(); host.openFixSettings && host.openFixSettings() }
    const chk = () => {
      const Pk = kind === 'rsv' || kind === 'mtg'
      const t = { id: '-new', k: kind, date: Q('[data-date]').value, t: Q('[data-time]').value, whoId: Q('[data-who]').value, dur: +Q('[data-dur]').value, st: 'plan' }
      const c = Pk && t.date && t.t ? clashOf(t) : null, w = Q('[data-wn]'); w.hidden = !c
      if (c) w.textContent = `${(prof(t.whoId) || {}).name || ''} ${c.t} ${c.title}과 시간이 겹쳐요 — 그래도 넣을 수 있어요`
    }
    ;['[data-date]', '[data-time]', '[data-who]', '[data-dur]'].forEach((q) => Q(q).addEventListener('input', chk))
    Q('[data-c]').addEventListener('input', (ev) => {
      if (kind !== 'rsv') return
      const v = ev.target.value.trim(), g = guestBy(v, digits(v).length >= 9 ? v : ''), h = Q('[data-g]')
      if (g) { if (!Q('[data-p]').value && g.phone) Q('[data-p]').value = fmtPh(g.phone); h.innerHTML = `지난 방문 ${g.visits}회${g.noshows ? ` · <b style="color:var(--hol)">노쇼 ${g.noshows}회</b>` : ''} · 연락처 자동으로 채움` } else h.textContent = v ? '새 손님으로 넣어요' : ''
    })
    Q('[data-p]').addEventListener('input', (ev) => { ev.target.value = fmtPh(ev.target.value) || ev.target.value })
    sc.querySelector('form').onsubmit = async (ev) => {
      ev.preventDefault(); const go = Q('[data-go]'); if (go.disabled) return
      const title = Q('[data-title]').value.trim(), date = Q('[data-date]').value
      if (!date || (kind !== 'off' && !title)) { Q('[data-title]').focus(); return }
      go.disabled = true
      try {
        if (kind === 'rsv' || kind === 'mtg') {
          const c = Q('[data-c]').value.trim(), p = Q('[data-p]').value.trim()
          const g = kind === 'rsv' ? await ensureGuest(c, p) : null
          const cl = kind === 'mtg' ? await ensureClient(c) : null
          const base = { tenant_id: T, kind: kind === 'rsv' ? 'booking' : 'meeting', title, store_id: Q('[data-store]').value || null, staff_id: Q('[data-who]').value || null,
            guest_id: g ? g.id : null, client_id: cl ? cl.id : null, duration_min: +Q('[data-dur]').value, status: 'confirmed', source: kind === 'rsv' ? 'phone' : 'staff', remind: feat.rem ? rm : 'none',
            extra: (!g && !cl && c) ? { party: c, phone: digits(p) } : {}, created_by: ME }
          const rp = Q('[data-rep]').value, t = Q('[data-time]').value || '10:00'
          const rows = []
          if (rp === '0') rows.push({ ...base, starts_at: new Date(`${date}T${t}`).toISOString() })
          else {
            const n = rp === 'w' ? 8 : 6, sid = (crypto.randomUUID ? crypto.randomUUID() : null), lab = rp === 'w' ? `매주 ${DOW[new Date(date + 'T00:00').getDay()]}` : rp === '2w' ? '2주마다' : '매월'
            for (let i = 0; i < n; i++) { const d = new Date(`${date}T${t}`); if (rp === 'm') d.setMonth(d.getMonth() + i); else d.setDate(d.getDate() + (rp === 'w' ? 7 : 14) * i); rows.push({ ...base, starts_at: d.toISOString(), series_id: sid, series_rule: lab }) }
          }
          const { data, error } = await sb.from('appointments').insert(rows).select(); if (error) throw error
          appts.push(...(data || []))
        } else if (kind === 'exp') {
          const sid = Q('[data-store]').value; if (!sid) { toast('매장을 골라 주세요'); go.disabled = false; return }
          const it = await ensureItem(title)
          const { data, error } = await sb.from('expiry_lots').insert({ tenant_id: T, store_id: sid, item_id: it.id, received_on: dk(TODAY), label_date: date, qty: 1, created_by: ME }).select().single(); if (error) throw error
          lots.push(data)
        } else if (kind === 'off') {
          const w = Q('[data-who]').value
          if (w === 'store') {
            const sid = fStore !== 'all' ? fStore : null
            const { data, error } = await sb.from('store_closures').insert({ tenant_id: T, store_id: sid, close_date: date, label: title || '휴무', created_by: ME }).select().single(); if (error) throw error
            closures.push(data)
          } else {
            const { data, error } = await sb.from('dayoffs').insert({ tenant_id: T, profile_id: w, dayoff_date: date, status: 'dayoff' }).select('id,profile_id,dayoff_date').single(); if (error) throw error
            dayoffs.push(data)
          }
        }
      } catch (e) { go.disabled = false; fail('일정 넣기', e); return }
      on[kind] = 1; sel = new Date(date + 'T00:00'); cur = new Date(sel.getFullYear(), sel.getMonth(), 1); sc.remove()
      build(); await refresh(); toast(P({ k: kind }) && rm !== 'none' && feat.rem ? `넣었습니다 · ${RM[rm]} 알림` : '넣었습니다')
    }
    paint(); setTimeout(() => Q('[data-title]').focus(), 30)
  }

  // ── 보기 · 색 · 배치 (보는 사람 기기) ──
  function hsl(h, s, l) { s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('') }
  function lum(x) { const c = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16) / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const fitDark = (h, s, l, vs) => { let c = hsl(h, s, l); while (l > 8 && vs.some((b) => cr(c, b) < 4.6)) { l--; c = hsl(h, s, l) } return c }
  const fitLight = (h, s, l, vs) => { let c = hsl(h, s, l); while (l < 96 && vs.some((b) => cr(c, b) < 4.6)) { l++; c = hsl(h, s, l) } return c }
  const KC_DEF = { rsv: 212, mtg: 262, exp: 38, fix: 152, off: 'gray' }
  const BG_PRE = [['기본', null], ['흰색', 'white'], ['크림', { h: 40, s: 45 }], ['하늘', { h: 205, s: 45 }], ['라벤더', { h: 260, s: 35 }], ['복숭아', { h: 15, s: 50 }], ['민트', { h: 160, s: 35 }]]
  let kcol = { ...KC_DEF }; try { Object.assign(kcol, JSON.parse(LS.get('dv_cal_kc', '{}'))) } catch (e) {}
  let bgc = null; try { bgc = JSON.parse(LS.get('dv_cal_bg', 'null')) } catch (e) {}
  let chipStyle = LS.get('dv_cal_chip', 'icon')
  function catTok(v) {
    if (v === 'gray') return ['#5F6B66', '#E8EBEE', '#56615C', '#A3AEA8', '#1F2A25', '#B3BDB7']
    const bg = hsl(v, 80, 94), dbg = hsl(v, 35, 16)
    return [fitDark(v, 70, 48, ['#FFFFFF', bg]), bg, fitDark(v, 70, 42, ['#FFFFFF']), fitLight(v, 75, 62, ['#181D25', dbg]), dbg, fitLight(v, 75, 66, ['#0F1318'])]
  }
  function bgTok(b) {
    if (!b) return null
    if (b === 'white') return { L: ['#FFFFFF', '#FFFFFF', '#F3F5F4', '#E2E6E4'], D: ['#0E1110', '#161A18', '#1D2220', '#2A302D'] }
    const { h, s } = b; return { L: [hsl(h, s, 95), hsl(h, Math.min(s, 40), 99.3), hsl(h, s, 92.5), hsl(h, s * 0.8, 86)], D: [hsl(h, s * 0.9, 7), hsl(h, s * 0.8, 11), hsl(h, s * 0.7, 14), hsl(h, s * 0.6, 20)] }
  }
  function applyPal() {
    const L = [], D = [], KU = feat.deco ? kcol : KC_DEF
    Object.keys(KU).forEach((k) => { const [c, bg, f, dc, dbg, df] = catTok(KU[k]); L.push(`--${k}:${c};--${k}-bg:${bg};--${k}F:${f}`); D.push(`--${k}:${dc};--${k}-bg:${dbg};--${k}F:${df}`) })
    const e = catTok(KU.exp); L.push(`--expT:${e[0]}`); D.push(`--expT:${e[3]}`)
    const B = bgTok(feat.deco ? bgc : null), n = ['bg', 'card', 'soft', 'line']
    if (B) n.forEach((x, i) => { const nm = x === 'line' ? 'border' : x; L.push(`--${nm}:${B.L[i]};--${x === 'soft' ? 'hover' : x}:${B.L[i]}`); D.push(`--${nm}:${B.D[i]};--${x === 'soft' ? 'hover' : x}:${B.D[i]}`) })
    root.querySelector('style[data-pal]').textContent = `#vcal{${L.join(';')}}html[data-bright=dark] #vcal{${D.join(';')}}`
  }
  const hueOf = (v) => v === 'gray' ? null : v
  const similar = (k) => { const h = hueOf(kcol[k]); if (h == null) return null; return Object.keys(kcol).find((x) => x !== k && kinds().includes(x) && hueOf(kcol[x]) != null && Math.min(Math.abs(h - kcol[x]), 360 - Math.abs(h - kcol[x])) < 26) }
  function place() {
    const W = $('[data-wrap]'); W.dataset.layout = feat.deco ? LS.get('dv_cal_layout', 'side') : 'side'; W.dataset.chip = feat.deco ? chipStyle : 'icon'
    const B = placeB()
    const mv = (el, slot) => { if (el && slot && el.parentNode !== slot) slot.appendChild(el) }
    mv($('[data-fstore]'), B ? $('[data-lp=store]') : $('[data-sl=store]'))
    mv($('[data-fwho]'), B ? $('[data-lp=who]') : $('[data-sl=who]'))
    mv($('[data-layers]'), B ? $('[data-lp=layers]') : $('[data-sl=layers]'))
    mv($('[data-day]'), B ? $('[data-sl=strip]') : $('[data-sl=day]'))
    mv($('[data-remind]'), B ? $('[data-lp=remind]') : $('[data-sl=remind]'))
    $('[data-day]').classList.toggle('panel', !B || stripOpen); $('[data-day]').style.marginTop = B ? '14px' : ''
  }
  function renderMini() {
    if (!placeB()) return
    const y = cur.getFullYear(), m = cur.getMonth(), first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay())
    const has = new Set(visible().map((e) => e.date))
    let h = `<div class="mtop"><span>${y}년 ${m + 1}월</span><span><button data-mm="-1" aria-label="이전 달">‹</button><button data-mm="1" aria-label="다음 달">›</button></span></div><div class="mini">` + DOW.map((d) => `<span class="mh">${d}</span>`).join('')
    const cells = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7) * 7
    for (let i = 0; i < cells; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const k = dk(d); h += `<button data-md="${k}" class="${d.getMonth() !== m ? 'o' : ''} ${same(d, TODAY) ? 't' : ''} ${same(d, sel) ? 's' : ''} ${has.has(k) ? 'e' : ''}">${d.getDate()}</button>` }
    $('[data-mini]').innerHTML = h + '</div>'
    $$('[data-md]').forEach((b) => b.onclick = () => { sel = new Date(b.dataset.md + 'T00:00'); cur = new Date(sel.getFullYear(), sel.getMonth(), 1); refresh() })
    $$('[data-mm]').forEach((b) => b.onclick = () => { cur = new Date(cur.getFullYear(), cur.getMonth() + +b.dataset.mm, 1); refresh() })
  }
  const WF = { side: '<svg class="wf" viewBox="0 0 120 70"><rect x="1" y="1" width="118" height="68" rx="6" fill="none" stroke="currentColor" opacity=".35"/><rect x="6" y="6" width="80" height="58" rx="3" fill="currentColor" opacity=".18"/><rect x="90" y="6" width="24" height="58" rx="3" fill="currentColor" opacity=".35"/></svg>',
    left: '<svg class="wf" viewBox="0 0 120 70"><rect x="1" y="1" width="118" height="68" rx="6" fill="none" stroke="currentColor" opacity=".35"/><rect x="6" y="6" width="24" height="58" rx="3" fill="currentColor" opacity=".35"/><rect x="34" y="6" width="80" height="46" rx="3" fill="currentColor" opacity=".18"/><rect x="34" y="55" width="80" height="9" rx="3" fill="currentColor" opacity=".35"/></svg>' }
  function renderPop() {
    const smp = { k: 'rsv', t: '11:00', title: '단체 예약', id: 'smp1' }
    const FL = [['rsv', KN.rsv], ['mtg', KN.mtg], ['exp', KN.exp], ['stk', '중요한 날 표시'], ['msg', '안내 문자'], ['rem', '일정 알림'], ['deco', '화면 꾸미기 · 배치 · 색']]
    const lay = LS.get('dv_cal_layout', 'side')
    $('[data-pop]').innerHTML = `${isAdmin ? `<h3>기능 켜기/끄기<small>회사 전체 · 관리자</small></h3><div class="fsw">${FL.map(([k, n]) => `<label><span>${esc(n)}</span><input type="checkbox" class="swi" data-ft="${k}" ${feat[k] ? 'checked' : ''}><span class="sw2"></span></label>`).join('')}</div>` : ''}
      ${feat.deco ? `<h3>배치<small>내 화면</small></h3><div class="opts">${[['side', '오른쪽에 그날'], ['left', '왼쪽에 거르기']].map(([v, n]) => `<button class="opt" data-lay="${v}" aria-pressed="${lay === v}">${WF[v]}${n}</button>`).join('')}</div>
      <h3>일정 표시</h3><div class="opts">${[['icon', '아이콘'], ['dot', '점'], ['fill', '채움']].map(([v, n]) => `<button class="opt" data-cs="${v}" aria-pressed="${chipStyle === v}"><span data-chip="${v}" style="width:100%;display:grid;gap:3px">${chip(smp)}${chip({ k: 'exp', title: '우유', id: 'smp2' })}</span>${n}</button>`).join('')}</div>
      <small style="margin-bottom:14px">배치 · 표시 · 색은 이 기기에만 · 폰에서는 달력 아래로 그날이 펼쳐짐</small>
      <h3>배경<small>내 화면</small></h3>
      <div class="cpick"><button class="cbtn" data-pick="bg"><i style="background:var(--bg);box-shadow:inset 0 0 0 1px var(--line)"></i>${esc(bgName())}<span>바꾸기</span></button></div>
      <h3>종류 색<small>내 화면</small></h3>
      <div class="cpick">${kinds().map((k) => `<button class="cbtn" data-pick="${k}"><i style="background:var(--${k})"></i>${esc(KN[k])}</button>`).join('')}</div>` : '<small>화면 꾸미기가 꺼져 있어 기본 배치 · 기본 색으로 봅니다</small>'}`
    $$('[data-lay]').forEach((b) => b.onclick = () => { LS.set('dv_cal_layout', b.dataset.lay); stripOpen = false; render(); renderPop() })
    $$('[data-pick]').forEach((b) => b.onclick = () => renderPicker(b.dataset.pick))
    $$('[data-ft]').forEach((b) => b.onchange = async () => {
      const k = b.dataset.ft; feat[k] = b.checked ? 1 : 0; applyPal(); stripOpen = false; render(); renderPop()
      try { await host.saveFeatures({ [FK[k]]: !!b.checked }); toast(`${b.closest('label').querySelector('span').textContent} ${b.checked ? '켰습니다' : '껐습니다 — 기록은 그대로 남아요'}`) }
      catch (e) { feat[k] = b.checked ? 0 : 1; render(); renderPop(); fail('기능 켜기/끄기', e) }
    })
    $$('[data-cs]').forEach((b) => b.onclick = () => { chipStyle = b.dataset.cs; LS.set('dv_cal_chip', chipStyle); render(); renderPop() })
  }
  const bgName = () => { if (!bgc) return '기본'; if (bgc === 'white') return '흰색'; const p = BG_PRE.find((x) => x[1] && x[1].h === bgc.h); return p ? p[0] : '직접 고른 색' }
  function renderPicker(t) {
    const isBg = t === 'bg'
    const cur0 = isBg ? (bgc && bgc.h != null ? bgc.h : 140) : (kcol[t] === 'gray' ? 212 : kcol[t])
    const pre = isBg ? BG_PRE.map(([n, v]) => `<button class="pre" data-bgp='${JSON.stringify(v)}'><i style="background:${v === null ? 'var(--bg)' : v === 'white' ? '#FFFFFF' : hsl(v.h, v.s, 93)};box-shadow:inset 0 0 0 1px #0002"></i>${n}</button>`).join('')
      : [[212, '파랑'], [235, '남색'], [262, '보라'], [330, '분홍'], [4, '빨강'], [24, '주황'], [40, '노랑'], [152, '초록'], [182, '청록'], ['gray', '회색']].map(([v, n]) => `<button class="pre" data-kp="${v}"><i style="background:${catTok(v)[0]}"></i>${n}</button>`).join('')
    $('[data-pop]').innerHTML = `<div class="pk-top"><button class="tbtn" data-pkback aria-label="뒤로">‹</button><h3 style="margin:0">${isBg ? '배경 색' : esc(KN[t]) + ' 색'}</h3><button class="reset" data-pkdef style="margin:0 0 0 auto">기본으로</button></div>
      <div class="pk-prev" data-pkprev></div>
      <label class="pk-lbl">끌어서 고르기<input type="range" data-hue min="0" max="359" step="1" value="${cur0}" class="hue${isBg ? ' soft' : ''}"></label>
      <div class="pk-pre">${pre}</div>
      <div class="pk-warn" data-pkwarn hidden></div>
      <small>${isBg ? '바탕만 바뀌고 글자는 읽히는 밝기로 자동 조정 · 어두운 화면에서도 같은 색 계열' : '어느 색을 골라도 글자가 읽히게 밝기를 자동으로 맞춤'}</small>`
    const prev = () => {
      $('[data-pkprev]').innerHTML = isBg ? `<div class="bgprev"><div class="c">${chip({ k: 'rsv', t: '11:00', title: '단체 예약', id: 'p1' })}${chip({ k: 'exp', title: '우유', id: 'p2' })}</div></div>`
        : ['icon', 'dot', 'fill'].map((v) => `<span data-chip="${v}" style="display:grid;gap:3px;min-width:0">${chip({ k: t, t: P({ k: t }) ? '11:00' : null, title: KN[t], id: 'p' + v })}</span>`).join('')
      const w = isBg ? null : similar(t); $('[data-pkwarn]').hidden = !w; if (w) $('[data-pkwarn]').textContent = `${KN[w]}와 색이 비슷해 달력에서 헷갈릴 수 있어요`
    }
    const save = () => { LS.set('dv_cal_kc', JSON.stringify(kcol)); LS.set('dv_cal_bg', JSON.stringify(bgc)); applyPal(); render(); prev() }
    $('[data-hue]').oninput = (e) => { const h = +e.target.value; if (isBg) bgc = { h, s: (bgc && bgc.s) || 40 }; else kcol[t] = h; save() }
    $$('[data-bgp]').forEach((b) => b.onclick = () => { bgc = JSON.parse(b.dataset.bgp); if (bgc && bgc.h != null) $('[data-hue]').value = bgc.h; save() })
    $$('[data-kp]').forEach((b) => b.onclick = () => { const v = b.dataset.kp; kcol[t] = v === 'gray' ? 'gray' : +v; if (v !== 'gray') $('[data-hue]').value = v; save() })
    $('[data-pkdef]').onclick = () => { if (isBg) bgc = null; else kcol[t] = KC_DEF[t]; save() }
    $('[data-pkback]').onclick = () => renderPop()
    prev()
  }

  // ── 움직이기 ──
  async function refresh(force) {
    try { await loadRange(force); $('[data-err]').innerHTML = '' } catch (e) { console.warn('[cal] load', e); $('[data-err]').innerHTML = `<div class="st-err">일정을 불러오지 못했어요 — ${esc(e.message || e)}. 잠시 뒤 다시 열어 주세요</div>` }
    build(); render()
  }
  $('[data-prev]').onclick = () => { if (view === 'week') { sel.setDate(sel.getDate() - 7); cur = new Date(sel.getFullYear(), sel.getMonth(), 1) } else cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1); refresh() }
  $('[data-next]').onclick = () => { if (view === 'week') { sel.setDate(sel.getDate() + 7); cur = new Date(sel.getFullYear(), sel.getMonth(), 1) } else cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1); refresh() }
  $('[data-today]').onclick = () => { sel = new Date(TODAY); cur = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); refresh() }
  $$('[data-view] button').forEach((b) => b.onclick = () => { view = b.dataset.v; LS.set('dv_cal_view', view); refresh() })
  $('[data-fstore]').onchange = (e) => { fStore = e.target.value; render() }
  $('[data-fwho]').onchange = (e) => { fWho = e.target.value; render() }
  $('[data-add]').onclick = () => openAdd()
  $('[data-vbtn]').onclick = (e) => { e.stopPropagation(); const p = $('[data-pop]'); p.hidden = !p.hidden; $('[data-vbtn]').setAttribute('aria-expanded', !p.hidden); if (!p.hidden) renderPop() }
  $('[data-pop]').addEventListener('click', (e) => e.stopPropagation())
  const onDoc = (e) => { const p = $('[data-pop]'); if (p && !p.hidden && !p.contains(e.target) && e.target !== $('[data-vbtn]')) { p.hidden = true; $('[data-vbtn]').setAttribute('aria-expanded', 'false') } }
  document.addEventListener('click', onDoc)
  let _rw = placeB(); const onResize = () => { if (placeB() !== _rw) { _rw = placeB(); render() } }
  addEventListener('resize', onResize)

  applyPal()
  try { await loadStatic() } catch (e) { console.warn('[cal] static', e); $('[data-err]').innerHTML = `<div class="st-err">캘린더를 준비하지 못했어요 — ${esc(e.message || e)}</div>` }
  renderFilters()
  await refresh(true)
  return { close }
}
