"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RankedStop, RouteInfo } from "@/lib/types";

interface Props {
  route: RouteInfo | null;
  candidates: RankedStop[];
  selected: RankedStop | null;
  onSelect: (stop: RankedStop) => void;
}

/**
 * Leaflet + OpenStreetMap map (no API key needed).
 * Direct route = dashed grey polyline. Route via the selected stop = solid blue.
 * Stops are circle markers (avoids Leaflet's default-icon asset issues in Next).
 */
export default function MapView({ route, candidates, selected, onSelect }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

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

    // Route via selected stop (solid): insert the stop at its nearest
    // point on the direct path so the blue line passes through it.
    if (selected) {
      const viaPath = buildViaPath(route, selected);
      L.polyline(viaPath, { color: "#2563eb", weight: 5 }).addTo(layers);
    }

    pin(route.origin.lat, route.origin.lng, "#16a34a", 9, `Start: ${route.origin.name}`).addTo(layers);
    pin(route.destination.lat, route.destination.lng, "#dc2626", 9, `Destination: ${route.destination.name}`).addTo(layers);

    candidates.forEach((stop) => {
      const isSelected = selected?.id === stop.id;
      const marker = pin(stop.lat, stop.lng, isSelected ? "#2563eb" : "#f59e0b", isSelected ? 10 : 7, stop.name);
      marker.on("click", () => onSelectRef.current(stop));
      marker.addTo(layers);
    });

    const bounds = L.latLngBounds(route.path.map(([lat, lng]) => [lat, lng] as [number, number]));
    candidates.forEach((s) => bounds.extend([s.lat, s.lng]));
    map.fitBounds(bounds.pad(0.08));
  }, [route, candidates, selected]);

  return <div ref={divRef} className="h-[380px] w-full rounded-2xl border border-slate-200 shadow-sm md:h-[520px]" aria-label="Route map" />;
}

function buildViaPath(route: RouteInfo, selected: RankedStop): [number, number][] {
  // Insert the stop into the route path at the position closest to it,
  // so the blue line visually passes through the stop.
  let bestIdx = 0;
  let bestDist = Infinity;
  route.path.forEach(([lat, lng], i) => {
    const d = Math.hypot(lat - selected.lat, lng - selected.lng);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  });
  return [
    ...route.path.slice(0, bestIdx + 1),
    [selected.lat, selected.lng] as [number, number],
    ...route.path.slice(bestIdx + 1),
  ];
}
