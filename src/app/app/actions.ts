"use server";

import { revalidatePath } from "next/cache";
import { createNote, deleteNote, renameNote } from "@/lib/notes";

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
