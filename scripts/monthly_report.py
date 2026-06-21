"""
위베이프 월간 보고 스크립트
- Firebase에서 전월 전체 데이터 읽기
- 분석 후 이메일(Gmail SMTP) 발송
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

CLEAN_BASE_COUNT = 6


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


def get_prev_month_range():
    today = datetime.now()
    first_of_this_month = today.replace(day=1)
    last_day_prev_month = first_of_this_month - timedelta(days=1)
    year, month = last_day_prev_month.year, last_day_prev_month.month
    num_days = calendar.monthrange(year, month)[1]
    dates = [datetime(year, month, d).strftime("%Y-%m-%d") for d in range(1, num_days + 1)]
    return year, month, dates


def analyze_store_month(store_id, dates):
    clean_done_total, clean_item_total = 0, 0
    todo_done_total, todo_item_total = 0, 0
    carry_count = 0
    days_with_data = 0

    for date_key in dates:
        clean_data = fb_get(f"checks/{store_id}_{date_key}/clean")
        if clean_data:
            keys = [k for k in clean_data.keys() if k.startswith("item_")]
            if keys:
                days_with_data += 1
                clean_item_total += len(keys)
                clean_done_total += sum(1 for k in keys if clean_data.get(k) is True)

        todo_data = fb_get(f"todos/{store_id}_{date_key}")
        if todo_data and todo_data.get("items"):
            items = todo_data["items"]
            todo_item_total += len(items)
            todo_done_total += sum(1 for t in items if t.get("done"))
            for t in items:
                if t.get("fromDate") and t.get("fromDate") != date_key:
                    carry_count += 1

    clean_pct = round(clean_done_total / clean_item_total * 100) if clean_item_total else None
    todo_pct = round(todo_done_total / todo_item_total * 100) if todo_item_total else None

    return {
        "clean_pct": clean_pct, "todo_pct": todo_pct,
        "carry_count": carry_count, "days_with_data": days_with_data,
        "clean_done": clean_done_total, "clean_total": clean_item_total,
        "todo_done": todo_done_total, "todo_total": todo_item_total,
    }


def build_monthly_report():
    year, month, dates = get_prev_month_range()
    num_days = len(dates)

    results = []
    for store in STORES:
        stats = analyze_store_month(store["id"], dates)
        results.append({**store, **stats})

    scored = [r for r in results if r["clean_pct"] is not None or r["todo_pct"] is not None]
    def score(r):
        c = r["clean_pct"] or 0
        t = r["todo_pct"] or 0
        return (c + t) / 2

    scored.sort(key=score, reverse=True)
    top3 = scored[:3]
    worst = [r for r in scored if score(r) < 80][-3:] if len(scored) > 3 else []

    no_data = [r for r in results if r["days_with_data"] == 0]

    lines = []
    lines.append(f"📊 위베이프 {month}월 월간 보고")
    lines.append("━━━━━━━━━━━━━━━━━━")
    lines.append("")
    lines.append("🏆 이달의 우수 지점")
    for i, r in enumerate(top3, 1):
        c = f"{r['clean_pct']}%" if r["clean_pct"] is not None else "데이터없음"
        t = f"{r['todo_pct']}%" if r["todo_pct"] is not None else "데이터없음"
        lines.append(f"{i}위 {r['icon']} {r['name']} — 청소 {c} · 업무 완료율 {t}")
    lines.append("")

    lines.append("📉 개선 필요 지점")
    if worst:
        for r in worst:
            c = f"{r['clean_pct']}%" if r["clean_pct"] is not None else "데이터없음"
            lines.append(f"⚠️ {r['icon']} {r['name']} — 청소 {c} · 이월 {r['carry_count']}건")
    if no_data:
        for r in no_data:
            lines.append(f"⚠️ {r['icon']} {r['name']} — 이번 달 데이터 미기록")
    if not worst and not no_data:
        lines.append("(해당 없음, 전 지점 양호)")
    lines.append("")

    lines.append("━━━━━━━━━━━━━━━━━━")
    lines.append(f"📈 전체 지점 현황 ({num_days}일 기준)")
    lines.append("")
    lines.append(f"{'지점':<14}{'청소':>8}{'업무':>8}{'이월':>8}")
    for r in results:
        c = f"{r['clean_pct']}%" if r["clean_pct"] is not None else "-"
        t = f"{r['todo_pct']}%" if r["todo_pct"] is not None else "-"
        lines.append(f"{r['icon']} {r['name']:<10}{c:>8}{t:>8}{str(r['carry_count'])+'건':>8}")
    lines.append("")

    lines.append("━━━━━━━━━━━━━━━━━━")
    lines.append("💡 이달의 인사이트")
    insight_num = 1

    if worst:
        worst_one = worst[0]
        lines.append(f"{insight_num}. {worst_one['name']} 이월 {worst_one['carry_count']}건으로 가장 많은 미완료 — 업무량 대비 인력 검토 필요")
        insight_num += 1

    valid_clean = [r["clean_pct"] for r in results if r["clean_pct"] is not None]
    if valid_clean:
        avg_clean = round(sum(valid_clean) / len(valid_clean))
        lines.append(f"{insight_num}. 전체 지점 평균 청소 완료율 {avg_clean}%")
        insight_num += 1

    if no_data:
        names = ', '.join(r['name'] for r in no_data)
        lines.append(f"{insight_num}. {names} — 앱 활용도가 낮습니다. 사용 독려 필요")
        insight_num += 1

    zero_carry = [r["name"] for r in results if r["carry_count"] == 0 and r["days_with_data"] > 0]
    if zero_carry:
        lines.append(f"{insight_num}. 이월 0건 달성: {', '.join(zero_carry)} 👏")
        insight_num += 1

    return "\n".join(lines), year, month


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
    report_text, year, month = build_monthly_report()
    subject = f"[위베이프 월간보고] {year}년 {month}월"
    send_email(subject, report_text)
    print("월간 보고 이메일 발송 완료")
    print(report_text)
