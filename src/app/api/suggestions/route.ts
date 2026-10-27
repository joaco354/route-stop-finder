import suggestions from "@/lib/live/suggestions.json";

/**
 * Autocomplete index for the stop search box: every brand in the live
 * dataset (with location counts) + the searchable category labels.
 * Generated alongside the dataset by scripts/generate-businesses.py.
 * Static per deployment — cache it hard.
 */
export async function GET() {
  return Response.json(suggestions, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
