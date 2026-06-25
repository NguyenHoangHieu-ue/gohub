import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"

const TURSO_URL   = process.env.TURSO_URL   || ""
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || ""

function tursoHttp(sql: string) {
  const url = TURSO_URL.replace(/^libsql:\/\//, "https://")
  return fetch(`${url}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${TURSO_TOKEN}` },
    body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql } }, { type: "close" }] }),
  })
}

function mapRole(r: string): string {
  const n = (r || "").toLowerCase().trim()
  if (n === "admin") return "admin"
  if (n === "bod")   return "bod"
  if (n === "staff") return "staff"
  if (n === "b2b")   return "b2b"
  if (n === "b2c")   return "b2c"
  if (n === "salesb2c" || n === "saleb2c") return "saleb2c"
  if (n === "hr")    return "hr"
  if (n === "product") return "product"
  return "staff"
}

const REPORT_MAP: Record<string, string | null> = {
  "home": "dashboard", "bod": "bod", "cs-troubleshoot": "cs-troubleshoot",
  "feedback": "feedback", "product-performance": "products", "three-hk-data-usage": "3hk-usage",
  "target-planning": "targets", "sql-explorer": "sql", "orders": "orders",
  "channel": "channels", "b2b-performance": "b2b", "b2c-performance": "b2c",
  "vendor-performance": "vendors", "staff-performance": "staff",
  "customer-performance": "customers", "fulfillment": "fulfillment",
  "website-analytics": "website", "all-time-performance": "all-time", "ai": null,
}

function mapReports(s: string | null): string | null {
  if (!s || s === "[]") return null
  try {
    const arr: string[] = JSON.parse(s)
    const mapped = arr.map(r => REPORT_MAP[r]).filter(Boolean) as string[]
    return mapped.length ? mapped.join(",") : null
  } catch { return null }
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!TURSO_URL || !TURSO_TOKEN) return NextResponse.json({ error: "Turso not configured" }, { status: 500 })

  try {
    const res = await tursoHttp("SELECT uid, email, role, name, allowedReports FROM user_profiles WHERE email IS NOT NULL AND email != '' AND email LIKE '%@%'")
    const body = await res.json()
    const result = body.results?.[0]
    if (result?.type !== "ok") throw new Error("Turso query failed")
    const cols: string[] = result.response.result.cols.map((c: any) => c.name)
    const rows = result.response.result.rows.map((row: any[]) =>
      Object.fromEntries(cols.map((c, i) => [c, row[i]?.value ?? row[i] ?? null]))
    )

    let inserted = 0, updated = 0, skipped = 0
    const errors: string[] = []

    for (const p of rows) {
      const email = String(p.email || "").trim().toLowerCase()
      if (!email || !email.includes("@")) { skipped++; continue }
      const name  = p.name ? String(p.name) : ""
      const role  = mapRole(String(p.role || ""))
      const allowedAnalytics = mapReports(p.allowedReports ? String(p.allowedReports) : null)
      const username = email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").toLowerCase()

      const { data: existing } = await supabaseAdmin.from("users").select("username, role").eq("email", email).maybeSingle()

      if (existing) {
        if (existing.role !== role) {
          const { error } = await supabaseAdmin.from("users").update({ role, ...(allowedAnalytics ? { allowed_analytics: allowedAnalytics } : {}) }).eq("username", existing.username)
          if (error) errors.push(`update ${email}: ${error.message}`)
          else updated++
        } else { skipped++ }
        continue
      }

      const { error } = await supabaseAdmin.from("users").insert({ username, email, name: name || username, role, allowed_analytics: allowedAnalytics, department: "none" })
      if (error) {
        const { error: e2 } = await supabaseAdmin.from("users").insert({ username: username + "_" + Date.now().toString().slice(-4), email, name: name || username, role, allowed_analytics: allowedAnalytics, department: "none" })
        if (e2) { errors.push(`insert ${email}: ${e2.message}`); skipped++ } else inserted++
      } else inserted++
    }

    return NextResponse.json({ ok: true, total: rows.length, inserted, updated, skipped, errors })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!TURSO_URL || !TURSO_TOKEN) return NextResponse.json({ turso: 0, supabase: 0 })
  try {
    const [tr, { count: sc }] = await Promise.all([
      tursoHttp("SELECT COUNT(*) as c FROM user_profiles WHERE email IS NOT NULL AND email != '' AND email LIKE '%@%'").then(r => r.json()),
      supabaseAdmin.from("users").select("*", { count: "exact", head: true }),
    ])
    const tursoCount = parseInt(tr.results?.[0]?.response?.result?.rows?.[0]?.[0]?.value || "0")
    return NextResponse.json({ turso: tursoCount, supabase: sc ?? 0 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
