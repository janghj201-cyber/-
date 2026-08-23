# W-Voice ↔ V-Flow 직원·매장 매핑 표 v1.1

작성: V-Flow 개발 담당(v1.0) → W-Voice 개발 담당 기입 완료(v1.1) · 승인: 장현진 · 2026-08-23
성격: **B안(V-Flow 프로젝트 기준 통합) 실행 시까지 유지 관리하는 유일한 과도기 산출물.**
실행 창구: 감독관 절차 종료 후 ~ W-Voice 2차(음성→텍스트) 착수 전.

> 사용 규칙: 양쪽 방 모두 이 문서를 기준으로 한다. 직원 입·퇴사, 매장 추가 시
> 이 문서를 갱신하고 버전을 올린다(v1.2 …).
> v1.1에서 W-Voice 열 전체 확정 (2026-08-23 wevape-wvoice 프로덕션 DB 조회값).

---

## 1. 직원 매핑 (5명) — 양측 확정

| 이름 | V-Flow 사번 | V-Flow profile_uuid | V-Flow 역할/근무지 | W-Voice employee_uuid | W-Voice 가상계정 | W-Voice 역할/근무지 |
|---|---|---|---|---|---|---|
| 장현진 | WV-002 | b4996850-c98e-4f4c-a116-c4c670ab7bff | owner · 전 지점 순환 | f3a74833-2989-4f86-bd94-4e3da8d0fdbb | admin@wvoice.app | admin · 전 지점 순환 |
| 오명록 | WV-003 | 6bd578d6-d875-46fd-827a-3c16dddce680 | staff · 인천 연수점 | 4c26924a-8a64-440f-9db3-baa50850a873 | s002@wvoice.app | staff · 연수 |
| 김형진 | WV-005 | 30fdb219-84ad-456e-9f96-21240e46bc01 | manager · 전 지점 순환 | eaa60737-758e-4b80-a952-800b3f5461fd | s004@wvoice.app | staff · 전 지점 순환 |
| 장대운 | WV-008 | 846b9478-b0c0-47f1-b359-0a846b5a0754 | staff · 구월 길병원점 | 8bc6a170-19fc-4b07-9e42-5bf2353e43d3 | s003@wvoice.app | staff · 구월 길병원 |
| 고아현 | WV-010 | 7c63594a-8421-4d98-b584-6f161bd785ff | manager · 인천 논현점 | eb9a0d81-2895-4eb3-ae3a-30104582f91b | s001@wvoice.app | staff · 논현 |

정합성 확인 (양측 검증 완료):
- 근무지 일치 — 오명록=연수, 장대운=구월 길병원, 고아현=논현, 김형진·장현진=순환(is_roving)
- 역할 대응 — W-Voice admin=장현진(V-Flow owner). 김형진·고아현은 V-Flow manager /
  W-Voice staff → 통합 시 V-Flow role 기준 적용 여부는 통합 명세에서 결정 (경미)
- 이름 동명이인 없음

## 2. 매장 매핑 (W-Voice 9 ↔ V-Flow 6) — W-Voice 측 확정

| W-Voice 매장명 | W-Voice code | W-Voice store_uuid | V-Flow 매장명 | V-Flow store_uuid |
|---|---|---|---|---|
| 위베이프 인천 연수점 | yeonsu | b07985e5-456c-44eb-a304-b670d2f340a5 | 인천 연수점 | [실행 시 확정] |
| 위베이프 인천 논현점 | nonhyeon | cb75b6cd-ff74-4e7c-b56c-7976301add3f | 인천 논현점 | [실행 시 확정] |
| 위베이프 인천 구월 로데오점 | guwol-rodeo | c01dc851-4246-427e-b59c-49f3991dfbfe | 인천 구월 로데오점 | [실행 시 확정] |
| 위베이프 인천 구월 길병원점 | guwol-gil | e065ace2-87aa-405d-98f5-dbfdcfe31de7 | 구월 길병원점 | [실행 시 확정] |
| 위베이프 부천 상동점 | sangdong | 80760e8d-bfe3-4679-89a8-ffaac2f8df37 | 부천 상동점 | [실행 시 확정] |
| 위베이프 부천 신중동점 | sinjungdong | f7eac3e0-19b2-4535-ae34-183c96fd3347 | 부천 신중동점 | [실행 시 확정] |
| 위베이프 인천공항점 | incheon-airport | 184026b3-5196-402d-aa28-c074a0c1c136 | — V-Flow 미등록 | 필요 시 설정→매장 관리에서 추가 |
| 위베이프 계산점 | gyesan | f0cd4cd8-c769-4d31-b8da-4f5ae3a6dfc3 | — V-Flow 미등록 | 동일 |
| 위베이프 검단점 | geomdan | dbc31c86-88a4-433d-8c40-e77a8537ace6 | — V-Flow 미등록 | 동일 |

비고: W-Voice 9개 지점 전부 활성(is_active=true). V-Flow store_uuid는 통합 실행
시점의 조회값으로 채운다 (v1.0의 방침 유지). W-Voice 명칭은 "위베이프 ○○점" 형식,
V-Flow는 "○○점" 형식 — 매핑은 위 표와 code 기준으로 하고 문자열 비교는 사용하지 않는다.

## 3. 통합 실행 시 이 표의 용도 (v1.0 그대로)

1. recordings.employee_id (W-Voice uuid) → V-Flow profile_uuid 로 치환 이관
2. recordings.store_id (W-Voice uuid) → V-Flow store_uuid 로 치환 이관
3. W-Voice 가상 계정(s00x@wvoice.app) 폐기 → 직원은 기존 V-Flow 개인 계정으로 로그인
4. 감독관 요구 조건(본인 녹음만 접근 RLS, 90일 파기, 파기 이력)은 V-Flow
   프로젝트 안에 동일하게 재구현 후 감독관에 인프라 변경 보고

## 4. 현재 규모 (2026-08-23 양측 확정)

- W-Voice 녹음: 37건 · 109MB (2026-07-27 ~ 2026-08-23) — 90일 파기 정책으로
  실행 시점 이관량은 이 수준 이하 유지 전망
- V-Flow: 매장 6, 직원 계정 16, 대표 모니터링 1

---
*갱신 이력: v1.0 (2026-08-23) V-Flow 측 확정 · v1.1 (2026-08-23) W-Voice 측 uuid·계정·코드 전체 확정 — 남은 빈칸은 V-Flow store_uuid(실행 시)뿐*
