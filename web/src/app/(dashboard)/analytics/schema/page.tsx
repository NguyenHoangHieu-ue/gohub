"use client"

import React, { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRoleGuard } from "@/lib/use-role-guard"
import { Plus, Trash2, Database, Save, RefreshCw, CheckCircle2, AlertCircle, Sparkles, Table as TableIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Port intel SchemaConfig: định nghĩa mô tả bảng/cột để AI hiểu dữ liệu. Admin-only.
// Backend: /api/config/schema (GET saved / POST save) · /api/analytics/schema (live sync) · /api/config/schema/ai-suggest.

interface FieldSchema { id: string; name: string; type: "string" | "number" | "boolean" | "date" | "timestamp"; description: string }
interface TableSchema { id: string; name: string; description: string; fields: FieldSchema[] }

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export default function SchemaConfigPage() {
  const { data: session } = useSession()
  const { ready } = useRoleGuard(["admin", "creator"])   // role tươi từ DB (không dùng JWT stale)
  if (!ready) return null

  return <SchemaConfig email={session?.user?.email || ""} />
}

function SchemaConfig({ email }: { email: string }) {
  const [tables, setTables] = useState<TableSchema[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingAI, setIsGeneratingAI] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [savedSnap, setSavedSnap] = useState("")   // snapshot đã lưu → nút Lưu chỉ sáng khi khác snapshot

  const dirty = JSON.stringify(tables) !== savedSnap

  useEffect(() => { loadSavedSchema() }, [])

  const loadSavedSchema = async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/config/schema")
      if (res.ok) {
        const loaded = (await res.json()).tables || []
        setTables(loaded)
        setSavedSnap(JSON.stringify(loaded))
      }
    } catch {
      setError("Không tải được cấu hình đã lưu.")
    } finally {
      setIsLoading(false)
    }
  }

  const saveConfiguration = async () => {
    setIsSaving(true); setError(null); setSuccessMessage(null)
    try {
      const res = await fetch("/api/config/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: { tables }, updatedBy: email }),
      })
      if (!res.ok) throw new Error("Lưu thất bại")
      setSavedSnap(JSON.stringify(tables))
      setSuccessMessage("Đã lưu cấu hình schema!")
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err: any) {
      setError("Không lưu được cấu hình. " + err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const syncFromDB = async () => {
    setIsLoading(true); setError(null)
    try {
      const res = await fetch("/api/analytics/schema")
      if (!res.ok) throw new Error("Không lấy được schema từ DB")
      const data = await res.json()
      const live: TableSchema[] = (data.tables || []).map((t: any) => ({
        id: uid(),
        name: t.name,
        description: t.description || "",
        fields: (t.fields || []).map((f: any) => ({
          id: uid(),
          name: f.name,
          type: mapType(f.type),
          description: f.description || "",
        })),
      }))
      // Giữ mô tả đã nhập tay nếu tên bảng/cột trùng
      setTables(prev => live.map(lt => {
        const old = prev.find(p => p.name === lt.name)
        if (!old) return lt
        return {
          ...lt,
          description: old.description || lt.description,
          fields: lt.fields.map(lf => {
            const of = old.fields.find(f => f.name === lf.name)
            return of ? { ...lf, description: of.description || lf.description } : lf
          }),
        }
      }))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const mapType = (t: string): FieldSchema["type"] => {
    const s = (t || "").toLowerCase()
    if (s.includes("int") || s.includes("numeric") || s.includes("double") || s.includes("real") || s.includes("decimal")) return "number"
    if (s.includes("bool")) return "boolean"
    if (s.includes("timestamp")) return "timestamp"
    if (s.includes("date")) return "date"
    return "string"
  }

  const addTable = () => setTables([...tables, { id: uid(), name: "new_table", description: "", fields: [] }])
  const addField = (tableId: string) => setTables(tables.map(t => t.id === tableId
    ? { ...t, fields: [...t.fields, { id: uid(), name: "new_field", type: "string", description: "" }] } : t))
  const removeTable = (tableId: string) => setTables(tables.filter(t => t.id !== tableId))
  const removeField = (tableId: string, fieldId: string) => setTables(tables.map(t => t.id === tableId
    ? { ...t, fields: t.fields.filter(f => f.id !== fieldId) } : t))

  const generateAIDescriptions = async (tableId: string) => {
    const table = tables.find(t => t.id === tableId)
    if (!table || table.fields.length === 0) return
    setIsGeneratingAI(prev => ({ ...prev, [tableId]: true })); setError(null)
    try {
      const res = await fetch("/api/config/schema/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableName: table.name, fields: table.fields.map(f => ({ name: f.name, type: f.type })) }),
      })
      if (!res.ok) throw new Error("AI lỗi")
      const result = await res.json()
      setTables(tables.map(t => t.id === tableId ? {
        ...t,
        description: result.tableDescription || t.description,
        fields: t.fields.map(f => ({ ...f, description: result.fields?.[f.name] || f.description })),
      } : t))
    } catch {
      setError("Không thể tạo mô tả bằng AI. Vui lòng thử lại.")
    } finally {
      setIsGeneratingAI(prev => ({ ...prev, [tableId]: false }))
    }
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Schema Config</h1>
          <p className="text-slate-500 text-sm">Định nghĩa mô tả bảng &amp; cột để AI hiểu dữ liệu khi truy vấn</p>
        </div>
        <div className="flex gap-3">
          <button onClick={syncFromDB} disabled={isLoading}
            className={cn("flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors",
              isLoading && "opacity-50 cursor-not-allowed")}
            title="Lấy schema từ PostgreSQL">
            <RefreshCw className={cn("w-4 h-4 text-slate-400", isLoading && "animate-spin")} />
            <span className="text-sm font-medium">{isLoading ? "Đang sync..." : "Sync Schema"}</span>
          </button>
          <button onClick={saveConfiguration} disabled={isSaving || !dirty}
            className={cn("flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-brand-700 transition-colors",
              (isSaving || !dirty) && "opacity-50 cursor-not-allowed")}>
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="text-sm font-medium">{isSaving ? "Đang lưu..." : "Lưu cấu hình"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /><span className="font-bold">Lỗi:</span> {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {successMessage}
        </div>
      )}

      {/* Overview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center text-brand-600">
            <Database className="w-4 h-4" />
          </div>
          <h3 className="font-bold text-slate-800">Tổng quan ({tables.length} bảng)</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {tables.length > 0 ? tables.map(table => (
              <div key={table.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/30 transition-all group">
                <div className="flex justify-between items-start mb-2">
                  <div className="p-2 bg-white rounded-lg shadow-sm group-hover:text-brand-600 transition-colors">
                    <TableIcon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-100">
                    {table.fields.length} cột
                  </span>
                </div>
                <h4 className="font-bold text-slate-800 truncate">{table.name}</h4>
                <p className="text-xs text-slate-500 truncate mt-1">{table.description || "Chưa có mô tả"}</p>
              </div>
            )) : (
              <div className="col-span-full py-4 text-center">
                <p className="text-sm text-slate-400 italic">Chưa có bảng nào. Bấm Sync Schema hoặc thêm bảng mới.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {tables.map(table => (
          <div key={table.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-brand-500" />
                <input className="bg-transparent font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 rounded px-1"
                  value={table.name}
                  onChange={e => setTables(tables.map(t => t.id === table.id ? { ...t, name: e.target.value } : t))} />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => generateAIDescriptions(table.id)} disabled={isGeneratingAI[table.id]}
                  className={cn("flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all",
                    isGeneratingAI[table.id] ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-brand-50 text-brand-600 hover:bg-brand-100")}>
                  <Sparkles className={cn("w-3.5 h-3.5", isGeneratingAI[table.id] && "animate-pulse")} />
                  {isGeneratingAI[table.id] ? "Đang tạo..." : "AI Suggest"}
                </button>
                <button onClick={() => removeTable(table.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4">
              <textarea className="w-full text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-brand-500 mb-4"
                placeholder="Mô tả bảng..." value={table.description}
                onChange={e => setTables(tables.map(t => t.id === table.id ? { ...t, description: e.target.value } : t))} />
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-4 px-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <div className="col-span-4">Tên cột</div>
                  <div className="col-span-3">Kiểu</div>
                  <div className="col-span-4">Mô tả</div>
                  <div className="col-span-1"></div>
                </div>
                {table.fields.map(field => (
                  <div key={field.id} className="grid grid-cols-12 gap-4 items-center bg-slate-50 p-2 rounded-lg group">
                    <div className="col-span-4">
                      <input className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        value={field.name}
                        onChange={e => setTables(tables.map(t => t.id === table.id ? { ...t, fields: t.fields.map(f => f.id === field.id ? { ...f, name: e.target.value } : f) } : t))} />
                    </div>
                    <div className="col-span-3">
                      <select className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        value={field.type}
                        onChange={e => setTables(tables.map(t => t.id === table.id ? { ...t, fields: t.fields.map(f => f.id === field.id ? { ...f, type: e.target.value as FieldSchema["type"] } : f) } : t))}>
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="date">Date</option>
                        <option value="timestamp">Timestamp</option>
                      </select>
                    </div>
                    <div className="col-span-4">
                      <input className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="Mô tả..." value={field.description}
                        onChange={e => setTables(tables.map(t => t.id === table.id ? { ...t, fields: t.fields.map(f => f.id === field.id ? { ...f, description: e.target.value } : f) } : t))} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button onClick={() => removeField(table.id, field.id)}
                        className="p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={() => addField(table.id)}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-2 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 hover:text-brand-500 hover:border-brand-200 hover:bg-brand-50 transition-all text-sm font-medium">
                  <Plus className="w-4 h-4" /> Thêm cột
                </button>
              </div>
            </div>
          </div>
        ))}
        <button onClick={addTable}
          className="flex items-center justify-center gap-2 py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-brand-500 hover:border-brand-200 hover:bg-brand-50 transition-all font-bold">
          <Plus className="w-6 h-6" /> Thêm bảng mới
        </button>
      </div>
    </div>
  )
}
