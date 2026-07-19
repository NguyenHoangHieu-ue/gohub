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
// doanh thu, đơn hàng, kênh bán, khách hàng… CHỈ chặn 3 nhóm thật sự nhạy cảm:
//   1) system_internal — code / cách hệ thống-chatbot được BUILD / quy trình kỹ thuật / credential / schema
//      → chặn tất cả trừ admin·creator. Đây là GIỚI HẠN CHÍNH.
//   2) margin_cogs — giá vốn / lợi nhuận (COGS/GP/CM1) → chỉ admin·creator·manager·bod.
//   3) staff_hr — lương / hiệu suất nhân sự → chỉ admin·creator·manager·bod·hr.
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

const DEFAULT_POLICY: Record<GuardCategory, Record<string, Decision>> = {
  // MỞ cho mọi vai trò — sản phẩm, doanh thu/đơn/kênh, khách hàng (PII che ở prompt), tài liệu.
  product_catalog:        { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  revenue_bi:             { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  customer_pii:           { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  internal_kb_other_dept: { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  general:                { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  // SIẾT — giá vốn / lợi nhuận: chỉ cấp quản lý.
  margin_cogs:            { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "deny",  ...DEPT_DENY  },
  // SIẾT — nhân sự / lương / hiệu suất NV: chỉ cấp quản lý + HR.
  staff_hr:               { admin: "allow", creator: "allow", manager: "allow", bod: "allow", staff: "deny",  ...DEPT_DENY, hr: "allow" },
  // CHẶN CHÍNH — code / cách build hệ thống-chatbot / quy trình kỹ thuật / credential / schema: chỉ admin·creator.
  system_internal:        { admin: "allow", creator: "allow", manager: "deny",  bod: "deny",  staff: "deny",  ...DEPT_DENY  },
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
  if (role === "admin") return true   // admin luôn full quyền
  const policy = await loadPolicy()
  const decision = policy.margin_cogs?.[role] ?? "deny"
  return decision === "allow"
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

  // admin / creator: toàn quyền → bỏ qua hẳn (tiết kiệm 1 call Gemini).
  // KHÔNG áp khi ignoreRole (Lark group: không tin role nên vẫn phải kiểm).
  if (!ignoreRole && (r === "admin" || r === "creator")) {
    return { allowed: true, reason: "", category: "general" }
  }

  const policy = await loadPolicy()
  const classified = classifySensitivity(message)   // XÁC ĐỊNH — không gọi LLM

  // FAIL-OPEN: confidence thấp → cho qua (deterministic luôn ≥0.8 nên hầu như không xảy ra)
  if (classified.confidence < 0.6) {
    return { allowed: true, reason: "", category: classified.category }
  }

  const { category, target_department } = classified

  // Giới hạn phạm vi kiểm (Lark chỉ chặn system_internal) — category khác luôn cho qua.
  if (restrict && !restrict.includes(category)) {
    return { allowed: true, reason: "", category }
  }

  // ignoreRole: chặn xác định bất kể vai trò khi câu thuộc category bị kiểm.
  if (ignoreRole) {
    return { allowed: false, reason: DENY_REASONS[category], category }
  }

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
