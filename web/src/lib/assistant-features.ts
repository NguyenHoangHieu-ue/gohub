import { supabaseAdmin } from "@/lib/supabase"

// Bảng phân quyền tính năng trợ lý theo vai trò (plan be-gau-upgrade.md U3). Creator luôn có mọi tính năng; tính năng "creator"
// khoá cứng (không bật được cho vai trò khác). Còn lại Hiếu bật/tắt từng ô ở Creator Settings, lưu app_settings.assistant_features
// dạng { [featureId]: role[] } — tính năng chưa có trong bản lưu thì dùng mặc định bên dưới.

export type FeatureGroup = "everyone" | "by_role" | "creator"

export interface AssistantFeature {
  id: string
  label: string
  description: string
  group: FeatureGroup
  tools: string[]          // tool Bé Gấu được khai báo khi tính năng bật
  soon?: boolean           // chưa làm xong — hiện trong bảng để xem trước, chưa có tác dụng
}

export const FEATURE_ROLES = ["admin", "bod", "staff", "b2b", "b2c", "saleb2c", "ops-&-cs", "hr", "product"] as const

const EVERYONE = [...FEATURE_ROLES] as string[]
const ADMIN_ONLY = ["admin"]

export const ASSISTANT_FEATURES: AssistantFeature[] = [
  { id: "web_search", label: "Tìm trên web", description: "Tra tin tức, tài liệu bên ngoài, có trích nguồn", group: "everyone", tools: ["webSearch"] },
  { id: "vendor_quotes", label: "So giá vendor", description: "So báo giá nhà cung cấp với giá vốn hiện tại (che giá vốn theo quyền)", group: "everyone", tools: ["compareVendorQuotes"] },
  { id: "sku_win_rate", label: "Hiệu quả SKU mới", description: "SKU mới đạt/chưa đạt 5 đơn trong 14 ngày", group: "everyone", tools: ["trackSKUWinRate"] },
  { id: "trends", label: "Xu hướng thị trường", description: "Dữ liệu xu hướng du lịch/eSIM/TikTok lưu hằng ngày", group: "everyone", tools: ["getTrendSnapshots"] },
  { id: "lark_base", label: "Đọc Lark Base", description: "Đọc bảng Lark Base được chia sẻ cho bot", group: "everyone", tools: ["queryLarkBase"] },
  { id: "image", label: "Tạo ảnh", description: "Tạo ảnh minh hoạ, banner, thumbnail", group: "everyone", tools: ["generateImage"] },
  { id: "plan", label: "Kế hoạch từng bước", description: "Việc nhiều bước hiện danh sách bước đang làm (nút Dừng luôn có)", group: "everyone", tools: ["updatePlan"] },
  { id: "memory", label: "Trí nhớ + tìm hội thoại cũ", description: "Nhớ điều người dùng dặn, tìm lại hội thoại trước (mặc định tắt — bật từng vai trò khi đã duyệt)", group: "everyone", tools: ["assistantMemory", "searchPastConversations"] },
  { id: "background", label: "Chạy nền việc dài", description: "Giao việc dài chạy nền, không cần giữ trang; xong nhắn Lark + lưu vào Lịch sử", group: "everyone", tools: [] },
  { id: "tts", label: "Đọc câu trả lời", description: "Đọc to câu trả lời bằng giọng nói", group: "everyone", tools: [], soon: true },
  { id: "transcribe", label: "Ghi âm → biên bản", description: "Ghi âm cuộc họp, ra biên bản", group: "everyone", tools: [], soon: true },

  { id: "browse_web", label: "Mở trang web", description: "Đọc nguyên trang web cụ thể (trang nhiều JS, nhiều trang)", group: "by_role", tools: ["browseWeb"] },
  { id: "video", label: "Tạo video", description: "Tạo video ngắn, kiểm tra trạng thái", group: "by_role", tools: ["generateVideo", "checkVideoStatus"] },
  { id: "live", label: "Trò chuyện trực tiếp", description: "Nói chuyện bằng giọng nói, chia sẻ màn hình (chỉ tra cứu)", group: "by_role", tools: [] },
  { id: "schedule", label: "Việc theo lịch", description: "Hẹn giờ trợ lý tự làm và báo kết quả", group: "by_role", tools: [], soon: true },
  { id: "deep_research", label: "Nghiên cứu sâu", description: "Nghiên cứu dài nhiều nguồn, ra báo cáo", group: "by_role", tools: [], soon: true },
  { id: "translate", label: "Dịch trực tiếp", description: "Dịch hội thoại trực tiếp (CS)", group: "by_role", tools: [], soon: true },

  { id: "kb_write", label: "Ghi kiến thức chung", description: "Ghi KB, duyệt bài học Bé Gấu tự học", group: "creator", tools: ["writeKnowledgeBase", "reviewPendingLearning", "approveLearning", "rejectLearning"] },
  { id: "portal", label: "Portal nhà cung cấp", description: "Đăng nhập, đọc portal vendor", group: "creator", tools: ["browsePortal", "managePortalCredentials"] },
  { id: "lark_send", label: "Gửi Lark cho người khác", description: "Gửi tin vào group/người bất kỳ", group: "creator", tools: ["sendLarkMessage"] },
  { id: "lark_tasks", label: "Task Lark của Hiếu", description: "Xem/tạo/sửa task trong tài khoản Lark của Hiếu", group: "creator", tools: ["listLarkTasks", "listLarkTasklists", "getLarkTask", "createLarkTask", "updateLarkTask"] },
  { id: "image_paid", label: "Ảnh Stability (trả phí)", description: "Tạo ảnh bằng dịch vụ trả phí cũ", group: "creator", tools: ["generateImageStability"] },
  { id: "bridge", label: "Điều khiển trình duyệt", description: "Đọc/thao tác Chrome cá nhân qua Bridge", group: "creator", tools: [], soon: true },
  { id: "local_files", label: "File trên máy", description: "Đọc/sửa file trên máy creator", group: "creator", tools: [], soon: true },
]

export type FeatureMatrix = Record<string, string[]>

// Trí nhớ cá nhân: plan U3 — mặc định tắt cho tới khi Hiếu duyệt từng nhóm.
const DEFAULT_OFF = new Set(["memory"])

export function defaultMatrix(): FeatureMatrix {
  return Object.fromEntries(ASSISTANT_FEATURES.map(f => [f.id,
    DEFAULT_OFF.has(f.id) ? [] : f.group === "everyone" ? EVERYONE : f.group === "by_role" ? ADMIN_ONLY : []]))
}

/** Gộp bản lưu với mặc định: chỉ nhận vai trò hợp lệ, tính năng "creator" luôn rỗng. */
export function normalizeMatrix(saved: unknown): FeatureMatrix {
  const out = defaultMatrix()
  if (!saved || typeof saved !== "object") return out
  for (const f of ASSISTANT_FEATURES) {
    const v = (saved as Record<string, unknown>)[f.id]
    if (f.group === "creator" || !Array.isArray(v)) continue
    out[f.id] = v.filter((r): r is string => typeof r === "string" && (FEATURE_ROLES as readonly string[]).includes(r))
  }
  return out
}

const KEY = "assistant_features"
let cache: { m: FeatureMatrix; at: number } | null = null

export async function loadFeatureMatrix(): Promise<FeatureMatrix> {
  if (cache && Date.now() - cache.at < 60_000) return cache.m
  let m = defaultMatrix()
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
    if (data?.value) m = normalizeMatrix(JSON.parse(data.value))
  } catch { /* dùng mặc định */ }
  cache = { m, at: Date.now() }
  return m
}

export async function saveFeatureMatrix(raw: unknown): Promise<FeatureMatrix> {
  const m = normalizeMatrix(raw)
  const { error } = await supabaseAdmin.from("app_settings").upsert({ key: KEY, value: JSON.stringify(m), category: "system" }, { onConflict: "key" })
  if (error) throw new Error(error.message)
  cache = { m, at: Date.now() }
  return m
}

export function featureEnabled(m: FeatureMatrix, featureId: string, role: string | undefined): boolean {
  const f = ASSISTANT_FEATURES.find(x => x.id === featureId)
  if (!f || f.soon) return false
  const r = (role || "staff").toLowerCase()
  if (r === "creator") return true
  return f.group !== "creator" && (m[featureId] ?? []).includes(r)
}

/** Tên tool trợ lý được dùng theo vai trò (chỉ tool thuộc tính năng đã bật + đã làm xong). */
export function enabledFeatureTools(m: FeatureMatrix, role: string | undefined): Set<string> {
  const out = new Set<string>()
  for (const f of ASSISTANT_FEATURES) if (featureEnabled(m, f.id, role)) f.tools.forEach(t => out.add(t))
  return out
}
