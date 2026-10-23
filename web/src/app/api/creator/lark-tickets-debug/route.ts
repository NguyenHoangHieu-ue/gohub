import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getLarkToken } from "@/lib/lark"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// TẠM (s240): chẩn đoán bảng Lark Base ticket CS — cột, view, tổng số bản ghi, các cú pháp lọc. Xoá sau khi chốt cách đọc.
const clean = (v: string) => v.split(/[&?\s]/)[0].trim()
const LARK = "https://open.larksuite.com/open-apis"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const app = clean(process.env.LARK_BASE_ID || ""), table = clean(process.env.LARK_TABLE_ID || "")
  const token = await getLarkToken()
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const U = `${LARK}/bitable/v1/apps/${app}/tables/${table}`
  const out: Record<string, unknown> = {}
  const get = async (path: string) => (await fetch(`${U}${path}`, { headers: H })).json()
  const search = async (body: unknown, q = "page_size=5") => (await fetch(`${U}/records/search?${q}`, { method: "POST", headers: H, body: JSON.stringify(body) })).json()

  const f = await get("/fields?page_size=100")
  out.fields = (f.data?.items || []).map((x: { field_name: string; type: number; ui_type?: string }) => `${x.field_name} [${x.type}/${x.ui_type ?? ""}]`)
  const v = await get("/views?page_size=50")
  out.views = (v.data?.items || []).map((x: { view_id: string; view_name: string; view_type: string }) => `${x.view_name} (${x.view_id}, ${x.view_type})`)

  const first = await search({ automatic_fields: false }, "page_size=1")
  out.totalNoFilter = first.data?.total
  out.firstRecordCreation = first.data?.items?.[0]?.fields?.["Creation Date"]

  const since = Date.UTC(2026, 8, 1)
  const tries: Record<string, unknown> = {}
  const variants: [string, unknown][] = [
    ["isGreater+ExactDate", { conjunction: "and", conditions: [{ field_name: "Creation Date", operator: "isGreater", value: ["ExactDate", String(since)] }] }],
    ["is+ExactDate", { conjunction: "and", conditions: [{ field_name: "Creation Date", operator: "is", value: ["ExactDate", String(since)] }] }],
    ["isGreater+number", { conjunction: "and", conditions: [{ field_name: "Creation Date", operator: "isGreater", value: [String(since)] }] }],
    ["isGreater+Today-based", { conjunction: "and", conditions: [{ field_name: "Creation Date", operator: "isGreater", value: ["Yesterday"] }] }],
    ["Ticket Type contains", { conjunction: "and", conditions: [{ field_name: "Ticket Type", operator: "contains", value: ["Troubleshoot"] }] }],
  ]
  for (const [name, filter] of variants) {
    const r = await search({ filter, automatic_fields: false })
    tries[name] = r.code === 0 ? `ok total=${r.data?.total}` : `${r.code} ${String(r.msg).slice(0, 100)}`
  }
  out.filterTries = tries

  // Có view nào trả nhiều bản ghi hơn view mặc định không?
  const viewTotals: Record<string, unknown> = {}
  for (const x of (v.data?.items || []).slice(0, 8) as { view_id: string; view_name: string }[]) {
    const r = await search({ view_id: x.view_id, automatic_fields: false }, "page_size=1")
    viewTotals[x.view_name] = r.code === 0 ? r.data?.total : `${r.code}`
  }
  out.viewTotals = viewTotals
  return NextResponse.json(out)
}
