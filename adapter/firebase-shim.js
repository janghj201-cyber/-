// Firebase Firestore API 파사드 — 원본 index.html이 그대로 부르는 함수 시그니처
// (initializeApp/getFirestore/doc/getDoc/setDoc/onSnapshot)를 흉내내면서 실제로는
// Supabase를 씀. 원본 코드는 이 파일 존재를 몰라도 되게(=고칠 필요 없게) 설계함.
//
// 구현된 경로: board/posts (1단계), storeinfo/{storeId} · feedback/.../comment ·
// staff_memo/{name} (2단계), handover/{storeId}_{dateKey} 읽기+쓰기 + 피드백 스레드
// (3단계 3/4, 미확인 배너는 4/4에서 마저).
// 그 외 경로는 getDoc이 "문서 없음"을 반환하고 setDoc은 조용히 무시한다 — 원본의 각
// 로드 함수가 전부 try/catch + "없으면 기본값 폴백" 패턴으로 짜여 있어(loadStaffList 등),
// 이렇게만 해도 앱 전체가 크래시 없이 부팅된다.
import { supabase } from './supabase-client.js'
import { getContext } from './context.js'
import { resolveStoreId, reverseResolveStoreId } from './store-bridge.js'

// ── Firebase 앱/DB 핸들 흉내 (아무 것도 안 함, 시그니처만 맞춤) ──
export function initializeApp(config) {
  return config
}
export function getFirestore(app) {
  return app
}

export function doc(_db, path) {
  return { path }
}

function formatKoDate(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── board/posts (V-Flow 기존 board_posts 테이블) ──
async function readBoardPosts(ctx) {
  const { data, error } = await supabase
    .from('board_posts')
    .select('legacy_id, category, title, content, store_ids, history_category, created_at, profiles(name)')
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return {
    items: (data ?? []).map((r) => ({
      id: r.legacy_id,
      cat: r.category,
      title: r.title,
      body: r.content,
      author: r.profiles?.name ?? '익명',
      date: formatKoDate(r.created_at),
      ts: new Date(r.created_at).getTime(),
      // 히스토리 카테고리의 매장 태그 — 실제 uuid를 원본이 아는 storeId 문자열로 역매핑
      stores: r.store_ids ? r.store_ids.map((id) => reverseResolveStoreId(id, ctx)).filter(Boolean) : undefined,
      historyCat: r.history_category ?? undefined,
    })),
  }
}

// 원본은 항상 "배열 전체를 읽고 → JS에서 push/find/splice → 배열 전체를 다시 씀" 패턴이라,
// 들어온 배열과 현재 DB 행을 legacy_id로 비교해 insert/update/delete로 diff-sync한다.
async function writeBoardPosts(ctx, { items }) {
  const { data: currentRows, error: selErr } = await supabase.from('board_posts').select('id, legacy_id').eq('tenant_id', ctx.tenantId)
  if (selErr) throw selErr
  const byLegacyId = new Map((currentRows ?? []).map((r) => [r.legacy_id, r.id]))
  const incomingIds = new Set(items.map((i) => i.id))

  for (const row of currentRows ?? []) {
    if (!incomingIds.has(row.legacy_id)) {
      const { error } = await supabase.from('board_posts').delete().eq('id', row.id)
      if (error) throw error
    }
  }

  for (const item of items) {
    // 'all'은 원본에서 "전체 매장" 의미 — 특정 매장 uuid가 아니므로 null(=전체)로 저장
    const storeIds = item.stores && item.stores[0] !== 'all' ? item.stores.map((sid) => resolveStoreId(sid, ctx)).filter(Boolean) : null
    const row = {
      tenant_id: ctx.tenantId,
      category: item.cat,
      title: item.title,
      content: item.body,
      author_id: ctx.profileId,
      store_ids: storeIds,
      history_category: item.historyCat ?? null,
      legacy_id: item.id,
    }
    if (byLegacyId.has(item.id)) {
      const { error } = await supabase.from('board_posts').update(row).eq('id', byLegacyId.get(item.id))
      if (error) throw error
    } else {
      const { error } = await supabase.from('board_posts').insert(row)
      if (error) throw error
    }
  }
}

// ── storeinfo/{storeId} (V-Flow 기존 store_info 테이블, 매장당 1행) ──
async function readStoreInfo(ctx, originalStoreId) {
  const storeId = resolveStoreId(originalStoreId, ctx)
  if (!storeId) return null
  const { data, error } = await supabase.from('store_info').select('content').eq('store_id', storeId).maybeSingle()
  if (error) throw error
  return data ? { text: data.content } : null
}

async function writeStoreInfo(ctx, originalStoreId, { text }) {
  const storeId = resolveStoreId(originalStoreId, ctx)
  if (!storeId) return
  const { error } = await supabase
    .from('store_info')
    .upsert({ store_id: storeId, tenant_id: ctx.tenantId, content: text, updated_at: new Date().toISOString() }, { onConflict: 'store_id' })
  if (error) throw error
}

// ── feedback/{storeId}/{dateKey}/comment (V-Flow 기존 store_feedback 테이블, 매장×날짜당 1행) ──
async function readFeedback(ctx, originalStoreId, dateKey) {
  const storeId = resolveStoreId(originalStoreId, ctx)
  if (!storeId) return null
  const { data, error } = await supabase.from('store_feedback').select('content, updated_at').eq('store_id', storeId).eq('feedback_date', dateKey).maybeSingle()
  if (error) throw error
  return data ? { text: data.content, updatedAt: formatKoDate(data.updated_at) } : null
}

async function writeFeedback(ctx, originalStoreId, dateKey, { text }) {
  const storeId = resolveStoreId(originalStoreId, ctx)
  if (!storeId) return
  const { error } = await supabase
    .from('store_feedback')
    .upsert(
      { tenant_id: ctx.tenantId, store_id: storeId, feedback_date: dateKey, content: text, author_id: ctx.profileId, updated_at: new Date().toISOString() },
      { onConflict: 'store_id,feedback_date' }
    )
  if (error) throw error
}

// ── staff_memo/{name} (V-Flow 신규 staff_memos 테이블, 본인당 1행) ──
// 원본은 myStaff(이름 문자열)로 경로를 만들지만, "본인만 보는 메모"라는 의도상
// 실제로는 항상 지금 로그인한 세션 본인의 메모다 — store-bridge 같은 매핑이 필요 없다.
async function readStaffMemo(ctx) {
  const { data, error } = await supabase.from('staff_memos').select('content, updated_at').eq('profile_id', ctx.profileId).maybeSingle()
  if (error) throw error
  return data ? { text: data.content, updatedAt: new Date(data.updated_at).getTime() } : null
}

async function writeStaffMemo(ctx, { text }) {
  const { error } = await supabase
    .from('staff_memos')
    .upsert({ profile_id: ctx.profileId, tenant_id: ctx.tenantId, content: text, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
  if (error) throw error
}

// ── handover/{storeId}_{dateKey}의 feedbacks 배열 (신규 handover_feedbacks 테이블) ──
// 원본은 피드백에 id가 없고 배열 인덱스로만 삭제하므로, (작성자명, 내용) 쌍으로 DB 행과
// 매칭해 diff한다. 같은 사람이 같은 문구를 두 번 남기는 드문 경우엔 먼저 생긴(오래된)
// 행부터 순서대로 매칭해서, 매칭 안 된 나머지가 실제 삭제/추가 대상이 되게 한다.
// 새로 추가되는(매칭 안 된) 항목은 항상 지금 세션 사용자가 쓴 것 — top-level 항목의
// insert가 item.author를 무시하고 항상 ctx.profileId를 쓰는 것과 같은 이유로, 여기서도
// 들어온 author 문자열을 신뢰하지 않고 ctx.profileId로 고정한다.
async function writeHandoverFeedbacks(ctx, handoverId, feedbacks) {
  const { data: currentRows, error: selErr } = await supabase
    .from('handover_feedbacks')
    .select('id, content, author:profiles!author_id(name)')
    .eq('handover_id', handoverId)
    .order('created_at', { ascending: true })
  if (selErr) throw selErr

  const remaining = [...(currentRows ?? [])]
  const unmatched = []
  for (const f of feedbacks) {
    const idx = remaining.findIndex((r) => (r.author?.name ?? '익명') === (f.author ?? '익명') && r.content === f.text)
    if (idx >= 0) {
      remaining.splice(idx, 1)
    } else {
      unmatched.push(f)
    }
  }

  for (const row of remaining) {
    const { error } = await supabase.from('handover_feedbacks').delete().eq('id', row.id)
    if (error) throw error
  }

  for (const f of unmatched) {
    const { error } = await supabase.from('handover_feedbacks').insert({
      tenant_id: ctx.tenantId,
      handover_id: handoverId,
      author_id: ctx.profileId,
      content: f.text,
    })
    if (error) throw error
  }
}

// ── handover/{storeId}_{dateKey} (V-Flow 기존 handovers 테이블, 1항목=1행) ──
// 원본은 "어제 미확인 항목을 오늘 문서로 복사"해서 이월을 흉내내는데(그러면 어제/오늘 두
// 사본이 따로 놀 수 있는 버그 소지가 있음), 관계형에서는 그럴 필요 없이 "확인 안 된 과거
// 항목은 오늘 목록에도 계속 포함" 쿼리 하나로 같은 이월 UX를 낸다 — 사본이 없으니 오히려
// 더 정확하다.
//
// 원본의 add/toggle/edit/delete 4개 함수는 전부 "배열 전체를 읽고 → 수정 → 배열 전체를
// setDoc" 패턴(게시판과 동일)이라, writeHandoverItems() 하나가 diff-sync로 4개 다 처리한다.
// 새 항목의 id는 원본이 만드는 Date.now()+'_'+random 문자열이라 실제 uuid와 형태가 달라
// insert/update를 구분하는 열쇠로 쓴다. 값이 실제로 바뀐 필드만 patch하는 게 중요한데,
// 안 그러면 "새 항목 추가" 저장에 같이 실려오는 이미 확인된 예전 항목의 confirmed_by가
// 지금 저장한 사람으로 덮어써지는 버그가 생긴다.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function writeHandoverItems(ctx, originalStoreId, dateKey, { items }) {
  const storeId = resolveStoreId(originalStoreId, ctx)
  if (!storeId) return

  // 읽기와 동일한 범위로 diff 대상을 좁힌다 — 다른 날짜의 확인된 항목까지 삭제 후보로
  // 잡히면 안 되므로.
  const { data: currentRows, error: selErr } = await supabase
    .from('handovers')
    .select('id, content, confirmed')
    .eq('store_id', storeId)
    .or(`handover_date.eq.${dateKey},and(confirmed.eq.false,handover_date.lt.${dateKey})`)
  if (selErr) throw selErr
  const currentById = new Map((currentRows ?? []).map((r) => [r.id, r]))
  const incomingRealIds = new Set(items.filter((i) => UUID_RE.test(i.id)).map((i) => i.id))

  for (const id of currentById.keys()) {
    if (!incomingRealIds.has(id)) {
      const { error } = await supabase.from('handovers').delete().eq('id', id)
      if (error) throw error
    }
  }

  for (const item of items) {
    let handoverId = item.id
    if (!UUID_RE.test(item.id)) {
      const { data: inserted, error } = await supabase
        .from('handovers')
        .insert({
          tenant_id: ctx.tenantId,
          store_id: storeId,
          from_employee: ctx.profileId,
          content: item.text,
          handover_date: dateKey,
          confirmed: item.confirmed ?? false,
        })
        .select('id')
        .single()
      if (error) throw error
      handoverId = inserted.id
    } else {
      const current = currentById.get(item.id)
      if (!current) continue // 방어적: 조회 범위 밖 id는 건드리지 않음
      const patch = {}
      if (current.content !== item.text) patch.content = item.text
      if (current.confirmed !== item.confirmed) {
        patch.confirmed = item.confirmed
        patch.confirmed_by = item.confirmed ? ctx.profileId : null
        patch.confirmed_at = item.confirmed ? new Date().toISOString() : null
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('handovers').update(patch).eq('id', item.id)
        if (error) throw error
      }
    }
    await writeHandoverFeedbacks(ctx, handoverId, item.feedbacks || [])
  }
}

async function readHandoverItems(ctx, originalStoreId, dateKey) {
  const storeId = resolveStoreId(originalStoreId, ctx)
  if (!storeId) return []
  const { data, error } = await supabase
    .from('handovers')
    .select('id, content, handover_date, confirmed, confirmed_at, author:profiles!from_employee(name), confirmer:profiles!confirmed_by(name)')
    .eq('store_id', storeId)
    .or(`handover_date.eq.${dateKey},and(confirmed.eq.false,handover_date.lt.${dateKey})`)
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = data ?? []

  const ids = rows.map((r) => r.id)
  const feedbacksByHandover = new Map()
  if (ids.length > 0) {
    const { data: fbRows, error: fbErr } = await supabase
      .from('handover_feedbacks')
      .select('handover_id, content, created_at, author:profiles!author_id(name)')
      .in('handover_id', ids)
      .order('created_at', { ascending: true })
    if (fbErr) throw fbErr
    for (const f of fbRows ?? []) {
      const list = feedbacksByHandover.get(f.handover_id) ?? []
      list.push({ author: f.author?.name ?? '익명', text: f.content, ts: new Date(f.created_at).getTime() })
      feedbacksByHandover.set(f.handover_id, list)
    }
  }

  return rows.map((h) => ({
    id: h.id,
    text: h.content,
    author: h.author?.name ?? '익명',
    confirmed: h.confirmed,
    confirmedBy: h.confirmer?.name ?? null,
    confirmedAt: h.confirmed_at ? new Date(h.confirmed_at).getTime() : null,
    fromDate: h.handover_date !== dateKey ? h.handover_date : null,
    feedbacks: feedbacksByHandover.get(h.id) ?? [],
  }))
}

// ── 경로 라우팅 ──
const STOREINFO_RE = /^storeinfo\/(.+)$/
const FEEDBACK_RE = /^feedback\/([^/]+)\/([^/]+)\/comment$/
const STAFF_MEMO_RE = /^staff_memo\/(.+)$/
const HANDOVER_RE = /^handover\/([^_]+)_(\d{4}-\d{2}-\d{2})$/

export async function getDoc(ref) {
  const ctx = await getContext()

  if (ref.path === 'board/posts') {
    const data = await readBoardPosts(ctx)
    return { exists: () => true, data: () => data }
  }

  const storeInfoMatch = STOREINFO_RE.exec(ref.path)
  if (storeInfoMatch) {
    const data = await readStoreInfo(ctx, storeInfoMatch[1])
    return { exists: () => data !== null, data: () => data ?? undefined }
  }

  const feedbackMatch = FEEDBACK_RE.exec(ref.path)
  if (feedbackMatch) {
    const data = await readFeedback(ctx, feedbackMatch[1], feedbackMatch[2])
    return { exists: () => data !== null, data: () => data ?? undefined }
  }

  if (STAFF_MEMO_RE.test(ref.path)) {
    const data = await readStaffMemo(ctx)
    return { exists: () => data !== null, data: () => data ?? undefined }
  }

  const handoverMatch = HANDOVER_RE.exec(ref.path)
  if (handoverMatch) {
    const items = await readHandoverItems(ctx, handoverMatch[1], handoverMatch[2])
    return { exists: () => true, data: () => ({ items }) }
  }

  console.info(`[adapter] 아직 미구현 경로(read, 기본값 폴백으로 넘어감): ${ref.path}`)
  return { exists: () => false, data: () => undefined }
}

export async function setDoc(ref, data) {
  const ctx = await getContext()

  if (ref.path === 'board/posts') {
    await writeBoardPosts(ctx, data)
    return
  }

  const storeInfoMatch = STOREINFO_RE.exec(ref.path)
  if (storeInfoMatch) {
    await writeStoreInfo(ctx, storeInfoMatch[1], data)
    return
  }

  const feedbackMatch = FEEDBACK_RE.exec(ref.path)
  if (feedbackMatch) {
    await writeFeedback(ctx, feedbackMatch[1], feedbackMatch[2], data)
    return
  }

  if (STAFF_MEMO_RE.test(ref.path)) {
    await writeStaffMemo(ctx, data)
    return
  }

  const handoverWriteMatch = HANDOVER_RE.exec(ref.path)
  if (handoverWriteMatch) {
    await writeHandoverItems(ctx, handoverWriteMatch[1], handoverWriteMatch[2], data)
    return
  }

  console.info(`[adapter] 아직 미구현 경로(write, 무시됨): ${ref.path}`)
}

export function onSnapshot(ref, callback) {
  const feedbackMatch = FEEDBACK_RE.exec(ref.path)
  if (feedbackMatch) {
    const [, originalStoreId, dateKey] = feedbackMatch
    let stopped = false
    let channel = null

    const push = async () => {
      if (stopped) return
      const ctx = await getContext()
      const data = await readFeedback(ctx, originalStoreId, dateKey)
      if (!stopped) callback({ exists: () => data !== null, data: () => data ?? undefined })
    }

    getContext().then((ctx) => {
      if (stopped) return
      const storeId = resolveStoreId(originalStoreId, ctx)
      channel = supabase
        .channel(`feedback-${storeId}-${dateKey}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'store_feedback', filter: `store_id=eq.${storeId}` }, push)
        .subscribe()
    })
    push()

    return () => {
      stopped = true
      if (channel) supabase.removeChannel(channel)
    }
  }

  // 그 외 경로는 원본에서 onSnapshot을 안 씀(read/write만) — 1회성 폴백으로 충분
  getDoc(ref).then(callback)
  return () => {}
}

export function collection() {
  throw new Error('collection() 미구현 (원본에서 실제 호출 0회 확인됨)')
}
export async function getDocs() {
  throw new Error('getDocs() 미구현 (원본에서 실제 호출 0회 확인됨)')
}
