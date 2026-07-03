"""
위베이프 월간 보고 스크립트 v2.1
- 평가 철학 개선: 미완료 = 감점 아님
- 6가지 역량 지표 (꾸준함/충실도/책임감/성장성/주도성/협력도)
- 직원 유형 분석 + AI 코멘트
- 베스트 직원/매장 TOP 3 + 게시판 자동 공지
"""
import os, calendar, requests, smtplib, json
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
    {"id":"yeonsu",    "name":"인천 연수점",   "icon":"🏪"},
    {"id":"nonhyeon",  "name":"인천 논현점",   "icon":"🏬"},
    {"id":"rodeo",     "name":"구월 로데오점", "icon":"🎯"},
    {"id":"gilbyeong", "name":"구월 길병원점", "icon":"🏥"},
    {"id":"airport",   "name":"인천공항점",    "icon":"✈️"},
    {"id":"geomdan",   "name":"검단점",        "icon":"🌱"},
    {"id":"gyesan",    "name":"계산점",        "icon":"🏙️"},
    {"id":"sangdong",  "name":"부천 상동점",   "icon":"🌿"},
    {"id":"sijungdong","name":"부천 신중동점", "icon":"⭐"},
]
STAFF = [
    "오명록","고아현","장현진","장대운","신재현","정희경",
    "조효정","홍다운","이종혁","원주현","김형진","윤하람",
    "차영근","정유진","안태민","김다정"
]

def fb_get(path):
    try:
        r = requests.get(f"{BASE_URL}/{path}?key={FIREBASE_API_KEY}", timeout=15)
        if r.status_code != 200: return None
        d = r.json()
        return parse_fields(d["fields"]) if "fields" in d else None
    except: return None

def parse_value(v):
    if "stringValue" in v: return v["stringValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "nullValue" in v: return None
    if "arrayValue" in v: return [parse_value(x) for x in v["arrayValue"].get("values",[])]
    if "mapValue" in v: return parse_fields(v["mapValue"].get("fields",{}))
    return None

def parse_fields(fields):
    return {k: parse_value(v) for k,v in fields.items()}

def get_prev_month_dates():
    today = datetime.now()
    first = today.replace(day=1)
    last_prev = first - timedelta(days=1)
    y, m = last_prev.year, last_prev.month
    num_days = calendar.monthrange(y, m)[1]
    return [f"{y}-{m:02d}-{d:02d}" for d in range(1, num_days+1)], y, m

def get_dayoff_data():
    data = fb_get("config/dayoff")
    return data or {}

def analyze_staff(name, dates, prev_dates=None):
    """
    6가지 역량 지표로 직원 분석
    핵심: 미완료는 감점 아님 — 이월 후 처리했는가로 판단
    """
    dayoff_data = get_dayoff_data()
    my_dayoffs = dayoff_data.get(name, {})

    # 날짜별 데이터 수집
    daily = []  # [{date, items, dayoff}]
    for date_key in dates:
        is_dayoff = my_dayoffs.get(date_key) == 'dayoff'
        data = fb_get(f"staff_todos/{name}_{date_key}")
        items = (data.get("items") or []) if data else []
        daily.append({"date": date_key, "items": items, "dayoff": is_dayoff})

    work_days = [d for d in daily if not d["dayoff"]]
    used_days = [d for d in work_days if d["items"]]
    dayoff_days = [d for d in daily if d["dayoff"]]

    # 1. 꾸준함 (20점): 연속 사용 + 참여율
    participation = len(used_days) / len(work_days) if work_days else 0
    # 최대 연속 사용일 계산
    max_streak = cur_streak = 0
    for d in work_days:
        if d["items"]: cur_streak += 1; max_streak = max(max_streak, cur_streak)
        else: cur_streak = 0
    score_steady = int(participation * 14) + min(max_streak // 3, 6)  # 최대 20점

    # 2. 업무 충실도 (25점): 입력량 × 완료율 복합
    all_items = [i for d in used_days for i in d["items"]]
    total = len(all_items)
    done = sum(1 for i in all_items if i.get("done"))
    # 입력량 점수 (최대 12점)
    input_score = min(total // 3, 12)
    # 완료율 점수 (최대 13점) — 단, 미완료 자체는 감점 없음
    comp_rate = done / total if total > 0 else 0
    comp_score = int(comp_rate * 13)
    score_diligence = input_score + comp_score  # 최대 25점

    # 3. 책임감 (20점): 이월 항목을 나중에 완료했는가
    carry_items = [i for i in all_items if i.get("fromDate")]
    carry_done = sum(1 for i in carry_items if i.get("done"))
    carry_rate = carry_done / len(carry_items) if carry_items else 1.0
    # 이월 없으면 만점, 이월 있으면 처리율로
    score_responsibility = int(carry_rate * 20)  # 최대 20점

    # 4. 성장성 (15점): 이번 달 vs 지난달
    score_growth = 7  # 기본 중간값
    if prev_dates:
        prev_items_all = []
        for date_key in prev_dates:
            data = fb_get(f"staff_todos/{name}_{date_key}")
            if data and data.get("items"):
                prev_items_all.extend(data["items"])
        if prev_items_all:
            prev_total = len(prev_items_all)
            prev_done = sum(1 for i in prev_items_all if i.get("done"))
            prev_comp = prev_done / prev_total if prev_total > 0 else 0
            delta_comp = comp_rate - prev_comp
            delta_input = total - prev_total
            if delta_comp > 0.1 or delta_input > 5: score_growth = 13
            elif delta_comp > 0: score_growth = 10
            elif delta_comp < -0.1 and delta_input < -5: score_growth = 3
            else: score_growth = 7

    # 5. 주도성 (10점): 프로젝트 자발적 진행
    proj_data = fb_get(f"staff_projects/{name}")
    projects = (proj_data.get("items") or []) if proj_data else []
    ongoing = [p for p in projects if not p.get("done")]
    completed_proj = [p for p in projects if p.get("done")]
    score_initiative = min(len(ongoing)*4 + len(completed_proj)*2, 10)  # 최대 10점

    # 6. 협력도 (10점): 인수인계 작성 + 확인
    written = confirmed = 0
    for store in STORES:
        for date_key in dates:
            data = fb_get(f"handover/{store['id']}_{date_key}")
            if data and data.get("items"):
                mine = [i for i in data["items"] if i.get("author")==name]
                written += len(mine)
                confirmed += sum(1 for i in mine if i.get("confirmed"))
    handover_rate = confirmed / written if written > 0 else 1.0
    score_cooperation = int(handover_rate * 10)  # 최대 10점

    total_score = score_steady + score_diligence + score_responsibility + score_growth + score_initiative + score_cooperation

    # 유형 분류
    if not used_days:
        staff_type = "📵 미참여형"
    elif score_initiative >= 8 and participation >= 0.8:
        staff_type = "🌟 주도형"
    elif participation >= 0.85 and score_responsibility >= 16:
        staff_type = "✅ 성실형"
    elif total >= 15 and comp_rate < 0.5 and carry_rate < 0.5:
        staff_type = "📋 형식형"
    elif participation <= 0.3:
        staff_type = "📵 미참여형"
    else:
        staff_type = "📌 일반형"

    # AI 코멘트 생성
    comment = generate_comment(name, staff_type, participation, total, comp_rate,
                                carry_rate, score_growth, ongoing, len(dayoff_days))

    return {
        "name": name, "score": total_score, "type": staff_type,
        "comment": comment,
        "used_days": len(used_days), "work_days": len(work_days),
        "dayoff_days": len(dayoff_days),
        "total": total, "done": done, "comp_rate": comp_rate,
        "carry_count": len(carry_items), "carry_done": carry_done,
        "carry_rate": carry_rate,
        "max_streak": max_streak, "participation": participation,
        "ongoing_projects": len(ongoing), "completed_projects": len(completed_proj),
        "handover_rate": handover_rate,
        "scores": {
            "꾸준함": score_steady, "충실도": score_diligence,
            "책임감": score_responsibility, "성장성": score_growth,
            "주도성": score_initiative, "협력도": score_cooperation
        }
    }

def generate_comment(name, stype, participation, total, comp_rate,
                      carry_rate, score_growth, ongoing, dayoff_count):
    """직원 특성 기반 AI 코멘트 생성"""
    parts = []

    if stype == "📵 미참여형":
        return f"이번 달 앱 사용 기록이 거의 없습니다. 현장 확인이 필요합니다."

    # 꾸준함
    if participation >= 0.9:
        parts.append("거의 매일 빠짐없이 업무를 기록하는 꾸준함이 돋보입니다.")
    elif participation >= 0.7:
        parts.append("전반적으로 성실하게 업무를 기록했습니다.")
    else:
        parts.append(f"근무일 중 {int(participation*100)}%만 기록했습니다. 더 꾸준한 기록이 필요합니다.")

    # 업무량 + 미완료 해석
    if total >= 20:
        parts.append(f"이번 달 {total}건의 업무를 적극적으로 입력했습니다.")
    elif total >= 10:
        parts.append(f"이번 달 {total}건의 업무를 기록했습니다.")

    if comp_rate < 0.6 and total >= 10:
        parts.append(f"완료율이 {int(comp_rate*100)}%로 낮지만, 이는 업무량 자체가 많은 것으로 해석될 수 있습니다.")

    # 책임감 (이월 처리)
    if carry_rate >= 0.8:
        parts.append("미완료 업무를 방치하지 않고 다음날 꾸준히 처리하는 책임감이 있습니다.")
    elif carry_rate < 0.4:
        parts.append("이월된 업무 처리율이 낮아 완료되지 않은 업무가 누적되고 있습니다.")

    # 성장성
    if score_growth >= 11:
        parts.append("지난달보다 눈에 띄는 성장이 확인됩니다.")
    elif score_growth <= 4:
        parts.append("지난달 대비 활동량이 줄었습니다.")

    # 주도성
    if ongoing:
        parts.append(f"스스로 {len(ongoing)}건의 프로젝트를 진행하는 주도적인 모습이 보입니다.")

    return " ".join(parts)

def analyze_store(store, dates):
    clean_days = clean_total_days = 0
    todo_total = todo_done = handover_total = handover_confirmed = 0
    for date_key in dates:
        data = fb_get(f"checks/{store['id']}/{date_key}/clean")
        if data:
            keys = [k for k in data if k.startswith("item_")]
            if keys:
                clean_total_days += 1
                if all(data.get(k) for k in keys): clean_days += 1
        for name in STAFF:
            d = fb_get(f"staff_todos/{name}_{date_key}")
            if d and d.get("items"):
                mine = [i for i in d["items"] if i.get("storeId")==store["id"]]
                todo_total += len(mine)
                todo_done += sum(1 for i in mine if i.get("done"))
        hd = fb_get(f"handover/{store['id']}_{date_key}")
        if hd and hd.get("items"):
            handover_total += len(hd["items"])
            handover_confirmed += sum(1 for i in hd["items"] if i.get("confirmed"))
    clean_rate = clean_days/clean_total_days if clean_total_days else 0
    todo_rate = todo_done/todo_total if todo_total else 0
    handover_rate = handover_confirmed/handover_total if handover_total else 1.0
    score = int(clean_rate*40 + todo_rate*35 + handover_rate*25)
    return {
        "name": store["name"], "icon": store["icon"], "score": score,
        "clean_rate": clean_rate, "clean_days": clean_days, "clean_total_days": clean_total_days,
        "todo_rate": todo_rate, "todo_total": todo_total, "todo_done": todo_done,
        "handover_rate": handover_rate,
    }

def post_board_notice(year, month, best_staff, best_stores):
    import time
    month_label = f"{year}년 {month}월"
    medals = ["🥇","🥈","🥉"]
    body = f"{month_label} 한 달 동안 수고하셨습니다!\n\n"
    body += "🏆 이달의 베스트 직원\n"
    for i,s in enumerate(best_staff[:3]):
        body += f"{medals[i]} {s['name']}\n"
    body += "\n🏆 이달의 베스트 매장\n"
    for i,s in enumerate(best_stores[:3]):
        body += f"{medals[i]} {s['name']}\n"
    body += "\n모두 수고 많으셨습니다 👏"

    existing = fb_get("board/posts")
    items = existing.get("items",[]) if existing else []
    now = datetime.now()
    new_post = {
        "id": str(int(time.time()*1000)), "cat":"notice",
        "title": f"🏆 {month_label} 이달의 베스트 직원 & 매장",
        "body": body, "author":"관리자",
        "date": f"{now.month}/{now.day} {now.hour:02d}:{now.minute:02d}"
    }
    def to_v(v):
        if isinstance(v,bool): return {"booleanValue":v}
        return {"stringValue":str(v)}
    def to_map(d): return {"mapValue":{"fields":{k:to_v(v) for k,v in d.items()}}}
    firestore_body = {"fields":{"items":{"arrayValue":{"values":[to_map(p) for p in [new_post]+items]}}}}
    try:
        r = requests.patch(f"{BASE_URL}/board/posts?key={FIREBASE_API_KEY}", json=firestore_body, timeout=15)
        return r.status_code == 200
    except: return False

def build_monthly_report():
    dates, year, month = get_prev_month_dates()
    # 지지난달 (성장성 비교용)
    prev_first = datetime(year, month, 1) - timedelta(days=1)
    prev_dates, _, _ = get_prev_month_dates() if month > 1 else ([], year, month)

    month_label = f"{year}년 {month}월"
    medals = ["🥇","🥈","🥉"]
    lines = []
    lines.append(f"📊 위베이프 월간 보고  |  {month_label}")
    lines.append("━"*42)
    lines.append("")

    # ── 직원 분석 ─────────────────────
    lines.append("👤 직원별 역량 분석 (관리자 전용)")
    lines.append("※ 미완료 업무 자체는 감점 없음 — 이월 후 처리 여부로 평가")
    lines.append("")

    staff_results = []
    for name in STAFF:
        r = analyze_staff(name, dates, prev_dates if prev_dates else None)
        staff_results.append(r)

    staff_sorted = sorted(staff_results, key=lambda x:x["score"], reverse=True)
    active = [s for s in staff_sorted if s["used_days"]>0]

    for s in staff_sorted:
        bar = "█"*(s["score"]//10) + "░"*(10-s["score"]//10)
        lines.append(f"{s['type']}  {s['name']}  [{bar}]  {s['score']}점")
        lines.append(f"   └ 참여 {s['used_days']}/{s['work_days']}일 (휴무 {s['dayoff_days']}일 제외)  최대연속 {s['max_streak']}일")
        lines.append(f"   └ 업무 {s['total']}건 입력 → {s['done']}건 완료 ({int(s['comp_rate']*100)}%)")
        if s['carry_count']>0:
            lines.append(f"   └ 이월업무 {s['carry_count']}건 중 {s['carry_done']}건 처리 ({int(s['carry_rate']*100)}%)")
        if s['ongoing_projects'] or s['completed_projects']:
            lines.append(f"   └ 프로젝트 진행중 {s['ongoing_projects']}건 · 완료 {s['completed_projects']}건")
        sc=s['scores']
        lines.append(f"   └ 세부: 꾸준함{sc['꾸준함']} 충실도{sc['충실도']} 책임감{sc['책임감']} 성장성{sc['성장성']} 주도성{sc['주도성']} 협력도{sc['협력도']}")
        lines.append(f"   💬 {s['comment']}")
        lines.append("")

    # ── 매장 분석 ─────────────────────
    lines.append("━"*42)
    lines.append("🏪 매장별 운영 분석")
    lines.append("")
    store_results = [analyze_store(s, dates) for s in STORES]
    store_sorted = sorted(store_results, key=lambda x:x["score"], reverse=True)
    for s in store_sorted:
        bar = "█"*(s["score"]//10)+"░"*(10-s["score"]//10)
        lines.append(f"{s['icon']} {s['name']}  [{bar}]  {s['score']}점")
        lines.append(f"   └ 청소 {int(s['clean_rate']*100)}% · 업무완료 {int(s['todo_rate']*100)}% · 인수인계확인 {int(s['handover_rate']*100)}%")
        lines.append("")

    # ── TOP 3 ─────────────────────────
    lines.append("━"*42)
    lines.append(f"🏆 {month_label} 베스트 직원 TOP 3")
    lines.append("")
    for i,s in enumerate(active[:3]):
        lines.append(f"{medals[i]} {s['name']}  {s['type']}  {s['score']}점")
        lines.append(f"   참여 {int(s['participation']*100)}% · 업무 {s['total']}건 · 최대연속 {s['max_streak']}일")
        lines.append(f"   {s['comment'][:60]}...")
    lines.append("")

    lines.append(f"🏆 {month_label} 베스트 매장 TOP 3")
    lines.append("")
    for i,s in enumerate(store_sorted[:3]):
        lines.append(f"{medals[i]} {s['name']}  {s['score']}점")
        lines.append(f"   청소 {int(s['clean_rate']*100)}% · 업무 {int(s['todo_rate']*100)}% · 인수인계 {int(s['handover_rate']*100)}%")
    lines.append("")

    # ── AI 인사이트 ───────────────────
    lines.append("━"*42)
    lines.append("💡 월간 운영 인사이트")
    lines.append("")
    no_show = [s for s in staff_results if s["used_days"]==0]
    if no_show:
        lines.append(f"• 앱 미사용 직원: {', '.join(s['name'] for s in no_show)} — 현장 확인 필요")
    leaders = [s for s in staff_results if s["type"]=="🌟 주도형"]
    if leaders:
        lines.append(f"• 이달 주도적 활약: {', '.join(s['name'] for s in leaders)}")
    low_carry = [s for s in staff_results if s["carry_count"]>=3 and s["carry_rate"]<0.4]
    if low_carry:
        lines.append(f"• 이월 누적 미처리: {', '.join(s['name'] for s in low_carry)} — 업무 부하 또는 실행력 점검")
    clean_issues = [s for s in store_results if s["clean_rate"]<0.8]
    if clean_issues:
        lines.append(f"• 청소 수행률 80% 미만: {', '.join(s['name'] for s in clean_issues)}")
    if not any([no_show, leaders, low_carry, clean_issues]):
        lines.append("• 전체적으로 양호합니다. 특이사항 없음.")
    lines.append("")
    lines.append("━"*42)
    lines.append(f"📱 위베이프 운영 시스템  |  자동 발송")

    posted = post_board_notice(year, month, active, store_sorted)
    lines.append("✅ 게시판 베스트 공지 자동 등록 완료" if posted else "⚠️ 게시판 공지 등록 실패")

    return "\n".join(lines), month_label

def send_email(subject, body):
    msg = MIMEMultipart()
    msg["From"]=GMAIL_USER; msg["To"]=REPORT_TO; msg["Subject"]=subject
    msg.attach(MIMEText(body,"plain","utf-8"))
    with smtplib.SMTP("smtp.gmail.com",587) as s:
        s.starttls(); s.login(GMAIL_USER,GMAIL_APP_PASSWORD); s.send_message(msg)

if __name__=="__main__":
    report_text, month_label = build_monthly_report()
    send_email(f"[위베이프 월간보고] {month_label}", report_text)
    print("✅ 월간 보고 발송 완료")
    print(report_text)
