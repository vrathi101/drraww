"use server";

import { revalidatePath } from "next/cache";
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
} from "@/lib/notes";

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
