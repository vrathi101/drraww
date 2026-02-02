"use client";

import { renameNoteAction } from "@/app/app/actions";
import { useSupabase } from "@/components/supabase-provider";
import {
  type Editor,
  type TLEditorSnapshot,
  type TLStoreSnapshot,
} from "tldraw";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import "tldraw/tldraw.css";

const Tldraw = dynamic(() => import("tldraw").then((mod) => mod.Tldraw), {
  ssr: false,
});

type SaveState = "idle" | "saving" | "saved" | "offline" | "error";

type NoteEditorProps = {
  noteId: string;
  initialTitle: string;
  initialSnapshot: unknown;
  initialUpdatedAt: string;
};

const AUTOSAVE_DEBOUNCE_MS = 1200;
const AUTOSAVE_HEARTBEAT_MS = 20000;

export function NoteEditor({
  noteId,
  initialTitle,
  initialSnapshot,
  initialUpdatedAt,
}: NoteEditorProps) {
  const snapshot = useMemo(() => coerceSnapshot(initialSnapshot), [initialSnapshot]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
        <Link
          href="/app"
          className="text-sm font-semibold text-amber-700 hover:text-amber-800"
        >
          ← Back
        </Link>
        <EditableTitle noteId={noteId} initialTitle={initialTitle} />
        <div className="flex flex-1 justify-end">
          <SaveIndicator noteId={noteId} />
        </div>
      </header>
      <div className="flex min-h-[75vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
        <EditorShell
          noteId={noteId}
          initialSnapshot={snapshot}
          initialUpdatedAt={initialUpdatedAt}
        />
      </div>
    </div>
  );
}

function EditableTitle({
  noteId,
  initialTitle,
}: {
  noteId: string;
  initialTitle: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [isPending, startTransition] = useTransition();

  const handleCommit = useCallback(
    (next: string) => {
      const trimmed = next.trim() || "Untitled";
      setTitle(trimmed);
      startTransition(async () => {
        await renameNoteAction(noteId, trimmed);
      });
    },
    [noteId],
  );

  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-inner">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={(e) => handleCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="w-64 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
        placeholder="Untitled"
        aria-label="Note title"
        disabled={isPending}
      />
      {isPending ? (
        <span className="text-xs font-medium text-slate-500">Saving...</span>
      ) : null}
    </div>
  );
}

function SaveIndicator({ noteId }: { noteId: string }) {
  const persistenceKey = useMemo(() => `note:${noteId}:snapshot`, [noteId]);
  const [status, setStatus] = useState<SaveState>("saved");
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  useEffect(() => {
    const handler = (event: CustomEvent<{ status: SaveState; savedAt?: number }>) => {
      setStatus(event.detail.status);
      if (event.detail.savedAt) {
        setLastSaved(event.detail.savedAt);
      }
    };
    window.addEventListener(`note-save:${persistenceKey}`, handler as EventListener);
    return () =>
      window.removeEventListener(`note-save:${persistenceKey}`, handler as EventListener);
  }, [persistenceKey]);

  const label = (() => {
    switch (status) {
      case "saving":
        return "Saving…";
      case "saved":
        return lastSaved ? `Saved ${relativeTime(lastSaved)}` : "Saved";
      case "offline":
        return "Offline — retrying";
      case "error":
        return "Save failed";
      default:
        return "Idle";
    }
  })();

  const dotClass = (() => {
    switch (status) {
      case "saved":
        return "bg-emerald-500";
      case "saving":
        return "bg-amber-500";
      case "offline":
      case "error":
        return "bg-rose-500";
      default:
        return "bg-slate-400";
    }
  })();

  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
      <span className="text-xs font-medium text-slate-700">{label}</span>
    </div>
  );
}

function EditorShell({
  noteId,
  initialSnapshot,
  initialUpdatedAt,
}: {
  noteId: string;
  initialSnapshot?: TLEditorSnapshot | TLStoreSnapshot;
  initialUpdatedAt: string;
}) {
  const { supabase, session } = useSupabase();
  const editorRef = useRef<Editor | null>(null);
  const debouncedSaveRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const hasDirtyChangesRef = useRef(false);
  const baseUpdatedAtRef = useRef<string | null>(initialUpdatedAt);
  const lastThumbnailMsRef = useRef(0);
  const localKey = useMemo(() => `note:${noteId}:snapshot`, [noteId]);
  const initialUpdatedAtMs = useMemo(
    () => new Date(initialUpdatedAt).getTime() || 0,
    [initialUpdatedAt],
  );
  const bucket = useMemo(
    () => process.env.NEXT_PUBLIC_SUPABASE_ASSETS_BUCKET || "note-assets",
    [],
  );

  const emitSaveStatus = useCallback(
    (status: SaveState, savedAt?: number) => {
      const event = new CustomEvent(`note-save:${localKey}`, {
        detail: { status, savedAt },
      });
      window.dispatchEvent(event);
    },
    [localKey],
  );

  const persistLocal = useCallback(
    (snapshot: TLEditorSnapshot) => {
      try {
        localStorage.setItem(
          localKey,
          JSON.stringify({
            snapshot,
            updatedAt: Date.now(),
          }),
        );
      } catch {
        // ignore quota errors
      }
    },
    [localKey],
  );

  const restoreLocalIfNewer = useCallback(
    (editor: Editor) => {
      try {
        const raw = localStorage.getItem(localKey);
        if (!raw) return;
        const parsed = JSON.parse(raw) as {
          snapshot?: TLEditorSnapshot | TLStoreSnapshot;
          updatedAt?: number;
        };
        if (!parsed?.snapshot || !parsed.updatedAt) return;
        if (parsed.updatedAt > initialUpdatedAtMs) {
          editor.loadSnapshot(parsed.snapshot);
        }
      } catch {
        // ignore parsing issues
      }
    },
    [initialUpdatedAtMs, localKey],
  );

  const uploadThumbnail = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !session?.user) return;

    const now = Date.now();
    if (now - lastThumbnailMsRef.current < 20000) return;

    try {
      const { blob } = await editor.toImage([], {
        format: "png",
        background: true,
        padding: 32,
        scale: 1,
      });
      const path = `${session.user.id}/${noteId}/thumbnail.png`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, blob, {
          cacheControl: "3600",
          upsert: true,
          contentType: "image/png",
        });
      if (uploadError) throw uploadError;
      await supabase
        .from("notes")
        .update({ thumbnail_path: path })
        .eq("id", noteId);
      lastThumbnailMsRef.current = now;
    } catch (err) {
      console.warn("Thumbnail upload failed", err);
    }
  }, [bucket, noteId, session?.user, supabase]);

  const saveNow = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    const snapshot = editor.getSnapshot();
    persistLocal(snapshot);
    emitSaveStatus("saving");

    try {
      const query = supabase
        .from("notes")
        .update({ doc: snapshot })
        .eq("id", noteId);
      if (baseUpdatedAtRef.current) {
        query.eq("updated_at", baseUpdatedAtRef.current);
      }
      const { data, error, status } = await query.select("updated_at").single();
      if (error || status === 409) {
        throw error || new Error("Conflict saving note");
      }
      if (data?.updated_at) {
        baseUpdatedAtRef.current = data.updated_at;
      }
      hasDirtyChangesRef.current = false;
      const savedAt = Date.now();
      emitSaveStatus("saved", savedAt);
      uploadThumbnail();
    } catch (err) {
      if (!navigator.onLine) {
        emitSaveStatus("offline");
      } else {
        console.error("Autosave failed", err);
        emitSaveStatus("error");
      }
    }
  }, [emitSaveStatus, noteId, persistLocal, supabase, uploadThumbnail]);

  const scheduleSave = useCallback(() => {
    hasDirtyChangesRef.current = true;
    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
    }
    debouncedSaveRef.current = setTimeout(() => {
      saveNow();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [saveNow]);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      if (initialSnapshot) {
        editor.loadSnapshot(initialSnapshot, { forceOverwriteSessionState: true });
      }

      restoreLocalIfNewer(editor);
      persistLocal(editor.getSnapshot());
      emitSaveStatus("saved", Date.now());

      const unsubscribe = editor.store.listen(
        () => {
          emitSaveStatus("idle");
          scheduleSave();
        },
        { scope: "document", source: "user" },
      );

      heartbeatRef.current = setInterval(() => {
        if (hasDirtyChangesRef.current) {
          saveNow();
        }
      }, AUTOSAVE_HEARTBEAT_MS);

      return () => {
        unsubscribe();
        if (debouncedSaveRef.current) clearTimeout(debouncedSaveRef.current);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      };
    },
    [emitSaveStatus, initialSnapshot, persistLocal, restoreLocalIfNewer, saveNow, scheduleSave],
  );

  const handleExport = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    emitSaveStatus("saving");
    try {
      const { blob } = await editor.toImage([], { format: "png", background: true, padding: 32 });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "note.png";
      a.click();
      URL.revokeObjectURL(url);
      emitSaveStatus("saved", Date.now());
    } catch (err) {
      console.error("Export failed", err);
      emitSaveStatus("error");
    }
  }, [emitSaveStatus]);

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <div className="text-sm font-semibold text-slate-700">Canvas editor</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-300"
          >
            Export PNG
          </button>
        </div>
      </div>
      <div className="relative h-[70vh] w-full">
        <Tldraw
          persistenceKey={localKey}
          onMount={handleMount}
          inferDarkMode={false}
          hideUi={false}
        />
      </div>
    </>
  );
}

function relativeTime(timestamp: number) {
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function coerceSnapshot(
  value: unknown,
): TLEditorSnapshot | TLStoreSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  if ("document" in (value as Record<string, unknown>)) return value as TLEditorSnapshot;
  if ("store" in (value as Record<string, unknown>)) return value as TLStoreSnapshot;
  return undefined;
}
