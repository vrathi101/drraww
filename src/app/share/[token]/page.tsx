import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import type { TLEditorSnapshot, TLStoreSnapshot } from "tldraw";

const ReadOnlyViewer = dynamic(() => import("tldraw").then((m) => m.Tldraw), {
  ssr: false,
});

function coerceSnapshot(value: unknown): TLEditorSnapshot | TLStoreSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  if ("document" in (value as Record<string, unknown>)) return value as TLEditorSnapshot;
  if ("store" in (value as Record<string, unknown>)) return value as TLStoreSnapshot;
  return undefined;
}

export default async function SharedNotePage({ params }: { params: { token: string } }) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("note_shares")
    .select("allow_edit, expires_at, notes:note_id (id, title, doc, updated_at)")
    .eq("token", params.token)
    .maybeSingle();

  if (error || !data || !data.notes) {
    notFound();
  }

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    notFound();
  }

  const snapshot = coerceSnapshot(data.notes.doc);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Shared note</p>
          <h1 className="text-2xl font-semibold text-slate-900">{data.notes.title || "Untitled"}</h1>
          <p className="text-sm text-slate-600">{data.allow_edit ? "Can edit" : "View only"}</p>
        </div>
        <a
          href={`/app/note/${data.notes.id}`}
          className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:border-amber-300"
        >
          Open in app
        </a>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
        <div className="h-[70vh] w-full">
          <ReadOnlyViewer
            persistenceKey={`share:${params.token}`}
            onMount={(editor) => {
              if (snapshot) editor.loadSnapshot(snapshot, { forceOverwriteSessionState: true });
              editor.updateInstanceState({ isReadonly: !data.allow_edit });
            }}
            inferDarkMode={false}
            hideUi={!data.allow_edit}
          />
        </div>
      </div>
    </div>
  );
}
