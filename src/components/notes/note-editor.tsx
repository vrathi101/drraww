"use client";

import {
  renameNoteAction,
  listSharesAction,
  createShareAction,
  revokeShareAction,
  updateSharePasswordAction,
} from "@/app/app/actions";
import { useSupabase } from "@/components/supabase-provider";
import {
  type Editor,
  type TLEditorSnapshot,
  type TLStoreSnapshot,
  type TLAssetId,
  type TLShapeId,
} from "tldraw";
import type { Json } from "@/lib/database.types";
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
import { PDFDocument } from "pdf-lib";
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
const REVISION_HEARTBEAT_MS = 30000;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

type Revision = {
  id: string;
  created_at: string;
  reason: string | null;
  doc: TLEditorSnapshot | TLStoreSnapshot | null;
};

type ConflictState = {
  serverSnapshot?: TLEditorSnapshot | TLStoreSnapshot;
  serverUpdatedAt: string;
  pendingSnapshot: TLEditorSnapshot | TLStoreSnapshot;
};

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
  const lastRevisionMsRef = useRef(0);
  const [shareModal, setShareModal] = useState(false);
  const [shareLinks, setShareLinks] = useState<{ id: string; token: string; allow_edit: boolean; expires_at: string | null; password_hash?: string | null }[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareExpiry, setShareExpiry] = useState<"never" | "1d" | "7d">("7d");
  const [sharePassword, setSharePassword] = useState("");
  const [bulkPassword, setBulkPassword] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveState>("saved");
  const [isOnline, setIsOnline] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const localKey = useMemo(() => `note:${noteId}:snapshot`, [noteId]);
  const initialUpdatedAtMs = useMemo(
    () => new Date(initialUpdatedAt).getTime() || 0,
    [initialUpdatedAt],
  );
  const bucket = useMemo(
    () => process.env.NEXT_PUBLIC_SUPABASE_ASSETS_BUCKET || "note-assets",
    [],
  );
  const [localDraft, setLocalDraft] = useState<
    | {
        snapshot: TLEditorSnapshot | TLStoreSnapshot;
        updatedAt: number;
      }
    | null
  >(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const emitSaveStatus = useCallback(
    (status: SaveState, savedAt?: number) => {
      setSaveStatus(status);
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

  const readLocalDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(localKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        snapshot?: TLEditorSnapshot | TLStoreSnapshot;
        updatedAt?: number;
      };
      if (!parsed?.snapshot || !parsed.updatedAt) return null;
      return parsed as {
        snapshot: TLEditorSnapshot | TLStoreSnapshot;
        updatedAt: number;
      };
    } catch {
      return null;
    }
  }, [localKey]);

  const restoreLocalIfNewer = useCallback(() => {
    const draft = readLocalDraft();
    if (draft && draft.updatedAt > initialUpdatedAtMs) {
      setLocalDraft(draft);
    }
  }, [initialUpdatedAtMs, readLocalDraft]);

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

  const fetchRevisions = useCallback(async () => {
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from("note_revisions")
      .select("id, created_at, reason, doc")
      .eq("note_id", noteId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      console.warn("Failed to load revisions", error.message);
      setRevisions([]);
    } else {
      const mapped =
        data?.map((row) => ({
          ...row,
          doc: coerceSnapshot(row.doc) ?? null,
        })) ?? [];
      setRevisions(mapped);
    }
    setHistoryLoading(false);
  }, [noteId, supabase]);

  const insertRevision = useCallback(
    async (snapshot: TLEditorSnapshot | TLStoreSnapshot, reason = "autosave") => {
      try {
        if (!session?.user?.id) return;
        const now = Date.now();
        if (now - lastRevisionMsRef.current < REVISION_HEARTBEAT_MS) return;
        const { error } = await supabase.from("note_revisions").insert([
          {
            note_id: noteId,
            owner_id: session.user.id,
            doc: snapshot as unknown as Json,
            reason,
          },
        ]);
        if (error) throw error;
        lastRevisionMsRef.current = now;

        const { data: idsToDelete, error: listError } = await supabase
          .from("note_revisions")
          .select("id")
          .eq("note_id", noteId)
          .order("created_at", { ascending: false })
          .range(20, 200);
        if (!listError && idsToDelete && idsToDelete.length > 0) {
          await supabase
            .from("note_revisions")
            .delete()
            .in(
              "id",
              idsToDelete.map((row) => row.id),
            );
        }
      } catch (err) {
        console.warn("Revision insert failed", err);
      }
    },
    [noteId, session?.user?.id, supabase],
  );

  const handleInsertImage = useCallback(
    async (file: File) => {
      if (!editorRef.current || !file) return;
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setUploadError("File too large (max 10MB).");
        return;
      }
      setIsUploading(true);
      setUploadError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("noteId", noteId);
        const res = await fetch("/api/attachments", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Upload failed");
        }
        const { attachment } = (await res.json()) as {
          attachment: { path: string; mime_type: string | null };
        };
        const { data: signed } = await supabase.storage
          .from(bucket)
          .createSignedUrl(attachment.path, 3600);
        const url = signed?.signedUrl;
        if (!url) throw new Error("Could not create signed URL");
        const editor = editorRef.current;
        const assetId = (`asset:${crypto.randomUUID()}`) as TLAssetId;
        const shapeId = (`shape:${crypto.randomUUID()}`) as TLShapeId;
        editor.createAssets([
          {
            id: assetId,
            type: "image",
            typeName: "asset",
            props: {
              w: 200,
              h: 200,
              name: attachment.path,
              src: url,
              mimeType: attachment.mime_type || file.type,
              isAnimated: false,
            },
            meta: {},
          },
        ]);
        editor.createShape({
          id: shapeId,
          type: "image",
          x: 0,
          y: 0,
          props: {
            assetId,
            w: 200,
            h: 200,
          },
        });
      } catch (err) {
        console.error(err);
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [bucket, noteId, supabase.storage],
  );

  const handleFileDrop = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const first = files[0];
      if (!first.type.startsWith("image/")) {
        setUploadError("Only image uploads are supported.");
        return;
      }
      handleInsertImage(first);
    },
    [handleInsertImage],
  );

  const saveNow = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    const snapshot = editor.getSnapshot();
    persistLocal(snapshot);
    emitSaveStatus("saving");

    try {
      const query = supabase
        .from("notes")
        .update({ doc: snapshot as unknown as Json })
        .eq("id", noteId);
      if (baseUpdatedAtRef.current) {
        query.eq("updated_at", baseUpdatedAtRef.current);
      }
      const { data, error } = await query.select("updated_at").maybeSingle();
      if (error || !data?.updated_at) {
        const { data: latest, error: latestError } = await supabase
          .from("notes")
          .select("doc, updated_at")
          .eq("id", noteId)
          .maybeSingle();
        if (latestError || !latest?.updated_at) {
          throw latestError || new Error("Save conflict");
        }
        setConflict({
          serverSnapshot: coerceSnapshot(latest.doc),
          serverUpdatedAt: latest.updated_at,
          pendingSnapshot: snapshot,
        });
        emitSaveStatus("error");
        return;
      } else {
        baseUpdatedAtRef.current = data.updated_at;
      }
      hasDirtyChangesRef.current = false;
      const savedAt = Date.now();
      emitSaveStatus("saved", savedAt);
      uploadThumbnail();
      insertRevision(snapshot);
    } catch (err) {
      if (!navigator.onLine) {
        emitSaveStatus("offline");
      } else {
        console.error("Autosave failed", err);
        emitSaveStatus("error");
      }
    }
  }, [emitSaveStatus, insertRevision, noteId, persistLocal, supabase, uploadThumbnail]);

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

      restoreLocalIfNewer();
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

  const handleExportPdf = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    emitSaveStatus("saving");
    try {
      const { blob, width, height } = await editor.toImage([], {
        format: "png",
        background: true,
        padding: 32,
        scale: 2,
      });
      const pngBytes = await blob.arrayBuffer();
      const pdfDoc = await PDFDocument.create();
      const pngImage = await pdfDoc.embedPng(pngBytes);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(pngImage, { x: 0, y: 0, width, height });
      const pdfBytes = await pdfDoc.save();
      const pdfBlob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "note.pdf";
      a.click();
      URL.revokeObjectURL(url);
      emitSaveStatus("saved", Date.now());
    } catch (err) {
      console.error("Export PDF failed", err);
      emitSaveStatus("error");
    }
  }, [emitSaveStatus]);

  const handleRestoreLocalDraft = useCallback(() => {
    if (!localDraft || !editorRef.current) return;
    editorRef.current.loadSnapshot(localDraft.snapshot, { forceOverwriteSessionState: true });
    persistLocal(editorRef.current.getSnapshot());
    setLocalDraft(null);
  }, [localDraft, persistLocal]);

  const handleDiscardLocalDraft = useCallback(() => {
    try {
      localStorage.removeItem(localKey);
    } catch {
      // ignore
    }
    setLocalDraft(null);
  }, [localKey]);

  const handleRestoreRevision = useCallback(
    async (revision: Revision) => {
      if (!editorRef.current || !revision.doc) return;
      editorRef.current.loadSnapshot(revision.doc, { forceOverwriteSessionState: true });
      persistLocal(editorRef.current.getSnapshot());
      hasDirtyChangesRef.current = true;
      await saveNow();
      setHistoryOpen(false);
    },
    [persistLocal, saveNow],
  );

  const handleConflictReload = useCallback(() => {
    if (!conflict || !editorRef.current) return;
    if (conflict.serverSnapshot) {
      editorRef.current.loadSnapshot(conflict.serverSnapshot, { forceOverwriteSessionState: true });
      persistLocal(editorRef.current.getSnapshot());
    }
    baseUpdatedAtRef.current = conflict.serverUpdatedAt;
    hasDirtyChangesRef.current = false;
    setConflict(null);
    emitSaveStatus("saved", Date.now());
  }, [conflict, emitSaveStatus, persistLocal]);

  const handleConflictOverwrite = useCallback(async () => {
    if (!conflict) return;
    const { pendingSnapshot, serverSnapshot } = conflict;
    try {
      if (serverSnapshot) {
        await insertRevision(serverSnapshot, "remote before overwrite");
      }
      const { data, error } = await supabase
        .from("notes")
        .update({ doc: pendingSnapshot as unknown as Json })
        .eq("id", noteId)
        .select("updated_at")
        .single();
      if (error || !data?.updated_at) throw error || new Error("Failed to overwrite");
      baseUpdatedAtRef.current = data.updated_at;
      hasDirtyChangesRef.current = false;
      setConflict(null);
      emitSaveStatus("saved", Date.now());
    } catch (err) {
      console.error("Overwrite failed", err);
      emitSaveStatus("error");
    }
  }, [conflict, emitSaveStatus, insertRevision, noteId, supabase]);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!editorRef.current) return;
      if (!hasDirtyChangesRef.current) return;
      // Persist a local snapshot so we can recover after reload.
      try {
        persistLocal(editorRef.current.getSnapshot());
      } catch {
        // ignore
      }
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [persistLocal]);

  useEffect(() => {
    if (historyOpen && revisions.length === 0) {
      fetchRevisions();
    }
  }, [fetchRevisions, historyOpen, revisions.length]);

  const loadShares = useCallback(async () => {
    setShareLoading(true);
    try {
      const { links } = await listSharesAction(noteId);
      setShareLinks(links);
    } catch (err) {
      console.error("Failed to load shares", err);
    } finally {
      setShareLoading(false);
    }
  }, [noteId]);

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <div className="text-sm font-semibold text-slate-700">Canvas editor</div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleInsertImage(file);
                e.target.value = "";
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-300"
            disabled={isUploading}
          >
            {isUploading ? "Uploading…" : "Upload image"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-300"
          >
            Export PNG
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-300"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => {
              setShareModal(true);
              if (shareLinks.length === 0) {
                loadShares();
              }
            }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-300"
          >
            Share
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-300"
          >
            {historyOpen ? "Close History" : "History"}
          </button>
          {!isOnline || saveStatus === "offline" || saveStatus === "error" ? (
            <button
              type="button"
              onClick={() => saveNow()}
              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:border-rose-300"
            >
              Retry save
            </button>
          ) : null}
        </div>
      </div>
      {localDraft ? (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
            Unsynced local changes detected from a previous session. Restore?
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:border-amber-300"
              onClick={handleRestoreLocalDraft}
            >
              Restore
            </button>
            <button
              type="button"
              className="rounded-full border border-transparent px-3 py-1 text-xs font-medium text-amber-700 hover:underline"
              onClick={handleDiscardLocalDraft}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {conflict ? (
        <div className="flex items-center justify-between gap-3 border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden />
              Another session updated this note at {formatAbsolute(conflict.serverUpdatedAt)}.
            </div>
            <p className="text-xs text-rose-700">
              Choose to reload their version or overwrite with yours (we’ll keep a revision of theirs).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleConflictReload}
              className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-800 hover:border-rose-300"
            >
              Reload theirs
            </button>
            <button
              type="button"
              onClick={handleConflictOverwrite}
              className="rounded-full border border-amber-300 bg-amber-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
            >
              Overwrite with mine
            </button>
          </div>
        </div>
      ) : null}
      {!isOnline ? (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-700">
          <span className="h-2 w-2 rounded-full bg-rose-500" aria-hidden />
          You are offline. Edits stay local; they will sync when back online.
        </div>
      ) : null}
      {historyOpen ? (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-semibold text-slate-800">Revisions (last 10)</div>
            <button
              type="button"
              onClick={fetchRevisions}
              className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-300"
              disabled={historyLoading}
            >
              {historyLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          {revisions.length === 0 ? (
            <div className="text-slate-600">No revisions yet.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {revisions.map((rev) => (
                <button
                  key={rev.id}
                  type="button"
                  onClick={() => handleRestoreRevision(rev)}
                  className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm hover:border-slate-300"
                >
                  <span className="text-xs font-semibold text-slate-800">
                    {new Date(rev.created_at).toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-600">
                    {rev.reason || "Autosave checkpoint"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {shareModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Share this note</h3>
                <p className="text-sm text-slate-600">
                  Create view-only or edit links. Anyone with the link can access.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareModal(false)}
                className="text-slate-500 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-xs font-semibold text-slate-700">Expires</span>
                <select
                  value={shareExpiry}
                  onChange={(e) => setShareExpiry(e.target.value as "never" | "1d" | "7d")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm"
                >
                  <option value="1d">In 24 hours</option>
                  <option value="7d">In 7 days</option>
                  <option value="never">Never</option>
                </select>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="text-xs font-semibold text-slate-700">Password (optional)</span>
                <input
                  type="password"
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1 text-xs outline-none"
                  placeholder="Set a password"
                />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <span className="text-xs font-semibold text-slate-700">Enforce on existing</span>
                <input
                  type="password"
                  value={bulkPassword}
                  onChange={(e) => setBulkPassword(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1 text-xs outline-none"
                  placeholder="Set password for all links"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const trimmed = bulkPassword.trim();
                    if (!trimmed) return;
                    const updated = await Promise.all(
                      shareLinks.map(async (link) => {
                        const { share } = await updateSharePasswordAction(link.id, trimmed);
                        return { ...link, password_hash: share.password_hash };
                      }),
                    );
                    setShareLinks(updated);
                  }}
                  className="rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-amber-700"
                >
                  Apply to all
                </button>
              </div>
              {shareError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {shareError}
                </div>
              ) : null}
              <button
                type="button"
                onClick={async () => {
                  try {
                    setShareError(null);
                    const password = sharePassword.trim();
                    const { link } = await createShareAction(
                      noteId,
                      false,
                      resolveExpiry(shareExpiry),
                      password || null,
                    );
                    setShareLinks((prev) => [link, ...prev]);
                  } catch (err) {
                    console.error(err);
                    setShareError("Could not create view link. Please try again.");
                  }
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-300"
              >
                + New view link
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setShareError(null);
                    const password = sharePassword.trim();
                    const { link } = await createShareAction(
                      noteId,
                      true,
                      resolveExpiry(shareExpiry),
                      password || null,
                    );
                    setShareLinks((prev) => [link, ...prev]);
                  } catch (err) {
                    console.error(err);
                    setShareError("Could not create edit link. Please try again.");
                  }
                }}
                className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-800 shadow-sm hover:border-amber-300"
              >
                + New edit link
              </button>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Existing links</span>
                  {shareLoading ? (
                    <span className="text-xs text-slate-500">Loading...</span>
                  ) : (
                    <button
                      type="button"
                      onClick={loadShares}
                      className="text-xs text-amber-700 hover:text-amber-800"
                    >
                      Refresh
                    </button>
                  )}
                </div>
                {shareLinks.length === 0 ? (
                  <p className="text-sm text-slate-500">No links yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {shareLinks.map((link) => {
                      const href =
                        typeof window !== "undefined"
                          ? `${window.location.origin}/share/${link.token}`
                          : `/share/${link.token}`;
                      return (
                        <div
                          key={link.id}
                          className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                        >
                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span className="flex items-center gap-2">
                              <span>
                                {link.allow_edit ? "Edit" : "View"} link
                                {link.expires_at
                                  ? ` • expires ${new Date(link.expires_at).toLocaleDateString()}`
                                  : " • no expiry"}
                              </span>
                              {link.password_hash ? (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                  Password
                                </span>
                              ) : null}
                            </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(href)}
                      className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-300"
                    >
                      Copy
                    </button>
                    {link.password_hash ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const { share } = await updateSharePasswordAction(link.id, null);
                          setShareLinks((prev) =>
                            prev.map((l) =>
                              l.id === link.id ? { ...l, password_hash: share.password_hash } : l,
                            ),
                          );
                        }}
                        className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-slate-300"
                      >
                        Clear password
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={async () => {
                        await revokeShareAction(link.id);
                        setShareLinks((prev) => prev.filter((l) => l.id !== link.id));
                                }}
                                className="rounded-full border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:border-rose-300"
                              >
                                Revoke
                              </button>
                            </div>
                          </div>
                          <span className="break-all text-xs text-slate-800">{href}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div
        className="relative h-[70vh] w-full"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setIsDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          handleFileDrop(e.dataTransfer.files);
        }}
      >
        {isDragOver ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-amber-400 bg-amber-50/80 text-sm font-semibold text-amber-800">
            Drop image to upload
          </div>
        ) : null}
        <Tldraw
          persistenceKey={localKey}
          onMount={handleMount}
          inferDarkMode={false}
          hideUi={false}
        />
      </div>
      {uploadError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          {uploadError}
        </div>
      ) : null}
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

function formatAbsolute(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return date.toLocaleString();
}

function coerceSnapshot(
  value: unknown,
): TLEditorSnapshot | TLStoreSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  if ("document" in (value as Record<string, unknown>)) return value as TLEditorSnapshot;
  if ("store" in (value as Record<string, unknown>)) return value as TLStoreSnapshot;
  return undefined;
}

function resolveExpiry(value: "never" | "1d" | "7d") {
  if (value === "never") return null;
  const now = Date.now();
  const ms = value === "1d" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(now + ms).toISOString();
}
