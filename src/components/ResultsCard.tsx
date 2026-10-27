"use client";

import { buildGoogleMapsDirectionsUrl } from "@/lib/googleMaps";
import { formatDuration } from "@/lib/scoring";
import type { MultiStopResult, PlannedStop } from "@/lib/types";

interface Props {
  plan: MultiStopResult;
  originLabel: string;
  destinationLabel: string;
  /** Called when the user taps an alternative for a stop — re-plans later stops. */
  onSelectAlternative: (stopIndex: number, stop: PlannedStop) => void;
}

function StopDetails({ stop }: { stop: PlannedStop }) {
  return (
    <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
      <div className="rounded-lg bg-slate-50 p-2">
        <dt className="text-[11px] uppercase tracking-wide text-slate-500">Reach it in</dt>
        <dd className="text-sm font-semibold text-slate-900">{formatDuration(stop.arrivalMinutes)}</dd>
      </div>
      <div className="rounded-lg bg-slate-50 p-2">
        <dt className="text-[11px] uppercase tracking-wide text-slate-500">Added detour</dt>
        <dd className="text-sm font-semibold text-slate-900">+{stop.detourMinutes} min</dd>
      </div>
      <div className="rounded-lg bg-slate-50 p-2">
        <dt className="text-[11px] uppercase tracking-wide text-slate-500">If picked, total</dt>
        <dd className="text-sm font-semibold text-slate-900">{formatDuration(stop.totalMinutes)}</dd>
      </div>
    </dl>
  );
}

function NumberBadge({ n }: { n: number }) {
  return (
    <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 align-middle text-[11px] font-bold text-white">
      {n}
    </span>
  );
}

export default function ResultsCard({ plan, originLabel, destinationLabel, onSelectAlternative }: Props) {
  const chosenStops = plan.stops.flatMap((s) => (s.chosen ? [s.chosen] : []));
  const mapsUrl = buildGoogleMapsDirectionsUrl({
    origin: originLabel,
    destination: destinationLabel,
    waypoints: chosenStops,
  });
  const waypointCaption =
    chosenStops.length > 0
      ? [originLabel, ...chosenStops.map((s) => s.name), destinationLabel].join(" → ")
      : `${originLabel} → ${destinationLabel}`;

  return (
    <section className="space-y-3">
      {/* Trip summary */}
      <article className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Trip summary</h2>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 p-2">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">Direct trip</dt>
            <dd className="text-sm font-semibold text-slate-900">{formatDuration(plan.summary.baseMinutes)}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-2">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">Stops add</dt>
            <dd className="text-sm font-semibold text-slate-900">+{plan.summary.totalDetourMinutes} min</dd>
          </div>
          <div className="rounded-lg bg-blue-50 p-2">
            <dt className="text-[11px] uppercase tracking-wide text-blue-600">Total journey</dt>
            <dd className="text-sm font-bold text-blue-900">{formatDuration(plan.summary.totalMinutes)}</dd>
          </div>
        </dl>
      </article>

      {plan.stops.map((entry, i) =>
        entry.chosen ? (
          <article key={i} className="rounded-2xl border-2 border-blue-600 bg-blue-50/60 p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
              <NumberBadge n={i + 1} /> Stop {i + 1} · Best pick
            </p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">{entry.chosen.name}</h3>
            {entry.chosen.address ? (
              <p className="text-sm text-slate-600">{entry.chosen.address}</p>
            ) : (
              <p className="text-sm text-slate-400">Address not listed — exact location on the map pin</p>
            )}
            <StopDetails stop={entry.chosen} />

            {entry.alternatives.length > 0 && (
              <div className="mt-3 space-y-2">
                <h4 className="text-sm font-semibold text-slate-700">Alternatives for stop {i + 1}</h4>
                {entry.alternatives.map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
                    onClick={() => onSelectAlternative(i, stop)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-blue-400"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-slate-900">{stop.name}</span>
                      <span className="shrink-0 text-sm font-medium text-slate-600">+{stop.detourMinutes} min</span>
                    </div>
                    <p className="text-sm text-slate-500">
                      {stop.address || "Address not listed — see map pin"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Reach it in {formatDuration(stop.arrivalMinutes)} · total {formatDuration(stop.totalMinutes)} — tap to use this one instead
                    </p>
                  </button>
                ))}
              </div>
            )}
          </article>
        ) : (
          <article key={i} role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
              <NumberBadge n={i + 1} /> Stop {i + 1} · Not placed
            </p>
            <p className="mt-1 text-sm text-amber-800">{entry.error}</p>
          </article>
        ),
      )}

      {chosenStops.length > 0 && (
        <>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="block w-full rounded-xl bg-green-600 py-3 text-center text-base font-semibold text-white shadow hover:bg-green-700">
            Open in Google Maps
          </a>
          <p className="text-center text-xs text-slate-400">Navigates {waypointCaption}</p>
        </>
      )}
    </section>
  );
}
