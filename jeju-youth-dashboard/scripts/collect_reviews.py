"""네이버 블로그 검색 API(네이버 클라우드 플랫폼 NAVER API HUB)로 제주 여행 후기를 수집하고,
주제 사전으로 분류해 dashboard/data/reviews.js 를 만든다.

인증 정보: 환경변수 NAVER_API_HUB_KEY_ID / NAVER_API_HUB_KEY, 없으면 '4주차 실습/.env' 에서 읽는다.
  - .env 는 웹서버가 공개하는 dashboard/ 폴더 밖에 두고, 키를 브라우저용 파일(js)에 넣지 않는다.
  - 키는 NCP 콘솔 > NAVER API HUB 에서 검색 API를 신청한 Application 의 Client ID / Client Secret.
  - 문서: https://api.ncloud-docs.com/docs/naver-api-hub-search-blog

실행
  python dashboard/scripts/collect_reviews.py              # 수집 + 분류
  python dashboard/scripts/collect_reviews.py --skip-fetch # 기존 reviews_raw.csv 로 분류만 다시

한계
  - API는 제목과 요약문(약 200자)만 준다 → 분석은 본문 전체가 아닌 요약문 기준.
  - 작성자 연령은 알 수 없다 → '20대 관련 표현이 있는 글'은 표현 언급 여부일 뿐 연령 검증이 아니다.
  - 주제 분류는 아래 THEMES 사전의 정규식 일치 여부(규칙 기반)이며 감성 분석 모델이 아니다.
"""
import argparse
import csv
import html
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "dashboard" / "data"
RAW = OUT / "reviews_raw.csv"
API = "https://naverapihub.apigw.ntruss.com/search/v1/blog"

QUERIES = [
    "제주 여행 후기", "제주도 여행 후기", "20대 제주 여행", "제주 여행 20대 후기",
    "제주 친구 여행 후기", "제주 혼자 여행 후기", "제주 뚜벅이 여행", "제주 커플 여행 후기",
]
DISPLAY, MAX_START = 100, 1000  # API 제한: display ≤ 100, start ≤ 1000

YOUTH = r"20대|이십대|대학생|사회초년생|스무 ?살"
# 광고·협찬 의심 표현(요약문 기준). 삭제하지 않고 표시만 하며, 화면에서 제외 여부를 선택한다.
AD = r"협찬|원고료|소정의|제공받아|제공 ?받[아고]|체험단|광고|내돈내산 ?아님|업체로부터"

# 주제 사전: (영역, 주제, 정규식). 글(제목+요약문)에 한 번이라도 일치하면 그 주제로 1건 집계.
THEMES = [
    ("activity", "카페 방문", r"카페|커피|베이커리"),
    ("activity", "맛집 탐방", r"맛집|흑돼지|고기국수|갈치|해산물|횟집|먹방"),
    ("activity", "바다·해변", r"해수욕장|해변|바다|스노클링|서핑|물놀이"),
    ("activity", "오름·등산", r"오름|한라산|등산|트레킹|백록담"),
    ("activity", "올레길·산책", r"올레길|올레 ?\d|산책|숲길|둘레길"),
    ("activity", "드라이브·렌터카", r"드라이브|렌트카|렌터카|해안도로"),
    ("activity", "체험·액티비티", r"체험|액티비티|승마|카트|요트|패러|짚라인|ATV"),
    ("activity", "전시·박물관", r"박물관|미술관|전시|아르떼|빛의 ?벙커"),
    ("activity", "시장·쇼핑", r"시장|쇼핑|기념품|소품샵|편집샵"),
    ("activity", "사진·인생샷", r"인생샷|사진 ?(명소|맛집|스팟)|포토 ?(존|스팟)"),
    ("activity", "숙소·호캉스", r"호캉스|숙소|게하|게스트하우스|풀빌라|리조트"),
    ("satisfaction", "자연 경관", r"풍경|경치|뷰 ?(가|도)? ?(좋|예쁘|이쁘|최고|미쳤)|오션뷰|노을|일몰|일출"),
    ("satisfaction", "음식 맛", r"맛있|존맛|JMT|jmt|꿀맛|맛집 ?인정"),
    ("satisfaction", "친절한 서비스", r"친절(?!하지)|서비스 ?(가|도)? ?좋"),
    ("satisfaction", "가성비", r"가성비|저렴|합리적"),
    ("satisfaction", "청결·시설", r"깨끗|청결|시설 ?(이|도)? ?좋"),
    ("satisfaction", "힐링·휴식", r"힐링|여유|한적|조용"),
    ("satisfaction", "재방문·추천 의향", r"재방문|또 ?(가고|올)|강추|추천(합니다|해요|드려요)"),
    ("inconvenience", "높은 물가·가격", r"비싸|바가지|물가|가격 ?(이|도)? ?(사악|부담)"),
    ("inconvenience", "웨이팅·혼잡 언급", r"웨이팅(?! ?(없|X|x|0|안 ?하|안 ?했))|대기 ?(시간|줄)(?! ?(없|짧))|줄 ?(이|을)? ?(길게|서서)|사람 ?(이)? ?(너무|엄청) ?많|붐비|북적|혼잡"),
    ("inconvenience", "교통·이동 불편", r"교통 ?(이|도)? ?불편|버스 ?(배차|간격|가)? ?(길|안 ?와|드물)|이동 ?(이|도)? ?(힘들|불편)|뚜벅이 ?(는|라)? ?(힘들|불편)"),
    ("inconvenience", "주차 어려움", r"주차 ?(가|는|도)? ?(어렵|힘들|불편|헬|전쟁|공간 ?(이)? ?(없|부족))"),
    ("inconvenience", "날씨 영향", r"비 ?(가)? ?(와서|오는|내려|많이)|태풍|강풍|바람 ?(이)? ?(너무|엄청) ?(세|불)|날씨 ?(가)? ?(안 ?좋|흐|나빠)"),
    ("inconvenience", "불친절", r"불친절|친절하지 ?않"),
    ("inconvenience", "실망·기대 이하", r"실망|별로(였|이었|더라|네요|예요|에요|임)|기대 ?이하|비추천|(절대 ?)비추|비추 ?(후기|합니다|해요|임)"),
]
AREA_LABEL = {"activity": "주요 활동", "satisfaction": "만족 요인", "inconvenience": "불편 사항"}


def load_keys():
    cid, sec = os.environ.get("NAVER_API_HUB_KEY_ID"), os.environ.get("NAVER_API_HUB_KEY")
    env = ROOT / ".env"
    if (not cid or not sec) and env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            k, _, v = line.partition("=")
            if k.strip() == "NAVER_API_HUB_KEY_ID" and not cid:
                cid = v.strip()
            if k.strip() == "NAVER_API_HUB_KEY" and not sec:
                sec = v.strip()
    if not cid or not sec:
        sys.exit("NAVER_API_HUB_KEY_ID / NAVER_API_HUB_KEY 가 없습니다. '4주차 실습/.env' 를 확인하세요.")
    return cid, sec


def call(query, start, cid, sec):
    # 키가 프로세스 목록에 보이지 않도록 curl 설정을 표준입력(-K -)으로 전달
    cfg = f'header = "X-NCP-APIGW-API-KEY-ID: {cid}"\nheader = "X-NCP-APIGW-API-KEY: {sec}"\n'
    res = subprocess.run(
        ["curl", "-s", "-m", "20", "-G", API, "--data-urlencode", f"query={query}",
         "-d", f"display={DISPLAY}", "-d", f"start={start}", "-d", "sort=sim", "-K", "-"],
        input=cfg.encode(), capture_output=True, check=True)
    data = json.loads(res.stdout or b"{}")
    if "items" not in data:
        raise RuntimeError(f"네이버 API 오류: {json.dumps(data, ensure_ascii=False)[:300]}")
    return data


def clean(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def fetch():
    cid, sec = load_keys()
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    posts, total_hits = {}, {}
    for q in QUERIES:
        start = 1
        while start <= MAX_START:
            d = call(q, start, cid, sec)
            total_hits[q] = d.get("total", 0)
            items = d.get("items", [])
            for it in items:
                link = it["link"]
                p = posts.setdefault(link, {
                    "link": link, "title": clean(it["title"]), "description": clean(it["description"]),
                    "bloggername": it.get("bloggername", ""), "postdate": it.get("postdate", ""),
                    "queries": [], "collected_at": now})
                if q not in p["queries"]:
                    p["queries"].append(q)
            print(f"  {q} start={start}: {len(items)}건", file=sys.stderr)
            if len(items) < DISPLAY:
                break
            start += DISPLAY
            time.sleep(0.15)
    OUT.mkdir(parents=True, exist_ok=True)
    with open(RAW, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["postdate", "title", "description", "bloggername", "link", "queries", "collected_at"])
        w.writeheader()
        for p in posts.values():
            w.writerow({**p, "queries": " | ".join(p["queries"])})
    (OUT / "reviews_query_totals.json").write_text(json.dumps(total_hits, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"수집 완료: 고유 글 {len(posts)}건 → {RAW}", file=sys.stderr)


def build():
    if not RAW.exists():
        sys.exit(f"{RAW} 가 없습니다. 먼저 수집을 실행하세요.")
    rows = list(csv.DictReader(open(RAW, encoding="utf-8-sig")))
    pats = [(a, t, re.compile(p)) for a, t, p in THEMES]
    youth, ad = re.compile(YOUTH), re.compile(AD)
    posts = []
    for r in rows:
        text = f"{r['title']} {r['description']}"
        hits = [i for i, (_, _, rx) in enumerate(pats) if rx.search(text)]
        d = r["postdate"]
        posts.append([int(d[:6]) if len(d) == 8 else 0, d, r["title"], r["description"], r["link"],
                      1 if youth.search(text) else 0, hits, r["queries"], 1 if ad.search(text) else 0,
                      1 if "제주" in text else 0])  # 제목·요약문에 '제주'가 없는 글은 화면 집계에서 제외(원본 CSV에는 유지)
    totals = {}
    qt = OUT / "reviews_query_totals.json"
    if qt.exists():
        totals = json.loads(qt.read_text(encoding="utf-8"))
    data = {
        "meta": {"source": "네이버 블로그 검색 API(NCP NAVER API HUB) · 제목+요약문", "queries": QUERIES, "queryTotals": totals,
                 "collectedAt": rows[0]["collected_at"] if rows else "", "posts": len(rows),
                 "noDate": sum(1 for p in posts if not p[0]), "youthRule": YOUTH,
                 "adRule": AD, "adPosts": sum(p[8] for p in posts), "nonJeju": sum(1 for p in posts if not p[9])},
        "themes": [[a, t, p] for a, t, p in THEMES], "areas": AREA_LABEL, "posts": posts,
    }
    with open(OUT / "reviews.js", "w", encoding="utf-8") as f:
        f.write("window.REVIEW_DATA=")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"분류 완료: {len(posts)}건 → {OUT / 'reviews.js'}", file=sys.stderr)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-fetch", action="store_true")
    if not ap.parse_args().skip_fetch:
        fetch()
    build()
