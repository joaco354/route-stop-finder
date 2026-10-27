import {
  cumulativeFromManeuvers,
  decodePolyline,
  ProviderUnavailableError,
  type LatLng,
  type RouteResult,
  type RoutingProvider,
} from "./types";

/**
 * Valhalla provider (open-source routing engine, OSM data).
 *
 * Default base URL is the public demo server run for testing
 * (valhalla1.openstreetmap.de). It needs NO API key, which is why it is
 * the Phase 2C development provider. It is a shared demo instance — no
 * SLA, fair use only — and is NOT a production backend. Point
 * VALHALLA_BASE_URL at a self-hosted Valhalla (Phase 2B recommendation)
 * for real traffic; nothing else changes.
 */

const DEFAULT_BASE_URL = "https://valhalla1.openstreetmap.de";
const REQUEST_TIMEOUT_MS = 25_000;

interface ValhallaLeg {
  summary: { time: number; length: number };
  shape: string;
  maneuvers: Array<{
    time: number;
    begin_shape_index: number;
    end_shape_index: number;
  }>;
}

interface ValhallaTrip {
  summary: { time: number; length: number };
  legs: ValhallaLeg[];
}

export class ValhallaProvider implements RoutingProvider {
  readonly id = "valhalla";
  readonly label: string;
  private readonly baseUrl: string;

  constructor(baseUrl: string = process.env.VALHALLA_BASE_URL ?? DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.label =
      this.baseUrl === DEFAULT_BASE_URL
        ? "Valhalla (public demo server)"
        : "Valhalla (self-hosted)";
  }

  async route(locations: LatLng[]): Promise<RouteResult> {
    if (locations.length < 2) {
      throw new ProviderUnavailableError("Valhalla needs at least two locations to route.");
    }
    let trip: ValhallaTrip;
    try {
      const res = await fetch(`${this.baseUrl}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locations: locations.map((l) => ({ lat: l.lat, lon: l.lng })),
          costing: "auto",
          units: "miles",
          shape_format: "polyline6",
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new ProviderUnavailableError(
          `Valhalla routing failed (HTTP ${res.status}). The demo server may be busy — try again shortly.`,
        );
      }
      const json = (await res.json()) as { trip?: ValhallaTrip; error?: string };
      if (!json.trip) {
        throw new ProviderUnavailableError(
          `Valhalla could not route this trip${json.error ? `: ${json.error}` : ""}.`,
        );
      }
      trip = json.trip;
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError(
        "Valhalla routing is unreachable right now. Check the connection and try again.",
      );
    }

    // Merge per-leg shapes into one path (legs share the joint vertex).
    const path: [number, number][] = [];
    const maneuvers: Array<{ beginShapeIndex: number; endShapeIndex: number; minutes: number }> = [];
    const legDurationsMinutes: number[] = [];
    for (const leg of trip.legs) {
      const legPath = decodePolyline(leg.shape, 6);
      const offset = path.length === 0 ? 0 : path.length - 1;
      legPath.forEach((p, i) => {
        if (i === 0 && path.length > 0) return; // shared joint vertex
        path.push(p);
      });
      for (const m of leg.maneuvers) {
        maneuvers.push({
          beginShapeIndex: offset + m.begin_shape_index,
          endShapeIndex: offset + m.end_shape_index,
          minutes: m.time / 60,
        });
      }
      legDurationsMinutes.push(leg.summary.time / 60);
    }

    return {
      durationMinutes: trip.summary.time / 60,
      distanceMiles: trip.summary.length,
      path,
      cumulativeMinutes: cumulativeFromManeuvers(path, maneuvers),
      legDurationsMinutes,
    };
  }
}
