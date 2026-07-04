"""
위베이프 월간 보고 스크립트 v2.0
- 직원별 운영 점수 + 유형 분류
- 베스트 직원/매장 TOP 3
- 관리자 전용 상세 분석
- 게시판 자동 공지 (순위만, 점수 없음)
"""
import os
import calendar
import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta

FIREBASE_API_KEY = os.environ["FIREBASE_API_KEY"]
PROJECT_ID = "wevape-schedule"
BASE_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

GMAIL_USER = os.environ["GMAIL_USER"]
GMAIL_APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]
REPORT_TO = os.environ["REPORT_TO_EMAIL"]

STORES = [
    {"id": "yeonsu",    "name": "인천 연수점",   "icon": "🏪"},
    {"id": "nonhyeon",  "name": "인천 논현점",   "icon": "🏬"},
    {"id": "rodeo",     "name": "구월 로데오점", "icon": "🎯"},
    {"id": "gilbyeong", "name": "구월 길병원점", "icon": "🏥"},
    {"id": "airport",   "name": "인천공항점",    "icon": "✈️"},
    {"id": "geomdan",   "name": "검단점",        "icon": "🌱"},
    {"id": "gyesan",    "name": "계산점",        "icon": "🏙️"},
    {"id": "sangdong",  "name": "부천 상동점",   "icon": "🌿"},
    {"id": "sijungdong","name": "부천 신중동점", "icon": "⭐"},
]

STAFF = [
    "오명록","고아현","장현진","장대운","신재현","정희경",
    "조효정","홍다운","이종혁","원주현","김형진","윤하람",
    "차영근","정유진","안태민","김다정"
]


def fb_get(path):
    url = f"{BASE_URL}/{path}?key={FIREBASE_API_KEY}"
    try:
        r = requests.get(url, timeout=15)
        if r.status_code != 200:
            return None
        data = r.json()
        if "fields" not in data:
            return None
        return parse_fields(data["fields"])
    except Exception:
        return None


def parse_value(v):
    if "stringValue" in v: return v["stringValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "nullValue" in v: return None
    if "arrayValue" in v:
        return [parse_value(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v:
        return parse_fields(v["mapValue"].get("fields", {}))
    return None


def parse_fields(fields):
    return {k: parse_value(v) for k, v in fields.items()}


def fb_post(path, body):
    """Firestore 문서 PATCH (업서트)"""
    url = f"{BASE_URL}/{path}?key={FIREBASE_API_KEY}"
    try:
        r = requests.patch(url, json=body, timeout=15)
        return r.status_code == 200
    except Exception:
        return False


def get_prev_month_dates():
    today = datetime.now()
    first = today.replace(day=1)
    last_prev = first - timedelta(days=1)
    year, month = last_prev.year, last_prev.month
    num_days = calendar.monthrange(year, month)[1]
    dates = [f"{year}-{month:02d}-{d:02d}" for d in range(1, num_days+1)]
    return dates, year, month


def analyze_staff(name, dates):
    """직원 한 명의 월간 데이터 분석"""
    total_todos = 0
    done_todos = 0
    carry_count = 0
    carry_done = 0
    kept_count = 0      # 보관 처리된 미완료
    diff_store_carry = 0  # 다른 매장으로 이월된 업무
    used_days = 0
    handover_written = 0
    handover_confirmed = 0

    for date_key in dates:
        todos = []
        data = fb_get(f"staff_todos/{name}_{date_key}")
        if data and "items" in data:
            todos = data["items"] or []

        if todos:
            used_days += 1
            total_todos += len(todos)
            done_todos += sum(1 for t in todos if t.get("done"))

            for t in todos:
                if t.get("fromDate") and t.get("fromDate") != date_key:
                    carry_count += 1
                    if t.get("done"):
                        carry_done += 1
                    if t.get("kept"):
                        kept_count += 1
                    # 이월됐는데 원래 매장과 현재 날짜 매장이 다른 경우
                    # (순환근무자의 다른 매장 이월)
                    from_date = t.get("fromDate","")
                    from_data = fb_get(f"staff_todos/{name}_{from_date}") if from_date else None
                    if from_data and from_data.get("items"):
                        orig = next((x for x in from_data["items"] if x.get("id")==t.get("id")), None)
                        if orig and orig.get("storeId") != t.get("storeId"):
                            diff_store_carry += 1

    # 인수인계 확인률 (작성한 것 기준)
    for date_key in dates:
        data = fb_get(f"handover/{name}_{date_key}")  # 본인이 작성한 것
        if data and "items" in data:
            items = data["items"] or []
            mine = [i for i in items if i.get("author") == name]
            handover_written += len(mine)
            handover_confirmed += sum(1 for i in mine if i.get("confirmed"))

    # 프로젝트
    proj_data = fb_get(f"staff_projects/{name}")
    projects = proj_data.get("items", []) if proj_data else []
    ongoing = len([p for p in projects if not p.get("done")])
    completed = len([p for p in projects if p.get("done")])

    # 점수 계산 (100점 만점)
    completion_rate = done_todos / total_todos if total_todos > 0 else 0
    participation_rate = used_days / len(dates) if dates else 0
    handover_rate = handover_confirmed / handover_written if handover_written > 0 else 1.0

    # 업무 충실도: 입력량 + 완료율 복합 (미완료 자체는 감점 없음)
    input_score = min(total_todos // 3, 12)
    comp_score = int(completion_rate * 13)
    score_completion = input_score + comp_score  # 최대 25점

    # 참여도
    score_participation = int(participation_rate * 20)  # 최대 20점

    # 책임감: 이월 후 처리율 (완료 + 보관 모두 인정, 보관은 합리적 이유 있는 미완료)
    carry_resolved = carry_done + kept_count
    carry_rate = carry_resolved / carry_count if carry_count > 0 else 1.0
    score_responsibility = int(carry_rate * 20)  # 최대 20점

    # 주도성: 프로젝트
    score_project = min(ongoing * 5 + completed * 3, 20)  # 최대 20점

    # 협력도: 인수인계
    score_handover = int(handover_rate * 15)  # 최대 15점

    total_score = score_completion + score_participation + score_responsibility + score_project + score_handover

    # 유형 분류
    if not used_days:
        staff_type = "📵 미참여형"
    elif ongoing >= 1 and completion_rate >= 0.8:
        staff_type = "🌟 주도형"
    elif completion_rate >= 0.8 and carry_count <= 2:
        staff_type = "✅ 성실형"
    elif total_todos >= 10 and completion_rate < 0.5:
        staff_type = "📋 형식형"
    elif used_days <= len(dates) * 0.3:
        staff_type = "📵 미참여형"
    else:
        staff_type = "📌 일반형"

    return {
        "name": name, "score": total_score, "type": staff_type,
        "used_days": used_days, "total_days": len(dates),
        "total_todos": total_todos, "done_todos": done_todos,
        "completion_rate": completion_rate,
        "carry_count": carry_count, "carry_done": carry_done,
        "carry_rate": carry_rate, "kept_count": kept_count,
        "diff_store_carry": diff_store_carry,
        "handover_rate": handover_rate,
        "ongoing_projects": ongoing, "completed_projects": completed,
        "scores": {
            "충실도": score_completion, "참여도": score_participation,
            "책임감": score_responsibility, "주도성": score_project,
            "협력도": score_handover
        }
    }


def analyze_store(store, dates):
    """매장 월간 데이터 분석"""
    sid = store["id"]
    clean_days = 0
    clean_total_days = 0
    todo_total = 0
    todo_done = 0
    handover_total = 0
    handover_confirmed = 0

    for date_key in dates:
        # 청소
        data = fb_get(f"checks/{sid}/{date_key}/clean")
        if data:
            keys = [k for k in data.keys() if k.startswith("item_")]
            if keys:
                clean_total_days += 1
                if all(data.get(k) for k in keys):
                    clean_days += 1

        # 직원 업무 (이 매장 태그된 것)
        for name in STAFF:
            todos_data = fb_get(f"staff_todos/{name}_{date_key}")
            if todos_data and "items" in todos_data:
                mine = [t for t in (todos_data["items"] or []) if t.get("storeId") == sid]
                todo_total += len(mine)
                todo_done += sum(1 for t in mine if t.get("done"))

        # 인수인계
        ho_data = fb_get(f"handover/{sid}_{date_key}")
        if ho_data and "items" in ho_data:
            items = ho_data["items"] or []
            handover_total += len(items)
            handover_confirmed += sum(1 for i in items if i.get("confirmed"))

    clean_rate = clean_days / clean_total_days if clean_total_days > 0 else 0
    todo_rate = todo_done / todo_total if todo_total > 0 else 0
    handover_rate = handover_confirmed / handover_total if handover_total > 0 else 1.0

    score = int(clean_rate * 40 + todo_rate * 40 + handover_rate * 20)

    return {
        "name": store["name"],
        "icon": store["icon"],
        "score": score,
        "clean_rate": clean_rate,
        "clean_days": clean_days,
        "clean_total_days": clean_total_days,
        "todo_rate": todo_rate,
        "todo_total": todo_total,
        "todo_done": todo_done,
        "handover_rate": handover_rate,
    }


def post_board_notice(year, month, best_staff, best_stores):
    """게시판에 베스트 순위 공지 자동 등록 (점수 없음)"""
    month_label = f"{year}년 {month}월"
    medals = ["🥇", "🥈", "🥉"]

    body = f"{month_label} 한 달 동안 수고하셨습니다!\n\n"
    body += "🏆 이달의 베스트 직원\n"
    for i, s in enumerate(best_staff[:3]):
        body += f"{medals[i]} {s['name']}\n"
    body += "\n🏆 이달의 베스트 매장\n"
    for i, s in enumerate(best_stores[:3]):
        body += f"{medals[i]} {s['name']}\n"
    body += "\n모두 수고 많으셨습니다 👏"

    import time
    post_id = str(int(time.time() * 1000))
    now = datetime.now()
    date_str = f"{now.month}/{now.day} {now.hour:02d}:{now.minute:02d}"

    # 기존 게시글 로드
    existing = fb_get("board/posts")
    items = existing.get("items", []) if existing else []

    new_post = {
        "id": post_id,
        "cat": "notice",
        "title": f"🏆 {month_label} 이달의 베스트 직원 & 매장",
        "body": body,
        "author": "관리자",
        "date": date_str
    }

    def to_value(v):
        if isinstance(v, bool): return {"booleanValue": v}
        return {"stringValue": str(v)}

    def to_map(d):
        return {"mapValue": {"fields": {k: to_value(v) for k, v in d.items()}}}

    all_posts = [new_post] + items
    firestore_body = {
        "fields": {
            "items": {
                "arrayValue": {
                    "values": [to_map(p) for p in all_posts]
                }
            }
        }
    }

    url = f"{BASE_URL}/board/posts?key={FIREBASE_API_KEY}"
    try:
        r = requests.patch(url, json=firestore_body, timeout=15)
        return r.status_code == 200
    except Exception:
        return False


def build_monthly_report():
    dates, year, month = get_prev_month_dates()
    month_label = f"{year}년 {month}월"
    medals = ["🥇", "🥈", "🥉"]

    lines = []
    lines.append(f"📊 위베이프 월간 보고  |  {month_label}")
    lines.append("━" * 40)
    lines.append("")

    # ── 직원 분석 ─────────────────────────────
    lines.append("👤 직원별 운영 분석 (관리자 전용)")
    lines.append("")

    staff_results = []
    for name in STAFF:
        result = analyze_staff(name, dates)
        staff_results.append(result)

    # 점수 기준 정렬
    staff_sorted = sorted(staff_results, key=lambda x: x["score"], reverse=True)
    active_staff = [s for s in staff_sorted if s["used_days"] > 0]

    for s in staff_sorted:
        bar = "█" * (s["score"]//10) + "░" * (10 - s["score"]//10)
        comp = int(s["completion_rate"] * 100)
        part = int(s["used_days"] / s["total_days"] * 100) if s["total_days"] > 0 else 0

        lines.append(f"{s['type']}  {s['name']}  [{bar}]  {s['score']}점")
        lines.append(f"   └ 업무 {s['total_todos']}건 입력 → {s['done_todos']}건 완료 ({comp}%)")
        lines.append(f"   └ 참여율 {part}%  ({s['used_days']}/{s['total_days']}일)")
        if s["carry_count"] > 0:
            carry_info = f"이월 {s['carry_count']}건 → 완료 {s['carry_done']}건"
            if s["kept_count"] > 0:
                carry_info += f" · 보관 {s['kept_count']}건 (순환근무 등 합리적 사유)"
            if s["diff_store_carry"] > 0:
                carry_info += f" · 다른매장 이월 {s['diff_store_carry']}건"
            lines.append(f"   └ {carry_info}")
        if s["ongoing_projects"] or s["completed_projects"]:
            lines.append(f"   └ 프로젝트 진행중 {s['ongoing_projects']}건 · 완료 {s['completed_projects']}건")
        sc = s['scores']
        lines.append(f"   └ 세부: 충실도{sc['충실도']} 참여도{sc['참여도']} 책임감{sc['책임감']} 주도성{sc['주도성']} 협력도{sc['협력도']}")
        lines.append("")

    lines.append("")

    # ── 매장 분석 ─────────────────────────────
    lines.append("🏪 매장별 운영 분석")
    lines.append("")

    store_results = []
    for store in STORES:
        result = analyze_store(store, dates)
        store_results.append(result)

    store_sorted = sorted(store_results, key=lambda x: x["score"], reverse=True)

    for s in store_sorted:
        bar = "█" * (s["score"]//10) + "░" * (10 - s["score"]//10)
        lines.append(f"{s['icon']} {s['name']}  [{bar}]  {s['score']}점")
        lines.append(f"   └ 청소완료율 {int(s['clean_rate']*100)}% ({s['clean_days']}/{s['clean_total_days']}일)")
        lines.append(f"   └ 업무완료율 {int(s['todo_rate']*100)}% ({s['todo_done']}/{s['todo_total']}건)")
        lines.append(f"   └ 인수인계확인률 {int(s['handover_rate']*100)}%")
        lines.append("")

    # ── 베스트 TOP 3 ──────────────────────────
    lines.append("━" * 40)
    lines.append(f"🏆 {month_label} 베스트 직원 TOP 3")
    lines.append("")
    for i, s in enumerate(active_staff[:3]):
        lines.append(f"{medals[i]} {s['name']}  {s['type']}  {s['score']}점")
        comp = int(s['completion_rate']*100)
        lines.append(f"   업무완료 {comp}% · 참여 {s['used_days']}일 · 프로젝트 {s['ongoing_projects']+s['completed_projects']}건")
    lines.append("")

    lines.append(f"🏆 {month_label} 베스트 매장 TOP 3")
    lines.append("")
    for i, s in enumerate(store_sorted[:3]):
        lines.append(f"{medals[i]} {s['name']}  {s['score']}점")
        lines.append(f"   청소 {int(s['clean_rate']*100)}% · 업무 {int(s['todo_rate']*100)}% · 인수인계 {int(s['handover_rate']*100)}%")
    lines.append("")

    # ── AI 인사이트 ───────────────────────────
    lines.append("━" * 40)
    lines.append("💡 월간 운영 인사이트")
    lines.append("")

    # 미참여자
    no_show = [s for s in staff_results if s["used_days"] == 0]
    if no_show:
        lines.append(f"• 앱 미사용 직원: {', '.join(s['name'] for s in no_show)} — 현장 확인 필요")

    # 이월 누적 많은 직원
    heavy_carry = [s for s in staff_results if s["carry_count"] >= 5]
    if heavy_carry:
        lines.append(f"• 이월 누적 5건 이상: {', '.join(s['name'] for s in heavy_carry)} — 업무 부하 점검")

    # 형식형 직원
    formal = [s for s in staff_results if s["type"] == "📋 형식형"]
    if formal:
        lines.append(f"• 입력 대비 완료율 저조: {', '.join(s['name'] for s in formal)} — 실행력 점검")

    # 주도형 직원 칭찬
    leaders = [s for s in staff_results if s["type"] == "🌟 주도형"]
    if leaders:
        lines.append(f"• 이달 주도적 활약: {', '.join(s['name'] for s in leaders)} — 우수 사례 공유 권장")

    # 청소 미흡 매장
    clean_issues = [s for s in store_results if s["clean_rate"] < 0.8]
    if clean_issues:
        lines.append(f"• 청소 수행률 80% 미만: {', '.join(s['name'] for s in clean_issues)}")

    lines.append("")
    lines.append("━" * 40)
    lines.append(f"📱 위베이프 운영 시스템  |  자동 발송")

    # 게시판 공지 자동 등록
    posted = post_board_notice(year, month, active_staff, store_sorted)
    if posted:
        lines.append("✅ 게시판 베스트 공지 자동 등록 완료")
    else:
        lines.append("⚠️ 게시판 공지 등록 실패 (수동 등록 필요)")

    return "\n".join(lines), month_label


def send_email(subject, body):
    msg = MIMEMultipart()
    msg["From"] = GMAIL_USER
    msg["To"] = REPORT_TO
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))
    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.send_message(msg)


if __name__ == "__main__":
    report_text, month_label = build_monthly_report()
    subject = f"[위베이프 월간보고] {month_label}"
    send_email(subject, report_text)
    print("✅ 월간 보고 발송 완료")
    print(report_text)
