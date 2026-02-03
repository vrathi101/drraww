"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "crypto";
import {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  moveNoteToFolder,
  moveFolderParent,
  renameFolder,
  renameNote,
  togglePinNote,
  archiveNote,
  updateNoteTags,
  listShares,
  createShare,
  revokeShare,
  updateSharePassword,
} from "@/lib/notes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createNoteAction() {
  const noteId = await createNote();
  revalidatePath("/app");
  return { noteId };
}

export async function renameNoteAction(noteId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Title cannot be empty");
  }
  await renameNote(noteId, trimmed);
  revalidatePath("/app");
}

export async function deleteNoteAction(noteId: string) {
  await deleteNote(noteId);
  revalidatePath("/app");
}

export async function createFolderAction(name: string, parentId: string | null = null) {
  const id = await createFolder(name, parentId);
  revalidatePath("/app");
  return { id };
}

export async function renameFolderAction(folderId: string, name: string, parentId?: string | null) {
  await renameFolder(folderId, name, parentId);
  revalidatePath("/app");
}

export async function deleteFolderAction(folderId: string) {
  await deleteFolder(folderId);
  revalidatePath("/app");
}

export async function moveNoteToFolderAction(noteId: string, folderId: string | null) {
  await moveNoteToFolder(noteId, folderId);
  revalidatePath("/app");
}

export async function moveFolderParentAction(folderId: string, parentId: string | null) {
  await moveFolderParent(folderId, parentId);
  revalidatePath("/app");
}

export async function togglePinNoteAction(noteId: string, pin: boolean) {
  await togglePinNote(noteId, pin);
  revalidatePath("/app");
}

export async function archiveNoteAction(noteId: string) {
  await archiveNote(noteId);
  revalidatePath("/app");
}

export async function updateNoteTagsAction(noteId: string, tagIds: string[]) {
  await updateNoteTags(noteId, tagIds);
  revalidatePath("/app");
}

export async function listSharesAction(noteId: string) {
  const links = await listShares(noteId);
  return { links };
}

export async function createShareAction(
  noteId: string,
  allowEdit: boolean,
  expiresAt?: string | null,
  password?: string | null,
) {
  const passwordHash = password ? createHash("sha256").update(password).digest("hex") : null;
  const link = await createShare(noteId, allowEdit, expiresAt, passwordHash);
  return { link };
}

export async function revokeShareAction(shareId: string) {
  await revokeShare(shareId);
}

export async function updateSharePasswordAction(shareId: string, password?: string | null) {
  const trimmed = password?.trim() ?? "";
  const passwordHash = trimmed
    ? createHash("sha256")
        .update(trimmed)
        .digest("hex")
    : null;
  const share = await updateSharePassword(shareId, passwordHash);
  return { share };
}

export async function searchNotesAction(query: string) {
  const term = (query || "").trim();
  if (!term) return { results: [] };

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase
    .from("notes")
    .select("id, title, updated_at, folder_id, is_pinned, last_opened_at")
    .eq("owner_id", user.id)
    .eq("is_deleted", false)
    .ilike("title", `%${term}%`)
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`Search failed: ${error.message}`);
  return { results: data ?? [] };
}
