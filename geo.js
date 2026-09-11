export function kmBetween(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function samePoint(a, b) {
  return Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lon - b.lon) < 0.002;
}

export function readGps() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: 0 });
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

export function fmtDist(km) {
  if (!Number.isFinite(km)) return "";
  if (km < 0.1) return `${Math.max(1, Math.round(km * 1000))} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function placeWhere(h) {
  const bits = [];
  if (h.admin3 && h.admin3 !== h.name) bits.push(h.admin3);
  let bezirk = h.admin2 || "";
  bezirk = bezirk.replace(/^Politischer /, "").replace(/^Regierungsbezirk /, "");
  if (bezirk && bezirk !== h.admin3 && bezirk !== h.admin1) bits.push(bezirk);
  if (h.admin1) bits.push(h.admin1);
  if (h.country) bits.push(h.country);
  return bits.join(" · ");
}

export async function reverseName(lat, lon, lang) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    lang: lang === "de" ? "de" : "en",
  });
  const data = await fetch(`https://photon.komoot.io/reverse?${params}`).then((r) => r.json());
  const p = data.features?.[0]?.properties;
  if (!p) return { name: "", club: "" };
  const name = p.name || p.city || p.town || p.village || "";
  const club = [p.city, p.state, p.country].filter((x) => x && x !== name).join(" · ");
  return { name, club };
}

export async function golfAround(lat, lon, meters = 8000) {
  const q = `[out:json][timeout:8];nwr["leisure"="golf_course"](around:${meters},${lat},${lon});out tags center;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: `data=${encodeURIComponent(q)}`,
  });
  if (!res.ok) return [];
  const data = await res.json();
  const out = [];
  for (const e of data.elements || []) {
    const name = e.tags?.name;
    const elat = e.lat ?? e.center?.lat;
    const elon = e.lon ?? e.center?.lon;
    if (!name || elat == null || elon == null) continue;
    out.push({
      name,
      lat: elat,
      lon: elon,
      km: kmBetween(lat, lon, elat, elon),
      golf: true,
    });
  }
  out.sort((a, b) => a.km - b.km);
  return out;
}

export async function nearestGolfCourse(lat, lon) {
  const list = await golfAround(lat, lon, 8000);
  return list[0] || null;
}

async function searchGolfPhoton(q, everywhere, lang) {
  const params = new URLSearchParams({
    q,
    limit: "8",
    lang: lang === "de" ? "de" : "en",
  });
  if (!everywhere) params.set("bbox", "9.5,46.38,17.2,49.02");
  const data = await fetch(`https://photon.komoot.io/api/?${params}`).then((r) => r.json());
  return (data.features || [])
    .filter((f) => f.properties?.osm_value === "golf_course" && f.properties?.name)
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const p = f.properties;
      const where = [p.city, p.county, p.state, p.country].filter(Boolean).join(" · ");
      return { name: p.name, lat, lon, where, golf: true };
    });
}

export async function searchCourses(q, everywhere, lang) {
  const params = new URLSearchParams({
    name: q,
    count: "10",
    language: lang,
    format: "json",
  });
  if (!everywhere) params.set("country", "AT");
  const [geoRes, clubRes] = await Promise.allSettled([
    fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`).then((r) => r.json()),
    searchGolfPhoton(q, everywhere, lang),
  ]);
  const geo = geoRes.status === "fulfilled" ? geoRes.value : { results: [] };
  let clubs = clubRes.status === "fulfilled" ? clubRes.value : [];
  const places = (geo.results || []).map((h) => ({
    name: h.name,
    lat: h.latitude,
    lon: h.longitude,
    where: placeWhere(h),
    golf: false,
  }));
  if (!clubs.length && places[0]) {
    try {
      const nearby = await golfAround(places[0].lat, places[0].lon, 8000);
      clubs = nearby.map((c) => ({
        name: c.name,
        lat: c.lat,
        lon: c.lon,
        where: `${fmtDist(c.km)} · ${places[0].name}`,
        golf: true,
      }));
    } catch {
      /* keep geocoding hits */
    }
  }
  const merged = [];
  for (const c of clubs) {
    if (!merged.some((m) => samePoint(m, c))) merged.push(c);
  }
  for (const p of places) {
    if (!merged.some((m) => samePoint(m, p))) merged.push(p);
  }
  return merged;
}

export function nearestSaved(lat, lon, courses, maxKm = 1.5) {
  let best = null;
  for (const c of courses) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
    const km = kmBetween(lat, lon, c.lat, c.lon);
    if (km > maxKm) continue;
    if (!best || km < best.km) best = { course: c, km };
  }
  return best;
}
