// 로그인 세션 → 실제 tenant/profile 컨텍스트로 변환.
// 세션이 없거나 프로필이 없으면 login.html로 보낸다 — 원본 코드는 이 사실 자체를 몰라도 된다
// (getDoc/setDoc가 내부에서 먼저 이걸 기다리기 때문에, 원본의 호출부는 손댈 필요 없음).
import { supabase } from './supabase-client.js'

let cached = null
let pending = null
// 앱이 켜질 때 여러 곳이 동시에 getContext()를 부른다. 결과만 담아두면 첫 결과가 오기 전에
// 부른 곳마다 조회를 따로 보내 profiles·stores·tenants가 6번씩 나갔다 → 진행 중인 약속을 같이 기다린다
export function getContext() {
  if (cached) return Promise.resolve(cached)
  if (!pending) pending = loadContext().finally(() => { pending = null })
  return pending
}

// 여는 속도 2단계: 프로필 → (매장·회사) → 설정 세 번 오가던 것을 vf_boot() 한 번으로.
// 함수가 아직 없으면(SQL 전) 예전 방식 그대로. RLS는 함수 안에서도 똑같이 걸린다(security invoker)
async function bootOnce(uid) {
  try {
    const { data, error } = await supabase.rpc('vf_boot')
    if (!error && data && data.profile) return data
  } catch (e) {}
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
  if (error) throw error
  if (!profile) return { profile: null }
  const [storesRes, tenantRes] = await Promise.all([
    supabase.from('stores').select('*').eq('tenant_id', profile.tenant_id).order('name'),
    supabase.from('tenants').select('name, is_platform').eq('id', profile.tenant_id).maybeSingle(),
  ])
  if (storesRes.error) throw storesRes.error
  return { profile, stores: storesRes.data ?? [], tenant: tenantRes.data ?? null }
}

async function loadContext() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    location.href = 'login.html'
    throw new Error('로그인이 필요합니다')
  }

  const boot = await bootOnce(session.user.id)
  const profile = boot.profile
  if (!profile) {
    location.href = 'login.html'
    throw new Error('프로필이 없습니다 (온보딩 미완료)')
  }
  const tenantRes = { data: boot.tenant ?? null }
  // 설정은 여기서 같이 받아 두고 어댑터가 첫 한 번만 쓴다 (없으면 예전처럼 따로 읽음)
  if ('settings' in boot) window.__vflowBootSettings = { row: boot.settings ?? null, at: Date.now() }

  cached = { session, profile, tenantId: profile.tenant_id, profileId: profile.id, stores: (boot.stores ?? []).filter((s) => s.active !== false) }
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
  // 오늘 근무 기록 — 고정 근무지가 있거나 예외 출근 중이면 앱을 여는 것만으로 한 줄 남는다.
  // 직원이 따로 누를 것은 없다. 순환 근무자(고정 근무지 없음)는 매장을 고른 뒤
  // index.html 의 오늘 매장 선택에서 남긴다.
  // 화면을 붙잡지 않도록 기다리지 않는다 — 실패해도 앱 사용에는 지장이 없다.
  if (window.__vflowProfile.storeId) {
    supabase.rpc('record_workday', { target_store: null }).then(({ error }) => {
      if (error) console.warn('[adapter] 근무 기록 실패', error)
    })
  }

  // 최종점검: 테넌트(회사) 이름 — 헤더/문서 제목 브랜딩용
  window.__vflowTenant = { id: profile.tenant_id, name: tenantRes.data?.name ?? '', isPlatform: !!tenantRes.data?.is_platform }
  // 운영사(V-Flow 본사) 테넌트만 쓰는 기능 판별 — 가맹 초대 코드 등
  window.__vflowProfile.isPlatform = !!tenantRes.data?.is_platform
  return cached
}
