import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getDbRole } from "@/lib/db-role"
import { supabaseAdmin } from "@/lib/supabase"
import { computeMonthlyKpis } from "@/app/api/cron/refresh-monthly-kpis/route"

export const maxDuration = 60

async function requireCreator() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.username) throw new Error("Unauthorized")
  const role = await getDbRole(session.user.username)
  if (role !== "creator") throw new Error("Creator only")
  return session
}

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// Đối chiếu 3 nguồn cho cùng tháng (ALL):
//  - SNAPSHOT  = bảng Supabase `analytics_monthly_kpis` (Bé Gấu/chatbot đọc).
//  - LIVE      = `computeMonthlyKpis` (đúng công thức cron) tính lại ngay.
//  - TRANG     = route `/api/analytics/monthly-kpis` (Dashboard hiển thị) — nguồn ĐỘC LẬP với cron.
// Chỉ so LIVE↔SNAPSHOT thì không bắt được lỗi công thức nằm trong `computeMonthlyKpis` (cả hai cùng sai — vd s236: cron gồm GP âm
// INTERNAL-TRANSACTION, lệch trang 12,6tr = 0,9% lọt ngưỡng 1%). LIVE↔TRANG cùng tính ngay, đều dùng số thực tới hôm nay nên phải
// khớp gần tuyệt đối (ngưỡng chặt); LIVE↔SNAPSHOT chỉ trôi theo thời gian từ lần cron cuối (tháng đang chạy trôi nhiều hơn).
const FIELDS: { key: "revenue" | "cm1" | "cm1_pct" | "hk3_pct"; label: string; pct: boolean; pageKey: "actualRevenue" | "actualCm1" | "actualHk3" | null }[] = [
  { key: "revenue", label: "Doanh thu", pct: false, pageKey: "actualRevenue" },
  { key: "cm1",     label: "CM1",       pct: false, pageKey: "actualCm1" },
  { key: "cm1_pct", label: "CM1%",      pct: true,  pageKey: null },
  { key: "hk3_pct", label: "3HK%",      pct: true,  pageKey: null },
]

type Status = "ok" | "warn" | "bad"
// LIVE↔SNAPSHOT: dung sai theo thời gian trôi từ lần cron cuối.
function diffStatus(diffPct: number): Status {
  const abs = Math.abs(diffPct)
  if (abs <= 1) return "ok"
  if (abs <= 5) return "warn"
  return "bad"
}
// LIVE↔TRANG: cùng thời điểm, cùng dữ liệu → chỉ cho sai số làm tròn (≤0,05% hoặc ≤0,05 điểm %).
function pageStatus(diff: number): Status {
  const abs = Math.abs(diff)
  if (abs <= 0.05) return "ok"
  if (abs <= 0.5) return "warn"
  return "bad"
}
const worst = (a: Status, b: Status): Status => (a === "bad" || b === "bad") ? "bad" : (a === "warn" || b === "warn") ? "warn" : "ok"

export async function GET(req: NextRequest) {
  try {
    await requireCreator()
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const today = new Date()
  const months = [0, -1].map(off => getMonthStr(new Date(today.getFullYear(), today.getMonth() + off, 1)))

  const results: any[] = []

  // Số của TRANG (Dashboard): gọi nội bộ route monthly-kpis bằng Bearer cron (bỏ cache) cho cả hai tháng.
  let pageSummary: Array<Record<string, number | string>> = []
  let pageError: string | null = null
  try {
    const startDate = `${months[months.length - 1]}-01`, endDate = today.toISOString().split("T")[0]
    const r = await fetch(`${req.nextUrl.origin}/api/analytics/monthly-kpis?companyCode=ALL&dateColumn=fulfiled_date&startDate=${startDate}&endDate=${endDate}&nocache=1`,
      { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, cache: "no-store" })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    pageSummary = (await r.json()).summary ?? []
  } catch (e: any) { pageError = e?.message?.slice(0, 120) ?? "lỗi" }
  if (pageError) results.push({ month: "—", error: `Không lấy được số của trang Dashboard (monthly-kpis) để đối chiếu độc lập: ${pageError}` })
  for (const month of months) {
    let live: Awaited<ReturnType<typeof computeMonthlyKpis>> | null = null
    try {
      live = await computeMonthlyKpis(month, "ALL")
    } catch (e: any) {
      results.push({ month, error: `Không tính được số live: ${e?.message?.slice(0, 150) ?? "lỗi"}` })
      continue
    }

    const { data: snap } = await supabaseAdmin
      .from("analytics_monthly_kpis").select("*").eq("month", month).eq("company_code", "ALL").maybeSingle()

    if (!snap) {
      results.push({ month, error: "Chưa có snapshot analytics_monthly_kpis cho tháng này — cron refresh-monthly-kpis có thể chưa chạy lần nào." })
      continue
    }

    const pageRow = pageSummary.find(s => s.month === month)
    for (const f of FIELDS) {
      const liveVal = Number((live as any)[f.key] ?? 0)
      const snapVal = Number((snap as any)[f.key] ?? 0)
      const rel = (a: number, b: number) => (b !== 0 ? ((a - b) / Math.abs(b)) * 100 : (a !== 0 ? 100 : 0))
      const diffPct = f.pct ? liveVal - snapVal : rel(liveVal, snapVal)   // % → lệch tính thẳng bằng điểm %
      // Giá trị của TRANG cùng chỉ số (actual*, không phải số chiếu): % tự tính từ doanh thu thực.
      let pageVal: number | null = null
      if (pageRow) {
        const rev = Number(pageRow.actualRevenue ?? 0)
        if (f.pageKey) pageVal = Number(pageRow[f.pageKey] ?? 0)
        else if (f.key === "cm1_pct") pageVal = rev > 0 ? Math.round(Number(pageRow.actualCm1 ?? 0) / rev * 10000) / 100 : 0
        else if (f.key === "hk3_pct") pageVal = rev > 0 ? Math.round(Number(pageRow.actualHk3 ?? 0) / rev * 10000) / 100 : 0
      }
      const pageDiff = pageVal === null ? null : Math.round((f.pct ? liveVal - pageVal : rel(liveVal, pageVal)) * 100) / 100
      const status = pageDiff === null ? diffStatus(diffPct) : worst(diffStatus(diffPct), pageStatus(pageDiff))
      results.push({
        month, field: f.label, live: liveVal, snapshot: snapVal, diffPct: Math.round(diffPct * 100) / 100,
        page: pageVal, pageDiffPct: pageDiff,
        snapshotRefreshedAt: (snap as any).refreshed_at ?? null,
        status,
      })
    }
  }

  return NextResponse.json({ checkedAt: new Date().toISOString(), results })
}
