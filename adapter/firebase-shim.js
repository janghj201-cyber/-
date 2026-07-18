// Firebase Firestore API 파사드 — 원본 index.html이 그대로 부르는 함수 시그니처
// (initializeApp/getFirestore/doc/getDoc/setDoc/onSnapshot)를 흉내내면서 실제로는
// Supabase를 씀. 원본 코드는 이 파일 존재를 몰라도 되게(=고칠 필요 없게) 설계함.
//
// 구현된 경로: board/posts (1단계), storeinfo/{storeId} · feedback/.../comment ·
// staff_memo/{name} (2단계), handover/{storeId}_{dateKey} 읽기+쓰기 + 피드백 스레드
// (3단계 완료 — 미확인 배너는 별도 코드 없이 기존 getDoc 경로 재사용으로 이미 동작),
// staff_todos/{staffName}_{dateKey} 개인 업무 CRUD+순서변경+이월 특수액션+히스토리
// (4단계 완료 — "매장 단위 공용 업무"는 스코프 제외, 5단계로 이동: 판별자의 근본
// 문제가 "매장 텍스트 슬러그(STORES 하드코딩, 예: 'yeonsu') vs 직원이름"이 둘 다
// 일반 텍스트라 형태로 구분 불가능한 것 — STORES가 5단계(config/staff 깡통화)에서
// 실제 테넌트 매장(진짜 uuid)으로 바뀌면 자연히 해결됨. 지금 텍스트 슬러그로 억지
// 판별자를 만들면 5단계에서 다시 갈아엎어야 해서 보류. RLS/마이그레이션 설계는 이미
// 끝났고 5단계 때 그대로 재사용(vflow-porting-adapter-roadmap 메모리 참고): daily_tasks
// employee_id nullable(이미 nullable 확인됨) + 정책에 "employee_id is null and
// can_access_store(store_id)" OR 브랜치 추가하면 개인/공용 한 정책으로 커버됨).
// config/clean_daily_items · config/clean_zones · config/clean_deep_clean_rule(라벨/규칙
// 설정, 읽기전용) + checks/{storeId}/{dateKey}/clean(기본청소+대청소 구역, 1~2/3 완료) —
// V-Flow 기존 cleaning_daily_items/cleaning_daily_logs/cleaning_zones/cleaning_deep_
// clean_rule/cleaning_deep_logs/cleaning_deep_item_logs 연결. 구역 자동배정+담당자
// 자동배정은 V-Flow 설계(cleaningApi.js) 그대로 재구현(별도 저장소라 import 불가).
// ⚠ "대청소 N구역" 텍스트 라벨(달력 배지 등 8곳)은 원본의 날짜 전역계산(그 달 몇 번째
// 발생이냐)을 그대로 쓰는데, 실제 배정은 V-Flow의 매장별 로테이션이라 서로 다를 수
// 있다 — 4구역 항목 개수가 전부 같아서(현재 테넌트 기준) 완료율(N/M) 계산은 항상
// 정확하고, 어긋나는 건 순수 텍스트뿐. staff_todos 공용업무 판별자와 같은 계열(원본
// 날짜 전역계산 vs V-Flow 매장별 구조) 문제라 5단계(매장 구조 정리)로 미룸.
// config/schedule_rules(고정업무 규칙, 읽기전용) — V-Flow 기존 calendar_event_types
// 연결, 월간 캘린더 배지(전체주문/재고실사/월마감보고). 편집(고정업무 관리 탭)은
// 관리자 커스터마이징 묶음으로 보류. staff_projects/{staffName}(진행중 프로젝트,
// 개인용) — V-Flow 기존 projects/project_logs 테이블 연결(schema.sql에 이 포팅을
// 염두에 두고 만들어둔 테이블이라 신규 마이그레이션 없이 어댑터 연결만 함). 관리자
// 프로젝트탭(전직원 집계)은 5단계(다직원집계, 항목 A 계열)로 보류.
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

// ── staff_todos/{staffName}_{dateKey} (V-Flow 기존 daily_tasks 테이블) ──
// 원본은 "어제 문서만 보고 하루씩 체인 복사"해서 이월을 흉내내는데, 며칠 앱을 안 켜면
// 중간 날짜 문서에 복사가 안 남아 이월이 조용히 끊기는 버그가 있다(B-5에서 겪었던 것과
// 동일 계열 문제). handover와 같은 원칙으로, 물리적 복사 없이 "이 직원의 완료 안 된
// 과거 항목은 오늘 목록에도 포함" 쿼리 하나로 재현 — 사본이 없어 그 버그 자체가 없다.
// staff_memo와 같은 이유로 경로의 {staffName}은 신뢰하지 않고 항상 ctx.profileId로
// 귀속시킨다(카드 선택=myStaff와 실제 로그인 프로필이 identity 통합 전까지는 분리돼 있음).
//
// 이월 병합은 원본과 동일하게 "오늘 날짜를 볼 때만" 적용한다(과거 날짜를 그대로 반환).
// 안 그러면 히스토리 화면처럼 이번 달 날짜를 하루씩 순회하며 매일 읽는 화면에서, 아직
// 안 끝난 항목이 그 이후 모든 날짜에 중복으로 끼어드는 문제가 생긴다.
//
// 순서변경(↑/↓)은 원본이 배열 위치를 통째로 바꿔 setDoc하므로, 매 쓰기마다 들어온
// 배열의 인덱스를 sort_order로 그대로 반영한다(재정렬 전용 diff를 따로 두지 않고
// 모든 쓰기에서 동일하게 처리 — 더 단순하고, 결과도 항상 배열 순서와 일치).
function todayDateKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isToday(dateKey) {
  return dateKey === todayDateKey()
}

async function readStaffTodos(ctx, dateKey) {
  let query = supabase.from('daily_tasks').select('id, content, store_id, status, task_date, sort_order').eq('employee_id', ctx.profileId)
  query = isToday(dateKey) ? query.or(`task_date.eq.${dateKey},and(status.eq.pending,task_date.lt.${dateKey})`) : query.eq('task_date', dateKey)
  const { data, error } = await query.order('sort_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({
    id: r.id,
    text: r.content,
    storeId: reverseResolveStoreId(r.store_id, ctx) ?? undefined,
    done: r.status === 'done',
    author: ctx.profile.name,
    fromDate: r.task_date !== dateKey ? r.task_date : null,
  }))
}

// 원본의 "오늘로 이동"(carryItemToToday)은 오늘 목록에 새 항목만 addTodoItem으로
// 추가하고 원본 항목은 그대로 둔다 — B-5에서 겪은 것과 같은 이월 중복 생성 버그.
// V-Flow 자체 대시보드(myWork.js)가 이미 쓰는 패턴을 그대로 재사용: 새 행을 넣고
// 원본을 status='carried_over'로 마킹해서 다음 이월 대상에서 빠지게 한다. 새로
// 추가되는 항목의 fromDate가 채워져 있고 오늘 날짜와 다르면 "이동" 케이스로 보고,
// 같은 내용의 아직 pending인 원본을 그 날짜에서 찾아 연결한다(id가 없어 내용+날짜로
// 매칭 — 원본도 애초에 id 없이 배열로만 다루던 것과 같은 한계).
async function writeStaffTodos(ctx, dateKey, { items }) {
  const today = isToday(dateKey)
  let selQuery = supabase.from('daily_tasks').select('id, content, status, task_date').eq('employee_id', ctx.profileId)
  selQuery = today ? selQuery.or(`task_date.eq.${dateKey},and(status.eq.pending,task_date.lt.${dateKey})`) : selQuery.eq('task_date', dateKey)
  const { data: currentRows, error: selErr } = await selQuery
  if (selErr) throw selErr
  const currentById = new Map((currentRows ?? []).map((r) => [r.id, r]))
  const incomingRealIds = new Set(items.filter((i) => UUID_RE.test(i.id)).map((i) => i.id))

  for (const id of currentById.keys()) {
    if (!incomingRealIds.has(id)) {
      const { error } = await supabase.from('daily_tasks').delete().eq('id', id)
      if (error) throw error
    }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!UUID_RE.test(item.id)) {
      const isCarryMove = today && item.fromDate && item.fromDate !== dateKey
      if (isCarryMove) {
        const original = (currentRows ?? []).find((r) => r.content === item.text && r.task_date === item.fromDate && r.status === 'pending')
        // 히스토리 화면의 "오늘로↑" 버튼이 클릭 후에도 원본 UI에서 안 사라지는 한계 때문에
        // 재클릭될 수 있다 — 원본이 이미 carried_over로 마킹돼 더 이상 pending이 아니면
        // "이미 이동된 것"으로 보고 조용히 건너뛴다. 그대로 insert하면 진짜 중복이 생긴다.
        if (!original) continue
        const storeId = resolveStoreId(item.storeId, ctx)
        const { error } = await supabase.from('daily_tasks').insert({
          tenant_id: ctx.tenantId,
          store_id: storeId,
          employee_id: ctx.profileId,
          task_date: dateKey,
          content: item.text,
          status: item.done ? 'done' : 'pending',
          sort_order: i,
          carried_over_from: original.id,
        })
        if (error) throw error
        const { error: markErr } = await supabase.from('daily_tasks').update({ status: 'carried_over' }).eq('id', original.id)
        if (markErr) throw markErr
        continue
      }
      const storeId = resolveStoreId(item.storeId, ctx)
      const { error } = await supabase.from('daily_tasks').insert({
        tenant_id: ctx.tenantId,
        store_id: storeId,
        employee_id: ctx.profileId,
        task_date: dateKey,
        content: item.text,
        status: item.done ? 'done' : 'pending',
        sort_order: i,
      })
      if (error) throw error
      continue
    }
    const current = currentById.get(item.id)
    if (!current) continue // 방어적: 조회 범위 밖 id는 건드리지 않음
    const patch = { sort_order: i }
    if (current.content !== item.text) patch.content = item.text
    const wantStatus = item.kept ? 'kept' : item.done ? 'done' : 'pending'
    if (current.status !== wantStatus) patch.status = wantStatus
    const { error } = await supabase.from('daily_tasks').update(patch).eq('id', item.id)
    if (error) throw error
  }
}

// ── staff_projects/{staffName} (V-Flow 기존 projects/project_logs 테이블) ──
// schema.sql의 projects 테이블 주석이 "원본의 items[].doneDate 대응"이라고 직접 명시할
// 정도로, 애초에 이 포팅을 염두에 두고 만들어진 테이블(V-Flow 자체 대시보드 myWork.js가
// 진행률바/20%버튼/일지 CRUD까지 이미 구현해 씀) — 신규 테이블 없이 어댑터 연결만 한다.
// staff_todos/staff_memo와 같은 이유로 경로의 {staffName}은 신뢰하지 않고 항상
// ctx.profileId로 귀속시킨다.
//
// 원본 로그 항목({date,text,ts})엔 id가 없고 배열 인덱스로만 수정/삭제한다(원본
// editLog/deleteLog가 target.logs[li]를 직접 조작). 읽을 때 실제 project_logs.id를
// 각 로그 객체에 몰래 끼워넣어두면(원본은 l.date/l.text만 쓰므로 렌더링에 영향 없음),
// 수정 시엔 그 객체가 그대로 mutate돼 id가 살아있고, 신규 addProjectLog가 만든 로그는
// id가 아예 없다 — 이 유무로 update/insert를 구분한다(UUID_RE로 판별하는 다른 배열들과
// 같은 원리, 다만 "형태가 다른 id" 대신 "id 유무"를 씀).
async function readStaffProjects(ctx) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, store_id, title, progress, status, done_date, created_at')
    .eq('employee_id', ctx.profileId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const projects = data ?? []
  const ids = projects.map((p) => p.id)

  const logsByProject = new Map()
  if (ids.length > 0) {
    const { data: logRows, error: logErr } = await supabase
      .from('project_logs')
      .select('id, project_id, log_date, content, created_at')
      .in('project_id', ids)
      .order('created_at', { ascending: true })
    if (logErr) throw logErr
    for (const l of logRows ?? []) {
      const list = logsByProject.get(l.project_id) ?? []
      list.push({ id: l.id, date: l.log_date, text: l.content, ts: new Date(l.created_at).getTime() })
      logsByProject.set(l.project_id, list)
    }
  }

  return {
    items: projects.map((p) => ({
      id: p.id,
      text: p.title,
      storeId: reverseResolveStoreId(p.store_id, ctx) ?? undefined,
      done: p.status === 'done',
      startDate: p.created_at ? p.created_at.slice(0, 10) : undefined,
      doneDate: p.done_date ?? undefined,
      progress: p.progress ?? 0,
      logs: logsByProject.get(p.id) ?? [],
    })),
  }
}

async function writeProjectLogs(ctx, projectId, logs) {
  const { data: currentRows, error: selErr } = await supabase.from('project_logs').select('id, content').eq('project_id', projectId)
  if (selErr) throw selErr
  const currentById = new Map((currentRows ?? []).map((r) => [r.id, r]))
  const incomingIds = new Set(logs.filter((l) => l.id && UUID_RE.test(l.id)).map((l) => l.id))

  for (const id of currentById.keys()) {
    if (!incomingIds.has(id)) {
      const { error } = await supabase.from('project_logs').delete().eq('id', id)
      if (error) throw error
    }
  }

  for (const log of logs) {
    if (!log.id || !UUID_RE.test(log.id)) {
      const { error } = await supabase.from('project_logs').insert({
        tenant_id: ctx.tenantId,
        project_id: projectId,
        author_id: ctx.profileId,
        log_date: log.date,
        content: log.text,
      })
      if (error) throw error
      continue
    }
    const current = currentById.get(log.id)
    if (!current) continue // 방어적: 조회 범위 밖 id는 건드리지 않음
    if (current.content !== log.text) {
      const { error } = await supabase.from('project_logs').update({ content: log.text }).eq('id', log.id)
      if (error) throw error
    }
  }
}

async function writeStaffProjects(ctx, { items }) {
  const { data: currentRows, error: selErr } = await supabase
    .from('projects')
    .select('id, title, progress, status, done_date')
    .eq('employee_id', ctx.profileId)
  if (selErr) throw selErr
  const currentById = new Map((currentRows ?? []).map((r) => [r.id, r]))
  const incomingRealIds = new Set(items.filter((i) => UUID_RE.test(i.id)).map((i) => i.id))

  for (const id of currentById.keys()) {
    if (!incomingRealIds.has(id)) {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
    }
  }

  for (const item of items) {
    if (!UUID_RE.test(item.id)) {
      // addProject가 만드는 새 항목은 항상 logs:[]라 로그 diff가 필요 없다(원본은
      // addProjectLog를 addProject와 별개 호출로만 실행 — 이미 real id가 생긴 뒤).
      const storeId = resolveStoreId(item.storeId, ctx)
      const { error } = await supabase.from('projects').insert({
        tenant_id: ctx.tenantId,
        store_id: storeId,
        employee_id: ctx.profileId,
        title: item.text,
        status: item.done ? 'done' : 'ongoing',
        progress: item.progress ?? 0,
        done_date: item.doneDate ?? null,
      })
      if (error) throw error
      continue
    }
    const current = currentById.get(item.id)
    if (!current) continue // 방어적: 조회 범위 밖 id는 건드리지 않음
    const patch = {}
    if (current.title !== item.text) patch.title = item.text
    const wantStatus = item.done ? 'done' : 'ongoing'
    if (current.status !== wantStatus) patch.status = wantStatus
    if ((current.progress ?? 0) !== (item.progress ?? 0)) patch.progress = item.progress ?? 0
    const wantDoneDate = item.doneDate ?? null
    if ((current.done_date ?? null) !== wantDoneDate) patch.done_date = wantDoneDate
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('projects').update(patch).eq('id', item.id)
      if (error) throw error
    }
    await writeProjectLogs(ctx, item.id, item.logs || [])
  }
}

// ── config/clean_daily_items, config/clean_zones (V-Flow 기존 cleaning_daily_items/
// cleaning_zones 테이블 — 읽기 전용) ──
// 원본은 CLEAN_BASE/CSECTIONS를 자바스크립트 상수로 하드코딩해서 렌더링에 직접 쓴다
// (Firestore 경유 안 함). scheduleRules와 같은 패턴으로 index.html에 loadCleanConfig()를
// 최소로 추가해서, 앱 시작 시 이 두 경로를 한 번 읽어 CLEAN_BASE/CSECTIONS 배열 내용을
// 테넌트의 실제 청소 항목으로 교체한다 — 위베이프 6항목/4구역 문구가 화면에 안 남게.
// scheduleRules와 다르게 "없으면 기본값을 setDoc으로 되써넣기"는 안 한다 — 여기 항목은
// 테넌트가 온보딩 때 이미 갖고 있는 실제 청소 목록이라, 못 불러왔다고 위베이프 기본값을
// 저장소에 새로 쓰면 안 되기 때문(원본 UI는 이 두 경로에 setDoc을 아예 안 부른다).
async function readCleanDailyItemsConfig(ctx) {
  const { data, error } = await supabase.from('cleaning_daily_items').select('label').eq('tenant_id', ctx.tenantId).eq('active', true).order('sort_order')
  if (error) throw error
  return { items: (data ?? []).map((r) => r.label) }
}

async function readCleanZonesConfig(ctx) {
  const { data, error } = await supabase.from('cleaning_zones').select('title, items').eq('tenant_id', ctx.tenantId).eq('active', true).order('zone_number')
  if (error) throw error
  return { zones: (data ?? []).map((r) => ({ title: r.title, items: r.items })) }
}

// ── config/schedule_rules (V-Flow 기존 calendar_event_types 테이블 — 읽기 전용) ──
// 원본은 매주/매월 반복되는 고정업무(전체주문/재고실사/월마감보고 등)를 하드코딩
// DEFAULT_SCHEDULE_RULES로 시작해서 config/schedule_rules로 덮어쓴다. V-Flow는 이미
// calendar_event_types로 이 개념을 테넌트 범용화해뒀음(이번 세션 앞부분에서 만든 것) —
// 위베이프 전용 규칙(팟기기점검/AS발송 등, vape 업계 특화)은 V-Flow 시드에 아예 없어서
// 자연히 안 뜬다(깡통화). "대청소"는 재사용 안 함 — 청소 체크리스트 기능이 이미
// cleaning_deep_clean_rule로 별도 처리 중이라, 여기서 같이 넣으면 배지가 중복된다.
// 원본의 recurrence 조건 타입(weekday/monthdays)만 매핑 가능 — lastBizDayBefore
// (AS발송일류)는 V-Flow 어휘에 없어서 자연히 빠짐(위베이프 전용 개념이라 정상).
//
// 편집(관리자 "고정업무 관리" 탭, saveScheduleRules)은 스코프 밖 — 관리자 커스터마이징
// 묶음(설정편집+기능On/Off+컬러테마)에서 나중에 구현. 지금은 setDoc이 기존 관례대로
// 조용히 무시되지만, 원본 UI는 저장 성공 여부를 확인 안 하고 항상 "✓ 저장됨"을 띄우므로
// 실제로는 안 저장되는데 저장된 것처럼 보인다 — 커스터마이징 묶음 만들 때 같이 잡을 것.
const SCHEDULE_RULE_COLOR_MAP = { blue: 'c-blue', orange: 'c-orange', purple: 'c-purple', pink: 'c-pink', teal: 'c-teal', green: 'c-green', red: 'c-red' }

// 월간 캘린더 그리드(renderCal)의 날짜 배지는 rule.task를 안 쓰고, e.t(rule.key)가
// 'order'/'stock'/... 같은 원본 고정 키일 때만 자기 하드코딩 텍스트("전체주문" 등)를
// 보여주는 별도 switch문이다(관리자 "고정업무 관리" 탭은 반대로 rule.task를 그대로
// 써서 이미 동적임). 그래서 라벨을 원본 키로 되돌려 매핑해야 그리드에 배지가 뜬다 —
// 이 테넌트는 V-Flow 시드 라벨이 원본과 우연히 같아서(전체주문/재고실사) 잘 맞지만,
// 다른 라벨(다른 업종 커스텀 규칙)은 매칭 키가 없어 그리드 배지만 조용히 안 뜬다
// (고정업무 관리 탭 등 rule.task 기반 화면은 영향 없음 — 5단계 항목 아님, renderCal
// 자체의 하드코딩 스코프 한계라 필요하면 별도로 다룰 것).
const SCHEDULE_RULE_LABEL_TO_KEY = { 전체주문: 'order', 재고실사: 'stock', 월마감보고: 'report' }

async function readScheduleRulesConfig(ctx) {
  const { data, error } = await supabase
    .from('calendar_event_types')
    .select('label, color, recurrence')
    .eq('tenant_id', ctx.tenantId)
    .eq('active', true)
    .order('sort_order')
  if (error) throw error
  const rules = []
  ;(data ?? []).forEach((row, i) => {
    const rec = row.recurrence ?? {}
    const col = SCHEDULE_RULE_COLOR_MAP[row.color] ?? 'c-blue'
    const key = SCHEDULE_RULE_LABEL_TO_KEY[row.label] ?? `rule_${i}`
    if (rec.type === 'weekly') {
      rules.push({ key, condType: 'weekday', weekday: rec.weekday, task: row.label, meta: '', col })
    } else if (rec.type === 'monthly_day') {
      rules.push({ key, condType: 'monthdays', days: rec.days, task: row.label, meta: '', col })
    }
    // 그 외(monthly_weekday_occurrences 등 대청소류)는 청소 체크리스트가 이미 처리 — 스킵
  })
  return { rules }
}

// ── config/clean_deep_clean_rule (V-Flow 기존 cleaning_deep_clean_rule 테이블 — 읽기전용) ──
// getEvs()의 "몇 번째 일요일이 대청소일이냐" 판정을 원본 하드코딩(1~4번째 전부) 대신
// 테넌트 실제 규칙(기본값: 1·3번째만)으로 덮어쓰는 데 쓴다. loadCleanConfig()가 앱 시작
// 시 한 번 읽어 DEEP_CLEAN_OCCURRENCES를 채운다.
async function readCleanDeepRuleConfig(ctx) {
  const rule = await fetchDeepCleanRule(ctx)
  return { occurrences: rule.occurrences }
}

async function fetchDeepCleanRule(ctx) {
  const { data, error } = await supabase.from('cleaning_deep_clean_rule').select('recurrence').eq('tenant_id', ctx.tenantId).maybeSingle()
  if (error) throw error
  return data?.recurrence ?? { type: 'monthly_weekday_occurrences', weekday: 0, occurrences: [1, 3] }
}

// schedule.js의 evalRecurrence('monthly_weekday_occurrences')와 동일 규칙(cleaningApi.js와
// 판정 로직을 동일하게 맞춤 — 별도 저장소라 import 대신 로직만 그대로 재구현).
function isDeepCleanDay(dateKey, rule) {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  if (dow !== rule.weekday) return false
  let count = 0
  for (let dd = 1; dd <= d; dd++) {
    if (new Date(y, m - 1, dd).getDay() === rule.weekday) count++
  }
  return (rule.occurrences ?? []).includes(count)
}

async function projectedDeepCleanZoneNumber(ctx, storeId) {
  const { data: lastLog, error } = await supabase
    .from('cleaning_deep_logs')
    .select('zone_number')
    .eq('store_id', storeId)
    .order('log_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return lastLog ? (lastLog.zone_number % 4) + 1 : 1
}

// 그 발생일에 daily_tasks를 남긴 직원(=근무자로 간주) 중 대청소를 가장 오래전에 맡은
// 사람을 우선 배정. 후보가 없으면 null(관리자 수동 배정 필요, cleaningApi.js와 동일 로직).
async function pickDeepCleanAssignee(ctx, storeId, dateKey) {
  const { data: workers, error: workerErr } = await supabase.from('daily_tasks').select('employee_id').eq('store_id', storeId).eq('task_date', dateKey)
  if (workerErr) throw workerErr
  const candidates = [...new Set((workers ?? []).map((w) => w.employee_id))]
  if (candidates.length === 0) return null

  const { data: history, error: histErr } = await supabase
    .from('cleaning_deep_logs')
    .select('assignee_id, log_date')
    .eq('store_id', storeId)
    .in('assignee_id', candidates)
    .order('log_date', { ascending: false })
  if (histErr) throw histErr
  const lastAssignedDate = {}
  for (const row of history ?? []) {
    if (!lastAssignedDate[row.assignee_id]) lastAssignedDate[row.assignee_id] = row.log_date
  }
  candidates.sort((a, b) => (lastAssignedDate[a] ?? '0000-00-00').localeCompare(lastAssignedDate[b] ?? '0000-00-00'))
  return candidates[0]
}

// 이미 있는 발생 건만 조회, 없으면 null(생성 안 함) — 훑어보기 화면에서 자동배정이
// 트리거되면 안 되므로 읽기 경로는 항상 이걸 쓴다.
async function fetchDeepCleanLogReadOnly(storeId, dateKey) {
  const { data: existing, error: existingErr } = await supabase.from('cleaning_deep_logs').select('id, zone_number').eq('store_id', storeId).eq('log_date', dateKey).maybeSingle()
  if (existingErr) throw existingErr
  if (!existing) return null
  const { data: itemLogs, error: itemsErr } = await supabase
    .from('cleaning_deep_item_logs')
    .select('id, item_label, done, completed_at')
    .eq('deep_log_id', existing.id)
    .order('sort_order')
  if (itemsErr) throw itemsErr
  return { ...existing, itemLogs: itemLogs ?? [] }
}

// 실제 발생 기록을 생성(자동배정+담당자배정)한다 — 대청소일이 아니면 null. 체크박스를
// 처음 누르는 순간에만 호출됨(writeChecks에서만) — 읽기 경로는 절대 안 씀.
async function getOrCreateDeepCleanLog(ctx, storeId, dateKey) {
  const rule = await fetchDeepCleanRule(ctx)
  if (!isDeepCleanDay(dateKey, rule)) return null

  const existing = await fetchDeepCleanLogReadOnly(storeId, dateKey)
  if (existing) return existing

  const zoneNumber = await projectedDeepCleanZoneNumber(ctx, storeId)
  const { data: zone, error: zoneErr } = await supabase
    .from('cleaning_zones')
    .select('items')
    .eq('tenant_id', ctx.tenantId)
    .eq('zone_number', zoneNumber)
    .eq('active', true)
    .maybeSingle()
  if (zoneErr) throw zoneErr
  const assigneeId = await pickDeepCleanAssignee(ctx, storeId, dateKey)

  const { data: created, error: createErr } = await supabase
    .from('cleaning_deep_logs')
    .insert({ tenant_id: ctx.tenantId, store_id: storeId, log_date: dateKey, zone_number: zoneNumber, assignee_id: assigneeId, assignee_source: 'auto' })
    .select('id, zone_number')
    .single()
  if (createErr) throw createErr

  const itemRows = (zone?.items ?? []).map((label, i) => ({ tenant_id: ctx.tenantId, deep_log_id: created.id, item_label: label, sort_order: i }))
  let itemLogs = []
  if (itemRows.length > 0) {
    const { data: inserted, error: insErr } = await supabase.from('cleaning_deep_item_logs').insert(itemRows).select('id, item_label, done, completed_at')
    if (insErr) throw insErr
    itemLogs = inserted ?? []
  }
  return { ...created, itemLogs }
}

// ── checks/{storeId}/{dateKey}/clean (V-Flow 기존 cleaning_daily_items/cleaning_daily_logs +
// 대청소일이면 cleaning_deep_logs/cleaning_deep_item_logs) ──
// 원본은 {item_0:{v,t}, item_1:{v,t}, ...} 형태의 flat map 문서 하나를 통째로 읽고 쓴다.
// item_0..(dailyCount-1)은 기본청소(cleaning_daily_items) 순서, 대청소일이면 그 뒤로
// 배정된 구역의 항목이 이어붙는다 — 원본이 [...CLEAN_BASE, ...CSECTIONS[sec-1].items]로
// 합치는 것과 동일한 순서.
async function readChecks(ctx, originalStoreId, dateKey) {
  const storeId = resolveStoreId(originalStoreId, ctx)
  if (!storeId) return {}
  const { data: items, error: itemsErr } = await supabase
    .from('cleaning_daily_items')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('active', true)
    .order('sort_order')
  if (itemsErr) throw itemsErr
  const { data: logs, error: logsErr } = await supabase
    .from('cleaning_daily_logs')
    .select('item_id, done, completed_at')
    .eq('store_id', storeId)
    .eq('log_date', dateKey)
  if (logsErr) throw logsErr
  const logByItemId = new Map((logs ?? []).map((l) => [l.item_id, l]))

  const result = {}
  ;(items ?? []).forEach((item, i) => {
    const log = logByItemId.get(item.id)
    result[`item_${i}`] = log?.done ? { v: true, t: new Date(log.completed_at).getTime() } : { v: false, t: null }
  })

  const rule = await fetchDeepCleanRule(ctx)
  if (isDeepCleanDay(dateKey, rule)) {
    const existing = await fetchDeepCleanLogReadOnly(storeId, dateKey)
    const base = (items ?? []).length
    if (existing) {
      existing.itemLogs.forEach((it, i) => {
        result[`item_${base + i}`] = it.done ? { v: true, t: it.completed_at ? new Date(it.completed_at).getTime() : null } : { v: false, t: null }
      })
    } else {
      // 아직 발생 기록 없음 — 배정될 구역 미리보기만(저장 안 함)
      const zoneNumber = await projectedDeepCleanZoneNumber(ctx, storeId)
      const { data: zone, error: zoneErr } = await supabase
        .from('cleaning_zones')
        .select('items')
        .eq('tenant_id', ctx.tenantId)
        .eq('zone_number', zoneNumber)
        .eq('active', true)
        .maybeSingle()
      if (zoneErr) throw zoneErr
      ;(zone?.items ?? []).forEach((_, i) => {
        result[`item_${base + i}`] = { v: false, t: null }
      })
    }
  }
  return result
}

// 원본은 체크박스 하나 바뀔 때마다 문서 전체를 getDoc→해당 key만 patch→setDoc 하거나
// (개별 체크), "초기화" 버튼에서 setDoc({})로 문서 전체를 비운다 — 둘 다 여기로 온다.
// 들어온 data가 빈 객체면 초기화로 보고 이 매장·날짜의 모든 로그를 done=false로 되돌린다.
async function writeChecks(ctx, originalStoreId, dateKey, data) {
  const storeId = resolveStoreId(originalStoreId, ctx)
  if (!storeId) return
  const { data: items, error: itemsErr } = await supabase
    .from('cleaning_daily_items')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('active', true)
    .order('sort_order')
  if (itemsErr) throw itemsErr
  const dailyCount = (items ?? []).length

  if (Object.keys(data).length === 0) {
    const ids = (items ?? []).map((i) => i.id)
    if (ids.length > 0) {
      const { error } = await supabase
        .from('cleaning_daily_logs')
        .upsert(
          ids.map((itemId) => ({ tenant_id: ctx.tenantId, store_id: storeId, log_date: dateKey, item_id: itemId, done: false, completed_by: null, completed_at: null })),
          { onConflict: 'store_id,log_date,item_id' }
        )
      if (error) throw error
    }
    // 대청소 발생 기록이 이미 있으면 그 항목들도 초기화 — 없으면 새로 만들지 않는다
    // (초기화 버튼을 누른 것만으로 자동배정이 트리거되면 안 되므로 읽기전용 조회로 확인).
    const existing = await fetchDeepCleanLogReadOnly(storeId, dateKey)
    if (existing && existing.itemLogs.length > 0) {
      const { error } = await supabase
        .from('cleaning_deep_item_logs')
        .update({ done: false, completed_at: null })
        .eq('deep_log_id', existing.id)
      if (error) throw error
    }
    return
  }

  for (const [key, val] of Object.entries(data)) {
    const idx = Number(key.replace('item_', ''))
    const done = !!val?.v
    if (idx < dailyCount) {
      const item = (items ?? [])[idx]
      if (!item) continue
      const { error } = await supabase.from('cleaning_daily_logs').upsert(
        { tenant_id: ctx.tenantId, store_id: storeId, log_date: dateKey, item_id: item.id, done, completed_by: done ? ctx.profileId : null, completed_at: done ? new Date().toISOString() : null },
        { onConflict: 'store_id,log_date,item_id' }
      )
      if (error) throw error
      continue
    }
    // 대청소 구역 항목 — 최초 체크 시점에만 실제 발생 기록을 생성(자동배정+담당자배정).
    const deepLog = await getOrCreateDeepCleanLog(ctx, storeId, dateKey)
    if (!deepLog) continue // 방어적: 대청소일이 아닌데 들어온 인덱스는 무시
    const itemLog = deepLog.itemLogs[idx - dailyCount]
    if (!itemLog) continue
    const { error } = await supabase.from('cleaning_deep_item_logs').update({ done, completed_at: done ? new Date().toISOString() : null }).eq('id', itemLog.id)
    if (error) throw error
  }
}

// ── 경로 라우팅 ──
const STOREINFO_RE = /^storeinfo\/(.+)$/
const FEEDBACK_RE = /^feedback\/([^/]+)\/([^/]+)\/comment$/
const STAFF_MEMO_RE = /^staff_memo\/(.+)$/
const HANDOVER_RE = /^handover\/([^_]+)_(\d{4}-\d{2}-\d{2})$/
const STAFF_TODO_RE = /^staff_todos\/([^_]+)_(\d{4}-\d{2}-\d{2})$/
const CHECKS_RE = /^checks\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/clean$/
const STAFF_PROJECT_RE = /^staff_projects\/(.+)$/

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

  // 매장 공용 업무(staff_todos/{storeId}_{date})는 스코프에서 제외했다(4단계 3/4 검토
  // 결과) — 판별자를 만들려 해도 히스토리 화면의 원본 버그(체크/수정/삭제에서 직원명
  // 대신 매장id를 잘못 넘김)와 경로 모양이 완전히 같아서 원리적으로 구분이 불가능하고,
  // 애초에 원본의 매장 공용 업무 자체도 addTodoItem이 항상 author로 문서 키를 만들어
  // 이미 죽어있는 기능이었다(추가해도 자기 화면에 안 뜸). 이름 무관하게 전부 개인
  // 업무로 라우팅 — 원본에서 안 되던 히스토리 편집도 이걸로 정상화됨(5단계에서 재검토).
  const staffTodoMatch = STAFF_TODO_RE.exec(ref.path)
  if (staffTodoMatch) {
    const items = await readStaffTodos(ctx, staffTodoMatch[2])
    return { exists: () => true, data: () => ({ items }) }
  }

  if (ref.path === 'config/clean_daily_items') {
    const data = await readCleanDailyItemsConfig(ctx)
    return { exists: () => data.items.length > 0, data: () => data }
  }

  if (ref.path === 'config/clean_zones') {
    const data = await readCleanZonesConfig(ctx)
    return { exists: () => data.zones.length > 0, data: () => data }
  }

  if (ref.path === 'config/clean_deep_clean_rule') {
    const data = await readCleanDeepRuleConfig(ctx)
    return { exists: () => Array.isArray(data.occurrences) && data.occurrences.length > 0, data: () => data }
  }

  if (ref.path === 'config/schedule_rules') {
    const data = await readScheduleRulesConfig(ctx)
    return { exists: () => data.rules.length > 0, data: () => data }
  }

  const checksMatch = CHECKS_RE.exec(ref.path)
  if (checksMatch) {
    const data = await readChecks(ctx, checksMatch[1], checksMatch[2])
    return { exists: () => true, data: () => data }
  }

  if (STAFF_PROJECT_RE.test(ref.path)) {
    const data = await readStaffProjects(ctx)
    return { exists: () => true, data: () => data }
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

  // 위 getDoc의 동일 주석 참고 — 매장 공용 업무는 스코프 제외(5단계에서 재검토).
  const staffTodoWriteMatch = STAFF_TODO_RE.exec(ref.path)
  if (staffTodoWriteMatch) {
    await writeStaffTodos(ctx, staffTodoWriteMatch[2], data)
    return
  }

  const checksWriteMatch = CHECKS_RE.exec(ref.path)
  if (checksWriteMatch) {
    await writeChecks(ctx, checksWriteMatch[1], checksWriteMatch[2], data)
    return
  }

  if (STAFF_PROJECT_RE.test(ref.path)) {
    await writeStaffProjects(ctx, data)
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

  // 대시보드 "오늘의 매장 현황" 위젯이 staffList(하드코딩 이름 목록) 전체를 순회하며
  // staff_todos/{name}_{today}에 onSnapshot을 건다(4단계, 신원통합 이후 몫). 지금은
  // 어떤 이름으로 조회해도 항상 ctx.profileId(실제 로그인 계정)로 귀속되므로, 이대로
  // getDoc에 흘려보내면 같은 실제 데이터가 이름 개수만큼 중복 집계된다. 신원통합 전까지는
  // 빈 배열로 조용히 폴백 — "내 업무" 화면(getDoc 경로)은 영향 없음, onSnapshot만 막는다.
  if (STAFF_TODO_RE.test(ref.path)) {
    callback({ exists: () => true, data: () => ({ items: [] }) })
    return () => {}
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
