import { createSupabaseServerClient } from "./supabase/server";
import { Database } from "./database.types";

export type Tag = Database["public"]["Tables"]["tags"]["Row"];

async function getUserId() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Unauthorized");
  }
  return { supabase, user };
}

export async function listTags(): Promise<Tag[]> {
  const { supabase, user } = await getUserId();
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("owner_id", user.id)
    .order("name", { ascending: true });
  if (error) throw new Error(`Failed to load tags: ${error.message}`);
  return (data as Tag[] | null) ?? [];
}

export async function createTag(name: string, color?: string | null): Promise<string> {
  const { supabase, user } = await getUserId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name cannot be empty");
  const { data, error } = await supabase
    .from("tags")
    .insert({ name: trimmed, color: color ?? null, owner_id: user.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create tag");
  return data.id;
}

export async function renameTag(tagId: string, name: string, color?: string | null) {
  const { supabase, user } = await getUserId();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name cannot be empty");
  const { error } = await supabase
    .from("tags")
    .update({ name: trimmed, color: color ?? null })
    .eq("id", tagId)
    .eq("owner_id", user.id);
  if (error) throw new Error(`Failed to update tag: ${error.message}`);
}

export async function deleteTag(tagId: string) {
  const { supabase, user } = await getUserId();
  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", tagId)
    .eq("owner_id", user.id);
  if (error) throw new Error(`Failed to delete tag: ${error.message}`);
}
