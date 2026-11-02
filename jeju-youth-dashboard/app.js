/* 청년층 제주 관광 동향 대시보드
 * 데이터: data/data.js (scripts/build_data.py 가 원본 xlsx에서 생성)
 * 모든 수치는 필터가 바뀔 때마다 원자료 행에서 다시 합산한다.
 */
(function () {
  "use strict";
  const D = window.DASH_DATA;
  const $ = (id) => document.getElementById(id);
  if (!D) {
    $("loading").textContent = "data/data.js 를 불러오지 못했습니다. README의 실행 방법을 확인하세요.";
    return;
  }

  // ---------- 공통 ----------
  const C = { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", muted: "#c9ccd3", text: "#52514e", grid: "#eceef2" };
  const YEAR_COLOR = { 2024: C.s1, 2025: C.s2, 2026: C.s3 }; // 색은 연도(개체)에 고정
  const AGE_LABEL = (a) => (a === "" ? "전체 연령" : a + "대");
  const SEX_LABEL = { "": "", M: "남성", W: "여성" };
  const fmt = (v) => (v == null || Number.isNaN(v) ? "-" : Math.round(v).toLocaleString("ko-KR"));
  const pct = (v, sign = true) => (v == null || !Number.isFinite(v) ? "-" : (sign && v > 0 ? "+" : "") + (v * 100).toFixed(Math.abs(v) < 0.0005 && v !== 0 ? 2 : 1) + "%");
  const ymLabel = (ym) => `${Math.floor(ym / 100)}년 ${ym % 100}월`;
  const ymShort = (ym) => `${Math.floor(ym / 100)}.${String(ym % 100).padStart(2, "0")}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const range = (arr) => [Math.min(...arr), Math.max(...arr)];

  function table(head, rows, opts = {}) {
    if (!rows.length) return `<div class="emptybox">표시할 데이터가 없습니다.</div>`;
    const h = head.map((x) => `<th class="${x.n ? "n" : ""}">${esc(x.t)}</th>`).join("");
    const b = rows
      .map((r, i) => `<tr class="${opts.hl && opts.hl(i) ? "hl" : ""}">` + r.map((c, j) => `<td class="${head[j].n ? "n" : ""}">${c}</td>`).join("") + "</tr>")
      .join("");
    return `<table><thead><tr>${h}</tr></thead><tbody>${b}</tbody></table>`;
  }
  function emptyChart(chart, el, msg) {
    chart.clear();
    chart.setOption({ title: { text: msg, left: "center", top: "middle", textStyle: { fontSize: 14, color: "#7a7974", fontWeight: 400 } } });
  }
  const FONT = "Pretendard, \"Apple SD Gothic Neo\", \"Noto Sans KR\", \"Malgun Gothic\", sans-serif"; // 캔버스는 "inherit"를 해석하지 못함
  const baseText = { color: C.text, fontFamily: FONT };

  // ---------- 데이터 인덱스 ----------
  const ageMonths = [...new Set(D.age.map((r) => r[0]))].sort();
  const arrMonths = D.arrivals.map((r) => r[0]).sort();
  const emdMonths = [...new Set(D.emdRows.map((r) => r[0]))].sort();
  const placeMonths = Object.keys(D.placeRows).map(Number).sort();
  const kwMonths = [...new Set(D.kwRows.filter((_, i) => i % 6 === 0))].sort();
  const allMonths = [...new Set([...ageMonths, ...arrMonths, ...emdMonths, ...placeMonths, ...kwMonths])].sort();
  const ages = [...new Set(D.age.map((r) => r[2]))].sort((a, b) => a - b);
  const COVER = {
    age: range(ageMonths), arr: range(arrMonths), emd: range(emdMonths), place: range(placeMonths), kw: range(kwMonths),
  };
  const arrByYm = new Map(D.arrivals.map((r) => [r[0], r]));

  // 장소 카테고리: 전체 기간 관광객 도착 수 순으로 정렬
  const catTotal = new Float64Array(D.placeCats.length);
  for (const ym of placeMonths) {
    const a = D.placeRows[ym];
    for (let i = 0; i < a.length; i += 4) catTotal[D.places[a[i]][2]] += a[i + 1];
  }

  // ---------- 필터 UI ----------
  const F = { start: $("fStart"), end: $("fEnd"), age: $("fAge"), sex: $("fSex"), region: $("fRegion"), pMetric: $("pMetric"), pCat: $("pCat"), kwCat: $("kwCat"), kwView: $("kwView") };
  const DEFAULT = { start: COVER.age[0], end: COVER.age[1], age: "20", sex: "", region: "" };
  for (const ym of allMonths) {
    F.start.add(new Option(ymLabel(ym), ym));
    F.end.add(new Option(ymLabel(ym), ym));
  }
  F.age.add(new Option("전체 연령", ""));
  for (const a of ages) F.age.add(new Option(a + "대" + (a === 70 ? " (원자료 코드 70)" : ""), a));
  F.region.add(new Option("전체 지역", ""));
  for (const sgg of ["제주시", "서귀포시"]) {
    const g = document.createElement("optgroup");
    g.label = sgg;
    g.appendChild(new Option(`${sgg} 전체`, "sgg:" + sgg));
    D.emd.forEach((e, i) => e.sgg === sgg && g.appendChild(new Option(e.name, "emd:" + i)));
    F.region.appendChild(g);
  }
  F.pCat.add(new Option("전체 카테고리", ""));
  [...D.placeCats.keys()].sort((a, b) => catTotal[b] - catTotal[a]).forEach((i) => F.pCat.add(new Option(D.placeCats[i], i)));
  F.kwCat.add(new Option("전체 분류", ""));
  D.kwCats.forEach((c, i) => F.kwCat.add(new Option(c, i)));

  // ---------- 기간 선택: 월 달력 (숨긴 select 값을 바꾸고 change 이벤트를 보냄) ----------
  const monthSet = new Set(allMonths);
  const minY = Math.floor(allMonths[0] / 100), maxY = Math.floor(allMonths[allMonths.length - 1] / 100);
  function monthPicker(sel) {
    const wrap = sel.parentElement.querySelector(".mp"), btn = wrap.querySelector(".mp-btn");
    const pop = document.createElement("div");
    pop.className = "mp-pop"; pop.hidden = true; pop.setAttribute("role", "dialog");
    wrap.appendChild(pop);
    let year;
    const sync = () => { btn.innerHTML = `<span aria-hidden="true">📅</span> ${ymLabel(+sel.value)}`; };
    const draw = () => {
      const cur = +sel.value, a = Math.min(+F.start.value, +F.end.value), b = Math.max(+F.start.value, +F.end.value);
      pop.innerHTML = `<div class="mp-head"><button type="button" data-y="-1" ${year <= minY ? "disabled" : ""} aria-label="이전 해">‹</button><b>${year}년</b>` +
        `<button type="button" data-y="1" ${year >= maxY ? "disabled" : ""} aria-label="다음 해">›</button></div><div class="mp-grid">` +
        Array.from({ length: 12 }, (_, i) => {
          const ym = year * 100 + i + 1, ok = monthSet.has(ym);
          const cls = [ym === cur ? "on" : "", ok && ym >= a && ym <= b ? "in" : ""].join(" ");
          return `<button type="button" data-ym="${ym}" class="${cls}" ${ok ? "" : 'disabled title="데이터 없음"'}>${i + 1}월</button>`;
        }).join("") + `</div><p class="mp-foot">수록 기간 ${ymShort(allMonths[0])}~${ymShort(allMonths[allMonths.length - 1])} · 회색은 데이터 없음</p>`;
    };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = pop.hidden;
      closePickers();
      if (open) { year = Math.floor(+sel.value / 100); draw(); pop.hidden = false; }
    });
    pop.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.y) { year += +b.dataset.y; draw(); return; }
      sel.value = b.dataset.ym; pop.hidden = true; sel.dispatchEvent(new Event("change"));
    });
    return { sync, pop };
  }
  const pickers = [monthPicker(F.start), monthPicker(F.end)];
  const closePickers = () => pickers.forEach((p) => (p.pop.hidden = true));
  document.addEventListener("click", closePickers);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closePickers());

  function setDefaults() {
    F.start.value = DEFAULT.start; F.end.value = DEFAULT.end; F.age.value = DEFAULT.age; F.sex.value = DEFAULT.sex; F.region.value = DEFAULT.region;
    F.pMetric.value = "0"; F.pCat.value = ""; F.kwCat.value = ""; F.kwView.value = "cloud";
  }

  function state() {
    let s = +F.start.value, e = +F.end.value, swapped = false;
    if (s > e) { [s, e] = [e, s]; swapped = true; }
    const months = allMonths.filter((m) => m >= s && m <= e);
    const rv = F.region.value;
    let scope = { kind: "all", label: "전체 지역", sgg: null, emd: null };
    if (rv.startsWith("sgg:")) scope = { kind: "sgg", label: rv.slice(4), sgg: rv.slice(4), emd: null };
    if (rv.startsWith("emd:")) { const i = +rv.slice(4); scope = { kind: "emd", label: `${D.emd[i].sgg} ${D.emd[i].name}`, sgg: D.emd[i].sgg, emd: i }; }
    return { s, e, swapped, months, monthSet: new Set(months), age: F.age.value === "" ? "" : +F.age.value, sex: F.sex.value, scope };
  }
  const inScope = (st, emdIdx) => st.scope.kind === "all" || (st.scope.kind === "sgg" ? D.emd[emdIdx].sgg === st.scope.sgg : emdIdx === st.scope.emd);
  const coverNote = (st, cov, name) => {
    const miss = st.months.filter((m) => m < cov[0] || m > cov[1]);
    return miss.length ? `${name} 데이터는 ${ymShort(cov[0])}~${ymShort(cov[1])}만 있어 선택 기간 중 ${miss.map(ymShort).join(", ")}은(는) 제외됨.` : "";
  };

  // ---------- 집계 ----------
  function ageSeries(age, sex) {
    const m = new Map();
    for (const [ym, sx, a, n] of D.age) {
      if (age !== "" && a !== age) continue;
      if (sex && sx !== sex) continue;
      m.set(ym, (m.get(ym) || 0) + n);
    }
    return m;
  }

  // ---------- 차트 인스턴스 ----------
  const charts = {
    trend: echarts.init($("trendChart")), region: echarts.init($("regionBar")), place: echarts.init($("placeBar")), kw: echarts.init($("kwChart")),
  };
  window.addEventListener("resize", () => { Object.values(charts).forEach((c) => c.resize()); MAP && MAP.resize(); });

  // ---------- 지도: 네이버 지도(config.js에 키가 있을 때) → 실패하면 Leaflet(OpenStreetMap) ----------
  // 어댑터 인터페이스: { kind, reason, clear(), add(lat, lon, r, style, tipHtml, onClick), fit(pts), resize() }
  let MAP = null;
  const MAP_KEY = (window.DASH_CONFIG || {}).naverMapKeyId;
  const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

  function leafletAdapter(reason) {
    const el = $("map");
    if (typeof L === "undefined") { el.innerHTML = `<div class="emptybox">지도 라이브러리를 불러오지 못했습니다. 막대그래프와 표를 확인하세요.</div>`; return null; }
    el.innerHTML = "";
    const m = L.map(el, { scrollWheelZoom: false }).setView([33.38, 126.55], 9);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(m);
    const layer = L.layerGroup().addTo(m);
    return {
      kind: "leaflet", reason,
      clear: () => layer.clearLayers(),
      add: (lat, lon, r, s, tip, onClick) => layer.addLayer(
        L.circleMarker([lat, lon], { radius: r, color: s.stroke, weight: s.weight, fillColor: s.fill, fillOpacity: 0.65 }).bindTooltip(tip).on("click", onClick)),
      fit: (pts) => m.fitBounds(pts, { padding: [24, 24], maxZoom: 12 }),
      resize: () => m.invalidateSize(),
    };
  }

  function naverAdapter() {
    const nm = naver.maps;
    const m = new nm.Map($("map"), {
      center: new nm.LatLng(33.38, 126.55), zoom: 9, scrollWheel: false,
      zoomControl: true, zoomControlOptions: { position: nm.Position.TOP_LEFT },
    });
    const info = new nm.InfoWindow({ content: "", borderColor: "#e2e6ee", anchorSize: new nm.Size(8, 8), pixelOffset: new nm.Point(0, -4) });
    let items = [];
    return {
      kind: "naver", map: m,
      clear: () => { info.close(); items.forEach((x) => x.setMap(null)); items = []; },
      add: (lat, lon, r, s, tip, onClick) => {
        const mk = new nm.Marker({
          position: new nm.LatLng(lat, lon), map: m,
          icon: { content: `<div style="width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:${rgba(s.fill, 0.65)};box-shadow:0 0 0 ${s.weight}px ${s.stroke};cursor:pointer"></div>`, anchor: new nm.Point(r, r) },
        });
        nm.Event.addListener(mk, "mouseover", () => { info.setContent(`<div style="padding:6px 9px;font-size:12px;line-height:1.5">${tip}</div>`); info.open(m, mk); });
        nm.Event.addListener(mk, "mouseout", () => info.close());
        nm.Event.addListener(mk, "click", onClick);
        items.push(mk);
      },
      fit: (pts) => {
        const b = new nm.LatLngBounds(new nm.LatLng(pts[0][0], pts[0][1]), new nm.LatLng(pts[0][0], pts[0][1]));
        pts.forEach(([a, o]) => b.extend(new nm.LatLng(a, o)));
        m.fitBounds(b, { top: 24, right: 24, bottom: 24, left: 24 });
        if (m.getZoom() > 12) m.setZoom(12);
      },
      resize: () => m.autoResize && m.autoResize(),
    };
  }

  function initMap(done) {
    if (!MAP_KEY) { MAP = leafletAdapter("config.js에 네이버 지도 키 없음"); return done(); }
    let settled = false;
    const fallback = (why) => {
      if (MAP && MAP.kind === "leaflet") return;
      console.warn("네이버 지도 대신 OpenStreetMap 사용:", why);
      if (MAP && MAP.map) try { MAP.map.destroy(); } catch (e) { /* 이미 해제됨 */ }
      settled = true;
      MAP = leafletAdapter(why);
      done();
    };
    // 네이버 지도 SDK가 인증 실패 시 호출하는 전역 콜백(키 오류, 미등록 서비스 URL, Dynamic Map 미신청 등)
    window.navermap_authFailure = () => fallback("네이버 지도 인증 실패 — Client ID·Web 서비스 URL·Dynamic Map 신청 여부 확인 필요");
    const s = document.createElement("script");
    s.src = "https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=" + encodeURIComponent(MAP_KEY);
    s.onload = () => {
      if (settled) return;
      try { MAP = naverAdapter(); settled = true; done(); } catch (e) { fallback("네이버 지도 초기화 오류: " + e.message); }
    };
    s.onerror = () => fallback("네이버 지도 스크립트를 불러오지 못함(네트워크)");
    setTimeout(() => !settled && fallback("네이버 지도 로딩 시간 초과"), 8000);
    document.head.appendChild(s);
  }

  // ---------- 렌더 ----------
  let LAST = {};
  function render() {
    const st = state();
    const ageLbl = AGE_LABEL(st.age) + (st.sex ? `·${SEX_LABEL[st.sex]}` : "");
    pickers.forEach((p) => p.sync());
    $("periodText").textContent = `${ymLabel(st.s)} ~ ${ymLabel(st.e)} (데이터별 수록 기간 상이 · 아래 '데이터 설명' 참고)`;
    const notes = [];
    if (st.swapped) notes.push("시작이 종료보다 늦어 두 값을 바꿔 적용했습니다.");
    notes.push("연령·성별 필터 → 핵심 지표·방문 추이(연령대별 방문 데이터)에만 적용. 지역 필터 → 지역별 방문·인기 장소 및 관광 검색어(시군구 단위)에 적용. 기간 필터 → 전체 적용.");
    $("filterNote").textContent = notes.join(" ");
    LAST = { st, ageLbl };
    renderKpis(st, ageLbl);
    renderTrend(st, ageLbl);
    renderRegion(st);
    renderPlaces(st);
    renderKeywords(st);
    renderReviews(st);
    renderSummary();
  }

  function renderKpis(st, ageLbl) {
    const ser = ageSeries(st.age, st.sex);
    const ms = st.months.filter((m) => ser.has(m));
    $("k1Title").textContent = `${ageLbl} 방문 규모`;
    $("k3Title").textContent = `${ageLbl} 비중`;
    const cov = coverNote(st, COVER.age, "연령대별 방문");
    if (!ms.length) {
      for (const k of ["k1", "k2", "k3"]) { $(k).textContent = "데이터 없음"; $(k).className = "big na"; }
      $("k1cap").textContent = cov || "선택 기간에 연령대별 방문 데이터가 없습니다.";
      $("k2cap").textContent = $("k3cap").textContent = "";
      LAST.ageTotal = null; LAST.yoy = null;
    } else {
      const tot = ms.reduce((s, m) => s + ser.get(m), 0);
      $("k1").textContent = fmt(tot) + "명"; $("k1").className = "big";
      $("k1cap").textContent = `${ymShort(ms[0])}~${ymShort(ms[ms.length - 1])} ${ms.length}개월 방문객수 합계 (연령대별 방문 데이터, 제주 전체 · 지역 필터 미적용). ${cov}`;
      const last = ms[ms.length - 1], prev = last - 100;
      if (ser.has(prev)) {
        const r = (ser.get(last) - ser.get(prev)) / ser.get(prev);
        $("k2").textContent = pct(r); $("k2").className = "big " + (r >= 0 ? "up" : "down");
        $("k2cap").textContent = `${ymLabel(last)} ${fmt(ser.get(last))}명 vs ${ymLabel(prev)} ${fmt(ser.get(prev))}명 (${ageLbl}, 선택 기간의 마지막 월 기준)`;
        LAST.yoy = { r, last, prev, v: ser.get(last), p: ser.get(prev) };
      } else {
        $("k2").textContent = "계산 불가"; $("k2").className = "big na";
        $("k2cap").textContent = `비교 대상 ${ymLabel(prev)} 데이터가 없습니다 (연령대별 데이터는 ${ymShort(COVER.age[0])}부터 수록). 종료 월을 2025년 1월 이후로 선택하세요.`;
        LAST.yoy = null;
      }
      if (st.age === "") {
        $("k3").textContent = "해당 없음"; $("k3").className = "big na"; $("k3cap").textContent = "전체 연령 선택 시 비중을 계산하지 않습니다.";
        LAST.share = null;
      } else {
        const all = ageSeries("", st.sex);
        const den = ms.reduce((s, m) => s + all.get(m), 0);
        $("k3").textContent = pct(tot / den, false); $("k3").className = "big";
        $("k3cap").textContent = `${ageLbl} 합계 ÷ 10~70대 전체 합계 (${fmt(den)}명), 같은 기간·성별 기준`;
        LAST.share = tot / den;
      }
      LAST.ageTotal = tot; LAST.ageMonths = ms; LAST.ageSer = ser;
    }
    // 참고 지표: 월별 입도 관광객 (연령 구분 없음)
    const am = st.months.filter((m) => arrByYm.has(m));
    if (!am.length) { $("k4").textContent = "데이터 없음"; $("k4").className = "big na"; $("k4cap").textContent = coverNote(st, COVER.arr, "입도 관광객"); }
    else {
      const t = am.reduce((s, m) => s + arrByYm.get(m)[3], 0);
      const last = am[am.length - 1], p = arrByYm.get(last - 100);
      $("k4").textContent = fmt(t) + "명"; $("k4").className = "big";
      $("k4cap").textContent = `내국인+외국인 입도 관광객 합계(월별 입도 관광객, 연령 구분 없음). ${ymLabel(last)} 전년 동월 대비 ${p ? pct((arrByYm.get(last)[3] - p[3]) / p[3]) : "계산 불가"}. 연령대별 방문객수와 집계 기준이 달라 직접 비교하지 마세요.`;
    }
  }

  function renderTrend(st, ageLbl) {
    const ser = ageSeries(st.age, st.sex);
    $("trendSub").textContent = `월별·연도별 ${ageLbl} 방문객 수 (단위: 명, 연령대별 방문 데이터)`;
    const years = [...new Set(st.months.filter((m) => ser.has(m)).map((m) => Math.floor(m / 100)))];
    if (!years.length) { emptyChart(charts.trend, null, "선택 기간에 연령대별 방문 데이터가 없습니다"); $("trendTable").innerHTML = ""; return; }
    const series = years.map((y) => ({
      name: y + "년", type: "line", symbol: "circle", symbolSize: 8, lineStyle: { width: 2 }, connectNulls: false,
      itemStyle: { color: YEAR_COLOR[y] || C.muted, borderColor: "#fcfcfb", borderWidth: 2 },
      data: Array.from({ length: 12 }, (_, i) => { const ym = y * 100 + i + 1; return st.monthSet.has(ym) && ser.has(ym) ? ser.get(ym) : null; }),
    }));
    charts.trend.setOption({
      textStyle: baseText, animation: false,
      legend: { top: 0, right: 10, textStyle: baseText },
      grid: { left: 70, right: 60, top: 36, bottom: 40 },
      tooltip: { trigger: "axis", axisPointer: { type: "line" }, valueFormatter: (v) => (v == null ? "데이터 없음" : fmt(v) + "명") },
      xAxis: { type: "category", name: "월", nameLocation: "middle", nameGap: 26, data: Array.from({ length: 12 }, (_, i) => i + 1 + "월"), axisLine: { lineStyle: { color: C.muted } }, axisTick: { show: false } },
      yAxis: { type: "value", name: "방문객 수(명)", nameTextStyle: { align: "left" }, splitLine: { lineStyle: { color: C.grid } }, axisLabel: { formatter: (v) => (v >= 10000 ? v / 10000 + "만" : v) } },
      series,
    }, true);
    const rows = st.months.filter((m) => ser.has(m)).map((m) => {
      const p = ser.get(m - 100);
      return [ymLabel(m), fmt(ser.get(m)), p != null ? fmt(p) : "-", p != null ? pct((ser.get(m) - p) / p) : "계산 불가"];
    });
    $("trendTable").innerHTML = table([{ t: "기준연월" }, { t: `${ageLbl} 방문객수(명)`, n: 1 }, { t: "전년 동월(명)", n: 1 }, { t: "전년 동월 대비", n: 1 }], rows);
  }

  function renderRegion(st) {
    const n = D.emd.length, dom = new Float64Array(n), fr = new Float64Array(n), tot = new Float64Array(n);
    let any = false;
    for (const [ym, i, d, f, t] of D.emdRows) if (st.monthSet.has(ym)) { dom[i] += d; fr[i] += f; tot[i] += t; any = true; }
    const cov = coverNote(st, COVER.emd, "읍면동 방문객");
    // 단일 읍면동 선택 시: 같은 시군구를 보여 주고 선택 읍면동을 강조
    const viewScope = st.scope.kind === "emd" ? { ...st, scope: { kind: "sgg", sgg: st.scope.sgg } } : st;
    const idx = [...Array(n).keys()].filter((i) => inScope(viewScope, i)).sort((a, b) => tot[b] - tot[a]);
    const scopeSum = idx.reduce((s, i) => s + tot[i], 0);
    LAST.region = { idx, tot, dom, fr, scopeSum, any };
    if (!any) {
      emptyChart(charts.region, null, "선택 기간에 읍면동 방문객 데이터가 없습니다");
      $("regionTable").innerHTML = ""; MAP && MAP.clear();
      $("mapNote").textContent = cov; return;
    }
    let top = idx.slice(0, 10);
    if (st.scope.kind === "emd" && !top.includes(st.scope.emd)) top = [...top, st.scope.emd];
    const hl = (i) => st.scope.kind !== "emd" || i === st.scope.emd;
    const cats = top.map((i) => D.emd[i].name).reverse();
    const mk = (arr, color, name) => ({
      name, type: "bar", stack: "v", barMaxWidth: 16,
      itemStyle: { color, borderColor: "#fcfcfb", borderWidth: 1 },
      data: top.map((i) => ({ value: arr[i], itemStyle: { color: hl(i) ? color : C.muted } })).reverse(),
    });
    charts.region.setOption({
      textStyle: baseText, animation: false,
      title: { text: `인기 지역 TOP ${Math.min(10, idx.length)} (${st.scope.kind === "all" ? "전체" : st.scope.sgg})`, textStyle: { fontSize: 13, fontWeight: 600, color: "#0b0b0b" } },
      legend: { top: 22, left: 0, textStyle: baseText },
      grid: { left: 70, right: 54, top: 54, bottom: 34 },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => {
        const i = top[top.length - 1 - ps[0].dataIndex];
        return `<b>${D.emd[i].sgg} ${D.emd[i].name}</b><br>내국인 ${fmt(dom[i])}명<br>외국인 ${fmt(fr[i])}명<br>합계 ${fmt(tot[i])}명<br>표시 범위 합계 대비 ${pct(tot[i] / scopeSum, false)}`;
      } },
      xAxis: { type: "value", name: "방문객 수(명)", nameLocation: "middle", nameGap: 22, splitNumber: 4, splitLine: { lineStyle: { color: C.grid } }, axisLabel: { formatter: (v) => (v >= 10000 ? v / 10000 + "만" : v) } },
      yAxis: { type: "category", data: cats, axisTick: { show: false }, axisLine: { lineStyle: { color: C.muted } } },
      series: [mk(dom, C.s1, "내국인 방문객수"), { ...mk(fr, C.s2, "외국인 방문객수"),
        label: { show: true, position: "right", fontSize: 10, color: C.text, formatter: (p) => pct(tot[top[top.length - 1 - p.dataIndex]] / scopeSum, false) } }],
    }, true);

    // 지도: 좌표(주민센터 지오코딩)가 있는 읍면동만
    if (MAP) {
      MAP.clear();
      const max = Math.max(...idx.map((i) => tot[i]));
      const pts = [];
      for (const i of idx) {
        const e = D.emd[i];
        if (e.lat == null) continue;
        const sel = st.scope.kind === "emd" && i === st.scope.emd;
        const r = 4 + 20 * Math.sqrt(tot[i] / max);
        MAP.add(e.lat, e.lon, r, { stroke: sel ? "#0b0b0b" : "#fcfcfb", weight: sel ? 3 : 1.5, fill: hl(i) ? C.s1 : C.muted },
          `<b>${e.sgg} ${e.name}</b><br>총 방문객 ${fmt(tot[i])}명<br>내국인 ${fmt(dom[i])} · 외국인 ${fmt(fr[i])}<br><span style="color:#7a7974">위치: 주민센터(${e.geoPrecision})</span>`,
          () => { F.region.value = "emd:" + i; render(); });
        pts.push([e.lat, e.lon]);
      }
      if (pts.length) MAP.fit(pts);
      const missing = idx.filter((i) => D.emd[i].lat == null).map((i) => D.emd[i].name);
      const base = MAP.kind === "naver" ? "배경 지도: 네이버 지도." : `배경 지도: OpenStreetMap${MAP.reason ? ` <span class="warn-text">(네이버 지도 미사용: ${esc(MAP.reason)})</span>` : ""}.`;
      $("mapNote").innerHTML = `${base} 원의 면적 ∝ 선택 기간 총 방문객 수(표시 범위 최대 ${fmt(max)}명). 원 위치는 원본 '주민센터_주소목록'의 주소를 OpenStreetMap Nominatim으로 지오코딩한 <b>주민센터 위치</b>이며 읍면동 경계·실제 방문 지점이 아닙니다. 원을 클릭하면 지역 필터가 바뀝니다.` +
        (missing.length ? ` <span class="warn-text">좌표 미확인으로 지도에서 제외: ${missing.join(", ")} (막대·표에는 포함).</span>` : "") +
        ` 읍면동별 방문객수는 한 사람이 여러 읍면동에서 집계될 수 있어 합계가 실제 방문객 수와 다를 수 있습니다(추가 확인 필요). ${cov}`;
    }
    $("regionTable").innerHTML = table(
      [{ t: "순위" }, { t: "시군구" }, { t: "읍면동" }, { t: "내국인(명)", n: 1 }, { t: "외국인(명)", n: 1 }, { t: "총 방문객(명)", n: 1 }, { t: "범위 내 비중", n: 1 }, { t: "지도 좌표" }],
      idx.map((i, k) => [k + 1, D.emd[i].sgg, esc(D.emd[i].name), fmt(dom[i]), fmt(fr[i]), fmt(tot[i]), pct(tot[i] / scopeSum, false), D.emd[i].lat == null ? "없음" : esc(D.emd[i].geoPrecision)]),
      { hl: (k) => st.scope.kind === "emd" && idx[k] === st.scope.emd });
  }

  function renderPlaces(st) {
    const metric = +F.pMetric.value, cat = F.pCat.value === "" ? -1 : +F.pCat.value;
    const metricName = F.pMetric.options[F.pMetric.selectedIndex].text;
    $("placeSub").textContent = `장소별 ${metricName} TOP 10 · ${st.scope.label}${cat >= 0 ? " · " + D.placeCats[cat] : ""} (내비게이션 도착 기준, 단위: 건 · 연령 구분 없음)`;
    const n = D.places.length, v = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    let used = 0;
    for (const ym of st.months) {
      const a = D.placeRows[ym]; if (!a) continue; used++;
      for (let i = 0; i < a.length; i += 4) {
        const p = D.places[a[i]];
        if (cat >= 0 && p[2] !== cat) continue;
        if (!inScope(st, p[1])) continue;
        v[0][a[i]] += a[i + 1]; v[1][a[i]] += a[i + 2]; v[2][a[i]] += a[i + 3];
      }
    }
    const val = v[metric];
    const order = [];
    for (let i = 0; i < n; i++) if (val[i] > 0) order.push(i);
    order.sort((a, b) => val[b] - val[a]);
    LAST.places = { order, val, metricName, cat };
    if (!used || !order.length) {
      emptyChart(charts.place, null, used ? "조건에 맞는 장소가 없습니다" : "선택 기간에 인기 장소 데이터가 없습니다");
      $("placeTable").innerHTML = ""; return;
    }
    const top = order.slice(0, 10);
    const lbl = (i) => `${D.places[i][0]} (${D.emd[D.places[i][1]].name})`;
    charts.place.setOption({
      textStyle: baseText, animation: false,
      grid: { left: 10, right: 70, top: 10, bottom: 34, containLabel: true },
      tooltip: { trigger: "item", formatter: (p) => {
        const i = top[top.length - 1 - p.dataIndex], P = D.places[i];
        return `<b>${esc(P[0])}</b><br>${esc(D.placeCats[P[2]])} · ${D.emd[P[1]].sgg} ${D.emd[P[1]].name}<br>관광객 ${fmt(v[0][i])} · 도민 ${fmt(v[1][i])} · 도착건수 ${fmt(v[2][i])}`;
      } },
      xAxis: { type: "value", name: metricName + "(건)", nameLocation: "middle", nameGap: 22, splitLine: { lineStyle: { color: C.grid } }, axisLabel: { formatter: (x) => (x >= 10000 ? x / 10000 + "만" : x) } },
      yAxis: { type: "category", data: top.map(lbl).reverse(), axisTick: { show: false }, axisLabel: { width: 170, overflow: "truncate" }, axisLine: { lineStyle: { color: C.muted } } },
      series: [{ name: metricName, type: "bar", barMaxWidth: 16, itemStyle: { color: C.s1, borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", fontSize: 10, color: C.text, formatter: (p) => fmt(p.value) }, data: top.map((i) => val[i]).reverse() }],
    }, true);
    $("placeTable").innerHTML = table(
      [{ t: "순위" }, { t: "목적지명" }, { t: "카테고리" }, { t: "읍면동" }, { t: "목적지주소(첫 행)" }, { t: "관광객 도착 수", n: 1 }, { t: "도민 도착 수", n: 1 }, { t: "도착건수", n: 1 }],
      order.slice(0, 50).map((i, k) => { const P = D.places[i];
        return [k + 1, esc(P[0]), esc(D.placeCats[P[2]]), D.emd[P[1]].name, esc(P[3]) + (P[4] > 1 ? `<span class="tag">주소 표기 ${P[4]}종</span>` : ""), fmt(v[0][i]), fmt(v[1][i]), fmt(v[2][i])]; }));
  }

  function renderKeywords(st) {
    const cat = F.kwCat.value === "" ? -1 : +F.kwCat.value;
    const sggFilter = st.scope.kind === "all" ? 0 : D.kwSgg.indexOf(st.scope.sgg);
    const R = D.kwRows, sum = new Map(), cnt = new Map(), cats = new Map();
    for (let i = 0; i < R.length; i += 6) {
      if (!st.monthSet.has(R[i])) continue;
      if (cat >= 0 && R[i + 1] !== cat) continue;
      if (sggFilter && R[i + 3] !== sggFilter) continue;
      const k = R[i + 2];
      sum.set(k, (sum.get(k) || 0) + R[i + 4]); cnt.set(k, (cnt.get(k) || 0) + R[i + 5]);
      if (!cats.has(k)) cats.set(k, new Set()); cats.get(k).add(R[i + 1]);
    }
    const order = [...sum.keys()].sort((a, b) => sum.get(b) - sum.get(a));
    LAST.kw = { order, sum };
    const scopeTxt = st.scope.kind === "all" ? "전체" : st.scope.sgg + (st.scope.kind === "emd" ? "(읍면동 정보 없음 → 시군구 단위 적용)" : "");
    $("kwSub").textContent = `비짓제주 검색 대상(장소명) · ${cat >= 0 ? D.kwCats[cat] : "전체 분류"} · ${scopeTxt} · 크기/길이 = '수치' 합계`;
    $("kwNote").innerHTML = `출처: 비짓제주 검색어 순위.xlsx. 검색 '수치'의 단위·산정 방식은 원본에 표기되어 있지 않아 <b>추가 확인 필요</b>합니다. 같은 월·장소명에 최대 7개 행이 서로 다른 값으로 있어(구분 컬럼 누락 추정) 삭제 없이 모두 합산했습니다. 검색량은 관심도 지표일 뿐 실제 방문·선호로 해석하지 않습니다. 시군구는 주소 문자열에서 추출(주소 '-' ${fmt(D.meta.files.keywords.addr_dash_rows)}행은 시군구 필터 시 제외). 연령 구분 없음(전체 이용자). ${coverNote(st, COVER.kw, "검색어")}`;
    if (!order.length) { emptyChart(charts.kw, null, "선택 조건에 검색어 데이터가 없습니다"); $("kwTable").innerHTML = ""; return; }
    let view = F.kwView.value;
    const barOpt = () => {
      const top = order.slice(0, 15);
      return { textStyle: baseText, animation: false, grid: { left: 10, right: 60, top: 10, bottom: 34, containLabel: true },
        tooltip: { trigger: "item", formatter: (p) => `<b>${esc(p.name)}</b><br>수치 합계 ${fmt(p.value)}` },
        xAxis: { type: "value", name: "검색 수치 합계", nameLocation: "middle", nameGap: 22, splitLine: { lineStyle: { color: C.grid } } },
        yAxis: { type: "category", data: top.map((k) => D.kwNames[k]).reverse(), axisTick: { show: false }, axisLabel: { width: 150, overflow: "truncate" } },
        series: [{ type: "bar", name: "검색 수치 합계", barMaxWidth: 14, itemStyle: { color: C.s1, borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: "right", fontSize: 10, color: C.text, formatter: (p) => fmt(p.value) }, data: top.map((k) => sum.get(k)).reverse() }] };
    };
    if (view === "cloud") {
      try {
        const top = order.slice(0, 50), mx = sum.get(top[0]);
        const shades = ["#104281", "#1c5cab", "#2a78d6", "#5598e7"];
        charts.kw.setOption({ animation: false,
          tooltip: { formatter: (p) => `<b>${esc(p.name)}</b><br>수치 합계 ${fmt(p.value)}` },
          series: [{ type: "wordCloud", shape: "rect", left: "center", top: "center", width: "98%", height: "96%", sizeRange: [15, 62], rotationRange: [0, 0], gridSize: 8, drawOutOfBound: false, shrinkToFit: true, layoutAnimation: false,
            textStyle: { fontFamily: FONT, fontWeight: 700, color: (p) => shades[Math.min(3, Math.floor((1 - p.value / mx) * 4))] },
            data: top.map((k) => ({ name: D.kwNames[k], value: sum.get(k) })) }] }, true);
        if (!charts.kw.getModel().getSeriesByType("wordCloud").length) throw new Error("wordCloud 미등록");
      } catch (err) {
        console.warn("워드클라우드 대체:", err);
        F.kwView.value = "bar"; view = "bar";
        charts.kw.setOption(barOpt(), true);
        $("kwNote").innerHTML = "<span class='warn-text'>워드클라우드를 그릴 수 없어 빈도 막대그래프로 대체했습니다.</span> " + $("kwNote").innerHTML;
      }
    } else charts.kw.setOption(barOpt(), true);
    $("kwTable").innerHTML = table([{ t: "순위" }, { t: "장소명(검색 대상)" }, { t: "분류명" }, { t: "수치 합계", n: 1 }, { t: "원본 행 수", n: 1 }],
      order.slice(0, 30).map((k, i) => [i + 1, esc(D.kwNames[k]), [...cats.get(k)].map((c) => D.kwCats[c]).join(", "), fmt(sum.get(k)), fmt(cnt.get(k))]));
  }

  // ---------- 온라인 후기 (data/reviews.js: scripts/collect_reviews.py 결과) ----------
  const RV = window.REVIEW_DATA;
  let rvPick = null; // 선택한 주제 인덱스
  function renderReviews(st) {
    LAST.reviews = null;
    if (!RV || !RV.posts.length) return; // 기본 '데이터 없음' 안내 유지
    $("rvControls").hidden = false; $("rvRules").hidden = false;
    const youth = $("rvScope").value === "youth", noAd = $("rvAd").value === "exclude";
    // posts: [ym, postdate, title, description, link, youthFlag, themeIdx[], queries, adFlag, jejuFlag]
    const jeju = RV.posts.filter((p) => p[9]);
    const inPeriod = jeju.filter((p) => st.monthSet.has(p[0]));
    const posts = inPeriod.filter((p) => (!youth || p[5]) && (!noAd || !p[8]));
    const outOfPeriod = jeju.length - inPeriod.length;
    const byYear = {};
    for (const p of inPeriod) byYear[Math.floor(p[0] / 100)] = (byYear[Math.floor(p[0] / 100)] || 0) + 1;
    const cnt = new Array(RV.themes.length).fill(0);
    for (const p of posts) for (const t of p[6]) cnt[t]++;
    LAST.reviews = { posts, cnt };
    $("rvSub").textContent = `주요 활동 · 만족 요인 · 불편 사항 — ${youth ? "20대 관련 표현이 있는 " : ""}블로그 글 ${fmt(posts.length)}건${noAd ? "(광고·협찬 표현 글 제외)" : ""} 중 관련 표현이 있는 글 수 (글 1건이 여러 주제에 포함될 수 있음)`;
    $("rvCols").innerHTML = Object.entries(RV.areas).map(([area, label]) => {
      const ids = RV.themes.map((t, i) => i).filter((i) => RV.themes[i][0] === area && cnt[i] > 0).sort((a, b) => cnt[b] - cnt[a]);
      const mx = Math.max(1, ...ids.map((i) => cnt[i]));
      const body = !posts.length ? `<p class="empty">선택 기간·범위에 해당하는 글 없음</p>`
        : !ids.length ? `<p class="empty">일치하는 표현이 있는 글 없음</p>`
        : ids.map((i) => `<div class="rvrow${rvPick === i ? " on" : ""}" data-t="${i}" title="클릭하면 예시 글 보기"><span>${esc(RV.themes[i][1])}</span><span class="cnt">${fmt(cnt[i])}건 · ${pct(cnt[i] / posts.length, false)}</span><span class="bar" style="width:${(cnt[i] / mx) * 100}%"></span></div>`).join("");
      return `<div class="rv"><h3>${label}</h3>${body}</div>`;
    }).join("");
    $("rvCols").querySelectorAll(".rvrow").forEach((el) => el.addEventListener("click", () => { rvPick = +el.dataset.t; renderReviews(LAST.st); }));
    if (rvPick != null) {
      const ex = posts.filter((p) => p[6].includes(rvPick)).sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, 5);
      $("rvSamples").innerHTML = `<h3 style="margin-top:12px">'${esc(RV.themes[rvPick][1])}' 예시 글 (최신 ${ex.length}건, 요약문 원문)</h3>` +
        (ex.map((p) => `<div class="rvsample"><b>${esc(p[2])}</b> <span class="tag">${p[1].replace(/(\d{4})(\d{2})(\d{2})/, "$1.$2.$3")}</span><br>${esc(p[3])}<br><a href="${esc(p[4])}" target="_blank" rel="noopener">원문 보기</a></div>`).join("") || `<p class="empty">해당 글 없음</p>`);
    } else $("rvSamples").innerHTML = "";
    $("rvRuleTable").innerHTML = table([{ t: "영역" }, { t: "주제" }, { t: "일치 표현(정규식)" }],
      RV.themes.map(([a, t, p]) => [RV.areas[a], esc(t), `<code>${esc(p)}</code>`]));
    const m = RV.meta;
    $("rvNote").className = "note";
    $("rvNote").innerHTML = `출처: ${esc(m.source)} · 수집 ${esc(m.collectedAt)} · 고유 글 ${fmt(m.posts)}건(검색어 ${m.queries.length}개: ${m.queries.map(esc).join(", ")} — 같은 링크는 1건으로 통합). ` +
      `제목·요약문에 '제주'가 없는 글 ${fmt(m.nonJeju)}건과 선택 기간 밖 작성 글 ${fmt(outOfPeriod)}건은 제외. ` +
      `<span class="warn-text">선택 기간 내 글의 작성 연도 분포: ${Object.entries(byYear).map(([y, n]) => `${y}년 ${fmt(n)}건`).join(", ") || "없음"} — API가 검색어별 관련도 상위 1,000건까지만 제공해 최근 글에 치우쳐 있으므로 연도 간 비교에 쓰지 마세요.</span> ` +
      `주제는 위 정규식 사전과 <b>제목+요약문(약 200자)</b>의 일치 여부로 센 규칙 기반 분류이며, 본문 전체나 감성은 분석하지 않았습니다. ` +
      `'20대 관련 표현'은 글에 ${esc(m.youthRule)} 표현이 있는지일 뿐 작성자 연령을 확인한 것이 아닙니다. 검색 결과는 네이버 관련도 순 상위 글로, 전체 후기를 대표한다고 볼 수 없습니다(유튜브·지도 리뷰 미포함). 지역 필터는 적용되지 않습니다.`;
  }

  // ---------- 분석 결과 ----------
  const NATURE = ["해수욕장", "명산", "오름", "폭포/계곡", "자연휴양림", "공원", "드라이브코스", "섬", "해안"];
  function renderSummary() {
    const { st, ageLbl } = LAST;
    const facts = [], hypo = [], check = [], act = [];
    if (LAST.ageTotal != null) {
      const ms = LAST.ageMonths, ser = LAST.ageSer;
      facts.push(`${ymShort(ms[0])}~${ymShort(ms[ms.length - 1])} ${ageLbl} 방문객수 합계 ${fmt(LAST.ageTotal)}명(연령대별 방문 데이터).`);
      if (LAST.yoy) facts.push(`${ymLabel(LAST.yoy.last)} ${ageLbl} 방문객은 전년 동월 대비 ${pct(LAST.yoy.r)} (${fmt(LAST.yoy.p)} → ${fmt(LAST.yoy.v)}명).`);
      else facts.push(`전년 동월 대비 증감률은 비교 월 데이터가 없어 계산할 수 없음.`);
      if (LAST.share != null) facts.push(`같은 기간 10~70대 합계 중 ${ageLbl} 비중 ${pct(LAST.share, false)}.`);
      const peak = ms.reduce((a, b) => (ser.get(b) > ser.get(a) ? b : a));
      facts.push(`선택 기간 중 ${ageLbl} 방문이 가장 많은 달은 ${ymLabel(peak)} (${fmt(ser.get(peak))}명).`);
      // 월(1~12)별 평균으로 계절성 확인: 2개 연도 이상 있는 월만
      const byM = {};
      for (const m of ms) (byM[m % 100] ||= []).push(ser.get(m));
      const multi = Object.entries(byM).filter(([, a]) => a.length >= 2);
      if (multi.length >= 6) {
        const avg = multi.map(([mo, a]) => [+mo, a.reduce((s, x) => s + x, 0) / a.length]).sort((a, b) => b[1] - a[1]);
        facts.push(`2개 연도 이상 관측된 월 기준 평균이 높은 달: ${avg.slice(0, 3).map(([mo]) => mo + "월").join(", ")}.`);
        if (avg.slice(0, 3).some(([mo]) => mo === 7 || mo === 8))
          hypo.push(`여름(7~8월)에 ${ageLbl} 방문이 많아 방학·휴가철의 영향일 가능성이 있음 — 원인은 데이터로 검증되지 않은 가설.`);
      }
      if (LAST.yoy && Math.abs(LAST.yoy.r) >= 0.05)
        hypo.push(`${ymLabel(LAST.yoy.last)}의 전년 대비 ${LAST.yoy.r > 0 ? "증가" : "감소"}는 단일 월 비교이므로 일시적 요인(연휴·항공편·기상 등)일 수 있음 — 여러 달 추이로 재확인 필요.`);
    } else facts.push("선택 기간에 연령대별 방문 데이터가 없어 20대 지표를 계산할 수 없음.");
    const R = LAST.region;
    if (R && R.any && R.idx.length) facts.push(`읍면동 방문객(전체 관광객) 상위: ${R.idx.slice(0, 3).map((i) => `${D.emd[i].name} ${fmt(R.tot[i])}명`).join(", ")}.`);
    const P = LAST.places;
    if (P && P.order.length) {
      facts.push(`장소별 ${P.metricName} 상위: ${P.order.slice(0, 3).map((i) => `${D.places[i][0]}(${fmt(P.val[i])})`).join(", ")}.`);
      const top10 = P.order.slice(0, 10), nat = top10.filter((i) => NATURE.includes(D.placeCats[D.places[i][2]]));
      if (nat.length) hypo.push(`도착 상위 10곳 중 ${nat.length}곳이 자연 관광 유형 카테고리(${[...new Set(nat.map((i) => D.placeCats[D.places[i][2]]))].join(", ")}) — 전체 관광객 기준이며 20대 선호로 단정할 수 없음.`);
      const util = top10.filter((i) => ["공항", "주차장", "렌트카", "항구"].includes(D.placeCats[D.places[i][2]]));
      if (util.length) hypo.push(`상위권에 공항·주차장·렌터카 등 이동 거점(${util.map((i) => D.places[i][0]).join(", ")})이 포함되어, 도착 수는 '관광지 인기'와 '이동 동선'이 섞인 지표로 보는 것이 타당.`);
    }
    const K = LAST.kw;
    if (K && K.order.length) {
      facts.push(`비짓제주 검색 수치 상위: ${K.order.slice(0, 5).map((k) => D.kwNames[k]).join(", ")}.`);
      const kTop = new Set(K.order.slice(0, 20).map((k) => D.kwNames[k]));
      const both = P ? P.order.slice(0, 30).map((i) => D.places[i][0]).filter((nm) => kTop.has(nm)) : [];
      if (both.length) hypo.push(`검색 상위 20과 도착 상위 30에 함께 등장(장소명 완전 일치): ${[...new Set(both)].join(", ")} — 검색 관심과 실제 이동이 겹치는 후보이나 인과관계는 미확인.`);
    }
    check.push("연령대별 '방문객수'의 산정 방식(체류·중복 포함 여부): 월 합계가 입도 관광객의 약 3.5~4배로 집계 기준이 다름.");
    check.push("20대의 지역·장소·검색 특성: 해당 데이터에 연령 구분이 없어 현재는 전체 관광객 특성만 확인 가능.");
    check.push("검색어 데이터의 '수치' 단위와 같은 월·장소에 7개 행이 반복되는 이유(누락된 구분 컬럼).");
    const RVL = LAST.reviews;
    if (RVL && RVL.posts.length) {
      const topOf = (area) => RV.themes.map((t, i) => i).filter((i) => RV.themes[i][0] === area && RVL.cnt[i] > 0).sort((a, b) => RVL.cnt[b] - RVL.cnt[a]).slice(0, 2)
        .map((i) => `${RV.themes[i][1]}(${fmt(RVL.cnt[i])}건)`).join(", ") || "없음";
      facts.push(`블로그 요약문 ${fmt(RVL.posts.length)}건 중 언급이 많은 주제 — 활동: ${topOf("activity")} / 만족: ${topOf("satisfaction")} / 불편: ${topOf("inconvenience")}.`);
      check.push("후기 주제는 요약문 대상 규칙 기반 분류 — 표본 글을 직접 읽어 오분류 여부 점검 필요. 유튜브·지도 리뷰는 미수집.");
    } else check.push("온라인 후기(블로그·유튜브·지도 리뷰) 데이터 미제공 → 주요 활동·만족·불편 요인은 수집 후 분석 필요.");
    check.push("읍면동 방문객 합계의 중복 집계 여부, 연령 코드 '70'이 70대 이상을 포함하는지.");
    if (st.e >= 202601) check.push("2026년은 1~8월(장소는 9월)까지만 수록 — 연간 비교 시 부분 연도 주의.");
    act.push("<span class='tag'>검증 전 제안</span> 방문 집중 월에 맞춘 20대 대상 콘텐츠·프로모션 시기 설정 (위 월별 추이 근거).");
    if (P && P.order.length) act.push(`<span class='tag'>검증 전 제안</span> 도착·검색이 함께 높은 장소를 중심으로 동선형 코스 콘텐츠 기획 (인기 장소·관광 검색어 근거, 20대 특화 여부는 추가 데이터로 확인).`);
    act.push("<span class='tag'>데이터 보완</span> 연령대×읍면동 또는 연령대×장소 교차 데이터 확보 요청 — 20대 지역 특성 분석의 전제.");
    act.push("<span class='tag'>데이터 보완</span> 20대 키워드를 포함한 온라인 후기 수집 후 온라인 후기 영역에 주제 분류 결과 연결.");
    const li = (a) => a.map((x) => `<li>${x}</li>`).join("") || "<li>현재 조건에서 도출된 항목 없음</li>";
    for (const [id, arr] of [["sFacts", facts], ["sHypo", hypo], ["sCheck", check], ["sAct", act]]) {
      $(id).innerHTML = li(arr); $(id + "N").textContent = arr.length + "건";
    }
  }

  // ---------- 데이터 설명 ----------
  function renderNotes() {
    const M = D.meta.files, p = (a) => `${ymShort(a[0])}~${ymShort(a[1])}`;
    const rows = [
      ["제주 연령대별 방문", "기준연월(int), 시도코드(int), 시도명(str), 성별(M/W), 연령(10~70), 방문객수(int)", `${p(M.age.period)} (${M.age.months}개월)`, "월 × 성별 × 연령대, 제주특별자치도 단위 / 명", `${fmt(M.age.rows)}행, 결측 0, 완전중복 0. 월 합계가 입도 관광객의 약 4배 → 산정 기준 확인 필요`, "핵심 지표·방문 추이·분석 결과"],
      ["월별 입도 관광객", "기준연월, 내국인/외국인/전체 입도 관광객수(int)", `${p(M.arrivals.period)}`, "월 / 명 (연령 구분 없음)", `${M.arrivals.rows}행, 결측 0`, "참고 KPI"],
      ["제주 지역별 방문객(읍면동)", "기준연월, 읍면동코드, 시도명, 시군구명, 읍면동명, 내국인·외국인·총 방문객수(int), 주민센터 주소 + 시트 '주민센터_주소목록'", `${p(M.emd.period)}`, "월 × 43개 읍면동 / 명 (연령 구분 없음)", `${fmt(M.emd.rows)}행, 결측 0, 내국인+외국인=총 방문객 일치. 읍면동 합계 월 1,200만 명대 → 중복 집계 가능성`, "지역별 방문(막대·표·지도)"],
      ["제주 지역별 인기 장소", "주행일자(YYYYMM), 목적지명, 목적지주소, 읍면동코드, 읍면동명, 도착건수, 카테고리 3단계, 관광객 도착 수, 도민 도착 수", `${p(M.places.period)}`, "월 × 목적지 / 건(내비게이션 도착)", `${fmt(M.places.rows)}행, 결측 0. 도착건수≠관광객+도민인 행 ${fmt(M.places.arrival_ne_sum_rows)}개(원값 유지). 장소명 셀 중 엑셀 자동변환(시각·날짜·숫자) ${M.places.name_cell_types.time + M.places.name_cell_types.datetime + M.places.name_cell_types.int + M.places.name_cell_types.float}개 → 문자열로만 변환`, "인기 장소"],
      ["비짓제주 검색어 순위", "기준년월, 분류명(5종), 지역명(장소명), 주소, 수치(int)", `${p(M.keywords.period)}`, "월 × 분류 × 장소명 / 단위 미표기", `${fmt(M.keywords.rows)}행, 결측 0, 완전중복 ${fmt(M.keywords.exact_dup_rows)}행(삭제 안 함), 주소 '-' ${fmt(M.keywords.addr_dash_rows)}행. 월·장소당 최대 7행`, "관광 검색어(워드클라우드·막대·표)"],
      ["입도 관광객 추이(일별)", "기준일자(YYYYMMDD), 내국인·외국인·전체방문객수", "2024.01.01~2026.10.21 (1,025일)", "일 / 명", "결측 0", "미사용 (와이어프레임에 해당 영역 없음)"],
      ["월간 국가별 외국인 입도객", "기준연월, 관광구분별카테고리(11종), 입도객수(명)", "2024.01~2026.08", "월 × 국가 / 명", "'기타'가 월마다 2행(구분 불명)", "미사용 (와이어프레임에 해당 영역 없음)"],
      window.REVIEW_DATA
        ? ["온라인 후기 (네이버 블로그 검색 API)", "작성일, 제목, 요약문(약 200자), 링크, 블로거명, 수집 검색어", `수집 ${window.REVIEW_DATA.meta.collectedAt} (작성일은 최근 글에 집중)`, "블로그 글 1건 / 관련 표현 언급 글 수",
           `고유 글 ${fmt(window.REVIEW_DATA.meta.posts)}건, '제주' 미포함 ${fmt(window.REVIEW_DATA.meta.nonJeju)}건 제외, 광고·협찬 표현 ${fmt(window.REVIEW_DATA.meta.adPosts)}건 표시`, "온라인 후기·분석 결과"]
        : ["온라인 후기", "-", "-", "-", "파일 없음", "온라인 후기('데이터 없음' 표시)"],
    ];
    $("dataNotes").innerHTML = table([{ t: "파일" }, { t: "컬럼(자료형)" }, { t: "수록 기간" }, { t: "집계 단위 / 단위" }, { t: "품질 점검" }, { t: "사용 영역" }], rows.map((r) => r.map(esc)));
  }

  // ---------- 시작 ----------
  for (const el of [F.start, F.end, F.age, F.sex, F.region]) el.addEventListener("change", render);
  F.pMetric.addEventListener("change", () => { renderPlaces(LAST.st); renderSummary(); });
  F.pCat.addEventListener("change", () => { renderPlaces(LAST.st); renderSummary(); });
  F.kwCat.addEventListener("change", () => { renderKeywords(LAST.st); renderSummary(); });
  F.kwView.addEventListener("change", () => renderKeywords(LAST.st));
  $("fReset").addEventListener("click", () => { setDefaults(); render(); });
  setDefaults();
  initMap(() => LAST.st && renderRegion(LAST.st));
  for (const el of [$("rvScope"), $("rvAd")]) el.addEventListener("change", () => { renderReviews(LAST.st); renderSummary(); });
  renderNotes();
  render();
  $("loading").remove();
  window.__dash = { render, state, LAST: () => LAST }; // 검증용
})();
