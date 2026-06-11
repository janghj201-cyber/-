#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
위베이프 월간 목표 설정 Google Sheets 자동화
매월 실행하면 현재 월 컬럼이 각 매장 시트에 자동 추가되고
요약 시트가 갱신됩니다.
"""

import os
import sys
import glob
import time
from datetime import datetime

# Windows 터미널 UTF-8 출력 설정
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr.encoding and sys.stderr.encoding.lower() not in ("utf-8", "utf8"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── 패키지 자동 설치 ──────────────────────────────────────────
def _ensure_packages():
    import subprocess
    needed = {"gspread": "gspread", "google-auth": "google.auth"}
    for pip_name, import_name in needed.items():
        try:
            __import__(import_name)
        except ImportError:
            print(f"  [{pip_name}] 설치 중...")
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", pip_name],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            print(f"  [{pip_name}] 설치 완료")

_ensure_packages()

import gspread
from google.oauth2.service_account import Credentials

# ── 설정 ──────────────────────────────────────────────────────
SPREADSHEET_ID  = "1qvk7CmUcpjg6Ww8LxRiyzTbJJyWlKhKRawo5-2KDmHs"
SPREADSHEET_URL = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit"
JSON_KEY_DIR    = r"C:\wevape"
SUMMARY_TITLE   = "요약"

STORES = [
    "인천 연수점",
    "인천 논현점",
    "인천 구월 로데오점",
    "인천 구월 길병원점",
    "부천 상동점",
    "부천 신중동점",
    "인천공항점",
    "검단점",
    "계산점",
]

FIELDS = [
    "전월 실적",
    "이번 달 목표 매출",
    "현재 매출 추이",
    "고객 유입 상황",
    "주력 제품 TOP3",
    "직원 현장 의견",
    "매출 증대 방안",
    "특이사항",
]

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# 색상 (Google Sheets RGB 0.0~1.0)
C_NAVY   = {"red": 0.18, "green": 0.34, "blue": 0.62}  # 매장 타이틀 배경
C_WHITE  = {"red": 1.00, "green": 1.00, "blue": 1.00}  # 흰 텍스트
C_LBLUE  = {"red": 0.90, "green": 0.93, "blue": 0.98}  # 항목 셀 배경
C_GREEN  = {"red": 0.20, "green": 0.52, "blue": 0.29}  # 월 헤더 배경
C_DNAVY  = {"red": 0.13, "green": 0.29, "blue": 0.53}  # 요약 타이틀 배경
C_LGRAY  = {"red": 0.80, "green": 0.80, "blue": 0.80}  # 테두리


# ── 유틸리티 ──────────────────────────────────────────────────
def find_json_key():
    """C:\\wevape 폴더에서 서비스 계정 JSON 자동 탐색"""
    files = glob.glob(os.path.join(JSON_KEY_DIR, "*.json"))
    if not files:
        raise FileNotFoundError(
            f"\n[오류] JSON 키 파일 없음: {JSON_KEY_DIR}\n"
            "Google Cloud 서비스 계정 JSON을 C:\\wevape\\ 에 저장 후 재실행하세요."
        )
    if len(files) > 1:
        print(f"  [경고] JSON {len(files)}개 발견 → {os.path.basename(files[0])} 사용")
    return files[0]


def col_letter(n: int) -> str:
    """1-based 열 번호를 열 문자로 변환 (1→A, 28→AB)"""
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def month_label(year: int, month: int) -> str:
    return f"{year}년 {month:02d}월"


def batch(spreadsheet, requests: list):
    """batchUpdate 래퍼 (빈 요청 무시)"""
    if requests:
        spreadsheet.batch_update({"requests": requests})


def solid_border(color=None):
    if color is None:
        color = C_LGRAY
    return {"style": "SOLID", "width": 1, "color": color}


# ── 매장 시트 ─────────────────────────────────────────────────
def get_or_create_worksheet(spreadsheet, title: str) -> gspread.Worksheet:
    titles = [ws.title for ws in spreadsheet.worksheets()]
    if title in titles:
        return spreadsheet.worksheet(title)
    ws = spreadsheet.add_worksheet(title=title, rows=60, cols=80)
    print(f"    → 시트 신규 생성: {title}")
    time.sleep(0.5)
    return ws


def init_store_sheet(spreadsheet, ws: gspread.Worksheet, store: str):
    """매장 시트 골격 작성.
    - A열 데이터: A3가 비어 있을 때만 작성
    - 서식 배치: 항상 적용 (unmergeCells 포함으로 멱등성 보장)
    """
    all_vals = ws.get_all_values()
    a3_has_data = (len(all_vals) >= 3 and
                   len(all_vals[2]) >= 1 and
                   all_vals[2][0] == FIELDS[0])

    if not a3_has_data:
        ws.update([[f"【 {store} 】  월간 목표 관리"]], "A1")
        ws.update([["항목"]], "A2")
        ws.update([[f] for f in FIELDS], f"A3:A{2 + len(FIELDS)}")
        time.sleep(0.3)

    sid = ws.id
    last_field_row = 2 + len(FIELDS)  # 10

    requests = [
        # 기존 A1 병합 해제 (재실행 시 병합+열고정 충돌 방지)
        {"unmergeCells": {
            "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 0, "endColumnIndex": 8},
        }},
        # A1 서식 - 타이틀 (병합 없이 단일 셀 스타일)
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 0, "endColumnIndex": 1},
            "cell": {"userEnteredFormat": {
                "backgroundColor": C_NAVY,
                "textFormat": {"foregroundColor": C_WHITE, "bold": True, "fontSize": 13},
                "horizontalAlignment": "LEFT",
                "verticalAlignment": "MIDDLE",
            }},
            "fields": "userEnteredFormat",
        }},
        # A2 서식 - '항목' 헤더
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 2,
                      "startColumnIndex": 0, "endColumnIndex": 1},
            "cell": {"userEnteredFormat": {
                "backgroundColor": C_NAVY,
                "textFormat": {"foregroundColor": C_WHITE, "bold": True},
                "horizontalAlignment": "CENTER",
                "verticalAlignment": "MIDDLE",
            }},
            "fields": "userEnteredFormat",
        }},
        # A3:A10 서식 - 항목 이름
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 2, "endRowIndex": last_field_row,
                      "startColumnIndex": 0, "endColumnIndex": 1},
            "cell": {"userEnteredFormat": {
                "backgroundColor": C_LBLUE,
                "textFormat": {"bold": True},
                "verticalAlignment": "MIDDLE",
                "wrapStrategy": "WRAP",
            }},
            "fields": "userEnteredFormat",
        }},
        # A열 너비 160px
        {"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "COLUMNS",
                      "startIndex": 0, "endIndex": 1},
            "properties": {"pixelSize": 160},
            "fields": "pixelSize",
        }},
        # 행 1 높이 40px
        {"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "ROWS",
                      "startIndex": 0, "endIndex": 1},
            "properties": {"pixelSize": 40},
            "fields": "pixelSize",
        }},
        # 행 2 높이 32px
        {"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "ROWS",
                      "startIndex": 1, "endIndex": 2},
            "properties": {"pixelSize": 32},
            "fields": "pixelSize",
        }},
        # 행 3~10 높이 65px
        {"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "ROWS",
                      "startIndex": 2, "endIndex": last_field_row},
            "properties": {"pixelSize": 65},
            "fields": "pixelSize",
        }},
        # 테두리
        {"updateBorders": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": last_field_row,
                      "startColumnIndex": 0, "endColumnIndex": 1},
            "top":    solid_border(),
            "bottom": solid_border(),
            "left":   solid_border(),
            "right":  solid_border(),
            "innerHorizontal": solid_border(),
        }},
        # 화면 고정: 첫 2행 + A열 1열 (병합 제거 후에 적용해야 작동)
        {"updateSheetProperties": {
            "properties": {
                "sheetId": sid,
                "gridProperties": {"frozenRowCount": 2, "frozenColumnCount": 1},
            },
            "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        }},
    ]
    batch(spreadsheet, requests)
    time.sleep(0.3)


def add_month_column(spreadsheet, ws: gspread.Worksheet, year: int, month: int):
    """해당 월 컬럼 추가 또는 기존 컬럼 인덱스 반환 (1-based)"""
    label = month_label(year, month)
    row2  = ws.row_values(2)

    if label in row2:
        idx = row2.index(label) + 1
        return idx, False

    # 새 컬럼: B열부터 시작 (A=1 이므로 max(len+1, 2))
    idx = max(len(row2) + 1, 2)
    ws.update([[label]], f"{col_letter(idx)}2")
    time.sleep(0.3)

    sid          = ws.id
    col0         = idx - 1          # 0-based
    last_field   = 2 + len(FIELDS)  # 10 (0-based exclusive)

    requests = [
        # 월 헤더 서식
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 2,
                      "startColumnIndex": col0, "endColumnIndex": col0 + 1},
            "cell": {"userEnteredFormat": {
                "backgroundColor": C_GREEN,
                "textFormat": {"foregroundColor": C_WHITE, "bold": True},
                "horizontalAlignment": "CENTER",
                "verticalAlignment": "MIDDLE",
            }},
            "fields": "userEnteredFormat",
        }},
        # 입력 셀 너비 220px
        {"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "COLUMNS",
                      "startIndex": col0, "endIndex": col0 + 1},
            "properties": {"pixelSize": 220},
            "fields": "pixelSize",
        }},
        # 입력 셀: 줄바꿈 + 상단 정렬
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 2, "endRowIndex": last_field,
                      "startColumnIndex": col0, "endColumnIndex": col0 + 1},
            "cell": {"userEnteredFormat": {
                "wrapStrategy": "WRAP",
                "verticalAlignment": "TOP",
                "backgroundColor": C_WHITE,
            }},
            "fields": "userEnteredFormat",
        }},
        # 테두리
        {"updateBorders": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": last_field,
                      "startColumnIndex": col0, "endColumnIndex": col0 + 1},
            "top":    solid_border(),
            "bottom": solid_border(),
            "left":   solid_border(),
            "right":  solid_border(),
            "innerHorizontal": solid_border(),
        }},
    ]
    batch(spreadsheet, requests)
    time.sleep(0.3)
    return idx, True


# ── 요약 시트 ─────────────────────────────────────────────────
def update_summary_sheet(spreadsheet, year: int, month: int):
    """요약 시트 생성/갱신 - 각 매장 시트에서 INDEX+MATCH로 데이터 참조"""
    ws = get_or_create_worksheet(spreadsheet, SUMMARY_TITLE)
    ws.clear()
    time.sleep(0.3)

    label    = month_label(year, month)
    n_fields = len(FIELDS)
    n_stores = len(STORES)

    # ── 값/수식 조립 ──
    all_rows = []

    # 행1: 타이틀
    all_rows.append([f"【 위베이프 전체 매장 요약 】  {label}"] + [""] * n_fields)

    # 행2: 헤더
    all_rows.append(["매장명"] + FIELDS)

    # 행3~: 매장별 (INDEX+MATCH 수식으로 각 매장 시트 참조)
    existing = {w.title for w in spreadsheet.worksheets()}
    for store in STORES:
        if store not in existing:
            all_rows.append([store] + ["(시트 없음)"] * n_fields)
            continue
        row = [store]
        for field_row in range(3, 3 + n_fields):  # 3~10
            # =IFERROR(INDEX('매장'!A:ZZ, 행번호, MATCH("월라벨",'매장'!2:2, 0)), "")
            formula = (
                f"=IFERROR(INDEX('{store}'!A:ZZ,{field_row},"
                f"MATCH(\"{label}\",'{store}'!2:2,0)),\"\")"
            )
            row.append(formula)
        all_rows.append(row)

    ws.update(all_rows, "A1", value_input_option="USER_ENTERED")
    time.sleep(0.5)

    # ── 서식 ──
    sid    = ws.id
    n_cols = n_fields + 1  # 매장명 포함

    requests = [
        # 타이틀 병합
        {"mergeCells": {
            "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 0, "endColumnIndex": n_cols},
            "mergeType": "MERGE_ALL",
        }},
        # 타이틀 서식
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1,
                      "startColumnIndex": 0, "endColumnIndex": n_cols},
            "cell": {"userEnteredFormat": {
                "backgroundColor": C_DNAVY,
                "textFormat": {"foregroundColor": C_WHITE, "bold": True, "fontSize": 14},
                "horizontalAlignment": "CENTER",
                "verticalAlignment": "MIDDLE",
            }},
            "fields": "userEnteredFormat",
        }},
        # 헤더 행 서식
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 2,
                      "startColumnIndex": 0, "endColumnIndex": n_cols},
            "cell": {"userEnteredFormat": {
                "backgroundColor": C_NAVY,
                "textFormat": {"foregroundColor": C_WHITE, "bold": True},
                "horizontalAlignment": "CENTER",
                "verticalAlignment": "MIDDLE",
            }},
            "fields": "userEnteredFormat",
        }},
        # 매장명 열 서식
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 2, "endRowIndex": 2 + n_stores,
                      "startColumnIndex": 0, "endColumnIndex": 1},
            "cell": {"userEnteredFormat": {
                "backgroundColor": C_LBLUE,
                "textFormat": {"bold": True},
                "horizontalAlignment": "CENTER",
                "verticalAlignment": "MIDDLE",
            }},
            "fields": "userEnteredFormat",
        }},
        # 데이터 셀 줄바꿈
        {"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 2, "endRowIndex": 2 + n_stores,
                      "startColumnIndex": 1, "endColumnIndex": n_cols},
            "cell": {"userEnteredFormat": {
                "wrapStrategy": "WRAP",
                "verticalAlignment": "TOP",
            }},
            "fields": "userEnteredFormat(wrapStrategy,verticalAlignment)",
        }},
        # 타이틀 행 높이 44px
        {"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "ROWS",
                      "startIndex": 0, "endIndex": 1},
            "properties": {"pixelSize": 44},
            "fields": "pixelSize",
        }},
        # 헤더 행 높이 32px
        {"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "ROWS",
                      "startIndex": 1, "endIndex": 2},
            "properties": {"pixelSize": 32},
            "fields": "pixelSize",
        }},
        # 데이터 행 높이 80px
        {"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "ROWS",
                      "startIndex": 2, "endIndex": 2 + n_stores},
            "properties": {"pixelSize": 80},
            "fields": "pixelSize",
        }},
        # 매장명 열 너비 140px
        {"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "COLUMNS",
                      "startIndex": 0, "endIndex": 1},
            "properties": {"pixelSize": 140},
            "fields": "pixelSize",
        }},
        # 데이터 열 너비 200px
        {"updateDimensionProperties": {
            "range": {"sheetId": sid, "dimension": "COLUMNS",
                      "startIndex": 1, "endIndex": n_cols},
            "properties": {"pixelSize": 200},
            "fields": "pixelSize",
        }},
        # 테두리 (헤더~마지막 매장)
        {"updateBorders": {
            "range": {"sheetId": sid, "startRowIndex": 1, "endRowIndex": 2 + n_stores,
                      "startColumnIndex": 0, "endColumnIndex": n_cols},
            "top":             solid_border(),
            "bottom":          solid_border(),
            "left":            solid_border(),
            "right":           solid_border(),
            "innerHorizontal": solid_border(),
            "innerVertical":   solid_border(),
        }},
        # 화면 고정: 첫 2행만 (열 고정 없음 - A1 병합 셀과 충돌 방지)
        {"updateSheetProperties": {
            "properties": {
                "sheetId": sid,
                "gridProperties": {"frozenRowCount": 2, "frozenColumnCount": 0},
            },
            "fields": "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
        }},
    ]
    batch(spreadsheet, requests)
    time.sleep(0.3)

    # 요약 시트를 맨 앞으로 이동
    all_ws     = spreadsheet.worksheets()
    summary_ws = next(w for w in all_ws if w.title == SUMMARY_TITLE)
    others     = [w for w in all_ws if w.title != SUMMARY_TITLE]
    spreadsheet.reorder_worksheets([summary_ws] + others)
    time.sleep(0.3)

    print(f"    요약 시트 갱신 완료 ({label})")


# ── 메인 ──────────────────────────────────────────────────────
def main():
    now   = datetime.now()
    year  = now.year
    month = now.month
    label = month_label(year, month)

    divider = "=" * 58
    print(f"\n{divider}")
    print(f"  위베이프 월간 목표 시트 자동화")
    print(f"  실행 월 : {label}  ({now.strftime('%Y-%m-%d %H:%M')})")
    print(f"{divider}\n")

    # 1. 연결
    print("[1/3] Google Sheets 연결 중...")
    json_key = find_json_key()
    print(f"  키 파일 : {os.path.basename(json_key)}")
    creds        = Credentials.from_service_account_file(json_key, scopes=SCOPES)
    client       = gspread.authorize(creds)
    spreadsheet  = client.open_by_key(SPREADSHEET_ID)
    print(f"  연결 성공: {spreadsheet.title}\n")

    # 2. 매장 시트
    print("[2/3] 매장 시트 처리 중...")
    for store in STORES:
        print(f"  > {store}")
        ws = get_or_create_worksheet(spreadsheet, store)
        init_store_sheet(spreadsheet, ws, store)
        col_idx, is_new = add_month_column(spreadsheet, ws, year, month)
        status = "신규 열 추가됨" if is_new else "기존 열 유지"
        print(f"      {label} → {col_letter(col_idx)}열 [{status}]")

    # 3. 요약 시트
    print(f"\n[3/3] 요약 시트 갱신 중...")
    update_summary_sheet(spreadsheet, year, month)

    print(f"\n{divider}")
    print(f"  [완료]  {label} 설정이 모두 완료되었습니다.")
    print(f"  URL : {SPREADSHEET_URL}")
    print(f"{divider}\n")


if __name__ == "__main__":
    main()
