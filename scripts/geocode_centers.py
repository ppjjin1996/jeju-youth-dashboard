"""주민센터 주소(원본 '주민센터_주소목록' 시트)를 OSM Nominatim으로 지오코딩한다.
결과: dashboard/data/geocode_centers.csv (읍면동명, 주소, lat, lon, 방법, 결과명)
- 좌표는 '주민센터(행정복지센터) 위치'이며 읍면동 경계/방문 위치가 아님.
- 실패한 읍면동은 lat/lon 공란으로 남기고 지도에서 제외한다.
"""
import csv, json, subprocess, sys, time, urllib.parse
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "제주 지역별 방문객(읍면동).xlsx"
OUT = ROOT / "dashboard" / "data" / "geocode_centers.csv"
UA = "jeju-youth-dashboard-study/1.0"

def q(text):
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"format": "json", "limit": 1, "countrycodes": "kr", "q": text})
    time.sleep(1.1)  # Nominatim 이용 정책: 초당 1회 이하
    out = subprocess.run(["curl", "-s", "-m", "20", "-A", UA, url], capture_output=True, check=True).stdout
    res = json.loads(out or b"[]")
    return res[0] if res else None

def in_jeju(hit):
    return hit and 33.0 < float(hit["lat"]) < 33.7 and 126.1 < float(hit["lon"]) < 127.0

NUM = {"1": "일", "2": "이"}

def matches_emd(hit, emd):
    """결과 주소에 해당 읍면동(행정동명 또는 '일도1동'→'일도일동' 같은 법정동 표기)이 포함되는지 검증."""
    name = hit.get("display_name", "")
    if emd in name:
        return True
    legal = emd[:-2] + NUM.get(emd[-2], emd[-2]) + "동" if emd[-2:-1] in NUM else None
    return bool(legal and legal in name)

def precision(hit):
    return "건물/기관" if hit.get("class") in ("amenity", "office", "building") or hit.get("addresstype") in ("amenity", "building", "office", "house") else "도로·지역(근사)"

wb = openpyxl.load_workbook(SRC, read_only=True)
ws = wb["주민센터_주소목록"]
rows = list(ws.iter_rows(values_only=True))[1:]
OUT.parent.mkdir(parents=True, exist_ok=True)
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["읍면동명", "주민센터주소", "lat", "lon", "방법", "정밀도", "결과명"])
    for emd, addr in rows:
        si = "서귀포시" if "서귀포시" in addr else "제주시"
        tries = [("주소", addr),
                 ("기관명", f"{emd} 행정복지센터 {si}"),
                 ("기관명", f"{emd}사무소 {si}"),
                 ("기관명", f"{emd}주민센터 {si}"),
                 ("행정구역명", f"{emd}, {si}, 제주특별자치도")]
        hit, how = None, ""
        for how, text in tries:
            h = q(text)
            if in_jeju(h) and matches_emd(h, emd):
                hit = h
                break
        if hit:
            w.writerow([emd, addr, hit["lat"], hit["lon"], how, precision(hit), hit.get("display_name", "")])
        else:
            w.writerow([emd, addr, "", "", "실패", "", ""])
        print(emd, how if hit else "실패", hit and precision(hit), hit and hit["display_name"][:50], file=sys.stderr)
