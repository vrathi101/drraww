import { getNote } from "@/lib/notes";
import Link from "next/link";

type Props = {
  params: { id: string };
};

export default async function NotePage({ params }: Props) {
  const note = await getNote(params.id);

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <Link
          href="/app"
          className="text-sm font-semibold text-amber-700 hover:text-amber-800"
        >
          ← Back to dashboard
        </Link>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Editor coming next
        </div>
      </div>
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/90 p-10 shadow-sm">
        <div className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-slate-500">
          Note title
        </div>
        <h1 className="text-3xl font-semibold text-slate-900">
          {note.title || "Untitled"}
        </h1>
        <p className="mt-4 text-slate-600">
          The canvas editor will load here. For now, note data is stored in
          Supabase and routed correctly. Updated at {new Date(note.updated_at).toLocaleString()}.
        </p>
      </div>
    </div>
  );
}
