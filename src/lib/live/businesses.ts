/**
 * VERIFIED CORRIDOR BUSINESS DATASET — Boston ↔ Washington, DC.
 *
 * Built from real OpenStreetMap data (© OpenStreetMap contributors,
 * ODbL) with build-time Overpass queries along the route corridor —
 * the app never queries Overpass at runtime. The data itself lives in
 * businesses.json (generated); this module is the typed loader.
 *
 * Categories (assigned from OSM tags, never curated by brand):
 * fast_food, restaurant, coffee, gas, ev_charging, pharmacy, grocery,
 * convenience, hotel, rest_area.
 *
 * Refresh: scripts/build-corridor-dataset.py then
 * scripts/generate-businesses.py (see README "Refreshing the
 * business dataset"). Every entry is a real OSM feature
 * (osmType/osmId kept for audit); addresses come only from OSM
 * addr:* tags and may be "" — never invented.
 */

import type { StopCategory } from "../types";
import rawBusinesses from "./businesses.json";

export interface LiveBusiness {
  id: string;
  name: string;
  brand: string;
  category: StopCategory;
  /** Street address when OSM has one; may be "" — never invented. */
  address: string;
  lat: number;
  lng: number;
  osmType: string;
  osmId: number;
}

export const BUSINESS_SOURCE = "© OpenStreetMap contributors (ODbL)";

export const CORRIDOR_BUSINESSES: LiveBusiness[] =
  rawBusinesses as LiveBusiness[];
