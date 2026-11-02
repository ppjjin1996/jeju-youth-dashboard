"""원본 xlsx(../data)를 읽어 대시보드용 dashboard/data/data.js 를 만든다.

원칙
- 원본 값은 바꾸지 않는다. 행 삭제(결측·이상값·중복 후보 포함) 없이 '합계' 집계만 한다.
- 데이터마다 집계 기준이 다르므로 서로 합치거나 나누지 않는다.
- 엑셀이 장소명을 시각/날짜/숫자로 자동 변환한 셀은 문자열로만 바꿔 보존한다.

실행: python dashboard/scripts/build_data.py   (pandas, openpyxl 필요)
"""
import csv
import json
from collections import Counter
from datetime import date, datetime, time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data"
OUT = ROOT / "dashboard" / "data"


def as_text(v):
    if isinstance(v, str):
        return v
    if isinstance(v, (datetime, date, time)):
        return v.isoformat(sep=" ") if isinstance(v, datetime) else v.isoformat()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def sgg_of(addr):
    if "서귀포시" in addr:
        return "서귀포시"
    if "제주시" in addr:
        return "제주시"
    return ""


def index_of(values):
    uniq = sorted(set(values))
    return uniq, {v: i for i, v in enumerate(uniq)}


def quality(df, key_cols):
    return {
        "rows": int(len(df)),
        "na": {c: int(n) for c, n in df.isna().sum().items()},
        "exact_dup_rows": int(df.duplicated().sum()),
        "period": [int(df[key_cols[0]].min()), int(df[key_cols[0]].max())],
        "months": int(df[key_cols[0]].nunique()),
    }


meta = {"files": {}}

# 1) 연령대별 방문 (시도 단위, 성별×연령)
age = pd.read_excel(SRC / "제주 연령대별 방문.xlsx")
meta["files"]["age"] = quality(age, ["기준연월"])
age_rows = age[["기준연월", "성별", "연령", "방문객수"]].values.tolist()

# 2) 월별 입도 관광객 (연령 구분 없음)
arr = pd.read_excel(SRC / "월별 입도 관광객.xlsx")
meta["files"]["arrivals"] = quality(arr, ["기준연월"])
arr_rows = arr[["기준연월", "내국인 입도 관광객수", "외국인 입도 관광객수", "전체 입도 관광객수"]].values.tolist()

# 3) 읍면동별 방문객 + 주민센터 좌표(지오코딩 결과)
emd = pd.read_excel(SRC / "제주 지역별 방문객(읍면동).xlsx", sheet_name=0)
meta["files"]["emd"] = quality(emd, ["기준연월"])
geo = {r["읍면동명"]: r for r in csv.DictReader(open(OUT / "geocode_centers.csv", encoding="utf-8"))}
emd_info = (emd[["읍면동명", "읍면동코드", "시군구명", "주민센터 주소"]]
            .drop_duplicates().sort_values("읍면동코드").reset_index(drop=True))
emd_list = []
for _, r in emd_info.iterrows():
    g = geo.get(r["읍면동명"], {})
    emd_list.append({
        "name": r["읍면동명"], "code": int(r["읍면동코드"]), "sgg": r["시군구명"], "addr": r["주민센터 주소"],
        "lat": float(g["lat"]) if g.get("lat") else None, "lon": float(g["lon"]) if g.get("lon") else None,
        "geoMethod": g.get("방법", "실패"), "geoPrecision": g.get("정밀도", ""), "geoResult": g.get("결과명", ""),
    })
emd_idx = {e["name"]: i for i, e in enumerate(emd_list)}
emd_rows = [[int(r.기준연월), emd_idx[r.읍면동명], int(r["내국인 방문객수"]), int(r["외국인 방문객수"]),
             int(r["총 방문객수 (내국인+외국인)"])] for _, r in emd.iterrows()]

# 4) 인기 장소 (내비게이션 도착 기준). 키 = (목적지명, 읍면동명, 카테고리 3단계)
pl = pd.read_excel(SRC / "제주 지역별 인기 장소.xlsx")
meta["files"]["places"] = quality(pl, ["주행일자(YYYYMM)"])
raw_types = Counter(type(v).__name__ for v in pl["목적지명"])
meta["files"]["places"]["name_cell_types"] = dict(raw_types)
pl["목적지명"] = pl["목적지명"].map(as_text)
meta["files"]["places"]["arrival_ne_sum_rows"] = int(
    (pl["도착건수"] != pl["관광객 도착 수"] + pl["도민 도착 수"]).sum())
cats, cat_idx = index_of(pl["카테고리 3단계"])
g = (pl.groupby(["목적지명", "읍면동명", "카테고리 3단계"])
     .agg(addr=("목적지주소", "first"), n_addr=("목적지주소", "nunique")).reset_index())
place_list = [[r.목적지명, emd_idx[r.읍면동명], cat_idx[r["카테고리 3단계"]], r.addr, int(r.n_addr)]
              for _, r in g.iterrows()]
place_idx = {(p[0], emd_list[p[1]]["name"], cats[p[2]]): i for i, p in enumerate(place_list)}
monthly = (pl.groupby(["주행일자(YYYYMM)", "목적지명", "읍면동명", "카테고리 3단계"])
           [["관광객 도착 수", "도민 도착 수", "도착건수"]].sum().reset_index())
place_rows = {}
for r in monthly.itertuples(index=False):
    pi = place_idx[(r[1], r[2], r[3])]
    place_rows.setdefault(int(r[0]), []).extend([pi, int(r[4]), int(r[5]), int(r[6])])

# 5) 비짓제주 검색어 순위: (월, 분류명, 지역명, 시군구[주소에서 추출]) 합계와 행 수
kw = pd.read_excel(SRC / "비짓제주 검색어 순위.xlsx")
meta["files"]["keywords"] = quality(kw, ["기준년월"])
meta["files"]["keywords"]["name_cell_types"] = dict(Counter(type(v).__name__ for v in kw["지역명"]))
meta["files"]["keywords"]["addr_dash_rows"] = int((kw["주소"] == "-").sum())
meta["files"]["keywords"]["rows_per_month_name"] = {
    str(k): int(v) for k, v in kw.groupby(["기준년월", "지역명"]).size().value_counts().sort_index().items()}
kw["지역명"] = kw["지역명"].map(as_text)
kw["시군구"] = kw["주소"].map(sgg_of)
kw_cats, kw_cat_idx = index_of(kw["분류명"])
kw_names, kw_name_idx = index_of(kw["지역명"])
sggs = ["", "제주시", "서귀포시"]
kg = kw.groupby(["기준년월", "분류명", "지역명", "시군구"])["수치"].agg(["sum", "size"]).reset_index()
kw_rows = []
for r in kg.itertuples(index=False):
    kw_rows.extend([int(r[0]), kw_cat_idx[r[1]], kw_name_idx[r[2]], sggs.index(r[3]), int(r[4]), int(r[5])])

data = {
    "meta": meta,
    "age": age_rows,
    "arrivals": arr_rows,
    "emd": emd_list,
    "emdRows": emd_rows,
    "placeCats": cats,
    "places": place_list,
    "placeRows": place_rows,
    "kwCats": kw_cats,
    "kwNames": kw_names,
    "kwSgg": sggs,
    "kwRows": kw_rows,
}
with open(OUT / "data.js", "w", encoding="utf-8") as f:
    f.write("window.DASH_DATA=")
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
print("written", (OUT / "data.js").stat().st_size // 1024, "KB")
print(json.dumps(meta, ensure_ascii=False, indent=1))
