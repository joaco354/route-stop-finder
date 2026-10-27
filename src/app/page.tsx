"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import ResultsCard from "@/components/ResultsCard";
import SearchPanel from "@/components/SearchPanel";
import type { MapAlternative } from "@/components/MapView";
import { isLiveCorridorPair, resolveCity } from "@/lib/cities";
import { derivePlan, type EvaluatedStopData } from "@/lib/live/derive";
import { formatDuration, MAX_STOPS } from "@/lib/scoring";
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

/** Routes with REAL data (Phase 3 beta): trips between the corridor
 *  cities in LIVE_CORRIDOR_CITIES (the Northeast region). */
function isLivePair(origin: string, destination: string): boolean {
  return isLiveCorridorPair(resolveCity(origin), resolveCity(destination));
}

const COVERAGE_NOTICE =
  "The beta covers the Northeast region — from Bangor, ME to Washington, DC, and from Buffalo and Pittsburgh across to Boston — including the major cities and towns in between. This route isn't covered yet — we're expanding coverage as the beta grows.";

interface LiveDataState extends EvaluatedStopData {
  provider: { id: string; label: string };
  stopMessages: string[];
}

/** Attach honest per-stop messages (e.g. unsupported business) to a derived plan. */
function applyLiveMessages(plan: MultiStopResult, stopMessages: string[]): MultiStopResult {
  plan.stops = plan.stops.map((entry, i) =>
    stopMessages[i] && !entry.chosen ? { ...entry, error: stopMessages[i] } : entry,
  );
  return plan;
}

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
  /** Evaluated REAL-data plan material (Boston ↔ DC), when available. */
  const [liveData, setLiveData] = useState<LiveDataState | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  /** Fetch a live plan from the server. On failure: show the reason and
   *  NO results — live mode never silently substitutes sample data. */
  const fetchLive = useCallback(
    async (nextStops: StopRequest[], nextOverrides: Array<string | null>) => {
      setLiveLoading(true);
      try {
        const res = await fetch("/api/live-find-stops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, destination, stops: nextStops, overrides: nextOverrides }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Live routing failed.");
          setNotice(null);
          setResult(null);
          setLiveData(null);
          return;
        }
        const data: LiveDataState = {
          route: json.route,
          candidatesByStop: json.candidatesByStop,
          provider: json.provider,
          stopMessages: json.stopMessages ?? [],
        };
        setLiveData(data);
        setError(null);
        setNotice(null);
        setResult(applyLiveMessages(derivePlan(data, nextStops, nextOverrides), data.stopMessages));
      } catch {
        setError(
          "Live routing is unreachable right now, so no results are shown — sample data is never presented as live data.",
        );
        setNotice(null);
        setResult(null);
        setLiveData(null);
      } finally {
        setLiveLoading(false);
      }
    },
    [origin, destination],
  );

  const runSearch = useCallback(
    (nextStops: StopRequest[] = stops, nextOverrides: Array<string | null> = overrides) => {
      if (isLivePair(origin, destination)) {
        void fetchLive(nextStops, nextOverrides);
        return;
      }
      // Public beta: routes outside the live coverage area get an honest
      // notice — sample results are never shown as if they were real.
      setNotice(COVERAGE_NOTICE);
      setError(null);
      setResult(null);
      setLiveData(null);
    },
    [origin, destination, stops, overrides, fetchLive],
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
      if (isLivePair(origin, destination)) {
        // Live mode: re-rank the already-evaluated real candidates locally.
        // No external API calls for slider movement (Phase 2C, Step 6).
        if (liveData) {
          setResult(
            applyLiveMessages(
              derivePlan(liveData, nextStops, nextOverrides),
              liveData.stopMessages,
            ),
          );
        }
      } else {
        runSearch(nextStops, nextOverrides);
      }
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

  /** True when live data is loaded (results now only ever come from live
   *  fetches — sample results are not shown in the beta). */
  const liveActive = liveData != null;

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
        <p className="mt-1 text-xs text-slate-400">
          Public beta — real data across the Northeast, from Bangor to Washington, DC and Buffalo to Boston.
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
            {liveLoading && (
              <p className="mt-3 text-center text-sm text-slate-500">Loading live route…</p>
            )}
            {result && (
              <>
                <p className="mt-3 text-center text-xs font-semibold">
                  <span className="text-emerald-600">● Live data — {liveData!.provider.label}</span>
                </p>
                <p className="mt-1 text-center text-sm text-slate-500">
                  Direct trip: {formatDuration(result.route.durationMinutes)} · {result.route.distanceMiles} mi
                </p>
                <p className="mt-1 text-center text-xs text-slate-400">
                  Driving times are estimates — no live traffic.
                </p>
              </>
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
        </div>

        <section>
          <MapView
            route={result?.route ?? null}
            stops={chosenStops}
            alternatives={mapAlternatives}
            onSelectAlternative={selectAlternative}
          />
          <p className="mt-2 text-center text-xs text-slate-400">
            Dashed = direct route · Blue = route via your stops (numbered, in order) ·{" "}
            {liveActive
              ? "Live route — Valhalla · Business data © OpenStreetMap contributors (ODbL)"
              : "Beta coverage: the Northeast region (Bangor ↔ Washington, DC ↔ Buffalo)"}
          </p>
        </section>
      </div>

      {/* Results BELOW the search + map row: on mobile the flow reads
          locations → trip info → map → stop picks, in that order. */}
      {result && (
        <div className="mx-auto mt-4 w-full max-w-3xl md:mt-6">
          <ResultsCard
            plan={result}
            originLabel={origin}
            destinationLabel={destination}
            onSelectAlternative={selectAlternative}
          />
        </div>
      )}
    </main>
  );
}
