import { supabaseAdmin } from "@/lib/supabase"
import { classifySensitivity } from "./guardian-classify"

// ─── Guardian Agent ─────────────────────────────────────────────────────────────
// Cổng kiểm soát quyền hạn (pre-flight gate) chạy TRƯỚC khi gọi agent trả lời.
// Chatbot dùng chung cả công ty → chặn câu hỏi đòi thông tin VƯỢT QUYỀN hoặc
// KHÁC PHÒNG BAN (theo role + department + ý định câu hỏi).
//
// Luồng: guardCheck(message, role, department)
//   1. Gemini temp0 phân loại câu hỏi → category + (target_department nếu có).
//   2. Policy deterministic (app_settings.access_policy, fallback DEFAULT_POLICY)
//      quyết định allow / deny / dept theo role.
//
// Nguyên tắc (cập nhật): NỚI TỐI ĐA — hầu hết mọi người hỏi được MỌI THỨ về sản phẩm,
// doanh thu, đơn hàng, kênh bán, khách hàng… Guardian chỉ có 1 GIỚI HẠN CỨNG + phần còn lại
// để Hiếu tự phân quyền:
//   1) system_internal — code / cách hệ thống-chatbot được BUILD / quy trình kỹ thuật / credential / schema
//      → CHẶN CỨNG MỌI VAI TRÒ, KỂ CẢ admin·creator (muốn xem thì tự đọc repo, bot không tiết lộ nội bộ).
//        Đây là giới hạn DUY NHẤT không phân quyền được.
//   2) Mọi category DỮ LIỆU khác (margin_cogs / staff_hr / customer_pii / revenue_bi / product…):
//      admin·creator full quyền; các role khác theo policy (app_settings.access_policy) → Hiếu phân quyền.
// Giá bán B2B vs B2C KHÔNG xử lý ở đây — scope qua getChannelFromRole (chỉ ảnh hưởng GIÁ BÁN sản phẩm).
// PII khách hàng (tên/SĐT/email) đã che ở tầng prompt agent (chỉ trả mã KH) → category customer_pii để MỞ.
// FAIL-OPEN: nếu phân loại lỗi / không chắc → cho qua (tránh chặn nhầm câu hợp lệ).

export type GuardCategory =
  | "product_catalog"          // gói cước / SKU / catalog NCC — ai cũng được hỏi
  | "revenue_bi"               // doanh thu / đơn hàng / kênh bán / target
  | "margin_cogs"              // giá vốn / margin / lợi nhuận
  | "staff_hr"                 // lương / hiệu suất nhân viên / nhân sự
  | "customer_pii"             // danh sách / SĐT / email khách hàng
  | "internal_kb_other_dept"   // tài liệu nội bộ của PHÒNG BAN khác
  | "system_internal"          // code / prompt / credential / schema nội bộ
  | "general"                  // chào hỏi / chung chung — luôn allow

export type Decision = "allow" | "deny" | "dept"

export interface GuardResult {
  allowed:  boolean
  reason:   string         // lý do từ chối (hiển thị cho user) — "" nếu allowed
  category: GuardCategory
}

// ─── Policy mặc định (role × category) ──────────────────────────────────────────
// "dept" = chỉ cho phép khi câu hỏi thuộc đúng phòng ban của user (hoặc dept="all").
// Các role cấp phòng/nhân viên (b2b/b2c/saleb2c/ops-&-cs/hr/product) mặc định = hồ sơ giống "staff".
// Ngoại lệ: hr được phép staff_hr (đúng chức năng). admin có thể chỉnh trong Settings.
const DEPT_DENY  = { b2b: "deny"  as Decision, b2c: "deny"  as Decision, saleb2c: "deny"  as Decision, "ops-&-cs": "deny"  as Decision, hr: "deny"  as Decision, product: "deny"  as Decision }
const DEPT_ALLOW = { b2b: "allow" as Decision, b2c: "allow" as Decision, saleb2c: "allow" as Decision, "ops-&-cs": "allow" as Decision, hr: "allow" as Decision, product: "allow" as Decision }
const DEPT_DEPT  = { b2b: "dept"  as Decision, b2c: "dept"  as Decision, saleb2c: "dept"  as Decision, "ops-&-cs": "dept"  as Decision, hr: "dept"  as Decision, product: "dept"  as Decision }

// MỌI dữ liệu kinh doanh đều mở — ai vào được web đều đã được cấp phép.
// Chatbot chỉ có 1 giới hạn cứng: system_internal (code/build/credential/kỹ thuật).
const DEFAULT_POLICY: Record<GuardCategory, Record<string, Decision>> = {
  product_catalog:        { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  revenue_bi:             { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  customer_pii:           { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  internal_kb_other_dept: { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  general:                { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  margin_cogs:            { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  staff_hr:               { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  system_internal:        { admin: "deny",  creator: "deny",  manager: "deny",  bod: "deny",  staff: "deny",  ...DEPT_DENY  },
}

export const GUARD_CATEGORIES: GuardCategory[] = [
  "product_catalog", "revenue_bi", "margin_cogs", "staff_hr",
  "customer_pii", "internal_kb_other_dept", "system_internal", "general",
]

// Nhãn tiếng Việt cho UI admin
export const GUARD_CATEGORY_LABELS: Record<GuardCategory, string> = {
  product_catalog:        "Sản phẩm / Catalog NCC",
  revenue_bi:             "Doanh thu / Đơn hàng (BI)",
  margin_cogs:            "Giá vốn / Lợi nhuận",
  staff_hr:               "Nhân sự / Hiệu suất NV",
  customer_pii:           "Thông tin khách hàng (PII)",
  internal_kb_other_dept: "Tài liệu phòng ban",
  system_internal:        "Nội bộ hệ thống",
  general:                "Chung / Chào hỏi",
}

// Lý do từ chối lịch sự theo category — TẤT CẢ kết thúc bằng "hỏi Hiếu" để nhất quán
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

// ─── Policy cache (60s) ─────────────────────────────────────────────────────────
let policyCache: { data: Record<string, Record<string, Decision>>; ts: number } | null = null
const POLICY_TTL = 60_000

async function loadPolicy(): Promise<Record<string, Record<string, Decision>>> {
  if (policyCache && Date.now() - policyCache.ts < POLICY_TTL) return policyCache.data
  let policy: Record<string, Record<string, Decision>> = DEFAULT_POLICY
  try {
    const { data } = await supabaseAdmin
      .from("app_settings").select("value").eq("key", "access_policy").maybeSingle()
    if (data?.value) {
      const parsed = JSON.parse(data.value)
      // Merge: giữ DEFAULT cho category/role không cấu hình → không bao giờ thiếu entry
      policy = { ...DEFAULT_POLICY }
      for (const cat of GUARD_CATEGORIES) {
        policy[cat] = { ...DEFAULT_POLICY[cat], ...(parsed[cat] ?? {}) }
      }
    }
  } catch { policy = DEFAULT_POLICY }
  policyCache = { data: policy, ts: Date.now() }
  return policy
}

// Cho phép API POST xoá cache ngay sau khi lưu policy mới
export function invalidatePolicyCache() { policyCache = null }

// Kiểm tra role có quyền xem giá vốn (margin_cogs) không — dùng để set isCost trong context builder.
export async function canViewCogs(role: string): Promise<boolean> {
  if (role === "admin") return true
  const policy = await loadPolicy()
  const decision = policy.margin_cogs?.[role] ?? "allow"   // DEFAULT mở — fallback allow
  return decision === "allow"
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

// Chuẩn hoá tên phòng ban để so khớp (bỏ dấu, lowercase)
function normDept(s: string): string {
  return s.toLowerCase().replace(/đ/g, "d").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/\bphong\b/g, "").replace(/\s+/g, " ").trim()
}

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
  const classified = classifySensitivity(message)
  const { category, target_department } = classified

  // Giới hạn phạm vi kiểm (VD Lark group chỉ chặn system_internal + customer_pii) — category
  // ngoài danh sách luôn cho qua, KHÔNG áp cả chặn-cứng bên dưới.
  if (restrict && !restrict.includes(category)) {
    return { allowed: true, reason: "", category }
  }

  // ── CHẶN CỨNG: system_internal (code / cách build / prompt / schema / credential / kỹ thuật) ──
  // Áp dụng cho MỌI vai trò — KỂ CẢ admin·creator. Đây là GIỚI HẠN DUY NHẤT không thể phân quyền:
  // ai muốn xem code/hệ thống thì đọc trực tiếp repo, bot tuyệt đối không tiết lộ chuyện nội bộ.
  if (category === "system_internal") {
    return { allowed: false, reason: DENY_REASONS.system_internal, category }
  }

  // ignoreRole (Lark group, không tin role): các category bị kiểm còn lại (VD customer_pii) → chặn xác định.
  if (ignoreRole) {
    return { allowed: false, reason: DENY_REASONS[category], category }
  }

  // ── DỮ LIỆU (mọi category KHÔNG phải system_internal) — Hiếu tự phân quyền qua policy ──
  // admin / creator: toàn quyền với dữ liệu (cấp cao nhất).
  if (r === "admin" || r === "creator") {
    return { allowed: true, reason: "", category }
  }

  const policy = await loadPolicy()
  const decision: Decision = policy[category]?.[r] ?? DEFAULT_POLICY[category]?.[r] ?? "allow"

  if (decision === "allow") {
    return { allowed: true, reason: "", category }
  }

  if (decision === "dept") {
    const userDept = (department || "all").toLowerCase()
    // dept="all" → xem tất cả phòng ban; không xác định được phòng ban đích → cho qua (nới)
    if (userDept === "all" || !target_department) {
      return { allowed: true, reason: "", category }
    }
    const same = normDept(userDept) === normDept(target_department)
    return same
      ? { allowed: true, reason: "", category }
      : { allowed: false, reason: DENY_REASONS[category], category }
  }

  // decision === "deny"
  return { allowed: false, reason: DENY_REASONS[category], category }
}
