import { resolveCity } from "./cities";
import { findCorridorAnyDirection } from "./sampleData";
import type {
  FindMultiStopsInput,
  FindStopsInput,
  FindStopsResult,
  MultiStopResult,
  PlannedStop,
  RankedStop,
  RouteInfo,
  StopCandidate,
  StopCategory,
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

/**
 * SEARCH MATCHING — brand-exact first, then category, then name.
 *
 * 1. If the query names a known BRAND (McDonald's, Walgreens, Shell, …),
 *    ONLY that brand's locations match. A brand search must never return a
 *    competing brand: searching "Walgreens" returns Walgreens only, never CVS.
 * 2. Else, if the query is a general CATEGORY ("gas station", "hotel",
 *    "pharmacy", …), every business in that category matches — multiple
 *    brands included, as expected for a category search.
 * 3. Else, fall back to a plain name search (e.g. a specific business name).
 *
 * No match means the business isn't in the sample data — callers surface a
 * friendly "live search coming soon" message instead of invented results.
 */
const BRAND_ALIASES: Record<string, string> = {
  "mcdonald's": "mcdonald's",
  mcdonalds: "mcdonald's",
  mcdonald: "mcdonald's",
  starbucks: "starbucks",
  dunkin: "dunkin'",
  "dunkin'": "dunkin'",
  shell: "shell",
  bp: "bp",
  cvs: "cvs",
  walgreens: "walgreens",
  marriott: "marriott",
  hilton: "hilton",
  omni: "omni",
  "stop & shop": "stop & shop",
  "stop and shop": "stop & shop",
  shoprite: "shoprite",
  ralphs: "ralphs",
};

const KNOWN_BRANDS: string[] = [...new Set(Object.values(BRAND_ALIASES))];

/** The brand a stop belongs to, derived from its business name
 *  ("CVS Pharmacy — Stamford" → "cvs", "Stamford Marriott Hotel" → "marriott").
 *  Null for independent businesses that carry no known brand. */
function brandKeyOf(stop: StopCandidate): string | null {
  const segment = (stop.name.split("—")[0] ?? stop.name).trim().toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    if (segment.includes(brand)) return brand;
  }
  return null;
}

const CATEGORY_TERMS: Record<string, StopCategory> = {
  gas: "gas",
  "gas station": "gas",
  "gas stations": "gas",
  fuel: "gas",
  petrol: "gas",
  coffee: "coffee",
  "coffee shop": "coffee",
  "coffee shops": "coffee",
  cafe: "coffee",
  espresso: "coffee",
  restaurant: "restaurant",
  restaurants: "restaurant",
  food: "restaurant",
  "fast food": "restaurant",
  burger: "restaurant",
  burgers: "restaurant",
  pharmacy: "pharmacy",
  pharmacies: "pharmacy",
  drugstore: "pharmacy",
  "drug store": "pharmacy",
  hotel: "hotel",
  hotels: "hotel",
  motel: "hotel",
  motels: "hotel",
  lodging: "hotel",
  grocery: "grocery",
  groceries: "grocery",
  "grocery store": "grocery",
  "grocery stores": "grocery",
  supermarket: "grocery",
  supermarkets: "grocery",
  market: "grocery",
};

export function matchStops(stops: StopCandidate[], rawQuery: string): StopCandidate[] {
  const q = rawQuery.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return stops;

  const brand = BRAND_ALIASES[q];
  if (brand) return stops.filter((s) => brandKeyOf(s) === brand);

  const category = CATEGORY_TERMS[q];
  if (category) return stops.filter((s) => s.category === category);

  return stops.filter((s) => s.name.toLowerCase().includes(q));
}

/** Friendly message when a route or business isn't in the sample data yet.
 *  We never invent businesses, addresses, or detour times. */
export const UNSUPPORTED_ROUTE_MESSAGE =
  "That route isn't covered by our sample data yet — live search is coming soon, so we can't suggest stops for it just yet.";

export function unsupportedBusinessMessage(query: string): string {
  const label = query.trim() || "that stop";
  return `We don't have any “${label}” in our sample data along this route yet — live search is coming soon.`;
}

interface ResolvedRoute {
  route: RouteInfo;
  corridor: NonNullable<ReturnType<typeof findCorridorAnyDirection>>;
}

function resolveRoute(
  originInput: string,
  destinationInput: string,
): ResolvedRoute | { error: string } | { unsupported: string } {
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
  if (!corridor) {
    // No curated sample corridor for this route. Previously the app invented
    // a straight-line route with fictional stops — that behavior is removed:
    // unsupported routes get an honest "coming soon" message instead.
    return { unsupported: UNSUPPORTED_ROUTE_MESSAGE };
  }
  return {
    route: {
      origin,
      destination,
      durationMinutes: corridor.durationMinutes,
      distanceMiles: corridor.distanceMiles,
      path: corridor.path,
      isSampleCorridor: true,
    },
    corridor,
  };
}

/** Candidates for one query on a resolved route: curated corridor matches
 *  only. An empty result means the business isn't supported by the sample
 *  data — there is deliberately NO generic/fictional fallback. */
function candidatesForQuery(resolved: ResolvedRoute, query: string): StopCandidate[] {
  return matchStops(resolved.corridor.stops, query);
}

export function findStops(
  input: FindStopsInput,
): FindStopsResult | { error: string } | { unsupported: string } {
  const resolved = resolveRoute(input.origin, input.destination);
  if ("error" in resolved) return resolved;
  if ("unsupported" in resolved) return resolved;

  const candidates = candidatesForQuery(resolved, input.query);
  if (candidates.length === 0) {
    return { unsupported: unsupportedBusinessMessage(input.query) };
  }
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
): MultiStopResult | { error: string } | { unsupported: string } {
  const resolved = resolveRoute(input.origin, input.destination);
  if ("error" in resolved) return resolved;
  if ("unsupported" in resolved) return resolved;
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
    const all = candidatesForQuery(resolved, req.query);

    if (all.length === 0) {
      // Business not in the sample data for this route — friendly notice,
      // never an invented location.
      drafts.push({
        entry: {
          query: req.query,
          preferredStopMinutes: preferred,
          error: unsupportedBusinessMessage(req.query),
        },
        rankedEligible: [],
        chosenRaw: null,
        earlierDetours,
      });
      return;
    }

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
