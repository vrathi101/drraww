import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";

async function getUser() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { supabase, user, error };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { supabase, user, error } = await getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error: noteError } = await supabase
    .from("notes")
    .select("*")
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .eq("is_deleted", false)
    .single();

  if (noteError || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { supabase, user, error } = await getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { title, doc, base_updated_at } = body ?? {};

  const payload: Record<string, Json> = {};
  if (typeof title === "string" && title.trim()) {
    payload.title = title.trim();
  }
  if (doc) {
    payload.doc = doc as Json;
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  let query = supabase
    .from("notes")
    .update(payload)
    .eq("id", params.id)
    .eq("owner_id", user.id);

  if (base_updated_at) {
    query = query.eq("updated_at", base_updated_at);
  }

  const { data, error: updateError } = await query.select("updated_at").maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 409 });
  }

  return NextResponse.json({ updated_at: data?.updated_at });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { supabase, user, error } = await getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error: deleteError } = await supabase
    .from("notes")
    .update({ is_deleted: true })
    .eq("id", params.id)
    .eq("owner_id", user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
