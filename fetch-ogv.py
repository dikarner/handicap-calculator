#!/usr/bin/env python3
"""Snapshot ÖGV course ratings from the public golf.at Vorgabenrechner.

Personal use. Same numbers the club-page calculator shows.
Run from golf-handicap/:  python3 fetch-ogv.py
"""

from __future__ import annotations

import html as htmlmod
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

UA = "Mozilla/5.0 (compatible; golf-handicap personal; +https://golf.at/)"
BASE = "https://www.golf.at"
COLORS = ["green", "orange", "red", "blue", "yellow", "white", "black"]
SLEEP = 0.18
OUT = Path(__file__).resolve().parent / "ogv.json"

OPTION_RE = re.compile(
    r'<option value="(\d+);(\d+)">([^<]+)</option>',
    re.I,
)
RATING_RE = re.compile(
    r'<p class="club-calculator-result__rating"><span title="([^"]*)">',
    re.I,
)
TITLE_RE = re.compile(
    r"Länge:\s*(\d+)\s*m,\s*Par:\s*(\d+),\s*CR-Wert:\s*([\d,]+),\s*Slope-Rating:\s*(\d+)",
    re.I,
)
HEAD_RE = re.compile(r'search-result-club__headline">([^<]+)</h3>')
ADDR_RE = re.compile(r'search-result-club__address">(.*?)</p>', re.S)
LOGO_RE = re.compile(r"/_img/logos/(\d+)\.jpg")


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=25) as res:
        return res.read().decode("utf-8", "replace")


def num(s: str) -> float:
    return float(s.replace(",", ".").replace(" ", ""))


def parse_tees(blob: str) -> list[dict]:
    titles = RATING_RE.findall(blob)
    if len(titles) < 14:
        return []
    out = []
    for gender, chunk in (("w", titles[:7]), ("m", titles[7:14])):
        for color, title in zip(COLORS, chunk):
            title = htmlmod.unescape(title or "").strip()
            if not title:
                continue
            m = TITLE_RE.search(title)
            if not m:
                continue
            meters, par, cr, slope = m.groups()
            par_n = int(par)
            holes = 9 if par_n <= 42 else 18
            out.append(
                {
                    "id": f"{color}-{gender}-{holes}",
                    "color": color,
                    "gender": gender,
                    "holes": holes,
                    "cr": num(cr),
                    "slope": int(slope),
                    "par": par_n,
                    "meters": int(meters),
                }
            )
    return out


def layout_name(option_text: str, club_name: str) -> str:
    text = htmlmod.unescape(option_text).strip()
    prefix = club_name.strip()
    if text.lower().startswith(prefix.lower()):
        rest = text[len(prefix) :].lstrip(" ,-–")
        if rest:
            return rest
    return text


def layout_rank(name: str, tees: list[dict]) -> tuple:
    n = name.lower()
    par = tees[0]["par"] if tees else 72
    front_back = 1 if re.search(r"\b1-9\b|\b10-18\b", n) else 0
    nine = 1 if ("9-loch" in n or "9 loch" in n) and par <= 42 else 0
    return (front_back, nine, -par, name)


def parse_clubs(page: str) -> list[dict]:
    blocks = page.split('<div class="search-result-club">')[1:]
    clubs = []
    seen = set()
    for block in blocks:
        logo = LOGO_RE.search(block)
        head = HEAD_RE.search(block)
        addr = ADDR_RE.search(block)
        if not logo or not head:
            continue
        cid = int(logo.group(1))
        if cid in seen:
            continue
        seen.add(cid)
        address = htmlmod.unescape(re.sub(r"<br\s*/?>", ", ", addr.group(1) if addr else ""))
        address = re.sub(r"\s+", " ", address).strip(" ,")
        clubs.append(
            {
                "id": cid,
                "name": htmlmod.unescape(head.group(1)).strip(),
                "address": address,
            }
        )
    return clubs


def city_from_address(address: str) -> str:
    m = re.search(r"A-\d{4}\s+(.+)$", address)
    if m:
        return m.group(1).strip()
    parts = [p.strip() for p in address.split(",") if p.strip()]
    return parts[-1] if parts else address


def geocode(city: str) -> tuple[float | None, float | None]:
    if not city:
        return None, None
    q = urllib.parse.urlencode(
        {"name": city, "count": "1", "country": "AT", "language": "de", "format": "json"}
    )
    try:
        raw = get(f"https://geocoding-api.open-meteo.com/v1/search?{q}")
        data = json.loads(raw)
        hits = data.get("results") or []
        if not hits:
            return None, None
        return float(hits[0]["latitude"]), float(hits[0]["longitude"])
    except Exception:
        return None, None


def list_austria() -> list[dict]:
    by_id = {}
    for site in range(1, 10):
        url = f"{BASE}/suche/golfclubsuche/?lstSites={site}&a=dosearch&noscroll=1"
        print(f"clubs site {site}", flush=True)
        page = get(url)
        for c in parse_clubs(page):
            by_id[c["id"]] = c
        time.sleep(SLEEP)
    return sorted(by_id.values(), key=lambda c: c["id"])


def club_courses(club: dict) -> list[dict]:
    url = f"{BASE}/golfclubs/x/{club['id']}/"
    page = get(url)
    courses = []
    seen = set()
    for m in OPTION_RE.finditer(page):
        club_nr, course_nr, label = m.groups()
        if int(club_nr) != club["id"]:
            continue
        cid = int(course_nr)
        if cid in seen:
            continue
        seen.add(cid)
        courses.append({"id": cid, "name": layout_name(label, club["name"])})
    return courses


def fetch_ratings(club_id: int, course_id: int) -> list[dict]:
    url = (
        f"{BASE}/ajax/getplayinghandicap.asp"
        f"?handicap=18&clubNumber={club_id}&courseNumber={course_id}"
    )
    return parse_tees(get(url))


def main() -> None:
    clubs = list_austria()
    print(f"{len(clubs)} clubs", flush=True)
    geo_cache: dict[str, tuple[float | None, float | None]] = {}
    out_clubs = []
    for i, club in enumerate(clubs, 1):
        city = city_from_address(club["address"])
        if city not in geo_cache:
            time.sleep(0.05)
            geo_cache[city] = geocode(city)
        lat, lon = geo_cache[city]
        try:
            layouts = club_courses(club)
        except Exception as exc:
            print(f"  skip club {club['id']} {club['name']}: {exc}", flush=True)
            continue
        time.sleep(SLEEP)
        courses = []
        for lay in layouts:
            try:
                tees = fetch_ratings(club["id"], lay["id"])
            except Exception as exc:
                print(f"  skip course {club['id']}/{lay['id']}: {exc}", flush=True)
                tees = []
            time.sleep(SLEEP)
            if not tees:
                continue
            courses.append({"id": lay["id"], "name": lay["name"], "tees": tees})
        courses.sort(key=lambda c: layout_rank(c["name"], c["tees"]))
        print(
            f"[{i}/{len(clubs)}] {club['id']} {club['name']}: {len(courses)} layouts",
            flush=True,
        )
        if not courses:
            continue
        out_clubs.append(
            {
                "id": club["id"],
                "name": club["name"],
                "address": club["address"],
                "lat": lat,
                "lon": lon,
                "courses": courses,
            }
        )
        if i % 15 == 0:
            write(out_clubs, partial=True)
    write(out_clubs, partial=False)


def write(clubs: list[dict], partial: bool) -> None:
    payload = {
        "source": "https://www.golf.at/ajax/getplayinghandicap.asp",
        "fetched": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "partial": partial,
        "clubs": clubs,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(clubs)} clubs)", flush=True)


if __name__ == "__main__":
    sample = Path("/tmp/hcp.html")
    if sample.exists():
        tees = parse_tees(sample.read_text(encoding="utf-8", errors="replace"))
        yellow = next((t for t in tees if t["color"] == "yellow" and t["gender"] == "m"), None)
        assert yellow and yellow["cr"] == 74 and yellow["slope"] == 140 and yellow["par"] == 72, yellow
        print("parser ok", len(tees), "tees")
    main()
