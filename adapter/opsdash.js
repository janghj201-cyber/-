// 관리자 사이트 /ops(v6.38) — 운영자만. 앱 안쪽 운영자 화면(ops.js)을 따로 주소로 꺼내고 「한눈에」 · 「문의 · 오류」를 더했다.
// 보는 것: 회사별 숫자(vf_ops_companies) · 앱 문의(vf_ops_tickets) · 홈페이지 보고(site_reports) · 주별 쓰는 회사(vf_ops_weekly).
// 보지 않는 것: 회사 안의 인수인계 · 할 일 · 사진 — 숫자만.
// 「회사」 · 「NFC 태그」는 ops.js 의 화면을 그대로 연다(같은 코드 하나).
import { supabase as sb } from './supabase-client.js'

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const DAY = 864e5
const IND = { cafe: '카페', convenience: '편의점', beauty: '뷰티', academy: '학원', etc: '기타', restaurant: '음식점', wholesale: '도매 · 유통', clinic: '의원 · 치료' }
const TK = { ask: '질문', bug: '불편한 점', idea: '기능 제안', close: '회사 정리 요청', export: '데이터 받기 요청', nfc: 'NFC 요청' }
const SK = { bug: '오류 · 고장', inconvenience: '불편한 점', idea: '이런 기능', etc: '기타' }
const ago = (iso) => { if (!iso) return '-'; const m = Math.floor((Date.now() - new Date(iso)) / 60e3); if (m < 60) return `${Math.max(1, m)}분`; const h = Math.floor(m / 60); if (h < 24) return `${h}시간`; const d = Math.floor(h / 24); return d === 1 ? '어제' : `${d}일` }
const md = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }
const days = (iso) => iso ? Math.floor((Date.now() - new Date(iso)) / DAY) : null

export async function mountOps(root) {
  const { data: ses } = await sb.auth.getSession()
  if (!ses || !ses.session) {
    root.innerHTML = `<div class="gate"><b>Dutyvo에 로그인한 뒤 다시 열어 주세요</b><p>운영자 계정으로 앱에 로그인하면 이 주소에서 바로 열립니다.</p><a class="btn pri" href="/index.html">로그인하러 가기</a></div>`
    return
  }
  let tab = 'home', flt = 'open', cos = [], tks = [], reps = [], wk = [], repErr = '', wkErr = ''
  async function load() {
    const [a, b, c, w] = await Promise.all([sb.rpc('vf_ops_companies'), sb.rpc('vf_ops_tickets'),
      sb.from('site_reports').select('id,kind,body,contact,page,ua,screen,status,memo,done_at,created_at').order('created_at', { ascending: false }).limit(300),
      sb.rpc('vf_ops_weekly')])
    if (a.error) throw a.error
    if (b.error) throw b.error
    cos = a.data || []; tks = (b.data || []).filter((k) => k.kind !== 'nfc' || k.status === 'open')
    reps = c.error ? [] : (c.data || []); repErr = c.error ? 'SQL_v638 실행 전 — 홈페이지 보고는 아직 안 보여요' : ''
    wk = w.error ? [] : (w.data || []); wkErr = w.error ? 'SQL_v638 실행 전' : ''
  }
  const toast = (t) => { const o = document.querySelector('.ops-toast'); if (o) o.remove(); const d = document.createElement('div'); d.className = 'ops-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600) }

  // 문의 · 오류 한 줄로 — 앱 문의와 홈페이지 보고를 같은 모양으로
  const items = () => [
    ...tks.map((k) => ({ src: k.kind === 'nfc' ? 'nfc' : 'app', id: k.id, kind: TK[k.kind] || k.kind, body: k.body, who: `${k.tenant_name || ''}${k.who ? ' · ' + k.who : ''}`, status: k.status, answer: k.answer, at: k.created_at })),
    ...reps.map((r) => ({ src: 'web', id: r.id, kind: SK[r.kind] || '기타', body: r.body, who: [r.page, r.screen, r.contact ? '답 받을 곳 있음' : '답 받을 곳 없음'].filter(Boolean).join(' · '), contact: r.contact, ua: r.ua, status: r.status, answer: r.memo, at: r.created_at })),
  ]
  const srcTag = (x) => x.src === 'web' ? `<span class="src web">홈페이지 · ${esc(x.kind)}</span>` : x.src === 'nfc' ? '<span class="src nfc">NFC 요청</span>' : `<span class="src app">앱 · ${esc(x.kind)}</span>`

  function paint(err) {
    const all = items(), open = all.filter((x) => x.status === 'open')
    const nfcOpen = tks.filter((k) => k.kind === 'nfc' && k.status === 'open').length
    const nav = `<nav class="nav"><div class="lg"><img src="/icons/dutyvo-mark-white.svg" alt="" width="24" height="24">Dutyvo<small>운영</small></div>
      <button data-tab="home" aria-pressed="${tab === 'home'}">한눈에</button>
      <button data-tab="list" aria-pressed="${tab === 'list'}">문의 · 오류${open.length ? `<em>${open.length}</em>` : ''}</button>
      <button data-open="companies">회사</button>
      <button data-open="nfc">NFC 태그${nfcOpen ? `<em>${nfcOpen}</em>` : ''}</button>
      <a class="me" href="/index.html">앱으로</a></nav>`
    let main = err ? `<div class="err">${esc(err)}</div>` : ''
    if (tab === 'home') {
      const used = cos.filter((c) => c.used_7d > 0)
      const wkNew = cos.filter((c) => days(c.created_at) < 7), wkPrev = cos.filter((c) => days(c.created_at) >= 7 && days(c.created_at) < 14)
      const quiet = cos.filter((c) => days(c.created_at) >= 14 && (days(c.last_used) == null || days(c.last_used) >= 14)).sort((a, b) => (days(b.last_used) ?? 999) - (days(a.last_used) ?? 999))
      const maxW = Math.max(1, ...wk.map((w) => w.companies))
      const n = new Date()
      main += `<div class="mh"><b>한눈에</b><small>${n.getMonth() + 1}월 ${n.getDate()}일 ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')} 기준</small><button class="btn r" data-reload>새로 불러오기</button></div>
      <div class="kpis">
        <div class="kpi"><small>쓰는 회사</small><b>${used.length}</b><span>지난 7일 사용 · 가입 ${cos.length}</span></div>
        <div class="kpi"><small>매장</small><b>${cos.reduce((s, c) => s + (c.stores || 0), 0)}</b><span>쓰는 회사 ${used.reduce((s, c) => s + (c.stores || 0), 0)}</span></div>
        <div class="kpi"><small>7일 사용자</small><b>${cos.reduce((s, c) => s + (c.used_7d || 0), 0)}</b><span>직원 ${cos.reduce((s, c) => s + (c.staff || 0), 0)}명 중</span></div>
        <div class="kpi"><small>이번 주 새 회사</small><b>${wkNew.length}</b><span>지난주 ${wkPrev.length}</span></div>
        <div class="kpi"><small>2주 안 쓴 회사</small><b>${quiet.length}</b><span class="${quiet.length ? 'dn' : ''}">${quiet.length ? '먼저 연락' : '없음'}</span></div>
      </div>
      <div class="grid2">
        <div class="card"><div class="ct"><strong>답 기다리는 것</strong><span class="t">오래된 순 · ${open.length}</span><button class="btn s r" data-tab="list">문의 · 오류 전체</button></div>
          ${open.length ? open.sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 6).map((x) => `<div class="tk">${srcTag(x)}<div>${esc(String(x.body).slice(0, 80))}<small>${esc(x.who)}</small></div><span class="w">${ago(x.at)}</span></div>`).join('') : '<div class="empty">답 기다리는 것 없음</div>'}
          ${repErr ? `<div class="empty">${esc(repErr)}</div>` : ''}</div>
        <div class="card"><div class="ct"><strong>주별 쓰는 회사</strong><span class="t">최근 8주</span></div>
          ${wk.length ? `<div class="bars">${wk.map((w) => `<div title="${w.companies}곳 · ${w.users}명"><b>${w.companies}</b><i style="height:${Math.round(w.companies / maxW * 100)}%"></i>${md(w.wk)}</div>`).join('')}</div><div class="legend">한 번이라도 쓴 회사 수 · 막대 위 숫자</div>` : `<div class="empty">${esc(wkErr || '기록 없음')}</div>`}</div>
      </div>
      <div class="grid2">
        <div class="card"><div class="ct"><strong>새로 가입한 회사</strong><span class="t">최근 7일 · ${wkNew.length}</span></div>
          ${wkNew.length ? wkNew.slice(0, 6).map((c) => `<div class="co"><b>${esc(c.name)}</b><span class="u${c.staff <= 1 ? ' z' : ''}">매장 ${c.stores} · 직원 ${c.staff}</span><small>${IND[c.industry] || esc(c.industry)} · ${md(c.created_at)} 가입 · ${c.staff <= 1 ? '직원 초대 전 — 도움 필요할 수 있음' : `7일 쓴 사람 ${c.used_7d}`} · 마지막 사용 ${c.last_used ? ago(c.last_used) + ' 전' : '없음'}</small></div>`).join('') : '<div class="empty">이번 주 새 회사 없음</div>'}</div>
        <div class="card"><div class="ct"><strong>2주 안 쓴 회사</strong><span class="t">먼저 연락할 곳</span></div>
          ${quiet.length ? quiet.slice(0, 6).map((c) => `<div class="co"><b>${esc(c.name)}</b><span class="u z">${days(c.last_used) == null ? '사용 없음' : days(c.last_used) + '일'}</span><small>${IND[c.industry] || esc(c.industry)} · 매장 ${c.stores} · ${md(c.created_at)} 가입${c.owner_email ? ' · ' + esc(c.owner_email) : ''}${c.open_tickets ? ` · 문의 ${c.open_tickets}건 답 기다림` : ''}</small></div>`).join('') : '<div class="empty">없음</div>'}
          <div class="rule">숫자는 회사별 매장 · 직원 · 7일 사용자 · 마지막 사용일만. 회사 안의 인수인계 · 할 일 · 사진은 열지 않습니다.</div></div>
      </div>`
    } else {
      const F = { open: ['답 기다림', (x) => x.status === 'open'], web: ['홈페이지', (x) => x.src === 'web'], app: ['앱 문의', (x) => x.src !== 'web'], done: ['끝난 것', (x) => x.status !== 'open'], all: ['전체', () => true] }
      const L = all.filter(F[flt][1]).sort((a, b) => (a.status === 'open') === (b.status === 'open') ? new Date(b.at) - new Date(a.at) : a.status === 'open' ? -1 : 1)
      main += `<div class="mh"><b>문의 · 오류</b><small>앱 문의와 홈페이지 보고를 한 목록에</small></div>
      <div class="chips">${Object.keys(F).map((k) => `<button data-f="${k}" aria-pressed="${k === flt}">${F[k][0]} ${all.filter(F[k][1]).length}</button>`).join('')}</div>
      ${repErr ? `<div class="err">${esc(repErr)}</div>` : ''}
      <div class="card">${L.length ? L.map((x) => `<div class="it">
        <div class="h">${srcTag(x)}<span class="st ${x.status}">${x.status === 'open' ? '답 기다림' : x.status === 'answered' ? (x.src === 'web' ? '답함' : '답 보냄') : '끝'}</span><span class="t">${esc(x.who)} · ${ago(x.at)} 전</span></div>
        <div class="b">${esc(x.body)}</div>
        ${x.src === 'web' && x.ua ? `<div class="ua">${esc(x.ua)}</div>` : ''}
        ${x.src === 'web' && x.contact ? `<div class="ct2">답 받을 곳 <b>${esc(x.contact)}</b> ${/@/.test(x.contact) ? `<a class="btn s" href="mailto:${esc(x.contact)}">메일</a>` : `<a class="btn s" href="tel:${esc(x.contact.replace(/[^0-9+]/g, ''))}">전화</a><a class="btn s" href="sms:${esc(x.contact.replace(/[^0-9+]/g, ''))}">문자</a>`}</div>` : ''}
        ${x.answer ? `<div class="ans"><small>${x.src === 'web' ? '메모' : 'Dutyvo 답'}</small>${esc(x.answer)}</div>` : ''}
        ${x.status === 'open' ? `<textarea data-t="${x.src}:${x.id}" placeholder="${x.src === 'web' ? '메모 — 어떻게 답했는지 · 고친 버전 (보낸 사람에게 가지 않음)' : '답 — 보내면 물어본 사람 폰으로 알림'}"></textarea>
          <div class="row"><button class="btn" data-end="${x.src}:${x.id}">끝</button><button class="btn pri" data-ans="${x.src}:${x.id}">${x.src === 'web' ? '답함으로' : '답 보내기'}</button></div>` : ''}
      </div>`).join('') : '<div class="empty">없음</div>'}</div>`
    }
    root.innerHTML = `<div class="shell">${nav}<main class="main">${main}</main></div>`
    root.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; if (tab === 'list') flt = 'open'; paint(); scrollTo(0, 0) })
    root.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { flt = b.dataset.f; paint() })
    root.querySelectorAll('[data-open]').forEach((b) => b.onclick = async () => { const m = await import('./ops.js'); m.openOps({ tab: b.dataset.open, onClose: reload }) })
    const rl = root.querySelector('[data-reload]'); if (rl) rl.onclick = reload
    root.querySelectorAll('[data-ans]').forEach((b) => b.onclick = async () => {
      const [src, id] = b.dataset.ans.split(':'), t = root.querySelector(`[data-t="${b.dataset.ans}"]`), v = t.value.trim()
      if (src !== 'web' && !v) { t.focus(); return }
      b.disabled = true
      const { error } = src === 'web'
        ? await sb.from('site_reports').update({ status: 'answered', memo: v || null, done_at: new Date().toISOString() }).eq('id', id)
        : await sb.from('support_tickets').update({ answer: v, status: 'answered', answered_at: new Date().toISOString(), answer_alerted_at: null }).eq('id', id)
      if (error) { b.disabled = false; toast('저장하지 못했어요 — ' + (error.message || '')); return }
      toast(src === 'web' ? '답함으로 옮겼어요' : '답을 보냈어요 · 1분 안에 알림'); reload()
    })
    root.querySelectorAll('[data-end]').forEach((b) => b.onclick = async () => {
      const [src, id] = b.dataset.end.split(':'), t = root.querySelector(`[data-t="${b.dataset.end}"]`), v = t ? t.value.trim() : ''
      b.disabled = true
      const { error } = src === 'web'
        ? await sb.from('site_reports').update({ status: 'closed', memo: v || null, done_at: new Date().toISOString() }).eq('id', id)
        : await sb.from('support_tickets').update({ status: 'closed' }).eq('id', id)
      if (error) { b.disabled = false; toast('저장하지 못했어요'); return }
      reload()
    })
  }
  async function reload() {
    try { await load(); paint() } catch (e) {
      const m = String((e && e.message) || e)
      if (/운영자만/.test(m)) { root.innerHTML = '<div class="gate"><b>권한 없음</b><p>운영자 계정만 열 수 있어요.</p><a class="btn" href="/index.html">앱으로</a></div>'; return }
      paint('불러오지 못했어요 — ' + m)
    }
  }
  await reload()
}
