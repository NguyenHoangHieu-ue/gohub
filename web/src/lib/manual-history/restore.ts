import { supabaseAdmin } from "@/lib/supabase"
import { tursoQuery } from "@/lib/turso"
import { flushAnalyticsCache } from "@/lib/analytics-helpers"
import { getEntry, recordEdit, type Changes } from "./store"
import { TABLES, canRestore, type TableDef } from "./registry"

// Khôi phục số cũ từ một mục lịch sử: ghi lại các giá trị CŨ của đúng những trường đã đổi (action update), hoặc dựng lại dòng đã xoá (action delete).
// Việc khôi phục tự nó cũng được ghi vào lịch sử (nguồn "khôi phục #id") nên hoàn tác được.
const COL = /^[a-z][a-z0-9_]*$/i
const pkParts = (def: TableDef, key: string) => { const v = key.split("|"); return Object.fromEntries((def.pk ?? []).map((c, i) => [c, v[i]])) }
const oldValues = (c: Changes) => Object.fromEntries(Object.entries(c).map(([f, [o]]) => [f, o]))
const newValues = (c: Changes) => Object.fromEntries(Object.entries(c).map(([f, [, n]]) => [f, n]))

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".")
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) { if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {}; cur = cur[parts[i]] as Record<string, unknown> }
  if (value === null) delete cur[parts[parts.length - 1]]
  else cur[parts[parts.length - 1]] = value
}

async function readSetting(key: string): Promise<Record<string, unknown>> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle()
  try { return data?.value ? JSON.parse(data.value) : {} } catch { return {} }
}
const writeSetting = async (key: string, value: unknown, category: string) => {
  const { error } = await supabaseAdmin.from("app_settings").upsert({ key, value: typeof value === "string" ? value : JSON.stringify(value), category, updated_at: new Date().toISOString() }, { onConflict: "key" })
  if (error) throw new Error(error.message)
}

export async function restoreEntry(id: number, user: string): Promise<{ ok: true } | { error: string }> {
  const e = await getEntry(id)
  if (!e) return { error: "Không tìm thấy mục lịch sử." }
  const why = canRestore(e)
  if (why) return { error: why }
  const def = TABLES[e.tbl]
  const old = oldValues(e.changes)
  try {
    if (def.store === "supabase" || def.store === "turso") {
      const cols = Object.keys(old)
      if (!cols.every(c => COL.test(c))) return { error: "Tên cột không hợp lệ." }
      const key = pkParts(def, e.row_key)
      if (e.action === "delete") {
        const row = Object.fromEntries(Object.entries({ ...old, ...key }).filter(([, v]) => v !== null))
        if (def.store === "supabase") { const { error } = await supabaseAdmin.from(def.table!).insert(row); if (error) throw new Error(error.message) }
        else {
          const names = Object.keys(row)
          await tursoQuery(`INSERT INTO ${def.table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")})`, names.map(n => (typeof row[n] === "object" ? JSON.stringify(row[n]) : (row[n] as string | number | null))))
        }
      } else if (def.store === "supabase") {
        const run = async (values: Record<string, unknown>) => { let q = supabaseAdmin.from(def.table!).update(values); for (const [c, v] of Object.entries(key)) q = q.eq(c, v); return q }
        let { error } = await run({ ...old, updated_at: new Date().toISOString() })
        if (error && /updated_at/.test(error.message)) ({ error } = await run(old))   // bảng không có cột updated_at
        if (error) throw new Error(error.message)
      } else {
        const sets = cols.map(c => `${c} = ?`).join(", ")
        const where = Object.keys(key).map(c => `${c} = ?`).join(" AND ")
        await tursoQuery(`UPDATE ${def.table} SET ${sets}${sets ? ", " : ""}updated_at = ? WHERE ${where}`, [...cols.map(c => (typeof old[c] === "object" && old[c] !== null ? JSON.stringify(old[c]) : (old[c] as string | number | null))), new Date().toISOString(), ...Object.values(key)])
      }
    } else if (def.store === "setting") {
      // app_settings: row_key = khoá; trường duy nhất `value`. okr_manual_targets: row_key = khoá cấu hình, value = JSON phẳng các trường.
      if (e.tbl === "app_settings") { if ("value" in old && old.value !== null) await writeSetting(e.row_key, String(old.value), "restore"); else return { error: "Không có giá trị cũ để khôi phục." } }
      else { const cur = await readSetting(e.row_key); for (const [f, v] of Object.entries(old)) { if (v === null) delete cur[f]; else cur[f] = v } await writeSetting(e.row_key, cur, "okr") }
    } else if (def.store === "json-setting") {
      const all = await readSetting(def.settingKey!)
      const sub = (typeof all[e.row_key] === "object" && all[e.row_key] !== null ? all[e.row_key] : {}) as Record<string, unknown>
      for (const [path, v] of Object.entries(old)) setPath(sub, path, v)
      all[e.row_key] = sub
      await writeSetting(def.settingKey!, all, e.tbl === "squad_targets" ? "squad" : "quarterly")
    } else if (def.store === "fx") {
      const [fxId, month] = e.row_key.split("|")
      const { loadEffectiveTable, saveMonthlyTable } = await import("@/lib/fx/server")
      const { setCell } = await import("@/lib/fx/table")
      const { table } = await loadEffectiveTable()
      const rate = "rate" in old && old.rate !== null ? Number(old.rate) : null
      await saveMonthlyTable(setCell(table, fxId, month, rate))
    }
  } catch (err) { return { error: `Khôi phục lỗi: ${(err as Error).message}` } }
  // ghi việc khôi phục vào lịch sử (đảo chiều: số hiện tại → số cũ) để hoàn tác được
  await recordEdit({ table: e.tbl, key: e.row_key, label: e.label, before: newValues(e.changes), after: old, user, source: `khôi phục mục #${e.id}` })
  await flushAnalyticsCache().catch(() => undefined)   // số target/chi phí đổi → làm mới cache các tab
  return { ok: true }
}
