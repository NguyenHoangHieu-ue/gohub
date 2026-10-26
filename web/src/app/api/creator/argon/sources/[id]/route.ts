import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { ARGON_BUCKET, ownSource } from "@/lib/argon/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { countTokens, sourceParts } from "@/lib/argon/context"
import { sha256 } from "@/lib/argon/extract"
import { syncSource } from "@/lib/argon/lark-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET → nguồn đầy đủ (nội dung chữ, đường xem file ký sẵn 10 phút, danh sách phiên bản) · GET ?version=N → chữ của phiên bản N.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const src = await ownSource(params.id, username)
  if (!src) return NextResponse.json({ error: "Không tìm thấy nguồn" }, { status: 404 })
  const v = req.nextUrl.searchParams.get("version")
  if (v) {
    const { data } = await supabaseAdmin.from("argon_source_versions").select("extracted_text,version,note,created_at").eq("source_id", params.id).eq("version", Number(v)).maybeSingle()
    return NextResponse.json({ version: data })
  }
  const [{ data: versions }, signed] = await Promise.all([
    supabaseAdmin.from("argon_source_versions").select("version,note,author,created_at").eq("source_id", params.id).order("version", { ascending: false }),
    src.storage_path ? supabaseAdmin.storage.from(ARGON_BUCKET).createSignedUrl(src.storage_path, 600) : Promise.resolve({ data: null }),
  ])
  return NextResponse.json({ source: src, versions: versions ?? [], fileUrl: signed.data?.signedUrl ?? null })
}

// PATCH { enabled?, pinned?, name?, text? (+note?), restoreVersion? } — sửa chữ = tạo phiên bản mới, không ghi đè bản cũ.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const src = await ownSource(params.id, username)
  if (!src) return NextResponse.json({ error: "Không tìm thấy nguồn" }, { status: 404 })
  const b = (await req.json().catch(() => ({}))) as { enabled?: boolean; pinned?: boolean; name?: string; text?: string; note?: string; restoreVersion?: number }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof b.enabled === "boolean") patch.enabled = b.enabled
  if (typeof b.pinned === "boolean") patch.pinned = b.pinned
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 160)

  let newText: string | null = null, vnote = b.note?.trim() || "Sửa tay"
  if (typeof b.restoreVersion === "number") {
    const { data } = await supabaseAdmin.from("argon_source_versions").select("extracted_text").eq("source_id", params.id).eq("version", b.restoreVersion).maybeSingle()
    if (!data) return NextResponse.json({ error: "Không có phiên bản này" }, { status: 404 })
    newText = data.extracted_text ?? ""
    vnote = `Khôi phục bản ${b.restoreVersion}`
  } else if (typeof b.text === "string") {
    newText = b.text
  }
  if (newText !== null && newText !== (src.extracted_text ?? "")) {
    if (src.send_binary) return NextResponse.json({ error: "Nguồn này gửi file gốc cho model (PDF/ảnh/video/âm thanh) nên không sửa chữ được" }, { status: 400 })
    const version = src.version + 1
    patch.extracted_text = newText
    patch.version = version
    patch.content_hash = sha256(newText)
    patch.size_bytes = Buffer.byteLength(newText)
    patch.meta = { ...src.meta, edited: src.kind === "file" ? true : undefined }
    patch.tokens = await countTokens(await sourceParts({ ...src, extracted_text: newText }, { left: 0 }, []))
    await supabaseAdmin.from("argon_source_versions").insert({ source_id: params.id, version, extracted_text: newText, note: vnote, author: username })
  }
  const { data, error } = await supabaseAdmin.from("argon_sources").update(patch).eq("id", params.id).select("id,project_id,kind,name,mime,size_bytes,send_binary,tokens,external_url,sync_mode,synced_at,enabled,pinned,version,meta,created_at,updated_at").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data })
}

// POST → đồng bộ lại 1 nguồn Lark / gói dữ liệu ngay (so hash, đổi mới tạo phiên bản).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const src = await ownSource(params.id, username)
  if (!src) return NextResponse.json({ error: "Không tìm thấy nguồn" }, { status: 404 })
  const result = await syncSource(src, req.nextUrl.origin)
  const { data } = await supabaseAdmin.from("argon_sources").select("id,project_id,kind,name,mime,size_bytes,send_binary,tokens,external_url,sync_mode,synced_at,enabled,pinned,version,meta,created_at,updated_at").eq("id", params.id).single()
  return NextResponse.json({ result, source: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const src = await ownSource(params.id, username)
  if (!src) return NextResponse.json({ error: "Không tìm thấy nguồn" }, { status: 404 })
  const { data: vers } = await supabaseAdmin.from("argon_source_versions").select("storage_path").eq("source_id", params.id)
  const paths = Array.from(new Set([src.storage_path, ...(vers ?? []).map(v => v.storage_path)].filter((p): p is string => !!p)))
  if (paths.length) await supabaseAdmin.storage.from(ARGON_BUCKET).remove(paths)
  const { error } = await supabaseAdmin.from("argon_sources").delete().eq("id", params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
