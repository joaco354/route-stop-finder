# Route Stop Finder

Find the best place to stop along a driving route — the location that adds the
least additional driving time, near when you want to stop.

Enter where you're going, what you need along the way (McDonald's, Starbucks,
a gas station, a hotel, a pharmacy, groceries…), and optionally when you'd
like to stop. The app ranks the candidates and shows the best one on a map.

You can add **up to 4 stops** ("+ Add a stop"): each stop gets its own
"find along route" search and its own optional stop-time slider, and the
app plans them in the order you listed them between your start (A) and
destination (B).

This repo is the Next.js version of the static prototype. It is a lean MVP:
no user accounts, no payments, no saved trips.

## Run it

```bash
npm install
npm run dev    # http://localhost:3000
```

Production check:

```bash
npm run build
npm start
```

The home page auto-runs the example trip: **Boston → Washington, DC,
McDonald's, stop ~3 hours in** → best stop **McDonald's — Stamford
(3h 23m in, +3 min detour, 7h 15m total)**.

## How it works

- `src/lib/cities.ts` — built-in city list (autocomplete + generic routes).
- `src/lib/sampleData.ts` — curated sample corridors with realistic stops:
  Boston → Washington, DC (I-95; McDonald's, Starbucks/Dunkin', Shell/BP,
  CVS/Walgreens, hotels, grocery), New York → Boston, and
  Los Angeles → San Francisco. Other city pairs get a generic fallback:
  duration estimated from distance, with generated candidates along the route.
- `src/lib/scoring.ts` — the ranking and the multi-stop planner (also used
  by `src/app/api/find-stops/route.ts`, which accepts either the original
  single-stop body `{ query, preferredStopMinutes }` or
  `{ stops: [{ query, preferredStopMinutes }, …] }` and returns
  `{ route, stops: [{ query, chosen, alternatives }], summary }`).
- `src/components/MapView.tsx` — Leaflet + OpenStreetMap (no API key needed):
  dashed line = direct route, solid blue = route via your stops, drawn as
  numbered markers in visit order.
- `src/lib/googleMaps.ts` — the "Open in Google Maps" directions URL builder
  (origin → all chosen stops as waypoints, in order → destination), plus the
  marked integration points for live APIs.

### Scoring algorithm (no ML, fully transparent)

```
preferred time set:   score = detourMinutes + | minutesFromStart − preferredStopMinutes |
no preferred time:    score = detourMinutes
total trip time     = base duration + detourMinutes
```

Lower score wins. One minute of detour counts the same as stopping one
minute away from your preferred time.

### Multiple stops (up to 4)

Stops are planned **greedily, in the order you listed them**:

1. For each stop, only candidates that come *after* the previously chosen
   stop are eligible — a candidate's `minutesFromStart` must be more than
   the previous stop's `minutesFromStart` + a 10-minute minimum gap (for
   the first stop, anything after the start counts).
2. Eligible candidates are ranked with the scoring above, using that
   stop's own preferred time (or detour alone if unset). The best one is
   chosen, then planning moves to the next stop.
3. If no candidate exists after the previous stop for a query, that stop
   shows an inline message ("No … found after the previous stop on this
   route — try removing the time preference or reordering") and is left
   out of the route; the remaining stops are still planned.
4. Tapping an alternative for a stop swaps that stop in and re-plans the
   stops *after* it (earlier stops stay fixed).

The results show one card per stop (numbered to match the map) with the
driving time from A until you reach that stop — including the detours of
all earlier stops — plus a trip summary: direct duration, total added
minutes across all stops, and the final total journey time
(`base + Σ detours`). The Google Maps button sends every chosen stop as a
waypoint, in order.

## Sample-data note

Stops, addresses, and times in `sampleData.ts` are realistic samples for the
prototype, not live listings. The search works for **any** stop type or brand,
not only McDonald's — try the quick chips (Starbucks, gas station, coffee,
hotel, pharmacy, grocery) or type your own.

## Live data (Northeast region)

Trips between the region's cities and towns — **Boston, Providence,
Worcester, Springfield, Hartford, New Haven, Bridgeport, New London,
Stamford, New York, Newark, Trenton, Philadelphia, Wilmington,
Baltimore, Washington DC, Buffalo, Rochester, Syracuse, Albany,
Binghamton, Erie, Pittsburgh, Harrisburg, Scranton, Allentown,
Portland ME, Bangor, Burlington, and Concord** (any pair, either
direction) run on REAL data; the UI labels them "● Live data". The
region is the loop Buffalo → Pittsburgh → Washington, DC → (I-95) →
Boston → Bangor → Burlington → Buffalo, plus the interior interstate
network. Routes outside the coverage area get an honest notice —
sample results are never shown as if they were real (the sample
engine remains in the codebase for development only). Live mode never
falls back to sample results silently — if live routing is
unavailable you get an explanation instead of results. The live API
is rate-limited to 30 searches/minute per IP (basic abuse safeguard;
in-memory, per server process). Driving times are estimates — no
live traffic.

- **Routing** — provider-independent adapter in `src/lib/routing/`
  (`RoutingProvider` interface). Default: **Valhalla** public demo server
  (keyless, development/testing only — set `VALHALLA_BASE_URL` for a
  self-hosted instance). Alternative: **openrouteservice** hosted
  (`ROUTING_PROVIDER=openrouteservice` + `ORS_API_KEY`, free Standard
  account; key is personal and server-side only). See `.env.example`.
- **Businesses** — a local OpenStreetMap dataset for the region
  (`src/lib/live/businesses.json`, loaded by `businesses.ts`):
  **53,728 businesses** within ~5 km of the regional highway network
  — restaurants (20,017), fast food (10,387), convenience stores
  (5,267), coffee shops (4,780), gas stations (4,669), hotels/motels
  (3,007), grocery stores (2,553), pharmacies (1,625), EV charging
  stations (1,159), and rest areas (264); © OpenStreetMap
  contributors, ODbL. Categories are assigned from OSM tags
  (amenity/shop/tourism/highway), never curated by brand, so any
  chain or independent in the data is searchable by name, and
  category searches span every brand. Addresses come from OSM; when
  OSM has no town for a business, the town is filled in from the
  nearest US Census place (`scripts/ne-towns.json`) so results always
  say which town a stop is in (99% coverage) — street addresses are
  never invented. The app never queries Overpass at runtime.
- **Detours** — each finalist gets a real route-through calculation;
  ranking uses the unchanged scoring algorithm. Moving the time slider
  re-ranks the already-evaluated candidates in the browser — no extra
  routing calls.
- Endpoint: `POST /api/live-find-stops`.

### Refreshing the business dataset (monthly, manual)

Businesses open and close, so refresh the dataset about once a month.
It takes two commands and no code changes:

```bash
~/workspace/.tools/osmium-venv/bin/python scripts/build-region-dataset.py   # download the Geofabrik US-Northeast extract (skipped when present) and pull every business within ~5 km of the line network
python3 scripts/generate-businesses.py                                     # rebuild src/lib/live/businesses.json + suggestions.json and print per-category counts
npm run build                                                              # sanity-check the app with the new data
```

Then commit the regenerated `businesses.json` and `suggestions.json`.
Endpoint towns are generated the same way:
`python3 scripts/generate-towns.py` rebuilds `src/lib/towns.ts`
(1,140 Census places near the network, offered in the location
dropdown alongside the 30 major cities) from the Census Gazetteer.
The line network (perimeter loop + interior interstates, including
I-91, I-88, I-87 and the Maine Turnpike) is saved as route geometries
in `scripts/corridor-route*.json` and `scripts/lines/*.json`; to
extend coverage, add a line file there and rerun all three steps. The raw extract and POI file live in the feasibility
workspace, outside the repo. (Extraction reads the ~1.8 GB PBF with
pyosmium, installed in the venv noted above: `python3 -m venv
~/workspace/.tools/osmium-venv && ~/workspace/.tools/osmium-venv/bin/pip install osmium`.)

## Performance & caching (Phase 2D)

Measured on the public Valhalla demo server (Boston → DC, one stop):

| Search | Before | After |
|---|---|---|
| McDonald's @3h, cold | 7.7 s | 5.2 s (incl. a slow 2.1 s direct-route call) |
| Starbucks @5h / gas @4h / McDonald's no-pref | 5.2–6.3 s | **2.1–2.2 s** |
| Reverse DC → Boston @3h | 6.2 s | 2.5 s |

Dataset-expansion addendum: with 19,382 businesses, a "restaurant"
search matches 11,278 candidates. Candidate selection (matching +
route projection) takes ~0.26 s thanks to a coarse segment grid —
each business is only projected onto the route segments in its
neighborhood — and end-to-end search time is unchanged (~2.2 s, still
bounded by the routing provider's route-through calls). Repeat
searches remain <0.05 s from cache. Search matching itself is
data-driven: brand queries resolve against the brands present in the
dataset (punctuation-insensitive, one-typo tolerant), category
queries map to OSM-derived categories ("restaurant" includes fast
food), and neither ever mixes a competing brand into a brand search.
| Any repeat search within 10 min | 5.4–5.8 s | **< 0.05 s, zero API calls** |

How: finalist detour calls run concurrently (max 4 in flight); 12
finalists per stop instead of 8 — an exhaustive evaluation of all 173
corridor McDonald's proved the wider set is needed for the true best
stop when no time preference is set, and the app's @3h winner +
alternatives now match the dataset-wide ground truth exactly;
projections run on a decimated route path (validated error ≤ 0.03 min).
Matrix routing was evaluated and rejected: the demo server caps matrix
path distance at 150 km and matrix leg sums are not identical to
routing through a stop.

Caches (all in-memory, per server process, 10-minute TTL): direct
routes, detour results keyed by the exact stop chain (max 500 entries),
and candidate projections per route+query (max 50). They only speed up
repeats — results are identical with or without them. **They are NOT
shared across serverless instances** (e.g. separate Vercel functions
have separate caches); no Redis/database is used. The API returns
planner diagnostics (timings, call counts) when the request body sets
`"debug": true`.

## Roadmap: live data + deployment

1. **More live corridors** — repeat the Phase 2C pattern (dataset build +
   provider route) per corridor; self-host Valhalla for real traffic
   (Phase 2B recommendation). The older Google Maps idea is superseded by
   the open-source stack above; `src/lib/googleMaps.ts` now only builds
   the "Open in Google Maps" navigation link.
2. **GitHub** — this is its own repo (`route-stop-finder`), separate from
   `wcfantasy` and SignalQA.
3. **Vercel** — import the repo in Vercel, set the env vars above in the
   project settings, deploy. No database is needed for the MVP.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Leaflet/OpenStreetMap
