# 청년층 제주 관광 동향 대시보드

## 실행 방법
```bash
cd "4주차 실습/dashboard"
python3 -m http.server 8765
# 브라우저에서 http://localhost:8765 접속
```
- `index.html`을 더블클릭해도 차트·필터는 동작합니다. 다만 지도 배경(OpenStreetMap 타일)은 인터넷 연결이 필요하고, 로컬 서버(http://localhost)로 여는 것을 권장합니다.
- 처음 열 때 `data/data.js`(약 18MB)를 읽느라 몇 초 걸릴 수 있습니다.

## 필요한 파일
| 경로 | 역할 |
|---|---|
| `index.html`, `style.css`, `app.js` | 화면, 집계, 필터, 차트 |
| `data/data.js` | 원본 xlsx에서 생성한 대시보드용 데이터 |
| `data/geocode_centers.csv` | 주민센터 주소 지오코딩 결과(지도용) |
| `vendor/` | ECharts 5.5.1, echarts-wordcloud 2.1.0, Leaflet 1.9.4(로컬 사본) |
| `scripts/build_data.py` | `../data/*.xlsx` → `data/data.js` 재생성(pandas, openpyxl 필요) |
| `scripts/geocode_centers.py` | 주민센터 주소 → 좌표(OSM Nominatim, 인터넷 필요) |

원본 데이터가 바뀌면 다음 순서로 다시 만듭니다.
1. `python scripts/geocode_centers.py` (읍면동이 바뀐 경우에만)
2. `python scripts/build_data.py`

## 데이터 처리 원칙
- 원본 값은 바꾸지 않았고, 행 삭제 없이 합계만 냈습니다. 결측 0건, 이상값·중복 후보도 그대로 유지했습니다.
- 데이터마다 집계 기준이 달라 서로 합치거나 나누지 않았습니다. 대시보드 하단 '데이터 설명' 표에 정리되어 있습니다.
- 연령 정보는 `제주 연령대별 방문`에만 있습니다. 지역·장소·검색어는 전체 관광객 특성으로 표시합니다.
- 엑셀이 시각·날짜·숫자로 자동 변환한 장소명 셀(장소 48개, 검색어 2개)은 문자열로만 바꿨습니다.

## 지도 기준
- 원본에는 좌표가 없습니다. 원본 시트 `주민센터_주소목록`의 주소를 OSM Nominatim으로 지오코딩했습니다.
- 검색 결과에 해당 읍면동명이 들어 있을 때만 채택했습니다. 43개 중 42개를 확보했습니다(건물·기관 단위 37개, 도로·지역 근사 5개).
- 한경면은 원본 주소로 찾지 못했습니다. 그래서 '한경면사무소' 기관명 검색 결과(두신로 84)를 썼고, 원본 주소(칠전로 37)와 다릅니다.
- 추자면은 좌표를 확인하지 못해 지도에서 뺐습니다. 막대그래프와 표에는 포함됩니다.
- 원의 면적은 선택 기간의 읍면동 총 방문객 수(내국인+외국인)에 비례합니다. 위치는 주민센터 위치이며, 읍면동 경계나 실제 방문 지점이 아닙니다.

## 워드클라우드 기준
- `비짓제주 검색어 순위`의 '지역명'(검색 대상 장소명)별 '수치' 합계 상위 50개를 그립니다. 기간·분류명·시군구 조건을 적용합니다.
- 시군구는 주소 문자열에서 뽑았습니다. 이 데이터에는 읍면동 정보가 없어 읍면동을 고르면 해당 시군구 단위로 적용됩니다.
- '수치'의 단위는 확인되지 않았습니다. 같은 월·장소에 최대 7행이 있으며, 모두 합산했습니다.
- 워드클라우드 라이브러리를 불러오지 못하면 빈도 막대그래프로 자동 대체됩니다. 빈도 표는 항상 표시됩니다.

## 네이버 지도 설정
- 대시보드는 `config.js`의 `naverMapKeyId`로 네이버 지도(JS API v3, `ncpKeyId` 파라미터)를 먼저 불러옵니다.
- 키가 없거나 인증에 실패하면 OpenStreetMap(Leaflet) 지도로 자동 전환됩니다. 이때 실패 사유가 지도 아래에 표시됩니다.
- 네이버 클라우드 플랫폼 콘솔 → AI·Application Service → **Maps** → Application에서 다음을 확인하세요.
  1. 사용 서비스에 **Dynamic Map**이 선택되어 있는지
  2. **Web 서비스 URL**에 `http://localhost:8765`(실제 접속 주소)가 등록되어 있는지
- Client Secret은 지도 표시에 필요하지 않습니다. 브라우저용 파일(`config.js`, `app.js`)에는 넣지 말고, 서버 측 API(지오코딩 등)용으로 `4주차 실습/.env`의 `NCP_MAP_KEY_ID` / `NCP_MAP_KEY`에 둡니다.
- 적용 상태(2026-11-02): Client ID `p7s9o27fix`로 `http://localhost:8765`에서 네이버 지도 인증·표시를 확인했습니다. 다른 주소로 열면 그 주소도 Web 서비스 URL에 등록해야 합니다.
- 같은 Application에서 **Geocoding**을 신청하면 주민센터 주소 → 좌표 변환을 네이버 지오코딩으로 바꿀 수 있습니다. 지금은 OSM Nominatim을 쓰고, 추자면 좌표가 없습니다.

## 온라인 후기 수집 (네이버 블로그 검색 · NCP NAVER API HUB)
- API: `GET https://naverapihub.apigw.ntruss.com/search/v1/blog`, 헤더 `X-NCP-APIGW-API-KEY-ID` / `X-NCP-APIGW-API-KEY` ([문서](https://api.ncloud-docs.com/docs/naver-api-hub-search-blog))
- 키: NCP 콘솔 > NAVER API HUB에서 검색 API를 신청한 Application의 키를 `4주차 실습/.env`에 `NAVER_API_HUB_KEY_ID`, `NAVER_API_HUB_KEY`로 넣습니다. 이 파일은 공개 폴더 밖에 있습니다.
- 실행: `python dashboard/scripts/collect_reviews.py` → `data/reviews_raw.csv`(수집 원본), `data/reviews.js`(대시보드용)
  - 규칙만 고친 경우 `--skip-fetch`로 분류만 다시 합니다.
- 수집 결과(2026-11-02): 검색어 8개 × 관련도 상위 최대 1,000건 → 고유 글 5,522건
  - 제목·요약문에 '제주'가 없는 83건은 화면 집계에서 제외했습니다. 원본 CSV에는 남아 있습니다.
- 한계
  - API는 제목과 요약문(약 200자)만 줍니다.
  - 주제는 정규식 사전(`THEMES`)으로 분류하므로 문맥 오분류가 있을 수 있습니다. 예시 글로 점검이 필요합니다.
  - 관련도 상위 글만 받아 최근(2026년) 글에 치우쳐 있습니다. 연도 비교에는 쓸 수 없습니다.
  - '20대 관련 표현'은 작성자 연령을 확인한 것이 아닙니다.
  - 광고·협찬 표현은 요약문 기준이라 일부만 걸러집니다.
  - 유튜브·지도 리뷰는 포함되지 않습니다.
