"use client";

import { useSupabase } from "@/components/supabase-provider";
import { useMemo, useState, type ReactNode } from "react";

type SignInButtonProps = {
  redirectPath?: string;
  variant?: "primary" | "ghost";
  children?: ReactNode;
};

export function SignInButton({
  redirectPath = "/app",
  variant = "primary",
  children,
}: SignInButtonProps) {
  const { supabase } = useSupabase();
  const [loading, setLoading] = useState(false);
  const siteUrl = useMemo(
    () => process.env.NEXT_PUBLIC_SITE_URL || window.location.origin,
    [],
  );

  const handleClick = async () => {
    setLoading(true);
    const redirect = `${siteUrl}/auth/callback?redirect=${encodeURIComponent(redirectPath)}`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirect,
        scopes: "email profile",
      },
    });

    if (error) {
      console.error("Google sign-in failed", error.message);
      setLoading(false);
    }
  };

  const baseStyles =
    "inline-flex items-center justify-center rounded-full text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black disabled:opacity-60 disabled:cursor-not-allowed";

  const variants: Record<typeof variant, string> = {
    primary:
      "bg-black text-white hover:bg-black/90 px-5 py-3 shadow-lg shadow-black/10",
    ghost: "border border-black/10 text-black px-4 py-2 hover:border-black/40",
  };

  return (
    <button
      type="button"
      className={`${baseStyles} ${variants[variant]}`}
      onClick={handleClick}
      disabled={loading}
    >
      {children ?? "Continue with Google"}
    </button>
  );
}
