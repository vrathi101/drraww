import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabase/server";
import { Database } from "./database.types";

export type Note = Database["public"]["Tables"]["notes"]["Row"];
export type Folder = Database["public"]["Tables"]["folders"]["Row"];
export type NoteShare = Database["public"]["Tables"]["note_shares"]["Row"];

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
    .select(
      `
      *,
      note_tags:note_tags ( tag_id )
    `,
    )
    .eq("owner_id", user.id)
    .eq("is_deleted", false)
    .match(folderId ? { folder_id: folderId } : {})
    .order("is_pinned", { ascending: false })
    .order("pinned_at", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load notes: ${error.message}`);
  }

  return (data as (Note & { note_tags?: { tag_id: string }[] })[] | null) ?? [];
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

export async function createFolder(name: string, parentId: string | null = null): Promise<string> {
  const { supabase, user } = await getUserIdOrRedirect();

  const trimmed = name.trim() || "Untitled";
  const { data, error } = await supabase
    .from("folders")
    .insert({
      owner_id: user.id,
      name: trimmed,
      parent_id: parentId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create folder: ${error?.message}`);
  }
  return data.id;
}

export async function renameFolder(folderId: string, name: string, parentId?: string | null) {
  const { supabase, user } = await getUserIdOrRedirect();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Name cannot be empty");
  }

  const { data: folders, error: foldersError } = await supabase
    .from("folders")
    .select("id,parent_id")
    .eq("owner_id", user.id);
  if (foldersError) throw new Error(`Failed to load folders: ${foldersError.message}`);
  const all = (folders as { id: string; parent_id: string | null }[] | null) ?? [];
  const current = all.find((f) => f.id === folderId);
  const nextParent = parentId === undefined ? current?.parent_id ?? null : parentId;
  if (nextParent === folderId) {
    throw new Error("Folder cannot be its own parent");
  }
  if (nextParent && isDescendant(all, nextParent, folderId)) {
    throw new Error("Cannot move folder into its own descendant");
  }

  const { error } = await supabase
    .from("folders")
    .update({ name: trimmed, parent_id: nextParent })
    .eq("id", folderId)
    .eq("owner_id", user.id);
  if (error) throw new Error(`Failed to rename folder: ${error.message}`);
}

export async function moveFolderParent(folderId: string, parentId: string | null) {
  const { supabase, user } = await getUserIdOrRedirect();
  const { data: folders, error: foldersError } = await supabase
    .from("folders")
    .select("id,parent_id")
    .eq("owner_id", user.id);
  if (foldersError) throw new Error(`Failed to load folders: ${foldersError.message}`);
  const all = (folders as { id: string; parent_id: string | null }[] | null) ?? [];
  if (parentId === folderId) {
    throw new Error("Folder cannot be its own parent");
  }
  if (parentId && isDescendant(all, parentId, folderId)) {
    throw new Error("Cannot move folder into its own descendant");
  }
  const { error } = await supabase
    .from("folders")
    .update({ parent_id: parentId })
    .eq("id", folderId)
    .eq("owner_id", user.id);
  if (error) throw new Error(`Failed to move folder: ${error.message}`);
}

export async function deleteFolder(folderId: string) {
  const { supabase, user } = await getUserIdOrRedirect();

  // Move child folders up one level
  const { error: childMoveError } = await supabase
    .from("folders")
    .update({ parent_id: null })
    .eq("parent_id", folderId)
    .eq("owner_id", user.id);
  if (childMoveError) throw new Error(`Failed to detach child folders: ${childMoveError.message}`);

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

export async function updateNoteTags(noteId: string, tagIds: string[]) {
  const { supabase } = await getUserIdOrRedirect();

  const { error: deleteError } = await supabase
    .from("note_tags")
    .delete()
    .eq("note_id", noteId);
  if (deleteError) throw new Error(`Failed to clear tags: ${deleteError.message}`);

  if (tagIds.length === 0) return;

  const inserts = tagIds.map((tagId) => ({ note_id: noteId, tag_id: tagId }));
  const { error: insertError } = await supabase.from("note_tags").insert(inserts);
  if (insertError) throw new Error(`Failed to set tags: ${insertError.message}`);
}

export async function markNoteOpened(noteId: string) {
  const { supabase, user } = await getUserIdOrRedirect();
  const { error } = await supabase
    .from("notes")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("owner_id", user.id)
    .eq("is_deleted", false);
  if (error) {
    console.warn(`Failed to record last opened: ${error.message}`);
  }
}

export async function listShares(noteId: string): Promise<NoteShare[]> {
  const { supabase, user } = await getUserIdOrRedirect();
  const { data, error } = await supabase
    .from("note_shares")
    .select("*")
    .eq("note_id", noteId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load share links: ${error.message}`);
  return (data as NoteShare[] | null) ?? [];
}

export async function createShare(noteId: string, allowEdit: boolean, expiresAt?: string | null) {
  const { supabase, user } = await getUserIdOrRedirect();
  const token = crypto.randomUUID();
  const { error, data } = await supabase
    .from("note_shares")
    .insert({ note_id: noteId, owner_id: user.id, token, allow_edit: allowEdit, expires_at: expiresAt ?? null })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Failed to create share link: ${error?.message}`);
  return data as NoteShare;
}

export async function revokeShare(id: string) {
  const { supabase, user } = await getUserIdOrRedirect();
  const { error } = await supabase
    .from("note_shares")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) throw new Error(`Failed to revoke share: ${error.message}`);
}

function isDescendant(
  folders: { id: string; parent_id: string | null }[],
  candidateParent: string,
  targetId: string,
): boolean {
  const map = new Map(folders.map((f) => [f.id, f.parent_id]));
  let current: string | null | undefined = candidateParent;
  while (current) {
    if (current === targetId) return true;
    current = map.get(current) ?? null;
  }
  return false;
}
