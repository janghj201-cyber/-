// AI 도우미(v6.19) — 앱 안에서 묻고 답하기 · 「AI가 배운 것」(대표 · 매니저) · 홈 아침 요약 카드.
// 서버: api/ai(묻기) · api/ai-brief(아침 요약) · api/ai-learn(매주 배운 것 정리). 표: ai_notes · ai_logs · ai_briefs(SQL_v619)
// AI 는 기록을 바꾸지 않는다 — 답 + 그 화면 여는 버튼만. 맞아요 / 아니에요 · 고쳐 준 말은 매주 「배운 것」에 들어간다.
import { supabase as sb } from './supabase-client.js'
import { getContext } from './context.js'

const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const mdOf = (x) => { const t = String(x || ''); return t.length >= 10 ? `${+t.slice(5, 7)}/${+t.slice(8, 10)}` : '' }
const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const IC = {
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H7V10l4-8a3 3 0 0 1 4 3.9z"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 14V3"/><path d="M9 18.1 10 14H4.2a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 5.6 3H17v11l-4 8a3 3 0 0 1-4-3.9z"/></svg>',
}
const CSS = `
#vai{position:fixed;inset:0;z-index:960;display:flex;justify-content:flex-end;align-items:stretch;background:rgba(23,34,51,.28);animation:vai-f .2s ease}
#vai .pn{background:var(--bg);width:100%;max-width:460px;display:flex;flex-direction:column;box-shadow:-12px 0 32px rgba(23,34,51,.14);animation:vai-in .22s cubic-bezier(.2,.8,.2,1);color:var(--text)}
#vai .hd{display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--navy);color:#fff}
#vai .mini{width:40px;height:40px;display:grid;place-items:center;flex:none}
#vai .mini .mb{width:38px;height:38px;animation:vai-float 3.6s ease-in-out infinite}
#vai .mini .vf-mascot .ta,#vai .mini .vf-mascot .tb{transition:transform .3s cubic-bezier(.3,1.4,.5,1)}
#vai .pn.think .mini .vf-mascot .ta{animation:vai-ta .9s ease-in-out infinite}
#vai .pn.think .mini .vf-mascot .tb{animation:vai-tb .9s ease-in-out infinite}
#vai .pn.think .mini .vf-mascot .ep{animation:vai-look 1.2s ease-in-out infinite}
#vai .pn.happy .mini .mb{animation:vai-hop .45s cubic-bezier(.3,1.6,.5,1)}
@keyframes vai-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes vai-ta{0%,100%{transform:translate(0,0)}50%{transform:translate(-16px,-14px)}}
@keyframes vai-tb{0%,100%{transform:translate(0,0)}50%{transform:translate(16px,14px)}}
@keyframes vai-look{0%,100%{transform:translateX(-10px)}50%{transform:translateX(10px)}}
@keyframes vai-hop{0%{transform:translateY(0)}40%{transform:translateY(-6px) scale(.95,1.06)}100%{transform:translateY(0)}}
#vai .hd b{font-size:15.5px}
#vai .hd small{display:block;font-size:13px;opacity:.7;font-weight:500}
#vai .hd .x{margin-left:auto;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);color:#fff;border-radius:9px;padding:7px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
#vai .bd{flex:1;overflow:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:10px}
#vai .intro{font-size:13px;color:var(--text-sub);line-height:1.6;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:12px 14px}
#vai .intro b{color:var(--text)}
#vai .sug{display:flex;flex-wrap:wrap;gap:6px}
#vai .sug button{border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:999px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer;text-align:left}
#vai .sug button:hover{border-color:var(--text-mute)}
#vai .me{align-self:flex-end;max-width:85%;background:var(--navy);color:#fff;border-radius:14px 14px 4px 14px;padding:9px 12px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
#vai .an{align-self:flex-start;max-width:92%;background:var(--card);border:1px solid var(--border);border-radius:14px 14px 14px 4px;padding:11px 13px;font-size:14px;line-height:1.6}
#vai .an .t{white-space:pre-wrap;word-break:break-word}
#vai .an.err{border-color:var(--orange);color:var(--text-sub)}
#vai .an .go{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
#vai .an .go button{border:1px solid var(--navy);background:transparent;color:var(--navy);border-radius:9px;padding:7px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
html[data-bright=dark] #vai .an .go button{border-color:var(--text-sub);color:var(--text)}
#vai .an .src{margin-top:8px;font-size:13px;color:var(--text-mute)}
#vai .an .t .l1{font-weight:800;color:var(--text)}
#vai .an .nx{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
#vai .an .nx button{border:1px dashed var(--border);background:var(--bg);color:var(--text);border-radius:999px;padding:6px 11px;font:inherit;font-size:13px;cursor:pointer;text-align:left}
#vai .an .nx button:hover{border-style:solid;border-color:var(--text-mute)}
#vai .an .t .cur{display:inline-block;width:7px;height:1em;vertical-align:-2px;background:var(--text-mute);margin-left:1px;animation:vai-cur .8s steps(2) infinite}
@keyframes vai-cur{50%{opacity:0}}
#vai .an .fb{display:flex;gap:6px;align-items:center;margin-top:8px;font-size:13px;color:var(--text-mute)}
#vai .an .fb button{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);background:var(--card);color:var(--text-sub);border-radius:8px;padding:4px 9px;font:inherit;font-size:13px;cursor:pointer}
#vai .an .fb button svg{width:13px;height:13px}
#vai .an .fb button[aria-pressed=true]{border-color:var(--green);color:var(--green)}
#vai .an .fb button.no[aria-pressed=true]{border-color:var(--orange);color:var(--orange)}
#vai .an .fix{margin-top:8px;display:grid;gap:6px}
#vai .an .fix textarea{width:100%;box-sizing:border-box;min-height:60px;border:1px solid var(--border);border-radius:10px;padding:8px 10px;font:inherit;font-size:13px;background:var(--bg);color:var(--text);resize:vertical}
#vai .an .fix button{justify-self:end;border:0;background:var(--navy);color:#fff;border-radius:9px;padding:7px 14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
#vai .an.wait .t{color:var(--text-mute)}
#vai .an.wait .t::after{content:'';display:inline-block;width:1.2em;text-align:left;animation:vai-d 1.2s steps(4) infinite}
#vai .ft{padding:10px 12px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--border);background:var(--card);display:flex;gap:8px;align-items:flex-end}
#vai .ft textarea{flex:1;min-height:42px;max-height:120px;border:1.5px solid var(--border);border-radius:12px;padding:10px 12px;font:inherit;font-size:14px;resize:none;background:var(--bg);color:var(--text);box-sizing:border-box;outline:none;line-height:1.45}
#vai .ft textarea:focus{border-color:var(--gold)}
#vai .ft .snd{width:44px;height:42px;border:0;border-radius:12px;background:var(--gold);color:#1b1b1b;display:grid;place-items:center;cursor:pointer;flex:none}
#vai .ft .snd svg{width:18px;height:18px}
#vai .ft .snd:disabled{opacity:.45;cursor:default}
#vai .note{font-size:13px;color:var(--text-mute);padding:0 14px 6px;background:var(--card)}
@media(max-width:1023px){#vai{align-items:flex-end;background:rgba(23,34,51,.5)}#vai .pn{max-width:none;height:88vh;border-radius:18px 18px 0 0;overflow:hidden;animation:vai-up .24s cubic-bezier(.2,.8,.2,1)}}
@keyframes vai-f{from{opacity:0}}
@keyframes vai-in{from{transform:translateX(40px);opacity:0}}
@keyframes vai-up{from{transform:translateY(40px);opacity:0}}
@keyframes vai-d{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}
@media (prefers-reduced-motion:reduce){#vai,#vai .pn,#vai .mini .mb,#vai .mini .vf-mascot *{animation:none!important}}
`

// 이 창이 떠 있는 동안의 대화 — 닫았다 열어도 이어진다(새로고침하면 새로)
const chat = []
let left = null

async function token() {
  const { data } = await sb.auth.getSession()
  return data && data.session ? data.session.access_token : null
}
async function api(body) {
  const tok = await token()
  if (!tok) throw Object.assign(new Error('로그인이 필요해요'), { msg: '로그인이 필요해요' })
  const r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.message || j.error || `오류 ${r.status}`), { msg: j.message || '답을 받지 못했어요 — 다시 물어봐 주세요' })
  return j
}

const SUG = {
  staff: ['오늘 내가 할 일 정리해 줘', '우리 매장 점수 올리려면 뭐부터?', '인수인계 남기는 법', '휴무 신청은 어디서 해?'],
  admin: ['현재 가장 잘 운영되는 매장 어디야?', '이번 주 손볼 매장과 이유', '인수인계 확인이 늦는 매장은?', '직원별 이번 주 업무 정리', '어제 매장에서 확인할 것', '지난주보다 좋아진 매장은?'],
}
const WAIT = ['질문 읽는 중', '기록 찾는 중', '매장 숫자 모으는 중', '비교해 정리하는 중', '거의 다 됐어요']
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch (e) { return false } }
// 답 글 — 줄이 셋 이상이면 첫 줄(결론)을 굵게
const fmt = (t) => { const L = String(t || '').split('\n'); return L.length >= 3 ? `<span class="l1">${esc(L[0])}</span>\n${esc(L.slice(1).join('\n'))}` : esc(t) }

export async function openAssistant(host = {}) {
  if (document.getElementById('vai')) return
  let st = document.getElementById('vai-css'); if (!st) { st = document.createElement('style'); st.id = 'vai-css'; st.textContent = CSS; document.head.appendChild(st) }
  const ctx = await getContext().catch(() => ({}))
  const role = (ctx.profile && ctx.profile.role) || 'staff'
  const root = document.createElement('div'); root.id = 'vai'
  root.innerHTML = `<div class="pn" role="dialog" aria-modal="true" aria-labelledby="vai-h">
    <div class="hd"><span class="mini" data-mini aria-hidden="true"><span class="mb">${typeof window.vfMascotSVG === 'function' ? window.vfMascotSVG('vai') : ''}</span></span><div><b id="vai-h">AI 도우미</b><small data-left>앱 쓰는 법 · 오늘 기록</small></div><button type="button" class="x" data-x>닫기</button></div>
    <div class="bd" data-bd aria-live="polite"></div>
    <div class="note">AI 답은 틀릴 수 있어요. 기록을 바꾸지 않고, 필요한 화면을 열어 드려요.</div>
    <div class="ft"><textarea data-q rows="1" placeholder="무엇이든 물어보세요" aria-label="질문"></textarea><button type="button" class="snd" data-send aria-label="보내기">${IC.send}</button></div>
  </div>`
  document.body.appendChild(root)
  const bd = root.querySelector('[data-bd]'), q = root.querySelector('[data-q]'), sendB = root.querySelector('[data-send]')
  const paintLeft = () => { if (left != null) root.querySelector('[data-left]').textContent = `오늘 ${left}번 더 물을 수 있어요` }
  paintLeft()
  const close = () => { document.removeEventListener('keydown', onKey); root.remove() }
  const onKey = (e) => { if (e.key === 'Escape') close() }
  document.addEventListener('keydown', onKey)
  root.querySelector('[data-x]').onclick = close
  root.onclick = (e) => { if (e.target === root) close() }

  const scrollEnd = () => { bd.scrollTop = bd.scrollHeight }
  const intro = () => {
    const box = document.createElement('div'); box.className = 'intro'
    box.innerHTML = `<b>앱 쓰는 법</b>부터 <b>매장 비교 · 원인</b>까지 물어보세요. 최근 기록을 기간 · 매장 · 사람별로 찾아 숫자로 답하고, 할 일이 있으면 그 화면을 열어 드려요.`
    const sug = document.createElement('div'); sug.className = 'sug'
    ;(role === 'staff' ? SUG.staff : SUG.admin).forEach((t) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => ask(t); sug.appendChild(b) })
    bd.appendChild(box); bd.appendChild(sug)
  }
  const extras = (an, m) => {
    if (m.go && m.go.length) {
      const g = document.createElement('div'); g.className = 'go'
      m.go.forEach((x) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = x.label; b.onclick = () => { close(); try { host.go && host.go(x.to) } catch (e) {} }; g.appendChild(b) })
      an.appendChild(g)
    }
    if (m.src && m.src.length) { const s = document.createElement('div'); s.className = 'src'; s.textContent = '근거 · ' + m.src.join(' · '); an.appendChild(s) }
    if (m.next && m.next.length && m === chat[chat.length - 1]) {
      const nx = document.createElement('div'); nx.className = 'nx'
      m.next.forEach((t) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => ask(t); nx.appendChild(b) })
      an.appendChild(nx)
    }
    if (m.id) {
      const fb = document.createElement('div'); fb.className = 'fb'
      fb.innerHTML = `<button type="button" data-g aria-pressed="${m.fb === 1}">${IC.up}맞아요</button><button type="button" class="no" data-b aria-pressed="${m.fb === -1}">${IC.down}아니에요</button><span data-s></span>`
      an.appendChild(fb)
      const s = fb.querySelector('[data-s]')
      fb.querySelector('[data-g]').onclick = async () => {
        try { await sb.rpc('vf_ai_feedback', { p_id: m.id, p_good: true, p_fix: null }); m.fb = 1; fb.querySelector('[data-g]').setAttribute('aria-pressed', 'true'); fb.querySelector('[data-b]').setAttribute('aria-pressed', 'false'); s.textContent = '고마워요' } catch (e) { s.textContent = '저장 실패' }
      }
      fb.querySelector('[data-b]').onclick = () => {
        if (an.querySelector('.fix')) return
        const fx = document.createElement('div'); fx.className = 'fix'
        fx.innerHTML = `<textarea maxlength="400" placeholder="무엇이 틀렸나요? 바른 방법 · 우리 회사에서 쓰는 말을 알려 주시면 다음부터 반영해요"></textarea><button type="button">보내기</button>`
        an.appendChild(fx); scrollEnd(); fx.querySelector('textarea').focus()
        fx.querySelector('button').onclick = async () => {
          const t = fx.querySelector('textarea').value.trim()
          try { await sb.rpc('vf_ai_feedback', { p_id: m.id, p_good: false, p_fix: t || null }); m.fb = -1; fb.querySelector('[data-b]').setAttribute('aria-pressed', 'true'); fb.querySelector('[data-g]').setAttribute('aria-pressed', 'false'); fx.remove(); s.textContent = t ? '받았어요 — 이번 주 정리 때 배워요' : '받았어요' } catch (e) { s.textContent = '저장 실패' }
        }
      }
    }
  }
  const bubble = (m) => {
    const me = document.createElement('div'); me.className = 'me'; me.textContent = m.q; bd.appendChild(me)
    const an = document.createElement('div'); an.className = 'an' + (m.wait ? ' wait' : '') + (m.err ? ' err' : '')
    an.innerHTML = `<div class="t">${m.wait ? esc(m.step || WAIT[0]) : m.err ? esc(m.a) : fmt(m.a)}</div>`
    bd.appendChild(an)
    if (m.wait || m.err) return an
    // 방금 온 답은 말하듯 한 글자씩 — 끝나면 버튼 · 이어 묻기
    if (m.fresh && !reduced()) {
      m.fresh = false
      const t = an.querySelector('.t'), full = String(m.a || ''), step = Math.max(2, Math.ceil(full.length / 70))
      let i = 0
      const tick = () => {
        if (!document.body.contains(an)) return
        i = Math.min(full.length, i + step)
        const part = full.slice(0, i), L = part.split('\n'), lines = full.split('\n').length
        t.innerHTML = (lines >= 3 ? `<span class="l1">${esc(L[0])}</span>${L.length > 1 ? '\n' + esc(L.slice(1).join('\n')) : ''}` : esc(part)) + (i < full.length ? '<span class="cur"></span>' : '')
        scrollEnd()
        if (i < full.length) setTimeout(tick, 16); else { extras(an, m); scrollEnd() }
      }
      t.innerHTML = '<span class="cur"></span>'; setTimeout(tick, 60)
    } else { m.fresh = false; extras(an, m) }
    return an
  }
  const paint = () => { bd.innerHTML = ''; if (!chat.length) intro(); chat.forEach(bubble); scrollEnd() }
  paint()

  let busy = false, factsP = null
  async function ask(text) {
    const t = String(text || q.value).trim(); if (!t || busy) return
    busy = true; sendB.disabled = true; q.value = ''; q.style.height = ''
    const m = { q: t, wait: true, step: WAIT[0] }; chat.push(m); paint(); const pn = root.querySelector('.pn'); pn.classList.remove('happy'); pn.classList.add('think')
    // 기다리는 동안 무엇을 하는지 한 줄씩(도구로 더 찾으면 10~20초 걸린다)
    let si = 0; const stepT = setInterval(() => { si = Math.min(WAIT.length - 1, si + 1); m.step = WAIT[si]; const w = bd.querySelector('.an.wait .t'); if (w) w.textContent = m.step }, 2600)
    try {
      if (!factsP) factsP = typeof host.facts === 'function' ? Promise.resolve(host.facts()).catch(() => '') : Promise.resolve('')
      const facts = await factsP
      const hist = chat.filter((x) => x !== m && x.a && !x.err).slice(-4).map((x) => ({ q: x.q, a: x.a }))
      const r = await api({ q: t, screen: host.screen || '', hist, facts })
      Object.assign(m, { wait: false, fresh: true, a: r.answer, go: r.go || [], src: r.src || [], next: r.next || [], id: r.id }); left = r.left; paintLeft()
    } catch (e) { Object.assign(m, { wait: false, err: true, a: e.msg || '답을 받지 못했어요 — 다시 물어봐 주세요' }) }
    clearInterval(stepT)
    busy = false; sendB.disabled = false; paint(); q.focus(); pn.classList.remove('think'); if (!m.err) { void pn.offsetWidth; pn.classList.add('happy') }
  }
  sendB.onclick = () => ask()
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask() } })
  q.addEventListener('input', () => { q.style.height = 'auto'; q.style.height = Math.min(120, q.scrollHeight) + 'px' })
  if (host.q) ask(host.q); else setTimeout(() => q.focus(), 60)
}

// ── 홈 아침 요약 카드(대표 · 매니저) — 오늘 것이 없으면 카드를 그리지 않는다 ──
export async function briefCardInto(el, host = {}) {
  const { data, error } = await sb.from('ai_briefs').select('body,brief_date').eq('brief_date', kst()).maybeSingle()
  if (error || !data || !data.body || !Array.isArray(data.body.lines) || !data.body.lines.length) { el.remove(); return }
  const b = data.body
  try { window.__vfBriefLines = b.lines } catch (e) {}
  // 「더 묻기」는 머리 오른쪽 — 버튼 한 줄이 카드 아래를 따로 먹지 않게
  el.innerHTML = `<div class="vh-ct"><strong>아침 요약</strong><span class="vh-tiny">어제 ${esc(mdOf(b.day))} · AI</span><button type="button" class="vai-more" data-more>더 묻기 ›</button></div>
    <ul class="vai-bl">${b.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
  el.querySelector('[data-more]').onclick = () => openAssistant({ ...host, q: '아침 요약에 나온 것 중 오늘 먼저 할 일 알려 줘' })
}

// ── AI가 배운 것(대표 · 매니저) — 우리 회사 규칙 적기 · 배운 것 보기 · 끄기 · 최근 질문 · 아침 요약 지금 만들기 ──
const CSS2 = `
#vain{position:fixed;inset:0;z-index:930;background:var(--bg);overflow:auto;color:var(--text)}
#vain .wrap{max-width:900px;margin:0 auto;padding:14px 16px 60px}
#vain .card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:12px}
#vain h2{font-size:15px;margin:0 0 4px}
#vain .hint{font-size:13px;color:var(--text-sub);line-height:1.6}
#vain .add{display:flex;gap:8px;margin-top:10px}
#vain .add input{flex:1;min-width:0;height:42px;border:1.5px solid var(--border);border-radius:10px;padding:0 12px;font:inherit;font-size:14px;background:var(--bg);color:var(--text)}
#vain .btn{border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:10px;padding:0 14px;height:42px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap}
#vain .btn.main{background:var(--navy);border-color:var(--navy);color:#fff}
#vain .btn:disabled{opacity:.5;cursor:default}
#vain .row{display:flex;gap:10px;align-items:flex-start;border-top:1px solid var(--border);padding:10px 0}
#vain .row:first-child{border-top:0}
#vain .row .b{flex:1;font-size:14px;line-height:1.55;word-break:keep-all}
#vain .row .b small{display:block;font-size:13px;color:var(--text-mute);margin-top:2px}
#vain .row .off{border:1px solid var(--border);background:transparent;color:var(--text-sub);border-radius:8px;padding:4px 10px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
#vain .empty{font-size:13px;color:var(--text-mute);padding:8px 0}
#vain .q{border-top:1px solid var(--border);padding:10px 0;font-size:13.5px}
#vain .q:first-child{border-top:0}
#vain .q .a{color:var(--text-sub);font-size:13px;margin-top:3px;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
#vain .q .tag{display:inline-block;font-size:13px;font-weight:700;border-radius:6px;padding:1px 7px;margin-left:6px;background:var(--soft);color:var(--text-sub)}
#vain .q .tag.no{background:var(--orange-light);color:var(--orange)}
#vain .q .tag.ok{background:var(--green-light);color:var(--green)}
#vain .q .fx{margin-top:4px;font-size:13px;color:var(--orange)}
#vain .stat{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
#vain .stat div{flex:1;min-width:120px;background:var(--soft);border-radius:10px;padding:10px 12px;font-size:13px;color:var(--text-sub)}
#vain .stat b{display:block;font-size:20px;color:var(--text)}
`
export async function openAiNotes(host = {}) {
  if (document.getElementById('vain')) return
  let st = document.getElementById('vain-css'); if (!st) { st = document.createElement('style'); st.id = 'vain-css'; st.textContent = CSS2; document.head.appendChild(st) }
  const ctx = await getContext()
  const T = ctx.tenantId
  const root = document.createElement('div'); root.id = 'vain'
  root.innerHTML = `<div class="header" style="position:sticky;top:0;z-index:5"><div><div class="header-title">AI가 배운 것</div><div class="header-sub">우리 회사 규칙 · 배운 것 · 최근 질문</div></div><button class="back-btn" type="button" data-x>닫기</button></div>
  <div class="wrap">
    <div class="card"><h2>우리 회사 규칙</h2><div class="hint">AI가 가장 먼저 따르는 것. 우리 회사에서 쓰는 말 · 일하는 방식을 한 줄씩 적어 주세요. 예) 마감은 22시 · 「본점」은 연수점 · 휴무는 매니저 승인 후 확정</div>
      <div class="add"><input data-in maxlength="200" placeholder="한 줄 규칙"><button type="button" class="btn main" data-add>넣기</button></div>
      <div data-rules style="margin-top:8px"></div></div>
    <div class="card"><h2>배운 것</h2><div class="hint">매주 월요일 새벽, 지난 한 주의 질문 · 「아니에요」 · 고쳐 준 말을 읽고 AI가 다시 씁니다. 틀린 것은 끄면 다음부터 쓰지 않아요.</div>
      <div data-learned style="margin-top:8px"></div></div>
    <div class="card"><h2>아침 요약</h2><div class="hint">매일 아침 8시, 어제 매장별로 있었던 일을 세 줄로 대표 · 매니저 폰과 홈 맨 위에 보냅니다.</div>
      <div class="add"><button type="button" class="btn" data-brief>오늘 요약 지금 만들기</button><span class="hint" data-bmsg style="align-self:center"></span></div></div>
    <div class="card"><h2>최근 질문</h2><div class="hint">누가 물었는지는 보이지 않아요. 「아니에요」와 고쳐 준 말이 이번 주 정리에 들어갑니다.</div>
      <div class="stat" data-stat></div><div data-qs style="margin-top:8px"></div></div>
  </div>`
  document.body.appendChild(root)
  const prevOv = document.body.style.overflow; document.body.style.overflow = 'hidden'
  const close = () => { document.removeEventListener('keydown', onKey); root.remove(); document.body.style.overflow = prevOv }
  const onKey = (e) => { if (e.key === 'Escape') close() }
  document.addEventListener('keydown', onKey)
  root.querySelector('[data-x]').onclick = close
  const $ = (s) => root.querySelector(s)

  async function loadNotes() {
    const { data, error } = await sb.from('ai_notes').select('id,kind,body,created_at').eq('tenant_id', T).eq('active', true).order('created_at', { ascending: true }).limit(100)
    if (error) { $('[data-rules]').innerHTML = `<div class="empty">불러오지 못했어요 — 잠시 뒤 다시 열어 주세요</div>`; return }
    const row = (n) => `<div class="row"><div class="b">${esc(n.body)}<small>${n.kind === 'rule' ? '적은 날' : '배운 날'} ${esc(mdOf(n.created_at))}</small></div><button type="button" class="off" data-off="${n.id}">끄기</button></div>`
    const rules = (data || []).filter((n) => n.kind === 'rule'), learned = (data || []).filter((n) => n.kind === 'learned')
    $('[data-rules]').innerHTML = rules.map(row).join('') || '<div class="empty">아직 없어요</div>'
    $('[data-learned]').innerHTML = learned.map(row).join('') || '<div class="empty">아직 없어요 — 질문이 쌓이면 월요일마다 생겨요</div>'
    root.querySelectorAll('[data-off]').forEach((b) => b.onclick = async () => {
      b.disabled = true
      const { error: e } = await sb.from('ai_notes').update({ active: false }).eq('id', b.dataset.off)
      if (e) { b.disabled = false; alert('끄지 못했어요'); return }
      loadNotes()
    })
  }
  async function loadQs() {
    const since = new Date(Date.now() - 30 * 86400e3).toISOString()
    const { data, error } = await sb.from('ai_logs').select('question,answer,feedback,correction,created_at').eq('tenant_id', T).eq('feature', 'ask').gte('created_at', since).order('created_at', { ascending: false }).limit(200)
    if (error) { $('[data-qs]').innerHTML = ''; return }
    const L = data || []
    $('[data-stat]').innerHTML = `<div><b>${L.length}</b>30일 질문</div><div><b>${L.filter((x) => x.feedback === 1).length}</b>맞아요</div><div><b>${L.filter((x) => x.feedback === -1).length}</b>아니에요</div>`
    $('[data-qs]').innerHTML = L.slice(0, 30).map((x) => `<div class="q"><b>${esc(x.question)}</b>${x.feedback === 1 ? '<span class="tag ok">맞아요</span>' : x.feedback === -1 ? '<span class="tag no">아니에요</span>' : ''}<div class="a">${esc(x.answer)}</div>${x.correction ? `<div class="fx">고쳐 준 말 · ${esc(x.correction)}</div>` : ''}</div>`).join('') || '<div class="empty">아직 질문이 없어요</div>'
  }
  $('[data-add]').onclick = async () => {
    const t = $('[data-in]').value.trim(); if (!t) return
    $('[data-add]').disabled = true
    const { error } = await sb.from('ai_notes').insert({ tenant_id: T, kind: 'rule', body: t, created_by: ctx.profileId })
    $('[data-add]').disabled = false
    if (error) { alert('넣지 못했어요 — ' + (error.message || '')); return }
    $('[data-in]').value = ''; loadNotes()
  }
  $('[data-in]').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) $('[data-add]').click() })
  $('[data-brief]').onclick = async () => {
    const b = $('[data-brief]'), m = $('[data-bmsg]'); b.disabled = true; m.textContent = '만드는 중…'
    try {
      const r = await api({ action: 'brief_now' })
      m.textContent = r.skip === 'done' ? '오늘 요약은 이미 있어요 — 홈 맨 위' : r.skip === 'quiet' ? '어제 기록이 없어 만들 게 없어요' : r.skip ? '만들지 않았어요 (' + r.skip + ')' : '만들었어요 — 홈 맨 위에서 보세요'
      try { host.onBrief && host.onBrief() } catch (e) {}
    } catch (e) { m.textContent = e.msg || '만들지 못했어요' }
    b.disabled = false
  }
  loadNotes(); loadQs()
}
