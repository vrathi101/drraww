import { SignOutButton } from "@/components/auth/sign-out-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
            Dashboard
          </p>
          <h1 className="text-3xl font-semibold text-slate-900">
            Your notes
          </h1>
          <p className="text-slate-600">
            Signed in as <span className="font-semibold">{user?.email}</span>
          </p>
        </div>
        <SignOutButton />
      </div>
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/90 p-10 text-slate-600 shadow-sm">
        Notes dashboard coming next. Supabase connection is wired; once the
        schema is applied we will fetch your notes here.
      </div>
    </div>
  );
}
