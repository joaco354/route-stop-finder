"use client";

import { buildGoogleMapsDirectionsUrl } from "@/lib/googleMaps";
import { formatDuration } from "@/lib/scoring";
import type { RankedStop, RouteInfo } from "@/lib/types";

interface Props {
  route: RouteInfo;
  best: RankedStop;
  alternatives: RankedStop[];
  selected: RankedStop;
  onSelect: (stop: RankedStop) => void;
  originLabel: string;
  destinationLabel: string;
}

function StopDetails({ stop }: { stop: RankedStop }) {
  return (
    <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-lg bg-slate-50 p-2">
        <dt className="text-[11px] uppercase tracking-wide text-slate-500">Reach it in</dt>
        <dd className="text-sm font-semibold text-slate-900">{formatDuration(stop.minutesFromStart)}</dd>
      </div>
      <div className="rounded-lg bg-slate-50 p-2">
        <dt className="text-[11px] uppercase tracking-wide text-slate-500">Added detour</dt>
        <dd className="text-sm font-semibold text-slate-900">+{stop.detourMinutes} min</dd>
      </div>
      <div className="rounded-lg bg-slate-50 p-2">
        <dt className="text-[11px] uppercase tracking-wide text-slate-500">Total trip</dt>
        <dd className="text-sm font-semibold text-slate-900">{formatDuration(stop.totalMinutes)}</dd>
      </div>
    </dl>
  );
}

export default function ResultsCard({ route, best, alternatives, selected, onSelect, originLabel, destinationLabel }: Props) {
  const mapsUrl = buildGoogleMapsDirectionsUrl({
    origin: originLabel,
    destination: destinationLabel,
    waypoint: selected,
  });

  return (
    <section className="space-y-3">
      <article className={`rounded-2xl border-2 p-4 shadow-sm ${selected.id === best.id ? "border-blue-600 bg-blue-50/60" : "border-slate-200 bg-white"}`}>
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">★ Best stop</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{best.name}</h2>
        <p className="text-sm text-slate-600">{best.address}</p>
        <StopDetails stop={best} />
        {selected.id !== best.id && (
          <button type="button" onClick={() => onSelect(best)} className="mt-3 text-sm font-medium text-blue-600 underline">
            Show this stop on the map
          </button>
        )}
      </article>

      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="block w-full rounded-xl bg-green-600 py-3 text-center text-base font-semibold text-white shadow hover:bg-green-700">
        Open in Google Maps
      </a>
      <p className="text-center text-xs text-slate-400">
        Navigates {originLabel} → {selected.name} → {destinationLabel}
      </p>

      {alternatives.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700">Alternatives</h3>
          {alternatives.map((stop) => (
            <button
              key={stop.id}
              type="button"
              onClick={() => onSelect(stop)}
              className={`w-full rounded-xl border p-3 text-left shadow-sm ${
                selected.id === stop.id ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-slate-900">{stop.name}</span>
                <span className="shrink-0 text-sm font-medium text-slate-600">+{stop.detourMinutes} min</span>
              </div>
              <p className="text-sm text-slate-500">{stop.address}</p>
              <p className="mt-1 text-xs text-slate-500">
                {formatDuration(stop.minutesFromStart)} in · total {formatDuration(stop.totalMinutes)}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
