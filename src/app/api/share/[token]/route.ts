import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/database.types";
import { createHash } from "crypto";

function hashPassword(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function GET(
  _request: Request,
  { params }: { params: { token: string } },
) {
  const supabase = createSupabaseServiceClient();
  const { data: share, error: shareError } = await supabase
    .from("note_shares")
    .select("allow_edit, expires_at, password_hash, notes:note_id (id, title, doc, updated_at)")
    .eq("token", params.token)
    .maybeSingle();

  if (shareError || !share) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const typed = share as {
    allow_edit: boolean;
    expires_at: string | null;
    password_hash: string | null;
    notes: { id: string; title: string; doc: Json; updated_at: string };
  };

  if (typed.expires_at && new Date(typed.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  if (typed.password_hash) {
    const supplied = _request.headers.get("x-share-password") || "";
    if (!supplied || hashPassword(supplied) !== typed.password_hash) {
      return NextResponse.json({ error: "Password required" }, { status: 401 });
    }
  }

  return NextResponse.json({
    allow_edit: typed.allow_edit,
    note: typed.notes,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: { token: string } },
) {
  const supabase = createSupabaseServiceClient();
  const { data: share, error: shareError } = await supabase
    .from("note_shares")
    .select("allow_edit, note_id, owner_id")
    .eq("token", params.token)
    .maybeSingle();

  if (shareError || !share) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!share.allow_edit) {
    return NextResponse.json({ error: "Read only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { doc, title } = body as { doc?: Json; title?: string };

  if (!doc && !title) {
    return NextResponse.json({ error: "No content" }, { status: 400 });
  }

  const update: Record<string, Json> = {};
  if (doc) update.doc = doc as Json;
  if (title && title.trim()) update.title = title.trim();

  const { error: updateError } = await supabase
    .from("notes")
    .update(update)
    .eq("id", share.note_id)
    .eq("owner_id", share.owner_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
