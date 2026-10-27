import type { StopCandidate } from "./types";

/**
 * Google Maps integration.
 *
 * USED NOW: `buildGoogleMapsDirectionsUrl` — a plain Google Maps URLs API
 * link (no API key required) that opens navigation with the chosen stop
 * as a waypoint.
 *
 * FUTURE (live data — roadmap in README):
 *  - `fetchLiveDirections` → Google Directions API (or Routes API):
 *    real route polyline + duration for origin → destination.
 *  - `searchPlacesAlongRoute` → Google Places API (Nearby/Text Search)
 *    sampled along the route polyline, then re-rank with the same
 *    transparent scoring in scoring.ts by computing each candidate's
 *    detour via the Directions API.
 *  Both need NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (client) / a server key,
 *  set in .env.local — see .env.example. Never commit a real key.
 */

export function buildGoogleMapsDirectionsUrl(params: {
  origin: string;
  destination: string;
  waypoint?: Pick<StopCandidate, "name" | "address"> | null;
}): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", params.origin);
  url.searchParams.set("destination", params.destination);
  if (params.waypoint) {
    url.searchParams.set("waypoints", `${params.waypoint.name}, ${params.waypoint.address}`);
  }
  url.searchParams.set("travelmode", "driving");
  return url.toString();
}

export interface LiveDirectionsResult {
  durationMinutes: number;
  distanceMiles: number;
  polyline: [number, number][];
}

/** INTEGRATION POINT — not implemented yet (no API key in the MVP).
 *  Intended: call the Google Directions/Routes API and map its response
 *  to LiveDirectionsResult, replacing the sample corridors in sampleData.ts. */
export async function fetchLiveDirections(
  _origin: string,
  _destination: string,
): Promise<LiveDirectionsResult | null> {
  // TODO(google-maps): implement when an API key is configured.
  return null;
}

/** INTEGRATION POINT — not implemented yet (no API key in the MVP).
 *  Intended: query Google Places along the route polyline for `query`,
 *  compute each result's detour, and return StopCandidate[] for scoring.ts. */
export async function searchPlacesAlongRoute(
  _query: string,
  _polyline: [number, number][],
): Promise<StopCandidate[]> {
  // TODO(google-maps): implement when an API key is configured.
  return [];
}

export function hasGoogleMapsKey(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
}
