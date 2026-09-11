/** WHS Rule 6.1 / 6.2 course and playing handicap. */

export function parseNum(s) {
  if (s == null) return NaN;
  const t = String(s).trim().replace(/\s/g, "").replace(",", ".");
  if (!t || t === "-" || t === "+" || t === "." ) return NaN;
  return Number(t);
}

export function roundStrokes(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export function playPar(par, holes = 18) {
  const p = Number(par);
  if (!Number.isFinite(p)) return null;
  if (Number(holes) === 9 && p > 42) return p / 2;
  return p;
}

export function courseHandicapUnrounded({ index, slope, cr, par, holes = 18 }) {
  const hi = Number(index);
  const sr = Number(slope);
  const rating = Number(cr);
  const p = Number(par);
  if (![hi, sr, rating, p].every(Number.isFinite)) return null;
  const nine = Number(holes) === 9;
  const raw18 = hi * (sr / 113) + (rating - p);
  if (!nine) return raw18;
  // True 9-hole CR/Par (WHS 6.1b). ÖGV often prints 18-hole ratings for a 9 played twice — then the whole 18-hole CH is halved.
  if (p <= 42) return hi * (sr / 113) * 0.5 + (rating - p);
  return raw18 * 0.5;
}

export function courseHandicap(opts) {
  const u = courseHandicapUnrounded(opts);
  return u == null ? null : roundStrokes(u);
}

export function playingHandicap(opts, allowancePct = 100) {
  const u = courseHandicapUnrounded(opts);
  if (u == null) return null;
  const pct = Number(allowancePct);
  if (!Number.isFinite(pct)) return null;
  return roundStrokes(u * (pct / 100));
}

export function targetScore(par, ch, holes = 18) {
  const p = playPar(par, holes);
  const c = Number(ch);
  if (![p, c].every(Number.isFinite)) return null;
  return p + c;
}

export function fmtHcp(n) {
  if (!Number.isFinite(n)) return "—";
  if (n < 0) return `+${Math.abs(n)}`;
  return String(n);
}

export function indexOk(hi) {
  return Number.isFinite(hi) && hi >= -10 && hi <= 54;
}

export function slopeOk(sr) {
  return Number.isFinite(sr) && sr >= 55 && sr <= 155;
}

export function crOk(cr) {
  return Number.isFinite(cr) && cr >= 20 && cr <= 90;
}

export function parOk(par, holes = 18) {
  if (!Number.isFinite(par)) return false;
  return Number(holes) === 9 ? par >= 27 && par <= 42 : par >= 54 && par <= 80;
}
