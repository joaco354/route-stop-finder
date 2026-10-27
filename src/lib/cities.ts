import type { City } from "./types";

/** Small built-in city list used for autocomplete and for resolving the
 *  curated sample corridors (see sampleData.ts). Routes between listed
 *  cities without a curated corridor are reported as unsupported.
 *  A live version would use Google Places Autocomplete instead. */
export const CITIES: City[] = [
  { name: "Boston, MA", shortName: "Boston", lat: 42.3601, lng: -71.0589 },
  { name: "New York, NY", shortName: "New York", lat: 40.7128, lng: -74.006 },
  { name: "Washington, DC", shortName: "Washington", lat: 38.9072, lng: -77.0369 },
  { name: "Philadelphia, PA", shortName: "Philadelphia", lat: 39.9526, lng: -75.1652 },
  { name: "Baltimore, MD", shortName: "Baltimore", lat: 39.2904, lng: -76.6122 },
  { name: "Providence, RI", shortName: "Providence", lat: 41.824, lng: -71.4128 },
  { name: "Worcester, MA", shortName: "Worcester", lat: 42.2626, lng: -71.8023 },
  { name: "Springfield, MA", shortName: "Springfield", lat: 42.1015, lng: -72.5898 },
  { name: "Hartford, CT", shortName: "Hartford", lat: 41.7658, lng: -72.6734 },
  { name: "New Haven, CT", shortName: "New Haven", lat: 41.3083, lng: -72.9279 },
  { name: "Bridgeport, CT", shortName: "Bridgeport", lat: 41.1865, lng: -73.1952 },
  { name: "New London, CT", shortName: "New London", lat: 41.3557, lng: -72.0995 },
  { name: "Stamford, CT", shortName: "Stamford", lat: 41.0534, lng: -73.5387 },
  { name: "Newark, NJ", shortName: "Newark", lat: 40.7357, lng: -74.1724 },
  { name: "Trenton, NJ", shortName: "Trenton", lat: 40.2171, lng: -74.7429 },
  { name: "Wilmington, DE", shortName: "Wilmington", lat: 39.7447, lng: -75.5484 },
  { name: "Chicago, IL", shortName: "Chicago", lat: 41.8781, lng: -87.6298 },
  { name: "Atlanta, GA", shortName: "Atlanta", lat: 33.749, lng: -84.388 },
  { name: "Charlotte, NC", shortName: "Charlotte", lat: 35.2271, lng: -80.8431 },
  { name: "Richmond, VA", shortName: "Richmond", lat: 37.5407, lng: -77.436 },
  { name: "Los Angeles, CA", shortName: "Los Angeles", lat: 34.0522, lng: -118.2437 },
  { name: "San Francisco, CA", shortName: "San Francisco", lat: 37.7749, lng: -122.4194 },
  { name: "San Diego, CA", shortName: "San Diego", lat: 32.7157, lng: -117.1611 },
  { name: "Santa Barbara, CA", shortName: "Santa Barbara", lat: 34.4208, lng: -119.6982 },
  { name: "San Luis Obispo, CA", shortName: "San Luis Obispo", lat: 35.2701, lng: -120.6596 },
  { name: "Seattle, WA", shortName: "Seattle", lat: 47.6062, lng: -122.3321 },
  { name: "Portland, OR", shortName: "Portland", lat: 45.5152, lng: -122.6784 },
  { name: "Denver, CO", shortName: "Denver", lat: 39.7392, lng: -104.9903 },
  { name: "Dallas, TX", shortName: "Dallas", lat: 32.7767, lng: -96.797 },
  { name: "Houston, TX", shortName: "Houston", lat: 29.7604, lng: -95.3698 },
];

export function normalizePlace(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Cities covered by REAL data (Phase 3 beta): every city on the
 * Boston ↔ Washington, DC corridor for which the verified OpenStreetMap
 * business dataset was built. Any pair of DISTINCT cities from this set
 * is a live route — the planner is fully generic, no per-pair code.
 */
export const LIVE_CORRIDOR_CITIES: ReadonlySet<string> = new Set([
  "Boston",
  "Providence",
  "Worcester",
  "Springfield",
  "Hartford",
  "New Haven",
  "Bridgeport",
  "New London",
  "Stamford",
  "New York",
  "Newark",
  "Trenton",
  "Philadelphia",
  "Wilmington",
  "Baltimore",
  "Washington",
]);
// The business dataset covers three Northeast centerlines: the
// inland Boston→DC route (I-90/I-84/I-91/I-95), the I-95 coastal route
// through Providence, and the Worcester→Providence connector (MA-146).
// Every city above sits on that network. Pairs whose fastest route
// leaves the covered lines simply find fewer/no stops and get the
// honest coverage behavior — never invented results.

export function isLiveCorridorPair(a: City | null, b: City | null): boolean {
  return (
    !!a &&
    !!b &&
    a.shortName !== b.shortName &&
    LIVE_CORRIDOR_CITIES.has(a.shortName) &&
    LIVE_CORRIDOR_CITIES.has(b.shortName)
  );
}

/** Resolve free text ("Boston", "boston ma", "Boston, MA") to a known city, or null. */
export function resolveCity(input: string): City | null {
  const q = normalizePlace(input);
  if (!q) return null;
  return (
    CITIES.find(
      (c) =>
        normalizePlace(c.name) === q ||
        normalizePlace(c.shortName) === q ||
        q.startsWith(normalizePlace(c.shortName) + ",") ||
        q.startsWith(normalizePlace(c.shortName) + " "),
    ) ?? null
  );
}

export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
