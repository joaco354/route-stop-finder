"use client";

import { CITIES } from "@/lib/cities";
import { MAX_STOPS } from "@/lib/scoring";
import type { StopRequest } from "@/lib/types";
import QueryInput from "./QueryInput";
import TimeSlider from "./TimeSlider";

interface Props {
  origin: string;
  destination: string;
  /** 1..MAX_STOPS stop requests, visited in order between origin and destination. */
  stops: StopRequest[];
  /** Trip duration (for scaling each stop's time slider). Null before a route exists. */
  durationMinutes: number | null;
  onOrigin: (v: string) => void;
  onDestination: (v: string) => void;
  onStopQuery: (index: number, v: string) => void;
  onStopPreferred: (index: number, v: number | null) => void;
  onAddStop: () => void;
  onRemoveStop: (index: number) => void;
  onSubmit: () => void;
}

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200";
const labelCls = "block text-sm font-semibold text-slate-700";

export default function SearchPanel(p: Props) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        p.onSubmit();
      }}
    >
      <datalist id="city-suggestions">
        {CITIES.map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>

      <div>
        <label className={labelCls} htmlFor="origin">Starting Location</label>
        <input id="origin" className={inputCls} list="city-suggestions" placeholder="Where are you leaving from?" value={p.origin} onChange={(e) => p.onOrigin(e.target.value)} autoComplete="off" />
      </div>
      <div>
        <label className={labelCls} htmlFor="destination">Destination</label>
        <input id="destination" className={inputCls} list="city-suggestions" placeholder="Where are you going?" value={p.destination} onChange={(e) => p.onDestination(e.target.value)} autoComplete="off" />
      </div>

      {p.stops.map((stop, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-800">
              <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 align-middle text-[11px] font-bold text-white">
                {i + 1}
              </span>
              Stop {i + 1}
            </span>
            {p.stops.length > 1 && (
              <button
                type="button"
                onClick={() => p.onRemoveStop(i)}
                aria-label={`Remove stop ${i + 1}`}
                className="rounded-full px-2 py-0.5 text-lg leading-none text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                ×
              </button>
            )}
          </div>

          <div>
            <label className={labelCls} htmlFor={`query-${i}`}>Find Along Route</label>
            <QueryInput
              id={`query-${i}`}
              className={inputCls}
              placeholder="Start typing — McDonald's, Chick-fil-A, gas station…"
              value={stop.query}
              onChange={(v) => p.onStopQuery(i, v)}
            />
          </div>

          <TimeSlider
            id={`stop-time-${i}`}
            label={`When do you want stop ${i + 1}?`}
            durationMinutes={p.durationMinutes}
            value={stop.preferredStopMinutes ?? null}
            onChange={(v) => p.onStopPreferred(i, v)}
          />
        </div>
      ))}

      {p.stops.length < MAX_STOPS && (
        <button
          type="button"
          onClick={p.onAddStop}
          className="w-full rounded-xl border-2 border-dashed border-slate-300 py-2.5 text-sm font-semibold text-blue-700 hover:border-blue-400 hover:bg-blue-50"
        >
          + Add a stop
        </button>
      )}
      {p.stops.length >= MAX_STOPS && (
        <p className="text-center text-xs text-slate-400">Maximum of {MAX_STOPS} stops</p>
      )}

      <button type="submit" className="w-full rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white shadow hover:bg-blue-700 active:bg-blue-800">
        {p.stops.length > 1 ? "Find Best Stops" : "Find Best Stop"}
      </button>
    </form>
  );
}
