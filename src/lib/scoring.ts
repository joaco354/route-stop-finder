import { haversineMiles, resolveCity } from "./cities";
import { findCorridorAnyDirection } from "./sampleData";
import type {
  City,
  FindMultiStopsInput,
  FindStopsInput,
  FindStopsResult,
  MultiStopResult,
  PlannedStop,
  RankedStop,
  RouteInfo,
  StopCandidate,
  StopPlanEntry,
} from "./types";

/**
 * SCORING — deliberately simple and transparent. No ML.
 *
 * When a preferred stop time IS set:
 *   score = detourMinutes + | minutesFromStart − preferredStopMinutes |
 *   i.e. one minute of detour counts the same as being one minute away
 *   from your preferred stopping time.
 *
 * When NO preferred stop time is set:
 *   score = detourMinutes   (just find the smallest detour)
 *
 * Lower score wins. Total trip time = base duration + detourMinutes.
 */
export function scoreStop(
  stop: StopCandidate,
  preferredStopMinutes: number | null | undefined,
): number {
  if (preferredStopMinutes == null) return stop.detourMinutes;
  return stop.detourMinutes + Math.abs(stop.minutesFromStart - preferredStopMinutes);
}

export function rankStops(
  stops: StopCandidate[],
  baseDurationMinutes: number,
  preferredStopMinutes: number | null | undefined,
): RankedStop[] {
  return stops
    .map((s) => ({
      ...s,
      totalMinutes: baseDurationMinutes + s.detourMinutes,
      score: scoreStop(s, preferredStopMinutes),
    }))
    .sort((a, b) => a.score - b.score || a.detourMinutes - b.detourMinutes);
}

export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}

function matchesQuery(stop: StopCandidate, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (stop.name.toLowerCase().includes(q)) return true;
  return stop.matchTerms.some((t) => t === q || t.includes(q) || q.includes(t));
}

const CATEGORY_LABELS: Record<string, string> = {
  "gas station": "Gas Station",
  gas: "Gas Station",
  coffee: "Coffee Shop",
  hotel: "Hotel",
  pharmacy: "Pharmacy",
  grocery: "Grocery Store",
  groceries: "Grocery Store",
  restaurant: "Restaurant",
};

function interpolate(path: [number, number][], fraction: number): [number, number] {
  // Walk the polyline by segment length and return the point at `fraction` of the way.
  const dists: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    dists.push(d);
    total += d;
  }
  let target = total * fraction;
  for (let i = 0; i < dists.length; i++) {
    if (target <= dists[i]) {
      const t = dists[i] === 0 ? 0 : target / dists[i];
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ];
    }
    target -= dists[i];
  }
  return path[path.length - 1];
}

/** Generic candidates for routes/queries without curated sample data:
 *  three stops at ~30% / ~50% / ~70% of the trip, so the preferred-time
 *  slider still has something sensible to rank. */
function genericCandidates(
  route: RouteInfo,
  query: string,
  preferredStopMinutes: number | null | undefined,
): StopCandidate[] {
  const label = CATEGORY_LABELS[query.trim().toLowerCase()] ?? query.trim();
  const center =
    preferredStopMinutes != null && route.durationMinutes > 0
      ? Math.min(0.85, Math.max(0.15, preferredStopMinutes / route.durationMinutes))
      : 0.5;
  const fractions = [center - 0.18, center, center + 0.18].map((f) =>
    Math.min(0.9, Math.max(0.1, f)),
  );
  return fractions.map((f, i) => {
    const [lat, lng] = interpolate(route.path, f);
    return {
      id: `generic-${i}`,
      name: `${label} — Mile ${Math.round(route.distanceMiles * f)} (sample)`,
      address: `Sample stop near mile ${Math.round(route.distanceMiles * f)} on the route from ${route.origin.shortName} to ${route.destination.shortName}`,
      category: "other" as const,
      lat,
      lng,
      minutesFromStart: Math.round(route.durationMinutes * f),
      detourMinutes: 3 + i * 3,
      matchTerms: [query.trim().toLowerCase()],
    };
  });
}

function buildGenericRoute(origin: City, destination: City): RouteInfo {
  const straightMiles = haversineMiles(origin, destination);
  const roadMiles = Math.round(straightMiles * 1.25);
  // Rough highway estimate: ~55 mph average including slowdowns.
  const durationMinutes = Math.round((roadMiles / 55) * 60);
  const path: [number, number][] = [
    [origin.lat, origin.lng],
    [
      (origin.lat + destination.lat) / 2 + (destination.lng - origin.lng) * 0.03,
      (origin.lng + destination.lng) / 2,
    ],
    [destination.lat, destination.lng],
  ];
  return {
    origin,
    destination,
    durationMinutes,
    distanceMiles: roadMiles,
    path,
    isSampleCorridor: false,
  };
}

interface ResolvedRoute {
  route: RouteInfo;
  corridor: ReturnType<typeof findCorridorAnyDirection>;
}

function resolveRoute(
  originInput: string,
  destinationInput: string,
): ResolvedRoute | { error: string } {
  const origin = resolveCity(originInput);
  const destination = resolveCity(destinationInput);
  if (!origin || !destination) {
    return {
      error:
        "Unknown start or destination. Try a city from the suggestions (e.g. Boston, New York, Washington, Los Angeles, San Francisco).",
    };
  }
  if (origin.shortName === destination.shortName) {
    return { error: "Start and destination are the same city." };
  }

  const corridor = findCorridorAnyDirection(origin, destination);
  const route: RouteInfo = corridor
    ? {
        origin,
        destination,
        durationMinutes: corridor.durationMinutes,
        distanceMiles: corridor.distanceMiles,
        path: corridor.path,
        isSampleCorridor: true,
      }
    : buildGenericRoute(origin, destination);
  return { route, corridor };
}

/** Candidates for one query on a resolved route: curated corridor matches,
 *  or the generic fallback when the corridor has none. */
function candidatesForQuery(
  resolved: ResolvedRoute,
  query: string,
  preferredStopMinutes: number | null | undefined,
): StopCandidate[] {
  const { route, corridor } = resolved;
  let candidates: StopCandidate[] = corridor
    ? corridor.stops.filter((s) => matchesQuery(s, query))
    : [];

  if (candidates.length === 0) {
    candidates = genericCandidates(route, query || "Stop", preferredStopMinutes);
  }
  return candidates;
}

export function findStops(input: FindStopsInput): FindStopsResult | { error: string } {
  const resolved = resolveRoute(input.origin, input.destination);
  if ("error" in resolved) return resolved;

  const candidates = candidatesForQuery(resolved, input.query, input.preferredStopMinutes);
  const ranked = rankStops(
    candidates,
    resolved.route.durationMinutes,
    input.preferredStopMinutes,
  );
  return { route: resolved.route, ranked, best: ranked[0] ?? null };
}

/**
 * MULTI-STOP PLANNING — same transparent spirit, still no ML.
 *
 * A and B (origin/destination) are unchanged; up to MAX_STOPS stops are
 * placed in between, processed strictly IN THE ORDER the user listed them
 * (greedy, left to right):
 *
 *  1. For stop i, a candidate is only eligible if it lies further along
 *     the route than the previously chosen stop: its minutesFromStart must
 *     be strictly greater than (previous chosen minutesFromStart +
 *     MIN_STOP_GAP_MINUTES). For the first stop the threshold is 0.
 *  2. Eligible candidates are ranked with the existing scoreStop()
 *     (detour + closeness to THIS stop's preferred time, or detour alone
 *     when unset) and the best one is chosen — unless the caller pinned a
 *     specific candidate via `overrides` (used when the user taps an
 *     alternative; earlier stops stay fixed, later stops are re-planned).
 *  3. If no candidate is eligible for a stop, that stop gets an `error`
 *     entry and is omitted from the route; planning continues with the
 *     following stops from the last successfully chosen stop.
 *
 * Timeline math: arrival at stop i = its minutesFromStart + the detours of
 * all earlier chosen stops. Trip total = base duration + all detours.
 */
export const MAX_STOPS = 4;
export const MIN_STOP_GAP_MINUTES = 10;

export function findMultiStops(
  input: FindMultiStopsInput,
  overrides: Array<string | null> = [],
): MultiStopResult | { error: string } {
  const resolved = resolveRoute(input.origin, input.destination);
  if ("error" in resolved) return resolved;
  const { route } = resolved;

  const requests = input.stops.slice(0, MAX_STOPS);
  if (requests.length === 0) {
    return { error: "Add at least one stop to find." };
  }

  // Pass 1: choose a candidate per stop, in order.
  interface Draft {
    entry: Omit<StopPlanEntry, "chosen" | "alternatives">;
    rankedEligible: RankedStop[];
    chosenRaw: RankedStop | null;
    earlierDetours: number; // detours of chosen stops before this one
  }
  const drafts: Draft[] = [];
  let prevChosenMinutes = 0;
  let earlierDetours = 0;

  requests.forEach((req, i) => {
    const preferred = req.preferredStopMinutes ?? null;
    const threshold = i === 0 ? 0 : prevChosenMinutes + MIN_STOP_GAP_MINUTES;
    const all = candidatesForQuery(resolved, req.query, preferred);
    const eligible = all.filter((s) => s.minutesFromStart > threshold);

    if (eligible.length === 0) {
      drafts.push({
        entry: {
          query: req.query,
          preferredStopMinutes: preferred,
          error: `No ${req.query || "stop"} found after the previous stop on this route — try removing the time preference or reordering`,
        },
        rankedEligible: [],
        chosenRaw: null,
        earlierDetours,
      });
      return; // prevChosenMinutes / earlierDetours unchanged: stop is omitted
    }

    const rankedEligible = rankStops(eligible, route.durationMinutes, preferred);
    const pinned = overrides[i] ? rankedEligible.find((s) => s.id === overrides[i]) : undefined;
    const chosenRaw = pinned ?? rankedEligible[0];
    drafts.push({
      entry: { query: req.query, preferredStopMinutes: preferred },
      rankedEligible,
      chosenRaw,
      earlierDetours,
    });
    prevChosenMinutes = chosenRaw.minutesFromStart;
    earlierDetours += chosenRaw.detourMinutes;
  });

  const totalDetourMinutes = drafts.reduce((sum, d) => sum + (d.chosenRaw?.detourMinutes ?? 0), 0);

  // Pass 2: decorate with cumulative arrivals and swap-in trip totals.
  const stops: StopPlanEntry[] = drafts.map((d) => {
    if (!d.chosenRaw) {
      return { ...d.entry, chosen: null, alternatives: [] };
    }
    const chosenDetour = d.chosenRaw.detourMinutes;
    const decorate = (s: RankedStop): PlannedStop => ({
      ...s,
      arrivalMinutes: s.minutesFromStart + d.earlierDetours,
      totalMinutes: route.durationMinutes + (totalDetourMinutes - chosenDetour) + s.detourMinutes,
    });
    return {
      ...d.entry,
      chosen: decorate(d.chosenRaw),
      alternatives: d.rankedEligible
        .filter((s) => s.id !== d.chosenRaw!.id)
        .slice(0, 3)
        .map(decorate),
    };
  });

  return {
    route,
    stops,
    summary: {
      baseMinutes: route.durationMinutes,
      totalDetourMinutes,
      totalMinutes: route.durationMinutes + totalDetourMinutes,
    },
  };
}
