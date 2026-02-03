import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";

const CommandPalette = dynamic(() => import("@/components/command-palette").then((m) => m.CommandPalette), {
  ssr: false,
});

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <CommandPalette />
      {children}
    </div>
  );
}
