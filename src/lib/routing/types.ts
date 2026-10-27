/**
 * Provider-independent routing interface (Phase 2C).
 *
 * The application talks ONLY to this interface. Concrete providers
 * (Valhalla, openrouteservice, a future self-hosted engine) adapt their
 * APIs to it, so swapping the routing backend never touches planner or
 * UI code.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** Total driving duration of the route, in minutes. */
  durationMinutes: number;
  /** Total distance, in miles. */
  distanceMiles: number;
  /** Route geometry as [lat, lng] pairs, in travel order. */
  path: [number, number][];
  /**
   * Cumulative driving minutes at each path vertex (same length as
   * `path`). Lets the planner estimate "when would we pass this point"
   * for any location near the route without extra API calls.
   */
  cumulativeMinutes: number[];
  /**
   * Duration of each leg in minutes (legs = path points − 1 for a route
   * through N locations). For a route [A, stop, B], legs[0] is the
   * arrival time at the stop.
   */
  legDurationsMinutes: number[];
}

export interface RoutingProvider {
  /** Stable id, e.g. "valhalla" | "openrouteservice". */
  readonly id: string;
  /** Human label for UI/reporting, e.g. "Valhalla (public demo server)". */
  readonly label: string;
  /**
   * Calculate a driving route through 2+ locations, in order.
   * Throws ProviderUnavailableError when the backend cannot answer
   * (no key configured, server down, quota) — callers must surface that
   * honestly rather than substitute invented data.
   */
  route(locations: LatLng[]): Promise<RouteResult>;
}

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

/** Decode an encoded polyline (precision 5 or 6) into [lat, lng] pairs. */
export function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = 10 ** precision;
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (let which = 0; which < 2; which++) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

/**
 * Build a cumulative-minutes array over a decoded path, given maneuver
 * timings: each maneuver covers shape indices [begin, end] and takes
 * `minutes`. Time inside a maneuver is distributed by segment length.
 */
export function cumulativeFromManeuvers(
  path: [number, number][],
  maneuvers: Array<{ beginShapeIndex: number; endShapeIndex: number; minutes: number }>,
): number[] {
  const cum = new Array<number>(path.length).fill(0);
  let elapsed = 0;
  for (const m of maneuvers) {
    const start = m.beginShapeIndex;
    const end = Math.min(m.endShapeIndex, path.length - 1);
    // segment lengths within the maneuver
    const segLens: number[] = [];
    let total = 0;
    for (let i = start + 1; i <= end; i++) {
      const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      segLens.push(d);
      total += d;
    }
    let acc = 0;
    cum[start] = elapsed;
    for (let i = start + 1; i <= end; i++) {
      acc += segLens[i - start - 1];
      cum[i] = elapsed + (total === 0 ? 0 : (acc / total) * m.minutes);
    }
    elapsed += m.minutes;
  }
  // Any tail beyond the last maneuver keeps the final time.
  for (let i = 1; i < cum.length; i++) {
    if (cum[i] === 0 && i > 0) cum[i] = cum[i - 1];
  }
  return cum;
}

/** Evenly thin a path to at most `maxPoints` vertices (keeps endpoints). */
export function downsamplePath<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: T[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}
