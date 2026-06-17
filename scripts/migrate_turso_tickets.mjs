/**
 * migrate_turso_tickets.mjs
 * Đọc lark_tickets từ Turso → upsert vào Supabase lark_cs_tickets
 *
 * Chạy: node scripts/migrate_turso_tickets.mjs
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const TURSO_URL  = "https://gohub-intel-baole.aws-ap-northeast-1.turso.io"
const TURSO_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzU0NjMwNzEsImlkIjoiMDE5ZDYxZDctMjcwMS03MDI1LWE0ZGItYmY5NDc0N2Q2ZDNmIiwicmlkIjoiYzlhY2Y3YjYtNTg4OC00Y2QyLWI4ZjktZDA0ODJkYTBhOTg3In0.ReIz6_MHX59QbwMqrlkrCD3NpXZX8aQVDlIjFMFxM29VJ5rR2HLdVWVYat8lLa2AtrkJNEgtka9Y_XtZ-n2HCg"

const SUPABASE_URL = "https://wfuigmfnfcijkvylrwzz.supabase.co"
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmdWlnbWZuZmNpamt2eWxyd3p6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDQ3MDgxNiwiZXhwIjoyMDk2MDQ2ODE2fQ.0XvbKXseTFTx9iQzmYlXSwoT0bxu2CI8-wrCEMv8ipo"

async function tursoQuery(sql, args = []) {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TURSO_TOKEN}`,
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql, args: args.map(v => ({ type: "text", value: String(v ?? "") })) } },
        { type: "close" },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Turso HTTP ${res.status}: ${await res.text()}`)
  const body = await res.json()
  const result = body.results?.[0]
  if (result?.type !== "ok") throw new Error(`Turso error: ${JSON.stringify(result)}`)

  const cols = result.response.result.cols.map(c => c.name)
  const rows = result.response.result.rows
  return rows.map(row =>
    Object.fromEntries(cols.map((col, i) => [col, row[i]?.value ?? row[i] ?? null]))
  )
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  console.log("🔌 Kết nối Turso...")
  const countRows = await tursoQuery("SELECT COUNT(*) as cnt FROM lark_tickets")
  const total = parseInt(String(countRows[0]?.cnt || 0))
  console.log(`📊 Tổng lark_tickets trong Turso: ${total}`)

  if (total === 0) {
    console.log("❌ Turso không có tickets. Thoát.")
    return
  }

  let offset = 0
  const batchSize = 200
  let totalUpserted = 0

  while (offset < total) {
    const rows = await tursoQuery(
      `SELECT * FROM lark_tickets ORDER BY creation_date DESC LIMIT ${batchSize} OFFSET ${offset}`
    )
    if (!rows.length) break

    const upsertRows = rows
      .map(r => ({
        lark_record_id:   String(r.lark_record_id || ""),
        ticket_no:        String(r.ticket_no    || ""),
        order_no:         String(r.order_no     || ""),
        sku:              String(r.sku           || ""),
        ticket_type:      String(r.ticket_type  || ""),
        issue_detail:     String(r.issue_detail || ""),
        details:          String(r.details      || ""),
        source:           String(r.source       || ""),
        channel:          String(r.channel      || ""),
        vendor:           String(r.vendor       || ""),
        handler:          String(r.handler      || ""),
        product_action:   String(r.product_action || ""),
        money_action:     String(r.money_action   || ""),
        creation_date:    r.creation_date ? Number(r.creation_date) : null,
        ticket_status:    String(r.ticket_status || ""),
        leadtime_minutes: r.leadtime_minutes ? Number(r.leadtime_minutes) : null,
        source_1:         String(r.source_1    || ""),
        updated_at:       new Date().toISOString(),
      }))
      .filter(r => r.lark_record_id)

    const { error } = await supabase
      .from("lark_cs_tickets")
      .upsert(upsertRows, { onConflict: "lark_record_id", ignoreDuplicates: false })

    if (error) {
      console.error(`❌ Supabase upsert error (offset ${offset}):`, error.message)
      process.exit(1)
    }

    totalUpserted += upsertRows.length
    offset += batchSize
    console.log(`  ✓ ${totalUpserted}/${total} tickets upserted...`)
  }

  console.log(`\n✅ Hoàn thành! ${totalUpserted} tickets đã migrate sang Supabase lark_cs_tickets.`)
}

main().catch(err => {
  console.error("❌ Error:", err.message)
  process.exit(1)
})
