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

  const { data: stores, error: storesError } = await supabase.from('stores').select('*').eq('tenant_id', profile.tenant_id).order('name')
  if (storesError) throw storesError

  cached = { session, profile, tenantId: profile.tenant_id, profileId: profile.id, stores: stores ?? [] }
  // 5-2: 원본 UI가 "지금 보는 카드가 본인인지"(조회 전용 표시) 판단할 최소 정보만 노출
  window.__vflowProfile = { id: profile.id, name: profile.name, role: profile.role }
  // 최종점검: 테넌트(회사) 이름 — 헤더/문서 제목 브랜딩용
  const { data: tenant } = await supabase.from('tenants').select('name').eq('id', profile.tenant_id).maybeSingle()
  window.__vflowTenant = { name: tenant?.name ?? '' }
  return cached
}
