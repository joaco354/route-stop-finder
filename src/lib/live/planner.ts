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
 */

const MAX_OFF_ROUTE_KM = 8;
const FINALISTS_PER_STOP = 8;
/** A stop must be a stop — not the trip's own start or destination. */
const ENDPOINT_EXCLUSION_MINUTES = 10;

/** Live-mode wording for a business with no entries in the corridor dataset. */
function liveUnsupportedMessage(query: string): string {
  const label = query.trim() || "that stop";
  return `We don't have any “${label}” in the live OpenStreetMap dataset for this route yet — coverage is growing, and sample results are never substituted for live ones.`;
}

const routeCache = new Map<string, RouteResult>();

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

/** Project a point onto the route path: along-route minutes + off-route km. */
function projectOntoRoute(
  route: RouteResult,
  lat: number,
  lng: number,
): { alongMinutes: number; offRouteKm: number } {
  const path = route.path;
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
      const t0 = route.cumulativeMinutes[i - 1];
      const t1 = route.cumulativeMinutes[i];
      best = { distKm: d, along: t0 + (t1 - t0) * t };
    }
  }
  return { alongMinutes: best.along, offRouteKm: best.distKm };
}

export interface LivePlanData extends EvaluatedStopData {
  mode: "live";
  provider: { id: string; label: string };
  /** Per-stop message when a query has no live businesses ("" when fine). */
  stopMessages: string[];
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

  const provider = getRoutingProvider();
  const cacheKey = `${provider.id}:${origin.shortName}->${destination.shortName}`;
  let direct = routeCache.get(cacheKey);
  if (!direct) {
    direct = await provider.route([
      { lat: origin.lat, lng: origin.lng },
      { lat: destination.lat, lng: destination.lng },
    ]);
    routeCache.set(cacheKey, direct);
  }

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
    const matched = matchStops(ALL_CANDIDATES, req.query);

    if (matched.length === 0) {
      candidatesByStop.push([]);
      stopMessages.push(liveUnsupportedMessage(req.query));
      continue;
    }

    const projected = matched
      .map((c) => ({ c, ...projectOntoRoute(direct!, c.lat, c.lng) }))
      .filter(
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

    const evaluated: PlannedStop[] = [];
    for (const f of finalists) {
      const through = await provider.route([
        { lat: origin.lat, lng: origin.lng },
        ...chosenCoords,
        { lat: f.c.lat, lng: f.c.lng },
        { lat: destination.lat, lng: destination.lng },
      ]);
      const arrival =
        through.durationMinutes - through.legDurationsMinutes[through.legDurationsMinutes.length - 1];
      const detour = through.durationMinutes - chainTotal;
      const planned: PlannedStop = {
        ...f.c,
        // For live candidates, minutesFromStart carries the ROUTED arrival
        // time (when the driver actually reaches the stop, access roads
        // included) rather than the raw on-route projection — the scoring
        // formula itself is unchanged, and this matches how the curated
        // sample data was authored (and Phase 2B's validated ranking).
        minutesFromStart: Math.round(arrival),
        detourMinutes: Math.round(detour * 10) / 10,
        totalMinutes: Math.round(through.durationMinutes),
        score: 0,
        arrivalMinutes: Math.round(arrival),
      };
      planned.score = scoreStop(planned, preferred);
      evaluated.push(planned);
    }
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

  return {
    mode: "live",
    provider: { id: provider.id, label: provider.label },
    route: routeInfo,
    candidatesByStop,
    stopMessages,
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
