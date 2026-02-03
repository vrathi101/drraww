import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const noteId = formData.get("noteId") as string | null;
  if (!file || !noteId) {
    return NextResponse.json({ error: "Missing file or noteId" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }
  if (!file.type || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image uploads are supported" }, { status: 400 });
  }

  const { data: noteRow, error: noteError } = await supabase
    .from("notes")
    .select("id")
    .eq("id", noteId)
    .eq("owner_id", user.id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (noteError || !noteRow) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_ASSETS_BUCKET || "note-assets";
  const extension = file.name.split(".").pop() || "bin";
  const path = `attachments/${user.id}/${noteId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: insertData, error: insertError } = await supabase
    .from("note_attachments")
    .insert({
      owner_id: user.id,
      note_id: noteId,
      path,
      mime_type: file.type,
      file_name: file.name,
      size: file.size,
    })
    .select("id, path, mime_type, file_name, size")
    .single();

  if (insertError || !insertData) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to save attachment" }, { status: 500 });
  }

  return NextResponse.json({ attachment: insertData });
}
