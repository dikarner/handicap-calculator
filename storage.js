const KEY = "golf-handicap-v1";

export const SEED_COURSES = [
  {
    id: "atzenbrugg",
    name: "Atzenbrugg",
    club: "Diamond Country Club",
    lat: 48.3152321,
    lon: 15.911922,
    tees: [],
    teeId: "",
  },
];

function blank() {
  return {
    index: null,
    allowance: 95,
    gender: "m",
    courses: structuredClone(SEED_COURSES),
    activeId: "atzenbrugg",
  };
}

function normalizeCourse(c) {
  return {
    id: String(c.id || ""),
    name: String(c.name || ""),
    club: String(c.club || ""),
    lat: Number(c.lat),
    lon: Number(c.lon),
    tees: Array.isArray(c.tees) ? c.tees.map(normalizeTee).filter((t) => t.id) : [],
    teeId: String(c.teeId || ""),
    playHoles: Number(c.playHoles) === 9 ? 9 : 18,
    ogvClub: c.ogvClub != null ? Number(c.ogvClub) : null,
    ogvCourse: c.ogvCourse != null ? Number(c.ogvCourse) : null,
    layouts: Array.isArray(c.layouts)
      ? c.layouts.map((l) => ({
          id: Number(l.id),
          name: String(l.name || ""),
          playHoles: Number(l.playHoles) === 9 ? 9 : 18,
          tees: Array.isArray(l.tees) ? l.tees.map(normalizeTee).filter((t) => t.id) : [],
        }))
      : [],
    source: String(c.source || ""),
  };
}

function normalizeTee(t) {
  return {
    id: String(t.id || ""),
    color: String(t.color || "yellow"),
    gender: t.gender === "w" ? "w" : "m",
    holes: Number(t.holes) === 9 ? 9 : 18,
    cr: Number(t.cr),
    slope: Number(t.slope),
    par: Number(t.par),
    meters: Number.isFinite(Number(t.meters)) ? Number(t.meters) : null,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    const courses = Array.isArray(parsed.courses)
      ? parsed.courses.map(normalizeCourse).filter((c) => c.id && c.name)
      : [];
    const state = {
      index: parsed.index == null || parsed.index === "" ? null : Number(parsed.index),
      allowance: Number(parsed.allowance) || 95,
      gender: parsed.gender === "w" ? "w" : "m",
      courses: courses.length ? courses : structuredClone(SEED_COURSES),
      activeId: String(parsed.activeId || ""),
    };
    if (!Number.isFinite(state.index)) state.index = null;
    if (![100, 95, 85].includes(state.allowance)) state.allowance = 95;
    if (!state.courses.some((c) => c.id === state.activeId)) {
      state.activeId = state.courses[0].id;
    }
    return state;
  } catch {
    return blank();
  }
}

export function saveState(state) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      index: state.index,
      allowance: state.allowance,
      gender: state.gender,
      courses: state.courses,
      activeId: state.activeId,
    })
  );
}
