"""Fetch OpenStreetMap business extracts along the corridor centerlines.

One build-time Overpass pass per category GROUP along the saved route
geometries (radius 5 km around the union of all lines):
  scripts/corridor-route.json          Boston→DC inland (I-90/I-84/I-91/I-95)
  scripts/corridor-route-coastal.json  Boston→Providence→New Haven (I-95)
  scripts/corridor-route-146.json      Worcester→Providence (MA-146)

The application NEVER queries Overpass at runtime — this script is
the dataset refresh entry point (see README "Refreshing the business
dataset"). Outputs raw extracts to the feasibility workspace:
  corridor_v3_food.json     amenity=fast_food | restaurant | cafe
  corridor_v3_fuel.json     amenity=fuel
  corridor_v3_charging.json amenity=charging_station
  corridor_v3_shops.json    amenity=pharmacy, shop=convenience | supermarket
  corridor_v3_lodging.json  tourism=hotel | motel, highway=rest_area | services
Groups already fetched are skipped (RSF_FORCE_FETCH=1 refetches).

Then run scripts/generate-businesses.py to build
src/lib/live/businesses.json.
"""
import json
import os
import time
import urllib.parse
import urllib.request

UA = {
    "User-Agent": "RouteStopFinder-DatasetBuild/3.0 (dataset refresh for joaco354/route-stop-finder; OSM data, ODbL)"
}
REPO = "/home/hatch/workspace/route-stop-finder"
OUT = "/home/hatch/workspace/rsf-feasibility"

wps_all = []
for line_file in (
    "corridor-route.json",
    "corridor-route-coastal.json",
    "corridor-route-146.json",
):
    route = json.load(open(f"{REPO}/scripts/{line_file}"))
    coords = route["coordinates"]  # [lon, lat]
    wps = coords[::12]
    if wps[-1] != coords[-1]:
        wps.append(coords[-1])
    wps_all.extend(wps)
    print(f"{line_file}: {len(wps)} waypoints", flush=True)
poly = ",".join(f"{lat},{lon}" for lon, lat in wps_all)
print(f"Corridor polyline waypoints (all lines): {len(wps_all)}", flush=True)

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]


def overpass(ql, label):
    last = None
    for attempt in range(8):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(
                ep, data=urllib.parse.urlencode({"data": ql}).encode(), headers=UA
            )
            with urllib.request.urlopen(req, timeout=290) as r:
                data = json.load(r)
            print(f"{label}: OK via {ep} — {len(data.get('elements', []))} elements", flush=True)
            return data
        except Exception as e:  # mirrors are flaky; rotate and retry
            last = e
            print(f"{label}: attempt {attempt + 1} via {ep} failed: {e}", flush=True)
            time.sleep(25)
    raise RuntimeError(f"{label} failed everywhere: {last}")


def q(filters):
    parts = []
    for f in filters:
        parts.append(f'node[{f}](around:5000,{poly});')
        parts.append(f'way[{f}](around:5000,{poly});')
    return "[out:json][timeout:285];\n(\n  " + "\n  ".join(parts) + "\n);\nout center tags;"


QUERIES = {
    "food": q(['"amenity"="fast_food"', '"amenity"="restaurant"', '"amenity"="cafe"']),
    "fuel": q(['"amenity"="fuel"']),
    "charging": q(['"amenity"="charging_station"']),
    "shops": q(['"amenity"="pharmacy"', '"shop"="convenience"', '"shop"="supermarket"']),
    "lodging": q(
        ['"tourism"="hotel"', '"tourism"="motel"', '"highway"="rest_area"', '"highway"="services"']
    ),
}

for label, ql in QUERIES.items():
    out_path = f"{OUT}/corridor_v3_{label}.json"
    if (
        os.path.exists(out_path)
        and os.path.getsize(out_path) > 100
        and not os.environ.get("RSF_FORCE_FETCH")
    ):
        print(f"{label}: already fetched, skipping (set RSF_FORCE_FETCH=1 to redo)", flush=True)
        continue
    data = overpass(ql, label)
    json.dump(data, open(out_path, "w"))
print("DONE", flush=True)
