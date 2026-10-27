# Route Stop Finder

Find the best place to stop along a driving route — the location that adds the
least additional driving time, near when you want to stop.

Enter where you're going, what you need along the way (McDonald's, Starbucks,
a gas station, a hotel, a pharmacy, groceries…), and optionally when you'd
like to stop. The app ranks the candidates and shows the best one on a map.

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
- `src/lib/scoring.ts` — the ranking (also used by
  `src/app/api/find-stops/route.ts`).
- `src/components/MapView.tsx` — Leaflet + OpenStreetMap (no API key needed):
  dashed line = direct route, solid blue = route via the selected stop.
- `src/lib/googleMaps.ts` — the "Open in Google Maps" directions URL builder
  (origin → stop waypoint → destination), plus the marked integration points
  for live APIs.

### Scoring algorithm (no ML, fully transparent)

```
preferred time set:   score = detourMinutes + | minutesFromStart − preferredStopMinutes |
no preferred time:    score = detourMinutes
total trip time     = base duration + detourMinutes
```

Lower score wins. One minute of detour counts the same as stopping one
minute away from your preferred time.

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
