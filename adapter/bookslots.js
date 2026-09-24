// 예약 빈 시간 계산 — 매장 화면(adapter/booking.js)과 손님 페이지(lp/book.html)가 같이 쓴다. 규칙은 여기 한 곳.
// 서버(booking_public_request)도 같은 규칙으로 다시 확인한다 — 화면 계산은 보여 주기용, 최종 판정은 서버.
// 시간은 모두 그 날짜의 0시부터 분(600 = 10:00). 날짜는 'YYYY-MM-DD'. 기기 시간대 = 한국 기준.
const pad = (n) => String(n).padStart(2, '0')
export const dk = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addD = (k, n) => { const d = new Date(k + 'T00:00'); d.setDate(d.getDate() + n); return dk(d) }
export const hm = (t) => `${pad(Math.floor(t / 60))}:${pad(t % 60)}`
export const toMin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
export const dowOf = (k) => new Date(k + 'T00:00').getDay()
// 예약 한 건이 차지하는 칸 · 시각 — 「다른 시간 제안」은 제안한 시간을 잡는다
export const holdOf = (a) => a.status === 'offered' && a.offer_starts_at ? { res: a.offer_resource_id || a.resource_id, at: new Date(a.offer_starts_at) } : { res: a.resource_id, at: new Date(a.starts_at) }
export const ACTIVE = ['request', 'offered', 'confirmed', 'done']

// 그날 여나 — 정기 휴무 요일 · 하루 휴무(closed: Set of 'YYYY-MM-DD')
export function openHours(k, hours, closed) {
  if (closed && closed.has(k)) return null
  const h = hours || {}
  if ((h.off || []).includes(dowOf(k))) return null
  return [toMin(h.open || '10:00'), toMin(h.close || '22:00')]
}
// 빈 시간들 — [{t, res}]. 상관없음(resId 없음)이면 그날 덜 바쁜 칸으로
// o: {date, svc:{duration_min, resource_id, lead_days, fixed_slots}, resId, resources:[{id,capacity}], busy:[{id,status,resource_id,starts_at,duration_min,offer_*}],
//     hours, closed, brk:{start,end,days}, lead(분), staff(매장이 넣는 것 — 마감 · 준비 기간 무시), skip(시간을 옮기는 예약 자신), now(Date)}
export function slotsFor(o) {
  const k = o.date, sv = o.svc; if (!sv) return []
  const oh = openHours(k, o.hours, o.closed); if (!oh) return []
  const now = o.now || new Date(), today = dk(now)
  if (k < today) return []
  if (!o.staff && sv.lead_days && k < addD(today, sv.lead_days)) return []
  const dur = sv.duration_min || 60, dw = dowOf(k)
  let ts = []
  if (sv.fixed_slots) ts = (sv.fixed_slots[String(dw)] || []).slice()
  else for (let t = oh[0]; t + dur <= oh[1]; t += 30) ts.push(t)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const minT = k === today ? (o.staff ? nowMin : nowMin + (o.lead ?? 120)) : -1
  const bk = o.brk && o.brk.start && o.brk.end ? o.brk : null
  const res = (o.resources || []).filter((r) => r.active !== false && (sv.resource_id ? r.id === sv.resource_id : o.resId ? r.id === o.resId : true))
  const dayBusy = (o.busy || []).filter((a) => a.id !== o.skip && ACTIVE.includes(a.status)).map((a) => { const h = holdOf(a); return { res: h.res, day: dk(h.at), s: h.at.getHours() * 60 + h.at.getMinutes(), e: h.at.getHours() * 60 + h.at.getMinutes() + (a.duration_min || 60) } }).filter((b) => b.day === k)
  const load = (rid) => dayBusy.filter((b) => b.res === rid).length
  const out = []
  ts.forEach((t) => {
    if (t < minT || t + dur > oh[1] || t < oh[0]) return
    if (bk && (!bk.days || bk.days.includes(dw)) && t < toMin(bk.end) && toMin(bk.start) < t + dur) return
    const free = res.filter((r) => dayBusy.filter((b) => b.res === r.id && b.s < t + dur && t < b.e).length < (r.capacity || 1))
    if (free.length) out.push({ t, res: free.sort((a, b) => load(a.id) - load(b.id))[0].id })
  })
  return out
}
