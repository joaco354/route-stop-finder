import json, math, time, urllib.request, urllib.parse

UA = {"User-Agent": "RouteStopFinder-DatasetBuild/1.0 (one-time dataset build for joaco354/route-stop-finder; OSM data, ODbL)"}
OUT = "/home/hatch/workspace/rsf-feasibility"
route = json.load(open(f"{OUT}/osrm_route.json"))
coords = route["geometry"]["coordinates"]  # [lon,lat]
# waypoints every ~12th point for the around-polyline
wps = coords[::12]
if wps[-1] != coords[-1]: wps.append(coords[-1])
poly = ",".join(f"{lat},{lon}" for lon, lat in wps)
print(f"Corridor polyline waypoints: {len(wps)}")

ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://lz4.overpass-api.de/api/interpreter",
             "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]

def overpass(ql, label):
    last = None
    for attempt in range(6):
        ep = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": ql}).encode(), headers=UA)
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.load(r)
            print(f"{label}: OK via {ep} — {len(data.get('elements', []))} elements")
            return data
        except Exception as e:
            last = e; print(f"{label}: attempt {attempt+1} via {ep} failed: {e}"); time.sleep(25)
    raise RuntimeError(f"{label} failed everywhere: {last}")

QUERIES = {
    "mcdonalds": f"""[out:json][timeout:280];
( node["brand"~"McDonald",i](around:3000,{poly}); way["brand"~"McDonald",i](around:3000,{poly});
  node["name"~"^McDonald",i](around:3000,{poly}); way["name"~"^McDonald",i](around:3000,{poly}); );
out center tags;""",
    "starbucks": f"""[out:json][timeout:280];
( node["brand"~"Starbucks",i](around:3000,{poly}); way["brand"~"Starbucks",i](around:3000,{poly});
  node["name"~"^Starbucks",i](around:3000,{poly}); way["name"~"^Starbucks",i](around:3000,{poly}); );
out center tags;""",
    "fuel": f"""[out:json][timeout:280];
( node["amenity"="fuel"](around:3000,{poly}); way["amenity"="fuel"](around:3000,{poly}); );
out center tags;""",
}
for label, ql in QUERIES.items():
    data = overpass(ql, label)
    json.dump(data, open(f"{OUT}/corridor_{label}.json", "w"))
print("DONE")
