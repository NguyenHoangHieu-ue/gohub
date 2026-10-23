import { getLarkToken } from "@/lib/lark"

// Ticket CS đọc THẲNG từ Lark Base (s240) — thay bảng Supabase `lark_cs_tickets` (35 nghìn dòng, ~20MB, sync hằng ngày): dữ liệu gốc đã nằm ở Lark.
// Lọc theo ngày ngay ở phía Lark (records/search) để chỉ kéo ticket của kỳ đang xem; nếu Lark từ chối cú pháp lọc thì thử cách khác,
// cuối cùng mới kéo hết rồi lọc ở máy chủ (chậm). Kết quả được cache theo kỳ ở nơi gọi.

const LARK_API = "https://open.larksuite.com/open-apis"
// Chỉ các cột báo cáo dùng (không xin cột người xử lý: tên cột khác nhau theo bảng, báo cáo không dùng)
const FIELDS = ["Ticket No.", "Order No.", "SKU", "Ticket Type", "Issue Detail", "Source", "Vendor",
  "Product Action", "Money Action", "Creation Date", "Leadtime Done Ticket (Minutes)", "Source-1"]
const MAX_PAGES = 80   // 40.000 bản ghi

export interface CsTicket {
  lark_record_id: string
  ticket_no: string
  order_no: string
  sku: string
  ticket_type: string
  issue_detail: string
  source: string
  vendor: string
  product_action: string
  money_action: string
  creation_date: number   // ms
  leadtime_minutes: number
  source_1: string
}

export function larkString(val: unknown): string {
  if (val === null || val === undefined) return ""
  if (typeof val === "string") return val.trim()
  if (Array.isArray(val)) {
    if (!val.length) return ""
    const first = val[0]
    if (typeof first === "object" && first !== null) return (((first as Record<string, unknown>).text || (first as Record<string, unknown>).name || JSON.stringify(first)) as string).trim()
    return String(first).trim()
  }
  if (typeof val === "object") return (((val as Record<string, unknown>).text || (val as Record<string, unknown>).name || JSON.stringify(val)) as string).trim()
  return String(val).trim()
}

/** Một bản ghi Lark Base → ticket (thuần, có test). Bản ghi không có record_id thì bỏ. */
export function mapLarkTicket(item: { record_id?: string; fields?: Record<string, unknown> }): CsTicket | null {
  const f = item.fields || {}
  const id = item.record_id || ""
  if (!id) return null
  let creation = Number(f["Creation Date"] || 0)
  if (!Number.isFinite(creation)) { const dv = f["Creation Date"]; creation = dv ? new Date(String(dv)).getTime() : 0 }
  if (!Number.isFinite(creation)) creation = 0
  const ht = f["Leadtime Done Ticket (Minutes)"]
  let leadtime = typeof ht === "number" ? ht : parseFloat(larkString(ht).replace(/[^0-9.-]/g, "") || "0")
  if (!Number.isFinite(leadtime)) leadtime = 0
  return {
    lark_record_id: id,
    ticket_no: larkString(f["Ticket No."]),
    order_no: larkString(f["Order No."]),
    sku: larkString(f["SKU"]),
    ticket_type: larkString(f["Ticket Type"]),
    issue_detail: larkString(f["Issue Detail"]),
    source: larkString(f["Source"]),
    vendor: larkString(f["Vendor"]),
    product_action: larkString(f["Product Action"]),
    money_action: larkString(f["Money Action"]),
    creation_date: creation,
    leadtime_minutes: leadtime,
    source_1: larkString(f["Source-1"]),
  }
}

const clean = (v: string) => v.split(/[&?\s]/)[0].trim()
export const larkTicketsConfigured = () => !!(clean(process.env.LARK_BASE_ID || "") && clean(process.env.LARK_TABLE_ID || ""))

type FilterStrategy = "date" | "none"
const DAY = 86_400_000

// Cột "Creation Date" của Lark là DateTime: chỉ nhận isGreater / isLess / is với ["ExactDate", ms] và so theo NGÀY (không nhận isGreaterEqual, không nhận số trần;
// đo thật s240). Nên nới biên ±2 ngày rồi lọc chính xác theo ms ở máy chủ.
function buildBody(strategy: FilterStrategy, startTs: number, endTs: number, withFields = true) {
  const body: Record<string, unknown> = { automatic_fields: false }
  if (withFields) body.field_names = FIELDS
  if (strategy === "none") return body
  body.filter = {
    conjunction: "and",
    conditions: [
      { field_name: "Creation Date", operator: "isGreater", value: ["ExactDate", String(startTs - 2 * DAY)] },
      { field_name: "Creation Date", operator: "isLess", value: ["ExactDate", String(endTs + 2 * DAY)] },
    ],
  }
  return body
}

/** Ticket có Creation Date trong [startTs, endTs) (ms). Ném lỗi nếu Lark không trả được. */
export async function fetchCsTickets(startTs: number, endTs: number): Promise<{ tickets: CsTicket[]; strategy: FilterStrategy; pages: number; attempts: string[] }> {
  const appToken = clean(process.env.LARK_BASE_ID || ""), tableId = clean(process.env.LARK_TABLE_ID || "")
  if (!appToken || !tableId) throw new Error("Thiếu env vars: LARK_BASE_ID và LARK_TABLE_ID (token của Lark Base app)")
  const token = await getLarkToken()
  const url = `${LARK_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`
  let lastErr = "Lark Base không trả dữ liệu"
  const attempts: string[] = []

  for (const strategy of ["date", "none"] as FilterStrategy[]) {
    const out: CsTicket[] = []
    let pageToken: string | undefined
    let pages = 0
    let failed = false
    let useFields = true
    do {
      const u = new URL(url)
      u.searchParams.set("page_size", "500")
      if (pageToken) u.searchParams.set("page_token", pageToken)
      const call = async (withFields: boolean) => {
        const res = await fetch(u.toString(), { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(buildBody(strategy, startTs, endTs, withFields)) })
        return res.json().catch(() => ({}))
      }
      let j = await call(useFields)
      // Lark báo thiếu tên cột (1254045 FieldNameNotFound) → thử lại không giới hạn cột (lấy hết cột, chậm hơn chút)
      if (j.code === 1254045 && useFields) { useFields = false; j = await call(false) }
      if (j.code !== 0) {
        lastErr = `Lark API error (${j.code}): ${j.msg}`
        attempts.push(`${strategy}${useFields ? "" : "/all-fields"}: ${j.code} ${String(j.msg).slice(0, 120)}`)
        // Lỗi cú pháp lọc → thử cách kế; lỗi quyền/mạng ở trang đầu cũng thử cách kế rồi báo lỗi cuối cùng
        failed = true
        break
      }
      for (const it of j.data?.items || []) { const t = mapLarkTicket(it); if (t) out.push(t) }
      pageToken = j.data?.has_more ? j.data?.page_token : undefined
      pages++
    } while (pageToken && pages < MAX_PAGES)
    if (failed) continue
    attempts.push(`${strategy}${useFields ? "" : "/all-fields"}: ok ${out.length} bản ghi, ${pages} trang`)
    return { tickets: out.filter(t => t.creation_date >= startTs && t.creation_date < endTs), strategy, pages, attempts }
  }
  throw new Error(lastErr)
}
