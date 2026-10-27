"""Generate src/lib/live/businesses.json from raw Overpass corridor extracts.

Inputs (in ~/workspace/rsf-feasibility/), produced by
scripts/build-corridor-dataset.py:
  corridor_v2_food.json     amenity=fast_food | restaurant | cafe
  corridor_v2_fuel.json     amenity=fuel
  corridor_v2_charging.json amenity=charging_station
  corridor_v2_shops.json    amenity=pharmacy, shop=convenience | supermarket
  corridor_v2_lodging.json  tourism=hotel | motel, highway=rest_area | services

Categories are assigned from the OSM tags themselves — no brand is
curated by hand. Output entries are deduplicated (same brand/name
within 150 m = same place), carry name/brand/category/address/coords +
OSM type/id for audit, and are sorted along the corridor (north →
south). Addresses are assembled from OSM addr:* tags only — never
invented; a postcode alone is not an address.
"""
import json
import math
import re

FEAS = "/home/hatch/workspace/rsf-feasibility"
OUT = "/home/hatch/workspace/route-stop-finder/src/lib/live/businesses.json"

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


def load(label):
    with open(f"{FEAS}/corridor_v2_{label}.json") as f:
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
    tourism = tags.get("tourism")
    if tourism in ("hotel", "motel"):
        return "hotel"
    if tags.get("highway") in ("rest_area", "services"):
        return "rest_area"
    return None


def addr_of(tags):
    parts = []
    street = " ".join(
        x for x in [tags.get("addr:housenumber", ""), tags.get("addr:street", "")] if x
    )
    if street:
        parts.append(street)
    city = tags.get("addr:city") or tags.get("addr:town") or ""
    state = tags.get("addr:state", "")
    if city:
        parts.append(f"{city}, {state}" if state else city)
    # A postcode alone is not an address — never present it as one.
    return ", ".join(parts)


def hav_m(a, b):
    R = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = math.radians(b[0] - a[0])
    dl = math.radians(b[1] - a[1])
    return 2 * R * math.asin(
        math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    )


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", s.lower())


entries = []
seen_osm = set()
for label in ("food", "fuel", "charging", "shops", "lodging"):
    for e in load(label):
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
                "address": addr_of(tags),
                "lat": round(lat, 6),
                "lng": round(lon, 6),
                "osmType": e["type"],
                "osmId": e["id"],
            }
        )

# Dedupe: same normalized brand (or name, for independents) within
# 150 m — keep the entry that has an address. Bucketed by rounded
# coords so this stays fast at tens of thousands of entries.
entries.sort(key=lambda x: x["address"] == "")
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
    # Stable key order for a clean file.
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

counts = {}
for e in deduped:
    counts[e["category"]] = counts.get(e["category"], 0) + 1
print("counts:", dict(sorted(counts.items())), "total:", len(deduped))

with open(OUT, "w") as f:
    json.dump(deduped, f, ensure_ascii=False, separators=(",", ":"))
print("wrote", OUT)
