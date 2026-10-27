import { OpenRouteServiceProvider } from "./ors";
import type { RoutingProvider } from "./types";
import { ValhallaProvider } from "./valhalla";

export * from "./types";
export { ValhallaProvider } from "./valhalla";
export { OpenRouteServiceProvider } from "./ors";

/**
 * Pick the routing provider from the server environment.
 *
 * ROUTING_PROVIDER=valhalla (default) — keyless public demo server for
 * development, or a self-hosted Valhalla when VALHALLA_BASE_URL is set.
 * ROUTING_PROVIDER=openrouteservice — hosted ORS; requires ORS_API_KEY.
 */
export function getRoutingProvider(): RoutingProvider {
  const choice = (process.env.ROUTING_PROVIDER ?? "valhalla").trim().toLowerCase();
  if (choice === "openrouteservice" || choice === "ors") {
    return new OpenRouteServiceProvider();
  }
  return new ValhallaProvider();
}
