import { supabaseAdmin } from "@/lib/supabase"
import { classifySensitivity } from "./guardian-classify"

// ─── Guardian Agent ─────────────────────────────────────────────────────────────
// Cổng kiểm soát quyền hạn (pre-flight gate) chạy TRƯỚC khi gọi agent trả lời.
// Chatbot dùng chung cả công ty → chặn câu hỏi đòi thông tin VƯỢT QUYỀN.
//
// Luồng: guardCheck(message, role)
//   1. Phân loại XÁC ĐỊNH (regex, không LLM — guardian-classify.ts) → category.
//   2. CHỈ 1 ranh giới thật, cứng trong code (không qua DB nữa — xem Gotcha dưới):
//
// Nguyên tắc (s190 — gộp Bé Gấu/Gấu Pro theo yêu cầu Hiếu):
//   1) system_internal — code / cách hệ thống-chatbot được BUILD / quy trình kỹ thuật / credential / schema
//      → CHỈ admin·creator được hỏi (role phải XÁC THỰC qua session — web/Lark-DM). Vai trò khác → từ chối
//        lịch sự, noti "bạn không được biết vấn đề này". Lark group (ignoreRole=true, không tin được role
//        ai đang gõ) → CHẶN CỨNG kể cả admin/creator, giữ nguyên hành vi cũ (kênh kém tin cậy hơn web).
//   2) Mọi category DỮ LIỆU khác (margin_cogs / staff_hr / customer_pii / revenue_bi / product…):
//      "ai cũng như nhau" — mọi role coi ngang nhau, LUÔN allow. Không có ngoại lệ, không cấu hình được.
// Giá bán B2B vs B2C KHÔNG xử lý ở đây — scope qua getChannelFromRole (chỉ ảnh hưởng GIÁ BÁN sản phẩm).
// PII khách hàng (tên/SĐT/email) đã che ở tầng prompt agent (chỉ trả mã KH) → category customer_pii để MỞ.
// FAIL-OPEN: nếu phân loại lỗi / không chắc → cho qua (tránh chặn nhầm câu hợp lệ).
//
// ⚠️ Gotcha (audit s190, sửa ngay session sau): trước đây có 1 bảng quyền cấu hình được qua
// app_settings.access_policy (route /api/config/access-policy, UI "policy grid" ở settings) cho phép
// admin tự đặt allow/deny/dept theo từng category × role. UI đó bị xoá (dead), nhưng route + cơ chế đọc
// override vẫn còn — Hiếu kiểm tra thấy DATA CŨ trong bảng đó vẫn đang deny margin_cogs/staff_hr/
// customer_pii/system_internal cho staff/b2b/b2c/saleb2c/ops-&-cs/product, ÂM THẦM mâu thuẫn với chủ
// trương "ai cũng như nhau" suốt từ lúc UI bị xoá tới giờ, không ai biết vì không còn UI nào hiển thị nó.
// Đã xoá hẳn route + cơ chế đọc DB này — mọi quyết định giờ CỨNG trong code (file này), sửa thì sửa code
// (git-tracked, review được), không còn "cấu hình ẩn" nào có thể lệch khỏi ý định đã chốt.

export type GuardCategory =
  | "product_catalog"          // gói cước / SKU / catalog NCC — ai cũng được hỏi
  | "revenue_bi"               // doanh thu / đơn hàng / kênh bán / target
  | "margin_cogs"              // giá vốn / margin / lợi nhuận
  | "staff_hr"                 // lương / hiệu suất nhân viên / nhân sự
  | "customer_pii"             // danh sách / SĐT / email khách hàng
  | "internal_kb_other_dept"   // tài liệu nội bộ của PHÒNG BAN khác
  | "system_internal"          // code / prompt / credential / schema nội bộ
  | "general"                  // chào hỏi / chung chung — luôn allow

export interface GuardResult {
  allowed:  boolean
  reason:   string         // lý do từ chối (hiển thị cho user) — "" nếu allowed
  category: GuardCategory
}

// Lý do từ chối lịch sự — CHỈ dùng cho system_internal (ranh giới cứng duy nhất còn lại).
const DENY_REASONS: Record<GuardCategory, string> = {
  product_catalog:        "Nội dung này hiện không khả dụng với vai trò của bạn. Nếu cần thêm thông tin, bạn hỏi trực tiếp Hiếu nhé 😊",
  revenue_bi:             "Thông tin doanh thu / đơn hàng thuộc nhóm hạn chế với vai trò hiện tại. Nếu cần, bạn hỏi trực tiếp Hiếu nhé 😊",
  margin_cogs:            "Thông tin giá vốn / lợi nhuận thuộc nhóm hạn chế, không thể chia sẻ. Nếu cần, bạn hỏi trực tiếp Hiếu nhé 😊",
  staff_hr:               "Thông tin nhân sự / lương / hiệu suất nhân viên thuộc nhóm hạn chế. Nếu cần, bạn hỏi trực tiếp Hiếu nhé 😊",
  customer_pii:           "Thông tin cá nhân khách hàng được bảo mật, không thể chia sẻ. Nếu cần, bạn hỏi trực tiếp Hiếu nhé 😊",
  internal_kb_other_dept: "Tài liệu này thuộc phòng ban khác. Bạn vui lòng hỏi đúng phòng ban phụ trách, hoặc hỏi trực tiếp Hiếu nhé 😊",
  system_internal:        "Thông tin này thuộc nội bộ hệ thống, không thể chia sẻ. Nếu cần, bạn hỏi trực tiếp Hiếu nhé 😊",
  general:                "Yêu cầu này không thể xử lý. Nếu cần hỗ trợ, bạn hỏi trực tiếp Hiếu nhé 😊",
}

// margin_cogs giờ mở cho mọi role (xem Gotcha ở trên) — hàm giữ lại vì 3 nơi gọi (chat/route,
// lark/events/route, answer.ts) dùng kết quả này để set isCost trong context builder.
export function canViewCogs(role: string): boolean {
  void role
  return true
}

// Đọc hướng dẫn tùy chỉnh của admin cho chatbot (TTL 60s).
let rulesCache: { text: string; ts: number } | null = null
export async function getCustomRules(): Promise<string> {
  if (rulesCache && Date.now() - rulesCache.ts < 60_000) return rulesCache.text
  try {
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "chatbot_custom_rules").maybeSingle()
    const text = data?.value ? String(data.value) : ""
    rulesCache = { text, ts: Date.now() }
    return text
  } catch { return "" }
}

// Phân loại nhạy cảm XÁC ĐỊNH (regex, không LLM) — tách ở guardian-classify.ts.
// Xem file đó để biết chi tiết các nhóm tín hiệu.

// ─── Main gate ──────────────────────────────────────────────────────────────────
export interface GuardOptions {
  // Chỉ kiểm những category này (còn lại luôn cho qua). VD Lark group: ["system_internal"].
  onlyCategories?: GuardCategory[]
  // Bỏ qua role: chặn XÁC ĐỊNH mọi vai trò khi câu thuộc category bị kiểm.
  // Dùng cho Lark group — nơi không phân biệt được role (ai cũng có thể là standard).
  ignoreRole?: boolean
}

export async function guardCheck(
  message: string,
  role: string,
  department?: string,
  opts?: GuardOptions,
): Promise<GuardResult> {
  const r = (role || "staff").toLowerCase()
  const restrict   = opts?.onlyCategories
  const ignoreRole = opts?.ignoreRole ?? false

  // Phân loại XÁC ĐỊNH (regex, không LLM) TRƯỚC — cần biết category để xử lý system_internal
  // ngay cả với admin/creator (họ cũng KHÔNG được hỏi bot về code/hệ thống).
  const { category } = classifySensitivity(message)

  // Giới hạn phạm vi kiểm (VD Lark group chỉ chặn system_internal + customer_pii) — category
  // ngoài danh sách luôn cho qua, KHÔNG áp cả chặn-cứng bên dưới.
  if (restrict && !restrict.includes(category)) {
    return { allowed: true, reason: "", category }
  }

  // ── system_internal: CHỈ admin/creator được hỏi (s190) — ranh giới cứng DUY NHẤT ──
  // ignoreRole (Lark, role không xác thực được) → luôn chặn kể cả claim là admin/creator — kênh kém tin
  // cậy hơn web (ai cũng gõ được vào group, không có session xác thực đằng sau).
  if (category === "system_internal") {
    if (!ignoreRole && (r === "admin" || r === "creator")) {
      return { allowed: true, reason: "", category }
    }
    return { allowed: false, reason: DENY_REASONS.system_internal, category }
  }

  // ignoreRole (Lark group, không tin role): category bị kiểm còn lại (VD customer_pii) → chặn xác định.
  if (ignoreRole) {
    return { allowed: false, reason: DENY_REASONS[category], category }
  }

  // ── Mọi category DỮ LIỆU khác — "ai cũng như nhau", LUÔN allow, không qua cấu hình nào ──
  void department // giữ tham số cho tương thích chữ ký gọi hàm — không còn dùng (xem Gotcha ở trên)
  return { allowed: true, reason: "", category }
}
