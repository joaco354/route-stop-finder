import { resolveCity } from "../cities";
import {
  getRoutingProvider,
  ProviderUnavailableError,
  downsamplePath,
  type RouteResult,
} from "../routing";
import {
  MIN_STOP_GAP_MINUTES,
  matchStops,
  scoreStop,
} from "../scoring";
import type {
  City,
  PlannedStop,
  RouteInfo,
  StopCandidate,
  StopRequest,
} from "../types";
import { CORRIDOR_BUSINESSES, type LiveBusiness } from "./businesses";
import { derivePlan, type EvaluatedStopData } from "./derive";

/**
 * LIVE PLANNER (Phase 2C) — Boston ↔ Washington, DC only.
 *
 * Pipeline per search:
 *  1. Direct route from the configured routing provider (cached).
 *  2. Businesses for each query come from the local, verified OSM
 *     corridor dataset — never from live Overpass queries.
 *  3. Candidates are projected onto the route geometry ("when would we
 *     pass it?") and pre-filtered; the finalists get a REAL route-through
 *     calculation (origin → … → candidate → destination) whose legs give
 *     the true arrival time and detour. No invented numbers anywhere.
 *  4. The existing scoring algorithm ranks them (scoreStop).
 *
 * If the provider cannot answer, this throws ProviderUnavailableError
 * and the caller reports it — there is deliberately NO silent fallback
 * to sample data.
 *
 * Phase 2D performance design (measured, see README):
 *  - Finalists are evaluated CONCURRENTLY (max 4 in flight): detour
 *    calls for one stop are independent, so order/results are unchanged.
 *  - 12 finalists per stop (was 8): an exhaustive check of all 173
 *    corridor McDonald's showed the true best no-preference stop ranked
 *    9th under the estimate; 12 restores winner + top-3 fidelity.
 *  - In-memory caches (direct routes, detour results, projections)
 *    with a 10-minute TTL — per-process only, NOT shared across
 *    serverless instances; they speed repeats, never change results.
 *  - Matrix routing was evaluated and rejected for now: the public
 *    Valhalla demo caps matrix path distance at 150 km (corridor legs
 *    are ~700 km), and matrix leg sums are not identical to routing
 *    through a stop. Route-through remains the source of truth.
 */

const MAX_OFF_ROUTE_KM = 8;
const FINALISTS_PER_STOP = 12;
const DETOUR_CONCURRENCY = 4;
/** A stop must be a stop — not the trip's own start or destination. */
const ENDPOINT_EXCLUSION_MINUTES = 10;

/* ---- Phase 2D caches (in-memory, per process; see header note) ---- */
const CACHE_TTL_MS = 10 * 60 * 1000;
const DETOUR_CACHE_MAX = 500;
const PROJECTION_CACHE_MAX = 50;

interface Timed<T> {
  value: T;
  expiresAt: number;
}
function fresh<T>(entry: Timed<T> | undefined): T | undefined {
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) return undefined;
  return entry.value;
}
function setTimed<T>(map: Map<string, Timed<T>>, key: string, value: T, max: number) {
  if (map.size >= max && !map.has(key)) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Live-mode wording for a business with no entries in the corridor dataset. */
function liveUnsupportedMessage(query: string): string {
  const label = query.trim() || "that stop";
  return `We don't have any “${label}” in the live OpenStreetMap dataset for this route yet — coverage is growing, and sample results are never substituted for live ones.`;
}

const routeCache = new Map<string, Timed<RouteResult>>();
const detourCache = new Map<
  string,
  Timed<{ arrival: number; detour: number; total: number }>
>();
const projectionCache = new Map<
  string,
  Timed<Array<{ c: StopCandidate; alongMinutes: number; offRouteKm: number }>>
>();

function businessAsCandidate(b: LiveBusiness): StopCandidate {
  return {
    id: b.id,
    name: b.name,
    address: b.address,
    category: b.category,
    lat: b.lat,
    lng: b.lng,
    minutesFromStart: 0,
    detourMinutes: 0,
    matchTerms: [],
  };
}

const ALL_CANDIDATES: StopCandidate[] = CORRIDOR_BUSINESSES.map(businessAsCandidate);
const BUSINESS_BY_ID = new Map(CORRIDOR_BUSINESSES.map((b) => [b.id, b]));

/**
 * Decimate a route path to at most ~3,000 points for projection.
 * Phase 2D validation against the full 11,672-point path: max error
 * 0.03 min along-route and 0.38 km off-route (mean 0.013 km) — safe for
 * a prefilter whose finalists all get real route-through calculations.
 */
function decimateForProjection(route: RouteResult): {
  path: [number, number][];
  cumulativeMinutes: number[];
} {
  const n = route.path.length;
  const stride = Math.max(1, Math.ceil(n / 3000));
  if (stride === 1) return { path: route.path, cumulativeMinutes: route.cumulativeMinutes };
  const path: [number, number][] = [];
  const cumulativeMinutes: number[] = [];
  for (let i = 0; i < n; i += stride) {
    path.push(route.path[i]);
    cumulativeMinutes.push(route.cumulativeMinutes[i]);
  }
  if (path[path.length - 1] !== route.path[n - 1]) {
    path.push(route.path[n - 1]);
    cumulativeMinutes.push(route.cumulativeMinutes[n - 1]);
  }
  return { path, cumulativeMinutes };
}

/** Project a point onto the route path: along-route minutes + off-route km. */
function projectOntoRoute(
  proj: { path: [number, number][]; cumulativeMinutes: number[] },
  lat: number,
  lng: number,
): { alongMinutes: number; offRouteKm: number } {
  const path = proj.path;
  let best = { distKm: Infinity, along: 0 };
  for (let i = 1; i < path.length; i++) {
    const [aLat, aLng] = path[i - 1];
    const [bLat, bLng] = path[i];
    // Local equirectangular projection (km) around the segment.
    const kx = 85.0;
    const ky = 111.0;
    const bx = (bLng - aLng) * kx;
    const by = (bLat - aLat) * ky;
    const px = (lng - aLng) * kx;
    const py = (lat - aLat) * ky;
    const seg2 = bx * bx + by * by;
    const t = seg2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / seg2));
    const dx = px - bx * t;
    const dy = py - by * t;
    const d = Math.hypot(dx, dy);
    if (d < best.distKm) {
      const t0 = proj.cumulativeMinutes[i - 1];
      const t1 = proj.cumulativeMinutes[i];
      best = { distKm: d, along: t0 + (t1 - t0) * t };
    }
  }
  return { alongMinutes: best.along, offRouteKm: best.distKm };
}

export interface StopDiagnostics {
  query: string;
  matched: number;
  afterFilters: number;
  evaluated: number;
}

export interface PlanDiagnostics {
  totalMs: number;
  directRouteMs: number;
  directRouteCacheHit: boolean;
  candidateSelectionMs: number;
  detourEvaluationMs: number;
  providerCalls: number;
  detourCacheHits: number;
  projectionCacheHit: boolean;
  stops: StopDiagnostics[];
}

export interface LivePlanData extends EvaluatedStopData {
  mode: "live";
  provider: { id: string; label: string };
  /** Per-stop message when a query has no live businesses ("" when fine). */
  stopMessages: string[];
  diagnostics?: PlanDiagnostics;
}

export async function planLiveStops(input: {
  origin: string;
  destination: string;
  stops: StopRequest[];
  overrides?: Array<string | null>;
}): Promise<LivePlanData> {
  const origin = resolveCity(input.origin);
  const destination = resolveCity(input.destination);
  if (!origin || !destination) {
    throw new ProviderUnavailableError("Unknown start or destination for live routing.");
  }

  const diag: PlanDiagnostics = {
    totalMs: 0,
    directRouteMs: 0,
    directRouteCacheHit: false,
    candidateSelectionMs: 0,
    detourEvaluationMs: 0,
    providerCalls: 0,
    detourCacheHits: 0,
    projectionCacheHit: false,
    stops: [],
  };
  const tStart = performance.now();
  const callRoute = async (locs: Array<{ lat: number; lng: number }>) => {
    diag.providerCalls++;
    return provider.route(locs);
  };

  const provider = getRoutingProvider();
  const cacheKey = `${provider.id}:${origin.shortName}->${destination.shortName}`;
  let direct = fresh(routeCache.get(cacheKey));
  if (!direct) {
    const tDirect = performance.now();
    direct = await callRoute([
      { lat: origin.lat, lng: origin.lng },
      { lat: destination.lat, lng: destination.lng },
    ]);
    diag.directRouteMs = performance.now() - tDirect;
    setTimed(routeCache, cacheKey, direct, 20);
  } else {
    diag.directRouteCacheHit = true;
  }
  const proj = decimateForProjection(direct);

  const routeInfo: RouteInfo = {
    origin,
    destination,
    durationMinutes: Math.round(direct.durationMinutes),
    distanceMiles: Math.round(direct.distanceMiles),
    path: downsamplePath(direct.path, 600),
    isSampleCorridor: false,
  };

  const requests = input.stops.slice(0, 4);
  const candidatesByStop: PlannedStop[][] = [];
  const stopMessages: string[] = [];

  // Chain state: stops are planned in order, each new stop is routed
  // through the stops already chosen (exact detours within the chain).
  const chosenCoords: Array<{ lat: number; lng: number }> = [];
  let chainTotal = direct.durationMinutes;
  let prevAlong = 0;

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    const preferred = req.preferredStopMinutes ?? null;
    const tSelect = performance.now();
    const matched = matchStops(ALL_CANDIDATES, req.query);

    if (matched.length === 0) {
      candidatesByStop.push([]);
      stopMessages.push(liveUnsupportedMessage(req.query));
      diag.stops.push({ query: req.query, matched: 0, afterFilters: 0, evaluated: 0 });
      diag.candidateSelectionMs += performance.now() - tSelect;
      continue;
    }

    const projKey = `${cacheKey}|${req.query.trim().toLowerCase()}`;
    let projections = fresh(projectionCache.get(projKey));
    if (!projections) {
      projections = matched.map((c) => ({ c, ...projectOntoRoute(proj, c.lat, c.lng) }));
      setTimed(projectionCache, projKey, projections, PROJECTION_CACHE_MAX);
    } else {
      diag.projectionCacheHit = true;
    }

    const projected = projections.filter(
      (p) =>
        p.offRouteKm <= MAX_OFF_ROUTE_KM &&
        p.alongMinutes > Math.max(ENDPOINT_EXCLUSION_MINUTES, i === 0 ? 0 : prevAlong + MIN_STOP_GAP_MINUTES) &&
        p.alongMinutes < direct!.durationMinutes - ENDPOINT_EXCLUSION_MINUTES,
    );

    if (projected.length === 0) {
      candidatesByStop.push([]);
      stopMessages.push(
        `No ${req.query || "stop"} found after the previous stop on this route — try removing the time preference or reordering`,
      );
      diag.stops.push({ query: req.query, matched: matched.length, afterFilters: 0, evaluated: 0 });
      diag.candidateSelectionMs += performance.now() - tSelect;
      continue;
    }
    stopMessages.push("");

    // Pre-rank by the existing score with detour ESTIMATED from the
    // off-route distance — only to choose finalists. Finalists then get
    // real route-through numbers, and final ranking uses those.
    const finalists = projected
      .map((p) => ({
        ...p,
        est: { ...p.c, detourMinutes: p.offRouteKm * 1.5, minutesFromStart: p.alongMinutes },
      }))
      .sort((a, b) => scoreStop(a.est, preferred) - scoreStop(b.est, preferred))
      .slice(0, FINALISTS_PER_STOP);
    diag.candidateSelectionMs += performance.now() - tSelect;

    const tDetour = performance.now();
    const fmt = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
    const evaluateOne = async (
      f: (typeof finalists)[number],
    ): Promise<PlannedStop> => {
      const chainCoords = [
        { lat: origin.lat, lng: origin.lng },
        ...chosenCoords,
        { lat: f.c.lat, lng: f.c.lng },
        { lat: destination.lat, lng: destination.lng },
      ];
      const detourKey = `${provider.id}|${chainCoords.map(fmt).join("|")}`;
      let numbers = fresh(detourCache.get(detourKey));
      if (numbers) {
        diag.detourCacheHits++;
      } else {
        const through = await callRoute(chainCoords);
        const arrival =
          through.durationMinutes -
          through.legDurationsMinutes[through.legDurationsMinutes.length - 1];
        numbers = {
          arrival,
          detour: through.durationMinutes - chainTotal,
          total: through.durationMinutes,
        };
        setTimed(detourCache, detourKey, numbers, DETOUR_CACHE_MAX);
      }
      const planned: PlannedStop = {
        ...f.c,
        // For live candidates, minutesFromStart carries the ROUTED arrival
        // time (when the driver actually reaches the stop, access roads
        // included) rather than the raw on-route projection — the scoring
        // formula itself is unchanged, and this matches how the curated
        // sample data was authored (and Phase 2B's validated ranking).
        minutesFromStart: Math.round(numbers.arrival),
        detourMinutes: Math.round(numbers.detour * 10) / 10,
        totalMinutes: Math.round(numbers.total),
        score: 0,
        arrivalMinutes: Math.round(numbers.arrival),
      };
      planned.score = scoreStop(planned, preferred);
      return planned;
    };
    // Finalists are independent given the chain so far — evaluate them
    // concurrently (bounded) instead of one network round-trip at a time.
    const evaluated: PlannedStop[] = new Array(finalists.length);
    for (let s = 0; s < finalists.length; s += DETOUR_CONCURRENCY) {
      const chunk = finalists.slice(s, s + DETOUR_CONCURRENCY);
      const results = await Promise.all(chunk.map(evaluateOne));
      results.forEach((p, j) => {
        evaluated[s + j] = p;
      });
    }
    diag.detourEvaluationMs += performance.now() - tDetour;
    diag.stops.push({
      query: req.query,
      matched: matched.length,
      afterFilters: projected.length,
      evaluated: evaluated.length,
    });
    evaluated.sort((a, b) => a.score - b.score || a.detourMinutes - b.detourMinutes);
    candidatesByStop.push(evaluated);

    // Advance the chain with the currently-best candidate (the pinned
    // one when the caller supplied an override).
    const pinnedId = input.overrides?.[i];
    const chosen =
      (pinnedId && evaluated.find((e) => e.id === pinnedId)) || evaluated[0];
    if (chosen) {
      const biz = BUSINESS_BY_ID.get(chosen.id);
      if (biz) chosenCoords.push({ lat: biz.lat, lng: biz.lng });
      chainTotal = chosen.totalMinutes;
      prevAlong = chosen.minutesFromStart;
    }
  }

  diag.totalMs = performance.now() - tStart;
  return {
    mode: "live",
    provider: { id: provider.id, label: provider.label },
    route: routeInfo,
    candidatesByStop,
    stopMessages,
    diagnostics: diag,
  };
}

/** Build the displayable plan from evaluated live data. */
export function buildLiveResult(
  data: LivePlanData,
  stops: StopRequest[],
  overrides: Array<string | null> = [],
) {
  const plan = derivePlan(data, stops, overrides);
  // Attach per-stop honest messages (unsupported business etc.).
  plan.stops = plan.stops.map((entry, i) =>
    data.stopMessages[i] && !entry.chosen
      ? { ...entry, error: data.stopMessages[i] }
      : entry,
  );
  return plan;
}

export function isLiveCorridor(originInput: string, destinationInput: string): boolean {
  const o = resolveCity(originInput);
  const d = resolveCity(destinationInput);
  if (!o || !d) return false;
  const pair = [o.shortName, d.shortName].sort().join("|");
  return pair === "Boston|Washington";
}

export type { City };
