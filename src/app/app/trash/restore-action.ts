"use server";

import { restoreNote } from "@/lib/notes";
import { revalidatePath } from "next/cache";

export async function restoreNoteAction(formData: FormData) {
  const noteId = formData.get("noteId");
  if (!noteId || typeof noteId !== "string") return;
  await restoreNote(noteId);
  revalidatePath("/app");
  revalidatePath("/app/trash");
}
