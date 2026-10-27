import type { City, StopCandidate } from "./types";

/**
 * SAMPLE DATA — realistic, hand-curated candidates for the prototype.
 * Addresses/times are plausible samples along each corridor, not live data.
 * A production version replaces this file's corridors with results from the
 * Google Directions + Places APIs (see googleMaps.ts integration points).
 */

export interface SampleCorridor {
  originShortName: string;
  destinationShortName: string;
  durationMinutes: number;
  distanceMiles: number;
  path: [number, number][];
  stops: StopCandidate[];
}

const bostonToDC: SampleCorridor = {
  originShortName: "Boston",
  destinationShortName: "Washington",
  durationMinutes: 432, // 7h 12m direct
  distanceMiles: 440,
  path: [
    [42.3601, -71.0589], [41.824, -71.4128], [41.354, -71.966], [41.3083, -72.9279],
    [41.0534, -73.5387], [40.7128, -74.006], [40.7357, -74.1724], [39.9526, -75.1652],
    [39.2904, -76.6122], [38.9072, -77.0369],
  ],
  stops: [
    // --- McDonald's (verified prototype example: Stamford wins at ~3h) ---
    { id: "bosdc-mcd-mystic", name: "McDonald's — Mystic", address: "Sample: 240 Greenmanville Ave, Mystic, CT", category: "restaurant", lat: 41.354, lng: -71.966, minutesFromStart: 110, detourMinutes: 5, matchTerms: ["mcdonald's", "mcdonalds", "mcdonald", "restaurant", "food", "burger", "fast food"] },
    { id: "bosdc-mcd-newhaven", name: "McDonald's — New Haven", address: "Sample: 250 Sargent Dr, New Haven, CT", category: "restaurant", lat: 41.3083, lng: -72.9279, minutesFromStart: 155, detourMinutes: 4, matchTerms: ["mcdonald's", "mcdonalds", "mcdonald", "restaurant", "food", "burger", "fast food"] },
    { id: "bosdc-mcd-stamford", name: "McDonald's — Stamford", address: "Sample: 25 Harbor Point Rd, Stamford, CT", category: "restaurant", lat: 41.0534, lng: -73.5387, minutesFromStart: 203, detourMinutes: 3, matchTerms: ["mcdonald's", "mcdonalds", "mcdonald", "restaurant", "food", "burger", "fast food"] },
    { id: "bosdc-mcd-newark", name: "McDonald's — Newark", address: "Sample: 1040 Broad St, Newark, NJ", category: "restaurant", lat: 40.7357, lng: -74.1724, minutesFromStart: 275, detourMinutes: 7, matchTerms: ["mcdonald's", "mcdonalds", "mcdonald", "restaurant", "food", "burger", "fast food"] },
    // --- Starbucks / coffee ---
    { id: "bosdc-sbux-providence", name: "Starbucks — Providence", address: "Sample: 1 Exchange Ter, Providence, RI", category: "coffee", lat: 41.824, lng: -71.4128, minutesFromStart: 62, detourMinutes: 4, matchTerms: ["starbucks", "coffee", "cafe", "espresso"] },
    { id: "bosdc-sbux-newhaven", name: "Starbucks — New Haven", address: "Sample: 1060 Chapel St, New Haven, CT", category: "coffee", lat: 41.3083, lng: -72.88, minutesFromStart: 158, detourMinutes: 5, matchTerms: ["starbucks", "coffee", "cafe", "espresso"] },
    { id: "bosdc-dunkin-stamford", name: "Dunkin' — Stamford", address: "Sample: 900 E Main St, Stamford, CT", category: "coffee", lat: 41.06, lng: -73.52, minutesFromStart: 205, detourMinutes: 4, matchTerms: ["dunkin", "dunkin'", "coffee", "cafe", "donuts"] },
    { id: "bosdc-sbux-baltimore", name: "Starbucks — Baltimore", address: "Sample: 300 E Pratt St, Baltimore, MD", category: "coffee", lat: 39.2904, lng: -76.6122, minutesFromStart: 375, detourMinutes: 6, matchTerms: ["starbucks", "coffee", "cafe", "espresso"] },
    // --- Gas ---
    { id: "bosdc-shell-mystic", name: "Shell — Mystic (I-95)", address: "Sample: I-95 Exit 90, Mystic, CT", category: "gas", lat: 41.36, lng: -71.96, minutesFromStart: 112, detourMinutes: 2, matchTerms: ["shell", "gas", "gas station", "fuel", "petrol"] },
    { id: "bosdc-shell-newark", name: "Shell — Newark (I-95)", address: "Sample: I-95 Exit 14, Newark, NJ", category: "gas", lat: 40.73, lng: -74.16, minutesFromStart: 278, detourMinutes: 3, matchTerms: ["shell", "gas", "gas station", "fuel", "petrol"] },
    { id: "bosdc-bp-baltimore", name: "BP — Baltimore (I-95)", address: "Sample: I-95 Exit 57, Baltimore, MD", category: "gas", lat: 39.28, lng: -76.6, minutesFromStart: 378, detourMinutes: 4, matchTerms: ["bp", "gas", "gas station", "fuel", "petrol"] },
    // --- Pharmacy ---
    { id: "bosdc-cvs-providence", name: "CVS Pharmacy — Providence", address: "Sample: 799 Hope St, Providence, RI", category: "pharmacy", lat: 41.83, lng: -71.4, minutesFromStart: 65, detourMinutes: 5, matchTerms: ["cvs", "pharmacy", "drugstore"] },
    { id: "bosdc-cvs-stamford", name: "CVS Pharmacy — Stamford", address: "Sample: 969 High Ridge Rd, Stamford, CT", category: "pharmacy", lat: 41.1, lng: -73.56, minutesFromStart: 208, detourMinutes: 6, matchTerms: ["cvs", "pharmacy", "drugstore"] },
    { id: "bosdc-walgreens-philly", name: "Walgreens — Philadelphia", address: "Sample: 1800 South St, Philadelphia, PA", category: "pharmacy", lat: 39.945, lng: -75.17, minutesFromStart: 322, detourMinutes: 5, matchTerms: ["walgreens", "pharmacy", "drugstore"] },
    // --- Hotel ---
    { id: "bosdc-hotel-newhaven", name: "Omni New Haven Hotel", address: "Sample: 155 Temple St, New Haven, CT", category: "hotel", lat: 41.307, lng: -72.925, minutesFromStart: 156, detourMinutes: 5, matchTerms: ["hotel", "motel", "lodging", "stay", "omni"] },
    { id: "bosdc-hotel-stamford", name: "Stamford Marriott Hotel", address: "Sample: 243 Tresser Blvd, Stamford, CT", category: "hotel", lat: 41.055, lng: -73.535, minutesFromStart: 204, detourMinutes: 4, matchTerms: ["hotel", "motel", "lodging", "stay", "marriott"] },
    { id: "bosdc-hotel-baltimore", name: "Hilton Baltimore Inner Harbor", address: "Sample: 401 W Pratt St, Baltimore, MD", category: "hotel", lat: 39.285, lng: -76.62, minutesFromStart: 376, detourMinutes: 7, matchTerms: ["hotel", "motel", "lodging", "stay", "hilton"] },
    // --- Grocery ---
    { id: "bosdc-groc-mystic", name: "Stop & Shop — Mystic", address: "Sample: 1934 Stonington Rd, Mystic, CT", category: "grocery", lat: 41.35, lng: -71.97, minutesFromStart: 111, detourMinutes: 4, matchTerms: ["grocery", "groceries", "supermarket", "stop & shop", "stop and shop", "market"] },
    { id: "bosdc-groc-newark", name: "ShopRite — Newark", address: "Sample: 206 Springfield Ave, Newark, NJ", category: "grocery", lat: 40.74, lng: -74.18, minutesFromStart: 277, detourMinutes: 6, matchTerms: ["grocery", "groceries", "supermarket", "shoprite", "market"] },
  ],
};

const newYorkToBoston: SampleCorridor = {
  originShortName: "New York",
  destinationShortName: "Boston",
  durationMinutes: 215, // 3h 35m direct
  distanceMiles: 215,
  path: [
    [40.7128, -74.006], [41.0534, -73.5387], [41.3083, -72.9279], [41.354, -71.966],
    [41.824, -71.4128], [42.3601, -71.0589],
  ],
  stops: [
    { id: "nybos-mcd-newhaven", name: "McDonald's — New Haven", address: "Sample: 250 Sargent Dr, New Haven, CT", category: "restaurant", lat: 41.3083, lng: -72.9279, minutesFromStart: 95, detourMinutes: 3, matchTerms: ["mcdonald's", "mcdonalds", "mcdonald", "restaurant", "food", "burger", "fast food"] },
    { id: "nybos-mcd-mystic", name: "McDonald's — Mystic", address: "Sample: 240 Greenmanville Ave, Mystic, CT", category: "restaurant", lat: 41.354, lng: -71.966, minutesFromStart: 145, detourMinutes: 5, matchTerms: ["mcdonald's", "mcdonalds", "mcdonald", "restaurant", "food", "burger", "fast food"] },
    { id: "nybos-sbux-stamford", name: "Starbucks — Stamford", address: "Sample: 1055 High Ridge Rd, Stamford, CT", category: "coffee", lat: 41.06, lng: -73.53, minutesFromStart: 48, detourMinutes: 4, matchTerms: ["starbucks", "coffee", "cafe", "espresso"] },
    { id: "nybos-shell-mystic", name: "Shell — Mystic (I-95)", address: "Sample: I-95 Exit 90, Mystic, CT", category: "gas", lat: 41.36, lng: -71.96, minutesFromStart: 147, detourMinutes: 2, matchTerms: ["shell", "gas", "gas station", "fuel", "petrol"] },
    { id: "nybos-cvs-providence", name: "CVS Pharmacy — Providence", address: "Sample: 799 Hope St, Providence, RI", category: "pharmacy", lat: 41.83, lng: -71.4, minutesFromStart: 182, detourMinutes: 4, matchTerms: ["cvs", "pharmacy", "drugstore"] },
    { id: "nybos-hotel-hartford", name: "Marriott Hartford Downtown", address: "Sample: 200 Columbus Blvd, Hartford, CT", category: "hotel", lat: 41.7658, lng: -72.6734, minutesFromStart: 118, detourMinutes: 8, matchTerms: ["hotel", "motel", "lodging", "stay", "marriott"] },
  ],
};

const laToSF: SampleCorridor = {
  originShortName: "Los Angeles",
  destinationShortName: "San Francisco",
  durationMinutes: 342, // 5h 42m direct
  distanceMiles: 383,
  path: [
    [34.0522, -118.2437], [34.4208, -119.6982], [34.953, -120.435], [35.2701, -120.6596],
    [35.6366, -120.6915], [36.6777, -121.6555], [37.3387, -121.8853], [37.7749, -122.4194],
  ],
  stops: [
    { id: "lasf-mcd-sb", name: "McDonald's — Santa Barbara", address: "Sample: 1213 State St, Santa Barbara, CA", category: "restaurant", lat: 34.4208, lng: -119.6982, minutesFromStart: 100, detourMinutes: 4, matchTerms: ["mcdonald's", "mcdonalds", "mcdonald", "restaurant", "food", "burger", "fast food"] },
    { id: "lasf-mcd-slo", name: "McDonald's — San Luis Obispo", address: "Sample: 790 Foothill Blvd, San Luis Obispo, CA", category: "restaurant", lat: 35.2701, lng: -120.6596, minutesFromStart: 185, detourMinutes: 5, matchTerms: ["mcdonald's", "mcdonalds", "mcdonald", "restaurant", "food", "burger", "fast food"] },
    { id: "lasf-sbux-slo", name: "Starbucks — San Luis Obispo", address: "Sample: 968 Higuera St, San Luis Obispo, CA", category: "coffee", lat: 35.272, lng: -120.66, minutesFromStart: 187, detourMinutes: 3, matchTerms: ["starbucks", "coffee", "cafe", "espresso"] },
    { id: "lasf-shell-paso", name: "Shell — Paso Robles (US-101)", address: "Sample: US-101 Exit, Paso Robles, CA", category: "gas", lat: 35.6366, lng: -120.6915, minutesFromStart: 205, detourMinutes: 3, matchTerms: ["shell", "gas", "gas station", "fuel", "petrol"] },
    { id: "lasf-cvs-sm", name: "CVS Pharmacy — Santa Maria", address: "Sample: 1105 E Clark Ave, Santa Maria, CA", category: "pharmacy", lat: 34.953, lng: -120.435, minutesFromStart: 142, detourMinutes: 6, matchTerms: ["cvs", "pharmacy", "drugstore"] },
    { id: "lasf-hotel-slo", name: "Hotel San Luis Obispo", address: "Sample: 877 Palm St, San Luis Obispo, CA", category: "hotel", lat: 35.271, lng: -120.662, minutesFromStart: 186, detourMinutes: 5, matchTerms: ["hotel", "motel", "lodging", "stay"] },
    { id: "lasf-groc-sb", name: "Ralphs — Santa Barbara", address: "Sample: 100 W Carrillo St, Santa Barbara, CA", category: "grocery", lat: 34.422, lng: -119.7, minutesFromStart: 101, detourMinutes: 5, matchTerms: ["grocery", "groceries", "supermarket", "ralphs", "market"] },
  ],
};

export const SAMPLE_CORRIDORS: SampleCorridor[] = [bostonToDC, newYorkToBoston, laToSF];

export function findCorridor(origin: City, destination: City): SampleCorridor | null {
  return (
    SAMPLE_CORRIDORS.find(
      (c) => c.originShortName === origin.shortName && c.destinationShortName === destination.shortName,
    ) ?? null
  );
}

/** Reverse a corridor for the return trip: times are mirrored around the total duration. */
export function reverseCorridor(c: SampleCorridor): SampleCorridor {
  return {
    ...c,
    originShortName: c.destinationShortName,
    destinationShortName: c.originShortName,
    path: [...c.path].reverse() as [number, number][],
    stops: c.stops.map((s) => ({
      ...s,
      id: `${s.id}-rev`,
      minutesFromStart: c.durationMinutes - s.minutesFromStart,
    })),
  };
}

export function findCorridorAnyDirection(origin: City, destination: City): SampleCorridor | null {
  const direct = findCorridor(origin, destination);
  if (direct) return direct;
  const reverse = findCorridor(destination, origin);
  return reverse ? reverseCorridor(reverse) : null;
}
