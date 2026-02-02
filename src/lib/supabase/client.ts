import { createBrowserClient } from "@supabase/ssr";
import { Database } from "../database.types";

export function createSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables on the client.");
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
}
