"use client";

import { formatDuration } from "@/lib/scoring";

interface Props {
  /** Trip duration in minutes — the slider scales to this. Null before a route exists. */
  durationMinutes: number | null;
  /** Preferred stop time in minutes from start, or null when unset (optional). */
  value: number | null;
  onChange: (v: number | null) => void;
  /** Unique input id — set per stop when several sliders are on the page. */
  id?: string;
  /** Label text (defaults to the original wording). */
  label?: string;
}

export default function TimeSlider({ durationMinutes, value, onChange, id = "stop-time", label = "When do you want to stop?" }: Props) {
  const max = durationMinutes ?? 600;
  const enabled = value != null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-slate-700" htmlFor={id}>
          {label} <span className="font-normal text-slate-400">(optional)</span>
        </label>
        {enabled ? (
          <button type="button" onClick={() => onChange(null)} className="text-sm font-medium text-blue-600 underline">
            Clear
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onChange(Math.round(max / 3))}
            className="text-sm font-medium text-blue-600 underline"
          >
            Set a time
          </button>
        )}
      </div>

      {enabled ? (
        <>
          <input
            id={id}
            type="range"
            min={0}
            max={max}
            step={5}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="mt-3 w-full accent-blue-600"
          />
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>Start</span>
            <span className="text-sm font-semibold text-slate-800">About {formatDuration(value)} in</span>
            <span>{durationMinutes ? formatDuration(durationMinutes) : "End"}</span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          No preference — we&apos;ll just find the stop with the smallest detour.
        </p>
      )}
    </div>
  );
}
