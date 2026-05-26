# -*- coding: utf-8 -*-
"""
전국민 혜택존 - 데이터 자동 수집 엔진 v4
매일 오전 7시(KST) GitHub Actions에서 실행

v4 변경사항:
  - 금감원 은행상품 완전 제거 (정부 혜택만)
  - collected_date 필드 추가 (신규 항목 구분)
  - 이전 데이터와 비교하여 신규/유지 구분
"""

import os
import json
import re
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 환경 변수 (GitHub Secrets)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA_API_KEY = os.environ.get("DATA_API_KEY", "").strip()
BIZ_API_KEY  = os.environ.get("BIZ_API_KEY", "").strip()
FSS_API_KEY  = os.environ.get("FSS_API_KEY", "").strip()
NAVER_CLIENT_ID     = os.environ.get("NAVER_CLIENT_ID", "").strip()
NAVER_CLIENT_SECRET = os.environ.get("NAVER_CLIENT_SECRET", "").strip()

KST  = timezone(timedelta(hours=9))
NOW  = datetime.now(KST)
TODAY = NOW.strftime("%Y-%m-%d")

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 지역 분류
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGION_MAP = {
    "서울": ["서울특별시", "서울시", "서울"],
    "부산": ["부산광역시", "부산시", "부산"],
    "대구": ["대구광역시", "대구시", "대구"],
    "인천": ["인천광역시", "인천시", "인천"],
    "광주": ["광주광역시", "광주시", "광주"],
    "대전": ["대전광역시", "대전시", "대전"],
    "울산": ["울산광역시", "울산시", "울산"],
    "세종": ["세종특별자치시", "세종시", "세종"],
    "경기": ["경기도", "경기"],
    "강원": ["강원특별자치도", "강원도", "강원"],
    "충북": ["충청북도", "충북"],
    "충남": ["충청남도", "충남"],
    "전북": ["전북특별자치도", "전라북도", "전북"],
    "전남": ["전라남도", "전남"],
    "경북": ["경상북도", "경북"],
    "경남": ["경상남도", "경남"],
    "제주": ["제주특별자치도", "제주도", "제주"],
}

CENTRAL_ORGS = [
    "국세청", "행정안전부", "보건복지부", "교육부", "고용노동부",
    "산업통상자원부", "국토교통부", "중소벤처기업부", "과학기술정보통신부",
    "문화체육관광부", "환경부", "농림축산식품부", "해양수산부",
    "국방부", "법무부", "여성가족부", "산림청",
    "기획재정부", "인사혁신처", "금융위원회", "금융감독원",
    "한국주택금융공사", "국민건강보험공단", "근로복지공단",
    "한국장학재단", "한국고용정보원", "한국토지주택공사",
    "국민연금공단", "건강보험심사평가원",
    "소방청", "경찰청", "질병관리청", "식품의약품안전처",
    "통계청", "관세청", "조달청", "특허청", "병무청",
    "한국자산관리공사", "신용회복위원회", "서민금융진흥원",
]


def extract_region(text):
    if not text:
        return "전국"
    for central in CENTRAL_ORGS:
        if central in text:
            return "전국"
    for region, keywords in REGION_MAP.items():
        for kw in keywords:
            if kw in text:
                return region
    return "전국"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 화이트리스트 / 블랙리스트 v4
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUBSIDY_NAME_KEYWORDS = [
    "근로장려", "자녀장려", "장려금",
    "아동수당", "양육수당", "부모급여", "영아수당",
    "기초연금", "노령연금",
    "실업급여", "구직급여", "취업성공패키지",
    "출산지원", "출산장려", "출산축하", "출산비", "출산금", "출산급여",
    "첫만남이용권", "첫만남 이용권",
    "청년수당", "청년지원금", "청년내일저축", "청년도약계좌",
    "청년내일채움",
    "지원금", "생활지원", "민생지원", "민생안정", "민생회복",
    "긴급생활지원", "재난지원", "특별지원금",
    "격려금", "축하금", "장수수당", "효도수당",
    "육아휴직급여", "출산휴가급여", "배우자출산",
    "보육료 지원", "유아교육비", "아이돌봄",
    "에너지바우처", "전기요금 감면", "전기요금 할인",
    "가스비 지원", "난방비 지원", "냉방비 지원",
    "도시가스 지원", "연료비 지원",
    "건강보험료 경감", "건강보험료 감면",
    "통신비 감면", "통신비 지원",
    "국민행복카드",
    "다자녀 혜택", "다자녀 지원", "다둥이",
    "한부모 지원", "한부모가족",
    "노인일자리", "경로우대",
    "교육비 지원", "급식비 지원", "교복지원", "입학축하금",
    "교육급여",
]

SUBSIDY_DESC_KEYWORDS = [
    "현금 지급", "현금지급", "현금으로 지원",
    "계좌로 입금", "계좌 입금", "통장 입금",
    "바우처 지급", "이용권 지급", "포인트 지급",
    "월 지급", "매월 지원", "1회 지급",
    "만원 지급", "만원 지원",
]

HOUSING_KEYWORDS = [
    "월세 지원", "월세지원", "월세 보조", "월세보조",
    "전세 지원", "전세지원", "전세자금", "전세보증금",
    "주거급여", "주거비 지원", "주거비지원",
    "주거바우처", "주거안정",
    "임대주택", "공공임대", "행복주택", "매입임대", "전세임대",
    "주택자금", "주택대출",
    "집수리 지원", "주거환경 개선",
    "청년월세", "청년 월세", "청년주거", "청년 주거",
    "신혼부부 주거", "신혼부부 전세", "신혼부부 임대",
    "주택청약",
    "이사비 지원",
]

MEDICAL_KEYWORDS = [
    "건강보험", "건강검진",
    "틀니 지원", "틀니지원", "임플란트 지원", "임플란트지원",
    "치매 지원", "치매관리", "치매검진",
    "장기요양", "노인돌봄", "간병 지원",
    "재활 지원", "재활치료",
    "산후조리", "난임 지원", "난임시술", "산모 지원",
    "예방접종 지원", "예방접종비",
    "진료비 지원", "수술비 지원", "입원비 지원",
    "약제비 지원", "보청기 지원",
    "장애인 보조기기",
    "의료비 지원", "의료비지원",
    "정신건강", "심리상담 지원",
]

BIZ_WHITELIST = [
    "소상공인", "정책자금", "경영안정", "경영안정자금",
    "특례보증", "이차보전", "이자보전",
    "이자차액", "이자감면", "이자지원",
    "무이자", "저금리", "저리 대출", "저리대출",
    "임대료 지원", "월세 지원", "임차료",
    "배달비 지원", "카드수수료",
    "전기요금 지원", "에너지비용",
    "온누리", "전통시장",
    "청년창업", "창업자금", "창업지원", "창업대출",
    "폐업지원", "재기지원", "경영개선",
    "고용안정", "고용장려", "일자리안정",
    "중소기업육성", "육성자금", "육성기금",
    "긴급경영안정", "긴급자금",
    "소공인", "자영업",
]

FINANCE_GOV_KEYWORDS = [
    "햇살론", "새희망홀씨", "미소금융", "바꿔드림론",
    "서민대출", "서민금융", "저신용 대출", "저소득 대출",
    "긴급대출", "긴급생계대출",
    "소액대출", "소액생계", "무담보 대출",
    "전세자금대출", "전세대출", "버팀목대출",
    "주택구입자금", "디딤돌대출", "보금자리론",
    "학자금대출", "든든학자금",
    "이자지원", "이자감면", "이자보전", "이자차액",
    "금리인하", "금리우대", "금리감면",
    "대출이자 지원", "대출이자 감면",
    "청년도약계좌", "청년내일저축", "청년내일채움",
    "청년희망적금", "청년우대",
    "청년창업대출", "청년전세", "청년대출",
    "신용회복", "채무조정", "채무감면", "개인회생",
    "워크아웃", "신용상담",
    "보증지원", "보증서 발급", "신용보증",
    "주택보증", "전세보증금 반환",
    "금융상담", "재무상담", "서민금융통합지원",
    "이자 지원", "이자 보전",
    "대출 지원", "대출 이자",
]

NAME_BLACKLIST = [
    "유공자", "참전", "보훈", "북한이탈", "탈북",
    "의사상자", "귀화",
    "영농", "후계농", "사료", "비료", "직불금",
    "어선", "어항",
    "사회적기업 인증", "연구단", "체육회",
    "원자력", "항공우주",
    "경로당 운영", "CCTV 설치", "가로등",
    "도로 확장", "하수관",
    "수출바우처", "기술보호 바우처",
    "R&D 지원", "스마트공장",
    "대체초지", "초지조성",
    "유기동물", "동물등록",
    "안검하수", "문화재 수리",
]

COMBINED_BLACKLIST = [
    "농업인만", "농가 대상", "어업인만",
    "현역 군인", "직업군인",
    "공무원 대상",
]

BIZ_BLACKLIST = [
    "수출", "해외진출", "바이어", "R&D", "기술개발", "특허출원",
    "스마트공장", "원자력", "항공우주",
    "농업", "축산", "수산", "어업", "임업",
    "사회적기업", "협동조합 설립",
]

FINANCE_BLACKLIST = [
    "사업자 대출", "기업 대출", "법인",
    "수출 금융", "무역 금융",
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 공통 유틸 함수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def fetch_url(url, headers=None, data=None, timeout=30, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url)
            if headers:
                for k, v in headers.items():
                    req.add_header(k, v)
            if data:
                response = urllib.request.urlopen(req, data=data.encode("utf-8"), timeout=timeout)
            else:
                response = urllib.request.urlopen(req, timeout=timeout)
            raw = response.read().decode("utf-8")
            return json.loads(raw)
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 * (attempt + 1)
                print(f"  ⚠️ 요청 실패 ({attempt+1}/{retries}): {url[:80]}... → {e}")
                time.sleep(wait)
            else:
                print(f"  ❌ 최종 실패: {url[:80]}... → {e}")
                return None


def save_json(filename, data):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    count = len(data) if isinstance(data, (list, dict)) else ".."
    print(f"  💾 저장: {filename} ({count}건)")


def load_json(filename):
    """기존 JSON 파일 로드 (이전 데이터와 비교용)."""
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []


def match_any(text, keywords):
    if not text:
        return False
    return any(kw in text for kw in keywords)


def strip_html(text):
    if not text:
        return ""
    return re.sub(r'<[^>]+>', '', text).strip()


def dedup_by_name_region(items):
    seen = {}
    result = []
    for item in items:
        name_key = re.sub(r'\s+', '', item["name"])
        region = item.get("region", "전국")
        key = f"{name_key}_{region}"
        if key in seen:
            existing = seen[key]
            if item.get("trend_score", 0) > existing.get("trend_score", 0):
                seen[key] = item
                result = [x for x in result if not (
                    re.sub(r'\s+', '', x["name"]) == name_key
                    and x.get("region") == region
                )]
                result.append(item)
        else:
            seen[key] = item
            result.append(item)
    return result


def stamp_collected_date(new_items, old_items):
    """
    신규 항목에는 오늘 날짜, 기존 항목은 이전 날짜 유지.
    이전 데이터에 없던 ID → 🆕 오늘 날짜
    이전 데이터에 있던 ID → 기존 collected_date 유지
    """
    old_map = {}
    for item in old_items:
        old_map[item.get("id", "")] = item.get("collected_date", "")

    for item in new_items:
        item_id = item.get("id", "")
        if item_id in old_map and old_map[item_id]:
            item["collected_date"] = old_map[item_id]
        else:
            item["collected_date"] = TODAY

    return new_items


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [1] 💰 정부24 API → subsidies / housing / medical
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def build_gov_url(service_id, org_name):
    return f"https://www.gov.kr/portal/rcvfvrSvc/dtlEx/{service_id}"


def get_subsidies():
    if not DATA_API_KEY:
        print("\n[1] 정부24 — API 키 없음, 건너뜀")
        return [], [], []

    print("\n[1] 정부24 서비스목록 수집 중...")
    base_url = "https://api.odcloud.kr/api/gov24/v3/serviceList"

    check_url = f"{base_url}?page=1&perPage=1&serviceKey={DATA_API_KEY}"
    check = fetch_url(check_url)
    if not check or "totalCount" not in check:
        print("  ⚠️ 총 건수 확인 실패")
        return [], [], []

    total = check["totalCount"]
    per_page = 500
    total_pages = (total + per_page - 1) // per_page
    print(f"  총 {total}건, {total_pages}페이지 수집 예정")

    all_keywords = SUBSIDY_NAME_KEYWORDS + HOUSING_KEYWORDS + MEDICAL_KEYWORDS

    raw_items = []
    seen_ids = set()
    consecutive_fail = 0

    for page in range(1, total_pages + 1):
        url = f"{base_url}?page={page}&perPage={per_page}&serviceKey={DATA_API_KEY}"
        result = fetch_url(url, retries=3)

        if not result or "data" not in result:
            consecutive_fail += 1
            print(f"  ⚠️ {page}페이지 실패 (연속 {consecutive_fail}회)")
            if consecutive_fail >= 5:
                print("  ❌ 연속 5회 실패, 수집 중단")
                break
            continue

        consecutive_fail = 0

        for item in result["data"]:
            sid = item.get("서비스ID", "")
            if not sid or sid in seen_ids:
                continue
            seen_ids.add(sid)

            name = item.get("서비스명", "") or ""
            desc = item.get("서비스목적요약", "") or ""
            target = item.get("지원대상", "") or ""
            org = item.get("소관기관명", "") or ""
            how = item.get("신청방법", "") or ""

            name_match = match_any(name, all_keywords)
            desc_match = False
            if not name_match:
                desc_match = match_any(desc + target, SUBSIDY_DESC_KEYWORDS)

            if not name_match and not desc_match:
                continue

            if match_any(name, NAME_BLACKLIST):
                continue

            combined = name + desc + target
            if match_any(combined, COMBINED_BLACKLIST):
                continue

            region = extract_region(org)

            raw_items.append({
                "id": sid,
                "name": name,
                "desc": strip_html(desc)[:200],
                "org": org,
                "target": strip_html(target)[:300],
                "how": how,
                "url": build_gov_url(sid, org),
                "region": region,
                "deadline": "상시",
                "trend_score": 0,
                "collected_date": TODAY,
            })

        if page % 5 == 0 or page == total_pages:
            print(f"  ... {page}/{total_pages} 완료 (누적 {len(raw_items)}건)")
        time.sleep(0.2)

    print(f"  필터 통과 총: {len(raw_items)}건")

    subsidies = []
    housing = []
    medical = []

    for item in raw_items:
        name = item["name"]
        if match_any(name, HOUSING_KEYWORDS):
            housing.append(item)
        elif match_any(name, MEDICAL_KEYWORDS):
            medical.append(item)
        else:
            subsidies.append(item)

    subsidies = dedup_by_name_region(subsidies)
    housing   = dedup_by_name_region(housing)
    medical   = dedup_by_name_region(medical)

    print(f"  💰 정부지원·민생: {len(subsidies)}건")
    print(f"  🏠 주거·부동산: {len(housing)}건")
    print(f"  🏥 의료·건강: {len(medical)}건")

    return subsidies, housing, medical


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [2] 🏢 기업마당 API → business
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_business():
    if not BIZ_API_KEY:
        print("\n[2] 기업마당 — API 키 없음, 건너뜀")
        return []

    print("\n[2] 기업마당 소상공인 지원 수집 중...")
    base_url = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do"

    sectors = ["01", "06", "07", "09"]
    all_items = []
    seen_ids = set()

    for code in sectors:
        for page_idx in range(1, 4):
            url = (
                f"{base_url}?crtfcKey={BIZ_API_KEY}"
                f"&dataType=json"
                f"&pageUnit=50"
                f"&pageIndex={page_idx}"
                f"&searchLclasId={code}"
            )
            result = fetch_url(url)
            if not result:
                continue

            items = extract_biz_items(result)
            print(f"  분야 {code} 페이지 {page_idx}: {len(items)}건 수신")

            for item in items:
                pid = item.get("pblancId") or item.get("seq") or item.get("link", "")
                title = strip_html(item.get("pblancNm") or item.get("title") or "")
                desc = strip_html(item.get("bsnsSumryCn") or item.get("description") or "")

                if not title or pid in seen_ids:
                    continue
                seen_ids.add(pid)

                combined = title + desc
                if match_any(combined, BIZ_BLACKLIST):
                    continue
                if not match_any(combined, BIZ_WHITELIST):
                    continue

                apply_date = item.get("reqstBeginEndDe") or item.get("reqstDt") or ""
                hashtags = item.get("hashTags", "") or ""
                org = item.get("jrsdInsttNm") or item.get("author") or ""
                region = extract_region(org)
                if region == "전국":
                    region = extract_region(hashtags)

                link = item.get("pblancUrl") or item.get("link") or ""
                if not link and pid:
                    link = f"https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?pblancId={pid}"

                all_items.append({
                    "id": str(pid),
                    "name": title,
                    "desc": desc[:200],
                    "org": org,
                    "target": item.get("trgetNm", "") or "",
                    "how": item.get("reqstMthPapersCn", "") or "",
                    "url": link,
                    "region": region,
                    "deadline": parse_deadline(apply_date),
                    "trend_score": 0,
                    "collected_date": TODAY,
                })

            time.sleep(0.5)

    all_items = dedup_by_name_region(all_items)
    print(f"  🏢 소상공인·정책자금: {len(all_items)}건")
    return all_items


def extract_biz_items(result):
    if isinstance(result, list):
        return result
    if not isinstance(result, dict):
        return []

    json_array = result.get("jsonArray", result)

    if isinstance(json_array, dict):
        items = json_array.get("item", [])
        if isinstance(items, dict):
            return [items]
        if isinstance(items, list):
            return items
        for key, val in json_array.items():
            if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict):
                if "pblancNm" in val[0] or "title" in val[0]:
                    return val

    if isinstance(json_array, list):
        return json_array

    return []


def parse_deadline(apply_date):
    if not apply_date:
        return "상시"
    if "예산" in apply_date or "소진" in apply_date:
        return "예산소진시"
    if "~" in apply_date:
        end_part = apply_date.split("~")[-1].strip()
        cleaned = re.sub(r'[.\-/\s]', '', end_part)
        if len(cleaned) == 8 and cleaned.isdigit():
            return f"{cleaned[:4]}-{cleaned[4:6]}-{cleaned[6:8]}"
        m = re.search(r'(\d{4}[-./]\d{2}[-./]\d{2})', end_part)
        if m:
            return m.group(1).replace(".", "-").replace("/", "-")
    return "상시"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [3] 💡 금융·재테크 — 정부 혜택만 (은행상품 제외)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_finance():
    """
    금융·재테크: 정부 혜택만 수집 (은행 상품 완전 제외)
      A) 정부24 API → 햇살론, 미소금융, 이자감면, 청년금융
      B) 기업마당 API → 소상공인 이자지원
    """
    print("\n[3] 💡 금융·재테크 수집 중...")

    all_items = []
    seen_names = set()

    # A) 정부24 금융혜택
    gov_finance = get_finance_from_gov24()
    for item in gov_finance:
        key = item["name"]
        if key not in seen_names:
            seen_names.add(key)
            all_items.append(item)
    print(f"  A) 정부24 금융혜택: {len(gov_finance)}건")

    # B) 기업마당 이자지원
    biz_finance = get_finance_from_bizinfo()
    for item in biz_finance:
        key = item["name"]
        if key not in seen_names:
            seen_names.add(key)
            all_items.append(item)
    print(f"  B) 기업마당 금융혜택: {len(biz_finance)}건")

    # ★ 금감원 은행상품 완전 제외

    all_items = dedup_by_name_region(all_items)
    print(f"  💡 금융·재테크 최종: {len(all_items)}건")
    return all_items


def get_finance_from_gov24():
    if not DATA_API_KEY:
        return []

    base_url = "https://api.odcloud.kr/api/gov24/v3/serviceList"
    check_url = f"{base_url}?page=1&perPage=1&serviceKey={DATA_API_KEY}"
    check = fetch_url(check_url)
    if not check or "totalCount" not in check:
        return []

    total = check["totalCount"]
    per_page = 500
    total_pages = (total + per_page - 1) // per_page

    items = []
    seen_ids = set()

    for page in range(1, total_pages + 1):
        url = f"{base_url}?page={page}&perPage={per_page}&serviceKey={DATA_API_KEY}"
        result = fetch_url(url, retries=3)

        if not result or "data" not in result:
            continue

        for item in result["data"]:
            sid = item.get("서비스ID", "")
            if not sid or sid in seen_ids:
                continue
            seen_ids.add(sid)

            name = item.get("서비스명", "") or ""
            desc = item.get("서비스목적요약", "") or ""
            target = item.get("지원대상", "") or ""
            org = item.get("소관기관명", "") or ""
            how = item.get("신청방법", "") or ""
            combined = name + desc + target

            if not match_any(combined, FINANCE_GOV_KEYWORDS):
                continue
            if match_any(name, NAME_BLACKLIST):
                continue
            if match_any(combined, FINANCE_BLACKLIST):
                continue

            region = extract_region(org)

            items.append({
                "id": sid,
                "name": name,
                "desc": strip_html(desc)[:200],
                "org": org,
                "target": strip_html(target)[:300],
                "how": how,
                "url": build_gov_url(sid, org),
                "region": region,
                "deadline": "상시",
                "trend_score": 0,
                "source": "정부24",
                "finance_type": classify_finance_type(name + desc),
                "collected_date": TODAY,
            })

        time.sleep(0.2)

    return items


def get_finance_from_bizinfo():
    if not BIZ_API_KEY:
        return []

    base_url = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do"
    items = []
    seen_ids = set()

    for page_idx in range(1, 6):
        url = (
            f"{base_url}?crtfcKey={BIZ_API_KEY}"
            f"&dataType=json"
            f"&pageUnit=50"
            f"&pageIndex={page_idx}"
            f"&searchLclasId=01"
        )
        result = fetch_url(url)
        if not result:
            continue

        raw_items = extract_biz_items(result)

        for item in raw_items:
            pid = item.get("pblancId") or item.get("seq") or ""
            title = strip_html(item.get("pblancNm") or item.get("title") or "")
            desc = strip_html(item.get("bsnsSumryCn") or item.get("description") or "")

            if not title or pid in seen_ids:
                continue
            seen_ids.add(pid)

            combined = title + desc
            finance_keywords = [
                "이자지원", "이자보전", "이자차액", "이자감면",
                "이차보전", "금리", "대출", "자금",
                "소상공인", "자영업", "청년창업",
            ]
            if not match_any(combined, finance_keywords):
                continue
            if match_any(combined, BIZ_BLACKLIST):
                continue

            hashtags = item.get("hashTags", "") or ""
            org = item.get("jrsdInsttNm") or item.get("author") or ""
            region = extract_region(org)
            if region == "전국":
                region = extract_region(hashtags)

            link = item.get("pblancUrl") or item.get("link") or ""
            if not link and pid:
                link = f"https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?pblancId={pid}"

            apply_date = item.get("reqstBeginEndDe") or item.get("reqstDt") or ""

            items.append({
                "id": str(pid),
                "name": title,
                "desc": desc[:200],
                "org": org,
                "target": item.get("trgetNm", "") or "",
                "how": "",
                "url": link,
                "region": region,
                "deadline": parse_deadline(apply_date),
                "trend_score": 0,
                "source": "기업마당",
                "finance_type": classify_finance_type(title + desc),
                "collected_date": TODAY,
            })

        time.sleep(0.5)

    return items


def classify_finance_type(text):
    if not text:
        return "기타"

    type_map = [
        ("서민대출", ["햇살론", "새희망홀씨", "미소금융", "바꿔드림론", "서민대출", "서민금융", "긴급대출", "소액대출"]),
        ("대출이자 감면", ["이자지원", "이자감면", "이자보전", "이차보전", "이자차액", "금리인하", "금리우대"]),
        ("전세·주택대출", ["전세자금", "전세대출", "버팀목", "디딤돌", "보금자리론", "주택구입", "주택담보"]),
        ("청년 금융", ["청년도약", "청년내일", "청년희망", "청년우대", "청년창업대출", "청년전세", "청년대출"]),
        ("신용회복", ["신용회복", "채무조정", "채무감면", "개인회생", "워크아웃"]),
        ("보증지원", ["보증지원", "보증서 발급", "신용보증", "전세보증금 반환"]),
        ("학자금", ["학자금", "든든학자금"]),
    ]

    for type_name, keywords in type_map:
        for kw in keywords:
            if kw in text:
                return type_name

    return "기타 금융"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [4] 📈 네이버 데이터랩 트렌드 점수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TREND_KEYWORDS = [
    "근로장려금", "자녀장려금", "아동수당", "부모급여", "양육수당",
    "기초연금", "노인일자리", "실업급여", "출산지원금", "첫만남이용권",
    "에너지바우처", "전기요금 감면", "가스비 지원", "난방비 지원",
    "국민행복카드",
    "청년수당", "청년월세", "민생지원금", "민생회복지원금",
    "교육급여", "교육비 지원", "급식비 지원",
    "소상공인 정책자금", "경영안정자금", "특례보증", "이차보전",
    "소상공인 대출", "배달비 지원", "카드수수료 환급",
    "전세자금대출", "월세 지원", "주거급여", "공공임대", "행복주택",
    "청년전세", "신혼부부 주거", "주택청약",
    "건강검진", "틀니 지원", "임플란트 지원", "치매 지원",
    "난임 지원", "장기요양",
    "햇살론", "미소금융", "서민대출", "청년도약계좌",
    "전세대출 금리", "이자감면",
]


def get_naver_trends():
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        print("\n[4-1] 네이버 데이터랩 — API 키 없음, 건너뜀")
        return {}

    print("\n[4-1] 네이버 데이터랩 트렌드 점수 수집 중...")
    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
        "Content-Type": "application/json",
    }

    end_date = NOW.strftime("%Y-%m-%d")
    start_date = (NOW - timedelta(days=7)).strftime("%Y-%m-%d")
    scores = {}

    for i in range(0, len(TREND_KEYWORDS), 5):
        batch = TREND_KEYWORDS[i:i+5]
        keyword_groups = [{"groupName": kw, "keywords": [kw]} for kw in batch]

        body = json.dumps({
            "startDate": start_date,
            "endDate": end_date,
            "timeUnit": "date",
            "keywordGroups": keyword_groups,
        })

        result = fetch_url(
            "https://openapi.naver.com/v1/datalab/search",
            headers=headers, data=body, retries=2,
        )

        if result and "results" in result:
            for item in result["results"]:
                name = item.get("title", "")
                data_points = item.get("data", [])
                if data_points:
                    avg = sum(d.get("ratio", 0) for d in data_points) / len(data_points)
                    scores[name] = round(avg, 2)

        time.sleep(0.5)

    print(f"  네이버 트렌드: {len(scores)}개 키워드")
    return scores


def get_google_trends():
    print("\n[4-2] 구글 트렌드 급상승 키워드 수집 중...")
    google_hot = {}
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl='ko', tz=540, retries=3, backoff_factor=1.0)
        trending = pytrends.trending_searches(pn='south_korea')
        if trending is not None and not trending.empty:
            trending_list = trending[0].tolist()
            print(f"  구글 급상승 {len(trending_list)}개")
            for hot_kw in trending_list:
                for our_kw in TREND_KEYWORDS:
                    if our_kw.replace(" ", "") in hot_kw.replace(" ", ""):
                        google_hot[our_kw] = 50
                        print(f"  🔥 매칭: '{hot_kw}' → '{our_kw}'")
        else:
            print("  급상승 데이터 없음")
    except ImportError:
        print("  ⚠️ pytrends 미설치, 건너뜀")
    except Exception as e:
        print(f"  ⚠️ 구글 트렌드 실패 (무시): {e}")
    return google_hot


def apply_trend_scores(items, naver_scores, google_scores):
    for item in items:
        text = item.get("name", "") + " " + item.get("desc", "")
        best = 0
        for kw, score in naver_scores.items():
            if kw in text:
                best = max(best, score)
        for kw, bonus in google_scores.items():
            if kw in text:
                best += bonus
        item["trend_score"] = round(best, 2)
    return items


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [5] 🚀 메인 실행
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def main():
    print("=" * 60)
    print(f"🚀 전국민 혜택존 데이터 수집 v4")
    print(f"📅 {NOW.strftime('%Y-%m-%d %H:%M:%S')} KST")
    print("=" * 60)

    keys = {
        "DATA_API_KEY": bool(DATA_API_KEY),
        "BIZ_API_KEY": bool(BIZ_API_KEY),
        "FSS_API_KEY": bool(FSS_API_KEY),
        "NAVER_CLIENT_ID": bool(NAVER_CLIENT_ID),
    }
    for name, ok in keys.items():
        status = "✅" if ok else "❌ 미설정"
        print(f"  {name}: {status}")

    # ── 이전 데이터 로드 (날짜 비교용) ──
    old_subsidies = load_json("subsidies.json")
    old_business  = load_json("business.json")
    old_housing   = load_json("housing.json")
    old_medical   = load_json("medical.json")
    old_finance   = load_json("finance.json")

    # ── 1단계: 수집 ──
    subsidies, housing, medical = get_subsidies()
    business = get_business()
    finance = get_finance()

    # ── 2단계: 트렌드 ──
    naver_scores = get_naver_trends()
    google_scores = get_google_trends()

    combined_scores = {}
    for kw in TREND_KEYWORDS:
        n = naver_scores.get(kw, 0)
        g = google_scores.get(kw, 0)
        combined_scores[kw] = round(n + g, 2)
    save_json("trend_scores.json", combined_scores)

    # ── 3단계: 트렌드 점수 매핑 ──
    for dataset in [subsidies, housing, medical, business, finance]:
        apply_trend_scores(dataset, naver_scores, google_scores)

    # ── 4단계: 수집 날짜 스탬프 ──
    subsidies = stamp_collected_date(subsidies, old_subsidies)
    business  = stamp_collected_date(business, old_business)
    housing   = stamp_collected_date(housing, old_housing)
    medical   = stamp_collected_date(medical, old_medical)
    finance   = stamp_collected_date(finance, old_finance)

    # ── 5단계: 정렬 ──
    subsidies.sort(key=lambda x: x.get("trend_score", 0), reverse=True)
    housing.sort(key=lambda x: x.get("trend_score", 0), reverse=True)
    medical.sort(key=lambda x: x.get("trend_score", 0), reverse=True)
    business.sort(key=lambda x: x.get("trend_score", 0), reverse=True)

    finance.sort(key=lambda x: (
        0 if x.get("finance_type") == "서민대출" else
        1 if x.get("finance_type") == "대출이자 감면" else
        2 if x.get("finance_type") == "청년 금융" else
        3 if x.get("finance_type") == "전세·주택대출" else
        4 if x.get("finance_type") == "신용회복" else
        5 if x.get("finance_type") == "보증지원" else
        6,
        -x.get("trend_score", 0)
    ))

    # ── 6단계: 저장 ──
    save_json("subsidies.json", subsidies)
    save_json("business.json", business)
    save_json("housing.json", housing)
    save_json("medical.json", medical)
    save_json("finance.json", finance)

    # ── 7단계: 신규 항목 수 집계 ──
    new_counts = {
        "subsidies": sum(1 for x in subsidies if x.get("collected_date") == TODAY),
        "business": sum(1 for x in business if x.get("collected_date") == TODAY),
        "housing": sum(1 for x in housing if x.get("collected_date") == TODAY),
        "medical": sum(1 for x in medical if x.get("collected_date") == TODAY),
        "finance": sum(1 for x in finance if x.get("collected_date") == TODAY),
    }

    # ── 8단계: 지역별 통계 ──
    ALL_REGIONS = [
        "전국", "서울", "부산", "대구", "인천", "광주", "대전",
        "울산", "세종", "경기", "강원", "충북", "충남",
        "전북", "전남", "경북", "경남", "제주",
    ]

    all_items = subsidies + housing + medical + business + finance
    region_stats = {}
    for r in ALL_REGIONS:
        region_stats[r] = sum(1 for x in all_items if x.get("region") == r)

    # ── 9단계: 메타 정보 ──
    meta = {
        "updated_at": NOW.strftime("%Y-%m-%d %H:%M:%S"),
        "timezone": "KST",
        "subsidies_count": len(subsidies),
        "business_count": len(business),
        "housing_count": len(housing),
        "medical_count": len(medical),
        "finance_count": len(finance),
        "new_today": new_counts,
        "trend_keywords_count": len(combined_scores),
        "region_stats": region_stats,
    }
    save_json("meta.json", meta)

    # ── 완료 리포트 ──
    total = len(subsidies) + len(business) + len(housing) + len(medical) + len(finance)
    print("\n" + "=" * 60)
    print(f"✅ 수집 완료! 총 {total}건")
    print(f"  💰 정부지원·민생: {len(subsidies)}건 (🆕 {new_counts['subsidies']})")
    print(f"  🏢 소상공인·정책자금: {len(business)}건 (🆕 {new_counts['business']})")
    print(f"  🏠 주거·부동산: {len(housing)}건 (🆕 {new_counts['housing']})")
    print(f"  🏥 의료·건강: {len(medical)}건 (🆕 {new_counts['medical']})")
    print(f"  💡 금융·재테크: {len(finance)}건 (🆕 {new_counts['finance']})")

    finance_types = {}
    for item in finance:
        ft = item.get("finance_type", "기타")
        finance_types[ft] = finance_types.get(ft, 0) + 1
    if finance_types:
        print(f"\n  💡 금융 세부:")
        for ft, cnt in sorted(finance_types.items(), key=lambda x: -x[1]):
            print(f"     {ft}: {cnt}건")

    print(f"\n  📊 지역별:")
    for r in ALL_REGIONS:
        cnt = region_stats.get(r, 0)
        if cnt > 0:
            print(f"     {r}: {cnt}건")
    print("=" * 60)


if __name__ == "__main__":
    main()
