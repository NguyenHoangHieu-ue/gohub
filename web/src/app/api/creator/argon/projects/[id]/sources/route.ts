import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase"
import { ARGON_BUCKET, MAX_UPLOAD_BYTES, ensureArgonBucket, ownProject, type ArgonSource } from "@/lib/argon/server"
import { requireArgonMemberName } from "@/lib/argon/access"
import { extractFile } from "@/lib/argon/extract"
import { countTokens, sourceParts } from "@/lib/argon/context"
import { addYoutubeSource } from "@/lib/argon/video"
import { youtubeId } from "@/lib/argon/video-url"
import { addDataPack, addLarkLink, syncFolders, syncMany } from "@/lib/argon/lark-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Tải file lên 2 bước (Vercel giới hạn body ~4,5MB nên không đẩy file qua server):
//   POST { action:"prepare", files:[{name,size}] } → trả đường ký sẵn để trình duyệt tải thẳng lên Storage
//   POST { action:"register", items:[{path,name,mime,size}] } → server đọc file, trích chữ, đếm token, tạo nguồn
//   POST { action:"note", name, text } → nguồn ghi chú (văn bản dán tay)
//   POST { action:"lark", url, mode } → nguồn từ link Lark (docx/sheet/wiki/base; thư mục → liệt kê để chọn file, rồi mỗi file chọn 1 nguồn)
//   POST { action:"sync" } → đồng bộ lại mọi nguồn Lark + gói dữ liệu của dự án (chỉ tạo phiên bản mới khi nội dung đổi)
//   POST { action:"data", pack, quarter, mode } → thêm "gói dữ liệu" (số liệu hệ thống mới nhất từ các endpoint analytics)
const safe = (n: string) => n.replace(/[^\w.\-]+/g, "_").slice(-120)
const strip = ({ extracted_text: _t, ...s }: ArgonSource) => (void _t, s)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const username = await requireArgonMemberName()
  if (!username) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!(await ownProject(params.id, username))) return NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 })
  const b = (await req.json().catch(() => ({}))) as {
    action?: string; url?: string; mode?: string; pack?: string; quarter?: string; files?: { name: string; size: number }[]; pick?: string[]; autoNew?: boolean; items?: { path: string; name: string; mime: string; size: number }[]; name?: string; text?: string; ids?: string[]; enabled?: boolean
  }

  if (b.action === "bulk") {   // bật/tắt nhiều nguồn cùng lúc (nhóm mail/thread có hàng chục nguồn)
    const ids = (b.ids ?? []).filter(i => typeof i === "string").slice(0, 500)
    if (!ids.length || typeof b.enabled !== "boolean") return NextResponse.json({ error: "Cần ids và enabled" }, { status: 400 })
    const { error } = await supabaseAdmin.from("argon_sources").update({ enabled: b.enabled }).eq("project_id", params.id).in("id", ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: ids.length })
  }

  if (b.action === "prepare") {
    await ensureArgonBucket()
    const out: { name: string; path: string; token: string }[] = []
    for (const f of (b.files ?? []).slice(0, 20)) {
      if (f.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `"${f.name}" quá lớn (${(f.size / 1048576).toFixed(1)}MB, tối đa ${MAX_UPLOAD_BYTES / 1048576}MB/file)` }, { status: 400 })
      const path = `${username}/${params.id}/${crypto.randomUUID()}-${safe(f.name)}`
      const { data, error } = await supabaseAdmin.storage.from(ARGON_BUCKET).createSignedUploadUrl(path)
      if (error || !data) return NextResponse.json({ error: `Không tạo được đường tải lên: ${error?.message}` }, { status: 500 })
      out.push({ name: f.name, path, token: data.token })
    }
    return NextResponse.json({ bucket: ARGON_BUCKET, uploads: out })
  }

  if (b.action === "register") {
    const created: Omit<ArgonSource, "extracted_text">[] = [], errors: string[] = []
    for (const it of (b.items ?? []).slice(0, 20)) {
      try {
        if (!it.path.startsWith(`${username}/${params.id}/`)) throw new Error("đường dẫn không hợp lệ")
        const { data: blob, error } = await supabaseAdmin.storage.from(ARGON_BUCKET).download(it.path)
        if (error || !blob) throw new Error(`không đọc được file đã tải (${error?.message})`)
        const buf = Buffer.from(await blob.arrayBuffer())
        const ex = await extractFile(buf, it.name, it.mime)
        const { data: src, error: e2 } = await supabaseAdmin.from("argon_sources").insert({
          project_id: params.id, kind: "file", name: it.name, mime: ex.mime, size_bytes: buf.length, storage_path: it.path,
          extracted_text: ex.text, send_binary: ex.sendBinary, content_hash: ex.hash, tokens: 0,
        }).select("*").single()
        if (e2 || !src) throw new Error(e2?.message ?? "lưu nguồn lỗi")
        const tokens = await countTokens(await sourceParts(src as ArgonSource, { left: Number.MAX_SAFE_INTEGER }, []))
        await supabaseAdmin.from("argon_sources").update({ tokens }).eq("id", src.id)
        await supabaseAdmin.from("argon_source_versions").insert({ source_id: src.id, version: 1, extracted_text: ex.text, storage_path: it.path, note: "Tải lên", author: username })
        created.push(strip({ ...(src as ArgonSource), tokens }))
      } catch (e) {
        errors.push(`${it.name}: ${(e as Error).message}`)
      }
    }
    await supabaseAdmin.from("argon_projects").update({ updated_at: new Date().toISOString() }).eq("id", params.id)
    return NextResponse.json({ sources: created, errors })
  }

  if (b.action === "note") {
    const name = String(b.name ?? "").trim().slice(0, 160) || "Ghi chú"
    const text = String(b.text ?? "")
    if (!text.trim()) return NextResponse.json({ error: "Ghi chú trống" }, { status: 400 })
    const { data: src, error } = await supabaseAdmin.from("argon_sources").insert({ project_id: params.id, kind: "note", name, mime: "text/markdown", extracted_text: text, size_bytes: Buffer.byteLength(text) }).select("*").single()
    if (error || !src) return NextResponse.json({ error: error?.message ?? "lưu lỗi" }, { status: 500 })
    const tokens = await countTokens(await sourceParts(src as ArgonSource, { left: 0 }, []))
    await supabaseAdmin.from("argon_sources").update({ tokens }).eq("id", src.id)
    await supabaseAdmin.from("argon_source_versions").insert({ source_id: src.id, version: 1, extracted_text: text, note: "Tạo ghi chú", author: username })
    return NextResponse.json({ sources: [strip({ ...(src as ArgonSource), tokens })], errors: [] })
  }

  if (b.action === "lark") {
    try {
      if (youtubeId(String(b.url ?? ""))) {
        const v = await addYoutubeSource(params.id, String(b.url))
        await supabaseAdmin.from("argon_projects").update({ updated_at: new Date().toISOString() }).eq("id", params.id)
        return NextResponse.json({ sources: v ? [strip(v)] : [], errors: [], skipped: v ? [] : ["Video này đã có trong dự án"] })
      }
      const r = await addLarkLink(params.id, String(b.url ?? ""), b.mode === "live" ? "live" : "snapshot", { pick: Array.isArray(b.pick) ? b.pick.map(String) : undefined, autoNew: !!b.autoNew })
      await supabaseAdmin.from("argon_projects").update({ updated_at: new Date().toISOString() }).eq("id", params.id)
      return NextResponse.json({ sources: r.sources.map(strip), errors: r.errors, skipped: r.skipped, folder: r.folder })
    } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
  }

  if (b.action === "sync") {
    const { data } = await supabaseAdmin.from("argon_sources").select("*").eq("project_id", params.id).or("kind.eq.lark,external_id.like.datapack:%")
    const results = await syncMany((data ?? []) as ArgonSource[], req.nextUrl.origin)
    const folders = await syncFolders(params.id)
    for (const s of folders.added) results.push({ id: s.id, name: s.name, status: "changed", note: "file mới trong thư mục" })
    for (const e of folders.errors) results.push({ id: "", name: "thư mục", status: "error", note: e })
    const { data: fresh } = await supabaseAdmin.from("argon_sources")
      .select("id,project_id,kind,name,mime,size_bytes,send_binary,tokens,external_url,sync_mode,synced_at,enabled,pinned,version,meta,created_at,updated_at").eq("project_id", params.id).or("kind.eq.lark,external_id.like.datapack:%")
    return NextResponse.json({ results, sources: fresh ?? [] })
  }

  if (b.action === "data") {
    try {
      const s = await addDataPack(params.id, String(b.pack ?? ""), String(b.quarter ?? ""), b.mode === "live" ? "live" : "snapshot", req.nextUrl.origin)
      if (!s) return NextResponse.json({ sources: [], errors: [], skipped: ["Gói này (cùng quý) đã có trong dự án"] })
      await supabaseAdmin.from("argon_projects").update({ updated_at: new Date().toISOString() }).eq("id", params.id)
      return NextResponse.json({ sources: [strip(s)], errors: [], skipped: [] })
    } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }
  }

  return NextResponse.json({ error: "action phải là prepare | register | note | lark | data | sync | bulk" }, { status: 400 })
}
