import { NextRequest, NextResponse } from "next/server";
import { findStops } from "@/lib/scoring";
import type { FindStopsInput } from "@/lib/types";

/**
 * GET /api/find-stops?origin=Boston&destination=Washington&query=McDonald's&preferredStopMinutes=180
 * POST /api/find-stops  { origin, destination, query, preferredStopMinutes }
 *
 * Uses the same lib as the page — this route demonstrates the server-side
 * separation a live version needs (the Google Directions/Places calls and
 * their API key would live here, never in the browser).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const preferredRaw = sp.get("preferredStopMinutes");
  return handle({
    origin: sp.get("origin") ?? "",
    destination: sp.get("destination") ?? "",
    query: sp.get("query") ?? "",
    preferredStopMinutes: preferredRaw ? Number(preferredRaw) : null,
  });
}

export async function POST(req: NextRequest) {
  let body: Partial<FindStopsInput>;
  try {
    body = (await req.json()) as Partial<FindStopsInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  return handle({
    origin: body.origin ?? "",
    destination: body.destination ?? "",
    query: body.query ?? "",
    preferredStopMinutes: body.preferredStopMinutes ?? null,
  });
}

function handle(input: FindStopsInput) {
  const result = findStops(input);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
