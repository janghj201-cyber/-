// 로그인 세션 → 실제 tenant/profile 컨텍스트로 변환.
// 세션이 없거나 프로필이 없으면 login.html로 보낸다 — 원본 코드는 이 사실 자체를 몰라도 된다
// (getDoc/setDoc가 내부에서 먼저 이걸 기다리기 때문에, 원본의 호출부는 손댈 필요 없음).
import { supabase } from './supabase-client.js'

let cached = null

export async function getContext() {
  if (cached) return cached

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    location.href = 'login.html'
    throw new Error('로그인이 필요합니다')
  }

  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
  if (error) throw error
  if (!profile) {
    location.href = 'login.html'
    throw new Error('프로필이 없습니다 (온보딩 미완료)')
  }

  // 성능: stores와 tenant는 서로 독립 — 병렬로 (순차 왕복 2회 -> 1회)
  const [storesRes, tenantRes] = await Promise.all([
    supabase.from('stores').select('*').eq('tenant_id', profile.tenant_id).order('name'),
    supabase.from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle(),
  ])
  if (storesRes.error) throw storesRes.error

  cached = { session, profile, tenantId: profile.tenant_id, profileId: profile.id, stores: storesRes.data ?? [] }
  // 5-2: 원본 UI가 "지금 보는 카드가 본인인지"(조회 전용 표시) 판단할 최소 정보만 노출
  const _pad = (n) => String(n).padStart(2, '0')
  const _now = new Date()
  const _todayLocal = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-${_pad(_now.getDate())}`
  const _ovActive = profile.store_override_date === _todayLocal && !!profile.store_override_id
  window.__vflowProfile = {
    id: profile.id, name: profile.name, role: profile.role,
    storeId: (_ovActive ? profile.store_override_id : null) ?? profile.store_id ?? null,
    baseStoreId: profile.store_id ?? null,
    overrideActive: _ovActive,
    monitorOnly: !!profile.monitor_only,
  }
  // 최종점검: 테넌트(회사) 이름 — 헤더/문서 제목 브랜딩용
  window.__vflowTenant = { name: tenantRes.data?.name ?? '' }
  return cached
}
