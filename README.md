# Handicap Calculator

Browser calculator for a World Handicap System **course handicap** (Platzvorgabe). Personal use. Not an ÖGV service.

Live: **https://dikarner.github.io/handicap-calculator/**

Phone-sized page, German/English, light/dark, **Hier** (GPS) and search.

## What it does

- Stores your Handicap Index in this browser.
- Picks a course with **Hier** (nearest OSM golf course within 8 km) or search (Photon + Open-Meteo, Austria first).
- Austrian **CR, Slope and Par** come from the public [golf.at Vorgabenrechner](https://www.golf.at/) (ÖGV), snapshotted in `ogv.json`.
- Search and **Hier** match that catalogue. Pick a layout (Diamond / Gold / Park, …) then a tee.
- Abroad or missing tees: enter CR, Slope and Par from the scorecard.

Formula (18 holes): `Index × (Slope ÷ 113) + (CR − Par)`. Nine-hole tees use half the index.

Refresh the catalogue (needs network, a few minutes):

```bash
python3 fetch-ogv.py
```

## On iPhone

Open in Safari over HTTPS. Location is a site permission, same caveats as Golf outlook. A home-screen shortcut with **Open as Web App off** reuses Safari’s location allow.

## Local

```bash
python3 -m http.server 8788
# http://127.0.0.1:8788/
npm test
```
