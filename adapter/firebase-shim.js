// Firebase Firestore API 파사드 — 원본 index.html이 그대로 부르는 함수 시그니처
// (initializeApp/getFirestore/doc/getDoc/setDoc/onSnapshot)를 흉내내면서 실제로는
// Supabase를 씀. 원본 코드는 이 파일 존재를 몰라도 되게(=고칠 필요 없게) 설계함.
//
// 구현된 경로: board/posts (1단계), storeinfo/{storeId} · feedback/.../comment ·
// staff_memo/{name} (2단계).
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

// ── 경로 라우팅 ──
const STOREINFO_RE = /^storeinfo\/(.+)$/
const FEEDBACK_RE = /^feedback\/([^/]+)\/([^/]+)\/comment$/
const STAFF_MEMO_RE = /^staff_memo\/(.+)$/

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
