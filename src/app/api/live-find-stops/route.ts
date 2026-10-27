import { NextRequest, NextResponse } from "next/server";
import { ProviderUnavailableError } from "@/lib/routing";
import { buildLiveResult, isLiveCorridor, planLiveStops } from "@/lib/live/planner";
import type { StopRequest } from "@/lib/types";

/**
 * POST /api/live-find-stops — REAL-data planning (Phase 2C).
 *
 * Currently covers trips between the Northeast corridor cities listed
 * in LIVE_CORRIDOR_CITIES (Boston ↔ Washington, DC and every pair in
 * between). Businesses come from the local verified OSM corridor
 * dataset; routes and detours come from the configured routing
 * provider (see src/lib/routing).
 *
 * Honesty contract: if live data cannot answer, this route returns an
 * error/unsupported response — it NEVER substitutes sample results.
 */
interface PostBody {
  origin?: string;
  destination?: string;
  stops?: StopRequest[];
  overrides?: Array<string | null>;
  /** When true, include planner diagnostics (timings/call counts). */
  debug?: boolean;
}

/**
 * Lightweight per-IP rate limit (Phase 3): protects the routing
 * provider from abuse and cost spikes. In-memory per server process —
 * on serverless hosting each instance keeps its own counter, so treat
 * this as a basic safeguard, not a hard quota.
 */
const RATE_LIMIT_PER_MINUTE = 30;
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.windowStart >= 60_000) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Lots of searches right now — please wait a moment and try again." },
      { status: 429 },
    );
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const origin = body.origin ?? "";
  const destination = body.destination ?? "";
  if (!isLiveCorridor(origin, destination)) {
    return NextResponse.json(
      {
        error:
          "This route isn't in the beta coverage area yet. Live data covers the Northeast region — Bangor, ME to Washington, DC, and Buffalo/Pittsburgh across to Boston — including the major cities and towns in between.",
      },
      { status: 400 },
    );
  }

  const stops = (Array.isArray(body.stops) ? body.stops : []).map((s) => ({
    query: s?.query ?? "",
    preferredStopMinutes: s?.preferredStopMinutes ?? null,
  }));
  if (stops.length === 0) {
    return NextResponse.json({ error: "Add at least one stop to find." }, { status: 400 });
  }

  try {
    const data = await planLiveStops({
      origin,
      destination,
      stops,
      overrides: Array.isArray(body.overrides) ? body.overrides : [],
    });
    const plan = buildLiveResult(data, stops, Array.isArray(body.overrides) ? body.overrides : []);
    return NextResponse.json({
      mode: "live",
      provider: data.provider,
      route: data.route,
      candidatesByStop: data.candidatesByStop,
      stopMessages: data.stopMessages,
      plan,
      ...(body.debug ? { diagnostics: data.diagnostics } : {}),
    });
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      return NextResponse.json(
        {
          error: `Live routing is unavailable: ${err.message} Sample results are not shown in place of live ones — check the connection or try again shortly.`,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Live planning failed unexpectedly. No results were generated." },
      { status: 500 },
    );
  }
}
