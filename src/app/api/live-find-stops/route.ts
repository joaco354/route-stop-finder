import { NextRequest, NextResponse } from "next/server";
import { ProviderUnavailableError } from "@/lib/routing";
import { buildLiveResult, isLiveCorridor, planLiveStops } from "@/lib/live/planner";
import type { StopRequest } from "@/lib/types";

/**
 * POST /api/live-find-stops — REAL-data planning (Phase 2C).
 *
 * Currently covers Boston ↔ Washington, DC only. Businesses come from
 * the local verified OSM corridor dataset; routes and detours come from
 * the configured routing provider (see src/lib/routing).
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

export async function POST(req: NextRequest) {
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
          "Live data currently covers Boston ↔ Washington, DC only. Other routes still use sample data.",
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
