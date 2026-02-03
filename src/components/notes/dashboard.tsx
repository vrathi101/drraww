"use client";

import {
  createNoteAction,
  createFolderAction,
  deleteNoteAction,
  deleteFolderAction,
  moveNoteToFolderAction,
  renameNoteAction,
  renameFolderAction,
  togglePinNoteAction,
  archiveNoteAction,
  updateNoteTagsAction,
} from "@/app/app/actions";
import {
  createTagAction,
} from "@/app/app/tags/action";
import { useSupabase } from "@/components/supabase-provider";
import type { Folder, Note } from "@/lib/notes";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  notes: Note[];
  folders: Folder[];
  tags: { id: string; name: string; color: string | null }[];
};

type DialogState =
  | { type: "folder"; mode: "create" | "rename"; folder?: Folder }
  | { type: "delete-folder"; folder: Folder }
  | { type: "folder-parent"; folder?: Folder }
  | null;

export function NotesDashboard({ notes, folders, tags }: Props) {
  const router = useRouter();
  const { supabase } = useSupabase();
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [folderNameInput, setFolderNameInput] = useState("");
  const [tagList, setTagList] = useState(tags);
  const [sort, setSort] = useState<"updated" | "created" | "title" | "last_opened">("updated");
  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(
    null,
  );
  const [tagDialog, setTagDialog] = useState<{
    noteId: string;
    title: string;
    selected: string[];
  } | null>(null);
  const [newTagName, setNewTagName] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let next = notes;
    if (selectedFolder) {
      next = next.filter((n) => n.folder_id === selectedFolder);
    }
    if (selectedTags.length > 0) {
      next = next.filter((n) => {
        const noteTagIds =
          (n as Note & { note_tags?: { tag_id: string }[] }).note_tags?.map((t) => t.tag_id) ?? [];
        return selectedTags.every((tagId) => noteTagIds.includes(tagId));
      });
    }
    if (!term) return next;
    next = next.filter((note) => note.title.toLowerCase().includes(term));

    next = [...next].sort((a, b) => {
      const aPinned = a.is_pinned ? 1 : 0;
      const bPinned = b.is_pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title);
        case "created":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "last_opened": {
          const aOpen = a.last_opened_at ? new Date(a.last_opened_at).getTime() : 0;
          const bOpen = b.last_opened_at ? new Date(b.last_opened_at).getTime() : 0;
          return bOpen - aOpen;
        }
        case "updated":
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

    return next;
  }, [notes, search, selectedFolder, selectedTags, sort]);

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

  useEffect(() => {
    if (dialog?.type === "folder") {
      setFolderNameInput(dialog.folder?.name ?? "");
    } else {
      setFolderNameInput("");
    }
  }, [dialog]);

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
      setToast({ type: "success", message: "Note renamed" });
      router.refresh();
    });
  };

  const handleDelete = (note: Note) => {
    const confirmDelete = confirm(
      `Delete "${note.title}"? It will move to Trash.`,
    );
    if (!confirmDelete) return;

    startTransition(async () => {
      await deleteNoteAction(note.id);
      setToast({ type: "success", message: "Moved to Trash" });
      router.refresh();
    });
  };

  const handleArchive = (note: Note) => {
    const ok = confirm(`Archive "${note.title}"? It will be hidden from the main list.`);
    if (!ok) return;
    startTransition(async () => {
      await archiveNoteAction(note.id);
      setToast({ type: "success", message: "Note archived" });
      router.refresh();
    });
  };

  const handleCreateFolder = () => {
    setDialog({ type: "folder", mode: "create" });
  };

  const handleRenameFolder = (folder: Folder) => {
    setDialog({ type: "folder", mode: "rename", folder });
  };

  const handleDeleteFolder = (folder: Folder) => {
    setDialog({ type: "delete-folder", folder });
  };

  const handleChangeFolderParent = (folder: Folder) => {
    setDialog({ type: "folder-parent", folder });
  };

  const handleMoveNote = (noteId: string, folderId: string | null) => {
    startTransition(async () => {
      await moveNoteToFolderAction(noteId, folderId);
      setToast({ type: "success", message: "Note moved" });
      router.refresh();
    });
  };

  const handleSaveTags = (noteId: string, selected: string[]) => {
    startTransition(async () => {
      await updateNoteTagsAction(noteId, selected);
      setToast({ type: "success", message: "Tags updated" });
      setTagDialog(null);
      router.refresh();
    });
  };

  const handleCreateTag = () => {
    const name = newTagName.trim();
    if (!name) {
      setToast({ type: "error", message: "Tag name cannot be empty" });
      return;
    }
    startTransition(async () => {
      try {
        const { id } = await createTagAction(name);
        setTagList((prev) => [...prev, { id, name, color: null }]);
        setNewTagName("");
      } catch (err) {
        setToast({
          type: "error",
          message:
            err instanceof Error ? err.message : "Could not create tag. It may already exist.",
        });
      }
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
          {folders.map((folder) => {
            const depth = computeDepth(folder, folders);
            return (
              <div
                key={folder.id}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
                  selectedFolder === folder.id
                    ? "bg-amber-100 text-amber-800"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                style={{ paddingLeft: `${12 + depth * 12}px` }}
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
                    onClick={() => handleChangeFolderParent(folder)}
                    className="rounded px-1 text-slate-500 hover:bg-slate-200"
                    disabled={isPending}
                    title="Move folder"
                  >
                    ⇄
                  </button>
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
            );
          })}
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
            <select
              value={sort}
              onChange={(e) =>
                setSort(e.target.value as "updated" | "created" | "title" | "last_opened")
              }
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-amber-300"
            >
              <option value="updated">Last edited</option>
              <option value="last_opened">Last opened</option>
              <option value="created">Created (newest)</option>
              <option value="title">Title A-Z</option>
            </select>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((tag) => {
                const active = selectedTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) =>
                        active ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? "border-amber-300 bg-amber-100 text-amber-800"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                    style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                  >
                    {tag.name}
                  </button>
                );
              })}
              {selectedTags.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  className="text-xs text-slate-500 hover:underline"
                >
                  Clear tags
                </button>
              ) : null}
            </div>
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
                    <div className="text-xs text-amber-700 font-semibold">
                    {note.is_pinned ? "Pinned" : ""}
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
                    <button
                      type="button"
                      onClick={() => handleArchive(note)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400"
                      disabled={isPending}
                    >
                      Archive
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const selected =
                          (note as Note & { note_tags?: { tag_id: string }[] }).note_tags?.map(
                            (t) => t.tag_id,
                          ) ?? [];
                        setTagDialog({
                          noteId: note.id,
                          title: note.title || "Untitled",
                          selected,
                        });
                      }}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400"
                      disabled={isPending}
                    >
                      Tags
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        startTransition(async () => {
                          await togglePinNoteAction(note.id, !note.is_pinned);
                          setToast({
                            type: "success",
                            message: note.is_pinned ? "Unpinned" : "Pinned",
                          });
                          router.refresh();
                        });
                      }}
                      className="rounded-full border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-700 hover:border-amber-400"
                      disabled={isPending}
                    >
                      {note.is_pinned ? "Unpin" : "Pin"}
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
      {dialog ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            {dialog.type === "folder" ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900">
                  {dialog.mode === "create" ? "New folder" : "Rename folder"}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {dialog.mode === "create"
                    ? "Create a folder to group notes."
                    : "Update the folder name."}
                </p>
                <form
                  className="mt-4 flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = folderNameInput.trim();
                    if (!name) {
                      setToast({ type: "error", message: "Folder name cannot be empty" });
                      return;
                    }
                    startTransition(async () => {
                      try {
                        if (dialog.mode === "create") {
                          await createFolderAction(name);
                          setToast({ type: "success", message: "Folder created" });
                        } else if (dialog.folder) {
                          await renameFolderAction(dialog.folder.id, name);
                          setToast({ type: "success", message: "Folder renamed" });
                        }
                        setDialog(null);
                        router.refresh();
                      } catch (err) {
                        setToast({
                          type: "error",
                          message:
                            err instanceof Error
                              ? err.message
                              : "Unable to save folder. It may already exist.",
                        });
                      }
                    });
                  }}
                >
                  <input
                    autoFocus
                    value={folderNameInput}
                    onChange={(e) => setFolderNameInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none ring-2 ring-transparent transition focus:border-amber-300 focus:ring-amber-100"
                    placeholder="Folder name"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setDialog(null)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300"
                      disabled={isPending}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60"
                      disabled={isPending}
                    >
                      {dialog.mode === "create" ? "Create" : "Save"}
                    </button>
                  </div>
                </form>
              </>
            ) : dialog.type === "delete-folder" ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900">
                  Delete folder
                </h3>
                <p className="mt-2 text-sm text-slate-700">
                  Notes inside will move to Unfiled. Continue?
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDialog(null)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300"
                    disabled={isPending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                      onClick={() => {
                        if (!dialog.folder) return;
                        startTransition(async () => {
                          await deleteFolderAction(dialog.folder.id);
                          if (selectedFolder === dialog.folder?.id) {
                            setSelectedFolder(null);
                          }
                          setDialog(null);
                          setToast({ type: "success", message: "Folder deleted" });
                          router.refresh();
                        });
                      }}
                      className="rounded-full bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
                      disabled={isPending}
                    >
                    Delete
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {tagDialog ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Tags for {tagDialog.title}</h3>
            <p className="text-sm text-slate-600">Select tags to attach to this note.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {tagList.map((tag) => {
                const active = tagDialog.selected.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      setTagDialog((prev) =>
                        prev
                          ? {
                              ...prev,
                              selected: prev.selected.includes(tag.id)
                                ? prev.selected.filter((id) => id !== tag.id)
                                : [...prev.selected, tag.id],
                            }
                          : prev,
                      );
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? "border-amber-300 bg-amber-100 text-amber-800"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                    style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none ring-2 ring-transparent transition focus:border-amber-300 focus:ring-amber-100"
                placeholder="New tag name"
              />
              <button
                type="button"
                onClick={handleCreateTag}
                className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
                disabled={isPending}
              >
                Add tag
              </button>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTagDialog(null)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveTags(tagDialog.noteId, tagDialog.selected)}
                className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                disabled={isPending}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="fixed bottom-4 right-4 z-40 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-xl">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                toast.type === "success" ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            <span className="text-slate-800">{toast.message}</span>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-700"
              onClick={() => setToast(null)}
            >
              ✕
            </button>
          </div>
        </div>
      ) : null}
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

function computeDepth(folder: Folder, folders: Folder[], seen = new Set<string>()): number {
  if (!folder.parent_id) return 0;
  if (seen.has(folder.id)) return 0;
  seen.add(folder.id);
  const parent = folders.find((f) => f.id === folder.parent_id);
  if (!parent) return 0;
  return 1 + computeDepth(parent, folders, seen);
}
