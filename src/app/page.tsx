"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import ResultsCard from "@/components/ResultsCard";
import SearchPanel from "@/components/SearchPanel";
import TimeSlider from "@/components/TimeSlider";
import { findStops, formatDuration } from "@/lib/scoring";
import type { FindStopsResult, RankedStop } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-200 text-slate-500 md:h-[520px]">
      Loading map…
    </div>
  ),
});

export default function HomePage() {
  const [origin, setOrigin] = useState("Boston, MA");
  const [destination, setDestination] = useState("Washington, DC");
  const [query, setQuery] = useState("McDonald's");
  const [preferred, setPreferred] = useState<number | null>(180); // ~3h into the example trip
  const [result, setResult] = useState<FindStopsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const runSearch = useCallback(() => {
    const res = findStops({ origin, destination, query, preferredStopMinutes: preferred });
    if ("error" in res) {
      setError(res.error);
      setResult(null);
      setSelectedId(null);
      return;
    }
    setError(null);
    setResult(res);
    setSelectedId(res.best?.id ?? null);
  }, [origin, destination, query, preferred]);

  // Auto-run the Boston → Washington, DC example on first load.
  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected: RankedStop | null = useMemo(() => {
    if (!result) return null;
    return result.ranked.find((s) => s.id === selectedId) ?? result.best;
  }, [result, selectedId]);

  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 md:py-8">
      <header className="mb-4 text-center md:mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Route Stop Finder</h1>
        <p className="mt-1 text-sm text-slate-600 md:text-base">
          The stop that adds the least driving time — near when you want to stop.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-[380px_1fr] md:gap-6">
        <div className="space-y-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <SearchPanel
              origin={origin}
              destination={destination}
              query={query}
              onOrigin={setOrigin}
              onDestination={setDestination}
              onQuery={setQuery}
              onSubmit={runSearch}
            />
            <div className="mt-4">
              <TimeSlider
                durationMinutes={result?.route.durationMinutes ?? null}
                value={preferred}
                onChange={(v) => setPreferred(v)}
              />
            </div>
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
          </section>

          {result && result.best && selected && (
            <ResultsCard
              route={result.route}
              best={result.best}
              alternatives={result.ranked.slice(1, 4)}
              selected={selected}
              onSelect={(s) => setSelectedId(s.id)}
              originLabel={origin}
              destinationLabel={destination}
            />
          )}
        </div>

        <section>
          <MapView
            route={result?.route ?? null}
            candidates={result?.ranked ?? []}
            selected={selected}
            onSelect={(s) => setSelectedId(s.id)}
          />
          <p className="mt-2 text-center text-xs text-slate-400">
            Dashed = direct route · Blue = route via the selected stop · Sample data for the prototype
          </p>
        </section>
      </div>
    </main>
  );
}
