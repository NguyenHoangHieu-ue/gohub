import { Type, type FunctionDeclaration } from "@google/genai"
import type { ToolLogEntry } from "./tools"
import { FACT_TYPES, addManualFact, factLine, isoDate, listFacts, updateFact, vnToday, type FactStatus, type FactType } from "./facts"
import { cleanFolderPath, ensureFolderPath, ensureKhoProject, moveSources, userProjectIds } from "./kho"
const db = async () => (await import("@/lib/supabase")).supabaseAdmin   // nạp muộn: phần thuần test được không cần env Supabase

// Công cụ riêng của sứ mệnh "Thủ thư Kho": xếp thư mục, đổi tên/nhãn/ghim, lưu ghi chú. KHÔNG xoá gì, không đụng nội dung nguồn.
// Đọc/tìm nguồn dùng lietKeNguon / timTrongNguon / docNguon có sẵn (ở sứ mệnh Thủ thư, phạm vi = mọi nguồn của người dùng).
export const KHO_TOOL_NAMES = ["taoThuMuc", "chuyenNguon", "capNhatNguon", "luuGhiChu", "traSuViec", "ghiSuViec", "capNhatSuViec", "traMail", "traThucThe", "deXuatGhiNho"] as const

export const KHO_TOOLS: FunctionDeclaration[] = [
  { name: "taoThuMuc", description: "Tạo thư mục trong Kho (tạo cả các cấp còn thiếu, tối đa 3 cấp). Vd \"Vendor/3HK/Bảng giá\". Đã có thì dùng lại.", parameters: { type: Type.OBJECT, properties: { duongDan: { type: Type.STRING, description: "Đường dẫn thư mục, cấp cách nhau bằng /" } }, required: ["duongDan"] } },
  { name: "chuyenNguon", description: "Chuyển một hoặc nhiều nguồn vào thư mục (tự tạo thư mục nếu chưa có). thuMuc rỗng = đưa về Chưa phân loại. Tối đa 100 nguồn mỗi lần. Id lấy từ lietKeNguon / timTrongNguon / mục lục Kho.", parameters: { type: Type.OBJECT, properties: { idNguon: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Danh sách id nguồn" }, thuMuc: { type: Type.STRING, description: "Đường dẫn thư mục đích, \"\" = Chưa phân loại" } }, required: ["idNguon", "thuMuc"] } },
  { name: "capNhatNguon", description: "Đổi tên, gắn nhãn (thay toàn bộ nhãn cũ) hoặc ghim/bỏ ghim một nguồn. Nguồn ghim luôn nằm sẵn trong ngữ cảnh mọi lượt nên chỉ ghim tài liệu cốt lõi.", parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, ten: { type: Type.STRING, description: "Tên mới (tuỳ chọn)" }, nhan: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Danh sách nhãn mới, tối đa 8 (tuỳ chọn)" }, ghim: { type: Type.BOOLEAN, description: "true = ghim, false = bỏ ghim (tuỳ chọn)" } }, required: ["id"] } },
  { name: "luuGhiChu", description: "Lưu một ghi chú/bản tổng hợp thành nguồn mới trong Kho (vd bảng so sánh báo giá, hồ sơ vendor, biên bản tóm tắt). Dùng khi kết quả đáng giữ lại cho lần sau.", parameters: { type: Type.OBJECT, properties: { ten: { type: Type.STRING }, noiDung: { type: Type.STRING, description: "Nội dung markdown" }, thuMuc: { type: Type.STRING, description: "Thư mục lưu (tuỳ chọn, mặc định Chưa phân loại)" } }, required: ["ten", "noiDung"] } },
]

const FACT_TYPE_LIST = Object.keys(FACT_TYPES)
KHO_TOOLS.push(
  { name: "traSuViec", description: "Tra SỔ SỰ VIỆC có hạn (khuyến mãi, ngừng bán, sản phẩm mới, đổi giá, đổi mạng, chính sách, hạn chót) do Argon tự ghi từ tài liệu/thread/mail. NHANH và rẻ hơn đọc lại từng tài liệu: dùng đầu tiên khi anh hỏi về hạn, khuyến mãi, sản phẩm mới/ngừng bán, thay đổi của vendor. Mỗi dòng có id, ngày hiệu lực/hết hạn và nguồn.", parameters: { type: Type.OBJECT, properties: { loai: { type: Type.STRING, description: `Lọc theo loại: ${FACT_TYPE_LIST.join(" | ")} (tuỳ chọn)` }, vendor: { type: Type.STRING, description: "Lọc theo vendor/đối tác (chứa chuỗi này, tuỳ chọn)" }, tuKhoa: { type: Type.STRING, description: "Từ khoá trong nội dung/đối tượng (tuỳ chọn)" }, tatCa: { type: Type.BOOLEAN, description: "true = gồm cả sự việc đã hết hạn/bị thay thế/bỏ (mặc định chỉ đang hiệu lực)" } } } },
  { name: "ghiSuViec", description: "Ghi MỘT sự việc có hạn vào sổ khi anh nói cho em biết (vd vendor báo miệng, tin nhắn chưa có trong Kho) hoặc khi em phát hiện qua so sánh nhiều tài liệu. Ngày dạng YYYY-MM-DD, chỉ điền khi chắc.", parameters: { type: Type.OBJECT, properties: { loai: { type: Type.STRING, description: FACT_TYPE_LIST.join(" | ") }, vendor: { type: Type.STRING }, doiTuong: { type: Type.STRING, description: "Sản phẩm/nước/mạng ngắn gọn" }, noiDung: { type: Type.STRING, description: "1 câu tiếng Việt đủ số liệu" }, hieuLucTu: { type: Type.STRING, description: "YYYY-MM-DD (tuỳ chọn)" }, hetHan: { type: Type.STRING, description: "YYYY-MM-DD (tuỳ chọn)" } }, required: ["loai", "noiDung"] } },
  { name: "capNhatSuViec", description: "Sửa một sự việc trong sổ theo id (từ traSuViec / mục lục): đổi nội dung, ngày, hoặc đổi trạng thái (bo = ghi sai nên bỏ, het_han, dang_hieu_luc). Dùng khi anh bảo sửa hoặc khi tài liệu mới cho thấy sự việc cũ đã đổi.", parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, trangThai: { type: Type.STRING, description: "bo | het_han | dang_hieu_luc (tuỳ chọn)" }, noiDung: { type: Type.STRING }, hieuLucTu: { type: Type.STRING, description: "YYYY-MM-DD hoặc rỗng để xoá" }, hetHan: { type: Type.STRING, description: "YYYY-MM-DD hoặc rỗng để xoá" } }, required: ["id"] } },
)

KHO_TOOLS.push(
  { name: "traMail", description: "Tra SỔ TRẠNG THÁI MAIL theo luồng thư (chỉ đọc, do Argon quét INBOX + SENT 14 ngày gần nhất mỗi đêm): luồng nào đang chờ anh trả lời, luồng nào anh đã gửi mà đối tác chưa trả lời, luồng nào đã xong. Mỗi dòng có tiêu đề, đối tác, số ngày chờ và việc cần làm tiếp. Dùng khi anh hỏi 'mail nào đang chờ tôi', 'ai chưa trả lời', 'thread X xong chưa'.", parameters: { type: Type.OBJECT, properties: { trangThai: { type: Type.STRING, description: "cho_minh | cho_doi_tac | xong | tat_ca (mặc định cho_minh)" }, tuKhoa: { type: Type.STRING, description: "Từ khoá trong tiêu đề/đối tác/tóm tắt (tuỳ chọn)" } } } },
)

KHO_TOOLS.push(
  { name: "traThucThe", description: "Tra GRAPH của Kho: một vendor / thị trường / nhóm sản phẩm / khách / người được nhắc Ở ĐÂU (tài liệu, thread, mail nào, ngày nào), liên quan tới thực thể nào, và các sự việc có hạn của nó. NHANH hơn timTrongNguon khi anh hỏi 'thông tin về 3HK nằm ở đâu', 'ai liên quan tới Thái Lan', 'vendor này có gì mới'. Chỉ đọc.", parameters: { type: Type.OBJECT, properties: { ten: { type: Type.STRING, description: "Tên hoặc bí danh thực thể, vd 3HK, Billion Connect, Thái Lan" } }, required: ["ten"] } },
)

KHO_TOOLS.push(
  { name: "deXuatGhiNho", description: "ĐỀ XUẤT một điều đáng nhớ lâu dài về anh Hiếu hoặc công việc (sở thích làm việc, quyết định đã chốt, dự án đang theo, người liên quan) vào TRÍ NHỚ chung của trợ lý. KHÔNG ghi thẳng: đề xuất hiện trong \"Việc cần duyệt\", anh duyệt mới được lưu. Chỉ đề xuất sự thật bền vững, một câu rõ ràng; đừng đề xuất số liệu hay tin có hạn (đó là việc của sổ sự việc), cũng đừng đề xuất điều chỉ đọc thấy trong mail/thread của người ngoài mà anh chưa xác nhận.", parameters: { type: Type.OBJECT, properties: { noiDung: { type: Type.STRING, description: "Một câu sự thật cần nhớ (8–500 ký tự)" }, loai: { type: Type.STRING, description: "profile | preference | project | person | decision | other" }, lyDo: { type: Type.STRING, description: "Vì sao nên nhớ / nguồn (ngắn)" } }, required: ["noiDung"] } },
)

const entry = (name: string, args: Record<string, unknown>, ok: boolean, result: string): ToolLogEntry => ({ name, args, ok, chars: result.length, result, at: new Date().toISOString() })

export async function execKhoTool(name: string, args: Record<string, unknown>, username: string): Promise<ToolLogEntry> {
  try {
    if (name === "taoThuMuc") {
      const segs = cleanFolderPath(String(args.duongDan ?? ""))
      if (!segs.length) return entry(name, args, false, "duongDan trống")
      await ensureFolderPath(username, segs.join("/"))
      return entry(name, args, true, `Thư mục sẵn sàng: ${segs.join("/")}`)
    }
    if (name === "chuyenNguon") {
      const ids = (Array.isArray(args.idNguon) ? args.idNguon : []).map(String).slice(0, 100)
      if (!ids.length) return entry(name, args, false, "idNguon trống")
      const path = cleanFolderPath(String(args.thuMuc ?? ""))
      const folderId = path.length ? await ensureFolderPath(username, path.join("/")) : null
      const r = await moveSources(username, ids, folderId)
      if (r.error) return entry(name, args, false, r.error)
      return entry(name, args, true, `Đã chuyển ${r.moved}/${ids.length} nguồn vào ${path.length ? path.join("/") : "Chưa phân loại"}${r.moved < ids.length ? " (số còn lại không thuộc Kho của anh hoặc id sai)" : ""}`)
    }
    if (name === "capNhatNguon") {
      const id = String(args.id ?? "")
      const pids = await userProjectIds(username)
      const { data: src } = pids.length ? await (await db()).from("argon_sources").select("id,name,meta").eq("id", id).in("project_id", pids).maybeSingle() : { data: null }
      if (!src) return entry(name, args, false, `Không có nguồn "${id}" trong Kho`)
      const patch: Record<string, unknown> = {}
      const done: string[] = []
      if (typeof args.ten === "string" && args.ten.trim()) { patch.name = args.ten.trim().slice(0, 160); done.push(`đổi tên → ${patch.name}`) }
      if (typeof args.ghim === "boolean") { patch.pinned = args.ghim; done.push(args.ghim ? "ghim" : "bỏ ghim") }
      if (Array.isArray(args.nhan)) {
        const tags = Array.from(new Set(args.nhan.map(t => String(t).trim().slice(0, 40)).filter(Boolean))).slice(0, 8)
        patch.meta = { ...((src.meta ?? {}) as Record<string, unknown>), tags }
        done.push(`nhãn: ${tags.join(", ") || "(xoá hết)"}`)
      }
      if (!done.length) return entry(name, args, false, "Không có gì để cập nhật (cần ten, nhan hoặc ghim)")
      const { error } = await (await db()).from("argon_sources").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)
      return error ? entry(name, args, false, error.message) : entry(name, args, true, `${src.name}: ${done.join("; ")}`)
    }
    if (name === "luuGhiChu") {
      const ten = String(args.ten ?? "").trim().slice(0, 160), text = String(args.noiDung ?? "")
      if (!ten || !text.trim()) return entry(name, args, false, "Cần ten và noiDung")
      const projectId = await ensureKhoProject(username)
      const path = cleanFolderPath(String(args.thuMuc ?? ""))
      const folderId = path.length ? await ensureFolderPath(username, path.join("/")) : null
      const { data: src, error } = await (await db()).from("argon_sources").insert({
        project_id: projectId, kind: "note", name: ten, mime: "text/markdown", extracted_text: text, size_bytes: Buffer.byteLength(text), folder_id: folderId, tokens: Math.ceil(text.length / 3), meta: { author: "argon" },
      }).select("id").single()
      if (error || !src) return entry(name, args, false, error?.message ?? "Lưu lỗi")
      await (await db()).from("argon_source_versions").insert({ source_id: src.id, version: 1, extracted_text: text, note: "Argon lưu ghi chú", author: "argon" })
      return entry(name, args, true, `Đã lưu ghi chú "${ten}" (id ${src.id}) vào ${path.length ? path.join("/") : "Chưa phân loại"}`)
    }
    if (name === "traSuViec") {
      const rows = await listFacts(username, { status: args.tatCa === true ? undefined : ["active"], limit: 800 })
      const loai = String(args.loai ?? "").trim(), vendor = String(args.vendor ?? "").trim().toLowerCase(), kw = String(args.tuKhoa ?? "").trim().toLowerCase()
      const hit = rows.filter(f => (!loai || f.type === loai) && (!vendor || f.vendor.toLowerCase().includes(vendor)) && (!kw || `${f.subject} ${f.summary} ${f.vendor}`.toLowerCase().includes(kw)))
        .sort((a, b) => (a.expires_at ?? a.effective_from ?? "9999").localeCompare(b.expires_at ?? b.effective_from ?? "9999")).slice(0, 60)
      if (!hit.length) return entry(name, args, true, `Sổ sự việc không có mục nào khớp (hôm nay ${vnToday()}). Nếu cần chắc chắn hơn thì tìm trong tài liệu bằng timTrongNguon.`)
      return entry(name, args, true, `${hit.length} sự việc (hôm nay ${vnToday()}):\n${hit.map(f => `- [${f.id}] ${factLine(f)}${f.status !== "active" ? ` {${f.status}}` : ""}${f.source_name ? ` — nguồn: ${f.source_name}` : ""}${f.change_note ? ` — ĐỔI so với tin cũ (${f.change_note})` : ""}${f.needs_review ? " — CHƯA được anh xác nhận" : ""}`).join("\n")}\nKhi trả lời PHẢI nêu ngày của tin ("tin ngày …"); hai tin mâu thuẫn thì theo tin mới hơn và nói rõ tin cũ đã bị thay.`)
    }
    if (name === "traThucThe") {
      const { getEntity, ENTITY_KINDS, entityKey } = await import("./graph")
      const d = await getEntity(username, String(args.ten ?? "")).catch(e => { throw new Error(`Graph chưa dùng được: ${(e as Error).message}`) })
      if (!d) return entry(name, args, true, `Graph chưa có thực thể "${String(args.ten ?? "")}" (Argon mới trích thực thể từ tài liệu đã tóm tắt). Thử timTrongNguon.`)
      const key = entityKey(d.entity.name)
      const facts = (await listFacts(username, { status: ["active"], limit: 800 })).filter(f => entityKey(f.vendor) === key || entityKey(f.subject).includes(key)).slice(0, 10)
      const lines = [
        `${ENTITY_KINDS[d.entity.kind]}: ${d.entity.name}${d.entity.aliases.length ? ` (còn gọi: ${d.entity.aliases.join(", ")})` : ""} — nhắc ở ${d.mentions.length} nguồn`,
        ...d.mentions.slice(0, 12).map(m => `- [${m.sourceId}] ${m.sourceName}${m.sourceDate ? ` (tin ngày ${m.sourceDate})` : ""}${m.snippet ? ` — ${m.snippet}` : ""}`),
        d.related.length ? `Liên quan: ${d.related.map(r => `${r.name} (${ENTITY_KINDS[r.kind]}${r.rels.length ? `, ${r.rels.join("/")}` : ""}${r.shared ? `, chung ${r.shared} nguồn` : ""})`).join("; ")}` : "Liên quan: chưa có",
        facts.length ? `Sự việc đang hiệu lực:\n${facts.map(f => `- [${f.id}] ${factLine(f)}`).join("\n")}` : "Sự việc đang hiệu lực: không có",
      ]
      return entry(name, args, true, lines.join("\n"))
    }
    if (name === "deXuatGhiNho") {
      const { proposeMemory } = await import("@/lib/assistant/memory-proposals")
      const r = await proposeMemory(username, { kind: args.loai, content: args.noiDung, reason: args.lyDo })
      return entry(name, args, r.ok, r.message)
    }
    if (name === "traMail") {
      const { listMailThreads, threadLine, STATUS_LABEL } = await import("./mail-status")
      const want = ({ cho_minh: "waiting_me", cho_doi_tac: "waiting_partner", xong: "done" } as Record<string, string>)[String(args.trangThai ?? "cho_minh")]
      const kw = String(args.tuKhoa ?? "").trim().toLowerCase()
      const rows = (await listMailThreads(username)).filter(r => r.status !== "ignored" && (String(args.trangThai) === "tat_ca" || r.status === want) && (!kw || `${r.subject} ${r.counterparty} ${r.summary}`.toLowerCase().includes(kw))).slice(0, 40)
      if (!rows.length) return entry(name, args, true, "Sổ mail không có luồng nào khớp (sổ chỉ gồm thư 14 ngày gần nhất trong INBOX + SENT, cập nhật mỗi đêm).")
      return entry(name, args, true, `${rows.length} luồng thư:\n${rows.map(r => `- [${STATUS_LABEL[r.status]}] ${threadLine(r)}`).join("\n")}`)
    }
    if (name === "ghiSuViec") {
      const type = (String(args.loai ?? "") in FACT_TYPES ? String(args.loai) : "khac") as FactType
      const summary = String(args.noiDung ?? "").trim().slice(0, 300)
      if (!summary) return entry(name, args, false, "noiDung trống")
      const f = await addManualFact(username, { type, vendor: String(args.vendor ?? "").trim().slice(0, 80), subject: String(args.doiTuong ?? "").trim().slice(0, 120), summary, evidence: "", effectiveFrom: isoDate(args.hieuLucTu), expiresAt: isoDate(args.hetHan) })
      return entry(name, args, true, `Đã ghi sự việc ${f.id}: ${factLine(f)}`)
    }
    if (name === "capNhatSuViec") {
      const map: Record<string, FactStatus> = { bo: "rejected", het_han: "expired", dang_hieu_luc: "active" }
      const p: Parameters<typeof updateFact>[2] = {}
      if (typeof args.trangThai === "string" && map[args.trangThai]) p.status = map[args.trangThai]
      if (typeof args.noiDung === "string" && args.noiDung.trim()) p.summary = args.noiDung.trim().slice(0, 300)
      for (const [k, key] of [["hieuLucTu", "effective_from"], ["hetHan", "expires_at"]] as const) if (k in args) { const v = isoDate(args[k]); if (args[k] && !v) return entry(name, args, false, `${k} phải dạng YYYY-MM-DD`); p[key] = v }
      if (!Object.keys(p).length) return entry(name, args, false, "Không có gì để cập nhật")
      const f = await updateFact(username, String(args.id ?? ""), p)
      return f ? entry(name, args, true, `Đã cập nhật: ${factLine(f)} {${f.status}}`) : entry(name, args, false, `Không có sự việc "${String(args.id)}"`)
    }
    return entry(name, args, false, `Công cụ không có: ${name}`)
  } catch (e) { return entry(name, args, false, `Lỗi Kho: ${(e as Error).message}`) }
}
