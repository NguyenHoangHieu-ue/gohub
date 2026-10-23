"use client"

import { ApiKeysPanel } from "@/components/api-keys-panel"
import React, { useState, useEffect } from "react"
import { Settings as SettingsIcon, Shield, Save, RefreshCw, Plus, X, Database, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRoleGuard } from "@/lib/use-role-guard"

// Cấu hình Analytics — UI theo style intel Settings, backend web (app_settings).
// 3 tab: Dữ liệu (tình trạng DB/cache, SKU Destination) · Chatbot (Guardian) · API bên ngoài. s238: bỏ Partner Tiers, Role Filters, Item Type theo kênh (DB trống/đã dùng cách khác); ngưỡng tồn kho chuyển sang tab Inventory.

// s190: bỏ hẳn subsystem "policy grid" (CATEGORIES/DEFAULT_POLICY/Decision/cyclePolicy/fullPolicy) —
// code thừa, chưa từng render (UI thật đã đơn giản hoá thành 2 info-box tĩnh bên dưới từ trước, khớp
// guardian.ts hiện tại: chỉ 1 ranh giới thật system_internal, còn lại "ai cũng như nhau"). Xem
// docs/session_summary.txt s190 phần audit dead-code.
export default function SettingsPage() {
  const { ready } = useRoleGuard(["admin", "creator"])   // role tươi từ DB (không dùng JWT stale)
  if (!ready) return null
  return <AnalyticsSettings />
}

function AnalyticsSettings() {
  // 4 tab thay cho 1 trang dài 7 khối; "API bên ngoài" chuyển từ trang Admin sang đây (s238).
  const [tab, setTab] = useState<"data" | "chat" | "api">("data")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [customRules, setCustomRules]   = useState<string>("")
  const [savedCustomRules, setSavedCustomRules] = useState<string>("")
  const dirtyCustomRules = customRules !== savedCustomRules
  const [db, setDb] = useState<any>(null)
  const [dbLoading, setDbLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [flushing, setFlushing] = useState(false)
  const [skuRules, setSkuRules] = useState<{ startsWith: string; codeLength: number; description: string }[]>([])
  const [savedSkuRules, setSavedSkuRules] = useState<string>("[]")
  const dirtySkuRules = JSON.stringify(skuRules) !== savedSkuRules
  const [countryCodes, setCountryCodes] = useState<{ code: string; country: string }[]>([])

  const notify = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000) }

  const syncTursoCosts = async () => {
    setSyncing(true)
    try {
      const r = await fetch("/api/admin/sync-turso-costs", { method: "POST" })
      const d = await r.json()
      notify(!!d.ok, d.ok ? ("Sync OK: " + d.synced + " dong (" + d.months + " thang)") : (d.error || "Sync that bai"))
    } catch (e) { notify(false, "Loi ket noi") } finally { setSyncing(false) }
  }

  const flushCache = async () => {
    setFlushing(true)
    try {
      const r = await fetch("/api/admin/flush-analytics-cache", { method: "POST" })
      const d = await r.json()
      notify(!!d.ok, d.ok ? `Đã xoá ${d.deleted} cache entries — lần tải tiếp sẽ lấy dữ liệu mới` : "Xoá cache thất bại")
    } catch { notify(false, "Lỗi kết nối") } finally { setFlushing(false) }
  }

  const checkDb = async () => {
    setDbLoading(true)
    try {
      const r = await fetch("/api/analytics/db-status")
      setDb(r.ok ? await r.json() : { error: "Không tải được tình trạng database" })
    } catch { setDb({ error: "Lỗi kết nối" }) } finally { setDbLoading(false) }
  }

  const fmtTime = (s?: string | null) => s ? new Date(s).toLocaleString("vi-VN") : "—"

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [skuRule, cc, crRes] = await Promise.all([
        fetch("/api/config/sku-destination-rule").then(r => r.ok ? r.json() : { rules: [] }).catch(() => ({ rules: [] })),
        fetch("/api/config/country-codes").then(r => r.ok ? r.json() : []),
        fetch("/api/config/chatbot-rules").then(r => r.ok ? r.json() : { rules: "" }).catch(() => ({ rules: "" })),
      ])
      const parsedSkuRules = skuRule?.rules || []
      setSkuRules(parsedSkuRules)
      setSavedSkuRules(JSON.stringify(parsedSkuRules))
      setCountryCodes(Array.isArray(cc) ? cc : [])
      const cr = crRes?.rules ?? ""
      setCustomRules(cr); setSavedCustomRules(cr)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { fetchAll() }, [])

  const savePost = async (key: string, url: string, body: any) => {
    setSaving(key)
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (res.ok) {
        // Reset dirty state sau khi lưu
        if (key === "sku-dest")      setSavedSkuRules(JSON.stringify(body.rules ?? body))
      }
      notify(res.ok, res.ok ? "Đã lưu" : "Lưu thất bại")
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center"><SettingsIcon className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cấu hình hệ thống</h1>
            <p className="text-slate-500 text-sm">Đối tác chiến lược · Chính sách truy cập chatbot · Lọc dòng BI theo role</p>
          </div>
        </div>
        <button onClick={fetchAll} className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm"><RefreshCw className={cn("w-4 h-4 text-slate-600", loading && "animate-spin")} /></button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200" role="tablist">
        {([["data", "Dữ liệu"], ["chat", "Chatbot"], ["api", "API bên ngoài"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn("px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors", tab === id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700")}>
            {label}
          </button>
        ))}
      </div>

      {msg && <div className={cn("px-4 py-3 rounded-xl text-sm font-medium", msg.ok ? "bg-emerald-50 border border-emerald-100 text-emerald-700" : "bg-rose-50 border border-rose-100 text-rose-700")}>{msg.text}</div>}

      {/* Database Status — kiểm tra nhanh kho dữ liệu còn cập nhật không */}
      {tab === "data" && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2"><Database className="w-5 h-5 text-brand-600" /><h2 className="font-bold text-slate-800">Tình trạng Database</h2></div>
          <span className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={flushCache} disabled={flushing} className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold hover:bg-amber-600 disabled:opacity-50" title="Xoá L2 Supabase cache — lần tải tiếp lấy dữ liệu mới từ gohub_dw">
              {flushing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{"Xoá Cache"}
            </button>
            <button onClick={syncTursoCosts} disabled={syncing} className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
              {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{"Sync Costs"}
            </button>
            <button onClick={checkDb} disabled={dbLoading} className="flex items-center gap-2 px-3 py-2 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 disabled:opacity-50">
              {dbLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{"Kiểm tra"}
            </button>
          </span>
        </div>
        {db && (
          <div className="p-6 text-sm space-y-5">
            {db.error ? <p className="text-rose-600">{db.error}</p> : (
              <>
                <p className="text-xs text-slate-400">Kiểm tra lúc {fmtTime(db.checkedAt)} · Bấm Kiểm tra lại để refresh schema cache dim_customer</p>

                {/* Fact tables */}
                <div>
                  <p className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider mb-2">Fact Tables (gohub_dw)</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {(db.warehouse || []).map((w: any) => (
                      <div key={w.table} className="border border-slate-100 rounded-lg p-3 bg-slate-50/40">
                        <p className="font-bold text-slate-700 text-xs truncate" title={w.table}>{w.table}</p>
                        {w.error ? <p className="text-rose-500 text-xs mt-1">{w.error}</p> : (
                          <>
                            <p className="text-slate-500 text-xs mt-1">{w.rows.toLocaleString("vi-VN")} dòng</p>
                            <p className="text-slate-500 text-xs">Mới nhất: <span className="font-medium text-slate-700">{w.latest ? w.latest.slice(0, 10) : "—"}</span></p>
                            {w.lastLoaded && <p className="text-slate-400 text-[12px]">ETL: {fmtTime(w.lastLoaded)}</p>}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dim + reference tables */}
                {db.dims && db.dims.length > 0 && (
                  <div>
                    <p className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider mb-2">Dim &amp; Reference Tables (gohub_dw)</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {(db.dims as any[]).map((d: any) => (
                        <div key={d.table} className={cn("border rounded-lg p-3", d.error ? "border-rose-200 bg-rose-50/30" : d.rows === 0 ? "border-amber-200 bg-amber-50/30" : "border-slate-100 bg-slate-50/40")}>
                          <p className="font-bold text-slate-700 text-xs truncate" title={d.table}>{d.table}</p>
                          {d.error ? (
                            <p className="text-rose-500 text-xs mt-1">{d.error}</p>
                          ) : (
                            <>
                              <p className={cn("text-xs mt-1 font-medium", d.rows === 0 ? "text-amber-600" : "text-slate-500")}>
                                {d.rows.toLocaleString("vi-VN")} dòng
                              </p>
                              {d.columns && d.columns.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-0.5">
                                  {(d.columns as { name: string; type: string }[]).slice(0, 6).map((col) => (
                                    <span key={col.name} className="text-[11px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded font-mono" title={col.type}>
                                      {col.name}
                                    </span>
                                  ))}
                                  {d.columns.length > 6 && (
                                    <span className="text-[11px] text-slate-400">+{d.columns.length - 6}</span>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Supabase products */}
                {db.products && (
                  <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/40">
                    <p className="font-bold text-slate-700 text-xs">Sản phẩm (Supabase sku_catalog)</p>
                    {db.products.error ? <p className="text-rose-500 text-xs mt-1">{db.products.error}</p> : (
                      <p className="text-slate-500 text-xs mt-1">{(db.products.rows || 0).toLocaleString("vi-VN")} SKU · sync cuối: <span className="font-medium text-slate-700">{fmtTime(db.products.lastSynced)}</span></p>
                    )}
                  </div>
                )}

                {/* Query cache */}
                {db.cache != null && (
                  <div className="border border-amber-100 rounded-lg p-3 bg-amber-50/40">
                    <p className="font-bold text-amber-700 text-xs">Query Cache (Supabase L2 · TTL 10 phút)</p>
                    <p className="text-slate-500 text-xs mt-1">
                      <span className="font-medium text-slate-700">{db.cache.entries ?? 0}</span> entries đang cache
                      {db.cache.oldest && <> · cũ nhất: <span className="font-medium text-slate-700">{fmtTime(db.cache.oldest)}</span></>}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {!db && <div className="px-6 py-4 text-xs text-slate-400">Bấm "Kiểm tra" để xem toàn bộ kho dữ liệu gohub_dw (fact + dim + reference) và trạng thái sync.</div>}
      </div>
      )}

      {/* Guardian — simplified */}
      {tab === "chat" && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-600" />
          <h2 className="font-bold text-slate-800">Chatbot Guardian</h2>
        </div>
        <div className="p-6 space-y-4">
          {/* Hard block info */}
          <div className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl p-4">
            <Shield className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-rose-700">Nội bộ hệ thống — chỉ admin/creator (s190)</p>
              <p className="text-[12px] text-rose-600 mt-0.5">Câu hỏi về code / cách build hệ thống / credential / quy trình kỹ thuật nội bộ → CHỈ admin/creator được hỏi (qua web/Lark cá nhân đã xác thực); vai trò khác → chatbot từ chối lịch sự, không tiết lộ. Riêng nhắn qua Lark group luôn từ chối, kể cả admin/creator (không xác thực được ai đang gõ). Ranh giới này CỐ ĐỊNH trong code, không cấu hình được qua trang này.</p>
            </div>
          </div>
          {/* Open policy info */}
          <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <Shield className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-700">Mọi dữ liệu kinh doanh đều mở, ai cũng như nhau (mặc định)</p>
              <p className="text-[12px] text-emerald-600 mt-0.5">Revenue, CM1, COGS, HR, KH, KB… — tất cả vai trò đều được hỏi ngang nhau, không phân biệt. Dùng Role Filters bên dưới nếu muốn giới hạn SQL theo role cụ thể.</p>
            </div>
          </div>
          {/* Custom rules */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Hướng dẫn tùy chỉnh cho Chatbot (tùy chọn)</label>
              <button onClick={() => savePost("custom-rules", "/api/config/chatbot-rules", { rules: customRules })} disabled={saving === "custom-rules" || !dirtyCustomRules} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-all disabled:opacity-50", dirtyCustomRules ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed")}>
                {saving === "custom-rules" ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Lưu
              </button>
            </div>
            <textarea
              value={customRules}
              onChange={e => setCustomRules(e.target.value)}
              rows={4}
              placeholder={"Nhập hướng dẫn bổ sung cho chatbot (tiếng Việt hoặc tiếng Anh).\nVí dụ: \"Staff chỉ được xem doanh thu của kênh họ phụ trách.\"\nĐể trống = chatbot chạy theo mặc định."}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none resize-none"
            />
            <p className="text-[12px] text-slate-400 mt-1.5">Text này được inject vào system prompt của chatbot BI — viết bằng ngôn ngữ tự nhiên, chatbot sẽ hiểu và áp dụng.</p>
          </div>
        </div>
      </div>
      )}

      {/* SKU Destination Definition */}
      {tab === "data" && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2"><MapPin className="w-5 h-5 text-brand-600" /><h2 className="font-bold text-slate-800">SKU Destination Definition</h2></div>
          <button onClick={() => savePost("sku-dest", "/api/config/sku-destination-rule", { rules: skuRules })} disabled={saving === "sku-dest" || !dirtySkuRules} className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50", dirtySkuRules ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-slate-200 text-slate-400 cursor-not-allowed")}>
            {saving === "sku-dest" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Lưu
          </button>
        </div>
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs text-slate-500 font-medium">Quy tắc extract destination code từ SKU (áp theo thứ tự, khớp đầu tiên được dùng):</p>
            {skuRules.map((rule, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-2 bg-slate-50/40">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-5">{i + 1}.</span>
                  <input value={rule.startsWith} onChange={e => setSkuRules(prev => prev.map((r, j) => j === i ? { ...r, startsWith: e.target.value } : r))} placeholder="SKU startsWith (vd: GH)" className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
                  <input type="number" value={rule.codeLength} onChange={e => setSkuRules(prev => prev.map((r, j) => j === i ? { ...r, codeLength: parseInt(e.target.value) || 0 } : r))} placeholder="Độ dài" className="w-20 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
                  <button onClick={() => setSkuRules(prev => prev.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600"><X className="w-4 h-4" /></button>
                </div>
                <input value={rule.description} onChange={e => setSkuRules(prev => prev.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} placeholder="Mô tả quy tắc" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
            ))}
            <button onClick={() => setSkuRules(prev => [...prev, { startsWith: "", codeLength: 3, description: "" }])} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200">
              <Plus className="w-3.5 h-3.5" />Thêm quy tắc
            </button>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium mb-3">Bảng Country Codes ({countryCodes.length} quốc gia):</p>
            <div className="border border-slate-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0"><tr><th className="px-3 py-2 text-left font-bold text-slate-500">Code</th><th className="px-3 py-2 text-left font-bold text-slate-500">Country</th></tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {countryCodes.slice(0, 100).map(c => (
                    <tr key={c.code} className="hover:bg-slate-50/50">
                      <td className="px-3 py-1.5 font-mono text-slate-600">{c.code}</td>
                      <td className="px-3 py-1.5 text-slate-700">{c.country}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <p className="px-6 py-3 text-xs text-slate-400 border-t border-slate-100">⚠️ Lưu ý: destination hiện được tính theo <b>HỌ SKU</b> trong code (<code>getDestinationSQL</code>: digit→ký tự 3-5, E→2-4, 3-letter→1-3) rồi map tên nước qua bảng Country Codes. Quy tắc startsWith + codeLength ở đây là <b>tham chiếu/cấu hình dự phòng</b>, không trực tiếp điều khiển báo cáo hiện tại.</p>
      </div>
      )}

      {tab === "api" && <ApiKeysPanel onNotify={(type, text) => notify(type === "success", text)} />}
    </div>
  )
}
