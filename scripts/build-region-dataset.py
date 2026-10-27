"""Build the regional POI extract from a Geofabrik OSM extract.

Region (Joaquin's circle): Buffalo → Pittsburgh → Washington, DC →
I-95 → Boston → Bangor → Burlington → Buffalo, plus the interior
interstate network. Downloads us-northeast-latest.osm.pbf from
Geofabrik (skipped when already present), then keeps every POI
(business categories in generate-businesses.py) within ~5 km of the
line network in scripts/corridor-route*.json + scripts/lines/*.json.

Why local extraction instead of Overpass: at regional scale the
public Overpass mirrors time out; a local pass over the PBF is fast,
repeatable, and rude to no one. Output is Overpass-shaped JSON
(~/workspace/rsf-feasibility/region_pois.json) consumed by
scripts/generate-businesses.py.
"""
import json
import math
import os
import sys
import urllib.request

REPO = "/home/hatch/workspace/route-stop-finder"
WORK = "/home/hatch/workspace/rsf-feasibility/region"
PBF = f"{WORK}/us-northeast-latest.osm.pbf"
PBF_URL = "https://download.geofabrik.de/north-america/us-northeast-latest.osm.pbf"
OUT = "/home/hatch/workspace/rsf-feasibility/region_pois.json"
RADIUS_KM = 5.0
CELL_DEG = 0.01  # ~1 km raster for the corridor mask

os.makedirs(WORK, exist_ok=True)
if not os.path.exists(PBF):
    print(f"downloading {PBF_URL} …", flush=True)
    req = urllib.request.Request(PBF_URL, headers={"User-Agent": "RouteStopFinder-DatasetBuild/3.0"})
    with urllib.request.urlopen(req, timeout=3600) as r, open(PBF, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    print(f"downloaded {os.path.getsize(PBF) / 1e6:.0f} MB", flush=True)
else:
    print(f"PBF present ({os.path.getsize(PBF) / 1e6:.0f} MB), skipping download", flush=True)

# --- Corridor mask: fine cells within RADIUS_KM of any line point ---
import glob

line_files = sorted(
    glob.glob(f"{REPO}/scripts/corridor-route*.json") + glob.glob(f"{REPO}/scripts/lines/*.json")
)
print(f"line files: {len(line_files)}", flush=True)
mask = set()
KM_PER_DEG_LAT = 111.0
for lf in line_files:
    coords = json.load(open(lf))["coordinates"]  # [lon, lat]
    for lon, lat in coords:
        km_per_deg_lng = 111.0 * math.cos(math.radians(lat))
        r_lat = RADIUS_KM / KM_PER_DEG_LAT
        r_lng = RADIUS_KM / max(km_per_deg_lng, 40.0)
        steps_lat = max(1, int(r_lat / CELL_DEG))
        steps_lng = max(1, int(r_lng / CELL_DEG))
        for dx in range(-steps_lng, steps_lng + 1):
            for dy in range(-steps_lat, steps_lat + 1):
                # keep cells whose center is inside the disc
                clon = lon + dx * CELL_DEG
                clat = lat + dy * CELL_DEG
                d_km = math.hypot((clon - lon) * km_per_deg_lng, (clat - lat) * KM_PER_DEG_LAT)
                if d_km <= RADIUS_KM:
                    mask.add((round(clat / CELL_DEG), round(clon / CELL_DEG)))
print(f"corridor mask cells: {len(mask)}", flush=True)


def in_corridor(lat, lon):
    return (round(lat / CELL_DEG), round(lon / CELL_DEG)) in mask


# --- POI extraction ---
import osmium

AMENITIES = {"fast_food", "restaurant", "cafe", "fuel", "charging_station", "pharmacy"}
SHOPS = {"convenience", "supermarket"}
TOURISM = {"hotel", "motel"}
HIGHWAYS = {"rest_area", "services"}


def interesting(tags):
    return (
        tags.get("amenity") in AMENITIES
        or tags.get("shop") in SHOPS
        or tags.get("tourism") in TOURISM
        or tags.get("highway") in HIGHWAYS
    )


elements = []


class Handler(osmium.SimpleHandler):
    def node(self, n):
        if n.tags and interesting(n.tags) and in_corridor(n.location.lat, n.location.lon):
            elements.append(
                {
                    "type": "node",
                    "id": n.id,
                    "lat": n.location.lat,
                    "lon": n.location.lon,
                    "tags": dict(n.tags),
                }
            )

    def way(self, w):
        if not (w.tags and interesting(w.tags)):
            return
        pts = [(nd.location.lat, nd.location.lon) for nd in w.nodes if nd.location.valid()]
        if not pts:
            return
        clat = sum(p[0] for p in pts) / len(pts)
        clon = sum(p[1] for p in pts) / len(pts)
        if in_corridor(clat, clon):
            elements.append(
                {
                    "type": "way",
                    "id": w.id,
                    "center": {"lat": clat, "lon": clon},
                    "tags": dict(w.tags),
                }
            )


Handler().apply_file(PBF, locations=True)
print(f"POIs in corridor: {len(elements)}", flush=True)
json.dump({"elements": elements}, open(OUT, "w"))
print("wrote", OUT, flush=True)
