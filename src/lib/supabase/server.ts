import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Database } from "../database.types";

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables on the server.");
  }

  const mutableCookies = cookieStore as unknown as {
    get: typeof cookieStore.get;
    getAll: typeof cookieStore.getAll;
    set?: (name: string, value: string, options?: CookieOptions) => void;
  };

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return mutableCookies.getAll().map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          try {
            mutableCookies.set?.(name, value, options);
          } catch {
            // Read-only in server components; middleware/route handlers can set.
          }
        });
      },
    },
  });
}

export async function getServerSession() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}
