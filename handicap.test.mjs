import assert from "node:assert/strict";
import test from "node:test";
import {
  parseNum,
  roundStrokes,
  courseHandicapUnrounded,
  courseHandicap,
  playingHandicap,
  targetScore,
  playPar,
  fmtHcp,
} from "./handicap.js";

test("parseNum accepts comma and plus", () => {
  assert.equal(parseNum("18,4"), 18.4);
  assert.equal(parseNum("18.4"), 18.4);
  assert.equal(parseNum("-2,1"), -2.1);
  assert.equal(parseNum("  130 "), 130);
  assert.ok(Number.isNaN(parseNum("")));
});

test("Stanton 18-hole example rounds to 17", () => {
  const opts = { index: 15.4, slope: 134, cr: 71.8, par: 73, holes: 18 };
  assert.equal(courseHandicapUnrounded(opts).toFixed(2), "17.06");
  assert.equal(courseHandicap(opts), 17);
});

test("USGA-style 14.1 on slope 132 is 18", () => {
  const opts = { index: 14.1, slope: 132, cr: 73.2, par: 72 };
  assert.equal(courseHandicap(opts), 18);
});

test("15.4 / slope 130 / CR 73.2 is 19", () => {
  assert.equal(
    courseHandicap({ index: 15.4, slope: 130, cr: 73.2, par: 72 }),
    19
  );
});

test("15.0 / slope 130 / CR 71.5 is 17", () => {
  assert.equal(
    courseHandicap({ index: 15.0, slope: 130, cr: 71.5, par: 72 }),
    17
  );
});

test("playing handicap uses unrounded course handicap", () => {
  const opts = { index: 12.5, slope: 138, cr: 71.3, par: 72 };
  const u = courseHandicapUnrounded(opts);
  assert.ok(Math.abs(u - 14.57) < 0.02);
  assert.equal(courseHandicap(opts), 15);
  assert.equal(playingHandicap(opts, 75), 11);
  assert.equal(playingHandicap(opts, 100), 15);
  assert.equal(playingHandicap(opts, 95), 14);
});

test("9-hole WHS 6.1b", () => {
  const opts = { index: 22.0, slope: 118, cr: 35.1, par: 35, holes: 9 };
  assert.ok(Math.abs(courseHandicapUnrounded(opts) - 11.587) < 0.01);
  assert.equal(courseHandicap(opts), 12);
});

test("9-hole play with 18-hole ÖGV ratings halves the full CH", () => {
  const eighteen = { index: 18.4, slope: 116, cr: 64.4, par: 68, holes: 18 };
  const nine = { ...eighteen, holes: 9 };
  const u18 = courseHandicapUnrounded(eighteen);
  const u9 = courseHandicapUnrounded(nine);
  assert.ok(Math.abs(u9 - u18 * 0.5) < 1e-9);
  assert.equal(playPar(68, 9), 34);
  assert.equal(targetScore(68, courseHandicap(nine), 9), 34 + courseHandicap(nine));
});

test("plus handicap", () => {
  const opts = { index: -2.1, slope: 110, cr: 71.0, par: 72 };
  assert.equal(courseHandicap(opts), -3);
  assert.equal(fmtHcp(-3), "+3");
  assert.equal(fmtHcp(21), "21");
  assert.equal(fmtHcp(0), "0");
});

test("target score is par + rounded CH", () => {
  assert.equal(targetScore(72, 21), 93);
  assert.equal(targetScore(72, -3), 69);
});

test("roundStrokes half up", () => {
  assert.equal(roundStrokes(17.5), 18);
  assert.equal(roundStrokes(17.49), 17);
});
