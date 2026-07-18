// 원본 STORES(index.html에 하드코딩된 9개 매장)의 id 순서를 실제 테넌트 매장에 임시로
// 잇는 다리. STORES 자체를 테넌트 데이터로 바꾸는 건 5단계("깡통화") 몫이고, 그게 끝나면
// 이 파일은 통째로 삭제된다.
//
// 지금은 원본 STORES 배열 순서대로 실제 테넌트 매장에 매칭한다(테스트 테넌트는 매장 1개뿐이라
// 전부 그 매장으로 수렴함 — 매장이 여러 개인 테넌트에서는 이 순서 매칭이 부정확할 수 있으므로
// 5단계 전까지는 "화면이 동작하는지" 검증용 임시 방편임을 명확히 인지할 것).
export const ORIGINAL_STORE_IDS = ['yeonsu', 'nonhyeon', 'rodeo', 'gilbyeong', 'airport', 'geomdan', 'gyesan', 'sangdong', 'sijungdong']

// 원본 storeId 문자열 → 실제 stores.id(uuid)
export function resolveStoreId(originalStoreId, ctx) {
  if (!ctx.stores.length) return null
  const idx = ORIGINAL_STORE_IDS.indexOf(originalStoreId)
  if (idx === -1) return ctx.stores[0].id
  return ctx.stores[idx % ctx.stores.length].id
}

// 실제 stores.id(uuid) → 원본이 이해하는 storeId 문자열 (게시판 히스토리 카테고리의
// store_ids처럼, 원본 코드가 STORES.find(s=>s.id===id)로 이름을 찾아 표시하는 곳에 필요)
export function reverseResolveStoreId(realStoreId, ctx) {
  const idx = ctx.stores.findIndex((s) => s.id === realStoreId)
  if (idx === -1) return null
  return ORIGINAL_STORE_IDS[idx % ORIGINAL_STORE_IDS.length]
}
