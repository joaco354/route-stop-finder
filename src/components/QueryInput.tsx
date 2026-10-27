"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeSearchText } from "@/lib/scoring";

export interface Suggestion {
  label: string;
  kind: "brand" | "category";
  count: number;
}

/**
 * Rank suggestions for what the user has typed: prefix matches first,
 * then other contains-matches, biggest location count first inside
 * each group. Matching is punctuation-insensitive via the same
 * normalization the search itself uses, so "chik" surfaces
 * Chick-fil-A and "dunkin" surfaces Dunkin'.
 */
export function rankSuggestions(
  all: Suggestion[],
  rawQuery: string,
  limit = 8,
): Suggestion[] {
  const q = normalizeSearchText(rawQuery).replace(/\s+/g, "");
  if (!q) return [];
  const prefix: Suggestion[] = [];
  const contains: Suggestion[] = [];
  for (const s of all) {
    const label = normalizeSearchText(s.label).replace(/\s+/g, "");
    if (label.startsWith(q)) prefix.push(s);
    else if (label.includes(q)) contains.push(s);
  }
  const byCount = (a: Suggestion, b: Suggestion) => b.count - a.count;
  const ranked = [...prefix.sort(byCount), ...contains.sort(byCount)];
  if (ranked.length >= 3 || q.length < 3) return ranked.slice(0, limit);
  // Sparse results: add subsequence matches so a near-miss spelling
  // still discovers the brand ("chik" → Chick-fil-A, whose compact
  // form contains c-h-i-…-k in order).
  const fuzzy = all
    .filter((s) => !ranked.includes(s))
    .filter((s) => isSubsequence(q, normalizeSearchText(s.label).replace(/\s+/g, "")))
    .sort(byCount);
  return [...ranked, ...fuzzy].slice(0, limit);
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (const ch of haystack) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return i === needle.length;
}

/* The index is fetched once per page load and shared by every stop
 * input (module-level promise). Failure just means no dropdown. */
let indexPromise: Promise<Suggestion[]> | null = null;
function loadIndex(): Promise<Suggestion[]> {
  if (!indexPromise) {
    indexPromise = fetch("/api/suggestions")
      .then((r) => (r.ok ? (r.json() as Promise<Suggestion[]>) : []))
      .catch(() => []);
  }
  return indexPromise;
}

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}

export default function QueryInput({ id, value, onChange, className, placeholder }: Props) {
  const [index, setIndex] = useState<Suggestion[] | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    loadIndex().then((s) => {
      if (live) setIndex(s);
    });
    return () => {
      live = false;
    };
  }, []);

  const matches = open && index ? rankSuggestions(index, value) : [];
  const showEmpty = open && index !== null && value.trim().length >= 2 && matches.length === 0;
  const showDropdown = matches.length > 0 || showEmpty;

  const pick = (s: Suggestion) => {
    onChange(s.label);
    setOpen(false);
    inputRef.current?.focus();
  };

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
        onFocus={() => setOpen(true)}
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
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.map((s, i) => (
            <li key={s.label} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-base ${
                  i === highlight ? "bg-blue-50" : "bg-white"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // beat the input blur
                  pick(s);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="text-slate-900">{s.label}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {s.kind === "category" ? "category · " : ""}
                  {s.count.toLocaleString()} places
                </span>
              </button>
            </li>
          ))}
          {showEmpty && (
            <li className="px-4 py-3 text-sm text-slate-500">
              Not in the beta dataset yet — try a category like
              restaurant, coffee shop, or gas station.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
