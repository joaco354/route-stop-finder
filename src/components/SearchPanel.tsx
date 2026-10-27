"use client";

import { CITIES } from "@/lib/cities";

export const QUICK_QUERIES = [
  "McDonald's",
  "Starbucks",
  "gas station",
  "coffee",
  "hotel",
  "pharmacy",
  "grocery",
];

interface Props {
  origin: string;
  destination: string;
  query: string;
  onOrigin: (v: string) => void;
  onDestination: (v: string) => void;
  onQuery: (v: string) => void;
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
      <div>
        <label className={labelCls} htmlFor="query">Find Along Route</label>
        <input id="query" className={inputCls} placeholder="McDonald's, Starbucks, gas station, hotel…" value={p.query} onChange={(e) => p.onQuery(e.target.value)} autoComplete="off" />
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => p.onQuery(q)}
              className={`rounded-full border px-3 py-1 text-sm ${
                p.query === q
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      <button type="submit" className="w-full rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white shadow hover:bg-blue-700 active:bg-blue-800">
        Find Best Stop
      </button>
    </form>
  );
}
