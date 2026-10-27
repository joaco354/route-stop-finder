import { MIN_STOP_GAP_MINUTES, scoreStop } from "../scoring";
import type {
  MultiStopResult,
  PlannedStop,
  RouteInfo,
  StopRequest,
} from "../types";

/**
 * Shared plan derivation (Phase 2C): given EVALUATED live candidates per
 * stop (each already carries a real arrival time, detour and trip total
 * from an actual routing call), choose the plan for the CURRENT slider
 * positions and pins.
 *
 * This runs on the server when a plan is first built, and again in the
 * browser whenever a slider moves — re-ranking is pure arithmetic over
 * cached candidates, so slider changes need no external API calls.
 *
 * Note: a candidate's arrival/detour were computed against the chain of
 * stops chosen when it was evaluated. Re-ranking can therefore be
 * slightly approximate for later stops in multi-stop trips; pinning an
 * alternative triggers a full server re-plan, which is exact.
 */
export interface EvaluatedStopData {
  route: RouteInfo;
  candidatesByStop: PlannedStop[][];
}

export function derivePlan(
  data: EvaluatedStopData,
  requests: StopRequest[],
  overrides: Array<string | null> = [],
): MultiStopResult {
  const { route } = data;
  let prevArrival = 0;

  const stops = requests.map((req, i) => {
    const preferred = req.preferredStopMinutes ?? null;
    const all = data.candidatesByStop[i] ?? [];
    if (all.length === 0) {
      return {
        query: req.query,
        preferredStopMinutes: preferred,
        chosen: null,
        alternatives: [],
        error: `No ${req.query || "stop"} found after the previous stop on this route`,
      };
    }
    const eligible = all.filter(
      (c) => i === 0 || c.arrivalMinutes > prevArrival + MIN_STOP_GAP_MINUTES,
    );
    const pool = eligible.length > 0 ? eligible : all;
    const rescored = pool
      .map((c) => ({ ...c, score: scoreStop(c, preferred) }))
      .sort((a, b) => a.score - b.score || a.detourMinutes - b.detourMinutes);
    const pinned = overrides[i] ? rescored.find((c) => c.id === overrides[i]) : undefined;
    const chosen = pinned ?? rescored[0];
    prevArrival = chosen.arrivalMinutes;
    return {
      query: req.query,
      preferredStopMinutes: preferred,
      chosen,
      alternatives: rescored.filter((c) => c.id !== chosen.id).slice(0, 3),
    };
  });

  const totalDetourMinutes = stops.reduce(
    (sum, s) => sum + (s.chosen?.detourMinutes ?? 0),
    0,
  );
  return {
    route,
    stops,
    summary: {
      baseMinutes: route.durationMinutes,
      totalDetourMinutes: Math.round(totalDetourMinutes),
      totalMinutes: route.durationMinutes + Math.round(totalDetourMinutes),
    },
  };
}
