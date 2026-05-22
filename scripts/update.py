# -*- coding: utf-8 -*-
"""
전국민 혜택존 - 데이터 자동 수집 엔진 v2
매일 오전 7시(KST) GitHub Actions에서 실행
"""

import os
import json
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 환경 변수 (GitHub Secrets)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA_API_KEY = os.environ.get("DATA_API_KEY", "").strip()
BIZ_API_KEY = os.environ.get("BIZ_API_KEY", "").strip()
FSS_API_KEY = os.environ.get("FSS_API_KEY", "").strip()
NAVER_CLIENT_ID = os.environ.get("NAVER_CLIENT_ID", "").strip()
NAVER_CLIENT_SECRET = os.environ.get("NAVER_CLIENT_SECRET", "").strip()

KST = timezone(timedelta(hours=9))
NOW = datetime.now(KST)
TODAY = NOW.strftime("%Y-%m-%d")

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

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

# 중앙부처 목록 (이 기관이면 "전국")
CENTRAL_ORGS = [
    "국세청", "행정안전부", "보건복지부", "교육부", "고용노동부",
    "산업통상부", "국토교통부", "중소벤처기업부", "과학기술정보통신부",
    "문화체육관광부", "환경부", "농림축산식품부", "해양수산부",
    "국방부", "법무부", "성평등가족부", "여성가족부", "산림청",
    "기획재정부", "인사혁신처", "금융위원회", "금융감독원",
    "한국주택금융공사", "국민건강보험공단", "근로복지공단",
    "한국장학재단", "한국고용정보원", "한국토지주택공사",
    "국민연금공단", "건강보험심사평가원",
]


def extract_region_v2(org_name):
    """소관기관명에서 지역 추출. 중앙부처면 '전국'."""
    # 중앙부처 체크
    for central in CENTRAL_ORGS:
        if central in org_name:
            return "전국"

    # 지자체 매칭
    for region, keywords in REGION_MAP.items():
        for kw in keywords:
            if kw in org_name:
                return region

    return "전국"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 화이트리스트 / 블랙리스트 v3
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 💰 정부지원·민생
SUBSIDY_WHITELIST = [
    # 장려금·수당
    "근로장려", "자녀장려", "아동수당", "양육수당", "부모급여",
    "출산지원", "출산장려", "출산축하", "첫만남이용권", "영아수당",
    "기초연금", "노인일자리", "실업급여", "구직급여",
    # 공과금·요금 감면 (누구나 신청 가능)
    "에너지바우처", "전기요금", "가스비", "난방비", "냉방비",
    "전기세", "도시가스",
    # 보험료 지원
    "건강보험료", "국민연금", "고용보험료",
    "국민행복카드",
    # 세금 감면 (개인용)
    "자동차세", "취득세", "교육비", "급식비", "교복지원",
    # 통신·생활
    "통신비", "인터넷 요금",
    # 청년
    "청년수당", "청년지원", "청년월세", "청년내일",
    # 가족
    "다자녀", "다둥이",
    # 민생
    "민생지원", "민생회복", "민생안정",
    # 근로·출산 휴가
    "육아휴직", "출산휴가", "배우자출산",
]

# 🏠 주거·부동산
HOUSING_KEYWORDS = [
    "월세", "전세", "주거급여", "주거비", "주거바우처", "주거지원",
    "임대", "공공임대", "행복주택", "매입임대", "전세임대",
    "전세자금", "주택자금", "집수리", "주거환경",
    "청년주거", "신혼부부 주거", "주택청약",
]

# 🏥 의료·건강
MEDICAL_KEYWORDS = [
    "건강보험", "건강검진", "틀니", "임플란트",
    "치매", "장기요양", "노인돌봄", "간병", "재활",
    "산후조리", "난임", "산모", "예방접종", "진료비",
    "수술비", "입원비", "약제비", "보청기", "장애인 보조기기",
]

# 🏢 소상공인
BIZ_WHITELIST = [
    "소상공인", "정책자금", "경영안정", "특례보증", "이차보전",
    "이자차액", "이자감면", "무이자", "저금리", "저리",
    "임대료", "월세지원", "배달비", "카드수수료",
    "전기요금", "에너지", "온누리",
    "청년창업", "창업자금", "창업지원",
    "폐업지원", "재기지원", "경영개선",
]

# ━━━ 블랙리스트 v3 ━━━
# 기준: "수급자/특수대상 전용 자동지급" or "일반인 무관"
BLACKLIST = [
    # ── 특수 대상 (일반 국민 아님) ──
    "유공자", "참전", "보훈", "북한이탈", "탈북", "사고장해",
    "의사상자", "외국인", "다문화", "귀화",

    # ── 농축수산 ──
    "농업", "축산", "어업", "수산", "농가", "농민", "어민",
    "영농", "후계농", "사료", "비료", "직불금",

    # ── 기관/단체용 ──
    "사회적기업", "연구단", "법인", "협회", "체육회",
    "전문인력", "공무원", "군인",
    "원자력", "항공우주",

    # ── 지역화폐/상품권 ──
    "지역화폐", "사랑상품권", "지역상품권", "온누리상품권",

    # ── 시설/기관용 세금 감면 ──
    "지방세 감면", "재산세 감면", "취득세 면제",
    "복지시설", "노인복지시설", "장애인복지시설",
    "한옥", "문화재",

    # ── 기업용 바우처 ──
    "수출바우처", "기술보호 바우처", "기술개발",
    "R&D", "특허", "스마트공장",

    # ── 초지/임야 ──
    "대체초지", "초지조성", "임야",

    # ── 장학금 ──
    "장학금", "학자금대출",

    # ── 기타 ──
    "평생교육바우처", "산림복지",

    # ━━━ v3 추가: 수급자 전용 자동지급 ━━━
    "기초생활수급", "기초생활보장",
    "생계급여 수급", "의료급여 수급",
    "긴급복지 생계", "긴급복지 연료", "긴급복지 의료",
    "차상위계층 쓰레기", "차상위계층 기초", "차상위계층 특별",
    "차상위계층 난방", "차상위계층 장제",
    "통합문화이용권", "문화누리카드",
    "한부모가정 명절", "한부모가족 명절",
    "명절위문", "명절격려", "위문금", "위문품",
    "케이블TV", "케이블 TV",
    "수강료 감면", "이용료 감면", "사용료 감면",
    "이사비용",
    "법률구조",
    "문화체험활동경비",
    "저소득구민",
    "미혼모", "미혼부",
]

BIZ_BLACKLIST = [
    "수출", "해외", "바이어", "R&D", "기술개발", "특허",
    "스마트공장", "원자력", "항공우주",
    "농업", "축산", "수산", "어업", "임업",
]

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 공통 유틸 함수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def fetch_url(url, headers=None, data=None, timeout=30):
    """URL 호출 후 JSON 반환. 실패 시 None."""
    try:
        req = urllib.request.Request(url)
        if headers:
            for k, v in headers.items():
                req.add_header(k, v)
        if data:
            response = urllib.request.urlopen(req, data=data.encode("utf-8"), timeout=timeout)
        else:
            response = urllib.request.urlopen(req, timeout=timeout)
        return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"  ⚠️ 요청 실패: {url[:80]}... → {e}")
        return None


def save_json(filename, data):
    """data 폴더에 JSON 저장."""
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  💾 저장 완료: {filename} ({len(data) if isinstance(data, list) else '..'})")


def match_any(text, keywords):
    """텍스트에 키워드 중 하나라도 포함되면 True."""
    return any(kw in text for kw in keywords)


def dedup_by_name(items):
    """서비스명 기준 중복 제거. 지역명 빼고 비교."""
    import re
    seen = {}
    result = []
    for item in items:
        # 괄호 내용 + 지역명 제거 후 비교키 생성
        clean = re.sub(r'\(.*?\)', '', item["name"]).strip()
        clean = re.sub(r'서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주', '', clean).strip()

        if clean in seen:
            # 이미 있으면 전국 버전 우선, trend_score 높은 것 우선
            existing = seen[clean]
            if item.get("region") == "전국" and existing.get("region") != "전국":
                seen[clean] = item
                result = [x for x in result if x["id"] != existing["id"]]
                result.append(item)
            elif item.get("trend_score", 0) > existing.get("trend_score", 0):
                seen[clean] = item
                result = [x for x in result if x["id"] != existing["id"]]
                result.append(item)
        else:
            seen[clean] = item
            result.append(item)

    return result
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [1] 💰 정부24 API → subsidies / housing / medical
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
    per_page = 100
    total_pages = (total // per_page) + 1
    print(f"  총 {total}건, {total_pages}페이지 수집 예정")

    raw_items = []
    seen_ids = set()

    for page in range(1, total_pages + 1):
        url = f"{base_url}?page={page}&perPage={per_page}&serviceKey={DATA_API_KEY}"
        result = fetch_url(url)
        if not result or "data" not in result:
            continue

        for item in result["data"]:
            sid = item.get("서비스ID", "")
            if sid in seen_ids:
                continue
            seen_ids.add(sid)

            name = item.get("서비스명", "")
            desc = item.get("서비스목적요약", "") or ""
            target = item.get("지원대상", "") or ""
            org = item.get("소관기관명", "") or ""
            how = item.get("신청방법", "") or ""
            combined = name + desc + target

            # 블랙리스트 체크 (name + desc + target 전부)
            if match_any(combined, BLACKLIST):
                continue

            # 화이트리스트 체크 (name 기준)
            if not match_any(name, SUBSIDY_WHITELIST + HOUSING_KEYWORDS + MEDICAL_KEYWORDS):
                continue

            # 지역 분류 v2 (소관기관명 기준)
            region = extract_region_v2(org)

            raw_items.append({
                "id": sid,
                "name": name,
                "desc": desc[:150],  # 설명 150자로 제한
                "org": org,
                "target": target[:200],  # 대상 200자로 제한
                "how": how,
                "url": f"https://www.gov.kr/portal/rcvfvrSvc/dtlEx/{sid}",
                "region": region,
                "deadline": "상시모집",
                "trend_score": 0
            })

        if page % 10 == 0:
            print(f"  ... {page}/{total_pages} 페이지 완료")

    print(f"  화이트리스트 통과: {len(raw_items)}건")

    # 3개 카테고리로 분류
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

    # 중복 제거
    subsidies = dedup_by_name(subsidies)
    housing = dedup_by_name(housing)
    medical = dedup_by_name(medical)

    print(f"  💰 정부지원·민생: {len(subsidies)}건 (중복제거 후)")
    print(f"  🏠 주거·부동산: {len(housing)}건 (중복제거 후)")
    print(f"  🏥 의료·건강: {len(medical)}건 (중복제거 후)")

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

    sectors = {
        "01": 50,   # 금융
        "06": 50,   # 창업
        "07": 50,   # 경영
    }

    all_items = []
    seen_titles = set()

    for code, count in sectors.items():
        url = f"{base_url}?crtfcKey={BIZ_API_KEY}&dataType=json&pageUnit={count}&searchLclasId={code}"
        result = fetch_url(url)

        if not result:
            continue

        # 응답 구조 파싱
        items = []
        if isinstance(result, dict):
            items = result.get("jsonArray", result.get("dataList", []))
            if not items:
                # 중첩 구조 확인
                for key in result:
                    if isinstance(result[key], list):
                        items = result[key]
                        break
        if isinstance(result, list):
            items = result

        for item in items:
            title = item.get("pblancNm", item.get("title", "")) or ""
            desc = item.get("bsnsSumryCn", item.get("description", "")) or ""
            combined = title + desc

            if title in seen_titles:
                continue
            seen_titles.add(title)

            if match_any(combined, BIZ_BLACKLIST):
                continue

            if not match_any(title, BIZ_WHITELIST):
                continue

            # 마감일 추출
            apply_date = item.get("reqstBeginEndDe", item.get("reqstDt", "")) or ""
            deadline = "상시모집"
            if "~" in apply_date:
                end_part = apply_date.split("~")[-1].strip()
                cleaned = end_part.replace(".", "-").replace("/", "-")
                if len(cleaned) == 8 and cleaned.isdigit():
                    cleaned = f"{cleaned[:4]}-{cleaned[4:6]}-{cleaned[6:8]}"
                if len(cleaned) >= 10:
                    deadline = cleaned[:10]
            if "예산" in apply_date or "소진" in apply_date:
                deadline = "예산소진시"

            # 지역 추출
            hashtags = item.get("hashTags", "") or ""
            org = item.get("jrsdInsttNm", item.get("author", "")) or ""
            region = extract_region_v2(org)
            if region == "전국":
                # 해시태그에서 지역 재확인
                for r, kws in REGION_MAP.items():
                    for kw in kws:
                        if kw in hashtags:
                            region = r
                            break
                    if region != "전국":
                        break

            link = item.get("pblancUrl", item.get("link", "")) or ""
            if not link:
                pid = item.get("pblancId", item.get("seq", ""))
                if pid:
                    link = f"https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?pblancId={pid}"

            all_items.append({
                "id": item.get("pblancId", item.get("seq", "")),
                "name": title,
                "desc": desc[:150],
                "org": org,
                "target": item.get("trgetNm", "") or "",
                "how": "",
                "url": link,
                "region": region,
                "deadline": deadline,
                "trend_score": 0
            })

        time.sleep(0.3)

    all_items = dedup_by_name(all_items)
    print(f"  🏢 소상공인·정책자금: {len(all_items)}건 (중복제거 후)")
    return all_items


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [3] 💡 금감원 금융상품 API → finance
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_finance():
    """금감원 금융상품통합비교공시 API에서 예금/적금/대출 수집."""
    if not FSS_API_KEY:
        print("\n[3] 금감원 — API 키 없음, 건너뜀")
        return []

    print("\n[3] 금감원 금융상품 수집 중...")

    products = {
        "deposit": {
            "url": "http://finlife.fss.or.kr/finlifeapi/depositProductsSearch.json",
            "label": "정기예금"
        },
        "saving": {
            "url": "http://finlife.fss.or.kr/finlifeapi/savingProductsSearch.json",
            "label": "적금"
        },
        "mortgage": {
            "url": "http://finlife.fss.or.kr/finlifeapi/mortgageLoanProductsSearch.json",
            "label": "주택담보대출"
        },
        "jeonse": {
            "url": "http://finlife.fss.or.kr/finlifeapi/rentHouseLoanProductsSearch.json",
            "label": "전세자금대출"
        },
        "credit": {
            "url": "http://finlife.fss.or.kr/finlifeapi/creditLoanProductsSearch.json",
            "label": "개인신용대출"
        },
    }

    # 은행권 코드
    BANK_REGION = {
        "부산은행": "부산", "BNK부산은행": "부산",
        "경남은행": "경남", "BNK경남은행": "경남",
        "광주은행": "광주",
        "제주은행": "제주",
        "전북은행": "전북", "JB전북은행": "전북",
        "아이엠뱅크": "대구", "iM뱅크": "대구", "DGB대구은행": "대구",
    }

    fss_sectors = ["020000", "030200"]  # 은행 + 저축은행

    all_items = []
    seen_products = set()

    for prod_key, prod_info in products.items():
        for sector in fss_sectors:
            url = f"{prod_info['url']}?auth={FSS_API_KEY}&topFinGrpNo={sector}&pageNo=1"
            data = fetch_url(url)

            if not data or "result" not in data:
                continue

            base_list = data["result"].get("baseList", [])
            option_list = data["result"].get("optionList", [])

            # 옵션(금리) 매핑
            rate_map = {}
            for opt in option_list:
                code = opt.get("fin_prdt_cd", "")
                if code not in rate_map:
                    rate_map[code] = opt

            for item in base_list:
                code = item.get("fin_prdt_cd", "")
                bank = item.get("kor_co_nm", "")
                name = item.get("fin_prdt_nm", "").replace("\n", " ").strip()

                # 중복 체크
                dedup_key = f"{bank}_{name}"
                if dedup_key in seen_products:
                    continue
                seen_products.add(dedup_key)

                rates = rate_map.get(code, {})

                # 지방은행 지역 매핑
                region = "전국"
                for bank_name, bank_region in BANK_REGION.items():
                    if bank_name in bank:
                        region = bank_region
                        break

                all_items.append({
                    "id": f"{sector}_{code}",
                    "type": prod_info["label"],
                    "name": name,
                    "bank": bank,
                    "join_way": item.get("join_way", ""),
                    "join_member": item.get("join_member", ""),
                    "spcl_cnd": (item.get("spcl_cnd", "") or "")[:100],
                    "rate_basic": rates.get("intr_rate", rates.get("lend_rate_min", "")),
                    "rate_max": rates.get("intr_rate2", rates.get("lend_rate_max", "")),
                    "url": "https://finlife.fss.or.kr/finlife/main/contents.do?menuNo=700000",
                    "region": region,
                    "deadline": "상시모집",
                    "trend_score": 0
                })

            time.sleep(0.3)

    print(f"  💡 금융상품: {len(all_items)}건")
    return all_items
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [4] 📈 네이버 데이터랩 트렌드 점수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TREND_KEYWORDS = [
    "근로장려금", "자녀장려금", "아동수당", "부모급여", "양육수당",
    "기초연금", "노인일자리", "실업급여", "출산지원금", "첫만남이용권",
    "에너지바우처", "전기요금 감면", "가스비 지원", "난방비 지원",
    "문화누리카드", "국민행복카드",
    "청년수당", "청년월세", "긴급복지", "생계급여", "차상위계층",
    "한부모 지원", "다자녀 혜택", "교육비 지원", "급식비 지원",
    "민생지원금", "민생회복지원금",
    "소상공인 정책자금", "경영안정자금", "특례보증", "이차보전",
    "소상공인 대출", "배달비 지원", "카드수수료 환급",
    "전세자금대출", "월세 지원", "주거급여", "공공임대", "행복주택",
    "청년전세", "신혼부부 주거", "주택청약",
    "건강검진", "틀니 지원", "임플란트 지원", "치매 지원",
    "난임 지원", "의료급여", "장기요양",
    "정기예금 금리", "적금 추천", "주택담보대출 금리",
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
        "Content-Type": "application/json"
    }

    end_date = NOW.strftime("%Y-%m-%d")
    start_date = (NOW - timedelta(days=7)).strftime("%Y-%m-%d")

    scores = {}

    for i in range(0, len(TREND_KEYWORDS), 5):
        batch = TREND_KEYWORDS[i:i+5]

        keyword_groups = []
        for kw in batch:
            keyword_groups.append({
                "groupName": kw,
                "keywords": [kw]
            })

        body = json.dumps({
            "startDate": start_date,
            "endDate": end_date,
            "timeUnit": "date",
            "keywordGroups": keyword_groups
        })

        result = fetch_url(
            "https://openapi.naver.com/v1/datalab/search",
            headers=headers,
            data=body
        )

        if result and "results" in result:
            for item in result["results"]:
                name = item.get("title", "")
                data_points = item.get("data", [])
                if data_points:
                    avg = sum(d.get("ratio", 0) for d in data_points) / len(data_points)
                    scores[name] = round(avg, 2)

        time.sleep(0.3)

    print(f"  네이버 트렌드 점수 수집: {len(scores)}개 키워드")
    return scores


def get_google_trends():
    """구글 pytrends로 한국 급상승 검색어와 우리 키워드 매칭."""
    print("\n[4-2] 구글 트렌드 급상승 키워드 수집 중...")

    google_hot = {}

    try:
        from pytrends.request import TrendReq

        pytrends = TrendReq(hl='ko', tz=540, retries=3, backoff_factor=1.0)
        trending = pytrends.trending_searches(pn='south_korea')

        if trending is not None and not trending.empty:
            trending_list = trending[0].tolist()
            print(f"  구글 급상승 검색어 {len(trending_list)}개 수집")

            for hot_keyword in trending_list:
                for our_keyword in TREND_KEYWORDS:
                    if our_keyword.replace(" ", "") in hot_keyword.replace(" ", ""):
                        google_hot[our_keyword] = 50
                        print(f"  🔥 급상승 매칭: '{hot_keyword}' → '{our_keyword}'")
        else:
            print("  구글 급상승 데이터 없음")

    except ImportError:
        print("  ⚠️ pytrends 미설치, 건너뜀")
    except Exception as e:
        print(f"  ⚠️ 구글 트렌드 실패 (무시하고 계속): {e}")

    return google_hot


def apply_trend_scores(items, naver_scores, google_scores):
    """데이터 항목들에 트렌드 점수를 매핑."""
    for item in items:
        name = item.get("name", "")
        best_score = 0

        for keyword, score in naver_scores.items():
            if keyword in name:
                best_score = max(best_score, score)

        for keyword, bonus in google_scores.items():
            if keyword in name:
                best_score += bonus

        item["trend_score"] = round(best_score, 2)

    return items


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [5] 🚀 메인 실행
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def main():
    print("=" * 60)
    print(f"🚀 전국민 혜택존 데이터 수집 v2 시작")
    print(f"📅 {NOW.strftime('%Y-%m-%d %H:%M:%S')} KST")
    print("=" * 60)

    # ── 1단계: API 데이터 수집 ──
    subsidies, housing, medical = get_subsidies()
    business = get_business()
    finance = get_finance()

    # ── 2단계: 트렌드 점수 수집 ──
    naver_scores = get_naver_trends()
    google_scores = get_google_trends()

    # 트렌드 점수 통합 저장
    combined_scores = {}
    for kw in TREND_KEYWORDS:
        n = naver_scores.get(kw, 0)
        g = google_scores.get(kw, 0)
        combined_scores[kw] = round(n + g, 2)
    save_json("trend_scores.json", combined_scores)

    # ── 3단계: 트렌드 점수 매핑 ──
    subsidies = apply_trend_scores(subsidies, naver_scores, google_scores)
    housing = apply_trend_scores(housing, naver_scores, google_scores)
    medical = apply_trend_scores(medical, naver_scores, google_scores)
    business = apply_trend_scores(business, naver_scores, google_scores)

    # ── 4단계: JSON 저장 ──
    save_json("subsidies.json", subsidies)
    save_json("business.json", business)
    save_json("housing.json", housing)
    save_json("medical.json", medical)
    save_json("finance.json", finance)

    # ── 5단계: 지역별 통계 생성 ──
    all_regions = ["전국", "서울", "부산", "대구", "인천", "광주", "대전",
                   "울산", "세종", "경기", "강원", "충북", "충남",
                   "전북", "전남", "경북", "경남", "제주"]

    region_stats = {}
    all_items = subsidies + housing + medical + business
    for r in all_regions:
        if r == "전국":
            region_stats[r] = len([x for x in all_items if x.get("region") == "전국"])
        else:
            region_stats[r] = len([x for x in all_items if x.get("region") == r])

    # ── 6단계: 메타 정보 저장 ──
    meta = {
        "updated_at": NOW.strftime("%Y-%m-%d %H:%M:%S"),
        "timezone": "KST",
        "subsidies_count": len(subsidies),
        "business_count": len(business),
        "housing_count": len(housing),
        "medical_count": len(medical),
        "finance_count": len(finance),
        "trend_keywords_count": len(combined_scores),
        "region_stats": region_stats
    }
    save_json("meta.json", meta)

    # ── 완료 ──
    total = len(subsidies) + len(business) + len(housing) + len(medical) + len(finance)
    print("\n" + "=" * 60)
    print(f"✅ 수집 완료! 총 {total}건")
    print(f"  💰 정부지원·민생: {len(subsidies)}건")
    print(f"  🏢 소상공인·정책자금: {len(business)}건")
    print(f"  🏠 주거·부동산: {len(housing)}건")
    print(f"  🏥 의료·건강: {len(medical)}건")
    print(f"  💡 금융상품: {len(finance)}건")
    print(f"  📈 트렌드 키워드: {len(combined_scores)}개")
    print(f"\n  📊 지역별 통계:")
    for r in all_regions:
        cnt = region_stats.get(r, 0)
        if cnt > 0:
            print(f"     {r}: {cnt}건")
    print("=" * 60)


if __name__ == "__main__":
    main()
