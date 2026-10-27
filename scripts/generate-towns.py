#!/usr/bin/env python3
"""Build the regional endpoint towns list (src/lib/towns.ts) and the
region places file (scripts/region-places.json) from the US Census
Gazetteer places file.

Endpoints are Census places in the 12 region states that lie near the
saved highway line network (scripts/corridor-route*.json +
scripts/lines/*.json) and are useful trip endpoints: municipal places
(city / town / borough / village) within 10 km of a line, or any place
within 20 km that the business dataset already tags with at least 8
businesses. Nothing is invented — names and coordinates are the
Census Bureau's published place centroids.

Also writes scripts/region-places.json (every place in the region
states, suffix-stripped) which the business generator uses for
town fill-in.

Usage: python3 scripts/generate-towns.py
"""
import glob
import gzip
import json
import math
import os
import re
import sys
import urllib.request
import zipfile
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORK = os.path.expanduser("~/workspace/rsf-feasibility/region")
GAZ_ZIP_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/"
    "2024_Gazetteer/2024_Gaz_place_national.zip"
)
GAZ_TXT = os.path.join(WORK, "2024_Gaz_place_national.txt")
STATES = {"ME", "NH", "VT", "MA", "RI", "CT", "NY", "NJ", "PA", "DE", "MD", "DC"}
SUFFIXES = [
    " city (balance)", " town (balance)", " village (balance)",
    " (balance)", " city", " town", " borough", " village",
    " municipality", " CDP", " comunidad", " zona urbana",
]
MUNICIPAL_SUFFIXES = {" city", " town", " borough", " village", " municipality"}


def haversine_km(lat1, lng1, lat2, lng2):
    p = math.pi / 180
    a = (
        math.sin((lat2 - lat1) * p / 2) ** 2
        + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    )
    return 12742 * math.asin(math.sqrt(a))


def load_gazetteer():
    if not os.path.exists(GAZ_TXT):
        os.makedirs(WORK, exist_ok=True)
        zip_path = os.path.join(WORK, "2024_Gaz_place_national.zip")
        print(f"downloading {GAZ_ZIP_URL}")
        urllib.request.urlretrieve(GAZ_ZIP_URL, zip_path)
        with zipfile.ZipFile(zip_path) as z:
            name = [n for n in z.namelist() if n.endswith(".txt")][0]
            with z.open(name) as src, open(GAZ_TXT, "wb") as dst:
                dst.write(src.read())
    places = []
    with open(GAZ_TXT, encoding="utf-8", errors="replace") as f:
        header = f.readline().split("\t")
        idx = {h.strip(): i for i, h in enumerate(header)}
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < len(header):
                continue
            state = parts[idx["USPS"]].strip()
            if state not in STATES:
                continue
            raw = parts[idx["NAME"]].strip()
            municipal = False
            name = raw
            for suf in sorted(SUFFIXES, key=len, reverse=True):
                if raw.endswith(suf):
                    name = raw[: -len(suf)].strip()
                    municipal = suf in MUNICIPAL_SUFFIXES
                    break
            places.append(
                {
                    "name": name,
                    "state": state,
                    "lat": float(parts[idx["INTPTLAT"]]),
                    "lng": float(parts[idx["INTPTLONG"]]),
                    "aland": float(parts[idx["ALAND"]] or 0),
                    "municipal": municipal,
                }
            )
    return places


def line_points():
    pts = []
    files = sorted(glob.glob(os.path.join(HERE, "corridor-route*.json"))) + sorted(
        glob.glob(os.path.join(HERE, "lines", "*.json"))
    )
    for f in files:
        d = json.load(open(f))
        pts.extend((lat, lng) for lng, lat in d["coordinates"])
    return pts


def make_dist_fn(pts):
    """Exact min distance (km) to the line vertices — the OSRM points
    are dense (~50–200 m apart), so vertex distance ≈ route distance
    for threshold purposes. Brute force with numpy: 5.5k places ×
    ~100k points is a few seconds and never overestimates."""
    import numpy as np

    P = np.array(pts)

    def dist_km(lat, lng):
        dlat = (P[:, 0] - lat) * 111.32
        dlng = (P[:, 1] - lng) * 111.32 * math.cos(math.radians(lat))
        return float(np.sqrt(dlat**2 + dlng**2).min())

    return dist_km


def business_counts():
    path = os.path.join(ROOT, "src/lib/live/businesses.json")
    counts = Counter()
    pat = re.compile(r"(?:^|, )([^,]+), ([A-Z]{2})$")
    for b in json.load(open(path)):
        m = pat.search(b["address"])
        if m:
            counts[(m.group(1), m.group(2))] += 1
    return counts


EXISTING = {
    "Boston, MA", "Providence, RI", "Worcester, MA", "Springfield, MA",
    "Hartford, CT", "New Haven, CT", "Bridgeport, CT", "New London, CT",
    "Stamford, CT", "New York, NY", "Newark, NJ", "Trenton, NJ",
    "Philadelphia, PA", "Wilmington, DE", "Baltimore, MD", "Washington, DC",
    "Buffalo, NY", "Rochester, NY", "Syracuse, NY", "Albany, NY",
    "Binghamton, NY", "Erie, PA", "Pittsburgh, PA", "Harrisburg, PA",
    "Scranton, PA", "Allentown, PA", "Portland, ME", "Bangor, ME",
    "Burlington, VT", "Concord, NH",
}


def main():
    places = load_gazetteer()
    print(f"census places in region states: {len(places)}")
    with open(os.path.join(HERE, "region-places.json"), "w") as f:
        json.dump(
            [
                {"name": p["name"], "state": p["state"], "lat": p["lat"], "lng": p["lng"]}
                for p in places
            ],
            f,
        )
    print("wrote scripts/region-places.json")

    dist_km = make_dist_fn(line_points())
    biz = business_counts()
    kept = {}
    for p in places:
        full = f"{p['name']}, {p['state']}"
        if full in EXISTING:
            continue
        d = dist_km(p["lat"], p["lng"])
        b = biz.get((p["name"], p["state"]), 0)
        if not ((d <= 10 and p["municipal"]) or (d <= 20 and b >= 8)):
            continue
        key = (p["name"], p["state"])
        rank = (p["municipal"], b, p["aland"])
        if key not in kept or rank > kept[key][0]:
            kept[key] = (rank, p, d, b)
    towns = sorted(
        (v[1] for v in kept.values()), key=lambda p: (p["state"], p["name"])
    )
    print(f"endpoint towns kept: {len(towns)}")
    print("by state:", dict(Counter(p["state"] for p in towns)))

    lines = [
        "/** GENERATED by scripts/generate-towns.py — do not edit by hand.",
        " *  Regional endpoint towns: US Census places near the saved",
        " *  highway line network (municipal places within 10 km of a",
        " *  line, or any place within 20 km with a real business",
        " *  presence in the dataset). Names/coordinates are Census",
        " *  Bureau place centroids — nothing invented. */",
        'import type { City } from "./types";',
        "",
        "export const REGIONAL_TOWNS: City[] = [",
    ]
    for p in towns:
        full = f"{p['name']}, {p['state']}"
        lines.append(
            f'  {{ name: {json.dumps(full)}, shortName: {json.dumps(p["name"])}, '
            f"lat: {p['lat']:.4f}, lng: {p['lng']:.4f} }},"
        )
    lines.append("];")
    lines.append("")
    with open(os.path.join(ROOT, "src/lib/towns.ts"), "w") as f:
        f.write("\n".join(lines))
    print("wrote src/lib/towns.ts")


if __name__ == "__main__":
    sys.exit(main())
