"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import ResultsCard from "@/components/ResultsCard";
import SearchPanel from "@/components/SearchPanel";
import type { MapAlternative } from "@/components/MapView";
import { findMultiStops, formatDuration, MAX_STOPS } from "@/lib/scoring";
import type { MultiStopResult, PlannedStop, StopRequest } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-200 text-slate-500 md:h-[520px]">
      Loading map…
    </div>
  ),
});

const INITIAL_STOPS: StopRequest[] = [{ query: "McDonald's", preferredStopMinutes: 180 }];

export default function HomePage() {
  const [origin, setOrigin] = useState("Boston, MA");
  const [destination, setDestination] = useState("Washington, DC");
  const [stops, setStops] = useState<StopRequest[]>(INITIAL_STOPS);
  /** Pinned candidate ids per stop index (set when the user taps an alternative). */
  const [overrides, setOverrides] = useState<Array<string | null>>([null]);
  const [result, setResult] = useState<MultiStopResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Friendly "not covered by sample data yet" message (not an error). */
  const [notice, setNotice] = useState<string | null>(null);

  const runSearch = useCallback(
    (nextStops: StopRequest[] = stops, nextOverrides: Array<string | null> = overrides) => {
      const res = findMultiStops(
        { origin, destination, stops: nextStops },
        nextOverrides,
      );
      if ("error" in res) {
        setError(res.error);
        setNotice(null);
        setResult(null);
        return;
      }
      if ("unsupported" in res) {
        setNotice(res.unsupported);
        setError(null);
        setResult(null);
        return;
      }
      setError(null);
      setNotice(null);
      setResult(res);
    },
    [origin, destination, stops, overrides],
  );

  // Auto-run the Boston → Washington, DC example on first load.
  useEffect(() => {
    runSearch(INITIAL_STOPS, [null]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStop = (index: number, patch: Partial<StopRequest>) => {
    const nextStops = stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
    // Editing a stop's request unpins its choice (it re-plans on next search).
    const nextOverrides = overrides.map((o, i) => (i === index ? null : o));
    setStops(nextStops);
    setOverrides(nextOverrides);
    // Moving the preferred-time slider (or clearing / setting it) re-ranks
    // IMMEDIATELY — recommendations, highlight and map follow the slider
    // without waiting for the Find button. Query text still applies on submit.
    if ("preferredStopMinutes" in patch) {
      runSearch(nextStops, nextOverrides);
    }
  };

  const addStop = () => {
    if (stops.length >= MAX_STOPS) return;
    setStops([...stops, { query: "", preferredStopMinutes: null }]);
    setOverrides([...overrides, null]);
  };

  const removeStop = (index: number) => {
    if (stops.length <= 1) return;
    setStops(stops.filter((_, i) => i !== index));
    setOverrides(overrides.filter((_, i) => i !== index));
  };

  /** Pin an alternative for one stop and re-plan (earlier stops stay fixed,
   *  later stops are re-selected after the new choice). */
  const selectAlternative = useCallback(
    (stopIndex: number, stop: PlannedStop) => {
      const nextOverrides = overrides.map((o, i) => (i === stopIndex ? stop.id : o));
      setOverrides(nextOverrides);
      runSearch(stops, nextOverrides);
    },
    [overrides, stops, runSearch],
  );

  const chosenStops: PlannedStop[] = useMemo(
    () => (result ? result.stops.flatMap((s) => (s.chosen ? [s.chosen] : [])) : []),
    [result],
  );

  const mapAlternatives: MapAlternative[] = useMemo(
    () =>
      result
        ? result.stops.flatMap((entry, stopIndex) =>
            entry.alternatives.map((stop) => ({ stopIndex, stop })),
          )
        : [],
    [result],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 md:py-8">
      <header className="mb-4 text-center md:mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Route Stop Finder</h1>
        <p className="mt-1 text-sm text-slate-600 md:text-base">
          The stops that add the least driving time — near when you want to stop.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-[380px_1fr] md:gap-6">
        <div className="space-y-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <SearchPanel
              origin={origin}
              destination={destination}
              stops={stops}
              durationMinutes={result?.route.durationMinutes ?? null}
              onOrigin={setOrigin}
              onDestination={setDestination}
              onStopQuery={(i, v) => updateStop(i, { query: v })}
              onStopPreferred={(i, v) => updateStop(i, { preferredStopMinutes: v })}
              onAddStop={addStop}
              onRemoveStop={removeStop}
              onSubmit={() => runSearch()}
            />
            {result && (
              <p className="mt-3 text-center text-sm text-slate-500">
                Direct trip: {formatDuration(result.route.durationMinutes)} · {result.route.distanceMiles} mi
                {!result.route.isSampleCorridor && " (estimated)"}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
                {notice}
              </p>
            )}
          </section>

          {result && (
            <ResultsCard
              plan={result}
              originLabel={origin}
              destinationLabel={destination}
              onSelectAlternative={selectAlternative}
            />
          )}
        </div>

        <section>
          <MapView
            route={result?.route ?? null}
            stops={chosenStops}
            alternatives={mapAlternatives}
            onSelectAlternative={selectAlternative}
          />
          <p className="mt-2 text-center text-xs text-slate-400">
            Dashed = direct route · Blue = route via your stops (numbered, in order) · Sample data for the prototype
          </p>
        </section>
      </div>
    </main>
  );
}
