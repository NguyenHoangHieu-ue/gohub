import { describe, test, expect } from "vitest"
import { supabaseAdmin } from "@/lib/supabase"
import { extractParams } from "@/lib/agents/router"
import { getRefCache } from "@/lib/agents/cache"
import { searchSkus } from "@/lib/agents/tools"

// Harness replay: kéo câu hỏi thật (web + Lark) → chạy qua extractParams + searchSkus (KHÔNG gọi Gemini)
// → phân loại nguyên nhân "chatbot không biết nước/gói". Chỉ đọc, không ghi DB.

const PRODUCT_HINT = /\b(đi|gói|goi|esim|e-sim|sim|ngày|ngay|gb|mb|unlimited|không giới hạn|mua|nước|nuoc|du lịch|du lich|travel|data|dung lượng|dung luong)\b/i

async function fetchQuestions(): Promise<string[]> {
  const out: string[] = []
  const lark = await supabaseAdmin.from("lark_chat_history").select("content").eq("role", "user").limit(2000)
  ;(lark.data ?? []).forEach((r: any) => r.content && out.push(String(r.content)))
  const web = await supabaseAdmin.from("chat_messages").select("content, role").eq("role", "user").limit(2000)
  ;(web.data ?? []).forEach((r: any) => r.content && out.push(String(r.content)))
  return out
}

describe("Chatbot replay — câu hỏi thật (web + Lark)", () => {
  test("phân loại nguyên nhân miss", async () => {
    const ref = await getRefCache()
    const catCount = await supabaseAdmin.from("sku_catalog").select("sku_code", { count: "exact", head: true })
    const jpnProbe = await searchSkus({ country: "Japan" }, ref)
    console.log(`[DIAG] ref.supportCountries=${ref.supportCountries?.length} ref.countries=${(ref as any).countries?.length} sku_catalog.count=${catCount.count} | Japan probe: skus=${jpnProbe.skus.length} note="${jpnProbe.note?.slice(0,80)}"`)
    const raw = await fetchQuestions()
    // dedupe + bỏ câu quá ngắn/lệnh
    const seen = new Set<string>()
    const questions = raw
      .map((q) => q.trim())
      .filter((q) => q.length >= 3 && !q.startsWith("/") && !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()))

    const buckets: Record<string, string[]> = { GEO_OK: [], CODE: [], MAYBE_MISS_GEO: [], OTHER: [] }
    const countriesAsked = new Set<string>()

    for (const q of questions) {
      const p = extractParams(q)
      const hasGeo = !!(p.country || p.region || p.groupCode)
      const hasCode = !!(p.skuCode || p.productCode || p.listingCode || p.skuCodes?.length || p.productCodes?.length)
      if (p.country) countriesAsked.add(p.country)
      if (hasGeo) buckets.GEO_OK.push(q)
      else if (hasCode) buckets.CODE.push(q)
      else if (PRODUCT_HINT.test(q)) buckets.MAYBE_MISS_GEO.push(q)
      else buckets.OTHER.push(q)
    }

    // Phase B: nước nhận dạng được nhưng searchSkus trả 0 (gap dữ liệu)
    const zeroSku: string[] = []
    const okSku: string[] = []
    for (const c of countriesAsked) {
      try {
        const { skus } = await searchSkus({ country: c }, ref)
        ;(skus.length ? okSku : zeroSku).push(`${c}(${skus.length})`)
      } catch (e: any) {
        zeroSku.push(`${c}[ERR:${String(e?.message).slice(0, 40)}]`)
      }
    }

    const total = questions.length
    const pct = (n: number) => `${n} (${((n / total) * 100).toFixed(1)}%)`
    const lines = [
      "",
      "══════════ CHATBOT REPLAY REPORT ══════════",
      `Tổng câu hỏi (dedupe): ${total} | nước nhận dạng: ${countriesAsked.size}`,
      "── Phân loại extractParams ──",
      `  GEO_OK          (trích được nước/khu vực/mã nhóm): ${pct(buckets.GEO_OK.length)}`,
      `  CODE            (hỏi theo mã SKU/product)         : ${pct(buckets.CODE.length)}`,
      `  MAYBE_MISS_GEO  (giống hỏi sản phẩm NHƯNG KHÔNG trích được nước) : ${pct(buckets.MAYBE_MISS_GEO.length)}`,
      `  OTHER           (không phải hỏi sản phẩm)         : ${pct(buckets.OTHER.length)}`,
      "── Phase B: nước nhận dạng nhưng searchSkus = 0 SKU (gap dữ liệu) ──",
      `  ZERO_SKU (${zeroSku.length}): ${zeroSku.slice(0, 40).join(", ") || "none"}`,
      "── Mẫu MAYBE_MISS_GEO (top 30) — ứng viên fix trích nước ──",
      ...buckets.MAYBE_MISS_GEO.slice(0, 30).map((q, i) => `  ${i + 1}. ${q.slice(0, 90)}`),
      "════════════════════════════════════════════",
    ]
    console.log(lines.join("\n"))

    expect(total).toBeGreaterThan(0)
  })

  test("coverage: nước trong ref_countries mà extractParams KHÔNG nhận ra", async () => {
    const { data } = await supabaseAdmin.from("ref_countries").select("code,name,name_vn").order("name")
    const missing: string[] = []
    for (const c of (data ?? []) as any[]) {
      const byEn = extractParams(String(c.name || "")).country
      const byVn = c.name_vn ? extractParams(String(c.name_vn)).country : undefined
      if (!byEn && !byVn) missing.push(`${c.name} | ${c.name_vn ?? "-"} | ${c.code}`)
    }
    console.log(`\n[COVERAGE] ${missing.length}/${(data ?? []).length} nước KHÔNG nhận ra:\n` +
      missing.map((m, i) => `  ${i + 1}. ${m}`).join("\n"))
    expect(Array.isArray(missing)).toBe(true)
  })
})
