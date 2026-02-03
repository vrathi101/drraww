"use client";

import { createNoteAction, searchNotesAction } from "@/app/app/actions";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

type SearchResult = {
  id: string;
  title: string;
  updated_at: string;
  folder_id: string | null;
  is_pinned: boolean;
  last_opened_at: string | null;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const visibleResults = useMemo(() => results.slice(0, 10), [results]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      startTransition(async () => {
        try {
          const { results: data } = await searchNotesAction(query.trim());
          setResults(data as SearchResult[]);
          setActive(0);
        } catch (err) {
          console.error("search failed", err);
        }
      });
    }, 200);
  }, [open, query]);

  const handleSelect = (noteId: string) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(`/app/note/${noteId}`);
  };

  const handleNewNote = () => {
    startTransition(async () => {
      const { noteId } = await createNoteAction();
      setOpen(false);
      setQuery("");
      router.push(`/app/note/${noteId}`);
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes or type a command"
            className="w-full bg-transparent text-sm text-slate-900 outline-none"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Esc
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto px-2 py-2">
          <button
            type="button"
            onClick={handleNewNote}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
          >
            + New note
            <span className="text-xs text-slate-500">Enter</span>
          </button>
          {isPending && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
          {!isPending && visibleResults.length === 0 && query.trim() && (
            <div className="px-3 py-2 text-xs text-slate-500">No matches</div>
          )}
          {visibleResults.map((res, idx) => (
            <button
              key={res.id}
              type="button"
              onClick={() => handleSelect(res.id)}
              onMouseEnter={() => setActive(idx)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                active === idx ? "bg-amber-50" : "hover:bg-slate-100"
              }`}
            >
              <div>
                <div className="font-semibold text-slate-900">{res.title || "Untitled"}</div>
                <div className="text-xs text-slate-500">Updated {formatUpdatedAt(res.updated_at)}</div>
              </div>
              {res.is_pinned ? <span className="text-[11px] font-semibold text-amber-700">Pinned</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatUpdatedAt(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "just now";
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
