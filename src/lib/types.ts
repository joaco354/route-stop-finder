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
  | "coffee"
  | "gas"
  | "pharmacy"
  | "hotel"
  | "grocery"
  | "other";

export interface StopCandidate {
  id: string;
  name: string;
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
