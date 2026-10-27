// Chạy song song Gấu Pro ↔ Gấu Prime (ARGON-X mục 15.5, Đợt 4): công cụ Gấu Pro nào đã có tương đương ở Gấu Prime, và tiêu chí gỡ Gấu Pro. Thuần, không I/O.
export type Parity = "covered" | "approval" | "partial" | "not_yet" | "n/a"
export interface ParityInfo { status: Parity; prime: string; note?: string }

// Bảng đối chiếu theo ĐÚNG tên công cụ trong nhật ký gp_runs.steps[].tool. Công cụ chưa có trong bảng → "not_yet" (an toàn: coi là chưa có tương đương).
const MAP: Record<string, ParityInfo> = {
  executeSQL: { status: "covered", prime: "sql" },
  querySupabase: { status: "partial", prime: "layDuLieuHeThong / sql", note: "bảng Supabase (sản phẩm/KB) đọc qua sql của gohub_dw là chưa đủ" },
  queryProduct: { status: "partial", prime: "layDuLieuHeThong / sql" },
  queryGA4: { status: "not_yet", prime: "—", note: "GA4 chưa có ở Gấu Prime" },
  queryGSC: { status: "not_yet", prime: "—", note: "Search Console chưa có ở Gấu Prime" },
  webSearch: { status: "covered", prime: "timTrenWeb" },
  browseWeb: { status: "partial", prime: "docTrang", note: "chỉ đọc; không click/gõ/phân trang" },
  browsePortal: { status: "covered", prime: "docPortal" },
  queryLarkBase: { status: "covered", prime: "docLarkBase" },
  larkDocs: { status: "covered", prime: "docLark (đọc) + deXuatThaoTac (ghi qua duyệt)" },
  googleWorkspace: { status: "approval", prime: "deXuatThaoTac (ghi); đọc chưa có", note: "đọc Google Drive/Docs chưa chuyển" },
  sendLarkMessage: { status: "approval", prime: "deXuatThaoTac" },
  createLarkTask: { status: "approval", prime: "deXuatThaoTac" },
  updateLarkTask: { status: "approval", prime: "deXuatThaoTac" },
  listLarkTasks: { status: "not_yet", prime: "—", note: "đọc task Lark chưa có" },
  listLarkTasklists: { status: "not_yet", prime: "—" },
  getLarkTask: { status: "not_yet", prime: "—" },
  scheduleTask: { status: "approval", prime: "deXuatThaoTac" },
  devTicket: { status: "approval", prime: "deXuatThaoTac" },
  generateImage: { status: "covered", prime: "taoAnh" },
  generateVideo: { status: "not_yet", prime: "—", note: "tạo video chưa chuyển" },
  checkVideoStatus: { status: "not_yet", prime: "—" },
  buildReport: { status: "covered", prime: "report HTML của Argon" },
  verifyReportNumbers: { status: "partial", prime: "bước [#N] chỉ nguồn số liệu" },
  readKnowledgeBase: { status: "covered", prime: "Kho + timTrongNguon" },
  searchKnowledgeBase: { status: "covered", prime: "timTrongNguon" },
  traCuuKho: { status: "covered", prime: "timTrongNguon / docNguon" },
  writeKnowledgeBase: { status: "approval", prime: "deXuatGhiNho", note: "Argon chỉ đề xuất, anh duyệt" },
  assistantMemory: { status: "partial", prime: "deXuatGhiNho", note: "trí nhớ: Argon chỉ đề xuất; chưa hợp nhất panel Trí nhớ" },
  searchPastConversations: { status: "not_yet", prime: "—" },
  learnSkill: { status: "covered", prime: "deXuatKyNang" },
  getTrendSnapshots: { status: "not_yet", prime: "—" },
  readMyBrowser: { status: "not_yet", prime: "—", note: "Bridge — chưa chuyển" },
  controlMyBrowser: { status: "not_yet", prime: "—", note: "Bridge — chưa chuyển" },
  localFiles: { status: "not_yet", prime: "—", note: "cần Bridge" },
  deepResearch: { status: "not_yet", prime: "—" },
  compareVendorQuotes: { status: "partial", prime: "sql + Kho" },
  trackSKUWinRate: { status: "partial", prime: "sql" },
  b2bCustomerCm1: { status: "partial", prime: "sql / layDuLieuHeThong" },
  managePortalCredentials: { status: "n/a", prime: "—", note: "quản trị tài khoản portal giữ ở Gấu Pro" },
  reviewPendingLearning: { status: "n/a", prime: "—" }, approveLearning: { status: "n/a", prime: "—" }, rejectLearning: { status: "n/a", prime: "—" },
}

export const parityOf = (tool: string): ParityInfo => MAP[tool] ?? { status: "not_yet", prime: "—", note: "chưa có trong bảng đối chiếu" }
export const PARITY_LABEL: Record<Parity, string> = { covered: "Đã có", approval: "Qua thẻ duyệt", partial: "Có một phần", not_yet: "Chưa có", "n/a": "Không chuyển" }

export interface ToolUse { tool: string; count: number }
/** Đếm công cụ trong nhật ký gp_runs.steps (mỗi phần tử có `tool`). Thuần. */
export function countTools(stepsList: unknown[]): ToolUse[] {
  const n = new Map<string, number>()
  for (const steps of stepsList) {
    if (!Array.isArray(steps)) continue
    for (const s of steps) {
      const t = (s as { tool?: unknown })?.tool
      if (typeof t === "string" && t) n.set(t, (n.get(t) ?? 0) + 1)
    }
  }
  return [...n.entries()].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool))
}

export const median = (xs: number[]): number | null => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2) }
export const upRate = (up: number, down: number): number | null => (up + down > 0 ? Math.round((up / (up + down)) * 100) : null)

export interface RemovalInput { primeRuns: number; daysWithPrimeRuns: number; used: ToolUse[]; primeUp: number; primeDown: number; proUp: number; proDown: number }
export interface Criterion { id: string; label: string; ok: boolean | null; detail: string }
/** Tiêu chí gỡ Gấu Pro (PDF mục 15.5). `ok: null` = chưa đủ dữ liệu/cần anh quyết (không tự tính được). */
export function removalCriteria(i: RemovalInput, minUses = 3): Criterion[] {
  const gaps = i.used.filter(u => u.count >= minUses && ["not_yet", "partial"].includes(parityOf(u.tool).status))
  const pr = upRate(i.primeUp, i.primeDown), po = upRate(i.proUp, i.proDown)
  return [
    { id: "parity", label: `Mọi công cụ đang dùng (≥ ${minUses} lần) có bản tương đương`, ok: gaps.length === 0, detail: gaps.length ? `Còn thiếu/một phần: ${gaps.slice(0, 8).map(g => `${g.tool} (${g.count})`).join(", ")}${gaps.length > 8 ? "…" : ""}` : "Không còn khoảng trống trong số công cụ đã dùng" },
    { id: "days", label: "Chạy song song ít nhất 7 ngày có dùng Gấu Prime", ok: i.daysWithPrimeRuns >= 7, detail: `${i.daysWithPrimeRuns} ngày có lượt Gấu Prime, ${i.primeRuns} lượt` },
    { id: "quality", label: "👍 của Gấu Prime không thấp hơn Gấu Pro", ok: pr === null || po === null ? null : pr >= po, detail: `Gấu Prime ${pr === null ? "chưa có đánh giá" : `${pr}% (${i.primeUp}👍/${i.primeDown}👎)`} · Gấu Pro ${po === null ? "chưa có đánh giá" : `${po}% (${i.proUp}👍/${i.proDown}👎)`}` },
    { id: "perm", label: "Người dùng Gấu Pro đã chuyển quyền sang Gấu Prime", ok: null, detail: "Anh tự xác nhận (Creator Settings)" },
    { id: "owner", label: "Anh duyệt gỡ", ok: null, detail: "Quyết định của anh" },
  ]
}
