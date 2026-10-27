import {
  ProviderUnavailableError,
  type LatLng,
  type RouteResult,
  type RoutingProvider,
} from "./types";

/**
 * openrouteservice provider (HeiGIT) — same interface as Valhalla.
 *
 * STATUS (Phase 2C): implemented against the documented ORS Directions
 * API, but NOT live-tested: ORS requires a personal API key (free
 * Standard account) and none is configured. Without ORS_API_KEY this
 * provider reports itself unavailable instead of failing silently.
 * Keys belong to one person (HeiGIT ToS) and must stay server-side —
 * this provider is only ever called from API routes, never the browser.
 *
 * Free Standard limits (documented): Directions 2,000/day (40/min),
 * Matrix 500/day. See the Phase 2A/2B reports for the commercial-use
 * analysis; confirming Standard-plan terms for commercial launch is a
 * pre-launch checklist item.
 */

const ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
const REQUEST_TIMEOUT_MS = 25_000;

interface OrsResponse {
  features?: Array<{
    properties: {
      summary: { duration: number; distance: number };
      segments?: Array<{
        duration: number;
        steps?: Array<{ way_points?: [number, number] }>;
      }>;
    };
    geometry: { coordinates: [number, number][] };
  }>;
}

export class OpenRouteServiceProvider implements RoutingProvider {
  readonly id = "openrouteservice";
  readonly label = "openrouteservice (hosted)";
  private readonly apiKey: string | null;

  constructor(apiKey: string | undefined = process.env.ORS_API_KEY) {
    this.apiKey = apiKey?.trim() ? apiKey.trim() : null;
  }

  get configured(): boolean {
    return this.apiKey !== null;
  }

  async route(locations: LatLng[]): Promise<RouteResult> {
    if (!this.apiKey) {
      throw new ProviderUnavailableError(
        "openrouteservice needs an API key. Create a free Standard account at openrouteservice.org, " +
          "generate a key, and set ORS_API_KEY in the server environment (never in the browser).",
      );
    }
    if (locations.length < 2) {
      throw new ProviderUnavailableError("openrouteservice needs at least two locations to route.");
    }

    let data: OrsResponse;
    try {
      const res = await fetch(ORS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.apiKey,
        },
        body: JSON.stringify({
          coordinates: locations.map((l) => [l.lng, l.lat]),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new ProviderUnavailableError(
          `openrouteservice routing failed (HTTP ${res.status}). Check the key and daily quota.`,
        );
      }
      data = (await res.json()) as OrsResponse;
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError("openrouteservice is unreachable right now.");
    }

    const feature = data.features?.[0];
    if (!feature) {
      throw new ProviderUnavailableError("openrouteservice returned no route for this trip.");
    }

    const path = feature.geometry.coordinates.map(
      ([lng, lat]) => [lat, lng] as [number, number],
    );
    const segments = feature.properties.segments ?? [];
    const legDurationsMinutes = segments.map((s) => s.duration / 60);

    // Cumulative minutes per vertex: distribute each leg's duration over
    // its geometry span (legs are delimited by step way_points ranges).
    const cumulativeMinutes = new Array<number>(path.length).fill(0);
    let elapsed = 0;
    let cursor = 0;
    segments.forEach((seg, si) => {
      const steps = seg.steps ?? [];
      const endIdx =
        si === segments.length - 1
          ? path.length - 1
          : (steps[steps.length - 1]?.way_points?.[1] ?? cursor);
      for (let i = cursor; i <= endIdx && i < path.length; i++) {
        cumulativeMinutes[i] =
          endIdx === cursor ? elapsed : elapsed + ((i - cursor) / (endIdx - cursor)) * (seg.duration / 60);
      }
      elapsed += seg.duration / 60;
      cursor = endIdx;
    });
    for (let i = 1; i < cumulativeMinutes.length; i++) {
      if (cumulativeMinutes[i] === 0) cumulativeMinutes[i] = cumulativeMinutes[i - 1];
    }

    return {
      durationMinutes: feature.properties.summary.duration / 60,
      distanceMiles: feature.properties.summary.distance / 1609.344,
      path,
      cumulativeMinutes,
      legDurationsMinutes,
    };
  }
}
