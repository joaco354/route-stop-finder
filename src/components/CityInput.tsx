"use client";

import { useRef, useState } from "react";
import { CITIES, LIVE_CORRIDOR_CITIES } from "@/lib/cities";
import { normalizeSearchText } from "@/lib/scoring";
import type { City } from "@/lib/types";

interface RankedCity {
  city: City;
  live: boolean;
}

const MAX_ROWS = 80;

/**
 * Rank endpoint options for the dropdown. Live (beta-region) places
 * always sort ahead of outside places; inside each group, prefix
 * matches beat contains matches. An empty query browses the whole
 * list — live places first, in list order (major cities, then towns
 * A–Z by state) — so users can SEE what's available instead of
 * guessing names.
 */
export function rankCities(rawQuery: string, limit = MAX_ROWS): RankedCity[] {
  const q = normalizeSearchText(rawQuery).replace(/\s+/g, "");
  const all: RankedCity[] = CITIES.map((city) => ({
    city,
    live: LIVE_CORRIDOR_CITIES.has(city.name),
  }));
  if (!q) {
    const live = all.filter((r) => r.live);
    const outside = all.filter((r) => !r.live);
    return [...live, ...outside].slice(0, limit);
  }
  const prefix: RankedCity[] = [];
  const contains: RankedCity[] = [];
  for (const r of all) {
    const name = normalizeSearchText(r.city.name).replace(/\s+/g, "");
    const short = normalizeSearchText(r.city.shortName).replace(/\s+/g, "");
    if (name.startsWith(q) || short.startsWith(q)) prefix.push(r);
    else if (name.includes(q) || short.includes(q)) contains.push(r);
  }
  const liveFirst = (a: RankedCity, b: RankedCity) =>
    Number(b.live) - Number(a.live);
  return [...prefix.sort(liveFirst), ...contains.sort(liveFirst)].slice(0, limit);
}

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}

export default function CityInput({ id, value, onChange, className, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = open ? rankCities(value) : [];
  const showDropdown = open && matches.length > 0;
  const totalLive = LIVE_CORRIDOR_CITIES.size;
  const truncated = open && value.trim() === "" && totalLive > MAX_ROWS;

  const pick = (r: RankedCity) => {
    onChange(r.city.name);
    setOpen(false);
    inputRef.current?.focus();
  };

  let lastGroup: string | null = null;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={`${id}-listbox`}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => {
          setOpen(true);
          setHighlight(0);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showDropdown) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && matches[highlight]) {
            e.preventDefault();
            pick(matches[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showDropdown && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.map((r, i) => {
            const group = r.live ? "Beta region — live data" : "Outside the beta region";
            const header = group !== lastGroup ? group : null;
            lastGroup = group;
            return (
              <li key={r.city.name} role="option" aria-selected={i === highlight}>
                {header && (
                  <div className="px-4 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {header}
                  </div>
                )}
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-base ${
                    i === highlight ? "bg-blue-50" : "bg-white"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault(); // beat the input blur
                    pick(r);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                >
                  <span className="text-slate-900">{r.city.name}</span>
                  <span
                    className={`shrink-0 text-xs ${r.live ? "font-semibold text-emerald-600" : "text-slate-400"}`}
                  >
                    {r.live ? "● live" : "not covered yet"}
                  </span>
                </button>
              </li>
            );
          })}
          {truncated && (
            <li className="px-4 py-2.5 text-sm text-slate-400">
              Showing the first {MAX_ROWS} of {totalLive.toLocaleString()} places in the
              region — start typing to narrow the list.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
