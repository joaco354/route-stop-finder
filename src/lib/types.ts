export interface City {
  /** Display label, e.g. "Boston, MA" */
  name: string;
  /** Short city name used for matching, e.g. "Boston" */
  shortName: string;
  lat: number;
  lng: number;
}

export type StopCategory =
  | "restaurant"
  | "fast_food"
  | "coffee"
  | "gas"
  | "ev_charging"
  | "pharmacy"
  | "hotel"
  | "grocery"
  | "convenience"
  | "rest_area"
  | "other";

export interface StopCandidate {
  id: string;
  name: string;
  /** Chain/brand the business belongs to ("" or absent for independents). */
  brand?: string;
  address: string;
  category: StopCategory;
  lat: number;
  lng: number;
  /** Estimated driving minutes from the trip origin to this stop (on the base route). */
  minutesFromStart: number;
  /** Extra driving minutes added by visiting this stop vs. the direct route. */
  detourMinutes: number;
  /** Terms (lowercase) that make this stop match a free-text query. */
  matchTerms: string[];
}

export interface RouteInfo {
  origin: City;
  destination: City;
  /** Base (direct) driving time in minutes, with no stop. */
  durationMinutes: number;
  distanceMiles: number;
  /** Polyline for the direct route: [lat, lng] pairs. */
  path: [number, number][];
  /** True when this route came from the curated sample corridors. */
  isSampleCorridor: boolean;
}

export interface RankedStop extends StopCandidate {
  /** Total trip time if you visit this stop. */
  totalMinutes: number;
  /** Transparent ranking score — lower is better. See scoring.ts. */
  score: number;
}

export interface FindStopsResult {
  route: RouteInfo;
  /** All matching candidates, best first. */
  ranked: RankedStop[];
  best: RankedStop | null;
}

export interface FindStopsInput {
  origin: string;
  destination: string;
  query: string;
  /** Optional preferred stop time, in minutes from the start. Null = no preference. */
  preferredStopMinutes?: number | null;
}

/** One requested stop in a multi-stop trip (A → stops… → B). */
export interface StopRequest {
  query: string;
  /** Optional preferred time for THIS stop, in minutes from the start. */
  preferredStopMinutes?: number | null;
}

/**
 * A candidate/chosen stop within a multi-stop plan.
 * `arrivalMinutes` = driving time from A until you reach this stop,
 * including the detours of all earlier CHOSEN stops.
 * `totalMinutes` = the full trip total if this candidate is used for its
 * stop (all other chosen stops unchanged).
 */
export interface PlannedStop extends RankedStop {
  arrivalMinutes: number;
}

export interface StopPlanEntry {
  query: string;
  preferredStopMinutes: number | null;
  /** The picked stop, or null when no candidate exists after the previous stop. */
  chosen: PlannedStop | null;
  /** Up to 3 other eligible candidates for this stop, best first. */
  alternatives: PlannedStop[];
  /** Set when the stop could not be placed; the stop is omitted from the route. */
  error?: string;
}

export interface MultiStopSummary {
  baseMinutes: number;
  totalDetourMinutes: number;
  totalMinutes: number;
}

export interface MultiStopResult {
  route: RouteInfo;
  stops: StopPlanEntry[];
  summary: MultiStopSummary;
}

export interface FindMultiStopsInput {
  origin: string;
  destination: string;
  /** 1–4 stops, visited in the order listed. */
  stops: StopRequest[];
}
