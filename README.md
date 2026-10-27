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

## Roadmap: live data + deployment

1. **Google Maps Platform** — add a key to `.env.local`
   (see `.env.example`: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=`), then implement
   the stubs in `src/lib/googleMaps.ts`:
   - Directions/Routes API → real polyline + duration (server-side, via the
     `/api/find-stops` route, so the key stays off the client where possible).
   - Places API → real candidates along the route; compute each detour with
     Directions and rank with the unchanged scoring above.
   - Places Autocomplete → replace the built-in city list.
   The Leaflet map can stay, or swap `MapView` for the Google Maps JS API.
2. **GitHub** — this is its own repo (`route-stop-finder`), separate from
   `wcfantasy` and SignalQA.
3. **Vercel** — import the repo in Vercel, set the env var above in the
   project settings, deploy. No database is needed for the MVP.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Leaflet/OpenStreetMap
