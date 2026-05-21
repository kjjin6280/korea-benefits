# 🇰🇷 전국민 혜택존 (korea-benefits)

> 대한민국 정부지원금·소상공인 정책자금·주거/의료/금융 혜택 정보를 자동 수집하여 블로그에 실시간 렌더링하는 시스템

## 📊 카테고리
| 카테고리 | 데이터 파일 | 데이터 소스 |
|---------|-----------|-----------|
| 💰 정부지원·민생 혜택 | subsidies.json | 정부24 API |
| 🏢 소상공인·정책 자금 | business.json | 기업마당 API |
| 🏠 주거·부동산 지원 | housing.json | 정부24 API (분리) |
| 🏥 의료·건강 지원 | medical.json | 정부24 API (분리) |
| 💡 금융·재테크 꿀팁 | finance.json | 금감원 API |

## ⚙️ 자동 실행
- GitHub Actions가 매일 오전 7시(KST)에 `update.py` 실행
- 네이버 데이터랩 + 구글 트렌드로 키워드 트렌드 점수 산출
- GA4 Data API로 페이지별 조회수 수집

## 🔑 필요한 GitHub Secrets
| Secret | 용도 | 발급처 |
|--------|------|--------|
| DATA_API_KEY | 정부24 API | data.go.kr |
| BIZ_API_KEY | 기업마당 API | bizinfo.go.kr |
| FSS_API_KEY | 금감원 API | finlife.fss.or.kr |
| NAVER_CLIENT_ID | 네이버 데이터랩 | developers.naver.com |
| NAVER_CLIENT_SECRET | 네이버 데이터랩 | developers.naver.com |
| GA4_PROPERTY_ID | GA4 속성 ID | analytics.google.com |
| GA4_CREDENTIALS_JSON | GA4 서비스 계정 키 | console.cloud.google.com |

## 📁 파일 구조
