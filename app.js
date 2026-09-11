import {
  parseNum,
  courseHandicap,
  playingHandicap,
  targetScore,
  playPar,
  fmtHcp,
  indexOk,
  slopeOk,
  crOk,
  parOk,
} from "./handicap.js";
import { loadState, saveState, snapshot, parseSnapshot } from "./storage.js";
import {
  kmBetween,
  readGps,
  fmtDist,
  reverseName,
  nearestGolfCourse,
  searchCourses,
  nearestSaved,
} from "./geo.js";
import { t, lang, applyStaticI18n } from "./i18n.js";
import {
  loadOgv,
  catalog,
  searchOgv,
  matchOgv,
  appCourseFromOgv,
  applyLayout,
  hydrateCourse,
  preferredLayout,
  isSplitLayout,
  isExtraLayout,
  isNineHoleLayout,
  sortTees,
} from "./ogv.js";

const COLORS = ["black", "white", "yellow", "blue", "red", "orange", "green"];
const DOT = {
  black: "#1a1a1a",
  white: "#f4f0e4",
  yellow: "#e6c229",
  blue: "#2a6fdb",
  red: "#c0392b",
  orange: "#e67e22",
  green: "#0d5c2e",
};

const state = loadState();
let geoNote = "";
let geoHelp = "";
let addPick = null;
let showSplits = false;
let teeDraft = { color: "yellow", gender: "m", holes: 18 };

const $ = (id) => document.getElementById(id);

function persist() {
  saveState(state);
}

function activeCourse() {
  return state.courses.find((c) => c.id === state.activeId) || state.courses[0];
}

function activeTee() {
  const c = activeCourse();
  if (!c) return null;
  return c.tees.find((t) => t.id === c.teeId) || c.tees[0] || null;
}

function roundHoles() {
  const c = activeCourse();
  if (!c) return 18;
  const lay = (c.layouts || []).find((l) => Number(l.id) === Number(c.ogvCourse));
  if (lay) return isNineHoleLayout(lay.name, lay.tees) ? 9 : 18;
  if (isNineHoleLayout(c.club, c.tees)) return 9;
  return 18;
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function geoError(err) {
  const code = err && err.code;
  if (code === 0) return t("geoNone");
  if (code === 1) return t("geoDenied");
  return t("geoFail");
}

function showGeoIssue(err) {
  geoNote = geoError(err);
  geoHelp = err && err.code === 1 ? t("geoDeniedHelp") : "";
}

function fmtIndex(n) {
  if (!Number.isFinite(n)) return "";
  const s = n.toFixed(1);
  return lang === "de" ? s.replace(".", ",") : s;
}

function fmtCr(n) {
  if (!Number.isFinite(n)) return "—";
  const s = n.toFixed(1);
  return lang === "de" ? s.replace(".", ",") : s;
}

function teeLabel(tee) {
  if (!tee) return "";
  const color = t(`color_${tee.color}`);
  const who = tee.gender === "w" ? t("women") : t("men");
  return `${color} · ${who}`;
}

function teeChip(x, selected) {
  return `<button class="chip tee-chip${selected ? " on" : ""}" type="button" data-act="pick-tee" data-id="${x.id}">
        <span class="dot" style="background:${DOT[x.color] || DOT.yellow}"></span>
        ${t(`color_${x.color}`)}
      </button>`;
}

function setCourse(c) {
  $("course-name").textContent = c?.name || "—";
  $("course-club").textContent = c?.club || "";
}

function renderHeader() {
  const c = activeCourse();
  setCourse(c);
  $("meta").textContent = geoNote;
  $("geo-help").hidden = !geoHelp;
  $("geo-help").textContent = geoHelp;
}

function renderTees() {
  const c = activeCourse();
  const box = $("tee-body");
  if (!c) {
    box.innerHTML = "";
    return;
  }
  const allLayouts = c.layouts || [];
  const mains = allLayouts.filter((l) => !isExtraLayout(l.name));
  const extras = allLayouts.filter((l) => isExtraLayout(l.name));
  let shown = showSplits ? allLayouts : mains.length ? mains : allLayouts.filter((l) => !isSplitLayout(l.name));
  if (!shown.length) shown = allLayouts;
  if (c.ogvCourse && !shown.some((l) => Number(l.id) === Number(c.ogvCourse))) {
    const cur = allLayouts.find((l) => Number(l.id) === Number(c.ogvCourse));
    if (cur) shown = [cur, ...shown];
  }
  const layoutSelect =
    allLayouts.length > 1
      ? `<div class="layout-row">
          <select class="layout-select" data-act="layout-select" aria-label="${t("layout")}">${shown
            .map(
              (l) =>
                `<option value="${l.id}"${Number(c.ogvCourse) === Number(l.id) ? " selected" : ""}>${l.name}</option>`
            )
            .join("")}</select>
          ${
            extras.length
              ? `<button class="btn ghost tight" type="button" data-act="splits">${
                  showSplits ? t("fewerLayouts") : t("moreLayouts")
                }</button>`
              : ""
          }
        </div>`
      : "";
  if (!c.tees.length) {
    box.innerHTML = `${layoutSelect}<p class="hint">${t("noTees")}</p>
      <p><button class="btn primary" data-act="add-tee" type="button">${t("addTee")}</button></p>`;
    return;
  }
  const ordered = sortTees(c.tees);
  const men = ordered.filter((x) => x.gender === "m");
  const women = ordered.filter((x) => x.gender === "w");
  const gender = women.length && !men.length ? "w" : men.length && !women.length ? "m" : state.gender || "m";
  if (gender !== state.gender && (gender === "m" || gender === "w")) state.gender = gender;
  const visible = gender === "w" ? women : men;
  let tee = activeTee();
  if (tee && tee.gender !== gender && visible[0]) {
    const same = visible.find((x) => x.color === tee.color) || visible[0];
    c.teeId = same.id;
    tee = same;
  }
  const genderBar =
    men.length && women.length
      ? `<div class="seg">${[
          ["m", t("men")],
          ["w", t("women")],
        ]
          .map(
            ([g, label]) =>
              `<button class="chip${gender === g ? " on" : ""}" type="button" data-act="gender" data-g="${g}">${label}</button>`
          )
          .join("")}</div>`
      : "";
  const add =
    c.source === "ogv"
      ? ""
      : `<button class="chip" type="button" data-act="add-tee">${t("addTee")}</button>`;
  const holes = roundHoles();
  const parShow = playPar(tee.par, holes);
  const stats = tee
    ? `<div class="stats">
        <div class="stat"><div class="v">${fmtCr(tee.cr)}</div><div class="k">${t("cr")}</div></div>
        <div class="stat"><div class="v">${tee.slope}</div><div class="k">${t("slope")}</div></div>
        <div class="stat"><div class="v">${parShow}</div><div class="k">${t("par")}${holes === 9 ? " · 9" : ""}</div></div>
        ${
          Number.isFinite(tee.meters)
            ? `<div class="stat"><div class="v">${holes === 9 && tee.par > 42 ? Math.round(tee.meters / 2) : tee.meters}</div><div class="k">m</div></div>`
            : ""
        }
      </div>`
    : "";
  box.innerHTML = `${layoutSelect}
    <div class="tee-toolbar">${genderBar}</div>
    <div class="chips scroll">${visible.map((x) => teeChip(x, tee && x.id === tee.id)).join("")}${add}</div>
    ${stats}`;
}

function renderResult() {
  const box = $("result-body");
  const hi = state.index;
  const tee = activeTee();
  if (!indexOk(hi)) {
    box.innerHTML = `<div class="result"><div class="k">${t("courseHcp")}</div><div class="n">—</div>
      <p class="hint">${t("needIndex")}</p></div>`;
    return;
  }
  if (!tee) {
    box.innerHTML = `<div class="result"><div class="k">${t("courseHcp")}</div><div class="n">—</div>
      <p class="hint">${t("needTee")}</p></div>`;
    return;
  }
  const holes = roundHoles();
  const opts = { index: hi, slope: tee.slope, cr: tee.cr, par: tee.par, holes };
  const ch = courseHandicap(opts);
  const ph = playingHandicap(opts, state.allowance);
  const target = targetScore(tee.par, ch, holes);
  const plus = ch < 0 ? `<p class="hint">${t("plusHint")}</p>` : "";
  const allowOpts = [
    [100, "allow100"],
    [95, "allow95"],
    [85, "allow85"],
  ]
    .map(
      ([pct, key]) =>
        `<option value="${pct}"${state.allowance === pct ? " selected" : ""}>${t(key)}</option>`
    )
    .join("");
  const hintKey =
    state.allowance === 100
      ? "allow100h"
      : state.allowance === 85
        ? "allow85h"
        : holes === 9
          ? "allow95h9"
          : "allow95h";
  box.innerHTML = `<div class="result">
      <div class="k">${t("courseHcp")}${holes === 9 ? " · 9" : ""}</div>
      <div class="n">${fmtHcp(ch)}</div>
      ${plus}
    </div>
    <div class="sub-scores">
      <div><div class="k">${t("playingHcp")}</div><div class="v">${fmtHcp(ph)}</div></div>
      <div><div class="k">${t("target")}</div><div class="v">${target}</div></div>
    </div>
    <div class="layout-row allow-row">
      <select class="layout-select" data-act="allow-select" aria-label="${t("playingHcp")}">${allowOpts}</select>
      <button class="icon-btn info-btn formula-info" type="button" data-act="info" title="${t("formulaTitle")}">i</button>
    </div>
    <p class="hint allow-hint">${t(hintKey)}</p>`;
}

function renderSwitcher() {
  $("switcher-list").innerHTML = state.courses
    .map((c) => {
      const on = c.id === state.activeId ? ` · ${t("current")}` : "";
      const tee = c.tees.find((x) => x.id === c.teeId) || c.tees[0];
      const sub = [c.club, tee ? teeLabel(tee) : ""].filter(Boolean).join(" · ");
      return `<button class="search-hit" type="button" data-act="use" data-id="${c.id}">
        <strong>${c.name}</strong>${on}<br><span class="hint">${sub}</span>
      </button>`;
    })
    .join("");
}

function renderPlaces() {
  $("places-list").innerHTML = state.courses
    .map((c, i) => {
      const on = c.id === state.activeId ? ` · ${t("current")}` : "";
      const last = i === state.courses.length - 1;
      return `<div class="list-item" data-id="${c.id}">
        <div class="grow">
          <div class="name">${c.name}${on}</div>
          <div class="sub">${c.club || ""} · ${c.tees.length} ${t("tee")}</div>
        </div>
        <div class="row-actions">
          <button class="btn" data-act="top" title="${t("moveTop")}" ${i === 0 ? "disabled" : ""}>⤒</button>
          <button class="btn" data-act="up" title="${t("moveUp")}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="btn" data-act="down" title="${t("moveDown")}" ${last ? "disabled" : ""}>↓</button>
          <button class="btn" data-act="bottom" title="${t("moveBottom")}" ${last ? "disabled" : ""}>⤓</button>
          <button class="btn" data-act="edit-place">${t("edit")}</button>
          <button class="btn" data-act="use">${t("open")}</button>
          <button class="btn danger" data-act="del">✕</button>
        </div>
      </div>`;
    })
    .join("");
}

function render() {
  renderHeader();
  const inp = $("index-input");
  if (document.activeElement !== inp) {
    inp.value = fmtIndex(state.index);
  }
  renderTees();
  renderResult();
  renderSwitcher();
  renderPlaces();
}

function selectCourse(id) {
  if (!state.courses.some((c) => c.id === id)) return;
  state.activeId = id;
  persist();
  geoNote = "";
  geoHelp = "";
  $("switcher").close();
  $("places").close();
  render();
}

async function useCurrentLocation() {
  geoNote = t("locating");
  geoHelp = "";
  const c = activeCourse();
  setCourse({ name: t("here"), club: t("locating") });
  $("meta").textContent = geoNote;
  try {
    const pos = await readGps();
    geoNote = t("findingCourse");
    $("meta").textContent = geoNote;
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const near = await nearestGolfCourse(lat, lon);
    if (!near) {
      geoNote = t("noCourseNear");
      geoHelp = "";
      render();
      return;
    }
    const saved = nearestSaved(near.lat, near.lon, state.courses, 1.5);
    if (saved) {
      state.activeId = saved.course.id;
      persist();
      geoNote = t("matchedSaved", { name: saved.course.name, dist: fmtDist(saved.km) });
      geoHelp = "";
      render();
      return;
    }
    const ogvHit = matchOgv({ name: near.name, lat: near.lat, lon: near.lon });
    const course = ogvHit
      ? appCourseFromOgv(ogvHit.club, preferredLayout(ogvHit.club), {
          lat: near.lat,
          lon: near.lon,
        })
      : {
          id: uid(),
          name: near.name,
          club: "",
          lat: near.lat,
          lon: near.lon,
          tees: [],
          teeId: "",
        };
    const existing = course.ogvClub
      ? state.courses.find((x) => x.ogvClub === course.ogvClub)
      : null;
    if (existing) {
      state.activeId = existing.id;
    } else {
      state.courses.unshift(course);
      state.activeId = course.id;
    }
    persist();
    geoNote = t("foundHere", { name: course.name, dist: fmtDist(near.km) });
    geoHelp = "";
    render();
  } catch (err) {
    showGeoIssue(err);
    if (c) setCourse(c);
    render();
  }
}

function hitButton(h) {
  const golf = h.ogv ? ` · ${t("ogv")}` : h.golf ? ` · ${t("golfHit")}` : "";
  const where = h.where || "";
  const ogv = h.ogv ? ` data-ogv="${h.ogv}"` : "";
  const lat = Number.isFinite(h.lat) ? h.lat : "";
  const lon = Number.isFinite(h.lon) ? h.lon : "";
  return `<button class="search-hit" type="button" data-lat="${lat}" data-lon="${lon}" data-name="${encodeURIComponent(h.name)}" data-where="${encodeURIComponent(where)}" data-golf="${h.golf ? "1" : ""}"${ogv}>
        <strong>${h.name}</strong><br>
        <span class="hint">${where}${golf}</span>
      </button>`;
}

async function runSearch(everywhere) {
  const q = $("add-search").value.trim();
  if (!q) return;
  $("add-err").hidden = true;
  const ogvHits = searchOgv(q).map((club) => ({
    name: club.name,
    lat: club.lat,
    lon: club.lon,
    where: club.address || "",
    golf: true,
    ogv: club.id,
  }));
  $("add-results").innerHTML = ogvHits.length
    ? ogvHits.map(hitButton).join("")
    : t("searching");
  let hits = [];
  try {
    hits = await searchCourses(q, everywhere, lang);
  } catch {
    hits = [];
  }
  if (!hits.length && !ogvHits.length && !everywhere) {
    $("add-results").textContent = t("nothingAt");
    try {
      hits = await searchCourses(q, true, lang);
    } catch {
      hits = [];
    }
  }
  const merged = [...ogvHits];
  for (const h of hits) {
    const dup = merged.some(
      (m) =>
        (h.name && m.name && m.name.toLowerCase() === h.name.toLowerCase()) ||
        (Number.isFinite(h.lat) &&
          Number.isFinite(m.lat) &&
          Math.abs(h.lat - m.lat) < 0.01 &&
          Math.abs(h.lon - m.lon) < 0.01)
    );
    if (!dup) merged.push(h);
  }
  if (!merged.length) {
    $("add-results").textContent = t("noMatches");
    return;
  }
  $("add-results").innerHTML = merged.map(hitButton).join("");
}

function pickAddHit(btn) {
  addPick = {
    name: decodeURIComponent(btn.dataset.name),
    lat: Number(btn.dataset.lat),
    lon: Number(btn.dataset.lon),
    where: decodeURIComponent(btn.dataset.where || ""),
    golf: btn.dataset.golf === "1",
    ogv: btn.dataset.ogv ? Number(btn.dataset.ogv) : null,
  };
  $("add-lat").value = String(addPick.lat);
  $("add-lon").value = String(addPick.lon);
  if (!$("add-name").value.trim()) $("add-name").value = addPick.name;
  $("add-picked").hidden = false;
  $("add-picked").textContent = `${addPick.name} · ${addPick.where}`;
  $("add-results").querySelectorAll(".search-hit").forEach((el) => el.classList.toggle("picked", el === btn));
}

function openAddSheet() {
  addPick = null;
  $("add-name").value = "";
  $("add-search").value = "";
  $("add-results").innerHTML = "";
  $("add-picked").hidden = true;
  $("add-lat").value = "";
  $("add-lon").value = "";
  $("add-err").hidden = true;
  $("add-sheet").showModal();
}

function adoptCourse(course) {
  const existing = course.ogvClub
    ? state.courses.find((x) => x.ogvClub === course.ogvClub)
    : nearestSaved(course.lat, course.lon, state.courses, 0.25)?.course;
  if (existing) {
    if (course.name) existing.name = course.name;
    if (course.ogvClub && (!existing.tees || !existing.tees.length)) {
      Object.assign(existing, course, { id: existing.id, name: existing.name });
    }
    state.activeId = existing.id;
  } else {
    state.courses.unshift(course);
    state.activeId = course.id;
  }
  persist();
  $("add-sheet").close();
  $("places").close();
  render();
}

function saveNewCourse() {
  const name = $("add-name").value.trim();
  const lat = parseNum($("add-lat").value);
  const lon = parseNum($("add-lon").value);
  const err = $("add-err");
  if (!name) {
    err.hidden = false;
    err.textContent = t("needName");
    return;
  }
  if (addPick?.ogv) {
    const club = (catalog.clubs || []).find((c) => c.id === addPick.ogv);
    if (club) {
      adoptCourse(appCourseFromOgv(club, preferredLayout(club), { name }));
      return;
    }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    err.hidden = false;
    err.textContent = t("needPin");
    return;
  }
  const ogvHit = matchOgv({ name: addPick?.name || name, lat, lon });
  if (ogvHit) {
    adoptCourse(appCourseFromOgv(ogvHit.club, preferredLayout(ogvHit.club), { name, lat, lon }));
    return;
  }
  const saved = nearestSaved(lat, lon, state.courses, 0.25);
  if (saved) {
    state.activeId = saved.course.id;
    persist();
    $("add-sheet").close();
    $("places").close();
    render();
    return;
  }
  adoptCourse({
    id: uid(),
    name,
    club: addPick?.golf ? addPick.name : addPick?.where || "",
    lat,
    lon,
    tees: [],
    teeId: "",
    source: "manual",
  });
}

async function gpsForAdd() {
  $("add-picked").hidden = false;
  $("add-picked").textContent = t("locating");
  try {
    const pos = await readGps();
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const near = await nearestGolfCourse(lat, lon);
    const rev = near
      ? { name: near.name, club: fmtDist(near.km) }
      : await reverseName(lat, lon, lang);
    const ogvHit = matchOgv({
      name: near?.name || rev.name,
      lat: near?.lat ?? lat,
      lon: near?.lon ?? lon,
    });
    addPick = {
      name: ogvHit?.club.name || rev.name || t("here"),
      lat: near?.lat ?? ogvHit?.club.lat ?? lat,
      lon: near?.lon ?? ogvHit?.club.lon ?? lon,
      where: ogvHit?.club.address || rev.club || "",
      golf: Boolean(near || ogvHit),
      ogv: ogvHit?.club.id || null,
    };
    $("add-lat").value = String(addPick.lat);
    $("add-lon").value = String(addPick.lon);
    if (!$("add-name").value.trim()) $("add-name").value = addPick.name;
    $("add-picked").textContent = t("gpsPicked", { name: addPick.name });
  } catch (err) {
    $("add-picked").textContent = geoError(err);
  }
}

function openEditPlace(id) {
  const c = state.courses.find((x) => x.id === id);
  if (!c) return;
  $("edit-id").value = c.id;
  $("edit-name").value = c.name;
  $("edit-club").value = c.club || "";
  $("edit-gps-note").hidden = true;
  $("edit-place").showModal();
}

function saveEditPlace() {
  const id = $("edit-id").value;
  const c = state.courses.find((x) => x.id === id);
  if (!c) return;
  const name = $("edit-name").value.trim();
  if (!name) return;
  c.name = name;
  c.club = $("edit-club").value.trim();
  persist();
  $("edit-place").close();
  render();
}

async function gpsForEdit() {
  const id = $("edit-id").value;
  const c = state.courses.find((x) => x.id === id);
  if (!c) return;
  $("edit-gps-note").hidden = false;
  $("edit-gps-note").textContent = t("locating");
  try {
    const pos = await readGps();
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const dist = Number.isFinite(c.lat) ? fmtDist(kmBetween(c.lat, c.lon, lat, lon)) : "";
    c.lat = lat;
    c.lon = lon;
    persist();
    $("edit-gps-note").textContent = dist ? t("foundHere", { name: c.name, dist }) : t("gpsPicked", { name: c.name });
  } catch (err) {
    $("edit-gps-note").textContent = geoError(err);
  }
}

function colorChips() {
  return COLORS.map(
    (col) => `<button class="chip${teeDraft.color === col ? " on" : ""}" type="button" data-act="tee-color" data-color="${col}">
      <span class="dot" style="background:${DOT[col]}"></span>${t(`color_${col}`)}
    </button>`
  ).join("");
}

function renderTeeDraft() {
  $("tee-colors").innerHTML = colorChips();
  $("tee-gender").innerHTML = `
    <button class="chip${teeDraft.gender === "m" ? " on" : ""}" type="button" data-act="tee-gender" data-g="m">${t("men")}</button>
    <button class="chip${teeDraft.gender === "w" ? " on" : ""}" type="button" data-act="tee-gender" data-g="w">${t("women")}</button>`;
  $("tee-holes").innerHTML = `
    <button class="chip${teeDraft.holes === 18 ? " on" : ""}" type="button" data-act="tee-holes" data-h="18">${t("holes18")}</button>
    <button class="chip${teeDraft.holes === 9 ? " on" : ""}" type="button" data-act="tee-holes" data-h="9">${t("holes9")}</button>`;
}

function openTeeEditor(existing) {
  const c = activeCourse();
  if (!c) return;
  if (existing) {
    teeDraft = {
      color: existing.color,
      gender: existing.gender,
      holes: existing.holes,
    };
    $("tee-id").value = existing.id;
    $("tee-cr").value = fmtCr(existing.cr);
    $("tee-slope").value = String(existing.slope);
    $("tee-par").value = String(existing.par);
    $("tee-sheet-title").textContent = t("editTee");
    $("tee-delete").hidden = false;
  } else {
    teeDraft = { color: "yellow", gender: "m", holes: 18 };
    $("tee-id").value = "";
    $("tee-cr").value = "";
    $("tee-slope").value = "";
    $("tee-par").value = "";
    $("tee-sheet-title").textContent = t("addTee");
    $("tee-delete").hidden = true;
  }
  $("tee-err").hidden = true;
  renderTeeDraft();
  $("tee-sheet").showModal();
}

function saveTee() {
  const c = activeCourse();
  if (!c) return;
  const cr = parseNum($("tee-cr").value);
  const slope = parseNum($("tee-slope").value);
  const par = parseNum($("tee-par").value);
  const err = $("tee-err");
  if (!crOk(cr) || !slopeOk(slope) || !parOk(par, teeDraft.holes)) {
    err.hidden = false;
    err.textContent = t("needCr");
    return;
  }
  const id = $("tee-id").value || `${teeDraft.color}-${teeDraft.gender}-${teeDraft.holes}`;
  const tee = {
    id,
    color: teeDraft.color,
    gender: teeDraft.gender,
    holes: teeDraft.holes,
    cr,
    slope,
    par,
  };
  const i = c.tees.findIndex((x) => x.id === id);
  if (i >= 0) c.tees[i] = tee;
  else c.tees.push(tee);
  c.teeId = tee.id;
  persist();
  $("tee-sheet").close();
  render();
}

function deleteTee() {
  const c = activeCourse();
  if (!c) return;
  const id = $("tee-id").value;
  c.tees = c.tees.filter((x) => x.id !== id);
  if (c.teeId === id) c.teeId = c.tees[0]?.id || "";
  persist();
  $("tee-sheet").close();
  render();
}

function deleteCourse(id) {
  if (state.courses.length < 2) return;
  state.courses = state.courses.filter((c) => c.id !== id);
  if (state.activeId === id) state.activeId = state.courses[0].id;
  persist();
  render();
}

$("index-input").addEventListener("input", () => {
  const n = parseNum($("index-input").value);
  state.index = indexOk(n) ? Math.round(n * 10) / 10 : Number.isFinite(n) ? n : null;
  persist();
  renderResult();
});

$("index-input").addEventListener("change", () => {
  if (indexOk(state.index)) $("index-input").value = fmtIndex(state.index);
  renderResult();
});

document.addEventListener("change", (e) => {
  const allow = e.target.closest("[data-act=allow-select]");
  if (allow) {
    const pct = Number(allow.value);
    if ([100, 95, 85].includes(pct)) {
      state.allowance = pct;
      persist();
      renderResult();
    }
    return;
  }
  const sel = e.target.closest("[data-act=layout-select]");
  if (!sel) return;
  const c = activeCourse();
  if (!c) return;
  const oldId = c.id;
  applyLayout(c, sel.value);
  if (c.id !== oldId) state.activeId = c.id;
  persist();
  render();
});

document.addEventListener("click", (e) => {
  const actEl = e.target.closest("[data-act]");
  const act = actEl?.dataset.act;
  if (act === "switch") {
    renderSwitcher();
    $("switcher").showModal();
    return;
  }
  if (act === "places") {
    renderPlaces();
    $("places").showModal();
    return;
  }
  if (act === "here") {
    useCurrentLocation();
    return;
  }
  if (act === "close") {
    actEl.closest("dialog")?.close();
    return;
  }
  if (act === "add-course") {
    openAddSheet();
    return;
  }
  if (act === "export-places") {
    exportPlaces();
    return;
  }
  if (act === "import-places") {
    $("import-file").click();
    return;
  }
  if (act === "add-tee") {
    openTeeEditor(null);
    return;
  }
  if (act === "edit-tee") {
    openTeeEditor(activeTee());
    return;
  }
  if (act === "splits") {
    showSplits = !showSplits;
    render();
    return;
  }
  if (act === "gender") {
    state.gender = actEl.dataset.g === "w" ? "w" : "m";
    const c = activeCourse();
    if (c) {
      const vis = sortTees(c.tees).filter((x) => x.gender === state.gender);
      const cur = activeTee();
      const next = vis.find((x) => x.color === cur?.color) || vis[0];
      if (next) c.teeId = next.id;
    }
    persist();
    render();
    return;
  }
  if (act === "layout") {
    const c = activeCourse();
    if (!c) return;
    const oldId = c.id;
    applyLayout(c, actEl.dataset.id);
    if (c.id !== oldId) state.activeId = c.id;
    persist();
    render();
    return;
  }
  if (act === "pick-tee") {
    const c = activeCourse();
    if (!c) return;
    c.teeId = actEl.dataset.id;
    const picked = c.tees.find((x) => x.id === c.teeId);
    if (picked) state.gender = picked.gender;
    persist();
    render();
    return;
  }
  if (act === "info") {
    $("info-sheet").showModal();
    return;
  }
  if (act === "use") {
    const id = actEl.dataset.id || actEl.closest("[data-id]")?.dataset.id;
    if (id) selectCourse(id);
    return;
  }
  if (act === "edit-place") {
    const id = actEl.closest("[data-id]")?.dataset.id;
    if (id) openEditPlace(id);
    return;
  }
  if (act === "del") {
    const id = actEl.closest("[data-id]")?.dataset.id;
    if (id) deleteCourse(id);
    return;
  }
  if (act === "top" || act === "up" || act === "down" || act === "bottom") {
    const id = actEl.closest("[data-id]")?.dataset.id;
    const i = state.courses.findIndex((c) => c.id === id);
    if (i < 0) return;
    if (act === "top" && i > 0) {
      const [item] = state.courses.splice(i, 1);
      state.courses.unshift(item);
    } else if (act === "up" && i > 0) {
      [state.courses[i - 1], state.courses[i]] = [state.courses[i], state.courses[i - 1]];
    } else if (act === "down" && i < state.courses.length - 1) {
      [state.courses[i + 1], state.courses[i]] = [state.courses[i], state.courses[i + 1]];
    } else if (act === "bottom" && i < state.courses.length - 1) {
      const [item] = state.courses.splice(i, 1);
      state.courses.push(item);
    } else return;
    persist();
    renderPlaces();
    renderSwitcher();
    return;
  }
  if (act === "tee-color") {
    teeDraft.color = actEl.dataset.color;
    renderTeeDraft();
    return;
  }
  if (act === "tee-gender") {
    teeDraft.gender = actEl.dataset.g;
    renderTeeDraft();
    return;
  }
  if (act === "tee-holes") {
    teeDraft.holes = Number(actEl.dataset.h) === 9 ? 9 : 18;
    renderTeeDraft();
  }
});

$("add-search-btn").addEventListener("click", () => runSearch(false));
$("add-search-world").addEventListener("click", () => runSearch(true));
$("add-gps-btn").addEventListener("click", gpsForAdd);
$("add-save").addEventListener("click", saveNewCourse);
$("add-search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    runSearch(false);
  }
});
$("add-results").addEventListener("click", (e) => {
  const btn = e.target.closest(".search-hit");
  if (btn) pickAddHit(btn);
});
$("edit-save").addEventListener("click", saveEditPlace);
$("edit-gps-btn").addEventListener("click", gpsForEdit);
$("tee-save").addEventListener("click", saveTee);
$("tee-delete").addEventListener("click", deleteTee);

function setPlacesNote(msg) {
  const el = $("places-note");
  el.hidden = !msg;
  el.textContent = msg || "";
}

function exportPlaces() {
  const blob = new Blob([JSON.stringify(snapshot(state), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "handicap-places.json";
  a.rel = "noopener";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  setPlacesNote(t("exportPlaces"));
}

$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const next = parseSnapshot(await file.text());
    state.index = next.index;
    state.allowance = next.allowance;
    state.gender = next.gender;
    state.courses = next.courses.map((c) => hydrateCourse(c));
    state.activeId = next.activeId;
    persist();
    render();
    $("places").showModal();
    setPlacesNote(t("importOk"));
  } catch {
    setPlacesNote(t("importFail"));
  }
});

document.querySelectorAll("dialog").forEach((d) => {
  d.addEventListener("click", (e) => {
    if (e.target === d) d.close();
  });
});

applyStaticI18n();
geoNote = t("loadingOgv");
render();

loadOgv().then(() => {
  state.courses = state.courses.map((c) => hydrateCourse(c));
  persist();
  if (!geoNote || geoNote === t("loadingOgv")) geoNote = "";
  render();
});

if ("serviceWorker" in navigator) {
  const hadWorker = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker
    .register("./sw.js", { updateViaCache: "none" })
    .then((reg) => reg.update())
    .catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadWorker) location.reload();
  });
}
