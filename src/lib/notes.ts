import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import { Database } from "./database.types";

export type Note = Database["public"]["Tables"]["notes"]["Row"];

async function getUserIdOrRedirect() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return { supabase, user };
}

export async function listNotes(): Promise<Note[]> {
  const { supabase, user } = await getUserIdOrRedirect();

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("owner_id", user.id)
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load notes: ${error.message}`);
  }

  return (data as Note[] | null) ?? [];
}

export async function createNote(title = "Untitled"): Promise<string> {
  const { supabase, user } = await getUserIdOrRedirect();

  const { data, error } = await supabase
    .from("notes")
    .insert({
      owner_id: user.id,
      title,
      doc: {},
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create note: ${error?.message}`);
  }

  return data.id;
}

export async function renameNote(noteId: string, title: string) {
  const { supabase, user } = await getUserIdOrRedirect();

  const { error } = await supabase
    .from("notes")
    .update({ title })
    .eq("id", noteId)
    .eq("owner_id", user.id)
    .eq("is_deleted", false);

  if (error) {
    throw new Error(`Failed to rename note: ${error.message}`);
  }
}

export async function deleteNote(noteId: string) {
  const { supabase, user } = await getUserIdOrRedirect();

  const { error } = await supabase
    .from("notes")
    .update({ is_deleted: true })
    .eq("id", noteId)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(`Failed to delete note: ${error.message}`);
  }
}

export async function getNote(noteId: string): Promise<Note> {
  const { supabase, user } = await getUserIdOrRedirect();

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("id", noteId)
    .eq("owner_id", user.id)
    .eq("is_deleted", false)
    .single();

  if (error || !data) {
    notFound();
  }

  return data as Note;
}
