import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

const NOTE_QUOTA_BYTES = 25 * 1024 * 1024; // 25MB per note
const USER_QUOTA_BYTES = 200 * 1024 * 1024; // 200MB per user
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

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
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
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

  // Simple quota checks (note + user)
  const { data: noteSizes } = await supabase
    .from("note_attachments")
    .select("size")
    .eq("note_id", noteId)
    .eq("owner_id", user.id);
  const noteUsed =
    noteSizes?.reduce((acc, row) => acc + Number(row.size ?? 0), 0) ?? 0;
  if (noteUsed + file.size > NOTE_QUOTA_BYTES) {
    return NextResponse.json(
      { error: "Note attachments quota exceeded (25MB)" },
      { status: 400 },
    );
  }

  const { data: userSizes } = await supabase
    .from("note_attachments")
    .select("size")
    .eq("owner_id", user.id);
  const userUsed =
    userSizes?.reduce((acc, row) => acc + Number(row.size ?? 0), 0) ?? 0;
  if (userUsed + file.size > USER_QUOTA_BYTES) {
    return NextResponse.json(
      { error: "Account attachments quota exceeded (200MB)" },
      { status: 400 },
    );
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
