import json, math, re, sys

"""Generate src/lib/live/businesses.ts from raw Overpass corridor extracts.

Inputs (in ~/workspace/rsf-feasibility/):
  corridor_mcdonalds.json, corridor_starbucks.json, corridor_fuel.json
Each was produced by ONE build-time Overpass query along the Boston→DC
route polyline (see build_dataset.py in the same folder / repo history).
The application itself never queries Overpass at runtime.

Output entries are deduplicated (same brand within 200 m = same place),
carry name/brand/category/address/coords + OSM attribution, and are
sorted along the corridor (north → south).
"""

FEAS = "/home/hatch/workspace/rsf-feasibility"
OUT = "/home/hatch/workspace/route-stop-finder/src/lib/live/businesses.ts"

def load(label):
    with open(f"{FEAS}/corridor_{label}.json") as f:
        return json.load(f).get("elements", [])

def addr_of(tags):
    parts = []
    street = " ".join(x for x in [tags.get("addr:housenumber", ""), tags.get("addr:street", "")] if x)
    if street: parts.append(street)
    city = tags.get("addr:city") or tags.get("addr:town") or ""
    state = tags.get("addr:state", "")
    if city: parts.append(f"{city}, {state}" if state else city)
    elif tags.get("addr:postcode"): parts.append(tags["addr:postcode"])
    return ", ".join(parts)

def hav_m(a, b):
    R = 6371000.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = math.radians(b[0] - a[0]); dl = math.radians(b[1] - a[1])
    return 2 * R * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

entries = []
def add(elements, category, brand_of):
    for e in elements:
        t = e.get("tags", {})
        lat = e.get("lat") or e.get("center", {}).get("lat")
        lon = e.get("lon") or e.get("center", {}).get("lon")
        if lat is None or lon is None: continue
        name = t.get("name") or t.get("brand") or ""
        if not name: continue
        brand = brand_of(t, name)
        entries.append({
            "name": name, "brand": brand, "category": category,
            "address": addr_of(t), "lat": round(lat, 6), "lng": round(lon, 6),
            "osmType": e["type"], "osmId": e["id"],
        })

add(load("mcdonalds"), "restaurant", lambda t, n: "McDonald's")
add(load("starbucks"), "coffee", lambda t, n: "Starbucks")
add(load("fuel"), "gas", lambda t, n: t.get("brand") or n)

# Dedupe: same brand (or name) within 200 m — keep the entry with an address.
entries.sort(key=lambda x: (x["address"] == "", ))
deduped = []
for e in entries:
    dup = False
    for d in deduped:
        if (d["brand"] == e["brand"] or d["name"] == e["name"]) and hav_m((d["lat"], d["lng"]), (e["lat"], e["lng"])) <= 200:
            dup = True; break
    if not dup: deduped.append(e)

# Sort north → south along the corridor and assign stable ids.
deduped.sort(key=lambda x: -x["lat"])
for i, e in enumerate(deduped):
    e["id"] = f"osm-{slug(e['brand'] or e['name'])}-{i}"

counts = {}
for e in deduped: counts[e["category"]] = counts.get(e["category"], 0) + 1
print("counts:", counts, "total:", len(deduped))

def esc(s): return s.replace("\\", "\\\\").replace('"', '\\"')
lines = []
lines.append("/**")
lines.append(" * VERIFIED CORRIDOR BUSINESS DATASET — Boston ↔ Washington, DC (Phase 2C).")
lines.append(" *")
lines.append(" * Built from real OpenStreetMap data (© OpenStreetMap contributors,")
lines.append(" * ODbL) with one build-time Overpass query per category along the")
lines.append(" * route corridor — the app never queries Overpass at runtime.")
lines.append(" * Regenerate with scripts/build-corridor-dataset.py (see the")
lines.append(" * feasibility workspace for the raw extracts).")
lines.append(f" * Entries: {len(deduped)} " + "(" + ", ".join(f"{k}: {v}" for k, v in sorted(counts.items())) + ").")
lines.append(" * Every entry is a real OSM feature (osmType/osmId kept for audit).")
lines.append(" */")
lines.append("")
lines.append('import type { StopCategory } from "../types";')
lines.append("")
lines.append("export interface LiveBusiness {")
lines.append("  id: string;")
lines.append("  name: string;")
lines.append("  brand: string;")
lines.append("  category: StopCategory;")
lines.append("  /** Street address when OSM has one; may be \"\" — never invented. */")
lines.append("  address: string;")
lines.append("  lat: number;")
lines.append("  lng: number;")
lines.append("  osmType: string;")
lines.append("  osmId: number;")
lines.append("}")
lines.append("")
lines.append('export const BUSINESS_SOURCE = "© OpenStreetMap contributors (ODbL)";')
lines.append("")
lines.append("export const CORRIDOR_BUSINESSES: LiveBusiness[] = [")
for e in deduped:
    lines.append(
        f'  {{ id: "{e["id"]}", name: "{esc(e["name"])}", brand: "{esc(e["brand"])}", '
        f'category: "{e["category"]}", address: "{esc(e["address"])}", '
        f'lat: {e["lat"]}, lng: {e["lng"]}, osmType: "{e["osmType"]}", osmId: {e["osmId"]} }},'
    )
lines.append("];")
lines.append("")
with open(OUT, "w") as f:
    f.write("\n".join(lines))
print("wrote", OUT)
