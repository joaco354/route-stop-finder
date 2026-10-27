"""Fetch expanded OpenStreetMap business extracts along the corridor.

One build-time Overpass pass per category GROUP along the Boston→DC
corridor centerline (scripts/corridor-route.json, saved from the route
geometry used since Phase 2C). Radius 5 km. The application NEVER
queries Overpass at runtime — this script is the dataset refresh entry
point (see README "Refreshing the business dataset").

Outputs raw extracts to the feasibility workspace:
  corridor_v2_food.json    amenity=fast_food | restaurant | cafe
  corridor_v2_fuel.json    amenity=fuel
  corridor_v2_charging.json amenity=charging_station
  corridor_v2_shops.json   amenity=pharmacy, shop=convenience | supermarket
  corridor_v2_lodging.json tourism=hotel | motel, highway=rest_area | services
Groups already fetched are skipped (RSF_FORCE_FETCH=1 refetches).

Then run scripts/generate-businesses.py to build
src/lib/live/businesses.json.
"""
import json
import time
import urllib.parse
import urllib.request

UA = {
    "User-Agent": "RouteStopFinder-DatasetBuild/2.0 (dataset refresh for joaco354/route-stop-finder; OSM data, ODbL)"
}
REPO = "/home/hatch/workspace/route-stop-finder"
OUT = "/home/hatch/workspace/rsf-feasibility"

route = json.load(open(f"{REPO}/scripts/corridor-route.json"))
coords = route["coordinates"]  # [lon, lat]
wps = coords[::12]
if wps[-1] != coords[-1]:
    wps.append(coords[-1])
poly = ",".join(f"{lat},{lon}" for lon, lat in wps)
print(f"Corridor polyline waypoints: {len(wps)}", flush=True)

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

import os

for label, ql in QUERIES.items():
    out_path = f"{OUT}/corridor_v2_{label}.json"
    if os.path.exists(out_path) and os.path.getsize(out_path) > 100 and not os.environ.get(
        "RSF_FORCE_FETCH"
    ):
        print(f"{label}: already fetched, skipping (set RSF_FORCE_FETCH=1 to redo)", flush=True)
        continue
    data = overpass(ql, label)
    json.dump(data, open(out_path, "w"))
print("DONE", flush=True)
