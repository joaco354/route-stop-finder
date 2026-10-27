"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PlannedStop, RouteInfo } from "@/lib/types";

export interface MapAlternative {
  stopIndex: number;
  stop: PlannedStop;
}

interface Props {
  route: RouteInfo | null;
  /** Chosen stops, in visit order — drawn as numbered markers. */
  stops: PlannedStop[];
  /** Alternatives (small amber markers); clicking one selects it for its stop. */
  alternatives: MapAlternative[];
  onSelectAlternative: (stopIndex: number, stop: PlannedStop) => void;
}

/**
 * Leaflet + OpenStreetMap map (no API key needed).
 * Direct route = dashed grey polyline. Optimized route = solid blue polyline
 * through A → Stop 1 → Stop 2 → … → B. Chosen stops are numbered markers
 * matching the numbers on the result cards.
 */
export default function MapView({ route, stops, alternatives, onSelectAlternative }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelectAlternative);
  onSelectRef.current = onSelectAlternative;

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current).setView([39.5, -98.35], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers || !route) return;
    layers.clearLayers();

    const pin = (lat: number, lng: number, color: string, radius: number, label: string) =>
      L.circleMarker([lat, lng], {
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
        radius,
      }).bindTooltip(label);

    // Direct route (dashed)
    L.polyline(route.path, { color: "#94a3b8", weight: 4, dashArray: "8 8" }).addTo(layers);

    // Optimized route (solid): through every chosen stop, in order.
    if (stops.length > 0) {
      L.polyline(buildViaPath(route, stops), { color: "#2563eb", weight: 5 }).addTo(layers);
    }

    pin(route.origin.lat, route.origin.lng, "#16a34a", 9, `Start: ${route.origin.name}`).addTo(layers);
    pin(route.destination.lat, route.destination.lng, "#dc2626", 9, `Destination: ${route.destination.name}`).addTo(layers);

    alternatives.forEach(({ stopIndex, stop }) => {
      const marker = pin(stop.lat, stop.lng, "#f59e0b", 7, `${stop.name} (alternative for stop ${stopIndex + 1})`);
      marker.on("click", () => onSelectRef.current(stopIndex, stop));
      marker.addTo(layers);
    });

    stops.forEach((stop, i) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:26px;height:26px;border-radius:9999px;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;font:700 13px/22px system-ui,sans-serif;text-align:center">${i + 1}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([stop.lat, stop.lng], { icon })
        .bindTooltip(`Stop ${i + 1}: ${stop.name}`)
        .addTo(layers);
    });

    const bounds = L.latLngBounds(route.path.map(([lat, lng]) => [lat, lng] as [number, number]));
    stops.forEach((s) => bounds.extend([s.lat, s.lng]));
    alternatives.forEach(({ stop }) => bounds.extend([stop.lat, stop.lng]));
    map.fitBounds(bounds.pad(0.08));
  }, [route, stops, alternatives]);

  return <div ref={divRef} className="h-[380px] w-full rounded-2xl border border-slate-200 shadow-sm md:h-[520px]" aria-label="Route map" />;
}

/**
 * Build the via-stop polyline: splice each stop into the direct path at the
 * nearest path vertex, keeping insertion points in route order (each stop
 * searches from the previous stop's insertion point onwards).
 */
function buildViaPath(route: RouteInfo, stops: PlannedStop[]): [number, number][] {
  const result: [number, number][] = [];
  let cursor = 0; // index into route.path up to which points are already emitted

  stops.forEach((stop) => {
    let bestIdx = cursor;
    let bestDist = Infinity;
    for (let i = cursor; i < route.path.length; i++) {
      const [lat, lng] = route.path[i];
      const d = Math.hypot(lat - stop.lat, lng - stop.lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    for (let i = cursor; i <= bestIdx; i++) result.push(route.path[i]);
    result.push([stop.lat, stop.lng]);
    cursor = bestIdx + 1;
  });

  for (let i = cursor; i < route.path.length; i++) result.push(route.path[i]);
  return result;
}
