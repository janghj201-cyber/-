// Dutyvo 문의(고객사 → 우리) · 운영자 화면(v6.14). 자동 가입을 열면서 같이 생긴 두 창구.
// 표: support_tickets(문의 · 답) · 서버 함수 vf_ops_companies · vf_ops_tickets(운영자만). 알림은 api/remind-now(매분)가 보낸다.
// 고객사 쪽: 대표 · 매니저가 묻고, 답이 오면 폰 알림. 회사 정리 · 데이터 받기 요청은 대표만(약관 7조).
// 운영자 쪽: 가입한 회사 숫자(매장 · 직원 · 7일 사용자 · 마지막 사용)만 본다 — 회사 업무 내용은 안 본다.
import { supabase as sb } from './supabase-client.js'
import { getContext } from './context.js'

const S = '#vops'
const CSS = `
${S}{position:fixed;inset:0;z-index:900;background:var(--bg);overflow:auto;color:var(--text)}
${S} .wrap{max-width:900px;margin:0 auto;padding:14px 16px 60px}
${S} .card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:12px}
${S} h2{font-size:15px;margin:0 0 4px}
${S} .hint{font-size:12px;color:var(--text-sub);line-height:1.55}
${S} .chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
${S} .chips button{border:1px solid var(--border);background:var(--card);color:var(--text-sub);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
${S} .chips button[aria-pressed=true]{background:var(--navy);border-color:var(--navy);color:#fff}
${S} textarea{width:100%;min-height:96px;border:1px solid var(--border);border-radius:10px;padding:10px 12px;font:inherit;font-size:14px;background:var(--card);color:var(--text);resize:vertical;box-sizing:border-box}
${S} .row{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:8px;flex-wrap:wrap}
${S} .btn{border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:10px;padding:0 14px;height:38px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
${S} .btn.main{background:var(--gold);border-color:var(--gold);color:#1b1b1b}
${S} .btn:disabled{opacity:.5;cursor:default}
${S} .tk{border-top:1px solid var(--border);padding:12px 0}
${S} .tk:first-child{border-top:0}
${S} .tk .top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--text-sub)}
${S} .tag{display:inline-block;font-size:11.5px;font-weight:700;border-radius:6px;padding:1px 7px;background:var(--soft);color:var(--text-sub)}
${S} .tag.open{background:var(--orange-light);color:var(--orange)}
${S} .tag.done{background:var(--green-light);color:var(--green)}
${S} .tk .b{font-size:14px;margin:6px 0 0;white-space:pre-wrap;word-break:break-word}
${S} .ans{margin-top:8px;background:var(--soft);border-radius:10px;padding:9px 12px;font-size:13.5px;white-space:pre-wrap;word-break:break-word}
${S} .ans small{display:block;color:var(--text-sub);font-size:11.5px;margin-bottom:3px}
${S} .seg{display:inline-flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--card);margin-bottom:12px}
${S} .seg button{border:0;background:transparent;padding:0 14px;height:36px;font:inherit;font-weight:700;font-size:13px;color:var(--text-sub);cursor:pointer}
${S} .seg button[aria-pressed=true]{background:var(--navy);color:#fff}
${S} .co{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;border-top:1px solid var(--border);padding:11px 0}
${S} .co:first-child{border-top:0}
${S} .co b{font-size:14.5px}
${S} .co .n{display:flex;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--text-sub);grid-column:1 / -1}
${S} .co .n em{font-style:normal;color:var(--text);font-weight:700}
${S} .co .r{font-size:12px;color:var(--text-sub);text-align:right}
${S} .warn{color:var(--red)}
${S} .empty{font-size:13px;color:var(--text-mute);padding:14px 0}
${S} .err{background:var(--red-light);color:var(--red);border-radius:10px;padding:8px 12px;font-size:13px;margin-bottom:10px}
`
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const KIND = { ask: '질문', bug: '불편한 점', idea: '기능 제안', close: '회사 정리 요청', export: '데이터 받기 요청' }
const KIND_HINT = {
  close: '약관 7조대로 처리해요 — 요청을 받으면 운영팀이 먼저 확인 연락을 드리고, 정리 뒤 30일 보관 후 삭제됩니다. 그 사이 데이터가 필요하면 「데이터 받기」도 같이 보내 주세요',
  export: '업무 · 인수인계 · 청소 · 예약 기록을 파일로 보내 드려요. 받을 메일 주소를 적어 주세요',
}
const IND = { cafe: '카페', convenience: '편의점', beauty: '뷰티', academy: '학원', etc: '기타', restaurant: '음식점', wholesale: '도매 · 유통', clinic: '의원 · 치료' }
const when = (iso) => { if (!iso) return '-'; const d = new Date(iso), n = new Date(); const days = Math.floor((n - d) / 864e5); if (days <= 0) return `오늘 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; if (days === 1) return '어제'; if (days < 30) return `${days}일 전`; return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}` }

function shell(title, sub, onClose) {
  if (document.getElementById('vops')) document.getElementById('vops').remove()
  const root = document.createElement('div'); root.id = 'vops'
  root.innerHTML = `<style>${CSS}</style><div class="header" style="position:sticky;top:0;z-index:10;"><div><div class="header-title">${esc(title)}</div><div class="header-sub">${esc(sub)}</div></div><button class="back-btn" type="button" data-close>닫기</button></div><div class="wrap" data-body><div class="empty">불러오는 중…</div></div>`
  document.body.appendChild(root)
  const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
  const onKey = (e) => { if (e.key === 'Escape') close() }
  const close = () => { document.removeEventListener('keydown', onKey); root.remove(); document.body.style.overflow = prev; try { onClose && onClose() } catch (e) {} }
  document.addEventListener('keydown', onKey)
  root.querySelector('[data-close]').onclick = close
  const toast = (t) => { const o = document.querySelector('.vops-toast'); if (o) o.remove(); const d = document.createElement('div'); d.className = 'vops-toast'; d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--text);color:var(--card);padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;z-index:950'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600) }
  return { root, body: root.querySelector('[data-body]'), close, toast }
}
const tkHTML = (k, opts = {}) => `<div class="tk"><div class="top"><span class="tag ${(k.status || 'open') === 'open' ? 'open' : 'done'}">${(k.status || 'open') === 'open' ? '답 기다림' : k.status === 'answered' ? '답 옴' : '끝'}</span><span class="tag">${KIND[k.kind] || k.kind}</span>${opts.co ? `<b style="color:var(--text)">${esc(k.tenant_name)}</b>` : ''}<span>${esc(k.who || '')} · ${when(k.created_at)}</span></div>
  <div class="b">${esc(k.body)}</div>${k.answer ? `<div class="ans"><small>Dutyvo · ${when(k.answered_at)}</small>${esc(k.answer)}</div>` : ''}${opts.extra || ''}</div>`

// ── 고객사: Dutyvo 에 문의 ──
export async function openAsk(host = {}) {
  const ctx = await getContext()
  const role = ctx.profile?.role
  const { body, close, toast } = shell('Dutyvo에 문의', '운영팀이 봅니다 · 답이 오면 알림', host.onClose)
  if (!['owner', 'manager'].includes(role)) { body.innerHTML = '<div class="card"><h2>대표 · 매니저가 보내는 곳이에요</h2><div class="hint">매장 일은 게시판 「건의/문의」로 회사 관리자에게 남겨 주세요.</div></div>'; return { close } }
  let kind = host.kind && KIND[host.kind] ? host.kind : 'ask', list = []
  const kinds = Object.keys(KIND).filter((k) => role === 'owner' || !['close', 'export'].includes(k))
  async function load() {
    const { data, error } = await sb.from('support_tickets').select('id,kind,body,status,answer,answered_at,created_at,profile_id').eq('tenant_id', ctx.tenantId).order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    list = data || []
  }
  function paint(err) {
    body.innerHTML = `${err ? `<div class="err">${esc(err)}</div>` : ''}<div class="card"><h2>무엇이든 적어 주세요</h2><div class="hint">쓰다가 막힌 곳 · 불편한 점 · 있었으면 하는 기능. 화면 이름과 무엇을 누르려 했는지 적어 주시면 빨라요.</div>
      <div class="chips">${kinds.map((k) => `<button type="button" data-k="${k}" aria-pressed="${k === kind}">${KIND[k]}</button>`).join('')}</div>
      ${KIND_HINT[kind] ? `<div class="hint" style="margin-bottom:8px">${KIND_HINT[kind]}</div>` : ''}
      <textarea data-t maxlength="2000" placeholder="${kind === 'export' ? '받을 메일 주소와 필요한 기간' : kind === 'close' ? '정리하려는 이유(선택)와 연락받을 번호' : '예) 예약 링크를 인스타에 붙였는데 손님이 시간을 못 골라요'}"></textarea>
      <div class="row"><span class="hint">${esc(ctx.profile?.name || '')} · ${role === 'owner' ? '대표' : '매니저'}</span><button class="btn main" data-send disabled>보내기</button></div></div>
      <div class="card"><h2>우리 회사 문의 ${list.length ? `<span class="hint">${list.length}건</span>` : ''}</h2>${list.map((k) => tkHTML(k)).join('') || '<div class="empty">아직 보낸 문의가 없어요</div>'}</div>`
    const t = body.querySelector('[data-t]'), go = body.querySelector('[data-send]')
    t.oninput = () => { go.disabled = !t.value.trim() }
    body.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { const keep = t.value; kind = b.dataset.k; paint(); body.querySelector('[data-t]').value = keep; body.querySelector('[data-send]').disabled = !keep.trim() })
    go.onclick = async () => {
      go.disabled = true; go.textContent = '보내는 중'
      const { error } = await sb.from('support_tickets').insert({ tenant_id: ctx.tenantId, profile_id: ctx.profileId, kind, body: t.value.trim() })
      if (error) { go.disabled = false; go.textContent = '보내기'; toast(/[가-힣]/.test(error.message || '') ? error.message : '보내지 못했어요 — 인터넷을 확인해 주세요'); return }
      try { await load() } catch (e) {}
      kind = 'ask'; paint(); toast('보냈어요 · 답이 오면 알림')
    }
  }
  try { await load(); paint() } catch (e) { paint('문의 목록을 불러오지 못했어요 — ' + (e.message || e)) }
  return { close }
}

// ── 운영자: 가입한 회사 · 문의 ──
export async function openOps(host = {}) {
  const { body, close, toast } = shell('Dutyvo 운영', '가입한 회사 · 문의 — 운영자만', host.onClose)
  let tab = host.tab === 'tickets' ? 'tickets' : 'companies', flt = 'all', cos = [], tks = []
  async function load() {
    const [a, b] = await Promise.all([sb.rpc('vf_ops_companies'), sb.rpc('vf_ops_tickets')])
    if (a.error) throw a.error
    if (b.error) throw b.error
    cos = a.data || []; tks = b.data || []
  }
  const DAY = 864e5, now = Date.now()
  const FL = {
    all: ['전체', () => true],
    week: ['이번 주 가입', (c) => now - new Date(c.created_at) < 7 * DAY],
    quiet: ['7일 안 씀', (c) => !c.last_used || now - new Date(c.last_used) > 7 * DAY],
    ask: ['문의 있음', (c) => c.open_tickets > 0],
  }
  function paint(err) {
    const open = tks.filter((k) => k.status === 'open').length
    let html = `${err ? `<div class="err">${esc(err)}</div>` : ''}<div class="seg"><button data-tab="companies" aria-pressed="${tab === 'companies'}">회사 ${cos.length}</button><button data-tab="tickets" aria-pressed="${tab === 'tickets'}">문의${open ? ` · 답 기다림 ${open}` : ''}</button></div>`
    if (tab === 'companies') {
      const L = cos.filter(FL[flt][1])
      html += `<div class="card"><div class="chips" style="margin-top:0">${Object.keys(FL).map((k) => `<button type="button" data-f="${k}" aria-pressed="${k === flt}">${FL[k][0]} ${cos.filter(FL[k][1]).length}</button>`).join('')}</div>
        ${L.map((c) => { const quiet = !c.last_used || now - new Date(c.last_used) > 7 * DAY; return `<div class="co"><div><b>${esc(c.name)}</b> <span class="tag">${IND[c.industry] || esc(c.industry)}</span>${c.open_tickets ? ` <span class="tag open">문의 ${c.open_tickets}</span>` : ''}</div><div class="r">가입 ${when(c.created_at)}</div>
          <div class="n"><span>매장 <em>${c.stores}</em></span><span>직원 <em>${c.staff}</em></span><span>7일 쓴 사람 <em>${c.used_7d}</em></span><span class="${quiet ? 'warn' : ''}">마지막 사용 ${when(c.last_used)}</span><span>대표 ${esc(c.owner_name || '-')}${c.owner_email ? ` · <a href="mailto:${esc(c.owner_email)}" style="color:var(--blue)">${esc(c.owner_email)}</a>` : ''}</span></div></div>` }).join('') || '<div class="empty">해당하는 회사가 없어요</div>'}</div>`
    } else {
      html += `<div class="card">${tks.map((k) => tkHTML(k, { co: true, extra: k.status === 'open' ? `<textarea data-a="${k.id}" style="min-height:70px;margin-top:8px" placeholder="답 — 보내면 물어본 사람 폰으로 알림"></textarea><div class="row"><span></span><span style="display:flex;gap:6px"><button class="btn" data-end="${k.id}">답 없이 끝</button><button class="btn main" data-ans="${k.id}">답 보내기</button></span></div>` : k.status === 'answered' ? `<div class="row"><span></span><button class="btn" data-end="${k.id}">끝</button></div>` : '' })).join('') || '<div class="empty">문의가 없어요</div>'}</div>`
    }
    body.innerHTML = html
    body.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; paint() })
    body.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { flt = b.dataset.f; paint() })
    body.querySelectorAll('[data-ans]').forEach((b) => b.onclick = async () => {
      const t = body.querySelector(`[data-a="${b.dataset.ans}"]`), v = t.value.trim(); if (!v) { t.focus(); return }
      b.disabled = true
      const { error } = await sb.from('support_tickets').update({ answer: v, status: 'answered', answered_at: new Date().toISOString(), answer_alerted_at: null }).eq('id', b.dataset.ans)
      if (error) { b.disabled = false; toast('저장하지 못했어요 — ' + (error.message || '')); return }
      await reload(); toast('답을 보냈어요 · 1분 안에 알림')
    })
    body.querySelectorAll('[data-end]').forEach((b) => b.onclick = async () => {
      b.disabled = true
      const { error } = await sb.from('support_tickets').update({ status: 'closed' }).eq('id', b.dataset.end)
      if (error) { b.disabled = false; toast('저장하지 못했어요'); return }
      await reload()
    })
  }
  async function reload() { try { await load(); paint() } catch (e) { paint('불러오지 못했어요 — ' + (e.message || e)) } }
  await reload()
  return { close }
}
