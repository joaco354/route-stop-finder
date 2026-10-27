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

/**
 * Search normalization — punctuation- and spacing-insensitive so common
 * spellings converge: "Chick-fil-A" = "chikfila" = "chick fil a",
 * "Dunkin'" = "dunkin donuts" prefix-wise, "Joe's Diner" = "joes diner".
 * Deliberately simple: lowercase, drop apostrophes, turn every other
 * punctuation run into nothing, collapse spaces.
 */
export function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Compact form (spaces removed) for brand comparisons: "taco bell" → "tacobell". */
function compactOf(s: string): string {
  return s.replace(/\s+/g, "");
}

interface NormalizedStop {
  brand: string;
  name: string;
}
const normalizedCache = new WeakMap<StopCandidate, NormalizedStop>();

function normalizedOf(stop: StopCandidate): NormalizedStop {
  let hit = normalizedCache.get(stop);
  if (!hit) {
    const rawBrand = stop.brand?.trim() ? stop.brand : brandKeyOf(stop) ?? "";
    hit = {
      brand: compactOf(normalizeSearchText(rawBrand)),
      name: compactOf(normalizeSearchText(stop.name)),
    };
    normalizedCache.set(stop, hit);
  }
  return hit;
}

/**
 * Data-driven brand match: if the query names a brand that actually
 * exists among the candidates (exact normalized brand, a business whose
 * name IS the query, or a unique brand the query unambiguously
 * prefixes/extends), return only that brand's locations. This is what
 * lets any chain in the dataset be found without a curated alias list —
 * while still never mixing in a competing brand.
 */
function findBrandMatches(
  stops: StopCandidate[],
  qCompact: string,
): StopCandidate[] | null {
  if (!qCompact) return null;
  const exact = stops.filter((s) => {
    const n = normalizedOf(s);
    return (n.brand !== "" && n.brand === qCompact) || n.name === qCompact;
  });
  if (exact.length > 0) return exact;

  if (qCompact.length >= 4) {
    const brands = new Set<string>();
    for (const s of stops) {
      const b = normalizedOf(s).brand;
      if (b) brands.add(b);
    }
    const byBrand = (brand: string) =>
      stops.filter((s) => {
        const n = normalizedOf(s);
        return n.brand === brand || n.name === brand;
      });
    const related = [...brands].filter(
      (b) => b.startsWith(qCompact) || qCompact.startsWith(b),
    );
    if (related.length === 1) return byBrand(related[0]);

    // One typo away from exactly one brand ("chikfila" → Chick-fil-A).
    // Deliberately capped at a single edit — this is a spelling nudge,
    // not a fuzzy search engine.
    if (qCompact.length >= 6) {
      const near = [...brands].filter(
        (b) => Math.abs(b.length - qCompact.length) <= 1 && withinOneEdit(b, qCompact),
      );
      if (near.length === 1) return byBrand(near[0]);
    }
  }
  return null;
}

/** Levenshtein distance ≤ 1 (one substitution, insertion, or deletion). */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
    } else {
      edits++;
      if (edits > 1) return false;
      if (shorter.length === longer.length) i++;
      j++;
    }
  }
  return edits + (longer.length - j) <= 1;
}

/**
 * Category terms map a general query to the dataset categories it
 * covers. "restaurant" is deliberately broad — travelers asking for a
 * restaurant mean places to eat, so it includes fast food. Narrower
 * terms ("fast food", "cafe") map to just their category.
 */
const CATEGORY_TERMS: Record<string, StopCategory[]> = {
  gas: ["gas"],
  "gas station": ["gas"],
  "gas stations": ["gas"],
  fuel: ["gas"],
  petrol: ["gas"],
  coffee: ["coffee"],
  "coffee shop": ["coffee"],
  "coffee shops": ["coffee"],
  cafe: ["coffee"],
  espresso: ["coffee"],
  restaurant: ["restaurant", "fast_food"],
  restaurants: ["restaurant", "fast_food"],
  diner: ["restaurant", "fast_food"],
  diners: ["restaurant", "fast_food"],
  food: ["restaurant", "fast_food"],
  "fast food": ["fast_food"],
  burger: ["fast_food", "restaurant"],
  burgers: ["fast_food", "restaurant"],
  pharmacy: ["pharmacy"],
  pharmacies: ["pharmacy"],
  drugstore: ["pharmacy"],
  "drug store": ["pharmacy"],
  hotel: ["hotel"],
  hotels: ["hotel"],
  motel: ["hotel"],
  motels: ["hotel"],
  lodging: ["hotel"],
  grocery: ["grocery"],
  groceries: ["grocery"],
  "grocery store": ["grocery"],
  "grocery stores": ["grocery"],
  supermarket: ["grocery"],
  supermarkets: ["grocery"],
  market: ["grocery"],
  "convenience store": ["convenience"],
  "convenience stores": ["convenience"],
  "ev charging": ["ev_charging"],
  "ev charging station": ["ev_charging"],
  "ev charger": ["ev_charging"],
  "charging station": ["ev_charging"],
  charging: ["ev_charging"],
  "rest area": ["rest_area"],
  "rest areas": ["rest_area"],
  "rest stop": ["rest_area"],
  "rest stops": ["rest_area"],
};

export function matchStops(stops: StopCandidate[], rawQuery: string): StopCandidate[] {
  const q = rawQuery.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return stops;

  // 1a. Curated brand aliases (sample-data brands and common spellings).
  const aliasBrand = BRAND_ALIASES[q];
  if (aliasBrand) {
    const byAlias = stops.filter((s) => brandKeyOf(s) === aliasBrand);
    if (byAlias.length > 0) return byAlias;
    // Fall through to the data-driven pass when the alias names a brand
    // the candidate set carries only in its data (live dataset brands).
  }

  // 2. Category terms (possibly several dataset categories). Category
  //    intent wins over brand/name coincidences: "hotel" must return
  //    every hotel, not the one business literally named "Hotel".
  const categories = CATEGORY_TERMS[q] ?? CATEGORY_TERMS[normalizeSearchText(q)];
  if (categories) {
    const set = new Set(categories);
    return stops.filter((s) => set.has(s.category));
  }

  // 1b. Data-driven brand match against the candidates themselves.
  const qNormalized = normalizeSearchText(q);
  const brandMatches = findBrandMatches(stops, compactOf(qNormalized));
  if (brandMatches) return brandMatches;

  // 3. Name search — normalized substring ("joes diner" finds "Joe's Diner").
  const qName = compactOf(qNormalized);
  return stops.filter((s) => normalizedOf(s).name.includes(qName));
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
