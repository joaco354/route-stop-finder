/**
 * REGIONAL BUSINESS DATASET — the Northeast (Buffalo → Pittsburgh →
 * Washington, DC → I-95 → Boston → Bangor → Burlington loop, plus the
 * interior interstate network).
 *
 * Built from real OpenStreetMap data (© OpenStreetMap contributors,
 * ODbL) by extracting every business within ~5 km of the regional
 * highway line network from the Geofabrik US-Northeast PBF — the app
 * never queries Overpass at runtime. The data itself lives in
 * businesses.json (generated); this module is the typed loader.
 *
 * Categories (assigned from OSM tags, never curated by brand):
 * fast_food, restaurant, coffee, gas, ev_charging, pharmacy, grocery,
 * convenience, hotel, rest_area.
 *
 * Refresh: scripts/build-region-dataset.py then
 * scripts/generate-businesses.py (see README "Refreshing the
 * business dataset"). Every entry is a real OSM feature
 * (osmType/osmId kept for audit); addresses come only from OSM
 * addr:* tags, with the town filled in from the nearest US Census
 * place when OSM has none — street addresses are never invented.
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
