// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import type React from "react"

export interface AutoMetrics {
  quarter: string; year: number; start: string; end: string
  data_cutoff: string; generated_at: string
  hk3: { pct: number; hk3_rev: number; hk3_only_rev: number; bc_only_rev: number; total_rev: number; monthly: MonthStat[]; baseline: number }
  gm:  { qtd_pct: number; total_gp: number; total_rev: number; monthly: GmStat[]; baseline: number }
  begau: {
    total: number; web: number; lark: number; excluded_short: number
    by_role: Record<string, number>; monthly: Record<string, MonthCount>
  }
}
export interface MonthStat    { month: string; hk3_rev: number; bc_rev: number; total_rev: number }
export interface GmStat       { month: string; gp: number; rev: number; gm_pct: number }
export interface MonthCount   { total: number; web: number; lark: number }
export interface EvidenceRecord {
  id: string; quarter: string; metric: string; title: string | null
  request_time: string; request_note: string | null; request_image_url: string | null
  completion_time: string | null; completion_note: string | null; completion_image_url: string | null
  duration_value: number | null; created_by: string | null; created_at: string
  updated_by?: string | null; updated_at?: string | null
  source?: "manual" | "lark_auto"
}
export interface EvidenceData {
  records: EvidenceRecord[]; avg: number | null; count: number; completed: number; verified: number
  locked: boolean; sources?: { manual: number; lark_auto: number }
}
export interface LarkEvent {
  id: string; quarter: string; metric: string; message_id: string
  chat_id: string; chat_name: string
  request_time: string; request_snippet: string | null; request_sender: string | null
  completion_time: string | null; completion_snippet: string | null; completion_sender: string | null
  duration_value: number | null; ai_reason: string | null
  status: "pending_review" | "confirmed" | "rejected"
}
export interface Conversation {
  id: number; user_message: string; ai_response: string
  channel: string; user: string; created_at: string
}
export interface ManualMetrics {
  target_sla_hours: number; target_sla_pct: number; target_vendor_speed: number
  target_gm_delta: number; target_hk3_pct: number; target_begau: number
  updated_by?: string; updated_at?: string
}
export interface SkuScanItem {
  sku: string; category: string | null; vendor: string | null
  rev_cur: number; gp_cur: number; gm_pct_cur: number; orders_cur: number
  rev_prev: number; gp_prev: number; gm_pct_prev: number; orders_prev: number
  delta: number | null; delta_basis: string
  is_key: boolean; is_new: boolean; cum_rev_pct: number
}
export interface SkuScanData {
  quarter: string; prevQuarter: string; key_threshold_pct: number
  items: SkuScanItem[]; weighted_delta: number | null
  key_count: number; new_count: number; scored_count: number; total_rev_cur: number
}
export interface SkuNote { id: string; sku_code: string; note: string | null; created_by: string }
export interface DatapoolDetailItem { sku: string; vendor: string; category: string | null; rev: number; units: number; orders: number }
export interface DatapoolDetailData { items: DatapoolDetailItem[]; total_rev: number; total_orders: number; total_units: number }
export interface TopUserRow  { user: string; count: number }
export interface TopicRow    { phrase: string; count: number }
export interface QualityItem {
  id: number; user: string; created_at: string
  user_message: string; ai_response_preview: string
  score: number; bucket: "high" | "medium" | "low"; flags: string[]
}
export interface BegauInsightsData {
  total_tasks: number
  topUsers: TopUserRow[]
  topKeywords: TopicRow[]
  quality: { avgScore: number; high: number; medium: number; low: number; items: QualityItem[] }
}
export interface LarkScanResult {
  scanned: number; classified: number; inserted: number; not_matched: number; classify_errors: number
  backlog_remaining: number; skipped?: string
  groups: { chat_id: string; chat_name: string; thread_count: number }[]
}

// ─── Notes Drawer — mọi ghi chú/công thức/giải thích gộp vào 1 nơi, ẩn mặc định ──
export interface NoteSection { id: string; title: string; body: React.ReactNode }

// Fallback khi chưa lưu target vào DB
export const DEFAULT_TARGETS = {
  Q3: { sla_hours: 5, sla_pct: 80, vendor_speed: 15, gm_delta: 2.5, hk3_pct: 74, begau: 450 },
  Q4: { sla_hours: 1, sla_pct: 90, vendor_speed: 5,  gm_delta: 5.0, hk3_pct: 80, begau: 650 },
}
export const BASELINE_NOTE = {
  sla:          "2–4 ngày/YC (TB 1–2 ngày thủ công)",
  vendor_speed: "15–30 phút/YC",
  begau_weekly: "10–15 tasks/tuần",
}
// Trọng số quy đổi từ offer letter: "BI & AI Automation (30%)" + phần còn lại (Operational
// Excellence + Product Performance) = 70% theo time-allocation. Offer letter KHÔNG chia trọng số
// riêng cho 4 chỉ số trong nhóm 70% → chia ĐỀU 17.5% mỗi chỉ số (giả định minh bạch, có thể chỉnh
// nếu sếp muốn trọng số khác — sửa ở đây, KHÔNG có công thức ẩn nào khác trong code).
export const WEIGHTS = { sla: 17.5, vendor_speed: 17.5, sku_gm: 17.5, hk3: 17.5, begau: 30 }
export const OKR_GM_BASELINE_DISPLAY = 36.7 // hiển thị context — nguồn thật nằm ở lib/okr-helpers.ts
