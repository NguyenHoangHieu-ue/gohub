import { SchemaType } from "@google/generative-ai"
import { NextRequest } from "next/server"
import { GET as quarterlyB2BCustomers } from "@/app/api/analytics/quarterly-b2b-customers/route"

// Tool Bé Gấu: CM1 B2B theo khách hàng (plan U3) — gọi THẲNG route Quarter Report (bảng B2B Nhóm × Tháng) để số khớp tuyệt đối tab,
// không viết lại công thức (chi phí KH Turso, pro-rata tháng đang chạy, Group Cost B2B phân bổ theo doanh thu ở mức nhóm).

export const b2bCustomerCm1Decl = {
  name: "b2bCustomerCm1",
  description: "CM1 B2B theo khách hàng trong 1 quý — đúng số tab Quarter Report: doanh thu, lãi gộp, chi phí kênh của KH, CM1, CM1%, %QoQ, 3HK%, chi tiết từng tháng. Dùng cho câu hỏi CM1/lãi sau chi phí của khách B2B, nhóm khách (Strategic/VIP/Gold/Silver…). Tháng đang chạy là số ước tính cả tháng.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      quarter:  { type: SchemaType.STRING, description: "Q1 | Q2 | Q3 | Q4" },
      year:     { type: SchemaType.NUMBER },
      customer: { type: SchemaType.STRING, description: "Lọc theo tên hoặc mã KH (chứa chuỗi, không phân biệt hoa thường). Bỏ trống = tất cả." },
      tier:     { type: SchemaType.STRING, description: "Lọc nhóm khách (vd Strategic, VIP, Gold, Silver). Bỏ trống = tất cả." },
      top:      { type: SchemaType.NUMBER, description: "Số KH trả về, xếp theo doanh thu (mặc định 15, tối đa 50)." },
      months:   { type: SchemaType.BOOLEAN, description: "true = kèm số từng tháng của mỗi KH." },
    },
    required: ["quarter", "year"],
  },
}

export async function runB2bCustomerCm1(a: any): Promise<any> {
  const quarter = String(a?.quarter ?? "").toUpperCase()
  const year = Number(a?.year)
  if (!/^Q[1-4]$/.test(quarter) || !year) return { error: "Cần quarter (Q1–Q4) và year." }
  const url = `http://internal/api/analytics/quarterly-b2b-customers?quarter=${quarter}&year=${year}`
  const res = await quarterlyB2BCustomers(new NextRequest(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } }))
  const data: any = await res.json()
  if (!res.ok || data?.error) return { error: data?.error || `Lỗi ${res.status}` }

  const q = String(a?.customer ?? "").trim().toLowerCase()
  const tierQ = String(a?.tier ?? "").trim().toLowerCase()
  const top = Math.min(Math.max(Number(a?.top) || 15, 1), 50)
  const tiers = (data.tiers ?? []).filter((t: any) => !tierQ || String(t.tier).toLowerCase().includes(tierQ))
  const rows = tiers.flatMap((t: any) => (t.customers ?? []).map((c: any) => ({ ...c, tier: t.tier })))
    .filter((c: any) => !q || String(c.name).toLowerCase().includes(q) || String(c.code).toLowerCase().includes(q))
    .sort((x: any, y: any) => y.revenue - x.revenue)

  return {
    quarter, year, months: data.months,
    note: "CM1 từng KH = lãi gộp − chi phí kênh nhập cho KH đó (chưa trừ Group Cost). CM1 tổng nhóm đã trừ phần Group Cost B2B phân bổ theo doanh thu. Tháng đang chạy là ước tính cả tháng.",
    tierTotals: tiers.map((t: any) => ({ tier: t.tier, customers: t.customerCount, revenue: t.totalRevenue, gm: t.totalGm, channelCost: t.totalCc, cm1: t.totalCm1, cm1Pct: t.totalCm1Pct, qoqPct: t.qoqPct, hk3Pct: t.totalHk3Pct })),
    matched: rows.length,
    customers: rows.slice(0, top).map((c: any) => ({
      code: c.code, name: c.name, tier: c.tier, region: c.region,
      revenue: c.revenue, gm: c.gm, gmPct: c.gmPct, channelCost: c.cc, cm1: c.cm1, cm1Pct: c.cm1Pct, qoqPct: c.qoqPct, hk3Pct: c.hk3Pct,
      ...(a?.months ? { byMonth: Object.entries(c.monthSummary ?? {}).map(([month, m]: [string, any]) => ({
        month, revenue: m.revenue, gm: m.gm, channelCost: m.cc, cm1: m.cm1, cm1Pct: m.cm1Pct, estimated: !!m.isProjected })) } : {}),
    })),
  }
}
