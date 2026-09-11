import assert from "node:assert/strict";
import test from "node:test";
import {
  catalog,
  searchOgv,
  matchOgv,
  appCourseFromOgv,
  applyLayout,
  preferredLayout,
  isSplitLayout,
  isComboLayout,
  isExtraLayout,
  isNineHoleLayout,
  sortTees,
} from "./ogv.js";

catalog.clubs = [
  {
    id: 330,
    name: "DIAMOND COUNTRY CLUB",
    address: "Am Golfplatz 1, A-3452 Atzenbrugg",
    lat: 48.3152321,
    lon: 15.911922,
    courses: [
      {
        id: 49,
        name: "Diamond Course",
        tees: [
          { id: "yellow-m-18", color: "yellow", gender: "m", holes: 18, cr: 74, slope: 140, par: 72, meters: 6130 },
          { id: "white-m-18", color: "white", gender: "m", holes: 18, cr: 76, slope: 140, par: 72, meters: 6473 },
        ],
      },
      {
        id: 328,
        name: "Gold Course",
        tees: [
          { id: "yellow-m-18", color: "yellow", gender: "m", holes: 18, cr: 66, slope: 118, par: 69, meters: 4844 },
        ],
      },
    ],
  },
];

test("search finds Atzenbrugg and Diamond", () => {
  assert.equal(searchOgv("atzenbrugg")[0]?.id, 330);
  assert.equal(searchOgv("diamond")[0]?.id, 330);
  assert.equal(searchOgv("xyzzy").length, 0);
});

test("GPS near the club matches ÖGV", () => {
  const hit = matchOgv({ name: "Diamond Country Club", lat: 48.315, lon: 15.912 });
  assert.equal(hit.club.id, 330);
  assert.ok(hit.km < 0.5);
});

test("split layouts are the 1-9 / 10-18 cards", () => {
  assert.equal(isSplitLayout("Diamond Course"), false);
  assert.equal(isSplitLayout("Diamond Course, 1-9"), true);
  assert.equal(isSplitLayout("Gold Course 10-18"), true);
});

test("9-hole layouts include 9-Loch and 1-9", () => {
  assert.equal(isNineHoleLayout("Park Course 9-Loch"), true);
  assert.equal(isNineHoleLayout("Diamond Course, 1-9"), true);
  assert.equal(isNineHoleLayout("Diamond Course"), false);
});

test("combo layouts stay off the main list", () => {
  assert.equal(isComboLayout("Platzkombination A/C Kamptal/Donauland"), true);
  assert.equal(isExtraLayout("Kamptalkurs A/B"), false);
  const club = {
    courses: [
      { id: 1, name: "Platzkombination A/C Kamptal/Donauland" },
      { id: 2, name: "Donaulandkurs C/D" },
      { id: 3, name: "Donaulandkurs, 1-9" },
    ],
  };
  assert.equal(preferredLayout(club).id, 2);
});

test("tees sort Herren first, championship to forward", () => {
  const ordered = sortTees([
    { color: "red", gender: "w" },
    { color: "yellow", gender: "m" },
    { color: "black", gender: "m" },
    { color: "green", gender: "w" },
  ]);
  assert.deepEqual(
    ordered.map((t) => `${t.gender}-${t.color}`),
    ["m-black", "m-yellow", "w-red", "w-green"]
  );
});

test("switching 9-hole layout back to 18 clears nine-hole mode", () => {
  const base = catalog.clubs[0];
  const club = {
    ...base,
    courses: [
      ...base.courses,
      {
        id: 456,
        name: "Park Course 9-Loch",
        tees: [
          { id: "yellow-m-18", color: "yellow", gender: "m", holes: 18, cr: 64.6, slope: 116, par: 68, meters: 4444 },
        ],
      },
    ],
  };
  const course = appCourseFromOgv(club, club.courses.find((c) => c.id === 456));
  assert.equal(course.playHoles, 9);
  applyLayout(course, 49);
  assert.equal(course.playHoles, 18);
  assert.equal(isNineHoleLayout(course.club, course.tees), false);
});

test("app course gets yellow tees from Diamond", () => {
  const club = catalog.clubs[0];
  const course = appCourseFromOgv(club, preferredLayout(club));
  assert.equal(course.ogvClub, 330);
  assert.equal(course.ogvCourse, 49);
  const y = course.tees.find((t) => t.color === "yellow" && t.gender === "m");
  assert.equal(y.cr, 74);
  assert.equal(y.slope, 140);
  assert.equal(course.layouts.length, 2);
});
