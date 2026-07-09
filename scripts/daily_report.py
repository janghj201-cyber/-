"""
위베이프 일일 보고 스크립트 v3.0
경로: staff_todos/{이름}_{날짜} / handover/{매장}_{날짜} / checks/{매장}/{날짜}/clean
"""
import os, json, urllib.request, smtplib, io
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

FIREBASE_API_KEY   = os.environ["FIREBASE_API_KEY"]
GMAIL_USER         = os.environ["GMAIL_USER"]
GMAIL_APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]
REPORT_TO          = os.environ["REPORT_TO_EMAIL"]
PROJECT_ID         = "wevape-schedule"
BASE_URL           = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

STORES = [
    {"id":"yeonsu",    "name":"인천 연수점",   "short":"연수점"},
    {"id":"nonhyeon",  "name":"인천 논현점",   "short":"논현점"},
    {"id":"rodeo",     "name":"구월 로데오점", "short":"로데오점"},
    {"id":"gilbyeong", "name":"구월 길병원점", "short":"길병원점"},
    {"id":"airport",   "name":"인천공항점",    "short":"공항점"},
    {"id":"geomdan",   "name":"검단점",        "short":"검단점"},
    {"id":"gyesan",    "name":"계산점",        "short":"계산점"},
    {"id":"sangdong",  "name":"부천 상동점",   "short":"상동점"},
    {"id":"sijungdong","name":"부천 신중동점", "short":"신중동점"},
]

STAFF = ["오명록","고아현","장현진","장대운","신재현","정희경",
         "조효정","홍다운","이종혁","원주현","김형진","윤하람",
         "차영근","정유진","안태민","김다정"]

def fb_get(path):
    try:
        req = urllib.request.Request(f"{BASE_URL}/{path}?key={FIREBASE_API_KEY}")
        with urllib.request.urlopen(req, timeout=15) as r:
            d = json.load(r)
            return parse_fields(d["fields"]) if "fields" in d else None
    except:
        return None

def parse_value(v):
    if "stringValue"  in v: return v["stringValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "arrayValue"   in v: return [parse_value(x) for x in v["arrayValue"].get("values",[])]
    if "mapValue"     in v: return parse_fields(v["mapValue"].get("fields",{}))
    return None

def parse_fields(f): return {k: parse_value(v) for k,v in f.items()}

def get_todos(name, dk): 
    d = fb_get(f"staff_todos/{name}_{dk}"); return (d.get("items") or []) if d else []
def get_clean(sid, dk):
    d = fb_get(f"checks/{sid}/{dk}/clean")
    if not d: return 0,0
    keys=[k for k in d if k.startswith("item_")]; total=len(keys) or 6
    return sum(1 for k in keys if d.get(k) is True), total
def get_handover(sid, dk):
    d = fb_get(f"handover/{sid}_{dk}"); return (d.get("items") or []) if d else []
def get_dayoff():
    d = fb_get("config/dayoff"); return d or {}
def get_projects(name):
    d = fb_get(f"staff_projects/{name}"); return (d.get("items") or []) if d else []

def build_report():
    rdate = datetime.now() - timedelta(days=1)
    dk = rdate.strftime("%Y-%m-%d")
    dlabel = rdate.strftime("%Y년 %m월 %d일")
    wd = ["월","화","수","목","금","토","일"][rdate.weekday()]
    dayoff = get_dayoff()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    L = []

    L += [f"위베이프 일일 운영 보고",
          f"보고일: {dlabel} ({wd}요일)",
          f"생성: {now_str}", "","="*50,""]

    # 1. 매장별 현황
    L += ["[1] 매장별 운영 현황",""]
    issue_stores, ok_stores = [], []

    for s in STORES:
        sid, sname, sshort = s["id"], s["name"], s["short"]
        cd, ct = get_clean(sid, dk)
        clean_ok = ct>0 and cd>=ct
        hw = get_handover(sid, dk)
        unconf = [h for h in hw if not h.get("confirmed")]

        workers, td, tt = [], 0, 0
        for name in STAFF:
            if dayoff.get(name,{}).get(dk)=="dayoff": continue
            todos = [t for t in get_todos(name,dk) if t.get("storeId")==sid]
            if todos:
                workers.append(name); tt+=len(todos); td+=sum(1 for t in todos if t.get("done"))

        issues = []
        if not clean_ok and ct>0: issues.append(f"청소미완료({cd}/{ct})")
        if unconf: issues.append(f"인수인계미확인{len(unconf)}건")
        if not workers: issues.append("업무기록없음")

        if issues:
            L.append(f"  ⚠️  {sname}")
            for i in issues: L.append(f"      - {i}")
            if workers:
                cr = int(td/tt*100) if tt>0 else 0
                L.append(f"      업무 {td}/{tt}건({cr}%) | 근무: {', '.join(workers)}")
            if unconf:
                for u in unconf[:2]: L.append(f"      └ {u.get('text','')} (작성:{u.get('author','')})")
            issue_stores.append(sshort)
        else:
            cr = int(td/tt*100) if tt>0 else 100
            ok_stores.append(f"{sshort}({cr}%)")

    L.append("")
    if ok_stores: L.append(f"  ✅ 정상: {' / '.join(ok_stores)}")
    L += ["","="*50,""]

    # 2. 직원별 업무 현황
    L += ["[2] 직원별 업무 현황",""]
    active, dayoff_list, unused = [], [], []

    for name in STAFF:
        if dayoff.get(name,{}).get(dk)=="dayoff":
            dayoff_list.append(name); continue
        todos = get_todos(name, dk)
        if not todos:
            unused.append(name); continue
        total=len(todos); done=sum(1 for t in todos if t.get("done"))
        carried=sum(1 for t in todos if t.get("fromDate") and t.get("fromDate")!=dk)
        comp=int(done/total*100) if total>0 else 0
        bar="■"*(comp//10)+"□"*(10-comp//10)
        sids=list(set(t.get("storeId","") for t in todos if t.get("storeId")))
        snames=[next((s["short"] for s in STORES if s["id"]==sid),sid) for sid in sids]
        proj=[p for p in get_projects(name) if not p.get("done")]
        icon="✅" if comp>=80 else "⚠️" if comp>=50 else "❌"
        line=f"  {icon} {name:<4} [{bar}] {comp:3d}%  ({done}/{total}건)"
        if snames: line+=f"  @{','.join(snames)}"
        if carried: line+=f"  이월{carried}건"
        if proj: line+=f"  프로젝트{len(proj)}건"
        L.append(line)
        undone=[t for t in todos if not t.get("done")]
        for t in undone[:2]: L.append(f"          └❌ {t.get('text','')}")
        if len(undone)>2: L.append(f"          └ 외 {len(undone)-2}건")
        active.append({"name":name,"comp":comp})

    L.append("")
    if dayoff_list: L.append(f"  🏖️ 휴무: {', '.join(dayoff_list)}")
    if unused:      L.append(f"  📵 미사용: {', '.join(unused)}")
    L += ["","="*50,""]

    # 3. 인사이트
    L += ["[3] 오늘의 인사이트",""]
    insights = []
    if issue_stores: insights.append(f"• 이슈 매장 {len(issue_stores)}개: {', '.join(issue_stores)}")
    low=[s for s in active if s["comp"]<50]
    if low: insights.append(f"• 완료율 50% 미만: {', '.join(s['name'] for s in low)}")
    if unused: insights.append(f"• 앱 미사용 {len(unused)}명: {', '.join(unused)}")
    if not insights: insights.append("• 특이사항 없음. 전반적으로 양호합니다.")
    L.extend(insights)
    L += ["","="*50,"📱 위베이프 운영 시스템 | 자동 발송"]
    return L, dlabel

def try_make_docx(lines, title):
    try:
        from docx import Document
        from docx.shared import Pt, Cm
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        doc = Document()
        # 여백 설정
        for sec in doc.sections:
            sec.top_margin=Cm(2); sec.bottom_margin=Cm(2)
            sec.left_margin=Cm(2.5); sec.right_margin=Cm(2.5)
        # 제목
        h=doc.add_heading(title,0); h.alignment=WD_ALIGN_PARAGRAPH.CENTER
        doc.add_paragraph("")
        for line in lines:
            if line.startswith("="*10):
                p=doc.add_paragraph(); p.add_run("─"*40)
            elif line.startswith("[") and "]" in line[:5]:
                doc.add_heading(line, level=1)
            elif line == "":
                doc.add_paragraph("")
            else:
                p=doc.add_paragraph(line)
                p.paragraph_format.space_after=Pt(2)
        buf=io.BytesIO(); doc.save(buf); buf.seek(0)
        return buf.read()
    except ImportError:
        return None

def send():
    lines, dlabel = build_report()
    subject = f"[위베이프 일일보고] {dlabel}"
    body = "\n".join(lines)
    msg = MIMEMultipart()
    msg["From"]=GMAIL_USER; msg["To"]=REPORT_TO; msg["Subject"]=subject
    msg.attach(MIMEText(body, "plain", "utf-8"))
    # docx 첨부
    docx = try_make_docx(lines, f"위베이프 일일보고 {dlabel}")
    if docx:
        part=MIMEBase("application","octet-stream"); part.set_payload(docx)
        encoders.encode_base64(part)
        fname=f"위베이프_일일보고_{dlabel.replace(' ','').replace('년','').replace('월','').replace('일','')}.docx"
        part.add_header("Content-Disposition", f"attachment; filename={fname}")
        msg.attach(part)
    with smtplib.SMTP("smtp.gmail.com", 587) as sv:
        sv.starttls(); sv.login(GMAIL_USER, GMAIL_APP_PASSWORD); sv.send_message(msg)
    print(f"✅ 발송 완료: {dlabel}")
    print(body)

if __name__=="__main__":
    send()
