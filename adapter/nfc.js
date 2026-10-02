// NFC 출퇴근(v6.34) — 매장 태그를 폰으로 찍기 · 출입 카드를 매장 컴퓨터 리더기에 대기.
// 표: nfc_tags · staff_cards · staff_card_wait · work_sessions(in_source · out_source · in_far) — SQL_v634.
// 서버 함수: vf_nfc_tap · vf_nfc_bind · vf_nfc_clock · vf_card_clock · vf_card_undo · vf_card_wait · vf_card_remove.
// 태그 안에는 주소 하나(www.dutyvo.kr/t/번호) — vercel.json 이 /index.html?tag=번호 로 보내고, index 가 로그인 뒤 openTap 을 부른다.
// index 쪽 함수(근무 마감 한 장 · 오늘 날짜 · 매장 목록)는 window.__vfNfc 로 받는다.
import { supabase as sb } from './supabase-client.js'
import { getContext } from './context.js'

const H = () => window.__vfNfc || {}
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const hm = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const dur = (a, b) => { const m = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분` }
const today = () => (H().today ? H().today() : new Date().toISOString().slice(0, 10))
const short = (n) => (H().short ? H().short(n) : n)
const use = (k) => { try { H().use && H().use(k) } catch (e) {} }
const ask = (m, ok) => (H().confirm ? H().confirm(m, ok ? { ok } : undefined) : Promise.resolve(window.confirm(m)))
const notReady = (e) => /function|does not exist|schema cache|relation/i.test(String((e && e.message) || e || ''))
const errText = (e) => notReady(e) ? '아직 준비 중인 기능입니다 — 관리자에게 알려 주세요' : (/[가-힣]/.test(String(e && e.message)) ? e.message : '저장하지 못했습니다 — 인터넷을 확인해 주세요')

const CSS = `
.nf-chip{display:inline-block;font-size:12.5px;font-weight:700;border-radius:999px;padding:2px 10px;background:var(--soft);color:var(--text-sub)}
.nf-big{font-size:46px;font-weight:800;letter-spacing:-1px;line-height:1.1;margin:6px 0 4px;font-variant-numeric:tabular-nums}
.nf-loc{font-size:13.5px;margin:4px 0 2px;color:var(--text-sub)}
.nf-loc.ok{color:var(--green)}.nf-loc.far{color:var(--orange)}
.nf-pick{display:flex;flex-direction:column;gap:6px;margin:10px 0}
.nf-pick label{display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:10px;padding:10px 12px;font-weight:600;cursor:pointer}
.nf-pick input{accent-color:var(--gold);width:18px;height:18px}
.nf-in{width:100%;box-sizing:border-box;border:1.5px solid var(--border);border-radius:8px;padding:9px 10px;font:inherit;font-size:14px;background:var(--card);color:var(--text)}
.nf-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:3000;background:var(--text);color:var(--card);border-radius:16px;padding:14px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 18px 40px -12px rgba(0,0,0,.45);width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box}
.nf-toast>div{min-width:0}
.nf-toast .k{font-size:13px;font-weight:800;border-radius:999px;padding:3px 10px;background:var(--green);color:#fff;white-space:nowrap}
.nf-toast .k.out{background:var(--navy)}.nf-toast .k.warn{background:var(--orange)}
.nf-toast b{display:block;font-size:20px;font-weight:800;letter-spacing:-.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nf-toast small{display:block;font-size:13px;opacity:.75;margin-top:2px}
.nf-toast button{border:1px solid rgba(255,255,255,.35);background:transparent;color:inherit;border-radius:10px;padding:8px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
.nf-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center;border-top:1px solid var(--border);padding:10px 0;font-size:13.5px}
.nf-row:first-child{border-top:0}
.nf-row small{display:block;color:var(--text-sub);font-size:12.5px}
.nf-h{font-size:13px;font-weight:800;color:var(--text-sub);margin:14px 0 4px}
.nf-sub{font-size:13px;color:var(--text-sub);line-height:1.6;margin:4px 0 8px}
.nf-src{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:1px 7px;background:var(--soft);color:var(--text-sub);margin-left:6px}
.nf-src.tag{background:var(--green-light);color:var(--green)}.nf-src.card{background:var(--orange-light);color:var(--orange)}
.nf-src.far{background:var(--red-light);color:var(--red)}
.nf-step{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.nf-step button{border:0;background:var(--soft);width:30px;height:30px;font:inherit;font-weight:800;cursor:pointer;color:var(--text)}
.nf-step span{min-width:32px;text-align:center;font-weight:800}
`
function css() { if (!document.getElementById('nf-css')) { const s = document.createElement('style'); s.id = 'nf-css'; s.textContent = CSS; document.head.appendChild(s) } }

// 아래에서 올라오는 한 장 — 앱의 다른 시트와 같은 모양
function sheet(html) {
  css()
  const ov = document.createElement('div'); ov.className = 'vh-sheet-bg'
  const sh = document.createElement('div'); sh.className = 'vh-sheet'
  sh.innerHTML = `<div class="vh-sheet-handle" aria-hidden="true"></div>${html}`
  ov.appendChild(sh); document.body.appendChild(ov)
  const close = () => { ov.remove() }
  ov.onclick = (e) => { if (e.target === ov) close() }
  sh.querySelectorAll('[data-x]').forEach((b) => b.onclick = close)
  return { ov, sh, close }
}
function toast(kind, title, sub, opts = {}) {
  css()
  document.querySelectorAll('.nf-toast').forEach((x) => x.remove())
  const t = document.createElement('div'); t.className = 'nf-toast'; t.setAttribute('role', 'status')
  t.innerHTML = `<span class="k ${kind === 'out' ? 'out' : kind === 'warn' ? 'warn' : ''}">${esc(opts.label || (kind === 'out' ? '퇴근' : kind === 'warn' ? '확인' : '출근'))}</span><div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${opts.undo ? '<button type="button" data-u>되돌리기 5</button>' : ''}`
  document.body.appendChild(t)
  let left = 5, iv = null
  const done = () => { clearInterval(iv); t.remove() }
  if (opts.undo) {
    const b = t.querySelector('[data-u]')
    iv = setInterval(() => { left--; if (left <= 0) done(); else b.textContent = `되돌리기 ${left}` }, 1000)
    b.onclick = async () => { clearInterval(iv); b.disabled = true; b.textContent = '되돌리는 중'; const ok = await opts.undo(); t.remove(); if (ok) toast('warn', '되돌렸습니다', opts.undoSub || '', { label: '취소' }) }
  } else setTimeout(done, opts.ms || 4500)
  return t
}

// 위치 — 못 읽으면 null(출근은 그대로 남는다)
function where(ms = 6000) {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null)
    let fin = false; const end = (v) => { if (!fin) { fin = true; res(v) } }
    setTimeout(() => end(null), ms + 500)
    navigator.geolocation.getCurrentPosition((p) => end({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), () => end(null), { enableHighAccuracy: true, timeout: ms, maximumAge: 60000 })
  })
}
function distM(a, b) {
  const R = 6371000, r = (x) => x * Math.PI / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

// ── 태그를 찍고 들어왔을 때 ──
export async function openTap(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 7)
  const s = sheet(`<h3>태그 확인 중</h3><span class="vh-tiny">${esc(c)}</span>`)
  let r
  try { const q = await sb.rpc('vf_nfc_tap', { p_code: c, p_day: today() }); if (q.error) throw q.error; r = q.data || {} } catch (e) { s.close(); msg('태그를 읽지 못했습니다', errText(e)); return }
  s.close()
  use('nfc_tap_' + (r.state || 'x'))
  if (r.state === 'unknown') return msg('Dutyvo 태그가 아닙니다', '번호를 찾지 못했습니다. 다른 태그이거나 번호가 바뀌었을 수 있습니다')
  if (r.state === 'other') return msg('다른 회사 태그입니다', '우리 회사 매장에 붙은 태그만 찍을 수 있습니다')
  if (r.state === 'off') return msg('쓰지 않게 된 태그입니다', '관리자가 이 태그를 껐습니다. 새 태그를 찍어 주세요')
  if (r.state === 'feature_off') return msg('NFC 출퇴근을 쓰지 않는 회사입니다', '관리자: 설정 → 기능 → 「NFC 출퇴근」 켜기')
  if (r.state === 'unbound') return r.can_bind ? bindSheet(r.code) : msg('아직 연결 전인 태그입니다', '대표 · 매니저가 이 태그를 폰으로 한 번 찍으면 쓸 수 있습니다')
  if (r.state !== 'ok') return msg('태그를 읽지 못했습니다', '다시 찍어 주세요')
  if (!r.started_at) return inSheet(r)
  const stores = H().stores ? H().stores() : []
  const sid = r.work_store_id || r.store_id
  const entry = stores.find((x) => x.id === sid) || { id: sid, name: r.store_name || '' }
  if (!r.ended_at) {
    // 퇴근 — 앱의 「근무 마감」 한 장 그대로(남은 것), 시각만 태그로 남긴다
    if (H().closeSheet) return H().closeSheet(entry, (cl) => { after(cl); toast('out', `${hm(cl && cl.ended_at)} · ${short(r.store_name || '')}`, cl && cl.started_at ? `출근 ${hm(cl.started_at)} · ${dur(cl.started_at, cl.ended_at)}` : '') }, { out: () => clockRpc(r.code, 'out') })
    return outSheet(r)
  }
  outAgain(r)
}
function msg(title, sub) {
  const s = sheet(`<h3>${esc(title)}</h3><div class="nf-sub">${esc(sub)}</div><div class="vh-sheet-btns"><button class="vh-btn primary" data-x style="flex:1">닫기</button></div>`)
  return s
}
function after(c) { try { H().afterClock && H().afterClock(c) } catch (e) {} }
async function clockRpc(code, kind, pos) {
  try {
    const q = await sb.rpc('vf_nfc_clock', { p_code: code, p_kind: kind, p_day: today(), p_lat: pos ? pos.lat : null, p_lng: pos ? pos.lng : null, p_acc: pos ? pos.acc : null })
    if (q.error) throw q.error
    use(kind === 'in' ? 'clock_in_tag' : 'clock_out_tag')
    return q.data
  } catch (e) { alert(errText(e)); return null }
}
function inSheet(r) {
  const me = (window.__vflowProfile || {}).name || ''
  const now = new Date()
  const s = sheet(`<span class="nf-chip">${esc(short(r.store_name || ''))}${r.label ? ` · ${esc(r.label)}` : ''}</span>
    <h3 style="margin-top:10px">${esc(me)} · 출근할까요?</h3>
    <div class="nf-big">${hm(now.toISOString())}</div>
    <div class="nf-loc" data-loc>${r.ref ? '위치 확인 중' : '이 태그는 위치 기준이 없습니다'}</div>
    <div class="vh-sheet-btns"><button class="vh-btn" data-x style="flex:1">취소</button><button class="vh-btn primary" data-ok style="flex:1">출근</button></div>`)
  let pos = null, got = false
  const loc = s.sh.querySelector('[data-loc]')
  const p = r.ref ? where().then((v) => {
    pos = v; got = true
    if (!v) { loc.textContent = '위치 확인 안 됨 · 출근은 남습니다'; return }
    const d = distM({ lat: r.lat, lng: r.lng }, v), far = d > Math.max(150, (v.acc || 0) + 100)
    loc.className = 'nf-loc ' + (far ? 'far' : 'ok')
    loc.textContent = far ? `매장에서 먼 곳(약 ${d >= 1000 ? (d / 1000).toFixed(1) + 'km' : d + 'm'}) · 출근은 남고 「위치 밖」 표시` : '매장 근처 확인됨'
  }) : Promise.resolve()
  const ok = s.sh.querySelector('[data-ok]')
  ok.onclick = async () => {
    ok.disabled = true; ok.textContent = got || !r.ref ? '저장 중' : '위치 확인 중'
    if (r.ref && !got) await Promise.race([p, new Promise((z) => setTimeout(z, 4000))])
    ok.textContent = '저장 중'
    const c = await clockRpc(r.code, 'in', pos)
    if (!c) { ok.disabled = false; ok.textContent = '출근'; return }
    s.close(); after(c)
    toast(c.far ? 'warn' : 'in', `${hm(c.started_at)} · ${short(r.store_name || '')}`, c.far ? '매장에서 먼 곳 · 기록에 「위치 밖」 표시' : '', { label: '출근' })
  }
}
function outSheet(r) {
  const s = sheet(`<h3>퇴근할까요?</h3><div class="nf-sub">출근 ${hm(r.started_at)} · 지금 ${hm(new Date().toISOString())} · ${dur(r.started_at, new Date())}</div>
    <div class="vh-sheet-btns"><button class="vh-btn" data-x style="flex:1">취소</button><button class="vh-btn primary" data-ok style="flex:1">퇴근</button></div>`)
  const ok = s.sh.querySelector('[data-ok]')
  ok.onclick = async () => { ok.disabled = true; const c = await clockRpc(r.code, 'out'); if (!c) { ok.disabled = false; return } s.close(); after(c); toast('out', `${hm(c.ended_at)} · ${short(r.store_name || '')}`, `출근 ${hm(c.started_at)} · ${dur(c.started_at, c.ended_at)}`) }
}
function outAgain(r) {
  const s = sheet(`<h3>오늘은 퇴근했습니다</h3><div class="nf-sub">출근 ${hm(r.started_at)} · 퇴근 ${hm(r.ended_at)}. 아직 일하는 중이면 퇴근 시각을 지금으로 바꿉니다</div>
    <div class="vh-sheet-btns"><button class="vh-btn" data-x style="flex:1">닫기</button><button class="vh-btn primary" data-ok style="flex:1">퇴근 시각을 지금으로</button></div>`)
  const ok = s.sh.querySelector('[data-ok]')
  ok.onclick = async () => { ok.disabled = true; const c = await clockRpc(r.code, 'out'); if (!c) { ok.disabled = false; return } s.close(); after(c); toast('out', `${hm(c.ended_at)} · ${short(r.store_name || '')}`, '퇴근 시각을 바꿨습니다') }
}
// 관리자 — 새 태그를 처음 찍었을 때: 어느 매장 · 붙인 자리. 지금 위치를 이 태그의 기준으로
function bindSheet(code) {
  const stores = (H().stores ? H().stores() : []).filter((x) => !x.closed)
  const s = sheet(`<h3>새 태그 · 어느 매장에 쓸까요?</h3><span class="vh-tiny">태그 ${esc(code)} · 한 번 연결하면 직원이 찍을 때 이 매장으로 출근</span>
    <div class="nf-pick">${stores.map((x, i) => `<label><input type="radio" name="nfst" value="${esc(x.id)}" ${i === 0 && stores.length === 1 ? 'checked' : ''}>${esc(x.name)}</label>`).join('') || '<div class="nf-sub">매장이 없습니다 — 설정에서 먼저 매장을 만들어 주세요</div>'}</div>
    <input class="nf-in" data-l maxlength="40" placeholder="붙인 자리 (예: 입구 세콤 아래)">
    <div class="nf-sub" style="margin-top:8px">태그 앞에서 연결해 주세요 — 지금 위치를 이 태그의 기준으로 남깁니다. 직원이 멀리서 찍으면 기록에 「위치 밖」이 붙습니다</div>
    <div class="vh-sheet-btns"><button class="vh-btn" data-x style="flex:1">취소</button><button class="vh-btn primary" data-ok style="flex:1">연결</button></div>`)
  const ok = s.sh.querySelector('[data-ok]')
  ok.onclick = async () => {
    const st = s.sh.querySelector('input[name=nfst]:checked'); if (!st) { alert('매장을 골라 주세요'); return }
    ok.disabled = true; ok.textContent = '위치 확인 중'
    let pos = await where(8000)
    if (!pos && !await ask('위치를 읽지 못했습니다.\n위치 기준 없이 연결할까요? 직원이 어디서 찍었는지는 확인하지 않습니다', '연결')) { ok.disabled = false; ok.textContent = '연결'; return }
    ok.textContent = '저장 중'
    try {
      const q = await sb.rpc('vf_nfc_bind', { p_code: code, p_store: st.value, p_label: s.sh.querySelector('[data-l]').value.trim(), p_lat: pos ? pos.lat : null, p_lng: pos ? pos.lng : null })
      if (q.error) throw q.error
      use('nfc_bind'); s.close()
      toast('in', `태그 연결 · ${short((stores.find((x) => x.id === st.value) || {}).name || '')}`, '이제 직원이 찍으면 출근 · 퇴근', { label: '연결' })
    } catch (e) { ok.disabled = false; ok.textContent = '연결'; alert(errText(e)) }
  }
}

// ── 매장 컴퓨터 — 리더기(키보드처럼 번호를 빠르게 치고 Enter)에 카드를 대면 출근 · 퇴근 ──
let _armed = false
export function armCardReader() {
  if (_armed) return; _armed = true
  let buf = '', t0 = 0, last = 0, busy = false
  document.addEventListener('keydown', (e) => {
    const a = document.activeElement
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) { buf = ''; return }
    const now = performance.now()
    if (e.key === 'Enter') {
      const fast = buf.length >= 6 && now - t0 < 900 && now - last < 150
      const no = buf; buf = ''
      if (!fast || busy) return
      e.preventDefault(); e.stopPropagation()
      busy = true; cardTap(no).finally(() => { busy = false })
      return
    }
    if (e.key && e.key.length === 1 && /[0-9a-fA-F]/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (now - last > 150) { buf = ''; t0 = now }
      buf += e.key; last = now
    } else if (e.key !== 'Shift') buf = ''
  }, true)
}
async function cardTap(no) {
  const ent = H().entry ? H().entry() : null
  if (!ent) return
  let r
  try { const q = await sb.rpc('vf_card_clock', { p_card: no, p_store: ent.id, p_day: today() }); if (q.error) throw q.error; r = q.data || {} } catch (e) { toast('warn', '카드를 읽지 못했습니다', errText(e), { label: '카드' }); return }
  use('card_' + (r.state || 'x'))
  const day = today()
  if (r.state === 'in') {
    toast('in', `${r.name} · ${hm(r.at)}`, short(ent.name || ''), { undo: async () => { const q = await sb.rpc('vf_card_undo', { p_profile: r.profile_id, p_kind: 'in', p_day: day }); return !q.error && q.data }, undoSub: `${r.name} 출근 기록을 지웠습니다` })
  } else if (r.state === 'out') {
    toast('out', `${r.name} · ${hm(r.at)}`, r.started_at ? `출근 ${hm(r.started_at)} · ${dur(r.started_at, r.at)}` : '', { undo: async () => { const q = await sb.rpc('vf_card_undo', { p_profile: r.profile_id, p_kind: 'out', p_day: day }); return !q.error && q.data }, undoSub: `${r.name} 퇴근 기록을 지웠습니다` })
  } else if (r.state === 'same') toast('warn', `${r.name} · 방금 찍혔습니다`, '1분 안에 다시 댄 카드는 한 번만 남습니다', { label: '카드' })
  else if (r.state === 'registered') toast('in', `${r.name} 카드 등록`, `카드 끝 ${r.tail} · 이제 대면 출근 · 퇴근`, { label: '등록' })
  else if (r.state === 'unknown') toast('warn', '등록되지 않은 카드', `카드 끝 ${r.tail} · 관리자: 설정 → 사람 → NFC 출퇴근 → 카드 등록`, { label: '카드', ms: 7000 })
  else if (r.state === 'feature_off') toast('warn', 'NFC 출퇴근이 꺼져 있습니다', '관리자: 설정 → 기능', { label: '카드' })
}

// ── 설정 → 사람 → NFC 출퇴근: 태그 · 카드 · 요청 ──
export async function settingsCard(box) {
  css()
  const ctx = await getContext()
  const stores = H().stores ? H().stores() : []
  const sName = (id) => (stores.find((x) => x.id === id) || {}).name || ''
  let tags = [], cards = [], people = [], tks = [], err = '', openForm = false
  async function load() {
    const [a, b, c, d] = await Promise.all([
      sb.from('nfc_tags').select('code,store_id,label,bound_at,active,lat').eq('tenant_id', ctx.tenantId).order('bound_at', { ascending: true }),
      sb.from('staff_cards').select('profile_id,card_no,created_at').eq('tenant_id', ctx.tenantId).eq('active', true),
      sb.from('profiles').select('id,name,role,status,monitor_only').eq('tenant_id', ctx.tenantId),
      sb.from('support_tickets').select('id,body,status,answer,answered_at,created_at').eq('tenant_id', ctx.tenantId).eq('kind', 'nfc').order('created_at', { ascending: false }).limit(5),
    ])
    if (a.error) throw a.error
    tags = a.data || []; cards = b.data || []; people = (c.data || []).filter((p) => (p.status || 'active') !== 'inactive' && !p.monitor_only).sort((x, y) => x.name.localeCompare(y.name, 'ko')); tks = d.data || []
  }
  const cardOf = (pid) => cards.find((x) => x.profile_id === pid)
  function paint() {
    const live = tags.filter((t) => t.active)
    const tagRows = live.map((t) => `<div class="nf-row"><div><b>${t.store_id ? esc(sName(t.store_id)) : '연결 전'}</b>${t.label ? ` · ${esc(t.label)}` : ''}<small>${esc(t.code)} · ${t.store_id ? `연결 ${String(t.bound_at || '').slice(5, 10).replace('-', '/')}${t.lat == null ? ' · 위치 기준 없음' : ''}` : '매장 태그 앞에서 대표 · 매니저 폰으로 한 번 찍기'}</small></div>${t.store_id ? `<button type="button" class="vh-btn" data-off="${esc(t.code)}">쓰지 않기</button>` : ''}</div>`).join('')
    const pRows = people.map((p) => { const cd = cardOf(p.id); return `<div class="nf-row"><div><b>${esc(p.name)}</b><small>${cd ? `카드 끝 ${esc(cd.card_no.slice(-4))}` : '카드 없음'}</small></div><span style="display:flex;gap:6px">${cd ? `<button type="button" class="vh-btn" data-rm="${p.id}">빼기</button>` : ''}<button type="button" class="vh-btn" data-reg="${p.id}">${cd ? '바꾸기' : '카드 등록'}</button></span></div>` }).join('')
    const tkRows = tks.map((k) => `<div class="nf-row"><div><b>요청 ${String(k.created_at).slice(5, 10).replace('-', '/')}</b> <span class="nf-src">${k.status === 'open' ? '접수' : k.status === 'answered' ? '답 옴' : '끝'}</span><small>${esc(k.answer || String(k.body || '').split('\n')[0])}</small></div></div>`).join('')
    box.innerHTML = `${err ? `<div class="nf-sub" style="color:var(--red)">${esc(err)}</div>` : ''}
      <div class="nf-sub">직원은 폰으로 매장 태그를 찍거나, NFC 없는 폰이면 출입 카드를 매장 컴퓨터 리더기에 대서 출근 · 퇴근합니다. 매장에서 먼 곳에서 찍으면 기록에 「위치 밖」이 붙습니다</div>
      <div class="nf-h">태그 ${live.length}</div>${tagRows || '<div class="nf-sub">아직 태그가 없습니다 — 아래 「태그 · 카드 요청」</div>'}
      <div class="nf-h">출입 카드 ${cards.length}</div><div class="nf-sub">「카드 등록」을 누른 뒤 5분 안에 그 카드를 매장 컴퓨터 리더기에 대면 그 사람 카드가 됩니다</div><div data-wait></div>${pRows}
      <div class="nf-h">요청</div>${tkRows}
      <div data-form></div>
      ${openForm ? '' : '<button type="button" class="vh-btn primary" data-req style="margin-top:8px">태그 · 카드 요청</button>'}`
    box.querySelectorAll('[data-off]').forEach((b) => b.onclick = async () => {
      if (!await ask(`태그 ${b.dataset.off}를 쓰지 않을까요?\n그 태그를 찍어도 출근되지 않습니다. 예비 태그를 새로 연결해 주세요`, '쓰지 않기')) return
      const q = await sb.rpc('vf_nfc_off', { p_code: b.dataset.off }); if (q.error) { alert(errText(q.error)); return }
      await reload()
    })
    box.querySelectorAll('[data-rm]').forEach((b) => b.onclick = async () => {
      const p = people.find((x) => x.id === b.dataset.rm)
      if (!await ask(`${p ? p.name : ''} 카드를 뺄까요?\n그 카드를 대도 출근되지 않습니다`, '빼기')) return
      const q = await sb.rpc('vf_card_remove', { p_profile: b.dataset.rm }); if (q.error) { alert(errText(q.error)); return }
      await reload()
    })
    box.querySelectorAll('[data-reg]').forEach((b) => b.onclick = () => waitCard(b.dataset.reg))
    const rq = box.querySelector('[data-req]'); if (rq) rq.onclick = () => { openForm = true; paint() }
    if (openForm) requestForm(box.querySelector('[data-form]'))
  }
  let waitT = null
  async function waitCard(pid) {
    const p = people.find((x) => x.id === pid) || {}
    const w = box.querySelector('[data-wait]')
    clearInterval(waitT)
    const q = await sb.rpc('vf_card_wait', { p_profile: pid })
    if (q.error) { alert(errText(q.error)); return }
    use('card_wait')
    const until = new Date(q.data).getTime(), before = (cardOf(pid) || {}).card_no || ''
    const tick = async (poll) => {
      const left = Math.max(0, Math.round((until - Date.now()) / 1000))
      if (!w.isConnected) { clearInterval(waitT); return }
      w.innerHTML = `<div class="nf-row" style="background:var(--soft);border-radius:10px;padding:10px 12px;border:0"><div><b>${esc(p.name)} 카드 기다리는 중</b><small>매장 컴퓨터 리더기에 카드를 대 주세요 · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</small></div><button type="button" class="vh-btn" data-stop>그만</button></div>`
      w.querySelector('[data-stop]').onclick = () => { clearInterval(waitT); w.innerHTML = '' }
      if (!left) { clearInterval(waitT); w.innerHTML = '<div class="nf-sub">시간이 지났습니다 — 다시 「카드 등록」</div>'; return }
      if (poll) {
        const r = await sb.from('staff_cards').select('card_no').eq('profile_id', pid).eq('active', true).limit(1)
        const now = r.data && r.data[0] && r.data[0].card_no
        if (now && now !== before) { clearInterval(waitT); await reload(); const w2 = box.querySelector('[data-wait]'); if (w2) w2.innerHTML = `<div class="nf-sub" style="color:var(--green)">${esc(p.name)} 카드 등록됨 · 끝 ${esc(now.slice(-4))}</div>` }
      }
    }
    let n = 0; tick(false); waitT = setInterval(() => { n++; tick(n % 3 === 0) }, 1000)
  }
  function requestForm(host) {
    const live = stores.filter((x) => !x.closed)
    const st = { phone: true, card: false, tags: Object.fromEntries(live.map((x) => [x.id, 1])), cards: people.length, readers: live.length }
    const step = (k, id) => `<span class="nf-step"><button type="button" data-m="${k}" data-id="${id || ''}">−</button><span data-v="${k}${id || ''}">${id ? st.tags[id] : st[k]}</span><button type="button" data-p="${k}" data-id="${id || ''}">+</button></span>`
    host.innerHTML = `<div style="border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-top:10px">
      <div class="nf-h" style="margin-top:0">찍는 방식</div>
      <div class="nf-pick"><label><input type="checkbox" data-k="phone" checked>폰으로 찍기 — 매장 태그</label><label><input type="checkbox" data-k="card">카드로 찍기 — 출입 카드 + 매장 컴퓨터 리더기</label></div>
      <div data-tagsec><div class="nf-h">매장 · 태그 개수</div><div class="nf-sub" style="margin:0 0 4px">매장마다 예비 1개를 같이 보냅니다</div>${live.map((x) => `<div class="nf-row"><span>${esc(x.name)}</span>${step('tags', x.id)}</div>`).join('')}</div>
      <div data-cardsec style="display:none"><div class="nf-h">카드 · 리더기</div><div class="nf-row"><span>카드<small>직원 ${people.length}명 기준</small></span>${step('cards')}</div><div class="nf-row"><span>리더기<small>매장 컴퓨터마다 1대</small></span>${step('readers')}</div></div>
      <div class="nf-h">받을 곳</div><input class="nf-in" data-addr maxlength="120" placeholder="주소"><input class="nf-in" data-who maxlength="40" placeholder="받는 분 · 연락처" style="margin-top:6px">
      <div class="nf-sub" data-sum style="margin-top:10px"></div>
      <div class="vh-sheet-btns"><button type="button" class="vh-btn" data-cancel style="flex:1">닫기</button><button type="button" class="vh-btn primary" data-send style="flex:1">요청 보내기</button></div></div>`
    const sum = () => {
      const tagN = st.phone ? Object.values(st.tags).reduce((a, b) => a + b, 0) : 0
      const spare = st.phone ? Object.values(st.tags).filter((v) => v > 0).length : 0
      host.querySelector('[data-sum]').textContent = [st.phone ? `태그 ${tagN} + 예비 ${spare}` : '', st.card ? `카드 ${st.cards} · 리더기 ${st.readers}` : ''].filter(Boolean).join(' · ') || '방식을 골라 주세요'
      host.querySelector('[data-tagsec]').style.display = st.phone ? '' : 'none'
      host.querySelector('[data-cardsec]').style.display = st.card ? '' : 'none'
    }
    host.querySelectorAll('[data-k]').forEach((c) => c.onchange = () => { st[c.dataset.k] = c.checked; sum() })
    const bump = (k, id, d) => { if (id) st.tags[id] = Math.max(0, Math.min(5, st.tags[id] + d)); else st[k] = Math.max(0, Math.min(99, st[k] + d)); host.querySelector(`[data-v="${k}${id}"]`).textContent = id ? st.tags[id] : st[k]; sum() }
    host.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => bump(b.dataset.m, b.dataset.id, -1))
    host.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => bump(b.dataset.p, b.dataset.id, 1))
    host.querySelector('[data-cancel]').onclick = () => { openForm = false; paint() }
    host.querySelector('[data-send]').onclick = async (ev) => {
      const addr = host.querySelector('[data-addr]').value.trim(), who = host.querySelector('[data-who]').value.trim()
      if (!st.phone && !st.card) { alert('찍는 방식을 골라 주세요'); return }
      if (!addr || !who) { alert('받을 주소와 받는 분 · 연락처를 적어 주세요'); return }
      const lines = ['[NFC 요청]', st.phone ? '태그 — ' + live.filter((x) => st.tags[x.id] > 0).map((x) => `${x.name} ${st.tags[x.id]}(+예비 1)`).join(', ') : '', st.card ? `카드 ${st.cards}장 · 리더기 ${st.readers}대` : '', `받을 곳: ${addr}`, `받는 분: ${who}`].filter(Boolean)
      ev.target.disabled = true; ev.target.textContent = '보내는 중'
      const { error } = await sb.from('support_tickets').insert({ tenant_id: ctx.tenantId, profile_id: ctx.profileId, kind: 'nfc', body: lines.join('\n') })
      if (error) { ev.target.disabled = false; ev.target.textContent = '요청 보내기'; alert(errText(error)); return }
      use('nfc_request'); openForm = false; await reload()
      toast('in', '요청을 보냈습니다', '보내면 「Dutyvo에 문의」 답으로 송장을 알려 드립니다', { label: '요청' })
    }
    sum()
  }
  async function reload() { try { await load(); err = '' } catch (e) { err = notReady(e) ? '아직 준비 중입니다 — SQL(v6.34)을 먼저 실행해 주세요' : '불러오지 못했습니다 — ' + (e.message || e) } paint() }
  await reload()
}

// ── 매장 방 — 오늘 출근 기록(관리자). 어떻게 찍었는지 · 위치 밖 ──
export async function storeAttendance(box, storeId) {
  css()
  const ctx = await getContext()
  const day = today()
  let q = await sb.from('work_sessions').select('profile_id,started_at,ended_at,in_source,in_far').eq('store_id', storeId).eq('work_date', day).limit(200)
  if (q.error && /in_source|in_far/.test(String(q.error.message || ''))) q = await sb.from('work_sessions').select('profile_id,started_at,ended_at').eq('store_id', storeId).eq('work_date', day).limit(200)
  const rows = (q.data || []).filter((r) => r.started_at).sort((a, b) => a.started_at < b.started_at ? -1 : 1)
  if (!rows.length) { box.innerHTML = ''; return }
  const ids = rows.map((r) => r.profile_id)
  const p = await sb.from('profiles').select('id,name').eq('tenant_id', ctx.tenantId).in('id', ids)
  const nm = Object.fromEntries((p.data || []).map((x) => [x.id, x.name]))
  const SRC = { tag: ['태그', 'tag'], card: ['카드', 'card'] }
  box.innerHTML = `<div class="vh-fixed-head"><span>오늘 출근</span><span class="vh-tiny">${rows.length}명</span></div>` + rows.map((r) => { const s = SRC[r.in_source] || ['컴퓨터', '']; return `<div class="nf-row"><div><b>${esc(nm[r.profile_id] || '')}</b><span class="nf-src ${s[1]}">${s[0]}</span>${r.in_far ? '<span class="nf-src far">위치 밖</span>' : ''}</div><span class="vh-tiny">${hm(r.started_at)}${r.ended_at ? ` – ${hm(r.ended_at)}` : ' –'}</span></div>` }).join('')
}
