"use client";

import { useSupabase } from "@/components/supabase-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  variant?: "ghost" | "danger";
};

export function SignOutButton({ variant = "ghost" }: Props) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
    setLoading(false);
  };

  const base =
    "inline-flex items-center justify-center rounded-full text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-60 disabled:cursor-not-allowed";
  const styles =
    variant === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-700 px-4 py-2"
      : "border border-slate-200 bg-white px-4 py-2 hover:border-slate-400";

  return (
    <button
      type="button"
      className={`${base} ${styles}`}
      onClick={handleSignOut}
      disabled={loading}
    >
      Sign out
    </button>
  );
}
