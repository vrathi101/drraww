"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { TLEditorSnapshot, TLStoreSnapshot } from "tldraw";

const ReadOnlyViewer = dynamic(() => import("tldraw").then((m) => m.Tldraw), {
  ssr: false,
});

type ShareResponse = {
  allow_edit: boolean;
  note: { id: string; title: string; doc: unknown; updated_at: string };
};

function coerceSnapshot(value: unknown): TLEditorSnapshot | TLStoreSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  if ("document" in (value as Record<string, unknown>)) return value as TLEditorSnapshot;
  if ("store" in (value as Record<string, unknown>)) return value as TLStoreSnapshot;
  return undefined;
}

export default function ShareClient({ token }: { token: string }) {
  const [data, setData] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");

  const fetchNote = async (pw?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/${token}`, {
        headers: pw ? { "x-share-password": pw } : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Unable to load note");
      }
      const payload = (await res.json()) as ShareResponse;
      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Unable to load note");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const snapshot = useMemo(() => coerceSnapshot(data?.note.doc), [data?.note.doc]);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Shared note</p>
          <h1 className="text-2xl font-semibold text-slate-900">{data?.note.title || "Untitled"}</h1>
          <p className="text-sm text-slate-600">{data?.allow_edit ? "Can edit" : "View only"}</p>
        </div>
        <a
          href={`/app/note/${data?.note.id ?? ""}`}
          className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:border-amber-300"
        >
          Open in app
        </a>
      </div>
      {loading ? <p className="text-sm text-slate-600">Loading…</p> : null}
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => fetchNote(password || undefined)}
              className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800"
            >
              Retry
            </button>
          </div>
          {error === "Password required" ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none"
                placeholder="Enter password"
              />
              <button
                type="button"
                onClick={() => fetchNote(password)}
                className="rounded-full bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Submit
              </button>
            </div>
          ) : null}
        </div>
      )}
      {data ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
          <div className="h-[70vh] w-full">
            <ReadOnlyViewer
              persistenceKey={`share:${token}`}
              onMount={(editor) => {
                if (snapshot) editor.loadSnapshot(snapshot, { forceOverwriteSessionState: true });
                editor.updateInstanceState({ isReadonly: !data.allow_edit });
              }}
              inferDarkMode={false}
              hideUi={!data.allow_edit}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
