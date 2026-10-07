// Bằng chứng SLA / Vendor Speed (evidence tự nhập đủ 2 ảnh + case Lark đã xác nhận) — tách từ route evidence (s227) để
// "Đánh giá hôm nay" + Lark DM hằng ngày dùng chung đúng một công thức. Không đổi logic.
import { supabaseAdmin } from "@/lib/supabase"
import { isQuarterLocked, prevQuarterLabel } from "@/lib/okr-helpers"

// Trung bình hợp nhất 2 nguồn "verified": (a) evidence tự nhập đủ 2 ảnh (như trước), (b) case Lark
// đã được Hiếu XÁC NHẬN trong hàng chờ duyệt (okr_lark_events, status=confirmed) — cả 2 đều có dấu
// vết kiểm chứng được (ảnh, hoặc log chat + người duyệt), không phải số tự khai.
export async function loadEvidence(quarter: string, metric: string) {
  const [{ data: manualData, error: manualErr }, { data: larkData, error: larkErr }] = await Promise.all([
    supabaseAdmin.from("okr_evidence_records").select("*").eq("quarter", quarter).eq("metric", metric)
      .order("request_time", { ascending: false }),
    supabaseAdmin.from("okr_lark_events").select("*").eq("quarter", quarter).eq("metric", metric)
      .eq("status", "confirmed").order("request_time", { ascending: false }),
  ])
  if (manualErr) throw new Error(manualErr.message)
  if (larkErr)   throw new Error(larkErr.message)

  const records = (manualData ?? []).map(r => ({ ...r, source: "manual" as const }))
  // "Verified" = có đủ CẢ 2 ảnh (request + completion) — chỉ case này mới tính vào TB KPI.
  // Case thiếu ảnh vẫn hiển thị (minh bạch là có ghi nhận) nhưng loại khỏi số trung bình báo cáo.
  const manualVerified = records.filter(r => r.duration_value != null && r.request_image_url && r.completion_image_url)

  const larkConfirmed = (larkData ?? []).map(r => ({
    id: r.id, quarter: r.quarter, metric: r.metric, title: null,
    request_time: r.request_time, request_note: r.request_snippet, request_image_url: null,
    completion_time: r.completion_time, completion_note: r.completion_snippet, completion_image_url: null,
    duration_value: r.duration_value, created_by: r.request_sender, created_at: r.created_at,
    updated_by: r.reviewed_by, updated_at: r.reviewed_at, source: "lark_auto" as const,
    hieu_note: r.hieu_note ?? null,
  })).filter(r => r.duration_value != null)

  const allVerified = [...manualVerified, ...larkConfirmed]
  const avg = allVerified.length > 0
    ? allVerified.reduce((a, r) => a + Number(r.duration_value), 0) / allVerified.length
    : null

  const merged = [...records, ...larkConfirmed].sort((a, b) =>
    new Date(b.request_time).getTime() - new Date(a.request_time).getTime())

  // TB theo tháng trong quý (chỉ case verified) — cho chart theo dõi biến động giữa các tháng.
  const monthlyMap = new Map<string, { sum: number; count: number }>()
  for (const r of allVerified) {
    const month = String(r.request_time).slice(0, 7)
    const cur = monthlyMap.get(month) ?? { sum: 0, count: 0 }
    cur.sum += Number(r.duration_value); cur.count++
    monthlyMap.set(month, cur)
  }
  const monthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, avg: +(v.sum / v.count).toFixed(2), count: v.count }))

  // TB quý TRƯỚC (cùng metric, cùng tiêu chí verified) — mốc tham chiếu so sánh quý này với quý trước.
  const prevQuarter = prevQuarterLabel(quarter)
  const [{ data: prevManual }, { data: prevLark }] = await Promise.all([
    supabaseAdmin.from("okr_evidence_records").select("duration_value, request_image_url, completion_image_url")
      .eq("quarter", prevQuarter).eq("metric", metric),
    supabaseAdmin.from("okr_lark_events").select("duration_value")
      .eq("quarter", prevQuarter).eq("metric", metric).eq("status", "confirmed"),
  ])
  const prevVerified = [
    ...(prevManual ?? []).filter(r => r.duration_value != null && r.request_image_url && r.completion_image_url),
    ...(prevLark ?? []).filter(r => r.duration_value != null),
  ]
  const prevQuarterAvg = prevVerified.length > 0
    ? +(prevVerified.reduce((a, r) => a + Number(r.duration_value), 0) / prevVerified.length).toFixed(2)
    : null

  return {
    records: merged,
    avg,
    count: records.length + larkConfirmed.length,
    completed: records.filter(r => r.duration_value != null).length + larkConfirmed.length,
    verified: allVerified.length,
    sources: { manual: manualVerified.length, lark_auto: larkConfirmed.length },
    locked: isQuarterLocked(quarter),
    monthly,
    prev_quarter: { label: prevQuarter, avg: prevQuarterAvg, count: prevVerified.length },
  }
}
