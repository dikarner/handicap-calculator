import { kmBetween } from "./geo.js";

export let catalog = { fetched: "", clubs: [] };

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&amp;/g, "and")
    .replace(/\b(golfclub|golf-club|golf club|golfanlage|gc|gcc)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadOgvGzipB64() {
  if (typeof DecompressionStream !== "function" || typeof atob !== "function") return null;
  const res = await fetch("./ogv.b64", { cache: "no-cache" });
  if (!res.ok) return null;
  const b64 = (await res.text()).replace(/\s+/g, "");
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ds = new DecompressionStream("gzip");
  return new Response(new Blob([bin]).stream().pipeThrough(ds)).json();
}

export async function loadOgv() {
  try {
    const zipped = await loadOgvGzipB64();
    if (zipped && Array.isArray(zipped.clubs) && zipped.clubs.length) {
      catalog = zipped;
      return catalog;
    }
  } catch {
    /* fall through to plain json */
  }
  try {
    const res = await fetch("./ogv.json", { cache: "no-cache" });
    if (!res.ok) return catalog;
    const data = await res.json();
    if (Array.isArray(data.clubs) && data.clubs.length) catalog = data;
  } catch {
    /* keep empty */
  }
  return catalog;
}

export const COLOR_ORDER = ["black", "white", "yellow", "blue", "red", "orange", "green"];

export function isSplitLayout(name) {
  return /\b1\s*[-–]\s*9\b|\b10\s*[-–]\s*18\b/i.test(String(name || ""));
}

export function isNineHoleLayout(name, tees) {
  if (isSplitLayout(name)) return true;
  if (/9-loch|9 loch|\b9\s*holes?\b/i.test(String(name || ""))) return true;
  const p = Number(tees?.[0]?.par);
  return Number.isFinite(p) && p <= 42;
}

export function isComboLayout(name) {
  return /kombination|combination/i.test(String(name || ""));
}

export function isExtraLayout(name) {
  return isSplitLayout(name) || isComboLayout(name);
}

export function sortTees(tees) {
  const rank = Object.fromEntries(COLOR_ORDER.map((c, i) => [c, i]));
  return [...(tees || [])].sort((a, b) => {
    if (a.gender !== b.gender) return a.gender === "m" ? -1 : 1;
    const am = Number(a.meters);
    const bm = Number(b.meters);
    if (Number.isFinite(am) && Number.isFinite(bm) && am !== bm) return bm - am;
    const cr = (rank[a.color] ?? 9) - (rank[b.color] ?? 9);
    if (cr) return cr;
    return (b.holes || 18) - (a.holes || 18);
  });
}

export function preferredLayout(club) {
  const courses = club?.courses || [];
  return (
    courses.find((c) => !isExtraLayout(c.name)) ||
    courses.find((c) => !isSplitLayout(c.name)) ||
    courses[0] ||
    null
  );
}

export function layoutById(club, id) {
  return (club?.courses || []).find((c) => c.id === Number(id)) || preferredLayout(club);
}

function teeId(t) {
  return t.id || `${t.color}-${t.gender}-${t.holes}`;
}

export function appCourseFromOgv(club, layout, extra = {}) {
  const lay = layout || preferredLayout(club);
  const playHoles = isNineHoleLayout(lay?.name, lay?.tees) ? 9 : 18;
  const tees = sortTees((lay?.tees || []).map((t) => ({ ...t, id: teeId(t), playHoles })));
  const prefer =
    tees.find((t) => t.color === "yellow" && t.gender === "m") ||
    tees.find((t) => t.gender === "m") ||
    tees[0];
  const wanted = extra.teeId && tees.some((t) => t.id === extra.teeId) ? extra.teeId : prefer?.id || "";
  return {
    id: extra.id || `ogv-${club.id}-${lay.id}`,
    name: extra.name || club.name,
    club: lay?.name || "",
    lat: Number.isFinite(Number(extra.lat)) ? Number(extra.lat) : club.lat,
    lon: Number.isFinite(Number(extra.lon)) ? Number(extra.lon) : club.lon,
    tees,
    teeId: wanted,
    playHoles,
    ogvClub: club.id,
    ogvCourse: lay?.id,
    layouts: (club.courses || []).map((c) => {
      const h = isNineHoleLayout(c.name, c.tees) ? 9 : 18;
      return {
        id: c.id,
        name: c.name,
        playHoles: h,
        tees: (c.tees || []).map((t) => ({ ...t, id: teeId(t), playHoles: h })),
      };
    }),
    source: "ogv",
  };
}

export function applyLayout(course, layoutId) {
  const lay = (course.layouts || []).find((c) => c.id === Number(layoutId));
  if (!lay) return course;
  const playHoles = isNineHoleLayout(lay.name, lay.tees) ? 9 : 18;
  const tees = sortTees(lay.tees).map((t) => ({ ...t, playHoles }));
  const prefer =
    tees.find((t) => t.color === "yellow" && t.gender === "m") ||
    tees.find((t) => t.gender === "m") ||
    tees[0];
  const keep = course.teeId && tees.some((t) => t.id === course.teeId);
  course.club = lay.name;
  course.playHoles = playHoles;
  course.tees = tees;
  course.teeId = keep ? course.teeId : prefer?.id || "";
  course.ogvCourse = lay.id;
  course.id = course.ogvClub ? `ogv-${course.ogvClub}-${lay.id}` : course.id;
  return course;
}

export function searchOgv(q) {
  const nq = fold(q);
  if (!nq || nq.length < 2) return [];
  const hits = [];
  for (const club of catalog.clubs || []) {
    const hay = fold(`${club.name} ${club.address || ""}`);
    if (!hay.includes(nq) && !nq.split(" ").every((w) => hay.includes(w))) continue;
    hits.push(club);
  }
  hits.sort((a, b) => {
    const an = fold(a.name).startsWith(nq) ? 0 : 1;
    const bn = fold(b.name).startsWith(nq) ? 0 : 1;
    return an - bn || a.name.localeCompare(b.name);
  });
  return hits.slice(0, 12);
}

export function matchOgv({ name, lat, lon }) {
  const clubs = catalog.clubs || [];
  if (!clubs.length) return null;
  let bestGeo = null;
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    for (const club of clubs) {
      if (!Number.isFinite(club.lat) || !Number.isFinite(club.lon)) continue;
      const km = kmBetween(lat, lon, club.lat, club.lon);
      if (km > 5) continue;
      if (!bestGeo || km < bestGeo.km) bestGeo = { club, km };
    }
  }
  const nn = fold(name);
  let bestName = null;
  if (nn) {
    for (const club of clubs) {
      const cn = fold(club.name);
      const ad = fold(club.address);
      let score = 0;
      if (cn === nn) score = 100;
      else if (cn.includes(nn) || nn.includes(cn)) score = 80;
      else if (ad.includes(nn)) score = 50;
      else {
        const words = nn.split(" ").filter((w) => w.length > 3);
        if (words.length && words.every((w) => cn.includes(w) || ad.includes(w))) score = 40;
      }
      if (!score) continue;
      const km =
        Number.isFinite(lat) && Number.isFinite(club.lat)
          ? kmBetween(lat, lon, club.lat, club.lon)
          : 99;
      if (!bestName || score > bestName.score || (score === bestName.score && km < bestName.km)) {
        bestName = { club, score, km };
      }
    }
  }
  if (bestGeo && bestName && bestGeo.club.id === bestName.club.id) return bestGeo;
  if (bestGeo && bestGeo.km <= 2.5) return bestGeo;
  if (bestName && bestName.score >= 80) return bestName;
  if (bestGeo) return bestGeo;
  return bestName;
}

export function hydrateCourse(course) {
  if (!course || course.source === "manual") return course;
  const hit =
    (course.ogvClub && (catalog.clubs || []).find((c) => c.id === Number(course.ogvClub))) ||
    matchOgv({ name: course.name, lat: course.lat, lon: course.lon })?.club ||
    matchOgv({ name: course.club, lat: course.lat, lon: course.lon })?.club;
  if (!hit) return course;
  const layout = layoutById(hit, course.ogvCourse) || preferredLayout(hit);
  const filled = appCourseFromOgv(hit, layout, {
    id: course.id,
    name: course.name,
    lat: course.lat,
    lon: course.lon,
    teeId: course.teeId,
  });
  return filled;
}
