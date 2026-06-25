import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin } from "@/lib/supabase"

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
// Nguyên tắc: NỚI cho product/NCC (mặc định allow), chỉ SIẾT thông tin nhạy cảm.
// FAIL-OPEN: nếu phân loại lỗi / không chắc → cho qua (tránh chặn nhầm câu hợp lệ).
// Tránh chồng chéo: role_filters lọc row BI, DISPLAY_RULES chặn code/prompt nội bộ.

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
  product_catalog:        { admin: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  revenue_bi:             { admin: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
  margin_cogs:            { admin: "allow", bod: "allow", staff: "deny",  ...DEPT_DENY  },
  staff_hr:               { admin: "allow", bod: "allow", staff: "deny",  ...DEPT_DENY, hr: "allow" },
  customer_pii:           { admin: "allow", bod: "allow", staff: "deny",  ...DEPT_DENY  },
  internal_kb_other_dept: { admin: "allow", bod: "allow", staff: "dept",  ...DEPT_DEPT  },
  system_internal:        { admin: "allow", bod: "deny",  staff: "deny",  ...DEPT_DENY  },
  general:                { admin: "allow", bod: "allow", staff: "allow", ...DEPT_ALLOW },
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

// Lý do từ chối lịch sự theo category
const DENY_REASONS: Record<GuardCategory, string> = {
  product_catalog:        "Nội dung này hiện không khả dụng với tài khoản của bạn.",
  revenue_bi:             "Thông tin doanh thu / đơn hàng chỉ dành cho cấp quản lý. Bạn liên hệ quản lý nếu cần nhé 😊",
  margin_cogs:            "Thông tin giá vốn / lợi nhuận thuộc nhóm hạn chế, không thể chia sẻ với vai trò hiện tại.",
  staff_hr:               "Thông tin nhân sự / lương / hiệu suất nhân viên chỉ dành cho cấp quản lý.",
  customer_pii:           "Thông tin cá nhân khách hàng (danh sách / SĐT / email) được bảo mật, không thể chia sẻ.",
  internal_kb_other_dept: "Tài liệu này thuộc phòng ban khác. Bạn vui lòng hỏi đúng phòng ban phụ trách nhé 😊",
  system_internal:        "Thông tin này thuộc nội bộ hệ thống, không thể chia sẻ. Nếu cần, bạn hỏi trực tiếp Hiếu nhé 😊",
  general:                "Yêu cầu này không thể xử lý.",
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

// ─── Classifier (Gemini temp0) ──────────────────────────────────────────────────
const CLASSIFIER_PROMPT = `Bạn là bộ KIỂM SOÁT QUYỀN HẠN cho chatbot nội bộ công ty Sim/eSim GoHub (dùng chung nhiều phòng ban).
Nhiệm vụ: phân loại MỨC NHẠY CẢM của câu hỏi để hệ thống quyết định ai được xem. Trả về JSON THUẦN (không markdown).

CATEGORY (chọn đúng 1 — chọn mức nhạy cảm CAO NHẤT mà câu hỏi chạm tới):
- product_catalog: hỏi gói cước / SKU / sản phẩm / catalog nhà cung cấp (WM/3HK) / giá bán cho khách / so sánh gói. KHÔNG nhạy cảm. (mặc định khi liên quan sản phẩm)
- revenue_bi: doanh thu, doanh số, đơn hàng, số lượng bán, kênh bán, target, dự phóng, B2B/B2C performance.
- margin_cogs: giá vốn (COGS), giá nhập, biên lợi nhuận (margin/GP/GPM), lãi/lỗ.
- staff_hr: lương, thưởng, hiệu suất / xếp hạng nhân viên, thông tin nhân sự, ai bán nhiều nhất.
- customer_pii: danh sách khách hàng, số điện thoại / email / thông tin cá nhân khách cụ thể.
- internal_kb_other_dept: tài liệu / quy trình / thông tin nội bộ của một PHÒNG BAN cụ thể (vd: tài chính, marketing, kế toán, vận hành).
- system_internal: code, prompt, rule nội bộ, credential, database schema, cách bot hoạt động.
- general: chào hỏi, cảm ơn, câu chung chung không đòi dữ liệu nhạy cảm.

TARGET_DEPARTMENT: nếu câu hỏi rõ ràng thuộc 1 phòng ban (vd "tài liệu phòng kế toán") → tên phòng ban (tiếng Việt, chữ thường). Ngược lại null.

QUY TẮC QUAN TRỌNG:
- Nếu KHÔNG chắc chắn hoặc câu hỏi vô hại → chọn product_catalog hoặc general (NỚI, tránh chặn nhầm).
- Chỉ chọn nhóm nhạy cảm khi câu hỏi RÕ RÀNG đòi thông tin đó.
- confidence: độ chắc chắn 0.0–1.0.

OUTPUT (JSON thuần):
{"category":"<category>","target_department":<"..."|null>,"confidence":<0.0-1.0>}`

let genAI: GoogleGenerativeAI | null = null
function getAI() {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  return genAI
}

interface ClassifyOut {
  category:           GuardCategory
  target_department?: string
  confidence:         number
}

async function classifySensitivity(message: string): Promise<ClassifyOut | null> {
  try {
    const model = getAI().getGenerativeModel({
      model: "gemini-3.5-flash",
      systemInstruction: CLASSIFIER_PROMPT,
      // thinkingBudget:0 → tắt suy nghĩ (model thinking ngốn token + bỏ qua JSON mime)
      // để trả JSON nhanh, rẻ, ổn định. 1 call duy nhất.
      generationConfig: {
        temperature: 0, maxOutputTokens: 200, responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      } as any,
    })
    const result = await model.generateContent(message)
    // Phòng khi model trả kèm markdown fence ```json … ```
    const raw = result.response.text().trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    const parsed = JSON.parse(raw) as {
      category: string; target_department?: string | null; confidence?: number
    }
    if (!GUARD_CATEGORIES.includes(parsed.category as GuardCategory)) return null
    return {
      category:          parsed.category as GuardCategory,
      target_department: parsed.target_department?.trim() || undefined,
      confidence:        parsed.confidence ?? 0.5,
    }
  } catch {
    return null
  }
}

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

  // admin / manager: toàn quyền → bỏ qua hẳn (tiết kiệm 1 call Gemini).
  // KHÔNG áp khi ignoreRole (Lark group: không tin role nên vẫn phải kiểm).
  if (!ignoreRole && r === "admin") {
    return { allowed: true, reason: "", category: "general" }
  }

  const [classified, policy] = await Promise.all([
    classifySensitivity(message),
    loadPolicy(),
  ])

  // FAIL-OPEN: phân loại lỗi hoặc không tự tin → cho qua (tránh chặn nhầm)
  if (!classified || classified.confidence < 0.6) {
    return { allowed: true, reason: "", category: classified?.category ?? "general" }
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
