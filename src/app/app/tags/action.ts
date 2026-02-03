"use server";

import { createTag, deleteTag, renameTag } from "@/lib/tags";
import { revalidatePath } from "next/cache";

export async function createTagAction(name: string, color?: string | null) {
  const id = await createTag(name, color);
  revalidatePath("/app");
  return { id };
}

export async function renameTagAction(tagId: string, name: string, color?: string | null) {
  await renameTag(tagId, name, color);
  revalidatePath("/app");
}

export async function deleteTagAction(tagId: string) {
  await deleteTag(tagId);
  revalidatePath("/app");
}
