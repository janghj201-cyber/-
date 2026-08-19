// V-Flow 동의 체계 — 문서·버전·체크 UI·저장·재동의 (설치 마법사 / 초대 가입 / 앱 로그인 공용)
// 문서 본문은 legal.html에서 전체 열람. 여기엔 요약·버전·항목 정의.
import { supabase } from './adapter/supabase-client.js'

export const OPERATOR = { name: 'V-Flow 운영사 (상호·사업자번호·주소·연락처 입력 필요)', contact: 'support@vflow.kr' }

// 문서 버전 — 문구가 바뀌면 날짜를 올린다 → 필수 항목은 다음 로그인 때 재동의
export const CONSENT_DOCS = {
  terms:         { version: '2026-08-15', title: 'V-Flow 이용약관',                       required: true,  subject: 'tenant' },
  privacy:       { version: '2026-08-15', title: '개인정보처리방침',                       required: true,  subject: 'both'   },
  insights:      { version: '2026-08-15', title: '비식별 사용 데이터 활용 동의',           required: true,  subject: 'tenant' },
  benchmark:     { version: '2026-08-15', title: '업종 벤치마크 리포트 수신 (제공 시)',    required: false, subject: 'tenant' },
  marketing:     { version: '2026-08-15', title: '서비스 소식·혜택 안내 수신',             required: false, subject: 'tenant' },
  staff_privacy: { version: '2026-08-15', title: '개인정보 수집·이용 동의',               required: true,  subject: 'staff'  },
  staff_insights:{ version: '2026-08-15', title: '비식별 사용 데이터 활용 동의',           required: false, subject: 'staff'  },
}
export const TENANT_KEYS = ['terms', 'privacy', 'insights', 'benchmark', 'marketing']
export const STAFF_KEYS  = ['staff_privacy', 'privacy', 'staff_insights']

const SUMMARY = {
  terms: '서비스 이용 계약. 업장이 입력한 운영 데이터의 소유권은 업장에 있고, V-Flow는 서비스 제공 목적으로만 처리하며 다른 업장에 공개하지 않습니다.',
  privacy: '어떤 개인정보를 왜, 얼마나 보관하는지. 업장은 직원 개인정보의 처리 책임자, V-Flow는 수탁자입니다.',
  insights: '개인·업장을 식별할 수 없게 집계한 사용 건수·비율만 수집합니다(업무·인수인계 원문, 이름, 업장명은 수집하지 않음). 서비스 개선·업종 통계 목적.',
  benchmark: '같은 업종·비슷한 규모 업장 평균과 비교한 리포트를, 비교 데이터가 충분히 모이면 제공할 예정이며 제공 시 받아봅니다.',
  marketing: '신기능·이벤트 안내를 이메일/푸시로 받습니다. 언제든 철회 가능.',
  staff_privacy: '이메일·이름·소속·역할·사번과 근무 기록(업무·인수인계·청소·휴무·요청·게시판)을 소속 업장의 매장 운영 목적으로 저장합니다. 업장 관리자가 열람합니다.',
  staff_insights: '내 사용 건수가 개인을 식별할 수 없는 통계에 포함되는 것에 동의합니다. 거부해도 이용에 제한 없음.',
}

// ── 체크 UI 렌더 ──
// mount: 컨테이너 element, keys: 항목 키 배열, onChange(allRequiredChecked)
export function renderConsentBox(mount, keys, onChange) {
  mount.innerHTML = ''
  mount.style.cssText = 'border:1px solid #e8e4dc;border-radius:10px;padding:10px 12px;margin:10px 0;background:#fbfaf6;font-size:13px;'
  const all = document.createElement('label')
  all.style.cssText = 'display:flex;align-items:center;gap:8px;font-weight:800;padding-bottom:8px;border-bottom:1px solid #e8e4dc;margin-bottom:6px;cursor:pointer;'
  all.innerHTML = '<input type="checkbox" data-all style="width:18px;height:18px;accent-color:#f5a623;"> 전체 동의'
  mount.appendChild(all)
  keys.forEach((k) => {
    const d = CONSENT_DOCS[k]
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:6px 0;'
    row.innerHTML = `<input type="checkbox" data-key="${k}" style="width:18px;height:18px;accent-color:#f5a623;margin-top:1px;flex-shrink:0;">
      <div style="flex:1;min-width:0;"><div style="font-weight:700;"><span style="font-size:10.5px;font-weight:800;border-radius:5px;padding:1px 6px;margin-right:5px;${d.required ? 'background:#fdecea;color:#c0392b;' : 'background:#e8f0fb;color:#1a5fb5;'}">${d.required ? '필수' : '선택'}</span>${d.title}</div>
      <div style="font-size:11.5px;color:#6b7a8d;margin-top:2px;line-height:1.45;">${SUMMARY[k]}</div></div>
      <a href="legal.html#${k}" target="_blank" style="font-size:11.5px;color:#1a5fb5;white-space:nowrap;font-weight:700;">보기</a>`
    mount.appendChild(row)
  })
  const boxes = [...mount.querySelectorAll('input[data-key]')]
  const allBox = mount.querySelector('input[data-all]')
  const fire = () => {
    const ok = keys.every((k) => !CONSENT_DOCS[k].required || mount.querySelector(`input[data-key="${k}"]`).checked)
    allBox.checked = boxes.every((b) => b.checked)
    onChange && onChange(ok)
  }
  boxes.forEach((b) => (b.onchange = fire))
  allBox.onchange = () => { boxes.forEach((b) => (b.checked = allBox.checked)); fire() }
  fire()
  return { values: () => Object.fromEntries(keys.map((k) => [k, mount.querySelector(`input[data-key="${k}"]`).checked])) }
}

// ── 저장 ── values: {key: bool}, subject: 'tenant'|'staff'
export async function saveConsents(tenantId, profileId, subject, values) {
  const rows = Object.entries(values).map(([k, agreed]) => ({
    tenant_id: tenantId, profile_id: profileId, subject, doc_key: k, doc_version: CONSENT_DOCS[k].version,
    agreed: !!agreed, user_agent: (navigator.userAgent || '').slice(0, 200),
  }))
  const { error } = await supabase.from('consents').insert(rows)
  if (error) throw error
  // 직원 비식별 거부 → 프로필 플래그 (집계 제외)
  if ('staff_insights' in values) {
    await supabase.from('profiles').update({ insights_opt_out: !values.staff_insights }).eq('id', profileId)
  }
}

// ── 현재 상태 조회 (최신 행 기준) ──
export async function loadConsentState(profileId) {
  const { data, error } = await supabase.from('consents').select('doc_key,doc_version,agreed,agreed_at,withdrawn_at').eq('profile_id', profileId).order('agreed_at', { ascending: false })
  if (error) throw error
  const st = {}
  for (const r of data ?? []) if (!st[r.doc_key]) st[r.doc_key] = r
  return st
}

// ── 재동의 필요 여부: 필수 항목 중 최신 버전 동의가 없는 키 목록 ──
export async function missingRequired(profileId, role) {
  const keys = role === 'owner' ? TENANT_KEYS : STAFF_KEYS
  const st = await loadConsentState(profileId)
  return keys.filter((k) => CONSENT_DOCS[k].required && !(st[k] && st[k].agreed && st[k].doc_version === CONSENT_DOCS[k].version && !st[k].withdrawn_at))
}

// ── 선택 항목 철회/재동의 (설정 → 내 동의 관리) ──
export async function setOptional(tenantId, profileId, subject, key, agreed) {
  const { error } = await supabase.from('consents').insert({ tenant_id: tenantId, profile_id: profileId, subject, doc_key: key, doc_version: CONSENT_DOCS[key].version, agreed: !!agreed, withdrawn_at: agreed ? null : new Date().toISOString() })
  if (error) throw error
  if (key === 'staff_insights') await supabase.from('profiles').update({ insights_opt_out: !agreed }).eq('id', profileId)
}

// ── 재동의 모달 (index.html 로그인 후) ──
export async function showReconsentModal(tenantId, profileId, role, missing) {
  return new Promise((resolve) => {
    const ov = document.createElement('div')
    ov.style.cssText = 'position:fixed;inset:0;z-index:990;background:rgba(20,28,42,0.6);display:flex;align-items:center;justify-content:center;padding:18px;'
    const card = document.createElement('div')
    card.style.cssText = 'background:#fff;border-radius:18px;max-width:460px;width:100%;max-height:86vh;overflow-y:auto;padding:18px 16px;box-shadow:0 18px 60px rgba(0,0,0,0.35);font-family:inherit;'
    card.innerHTML = `<div style="font-size:16px;font-weight:800;">📄 동의가 필요해요</div>
      <div style="font-size:12px;color:#6b7a8d;margin-top:3px;">계속 이용하려면 아래 필수 항목에 동의해주세요. (약관이 업데이트됐거나 아직 동의 전입니다)</div>
      <div data-box></div>
      <button data-ok disabled style="display:block;width:100%;margin-top:10px;background:#1a2332;color:#f5a623;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;opacity:.5;">동의하고 계속</button>`
    const keys = role === 'owner' ? TENANT_KEYS : STAFF_KEYS
    const okBtn = card.querySelector('[data-ok]')
    const box = renderConsentBox(card.querySelector('[data-box]'), keys, (ok) => { okBtn.disabled = !ok; okBtn.style.opacity = ok ? '1' : '.5' })
    okBtn.onclick = async () => {
      okBtn.disabled = true; okBtn.textContent = '저장 중...'
      try { await saveConsents(tenantId, profileId, role === 'owner' ? 'tenant' : 'staff', box.values()); ov.remove(); resolve(true) }
      catch (e) { okBtn.disabled = false; okBtn.textContent = '동의하고 계속'; alert('저장 실패 — 네트워크를 확인해주세요') }
    }
    ov.appendChild(card); document.body.appendChild(ov)
  })
}
