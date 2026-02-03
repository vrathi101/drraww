import Link from "next/link";
import { getArchivedNotes } from "@/lib/notes";
import { restoreNoteAction } from "../trash/restore-action";

export default async function ArchivePage() {
  const notes = await getArchivedNotes();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Archive</p>
          <h1 className="text-3xl font-semibold text-slate-900">Archived notes</h1>
          <p className="text-sm text-slate-600">
            These notes are hidden from the main list. Restore to make them active again.
          </p>
        </div>
        <Link
          href="/app"
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:border-amber-300"
        >
          Back to dashboard
        </Link>
      </div>
      {notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/90 p-10 text-slate-600 shadow-sm">
          Archive is empty.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="space-y-1">
                <div className="text-lg font-semibold text-slate-900">
                  {note.title || "Untitled"}
                </div>
                <div className="text-xs text-slate-500">
                  Archived at{" "}
                  {note.archived_at
                    ? new Date(note.archived_at).toLocaleString()
                    : "unknown"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <form action={restoreNoteAction}>
                  <input type="hidden" name="noteId" value={note.id} />
                  <button
                    type="submit"
                    className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    Restore
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
