"use client";

import {
  createNoteAction,
  createFolderAction,
  deleteNoteAction,
  deleteFolderAction,
  moveNoteToFolderAction,
  renameNoteAction,
  renameFolderAction,
} from "@/app/app/actions";
import { useSupabase } from "@/components/supabase-provider";
import type { Folder, Note } from "@/lib/notes";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  notes: Note[];
  folders: Folder[];
};

export function NotesDashboard({ notes, folders }: Props) {
  const router = useRouter();
  const { supabase } = useSupabase();
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let next = notes;
    if (selectedFolder) {
      next = next.filter((n) => n.folder_id === selectedFolder);
    }
    if (!term) return next;
    return next.filter((note) => note.title.toLowerCase().includes(term));
  }, [notes, search, selectedFolder]);

  useEffect(() => {
    const bucket =
      process.env.NEXT_PUBLIC_SUPABASE_ASSETS_BUCKET || "note-assets";
    const paths = notes
      .map((note) => note.thumbnail_path)
      .filter((p): p is string => Boolean(p));
    if (paths.length === 0) {
      setThumbnails({});
      return;
    }

    let isMounted = true;

    supabase.storage
      .from(bucket)
      .createSignedUrls(paths, 3600)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error || !data) {
          console.warn("Failed to load thumbnails", error?.message);
          setThumbnails({});
          return;
        }
        const map: Record<string, string> = {};
        data.forEach((item) => {
          if (item.signedUrl && item.path) {
            map[item.path] = item.signedUrl;
          }
        });
        setThumbnails(map);
      });

    return () => {
      isMounted = false;
    };
  }, [notes, supabase.storage]);

  const handleCreate = () => {
    startTransition(async () => {
      const { noteId } = await createNoteAction();
      router.push(`/app/note/${noteId}`);
    });
  };

  const handleRename = (note: Note) => {
    const next = prompt("Rename note", note.title);
    if (!next || next.trim() === "" || next.trim() === note.title) return;

    startTransition(async () => {
      await renameNoteAction(note.id, next.trim());
      router.refresh();
    });
  };

  const handleDelete = (note: Note) => {
    const confirmDelete = confirm(
      `Delete "${note.title}"? This will move it out of your list.`,
    );
    if (!confirmDelete) return;

    startTransition(async () => {
      await deleteNoteAction(note.id);
      router.refresh();
    });
  };

  const handleCreateFolder = () => {
    const name = prompt("Folder name", "New folder");
    if (!name || !name.trim()) return;
    startTransition(async () => {
      await createFolderAction(name.trim());
      router.refresh();
    });
  };

  const handleRenameFolder = (folder: Folder) => {
    const next = prompt("Rename folder", folder.name);
    if (!next || !next.trim() || next.trim() === folder.name) return;
    startTransition(async () => {
      await renameFolderAction(folder.id, next.trim());
      router.refresh();
    });
  };

  const handleDeleteFolder = (folder: Folder) => {
    const ok = confirm(
      `Delete folder "${folder.name}"? Notes inside will be moved to Unfiled.`,
    );
    if (!ok) return;
    startTransition(async () => {
      await deleteFolderAction(folder.id);
      if (selectedFolder === folder.id) {
        setSelectedFolder(null);
      }
      router.refresh();
    });
  };

  const handleMoveNote = (noteId: string, folderId: string | null) => {
    startTransition(async () => {
      await moveNoteToFolderAction(noteId, folderId);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="w-full rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm lg:w-64">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">Folders</div>
          <button
            type="button"
            onClick={handleCreateFolder}
            className="text-xs font-semibold text-amber-700 hover:text-amber-800"
            disabled={isPending}
          >
            + New
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setSelectedFolder(null)}
            className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition ${
              selectedFolder === null
                ? "bg-amber-100 text-amber-800"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span>All notes</span>
            <span className="text-xs text-slate-500">{notes.length}</span>
          </button>
          {folders.map((folder) => (
            <div
              key={folder.id}
              className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                selectedFolder === folder.id
                  ? "bg-amber-100 text-amber-800"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <button
                type="button"
                className="flex-1 text-left font-semibold"
                onClick={() => setSelectedFolder(folder.id)}
              >
                {folder.name}
              </button>
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => handleRenameFolder(folder)}
                  className="rounded px-1 text-slate-500 hover:bg-slate-200"
                  disabled={isPending}
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteFolder(folder)}
                  className="rounded px-1 text-rose-500 hover:bg-rose-100"
                  disabled={isPending}
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
              Dashboard
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">
              Your notes
            </h1>
            <p className="text-sm text-slate-600">
              Create, search, filter by folder, or open a note to continue drawing.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              placeholder="Search titles"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm outline-none ring-2 ring-transparent transition focus:border-slate-300 focus:ring-amber-200 sm:w-56"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-medium text-white shadow-lg shadow-black/10 transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              New note
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white/90 p-10 text-slate-600 shadow-sm">
            No notes yet. Click{" "}
            <button
              type="button"
              onClick={handleCreate}
              className="font-semibold text-amber-700 underline"
              disabled={isPending}
            >
              New note
            </button>{" "}
            to start drawing.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((note) => (
              <article
                key={note.id}
                className="group flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <Link href={`/app/note/${note.id}`} className="block">
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                    {thumbnails[note.thumbnail_path ?? ""] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbnails[note.thumbnail_path ?? ""]}
                        alt={`${note.title} thumbnail`}
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.01]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-50 via-white to-sky-50 text-sm font-medium text-slate-500">
                        No preview yet
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex flex-1 flex-col gap-3 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h2 className="line-clamp-1 text-lg font-semibold text-slate-900">
                        {note.title || "Untitled"}
                      </h2>
                      <p className="text-xs text-slate-500">
                        Updated {formatUpdatedAt(note.updated_at)}
                      </p>
                      <div className="text-xs text-slate-600">
                        Folder:{" "}
                        <select
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                          value={note.folder_id ?? ""}
                          onChange={(e) =>
                            handleMoveNote(
                              note.id,
                              e.target.value === "" ? null : e.target.value,
                            )
                          }
                          disabled={isPending}
                        >
                          <option value="">Unfiled</option>
                          {folders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleRename(note)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400"
                        disabled={isPending}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(note)}
                        className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:border-rose-400"
                        disabled={isPending}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <Link
                      href={`/app/note/${note.id}`}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 hover:text-amber-800"
                    >
                      Open note →
                    </Link>
                    {isPending ? (
                      <span className="text-xs text-slate-500">Working...</span>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatUpdatedAt(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "just now";

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
