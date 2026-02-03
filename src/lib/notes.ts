import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import { Database } from "./database.types";

export type Note = Database["public"]["Tables"]["notes"]["Row"];
export type Folder = Database["public"]["Tables"]["folders"]["Row"];

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

export async function listNotes(folderId?: string): Promise<Note[]> {
  const { supabase, user } = await getUserIdOrRedirect();

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("owner_id", user.id)
    .eq("is_deleted", false)
    .match(folderId ? { folder_id: folderId } : {})
    .order("is_pinned", { ascending: false })
    .order("pinned_at", { ascending: false })
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
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
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

export async function listFolders(): Promise<Folder[]> {
  const { supabase, user } = await getUserIdOrRedirect();

  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load folders: ${error.message}`);
  }

  return (data as Folder[] | null) ?? [];
}

export async function createFolder(name: string): Promise<string> {
  const { supabase, user } = await getUserIdOrRedirect();

  const trimmed = name.trim() || "Untitled";
  const { data, error } = await supabase
    .from("folders")
    .insert({
      owner_id: user.id,
      name: trimmed,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create folder: ${error?.message}`);
  }
  return data.id;
}

export async function renameFolder(folderId: string, name: string) {
  const { supabase, user } = await getUserIdOrRedirect();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Name cannot be empty");
  }
  const { error } = await supabase
    .from("folders")
    .update({ name: trimmed })
    .eq("id", folderId)
    .eq("owner_id", user.id);
  if (error) throw new Error(`Failed to rename folder: ${error.message}`);
}

export async function deleteFolder(folderId: string) {
  const { supabase, user } = await getUserIdOrRedirect();

  const { error: clearError } = await supabase
    .from("notes")
    .update({ folder_id: null })
    .eq("folder_id", folderId)
    .eq("owner_id", user.id);
  if (clearError) throw new Error(`Failed to detach notes: ${clearError.message}`);

  const { error } = await supabase
    .from("folders")
    .delete()
    .eq("id", folderId)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(`Failed to delete folder: ${error.message}`);
  }
}

export async function moveNoteToFolder(noteId: string, folderId: string | null) {
  const { supabase, user } = await getUserIdOrRedirect();

  const { error } = await supabase
    .from("notes")
    .update({ folder_id: folderId })
    .eq("id", noteId)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(`Failed to move note: ${error.message}`);
  }
}

export async function togglePinNote(noteId: string, pin: boolean) {
  const { supabase, user } = await getUserIdOrRedirect();
  const { error } = await supabase
    .from("notes")
    .update({
      is_pinned: pin,
      pinned_at: pin ? new Date().toISOString() : null,
    })
    .eq("id", noteId)
    .eq("owner_id", user.id);
  if (error) throw new Error(`Failed to update pin: ${error.message}`);
}

export async function getDeletedNotes(): Promise<Note[]> {
  const { supabase, user } = await getUserIdOrRedirect();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("owner_id", user.id)
    .eq("is_deleted", true)
    .order("deleted_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load deleted notes: ${error.message}`);
  }
  return (data as Note[] | null) ?? [];
}

export async function restoreNote(noteId: string) {
  const { supabase, user } = await getUserIdOrRedirect();

  const { error } = await supabase
    .from("notes")
    .update({ is_deleted: false, deleted_at: null, archived_at: null })
    .eq("id", noteId)
    .eq("owner_id", user.id);
  if (error) throw new Error(`Failed to restore note: ${error.message}`);
}

export async function archiveNote(noteId: string) {
  const { supabase, user } = await getUserIdOrRedirect();
  const { error } = await supabase
    .from("notes")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("owner_id", user.id);
  if (error) throw new Error(`Failed to archive note: ${error.message}`);
}

export async function getArchivedNotes(): Promise<Note[]> {
  const { supabase, user } = await getUserIdOrRedirect();
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("owner_id", user.id)
    .eq("is_deleted", false)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to load archived notes: ${error.message}`);
  }
  return (data as Note[] | null) ?? [];
}
