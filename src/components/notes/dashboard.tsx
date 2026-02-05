"use client";

import {
  createNoteAction,
  createFolderAction,
  deleteNoteAction,
  deleteFolderAction,
  moveNoteToFolderAction,
  moveFolderParentAction,
  renameNoteAction,
  renameFolderAction,
  togglePinNoteAction,
  archiveNoteAction,
  updateNoteTagsAction,
} from "@/app/app/actions";
import {
  createTagAction,
  renameTagAction,
  deleteTagAction,
} from "@/app/app/tags/action";
import { useSupabase } from "@/components/supabase-provider";
import type { Folder, Note } from "@/lib/notes";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TAG_COLORS = [
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#14b8a6",
  "#0ea5e9",
  "#3b82f6",
  "#a855f7",
  "#ef4444",
];

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
  const [folderParentId, setFolderParentId] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [tagList, setTagList] = useState(tags);
  const [dragOverFolder, setDragOverFolder] = useState<string | "root" | null>(null);
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
  const [newTagColor, setNewTagColor] = useState<string | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<{ id: string; name: string; color: string | null } | null>(null);
  const [moveDialog, setMoveDialog] = useState<{ noteId: string; title: string; currentFolder: string | null } | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const breadcrumb = useMemo(() => buildBreadcrumb(selectedFolder, folders), [selectedFolder, folders]);
  const recents = useMemo(() => {
    const list = [...notes].sort((a, b) => {
      const aOpen = a.last_opened_at ? new Date(a.last_opened_at).getTime() : 0;
      const bOpen = b.last_opened_at ? new Date(b.last_opened_at).getTime() : 0;
      return bOpen - aOpen;
    });
    return list.slice(0, 5);
  }, [notes]);

  const collapsedKey = "drraww:collapsedFolders";

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
  const pinnedNotes = useMemo(() => filtered.filter((n) => n.is_pinned), [filtered]);
  const unpinnedNotes = useMemo(() => filtered.filter((n) => !n.is_pinned), [filtered]);

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
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(collapsedKey);
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        setCollapsedFolders(new Set(ids));
      }
    } catch {
      // ignore
    }
  }, [collapsedKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(collapsedKey, JSON.stringify(Array.from(collapsedFolders)));
  }, [collapsedFolders, collapsedKey]);

  useEffect(() => {
    if (dialog?.type === "folder") {
      setFolderNameInput(dialog.folder?.name ?? "");
      setFolderParentId(dialog.folder?.parent_id ?? selectedFolder ?? null);
    } else if (dialog?.type === "folder-parent") {
      setFolderParentId(dialog.folder?.parent_id ?? null);
    } else {
      setFolderNameInput("");
      setFolderParentId(null);
    }
  }, [dialog, selectedFolder]);

  // Keyboard shortcuts for search (/ or Cmd/Ctrl+K)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Persist tag filters between sessions
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("drraww:selectedTags");
    if (!stored) return;
    try {
      const parsed: string[] = JSON.parse(stored);
      const valid = parsed.filter((id) => tagList.some((t) => t.id === id));
      if (valid.length > 0) setSelectedTags(valid);
    } catch {
      // ignore parse errors
    }
  }, [tagList]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("drraww:selectedTags", JSON.stringify(selectedTags));
  }, [selectedTags]);

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
    setFolderParentId(selectedFolder);
    setDialog({ type: "folder", mode: "create" });
  };

  const handleRenameFolder = (folder: Folder) => {
    setDialog({ type: "folder", mode: "rename", folder });
  };

  const handleDeleteFolder = (folder: Folder) => {
    setDialog({ type: "delete-folder", folder });
  };

  const handleChangeFolderParent = (folder: Folder) => {
    setFolderParentId(folder.parent_id ?? null);
    setDialog({ type: "folder-parent", folder });
  };

  const toggleCollapsed = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleDropOnFolder = (folder: Folder | null, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFolder(null);
    const noteId = e.dataTransfer.getData("text/note-id");
    const folderId = e.dataTransfer.getData("text/folder-id");
    if (noteId) {
      handleMoveNote(noteId, folder ? folder.id : null);
      return;
    }
    if (folderId) {
      if (!folder || folder.id === folderId) return;
      const descendants = new Set(getDescendantIds(folderId, folders));
      if (descendants.has(folder.id)) return;
      startTransition(async () => {
        await moveFolderParentAction(folderId, folder.id);
        setToast({ type: "success", message: "Folder moved" });
        router.refresh();
      });
    }
  };

  const renderFolderTree = (parentId: string | null, depth = 0) => {
    const children = folders.filter((f) => f.parent_id === parentId);
    if (children.length === 0) return null;
    return children.map((folder) => {
      const isCollapsed = collapsedFolders.has(folder.id);
      const childNodes = renderFolderTree(folder.id, depth + 1);
      const isDrop = dragOverFolder === folder.id;
      return (
        <div
          key={folder.id}
          className={`flex flex-col rounded-xl ${selectedFolder === folder.id ? "bg-amber-50" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDropOnFolder(folder, e)}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOverFolder(folder.id);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOverFolder((prev) => (prev === folder.id ? null : prev));
          }}
        >
          <div
            className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition ${
              selectedFolder === folder.id
                ? "text-amber-800"
                : "text-slate-700 hover:bg-slate-100"
            }`}
            style={{ paddingLeft: `${12 + depth * 12}px` }}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/folder-id", folder.id)}
            onDragEnd={() => setDragOverFolder(null)}
            data-drop-target={isDrop ? "true" : undefined}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-slate-500"
                onClick={(evt) => {
                  evt.stopPropagation();
                  toggleCollapsed(folder.id);
                }}
              >
                {isCollapsed ? "▸" : "▾"}
              </button>
              <button
                type="button"
                className="flex-1 text-left font-semibold"
                onClick={() => setSelectedFolder(folder.id)}
              >
                {folder.name}
              </button>
            </div>
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
          {!isCollapsed ? childNodes : null}
        </div>
      );
    });
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
        const { id } = await createTagAction(name, newTagColor);
        setTagList((prev) => [...prev, { id, name, color: newTagColor }]);
        setNewTagName("");
        setNewTagColor(null);
      } catch (err) {
        setToast({
          type: "error",
          message:
            err instanceof Error ? err.message : "Could not create tag. It may already exist.",
        });
      }
    });
  };

  const renderNoteCard = (note: Note) => (
    <article
      key={note.id}
      className="group flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/note-id", note.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => setDragOverFolder(null)}
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
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                {note.folder_id
                  ? folders.find((f) => f.id === note.folder_id)?.name ?? "Folder"
                  : "Unfiled"}
              </span>
              <button
                type="button"
                onClick={() =>
                  setMoveDialog({
                    noteId: note.id,
                    title: note.title || "Untitled",
                    currentFolder: note.folder_id ?? null,
                  })
                }
                className="rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-700 hover:border-slate-300"
                disabled={isPending}
              >
                Move
              </button>
            </div>
            <div className="text-xs font-semibold text-amber-700">
              {note.is_pinned ? "Pinned" : ""}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleRename(note)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:border-slate-400"
              disabled={isPending}
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => handleDelete(note)}
              className="rounded-full border border-rose-200 px-2.5 py-1 text-[12px] font-semibold text-rose-700 hover:border-rose-400"
              disabled={isPending}
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => handleArchive(note)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:border-slate-400"
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
              className="rounded-full border border-amber-200 px-2.5 py-1 text-[12px] font-semibold text-amber-700 hover:border-amber-400"
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
          <div className="flex flex-wrap gap-1">
            {(note as Note & { note_tags?: { tag_id: string }[] }).note_tags?.map((tag) => {
              const tagMeta = tagList.find((t) => t.id === tag.tag_id);
              if (!tagMeta) return null;
              return (
                <button
                  key={tag.tag_id}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-slate-400"
                  style={tagColorStyle(tagMeta.color)}
                  onClick={() => {
                    const remaining =
                      (note as Note & { note_tags?: { tag_id: string }[] }).note_tags
                        ?.map((t) => t.tag_id)
                        .filter((id) => id !== tag.tag_id) ?? [];
                    startTransition(async () => {
                      await updateNoteTagsAction(note.id, remaining);
                      setToast({ type: "success", message: "Tag removed" });
                      router.refresh();
                    });
                  }}
                >
                  {tagMeta.name}
                  <span className="text-[10px] text-slate-500">✕</span>
                </button>
              );
            })}
          </div>
          {isPending ? <span className="text-xs text-slate-500">Working...</span> : null}
        </div>
      </div>
    </article>
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-12 pt-6 lg:flex-row">
      <aside className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:w-64">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">Folders</div>
          <button
            type="button"
            onClick={handleCreateFolder}
            className="rounded-lg border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
            disabled={isPending}
          >
            + New
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <div
            className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition ${
              selectedFolder === null
                ? "bg-amber-100 text-amber-800 shadow-sm"
                : "text-slate-700 hover:bg-slate-100"
            } ${dragOverFolder === "root" ? "border border-amber-300 bg-amber-50" : "border border-transparent"}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropOnFolder(null, e)}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOverFolder("root");
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOverFolder((prev) => (prev === "root" ? null : prev));
            }}
          >
            <button type="button" onClick={() => setSelectedFolder(null)} className="flex-1 text-left">
              All notes
            </button>
            <span className="text-xs text-slate-500">{notes.length}</span>
          </div>
          <div className="flex flex-col gap-1">{renderFolderTree(null)}</div>
        </div>
      </aside>

      <div className="flex-1 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Dashboard</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold text-slate-900">Your notes</h1>
                <div className="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-600">
                  {breadcrumb.map((crumb, idx) => (
                    <div key={`${crumb.id ?? "root"}-${idx}`} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedFolder(crumb.id)}
                        className={`rounded-lg px-2 py-1 transition ${
                          crumb.id === selectedFolder
                            ? "bg-amber-100 text-amber-800"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {crumb.name}
                      </button>
                      {idx < breadcrumb.length - 1 ? <span className="text-slate-400">/</span> : null}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Create, search, filter by folder, or open a note to continue drawing.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              New note
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              placeholder="Search titles"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              ref={searchRef}
              className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm outline-none ring-2 ring-transparent transition focus:border-slate-300 focus:ring-amber-200"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "updated" | "created" | "title" | "last_opened")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-amber-300"
            >
              <option value="updated">Last edited</option>
              <option value="last_opened">Last opened</option>
              <option value="created">Created (newest)</option>
              <option value="title">Title A-Z</option>
            </select>
            <div className="flex flex-wrap items-center gap-2">
              {tagList.map((tag) => {
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
                    style={
                      tag.color
                        ? { borderColor: tag.color, color: tag.color, backgroundColor: tag.color + "22" }
                        : undefined
                    }
                  >
                    {tag.name}
                  </button>
                );
              })}
              <div className="flex items-center gap-2 rounded-full border border-dashed border-slate-300 px-3 py-1">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="New tag"
                  className="w-24 bg-transparent text-xs outline-none placeholder:text-slate-400"
                />
                <div className="flex items-center gap-1">
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewTagColor(color)}
                      className={`h-4 w-4 rounded-full border ${
                        newTagColor === color ? "border-slate-800 ring-2 ring-slate-300" : "border-slate-200"
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Pick ${color}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTagManagerOpen(true)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                    disabled={isPending}
                  >
                    Manage
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateTag}
                    className="text-xs font-semibold text-amber-700 hover:text-amber-800"
                    disabled={isPending}
                  >
                    Add
                  </button>
                </div>
              </div>
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
          </div>
        </div>

        {recents.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">Recents</div>
              <span className="text-xs text-slate-500">Last opened</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recents.map((note) => (
                <Link
                  key={note.id}
                  href={`/app/note/${note.id}`}
                  className="min-w-[180px] rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="text-sm font-semibold text-slate-900 line-clamp-1">
                    {note.title || "Untitled"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {note.last_opened_at
                      ? `Opened ${formatUpdatedAt(note.last_opened_at)}`
                      : `Edited ${formatUpdatedAt(note.updated_at)}`}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-slate-600 shadow-sm">
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
          <div className="space-y-6">
            {pinnedNotes.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">Pinned</h3>
                  <span className="text-xs text-slate-500">{pinnedNotes.length}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {pinnedNotes.map((note) => renderNoteCard(note))}
                </div>
              </section>
            ) : null}
            {unpinnedNotes.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">
                    {pinnedNotes.length > 0 ? "Other notes" : "All notes"}
                  </h3>
                  <span className="text-xs text-slate-500">{unpinnedNotes.length}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {unpinnedNotes.map((note) => renderNoteCard(note))}
                </div>
              </section>
            ) : null}
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
                          await createFolderAction(name, folderParentId ?? null);
                          setToast({ type: "success", message: "Folder created" });
                        } else if (dialog.folder) {
                          await renameFolderAction(dialog.folder.id, name, folderParentId ?? null);
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
                  <label className="text-xs font-semibold text-slate-600">
                    Parent
                    <select
                      value={folderParentId ?? ""}
                      onChange={(e) =>
                        setFolderParentId(e.target.value === "" ? null : e.target.value)
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-2 ring-transparent transition focus:border-amber-300 focus:ring-amber-100"
                    >
                      <option value="">Top level</option>
                      {folders
                        .filter((f) => {
                          if (!dialog.folder) return true;
                          if (f.id === dialog.folder.id) return false;
                          const descendants = new Set(
                            getDescendantIds(dialog.folder.id, folders),
                          );
                          return !descendants.has(f.id);
                        })
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                  </label>
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
            ) : dialog.type === "folder-parent" ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900">Move folder</h3>
                <p className="mt-2 text-sm text-slate-700">
                  Choose a new parent for <span className="font-semibold">{dialog.folder?.name}</span>. Descendants are excluded.
                </p>
                <label className="mt-3 block text-xs font-semibold text-slate-600">
                  Parent
                  <select
                    value={folderParentId ?? ""}
                    onChange={(e) =>
                      setFolderParentId(e.target.value === "" ? null : e.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-2 ring-transparent transition focus:border-amber-300 focus:ring-amber-100"
                  >
                    <option value="">Top level</option>
                    {folders
                      .filter((f) => {
                        if (!dialog.folder) return true;
                        if (f.id === dialog.folder.id) return false;
                        const descendants = new Set(getDescendantIds(dialog.folder.id, folders));
                        return !descendants.has(f.id);
                      })
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                </label>
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
                        try {
                          const folderId = dialog.folder?.id;
                          if (!folderId) return;
                          await moveFolderParentAction(folderId, folderParentId ?? null);
                          setToast({ type: "success", message: "Folder moved" });
                          setDialog(null);
                          router.refresh();
                        } catch (err) {
                          setToast({
                            type: "error",
                            message:
                              err instanceof Error ? err.message : "Unable to move folder",
                          });
                        }
                      });
                    }}
                    className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60"
                    disabled={isPending}
                  >
                    Save
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
              <div className="flex items-center gap-1">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewTagColor(color)}
                    className={`h-6 w-6 rounded-full border ${
                      newTagColor === color ? "border-slate-800 ring-2 ring-slate-300" : "border-slate-200"
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Pick ${color}`}
                  />
                ))}
              </div>
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
      {moveDialog ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Move note</h3>
                <p className="text-sm text-slate-600">
                  Move <span className="font-semibold">{moveDialog.title}</span> to a folder.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMoveDialog(null)}
                className="text-slate-500 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <input
                  type="radio"
                  name="move-folder"
                  checked={moveDialog.currentFolder === null}
                  onChange={() => setMoveDialog({ ...moveDialog, currentFolder: null })}
                />
                <span className="font-semibold text-slate-800">Unfiled (All notes)</span>
              </label>
              {folders.map((folder) => (
                <label
                  key={folder.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  style={{ paddingLeft: `${Math.min(24 + depthOfFolder(folder, folders) * 12, 48)}px` }}
                >
                  <input
                    type="radio"
                    name="move-folder"
                    checked={moveDialog.currentFolder === folder.id}
                    onChange={() =>
                      setMoveDialog({
                        ...moveDialog,
                        currentFolder: folder.id,
                      })
                    }
                  />
                  <span className="font-semibold text-slate-800">{folder.name}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMoveDialog(null)}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-slate-300"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  startTransition(async () => {
                    await moveNoteToFolderAction(moveDialog.noteId, moveDialog.currentFolder);
                    setToast({ type: "success", message: "Note moved" });
                    setMoveDialog(null);
                    router.refresh();
                  });
                }}
                className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
                disabled={isPending}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {tagManagerOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Manage tags</h3>
                <p className="text-sm text-slate-600">Rename, recolor, or delete tags.</p>
              </div>
              <button
                type="button"
                onClick={() => setTagManagerOpen(false)}
                className="text-slate-500 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {tagList.length === 0 ? (
                <p className="text-sm text-slate-500">No tags yet.</p>
              ) : (
                tagList.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full border border-slate-200"
                        style={tag.color ? { backgroundColor: tag.color, borderColor: tag.color } : undefined}
                      />
                      <span className="text-sm font-semibold text-slate-800">{tag.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingTag(tag)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-400"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          startTransition(async () => {
                            await deleteTagAction(tag.id);
                            setTagList((prev) => prev.filter((t) => t.id !== tag.id));
                            setSelectedTags((prev) => prev.filter((id) => id !== tag.id));
                            router.refresh();
                          });
                        }}
                        className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:border-rose-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {editingTag ? (
              <div className="mt-4 rounded-xl border border-slate-200 p-3">
                <h4 className="text-sm font-semibold text-slate-800">Edit tag</h4>
                <div className="mt-2 flex flex-col gap-2">
                  <input
                    type="text"
                    value={editingTag.name}
                    onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none ring-2 ring-transparent transition focus:border-amber-300 focus:ring-amber-100"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {TAG_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditingTag({ ...editingTag, color })}
                        className={`h-6 w-6 rounded-full border ${
                          editingTag.color === color ? "border-slate-800 ring-2 ring-slate-300" : "border-slate-200"
                        }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Pick ${color}`}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditingTag({ ...editingTag, color: null })}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-slate-400"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingTag(null)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!editingTag.name.trim()) {
                          setToast({ type: "error", message: "Name cannot be empty" });
                          return;
                        }
                        startTransition(async () => {
                          await renameTagAction(editingTag.id, editingTag.name.trim(), editingTag.color);
                          setTagList((prev) =>
                            prev.map((t) => (t.id === editingTag.id ? editingTag : t)),
                          );
                          setEditingTag(null);
                          router.refresh();
                        });
                      }}
                      className="rounded-full bg-emerald-600 px-4 py-1 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
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

function tagColorStyle(color: string | null) {
  return color
    ? {
        borderColor: color,
        color,
        backgroundColor: color + "22",
      }
    : undefined;
}

function buildBreadcrumb(selectedFolder: string | null, folders: Folder[]) {
  if (!selectedFolder) return [{ id: null as string | null, name: "All notes" }];
  const map = new Map(folders.map((f) => [f.id, f]));
  const path: { id: string | null; name: string }[] = [{ id: null, name: "All notes" }];
  let current: Folder | undefined = map.get(selectedFolder);
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    path.push({ id: current.id, name: current.name });
    guard.add(current.id);
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return path.reverse();
}

function getDescendantIds(folderId: string, folders: Folder[]): string[] {
  const children = folders.filter((f) => f.parent_id === folderId);
  const ids = children.map((c) => c.id);
  children.forEach((child) => {
    ids.push(...getDescendantIds(child.id, folders));
  });
  return ids;
}

function depthOfFolder(folder: Folder, folders: Folder[]) {
  let depth = 0;
  let current = folder;
  const map = new Map(folders.map((f) => [f.id, f]));
  const guard = new Set<string>();
  while (current.parent_id && map.has(current.parent_id) && !guard.has(current.parent_id)) {
    depth += 1;
    guard.add(current.parent_id);
    current = map.get(current.parent_id)!;
  }
  return depth;
}
