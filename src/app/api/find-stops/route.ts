import { NextRequest, NextResponse } from "next/server";
import { findMultiStops, findStops } from "@/lib/scoring";
import type { FindStopsInput, StopRequest } from "@/lib/types";

/**
 * GET  /api/find-stops?origin=Boston&destination=Washington&query=McDonald's&preferredStopMinutes=180
 * POST /api/find-stops  { origin, destination, query, preferredStopMinutes }            (single stop, original shape)
 * POST /api/find-stops  { origin, destination, stops: [{ query, preferredStopMinutes }] } (multi-stop, up to 4)
 *   → { route, stops: [{ query, chosen, alternatives, error? }],
 *       summary: { baseMinutes, totalDetourMinutes, totalMinutes } }
 *   An optional `overrides: (string|null)[]` pins a candidate id per stop.
 *
 * Uses the same lib as the page — this route demonstrates the server-side
 * separation a live version needs (the Google Directions/Places calls and
 * their API key would live here, never in the browser).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const preferredRaw = sp.get("preferredStopMinutes");
  return handleSingle({
    origin: sp.get("origin") ?? "",
    destination: sp.get("destination") ?? "",
    query: sp.get("query") ?? "",
    preferredStopMinutes: preferredRaw ? Number(preferredRaw) : null,
  });
}

interface PostBody {
  origin?: string;
  destination?: string;
  query?: string;
  preferredStopMinutes?: number | null;
  stops?: StopRequest[];
  overrides?: Array<string | null>;
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (Array.isArray(body.stops)) {
    const result = findMultiStops(
      {
        origin: body.origin ?? "",
        destination: body.destination ?? "",
        stops: body.stops.map((s) => ({
          query: s?.query ?? "",
          preferredStopMinutes: s?.preferredStopMinutes ?? null,
        })),
      },
      Array.isArray(body.overrides) ? body.overrides : [],
    );
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if ("unsupported" in result) {
      return NextResponse.json({ unsupported: result.unsupported });
    }
    return NextResponse.json(result);
  }

  return handleSingle({
    origin: body.origin ?? "",
    destination: body.destination ?? "",
    query: body.query ?? "",
    preferredStopMinutes: body.preferredStopMinutes ?? null,
  });
}

function handleSingle(input: FindStopsInput) {
  const result = findStops(input);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  if ("unsupported" in result) {
    return NextResponse.json({ unsupported: result.unsupported });
  }
  return NextResponse.json(result);
}
