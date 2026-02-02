import { SignInButton } from "@/components/auth/sign-in-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const features = [
  "Smooth pen + highlighter tools",
  "Autosave with Supabase",
  "Offline-friendly restore",
  "Export to PNG",
];

export default async function Home() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect("/app");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-sky-50 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-16 lg:flex-row lg:items-center lg:justify-between lg:py-20">
        <div className="space-y-6 lg:max-w-xl">
          <p className="inline-flex items-center rounded-full bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 shadow-sm ring-1 ring-amber-200">
            Infinite canvas notebook
          </p>
          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            Draw, highlight, and type on a canvas that never runs out of space.
          </h1>
          <p className="text-lg text-slate-600 sm:text-xl">
            Drraww keeps your strokes crisp, autosaves everything, and reloads
            your notes instantly across devices. Sign in with Google to start a
            note in seconds.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <SignInButton>Sign in with Google</SignInButton>
            <div className="text-sm text-slate-500">
              No spam. Notes stay private with per-user security.
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 text-sm font-medium shadow-sm ring-1 ring-slate-100"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  ✦
                </span>
                <span className="text-slate-700">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative isolate mt-6 w-full max-w-xl overflow-hidden rounded-3xl border border-slate-100 bg-white/80 p-6 shadow-xl backdrop-blur">
          <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-sky-100/70 blur-3xl" />
          <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-amber-100/70 blur-3xl" />
          <div className="relative space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-500">
                Preview: Canvas tools
              </div>
              <div className="flex gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="h-2 w-2 rounded-full bg-rose-500" />
              </div>
            </div>
            <div className="rounded-2xl border border-dashed border-slate-200 bg-gradient-to-br from-slate-50 via-white to-amber-50 p-6">
              <div className="mb-4 flex items-center gap-3 text-sm text-slate-600">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white">
                  ✐
                </span>
                <div>
                  <div className="font-semibold text-slate-800">
                    Smooth ink, highlighter, text
                  </div>
                  <div>Undo, redo, pan/zoom out of the box.</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">
                  Autosave
                </span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                  Offline restore
                </span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                  Vector scene JSON
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
