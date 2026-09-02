# V-Flow — 작업 규칙

이 파일은 매 세션 시작 시 자동으로 읽힌다. **판단하기 전에 여기부터 확인한다.**

---

## 0. 가장 중요한 규칙

**기억이나 이전 메모를 근거로 코드의 동작·기능 유무를 단정하지 않는다.**

말하기 전에 실제 파일을 연다. 특히 아래 세 가지는 반드시 확인 후에 말한다.

- "이 기능은 없다 / 있다"
- "이렇게 되어 있다"
- "이건 못 한다"

근거가 코드면 **"확인했습니다"**, 기억이면 **"제 기억으로는"** 이라고 밝힌다. 둘을 섞지 않는다.

실제로 이 규칙을 어겨서 세 번 틀린 적이 있다.
매장 수(6 대 9), 온보딩 마법사 유무, 업종 템플릿 유무. 전부 파일 한 번 열면 끝날 일이었다.

---

## 1. 연결된 폴더는 두 개다

작업 시작 시 `ls ~/mnt/` 로 **전부** 확인한다. 한쪽만 보고 판단하지 않는다.

| 폴더 | 정체 | 상태 |
|---|---|---|
| `-` | **실제 운영 중인 저장소.** 여기서 개발하고 배포한다 | 커밋 275, 매일 갱신 |
| `vflow-prod` | 초기 SaaS 재설계 시도(Vite 기반). 멈춤 | 커밋 34, **2026-07-20 이후 정지** |

### `vflow-prod` 안의 참고 자료

- `V-Flow_기획정리.md` — **기획 의도의 근거.** 무엇을 왜 만들기로 했는지가 여기 있다
- `seed_industry_templates.sql` — 업종 템플릿 시드 (cafe / convenience / beauty / academy / etc)
- `vflow_porting_checklist_v2.md` — 이식 계획
- `schema.sql` — ⚠️ **2026-07-20 기준이라 낡았다.** 8월 이후 만든
  `is_platform` `work_sessions` `project_members` `store_override_id`
  `collab_projects` `signup_codes` `weekly_reports` 가 **전부 없다.**
  **스키마·RLS 정책은 이 파일이 아니라 Supabase에서 직접 조회해 확인한다.**

---

## 2. 제품 원칙 — 기획서 기준

`V-Flow_기획정리.md` 에 명시된 것. 임의로 좁히지 않는다.

- **업종 무관 소상공인용 SaaS.** 전자담배 전용이 아니다
- 타겟: 직원 5~30명 · 매장 2~10개
- 청소 항목·고정업무·평가지표는 **고객이 직접 고치는 것(DIY)** 이 전제
- 온보딩 마법사(`onboarding.html`)로 **고객 혼자 가입 → 세팅 → 사용**이 되어야 한다
- 멀티테넌트: 모든 업무 테이블에 `tenant_id` + RLS (`current_tenant_id()`)

---

## 3. 절대 하지 않는 것

- **비밀번호 · API 키 · 토큰 값을 다루지 않는다.** 사장님이 직접 입력한다
- **SQL을 대신 실행하지 않는다.** 카드로 만들어 드리고 사장님이 직접 RUN 한다
- **기록을 고치지 않는다.** git 커밋 시각, 로그, 증빙 문서를 유리하게 조작하지 않는다
- "바로 적용하지 말고 상의만" 이라고 하시면 **구현하지 않는다**

---

## 4. 작업 절차

### 순서는 항상 이것

```
SQL 카드 (사장님이 직접 RUN)  →  배포.bat
```

앱 코드가 새 테이블·함수를 쓰면 **SQL이 먼저**다. 순서를 명시해서 알려드린다.

### 배포

`배포.bat` = `git push origin feat/supabase-adapter`
**main 이 아니라 `feat/supabase-adapter` 브랜치다.**

### 파일 편집

- `index.html` 은 **CRLF**. `adapter/*.js` 는 **LF**
- 파이썬 텍스트 모드로 읽으면 `\r\n` 이 자동 변환돼 감지가 빗나간다.
  **바이너리로 읽어 `b.count(b'\r')` 로 판별**하고, 쓸 때 원래대로 되돌린다
- 치환은 `assert s.count(old)==1` 로 확인 후 적용한다
- 편집 후 `git diff --stat` 으로 의도한 범위만 바뀌었는지 본다

### 검증

- `index.html` 은 `<script type="module">` 블록을 뽑아 `node --check`
- 어댑터는 파일 그대로 `node --check`

### git lock

`.git/*.lock` 을 unlink 할 수 없다. git 명령 **전후로** `_to_delete/` 로 옮긴다.

```bash
for f in .git/index.lock .git/HEAD.lock; do [ -e "$f" ] && mv "$f" _to_delete/; done
```

### 커밋 메시지

무엇을 고쳤는지가 아니라 **왜 그게 문제였는지**를 적는다.

---

## 5. 기능을 바꿀 때

- `GUIDE_VERSION` 을 올리고 `GUIDE_SECTIONS` 맨 위에 항목을 추가한다
- 다만 **사소한 것까지 올리지는 않는다.** 사용자가 체감하는 변화만
- 일일 업무 리스트업을 요청하시면 **괄호 없는 아주 짧은 평문 줄**만

---

## 6. 구조 메모

- `adapter/firebase-shim.js` — 원본의 `getDoc/setDoc` 경로를 Supabase 테이블로 옮기는 층
- `adapter/context.js` — 로그인 세션 → tenant/profile. `window.__vflowProfile` 을 여기서 만든다
- 프로젝트는 **`projects` 한 테이블**이다. 여럿이 하는 일과 혼자 하는 일을 나누는 것은
  종류가 아니라 `project_members` 유무다 (2026-08-30 통합)
- 매장에 안 묶인 프로젝트 라벨은 **`🏢 회사 전체`**. 「전사」라는 말은 쓰지 않는다
