"""
위베이프 일일 보고 스크립트
- Firebase에서 어제 날짜 데이터 읽기
- 분석 후 이메일(Gmail SMTP) 발송
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
    {"id": "yeonsu", "name": "인천 연수점", "icon": "🏪"},
    {"id": "nonhyeon", "name": "인천 논현점", "icon": "🏬"},
    {"id": "rodeo", "name": "구월 로데오점", "icon": "🎯"},
    {"id": "gilbyeong", "name": "구월 길병원점", "icon": "🏥"},
    {"id": "airport", "name": "인천공항점", "icon": "✈️"},
    {"id": "geomdan", "name": "검단점", "icon": "🌱"},
    {"id": "gyesan", "name": "계산점", "icon": "🏙️"},
    {"id": "sangdong", "name": "부천 상동점", "icon": "🌿"},
    {"id": "sijungdong", "name": "부천 신중동점", "icon": "⭐"},
]

CLEAN_BASE_COUNT = 6  # 기본 청소 항목 수


def fb_get(path):
    """Firestore 문서 하나 GET. 없으면 None."""
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
    if "stringValue" in v:
        return v["stringValue"]
    if "booleanValue" in v:
        return v["booleanValue"]
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return v["doubleValue"]
    if "nullValue" in v:
        return None
    if "arrayValue" in v:
        vals = v["arrayValue"].get("values", [])
        return [parse_value(x) for x in vals]
    if "mapValue" in v:
        return parse_fields(v["mapValue"].get("fields", {}))
    return None


def parse_fields(fields):
    return {k: parse_value(v) for k, v in fields.items()}


def get_clean_total(store_id, date_key):
    """그날 청소 항목 총 개수 추정: clean 문서의 item_ 필드 개수로 추정 불가하므로
    그냥 채워진 item_ 필드 수 기준으로 분모를 동적으로 잡는다(기본 6 + 대청소 있으면 더 큼).
    실제 분모를 정확히 알 수 없으니, item_ 필드 총 개수를 분모로 사용."""
    data = fb_get(f"checks/{store_id}_{date_key}/clean")
    if not data:
        return 0, 0
    keys = [k for k in data.keys() if k.startswith("item_")]
    total = len(keys) if keys else CLEAN_BASE_COUNT
    done = sum(1 for k in keys if data.get(k) is True)
    return done, total


def get_todos(store_id, date_key):
    data = fb_get(f"todos/{store_id}_{date_key}")
    if not data or "items" not in data:
        return []
    return data["items"] or []


def get_handover(store_id, date_key):
    data = fb_get(f"handover/{store_id}_{date_key}")
    if not data or "items" not in data:
        return []
    return data["items"] or []


def build_daily_report():
    yesterday = datetime.now() - timedelta(days=1)
    date_key = yesterday.strftime("%Y-%m-%d")
    date_label = yesterday.strftime("%m월 %d일")
    weekday_kr = ["월", "화", "수", "목", "금", "토", "일"][yesterday.weekday()]

    normal_stores = []
    warning_stores = []

    for store in STORES:
        sid, sname, icon = store["id"], store["name"], store["icon"]
        clean_done, clean_total = get_clean_total(sid, date_key)
        todos = get_todos(sid, date_key)
        handovers = get_handover(sid, date_key)

        todo_done = sum(1 for t in todos if t.get("done"))
        todo_total = len(todos)
        unconfirmed_handovers = [h for h in handovers if not h.get("confirmed")]
        authors = sorted(set(t.get("author") for t in todos if t.get("author")))

        clean_ok = clean_total == 0 or clean_done >= clean_total
        todo_ok = todo_total == 0 or (todo_done / todo_total) >= 0.8
        handover_ok = len(unconfirmed_handovers) == 0

        is_normal = clean_ok and todo_ok and handover_ok and clean_total > 0

        if is_normal:
            normal_stores.append(f"{icon} {sname}")
        else:
            detail = {
                "icon": icon, "name": sname, "authors": authors,
                "clean_done": clean_done, "clean_total": clean_total,
                "todos": todos, "todo_done": todo_done, "todo_total": todo_total,
                "handovers": unconfirmed_handovers,
            }
            warning_stores.append(detail)

    lines = []
    lines.append(f"📋 위베이프 일일 보고 | {date_label} ({weekday_kr})")
    lines.append("━━━━━━━━━━━━━━━━━━")
    lines.append("")
    lines.append(f"✅ 정상 운영 ({len(normal_stores)}개 지점)")
    if normal_stores:
        lines.append(" · ".join(normal_stores))
    else:
        lines.append("(해당 없음)")
    lines.append("")
    lines.append(f"⚠️ 주의 필요 ({len(warning_stores)}개 지점)")
    lines.append("")

    for w in warning_stores:
        lines.append(f"{w['icon']} {w['name']}")
        lines.append(f"└ 근무자: {', '.join(w['authors']) if w['authors'] else '기록 없음'}")
        if w["clean_total"] > 0:
            lines.append(f"└ 🧹 청소: {w['clean_done']}/{w['clean_total']} 완료")
        else:
            lines.append("└ 🧹 청소: 기록 없음")
        lines.append(f"└ 📝 업무: {w['todo_done']}/{w['todo_total']} 완료")
        for t in w["todos"]:
            if not t.get("done"):
                carry = " · 이월" if t.get("fromDate") and t.get("fromDate") != date_key else ""
                lines.append(f"   ❌ {t.get('text','')} [{t.get('author','익명')}{carry}]")
        if w["handovers"]:
            lines.append(f"└ 🔄 인수인계: {len(w['handovers'])}건 미확인")
            for h in w["handovers"]:
                lines.append(f"   \"{h.get('text','')}\" [{h.get('author','익명')}]")
        lines.append("")

    lines.append("━━━━━━━━━━━━━━━━━━")
    lines.append("💡 오늘의 인사이트")

    insights = []
    no_data_stores = [w["name"] for w in warning_stores if w["clean_total"] == 0 and w["todo_total"] == 0]
    if no_data_stores:
        insights.append(f"• {', '.join(no_data_stores)} — 데이터 미기록 (앱 사용 확인 필요)")
    carried = []
    for w in warning_stores:
        for t in w["todos"]:
            if t.get("fromDate") and t.get("fromDate") != date_key and not t.get("done"):
                carried.append(w["name"])
                break
    if carried:
        insights.append(f"• 이월 업무 누적 지점: {', '.join(set(carried))}")
    handover_issue = [w["name"] for w in warning_stores if w["handovers"]]
    if handover_issue:
        insights.append(f"• 인수인계 미확인: {', '.join(handover_issue)} — 빠른 확인 요망")
    if not insights:
        insights.append("• 특이사항 없음, 전반적으로 양호합니다")

    lines.extend(insights)

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
    print("일일 보고 이메일 발송 완료")
    print(report_text)
