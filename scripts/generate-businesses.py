"""Generate src/lib/live/businesses.json from the regional POI extract.

Input (in ~/workspace/rsf-feasibility/), produced by
scripts/build-region-dataset.py: region_pois.json — every OSM
business feature within ~5 km of the regional line network
(Buffalo → Pittsburgh → DC → I-95 → Bangor → Burlington loop plus
interior interstates), extracted locally from the Geofabrik
US-Northeast PBF.

Categories are assigned from the OSM tags themselves — no brand is
curated by hand. Output entries are deduplicated (same brand/name
within 150 m = same place), carry name/brand/category/address/coords +
OSM type/id for audit, and are sorted along the corridor (north →
south).

Addresses come from OSM addr:* tags. When OSM has no city for a
business, the town is filled in from the nearest Census place
(scripts/ne-towns.json, US Census Gazetteer 2024) within 30 km, so
results can always say which town a stop is in. Street addresses are
never invented; a postcode alone is not an address. Also writes
src/lib/live/suggestions.json (autocomplete index).
"""
import json
import math
import re
from collections import Counter

FEAS = "/home/hatch/workspace/rsf-feasibility"
REPO = "/home/hatch/workspace/route-stop-finder"
OUT = f"{REPO}/src/lib/live/businesses.json"
SUGGESTIONS_OUT = f"{REPO}/src/lib/live/suggestions.json"

GENERIC_NAME = {
    "fast_food": "Fast food restaurant",
    "restaurant": "Restaurant",
    "coffee": "Coffee shop",
    "gas": "Gas station",
    "ev_charging": "EV charging station",
    "pharmacy": "Pharmacy",
    "grocery": "Grocery store",
    "convenience": "Convenience store",
    "hotel": "Hotel",
    "rest_area": "Rest area",
}

CATEGORY_LABELS = {
    "restaurant": "Restaurant",
    "fast_food": "Fast food",
    "coffee": "Coffee shop",
    "gas": "Gas station",
    "ev_charging": "EV charging station",
    "pharmacy": "Pharmacy",
    "grocery": "Grocery store",
    "convenience": "Convenience store",
    "hotel": "Hotel",
    "rest_area": "Rest area",
}


def load_elements():
    with open(f"{FEAS}/region_pois.json") as f:
        return json.load(f).get("elements", [])


def category_of(tags):
    """First matching OSM tag wins. Order matters for multi-tag places
    (a fuel station with a convenience shop stays 'gas')."""
    amenity = tags.get("amenity")
    if amenity == "charging_station":
        return "ev_charging"
    if amenity == "fuel":
        return "gas"
    if amenity == "fast_food":
        return "fast_food"
    if amenity == "restaurant":
        return "restaurant"
    if amenity == "cafe":
        return "coffee"
    if amenity == "pharmacy":
        return "pharmacy"
    shop = tags.get("shop")
    if shop == "supermarket":
        return "grocery"
    if shop == "convenience":
        return "convenience"
    if tags.get("tourism") in ("hotel", "motel"):
        return "hotel"
    if tags.get("highway") in ("rest_area", "services"):
        return "rest_area"
    return None


def hav_m(a, b):
    R = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = math.radians(b[0] - a[0])
    dl = math.radians(b[1] - a[1])
    return 2 * R * math.asin(
        math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    )


# --- Nearest-town lookup (Census places, bucketed) ---
_towns = json.load(open(f"{REPO}/scripts/ne-towns.json"))
_town_buckets = {}
for t in _towns:
    cell = (round(t["lat"] / 0.5), round(t["lng"] / 0.5))
    _town_buckets.setdefault(cell, []).append(t)


def nearest_town(lat, lng, max_km=30.0):
    cell = (round(lat / 0.5), round(lng / 0.5))
    best, best_d = None, max_km * 1000
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for t in _town_buckets.get((cell[0] + dx, cell[1] + dy), []):
                d = hav_m((lat, lng), (t["lat"], t["lng"]))
                if d < best_d:
                    best, best_d = t, d
    return best


def build_address(tags, lat, lng, stats):
    street = " ".join(
        x for x in [tags.get("addr:housenumber", ""), tags.get("addr:street", "")] if x
    )
    city = tags.get("addr:city") or tags.get("addr:town") or ""
    state = tags.get("addr:state", "")
    if not city:
        town = nearest_town(lat, lng)
        if town:
            city, state = town["name"], town["state"]
            stats["town_filled"] += 1
    parts = []
    if street:
        parts.append(street)
    if city:
        parts.append(f"{city}, {state}" if state else city)
    # A postcode alone is not an address — never present it as one.
    return ", ".join(parts)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())


entries = []
seen_osm = set()
stats = {"town_filled": 0}
for e in load_elements():
    key = (e["type"], e["id"])
    if key in seen_osm:
        continue
    seen_osm.add(key)
    tags = e.get("tags", {})
    category = category_of(tags)
    if category is None:
        continue
    lat = e.get("lat") or e.get("center", {}).get("lat")
    lon = e.get("lon") or e.get("center", {}).get("lon")
    if lat is None or lon is None:
        continue
    brand = tags.get("brand", "")
    name = tags.get("name") or brand or tags.get("operator") or GENERIC_NAME[category]
    entries.append(
        {
            "name": name,
            "brand": brand,
            "category": category,
            "address": build_address(tags, lat, lon, stats),
            "lat": round(lat, 6),
            "lng": round(lon, 6),
            "osmType": e["type"],
            "osmId": e["id"],
        }
    )

# Dedupe: same normalized brand (or name, for independents) within
# 150 m — keep the entry that has a fuller address. Bucketed by rounded
# coords so this stays fast at tens of thousands of entries.
entries.sort(key=lambda x: -len(x["address"]))
deduped = []
buckets = {}
for e in entries:
    key_name = norm(e["brand"] or e["name"])
    cell = (round(e["lat"] / 0.004), round(e["lng"] / 0.004))
    dup = False
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for d in buckets.get((cell[0] + dx, cell[1] + dy), []):
                if norm(d["brand"] or d["name"]) == key_name and hav_m(
                    (d["lat"], d["lng"]), (e["lat"], e["lng"])
                ) <= 150:
                    dup = True
                    break
            if dup:
                break
        if dup:
            break
    if not dup:
        deduped.append(e)
        buckets.setdefault(cell, []).append(e)

# Sort north → south along the corridor and assign stable ids.
deduped.sort(key=lambda x: -x["lat"])
for i, e in enumerate(deduped):
    e["id"] = f"osm-{slug(e['brand'] or e['name'])}-{i}"
    deduped[i] = {
        "id": e["id"],
        "name": e["name"],
        "brand": e["brand"],
        "category": e["category"],
        "address": e["address"],
        "lat": e["lat"],
        "lng": e["lng"],
        "osmType": e["osmType"],
        "osmId": e["osmId"],
    }

counts = Counter(e["category"] for e in deduped)
with_address = sum(1 for e in deduped if e["address"])
print("counts:", dict(sorted(counts.items())), "total:", len(deduped))
print(f"town filled from Census for {stats['town_filled']} entries; "
      f"entries with some address/town text: {with_address} ({100 * with_address / len(deduped):.0f}%)")

with open(OUT, "w") as f:
    json.dump(deduped, f, ensure_ascii=False, separators=(",", ":"))
print("wrote", OUT)

# Suggestion index for the search-box autocomplete.
brand_counts = Counter(e["brand"] for e in deduped if e["brand"])
suggestions = [
    {"label": label, "kind": "category", "count": counts.get(cat, 0)}
    for cat, label in CATEGORY_LABELS.items()
    if counts.get(cat, 0) > 0
] + [
    {"label": "Food", "kind": "category",
     "count": counts.get("restaurant", 0) + counts.get("fast_food", 0)},
    {"label": "Drug store", "kind": "category", "count": counts.get("pharmacy", 0)},
] + [
    {"label": brand, "kind": "brand", "count": n}
    for brand, n in brand_counts.most_common()
]
with open(SUGGESTIONS_OUT, "w") as f:
    json.dump(suggestions, f, ensure_ascii=False, separators=(",", ":"))
print(f"wrote {SUGGESTIONS_OUT}: {len(suggestions)} suggestions")
