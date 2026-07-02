"""
위베이프 일일 보고 스크립트 v2.0
- staff_todos 경로 기반 직원별 업무 현황
- 매장별 청소/인수인계 현황
- 직원 참여도 분석
- 관리자 전용 AI 인사이트
"""
import os
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
    {"id": "yeonsu",    "name": "인천 연수점",    "icon": "🏪"},
    {"id": "nonhyeon",  "name": "인천 논현점",    "icon": "🏬"},
    {"id": "rodeo",     "name": "구월 로데오점",  "icon": "🎯"},
    {"id": "gilbyeong", "name": "구월 길병원점",  "icon": "🏥"},
    {"id": "airport",   "name": "인천공항점",     "icon": "✈️"},
    {"id": "geomdan",   "name": "검단점",         "icon": "🌱"},
    {"id": "gyesan",    "name": "계산점",         "icon": "🏙️"},
    {"id": "sangdong",  "name": "부천 상동점",    "icon": "🌿"},
    {"id": "sijungdong","name": "부천 신중동점",  "icon": "⭐"},
]

STAFF = [
    "오명록","고아현","장현진","장대운","신재현","정희경",
    "조효정","홍다운","이종혁","원주현","김형진","윤하람",
    "차영근","정유진","안태민","김다정"
]

STAFF_DEFAULT_STORE = {
    "오명록": "yeonsu", "고아현": "nonhyeon", "장현진": None,
    "장대운": "gilbyeong", "신재현": None, "정희경": "rodeo",
    "조효정": "rodeo", "홍다운": "sijungdong", "이종혁": "airport",
    "원주현": "sangdong", "김형진": None, "윤하람": None,
    "차영근": "geomdan", "정유진": "gyesan", "안태민": None, "김다정": "gyesan"
}


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


def get_staff_todos(name, date_key):
    """staff_todos/{name}_{date} 경로에서 직원 업무 로드"""
    data = fb_get(f"staff_todos/{name}_{date_key}")
    if not data or "items" not in data:
        return []
    return data["items"] or []


def get_clean_status(store_id, date_key):
    data = fb_get(f"checks/{store_id}/{date_key}/clean")
    if not data:
        return 0, 0
    keys = [k for k in data.keys() if k.startswith("item_")]
    total = len(keys) if keys else 6
    done = sum(1 for k in keys if data.get(k) is True)
    return done, total


def get_handover(store_id, date_key):
    data = fb_get(f"handover/{store_id}_{date_key}")
    if not data or "items" not in data:
        return []
    return data["items"] or []


def get_projects(name):
    data = fb_get(f"staff_projects/{name}")
    if not data or "items" not in data:
        return []
    return data["items"] or []


def classify_staff(todo_total, todo_done, clean_done, clean_total,
                   project_count, used_app, carry_count):
    """직원 유형 분류"""
    if not used_app:
        return "📵 미참여형"
    completion = todo_done / todo_total if todo_total > 0 else 0
    if project_count >= 1 and completion >= 0.8:
        return "🌟 주도형"
    if completion >= 0.8 and clean_done >= clean_total * 0.9:
        return "✅ 성실형"
    if todo_total >= 3 and completion < 0.5:
        return "📋 형식형"
    if clean_done >= clean_total * 0.9 and todo_total == 0:
        return "🧹 청소형"
    return "📌 일반형"


def build_daily_report():
    yesterday = datetime.now() - timedelta(days=1)
    date_key = yesterday.strftime("%Y-%m-%d")
    date_label = yesterday.strftime("%m월 %d일")
    weekday_kr = ["월","화","수","목","금","토","일"][yesterday.weekday()]

    lines = []
    lines.append(f"📋 위베이프 일일 보고  |  {date_label} ({weekday_kr})")
    lines.append("━" * 40)
    lines.append("")

    # ── 1. 매장별 현황 ──────────────────────
    lines.append("🏪 매장별 운영 현황")
    lines.append("")

    store_alerts = []
    normal_stores = []

    for store in STORES:
        sid = store["id"]
        sname = store["name"]
        icon = store["icon"]

        clean_done, clean_total = get_clean_status(sid, date_key)
        handovers = get_handover(sid, date_key)
        unconfirmed = [h for h in handovers if not h.get("confirmed")]

        # 이 매장에서 일한 직원 업무 집계
        store_todo_total = 0
        store_todo_done = 0
        store_workers = []
        for name in STAFF:
            todos = get_staff_todos(name, date_key)
            mine = [t for t in todos if t.get("storeId") == sid]
            if mine:
                store_workers.append(name)
                store_todo_total += len(mine)
                store_todo_done += sum(1 for t in mine if t.get("done"))

        clean_ok = clean_total == 0 or clean_done >= clean_total
        todo_ok = store_todo_total == 0 or (store_todo_done / store_todo_total) >= 0.8
        handover_ok = len(unconfirmed) == 0
        no_data = clean_total == 0 and store_todo_total == 0

        status = "✅" if (clean_ok and todo_ok and handover_ok and not no_data) else "⚠️"

        clean_str = f"청소 {clean_done}/{clean_total}" if clean_total > 0 else "청소기록없음"
        todo_str = f"업무 {store_todo_done}/{store_todo_total}" if store_todo_total > 0 else "업무없음"
        worker_str = f"근무: {', '.join(store_workers)}" if store_workers else "근무자없음"
        handover_str = f"인수인계 미확인 {len(unconfirmed)}건" if unconfirmed else ""

        line = f"{status} {icon} {sname}"
        line += f"\n   └ {clean_str} · {todo_str}"
        line += f"\n   └ {worker_str}"
        if handover_str:
            line += f"\n   └ 🔔 {handover_str}"

        if status == "⚠️":
            store_alerts.append({
                "name": sname, "icon": icon,
                "clean_done": clean_done, "clean_total": clean_total,
                "todo_done": store_todo_done, "todo_total": store_todo_total,
                "unconfirmed": unconfirmed, "no_data": no_data
            })
            lines.append(line)
        else:
            normal_stores.append(f"{icon} {sname}")

    # 정상 매장은 한 줄로
    if normal_stores:
        lines.append(f"✅ 정상 운영: {' · '.join(normal_stores)}")
    lines.append("")

    # ── 2. 직원별 업무 현황 ──────────────────
    lines.append("👤 직원별 업무 현황")
    lines.append("")

    used_staff = []
    unused_staff = []

    for name in STAFF:
        todos = get_staff_todos(name, date_key)
        if not todos:
            unused_staff.append(name)
            continue

        total = len(todos)
        done = sum(1 for t in todos if t.get("done"))
        carry = sum(1 for t in todos if t.get("fromDate") and t.get("fromDate") != date_key)
        undone_items = [t for t in todos if not t.get("done")]

        projects = get_projects(name)
        ongoing_projects = [p for p in projects if not p.get("done")]

        # 매장 파악
        store_ids = list(set(t.get("storeId","") for t in todos if t.get("storeId")))
        store_names = []
        for sid in store_ids:
            s = next((s["name"].replace("인천 ","").replace("부천 ","").replace("구월 ","") for s in STORES if s["id"]==sid), sid)
            store_names.append(s)

        completion = int(done/total*100) if total > 0 else 0
        bar = "█" * (completion//10) + "░" * (10 - completion//10)

        status = "✅" if completion >= 80 else "⚠️" if completion >= 50 else "❌"
        line = f"{status} {name}  [{bar}] {completion}%  ({done}/{total}완료)"
        if store_names:
            line += f"  📍{', '.join(store_names)}"
        if carry > 0:
            line += f"  🔄이월{carry}건"
        if ongoing_projects:
            line += f"  🔄프로젝트{len(ongoing_projects)}건"
        if undone_items:
            for t in undone_items[:2]:
                line += f"\n   └ ❌ {t.get('text','')}"
            if len(undone_items) > 2:
                line += f"\n   └ ... 외 {len(undone_items)-2}건"

        lines.append(line)
        used_staff.append({
            "name": name, "total": total, "done": done,
            "carry": carry, "completion": completion,
            "projects": len(ongoing_projects)
        })

    if unused_staff:
        lines.append("")
        lines.append(f"📵 앱 미사용: {', '.join(unused_staff)}")

    lines.append("")

    # ── 3. AI 인사이트 ───────────────────────
    lines.append("━" * 40)
    lines.append("💡 오늘의 운영 인사이트")
    lines.append("")

    insights = []

    # 미사용자
    if unused_staff:
        insights.append(f"• 앱 미사용 직원 {len(unused_staff)}명 — {', '.join(unused_staff)} 확인 필요")

    # 완료율 낮은 직원
    low = [s for s in used_staff if s["completion"] < 50 and s["total"] >= 2]
    if low:
        insights.append(f"• 업무 완료율 50% 미만: {', '.join(s['name'] for s in low)}")

    # 이월 누적
    carry_heavy = [s for s in used_staff if s["carry"] >= 3]
    if carry_heavy:
        insights.append(f"• 이월 누적 3건 이상: {', '.join(s['name'] for s in carry_heavy)} — 업무 부하 점검 필요")

    # 매장 이슈
    no_data_stores = [w["name"] for w in store_alerts if w["no_data"]]
    if no_data_stores:
        insights.append(f"• 데이터 미기록 매장: {', '.join(no_data_stores)}")

    handover_stores = [w["name"] for w in store_alerts if w["unconfirmed"]]
    if handover_stores:
        insights.append(f"• 인수인계 미확인: {', '.join(handover_stores)}")

    clean_fail = [w for w in store_alerts if w["clean_total"] > 0 and w["clean_done"] < w["clean_total"]]
    if clean_fail:
        insights.append(f"• 청소 미완료: {', '.join(w['name'] for w in clean_fail)}")

    if not insights:
        insights.append("• 전체적으로 양호합니다. 특이사항 없음.")

    lines.extend(insights)
    lines.append("")
    lines.append("━" * 40)
    lines.append(f"📱 위베이프 운영 시스템  |  자동 발송")

    return "\n".join(lines), date_label


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
    report_text, date_label = build_daily_report()
    subject = f"[위베이프 일일보고] {date_label}"
    send_email(subject, report_text)
    print("✅ 일일 보고 발송 완료")
    print(report_text)
