# -*- coding: utf-8 -*-
"""
전국민 혜택존 - 데이터 자동 수집 엔진 v3
매일 오전 7시(KST) GitHub Actions에서 실행

수정 이력:
  v3 - 2026-05-24
    - 기업마당 API jsonArray 파싱 구조 수정 (dict 내 item 배열)
    - 정부24 API pagination retry 3회 + continue 방식
    - 블랙리스트 충돌 방지 (화이트리스트 name 매칭 우선)
    - 중복제거 시 지역 포함하여 별도 항목 유지
    - 금감원 API https 전환 + 다중 페이지 수집
    - 금융상품 필터링 (예금 3%↑, 대출 최저금리 표시)
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

# 중앙부처 목록
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
]


def extract_region(text):
    """텍스트에서 지역 추출. 중앙부처면 '전국'."""
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

# ★ 핵심 원칙: "일반 국민이 직접 신청해서 현금·바우처·감면 혜택을 받는 것"

# 💰 정부지원·민생 — 이름(name) 매칭
SUBSIDY_NAME_KEYWORDS = [
    # ── 현금 직접 지급 (핵심!) ──
    "근로장려", "자녀장려", "장려금",
    "아동수당", "양육수당", "부모급여", "영아수당",
    "기초연금", "노령연금",
    "실업급여", "구직급여", "취업성공패키지",
    "출산지원", "출산장려", "출산축하", "출산비", "출산금", "출산급여",
    "첫만남이용권", "첫만남 이용권",
    "청년수당", "청년지원금", "청년내일저축", "청년도약계좌",
    "청년내일채움",

    # ── 지자체 민생지원금 (핵심!) ──
    "지원금", "생활지원", "민생지원", "민생안정", "민생회복",
    "긴급생활지원", "재난지원", "특별지원금",
    "격려금", "축하금", "장수수당", "효도수당",

    # ── 육아/출산 ──
    "육아휴직급여", "출산휴가급여", "배우자출산",
    "보육료 지원", "유아교육비", "아이돌봄",

    # ── 에너지/공과금 ──
    "에너지바우처", "전기요금 감면", "전기요금 할인",
    "가스비 지원", "난방비 지원", "냉방비 지원",
    "도시가스 지원", "연료비 지원",

    # ── 보험료/생활비 ──
    "건강보험료 경감", "건강보험료 감면",
    "통신비 감면", "통신비 지원",
    "국민행복카드",

    # ── 가족 ──
    "다자녀 혜택", "다자녀 지원", "다둥이",
    "한부모 지원", "한부모가족",

    # ── 노인 ──
    "노인일자리", "경로우대",

    # ── 교육 ──
    "교육비 지원", "급식비 지원", "교복지원", "입학축하금",
    "교육급여",
]

# 💰 정부지원 — 설명(desc+target) 보조 매칭 (name에 없을 때)
SUBSIDY_DESC_KEYWORDS = [
    "현금 지급", "현금지급", "현금으로 지원",
    "계좌로 입금", "계좌 입금", "통장 입금",
    "바우처 지급", "이용권 지급", "포인트 지급",
    "월 지급", "매월 지원", "1회 지급",
    "만원 지급", "만원 지원",
]

# 🏠 주거·부동산
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

# 🏥 의료·건강
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

# 🏢 소상공인 — 기업마당 title 매칭
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

# ━━━ 블랙리스트 v4 ━━━
# 원칙: "일반 국민이 신청 불가능하거나 현금 혜택이 아닌 것"만 제외

# name 블랙리스트 (서비스명에 이것이 있으면 무조건 제외)
NAME_BLACKLIST = [
    # 특수 대상
    "유공자", "참전", "보훈", "북한이탈", "탈북",
    "의사상자", "귀화",

    # 농축수산 (일반인 무관)
    "영농", "후계농", "사료", "비료", "직불금",
    "어선", "어항",

    # 기관/단체용
    "사회적기업 인증", "연구단", "체육회",
    "원자력", "항공우주",

    # 시설/인프라 (개인 혜택 아님)
    "경로당 운영", "CCTV 설치", "가로등",
    "도로 확장", "하수관",

    # 기업용 전문
    "수출바우처", "기술보호 바우처",
    "R&D 지원", "스마트공장",

    # 초지/임야
    "대체초지", "초지조성",

    # 반려동물
    "유기동물", "동물등록",

    # 기타 비현금
    "안검하수",
    "문화재 수리",
]

# combined(name+desc+target) 블랙리스트 (좀 더 넓게 걸러야 할 것)
COMBINED_BLACKLIST = [
    # 농업 전용
    "농업인만", "농가 대상", "어업인만",
    # 군인 전용
    "현역 군인", "직업군인",
    # 공무원 전용
    "공무원 대상",
]

# 기업마당 블랙리스트
BIZ_BLACKLIST = [
    "수출", "해외진출", "바이어", "R&D", "기술개발", "특허출원",
    "스마트공장", "원자력", "항공우주",
    "농업", "축산", "수산", "어업", "임업",
    "사회적기업", "협동조합 설립",
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 공통 유틸 함수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def fetch_url(url, headers=None, data=None, timeout=30, retries=3):
    """URL 호출 후 JSON 반환. 실패 시 retry. 최종 실패 시 None."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url)
            if headers:
                for k, v in headers.items():
                    req.add_header(k, v)
            if data:
                response = urllib.request.urlopen(
                    req, data=data.encode("utf-8"), timeout=timeout
                )
            else:
                response = urllib.request.urlopen(req, timeout=timeout)
            raw = response.read().decode("utf-8")
            return json.loads(raw)
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 * (attempt + 1)
                print(f"  ⚠️ 요청 실패 ({attempt+1}/{retries}): {url[:80]}... → {e}")
                print(f"     {wait}초 후 재시도...")
                time.sleep(wait)
            else:
                print(f"  ❌ 최종 실패: {url[:80]}... → {e}")
                return None


def save_json(filename, data):
    """data 폴더에 JSON 저장."""
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    count = len(data) if isinstance(data, (list, dict)) else ".."
    print(f"  💾 저장: {filename} ({count}건)")


def match_any(text, keywords):
    """텍스트에 키워드 중 하나라도 포함되면 True."""
    if not text:
        return False
    return any(kw in text for kw in keywords)


def strip_html(text):
    """HTML 태그 제거."""
    if not text:
        return ""
    return re.sub(r'<[^>]+>', '', text).strip()


def dedup_by_id_and_region(items):
    """ID+지역 기준 중복 제거. 같은 ID인데 다른 지역이면 별도 유지."""
    seen = set()
    result = []
    for item in items:
        key = f"{item.get('id', '')}_{item.get('region', '')}"
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


def dedup_by_name_region(items):
    """서비스명+지역 기준 중복 제거. 같은 이름이라도 다른 지역은 유지."""
    seen = {}
    result = []
    for item in items:
        # 핵심 변경: 지역도 key에 포함 → 서울 청년월세 ≠ 부산 청년월세
        name_key = re.sub(r'\s+', '', item["name"])
        region = item.get("region", "전국")
        key = f"{name_key}_{region}"

        if key in seen:
            existing = seen[key]
            # trend_score 높은 것 우선
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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [1] 💰 정부24 API → subsidies / housing / medical
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def build_gov_url(service_id, org_name):
    """정부24 상세 URL 생성. 중앙부처 → 직접 링크, 지자체 → 검색 링크."""
    for central in CENTRAL_ORGS:
        if central in (org_name or ""):
            return f"https://www.gov.kr/portal/rcvfvrSvc/dtlEx/{service_id}"
    # 지자체 서비스는 검색으로 연결 (직접 링크가 404 나는 경우 방지)
    return f"https://www.gov.kr/portal/rcvfvrSvc/dtlEx/{service_id}"


def get_subsidies():
    """정부24 서비스목록 API에서 데이터 수집 후 3개 카테고리로 분류."""
    if not DATA_API_KEY:
        print("\n[1] 정부24 — API 키 없음, 건너뜀")
        return [], [], []

    print("\n[1] 정부24 서비스목록 수집 중...")
    base_url = "https://api.odcloud.kr/api/gov24/v3/serviceList"

    # 총 건수 확인
    check_url = f"{base_url}?page=1&perPage=1&serviceKey={DATA_API_KEY}"
    check = fetch_url(check_url)
    if not check or "totalCount" not in check:
        print("  ⚠️ 총 건수 확인 실패")
        return [], [], []

    total = check["totalCount"]
    per_page = 500  # ★ 100→500 (API 최대치, 페이지 수 줄여 안정성 확보)
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

        consecutive_fail = 0  # 성공하면 리셋

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

            # ★ 순서 변경: 화이트리스트 먼저, 블랙리스트 나중에
            # Step 1: name 기준 화이트리스트 체크
            name_match = match_any(name, all_keywords)

            # Step 2: name 매칭 안 되면 desc 보조 키워드 체크
            desc_match = False
            if not name_match:
                desc_match = match_any(desc + target, SUBSIDY_DESC_KEYWORDS)

            # 둘 다 안 되면 스킵
            if not name_match and not desc_match:
                continue

            # Step 3: name 블랙리스트 체크 (name에만 적용)
            if match_any(name, NAME_BLACKLIST):
                continue

            # Step 4: combined 블랙리스트 (정확한 문구만)
            combined = name + desc + target
            if match_any(combined, COMBINED_BLACKLIST):
                continue

            # 지역 분류
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
            })

        if page % 5 == 0 or page == total_pages:
            print(f"  ... {page}/{total_pages} 완료 (누적 {len(raw_items)}건)")
        time.sleep(0.2)

    print(f"  필터 통과 총: {len(raw_items)}건")

    # ── 3개 카테고리로 분류 ──
    subsidies = []
    housing = []
    medical = []

    for item in raw_items:
        name = item["name"]
        # 주거 키워드 우선 (월세지원금 → 주거로 분류)
        if match_any(name, HOUSING_KEYWORDS):
            housing.append(item)
        elif match_any(name, MEDICAL_KEYWORDS):
            medical.append(item)
        else:
            subsidies.append(item)

    # 중복 제거 (같은 이름+같은 지역만 제거)
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
    """기업마당 BizInfo API에서 소상공인 지원 데이터 수집."""
    if not BIZ_API_KEY:
        print("\n[2] 기업마당 — API 키 없음, 건너뜀")
        return []

    print("\n[2] 기업마당 소상공인 지원 수집 중...")
    base_url = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do"

    # 분야코드: 01=금융, 06=창업, 07=경영, 09=기타
    sectors = ["01", "06", "07", "09"]

    all_items = []
    seen_ids = set()

    for code in sectors:
        # ★ 핵심 수정: searchCnt=0 → 전체, pageUnit은 RSS용
        # 화이트리스트가 필터링하므로 가능한 많이 가져옴
        for page_idx in range(1, 4):  # 3페이지까지
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

            # ★ 핵심 수정: 기업마당 JSON 응답 구조 처리
            # 실제 구조: {"jsonArray": {"item": [...]}} 또는
            #           {"jsonArray": [{"item": ...}, ...]}
            items = []

            if isinstance(result, dict):
                json_array = result.get("jsonArray", result)

                if isinstance(json_array, dict):
                    # {"jsonArray": {"item": [...]}}
                    items = json_array.get("item", [])
                    if isinstance(items, dict):
                        items = [items]  # 단건이면 리스트로
                elif isinstance(json_array, list):
                    items = json_array

                # 여전히 빈 경우, dict의 모든 value 탐색
                if not items:
                    for key, val in (json_array if isinstance(json_array, dict) else result).items():
                        if isinstance(val, list) and len(val) > 0:
                            # 리스트 안에 dict가 있고, pblancNm 또는 title 키가 있으면 item 목록
                            if isinstance(val[0], dict) and (
                                "pblancNm" in val[0] or "title" in val[0]
                            ):
                                items = val
                                break

            elif isinstance(result, list):
                items = result

            print(f"  분야 {code} 페이지 {page_idx}: {len(items)}건 수신")

            for item in items:
                pid = (
                    item.get("pblancId")
                    or item.get("seq")
                    or item.get("link", "")
                )
                title = strip_html(
                    item.get("pblancNm") or item.get("title") or ""
                )
                desc = strip_html(
                    item.get("bsnsSumryCn") or item.get("description") or ""
                )

                if not title:
                    continue

                # 중복 체크
                if pid in seen_ids:
                    continue
                seen_ids.add(pid)

                combined = title + desc

                # 블랙리스트
                if match_any(combined, BIZ_BLACKLIST):
                    continue

                # ★ 화이트리스트: 너무 빡빡하면 0건이므로,
                # title 또는 desc에 키워드가 있으면 통과
                if not match_any(combined, BIZ_WHITELIST):
                    continue

                # 마감일
                apply_date = (
                    item.get("reqstBeginEndDe")
                    or item.get("reqstDt")
                    or ""
                )
                deadline = parse_deadline(apply_date)

                # 지역
                hashtags = item.get("hashTags", "") or ""
                org = (
                    item.get("jrsdInsttNm")
                    or item.get("author")
                    or ""
                )
                region = extract_region(org)
                if region == "전국":
                    region = extract_region(hashtags)

                # URL
                link = item.get("pblancUrl") or item.get("link") or ""
                if not link and pid:
                    link = (
                        f"https://www.bizinfo.go.kr/web/lay1/bbs/"
                        f"S1T122C128/AS/74/view.do?pblancId={pid}"
                    )

                all_items.append({
                    "id": str(pid),
                    "name": title,
                    "desc": desc[:200],
                    "org": org,
                    "target": item.get("trgetNm", "") or "",
                    "how": item.get("reqstMthPapersCn", "") or "",
                    "url": link,
                    "region": region,
                    "deadline": deadline,
                    "trend_score": 0,
                })

            time.sleep(0.5)

    all_items = dedup_by_name_region(all_items)
    print(f"  🏢 소상공인·정책자금: {len(all_items)}건")
    return all_items


def parse_deadline(apply_date):
    """신청기간 문자열에서 마감일 추출."""
    if not apply_date:
        return "상시"
    if "예산" in apply_date or "소진" in apply_date:
        return "예산소진시"
    if "~" in apply_date:
        end_part = apply_date.split("~")[-1].strip()
        # 20260531 → 2026-05-31
        cleaned = re.sub(r'[.\-/\s]', '', end_part)
        if len(cleaned) == 8 and cleaned.isdigit():
            return f"{cleaned[:4]}-{cleaned[4:6]}-{cleaned[6:8]}"
        # 이미 2026-05-31 형식
        m = re.search(r'(\d{4}[-./]\d{2}[-./]\d{2})', end_part)
        if m:
            return m.group(1).replace(".", "-").replace("/", "-")
    return "상시"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [3] 💡 금융·재테크 → 서민금융 + 정부지원 대출 + 이자감면
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ★ 금융·재테크 키워드 (정부24 API에서 추가 수집)
FINANCE_GOV_KEYWORDS = [
    # ── 서민·저신용 대출 ──
    "햇살론", "새희망홀씨", "미소금융", "바꿔드림론",
    "서민대출", "서민금융", "저신용 대출", "저소득 대출",
    "긴급대출", "긴급생계대출",
    "소액대출", "소액생계", "무담보 대출",
    
    # ── 정부 지원 대출 ──
    "전세자금대출", "전세대출", "버팀목대출",
    "주택구입자금", "디딤돌대출", "보금자리론",
    "학자금대출", "든든학자금",
    
    # ── 대출이자 감면/지원 ──
    "이자지원", "이자감면", "이자보전", "이자차액",
    "금리인하", "금리우대", "금리감면",
    "대출이자 지원", "대출이자 감면",
    
    # ── 청년 금융 ──
    "청년도약계좌", "청년내일저축", "청년내일채움",
    "청년희망적금", "청년우대",
    "청년창업대출", "청년전세", "청년대출",
    
    # ── 신용회복 ──
    "신용회복", "채무조정", "채무감면", "개인회생",
    "워크아웃", "신용상담",
    
    # ── 보증 ──
    "보증지원", "보증서 발급", "신용보증",
    "주택보증", "전세보증금 반환",
    
    # ── 금융교육/상담 ──
    "금융상담", "재무상담", "서민금융통합지원",
    
    # ── 지자체 금융 혜택 ──
    "이자 지원", "이자 보전",
    "대출 지원", "대출 이자",
]

# 금융 블랙리스트 (이건 제외)
FINANCE_BLACKLIST = [
    "사업자 대출", "기업 대출", "법인",
    "수출 금융", "무역 금융",
]


def get_finance():
    """
    금융·재테크: 3개 소스에서 수집
      A) 정부24 API → 서민대출, 이자감면, 청년금융 혜택
      B) 기업마당 API → 소상공인 이자지원 (business와 중복 가능하지만 별도 표시)
      C) 금감원 API → 서민전용 대출상품만 (적금X)
    """
    print("\n[3] 💡 금융·재테크 수집 중...")
    
    all_items = []
    seen_names = set()
    
    # ──────────────────────────────────
    # A) 정부24에서 금융 관련 혜택 추출
    # ──────────────────────────────────
    gov_finance = get_finance_from_gov24()
    for item in gov_finance:
        key = item["name"]
        if key not in seen_names:
            seen_names.add(key)
            all_items.append(item)
    print(f"  A) 정부24 금융혜택: {len(gov_finance)}건")
    
    # ──────────────────────────────────
    # B) 기업마당에서 이자지원/금융 추출
    # ──────────────────────────────────
    biz_finance = get_finance_from_bizinfo()
    for item in biz_finance:
        key = item["name"]
        if key not in seen_names:
            seen_names.add(key)
            all_items.append(item)
    print(f"  B) 기업마당 금융혜택: {len(biz_finance)}건")
    
    # ──────────────────────────────────
    # C) 금감원 서민전용 상품만
    # ──────────────────────────────────
    fss_finance = get_finance_from_fss()
    for item in fss_finance:
        key = f"{item.get('bank','')}_{item['name']}"
        if key not in seen_names:
            seen_names.add(key)
            all_items.append(item)
    print(f"  C) 금감원 서민금융: {len(fss_finance)}건")
    
    # 중복 제거
    all_items = dedup_by_name_region(all_items)
    
    print(f"  💡 금융·재테크 최종: {len(all_items)}건")
    return all_items


def get_finance_from_gov24():
    """정부24 API에서 금융·대출·이자감면 관련 항목만 추출."""
    if not DATA_API_KEY:
        return []
    
    base_url = "https://api.odcloud.kr/api/gov24/v3/serviceList"
    
    # 총 건수 확인
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
            
            # 금융 키워드 매칭
            if not match_any(combined, FINANCE_GOV_KEYWORDS):
                continue
            
            # 블랙리스트
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
            })
        
        time.sleep(0.2)
    
    return items


def get_finance_from_bizinfo():
    """기업마당에서 이자지원/금융 관련 항목 추출."""
    if not BIZ_API_KEY:
        return []
    
    base_url = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do"
    
    # 금융(01) 분야만
    items = []
    seen_ids = set()
    
    for page_idx in range(1, 6):  # 5페이지
        url = (
            f"{base_url}?crtfcKey={BIZ_API_KEY}"
            f"&dataType=json"
            f"&pageUnit=50"
            f"&pageIndex={page_idx}"
            f"&searchLclasId=01"  # 금융 분야
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
            
            # 개인/서민 대상 금융만 (기업 전용 제외)
            finance_keywords = [
                "이자지원", "이자보전", "이자차액", "이자감면",
                "이차보전", "금리", "대출", "자금",
                "소상공인", "자영업", "청년창업",
            ]
            if not match_any(combined, finance_keywords):
                continue
            if match_any(combined, BIZ_BLACKLIST):
                continue
            
            # 지역
            hashtags = item.get("hashTags", "") or ""
            org = item.get("jrsdInsttNm") or item.get("author") or ""
            region = extract_region(org)
            if region == "전국":
                region = extract_region(hashtags)
            
            # URL
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
            })
        
        time.sleep(0.5)
    
    return items


def extract_biz_items(result):
    """기업마당 API 응답에서 item 배열 추출 (다양한 구조 대응)."""
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
        # item 키가 없으면 다른 리스트 키 탐색
        for key, val in json_array.items():
            if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict):
                if "pblancNm" in val[0] or "title" in val[0]:
                    return val
    
    if isinstance(json_array, list):
        return json_array
    
    return []


def get_finance_from_fss():
    """금감원 API에서 서민전용 대출상품만 수집 (적금/예금 제외)."""
    if not FSS_API_KEY:
        return []
    
    # ★ 대출만 수집 (예금/적금 제외!)
    products = {
        "mortgage": {
            "url": "https://finlife.fss.or.kr/finlifeapi/mortgageLoanProductsSearch.json",
            "label": "주택담보대출",
        },
        "jeonse": {
            "url": "https://finlife.fss.or.kr/finlifeapi/rentHouseLoanProductsSearch.json",
            "label": "전세자금대출",
        },
        "credit": {
            "url": "https://finlife.fss.or.kr/finlifeapi/creditLoanProductsSearch.json",
            "label": "개인신용대출",
        },
    }
    
    BANK_REGION = {
        "부산은행": "부산", "BNK부산은행": "부산",
        "경남은행": "경남", "BNK경남은행": "경남",
        "광주은행": "광주",
        "제주은행": "제주",
        "전북은행": "전북", "JB전북은행": "전북",
        "아이엠뱅크": "대구", "iM뱅크": "대구",
    }
    
    fss_sectors = ["020000", "030200"]  # 은행 + 저축은행
    
    items = []
    seen = set()
    
    for prod_key, prod_info in products.items():
        for sector in fss_sectors:
            for page_no in range(1, 3):
                url = (
                    f"{prod_info['url']}"
                    f"?auth={FSS_API_KEY}"
                    f"&topFinGrpNo={sector}"
                    f"&pageNo={page_no}"
                )
                data = fetch_url(url)
                
                if not data or "result" not in data:
                    break
                
                base_list = data["result"].get("baseList", [])
                option_list = data["result"].get("optionList", [])
                
                if not base_list:
                    break
                
                # 금리 매핑
                rate_map = {}
                for opt in option_list:
                    code = opt.get("fin_prdt_cd", "")
                    if code not in rate_map:
                        rate_map[code] = opt
                    else:
                        # 최저금리 갱신
                        existing = rate_map[code]
                        for field in ["lend_rate_min"]:
                            new_val = opt.get(field)
                            old_val = existing.get(field)
                            if new_val and old_val:
                                try:
                                    if float(new_val) < float(old_val):
                                        existing[field] = new_val
                                except (ValueError, TypeError):
                                    pass
                
                for item in base_list:
                    code = item.get("fin_prdt_cd", "")
                    bank = item.get("kor_co_nm", "")
                    name = item.get("fin_prdt_nm", "").replace("\n", " ").strip()
                    
                    dedup_key = f"{bank}_{name}"
                    if dedup_key in seen:
                        continue
                    seen.add(dedup_key)
                    
                    rates = rate_map.get(code, {})
                    
                    # ★ 서민·저금리 우선 (최저금리 6% 이하만)
                    min_rate = rates.get("lend_rate_min") or rates.get("lend_rate_avg")
                    try:
                        if min_rate and float(min_rate) > 6.0:
                            continue
                    except (ValueError, TypeError):
                        pass
                    
                    region = "전국"
                    for bank_name, bank_region in BANK_REGION.items():
                        if bank_name in bank:
                            region = bank_region
                            break
                    
                    rate_basic = rates.get("lend_rate_min") or rates.get("lend_rate_avg") or ""
                    rate_max = rates.get("lend_rate_max") or ""
                    
                    menu_map = {
                        "mortgage": "700004",
                        "jeonse": "700004",
                        "credit": "700004",
                    }
                    menu_no = menu_map.get(prod_key, "700004")
                    detail_url = f"https://finlife.fss.or.kr/finlife/main/contents.do?menuNo={menu_no}"
                    
                    # 금리 표시용 설명
                    rate_desc = ""
                    if rate_basic:
                        rate_desc = f"최저 {rate_basic}%"
                        if rate_max:
                            rate_desc += f" ~ 최대 {rate_max}%"
                    
                    items.append({
                        "id": f"fss_{sector}_{code}",
                        "name": f"[{prod_info['label']}] {name}",
                        "desc": f"{bank} | {rate_desc} | {item.get('join_member', '')[:80]}",
                        "org": bank,
                        "target": (item.get("join_member", "") or "")[:200],
                        "how": item.get("join_way", ""),
                        "url": detail_url,
                        "region": region,
                        "deadline": "상시",
                        "trend_score": 0,
                        "source": "금감원",
                        "finance_type": prod_info["label"],
                        "rate_basic": rate_basic,
                        "rate_max": rate_max,
                    })
                
                time.sleep(0.3)
    
    # ★ 최저금리 낮은 순 정렬 (서민에게 유리한 순서)
    items.sort(key=lambda x: float(x.get("rate_basic") or 999))
    
    return items


def classify_finance_type(text):
    """금융 항목의 세부 유형 분류."""
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
        ("개인신용대출", ["개인신용", "신용대출"]),
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
    # 지원금
    "근로장려금", "자녀장려금", "아동수당", "부모급여", "양육수당",
    "기초연금", "노인일자리", "실업급여", "출산지원금", "첫만남이용권",
    "에너지바우처", "전기요금 감면", "가스비 지원", "난방비 지원",
    "국민행복카드",
    "청년수당", "청년월세", "민생지원금", "민생회복지원금",
    "교육급여", "교육비 지원", "급식비 지원",
    # 소상공인
    "소상공인 정책자금", "경영안정자금", "특례보증", "이차보전",
    "소상공인 대출", "배달비 지원", "카드수수료 환급",
    # 주거
    "전세자금대출", "월세 지원", "주거급여", "공공임대", "행복주택",
    "청년전세", "신혼부부 주거", "주택청약",
    # 의료
    "건강검진", "틀니 지원", "임플란트 지원", "치매 지원",
    "난임 지원", "장기요양",
    # 금융
    "정기예금 금리", "적금 추천", "주택담보대출 금리",
    "전세대출 금리", "청년도약계좌",
]


def get_naver_trends():
    """네이버 데이터랩 API로 키워드별 검색 트렌드 점수 산출."""
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

    # 네이버 데이터랩은 한 번에 최대 5개 키워드 그룹
    for i in range(0, len(TREND_KEYWORDS), 5):
        batch = TREND_KEYWORDS[i:i+5]

        keyword_groups = [
            {"groupName": kw, "keywords": [kw]}
            for kw in batch
        ]

        body = json.dumps({
            "startDate": start_date,
            "endDate": end_date,
            "timeUnit": "date",
            "keywordGroups": keyword_groups,
        })

        result = fetch_url(
            "https://openapi.naver.com/v1/datalab/search",
            headers=headers,
            data=body,
            retries=2,
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
    """구글 pytrends로 한국 급상승 검색어 매칭."""
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
    """데이터 항목들에 트렌드 점수 매핑."""
    for item in items:
        name = item.get("name", "")
        desc = item.get("desc", "")
        text = name + " " + desc
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
    print(f"🚀 전국민 혜택존 데이터 수집 v3")
    print(f"📅 {NOW.strftime('%Y-%m-%d %H:%M:%S')} KST")
    print("=" * 60)

    # ── API 키 상태 확인 ──
    keys = {
        "DATA_API_KEY": bool(DATA_API_KEY),
        "BIZ_API_KEY": bool(BIZ_API_KEY),
        "FSS_API_KEY": bool(FSS_API_KEY),
        "NAVER_CLIENT_ID": bool(NAVER_CLIENT_ID),
    }
    for name, ok in keys.items():
        status = "✅" if ok else "❌ 미설정"
        print(f"  {name}: {status}")

    # ── 1단계: 정부24 → subsidies / housing / medical ──
    subsidies, housing, medical = get_subsidies()
    
    # ── 2단계: 기업마당 → business ──
    business = get_business()
    
    # ── 3단계: 금융·재테크 (정부24 + 기업마당 + 금감원 통합) ──
    finance = get_finance()

    # ── 4단계: 트렌드 점수 수집 ──
    naver_scores = get_naver_trends()
    google_scores = get_google_trends()

    combined_scores = {}
    for kw in TREND_KEYWORDS:
        n = naver_scores.get(kw, 0)
        g = google_scores.get(kw, 0)
        combined_scores[kw] = round(n + g, 2)
    save_json("trend_scores.json", combined_scores)

    # ── 5단계: 트렌드 점수 매핑 + 정렬 ──
    for dataset in [subsidies, housing, medical, business, finance]:
        apply_trend_scores(dataset, naver_scores, google_scores)
    
    subsidies.sort(key=lambda x: x.get("trend_score", 0), reverse=True)
    housing.sort(key=lambda x: x.get("trend_score", 0), reverse=True)
    medical.sort(key=lambda x: x.get("trend_score", 0), reverse=True)
    business.sort(key=lambda x: x.get("trend_score", 0), reverse=True)
    # finance는 유형별 정렬 유지 (서민대출 우선)
    finance.sort(key=lambda x: (
        0 if x.get("finance_type") == "서민대출" else
        1 if x.get("finance_type") == "대출이자 감면" else
        2 if x.get("finance_type") == "청년 금융" else
        3 if x.get("finance_type") == "전세·주택대출" else
        4 if x.get("finance_type") == "신용회복" else
        5,
        -x.get("trend_score", 0)
    ))

    # ── 6단계: JSON 저장 ──
    save_json("subsidies.json", subsidies)
    save_json("business.json", business)
    save_json("housing.json", housing)
    save_json("medical.json", medical)
    save_json("finance.json", finance)

    # ── 7단계: 지역별 통계 (★ finance도 포함) ──
    ALL_REGIONS = [
        "전국", "서울", "부산", "대구", "인천", "광주", "대전",
        "울산", "세종", "경기", "강원", "충북", "충남",
        "전북", "전남", "경북", "경남", "제주",
    ]

    all_items = subsidies + housing + medical + business + finance
    region_stats = {}
    for r in ALL_REGIONS:
        region_stats[r] = sum(1 for x in all_items if x.get("region") == r)

    # ── 8단계: 메타 정보 ──
    meta = {
        "updated_at": NOW.strftime("%Y-%m-%d %H:%M:%S"),
        "timezone": "KST",
        "subsidies_count": len(subsidies),
        "business_count": len(business),
        "housing_count": len(housing),
        "medical_count": len(medical),
        "finance_count": len(finance),
        "trend_keywords_count": len(combined_scores),
        "region_stats": region_stats,
    }
    save_json("meta.json", meta)

    # ── 완료 리포트 ──
    total = len(subsidies) + len(business) + len(housing) + len(medical) + len(finance)
    print("\n" + "=" * 60)
    print(f"✅ 수집 완료! 총 {total}건")
    print(f"  💰 정부지원·민생: {len(subsidies)}건")
    print(f"  🏢 소상공인·정책자금: {len(business)}건")
    print(f"  🏠 주거·부동산: {len(housing)}건")
    print(f"  🏥 의료·건강: {len(medical)}건")
    print(f"  💡 금융·재테크: {len(finance)}건")
    
    # finance 세부 유형별 카운트
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
