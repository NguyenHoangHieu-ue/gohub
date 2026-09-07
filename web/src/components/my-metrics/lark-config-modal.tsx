"use client"

// Tách từ my-metrics/page.tsx (s183 Phase 5 tiếp — tách cơ học, giữ nguyên y hệt bản gốc).
import { useState, useEffect } from "react"
import { Settings, X, Sparkles, Clock } from "lucide-react"
import { ScanResultBox } from "@/components/my-metrics/scan-result-box"
import type { LarkScanResult } from "@/lib/my-metrics-types"

// ─── Lark scan config modal (admin/creator) ───────────────────────────────────
export function LarkConfigModal({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState({ enabled: false, days_back: 3 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<LarkScanResult | null>(null)
  const [scanErr, setScanErr] = useState<string | null>(null)

  const [historyChatId, setHistoryChatId] = useState("")
  const [historyDays, setHistoryDays] = useState(30)
  const [historyScanning, setHistoryScanning] = useState(false)
  const [historyResult, setHistoryResult] = useState<LarkScanResult | null>(null)
  const [historyErr, setHistoryErr] = useState<string | null>(null)
  const [botGroups, setBotGroups] = useState<{ chat_id: string; name: string }[] | null>(null)

  useEffect(() => {
    fetch("/api/analytics/my-metrics/lark-config").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setCfg({ enabled: d.enabled ?? false, days_back: d.days_back ?? 3 })
      setLoading(false)
    }).catch(() => setLoading(false))
    fetch("/api/analytics/my-metrics/lark-config/groups").then(r => r.ok ? r.json() : null).then(d => {
      setBotGroups(d?.groups ?? [])
    }).catch(() => setBotGroups([]))
  }, [])

  const save = async () => {
    setSaving(true); setErr(null)
    const r = await fetch("/api/analytics/my-metrics/lark-config", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg),
    })
    setSaving(false)
    if (!r.ok) { const j = await r.json(); setErr(j.error ?? "Lỗi lưu"); return }
    onClose()
  }

  const scanNow = async () => {
    setScanning(true); setScanErr(null); setScanResult(null)
    const r = await fetch("/api/analytics/my-metrics/lark-config/scan-now", { method: "POST" })
    const j = await r.json()
    setScanning(false)
    if (!r.ok) { setScanErr(j.error ?? "Lỗi quét"); return }
    setScanResult(j)
  }

  const scanHistory = async () => {
    if (!historyChatId.trim()) { setHistoryErr("Nhập chat_id trước"); return }
    setHistoryScanning(true); setHistoryErr(null); setHistoryResult(null)
    const r = await fetch("/api/analytics/my-metrics/lark-config/scan-history", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: historyChatId.trim(), days_back: historyDays }),
    })
    const j = await r.json()
    setHistoryScanning(false)
    if (!r.ok) { setHistoryErr(j.error ?? "Lỗi quét"); return }
    setHistoryResult(j)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5"><Settings className="w-4 h-4" /> Cấu hình Bé Gấu quét Lark</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        {loading ? <p className="text-xs text-slate-400">Đang tải…</p> : (
          <>
            {err && <p className="text-[11px] text-red-600 font-bold">{err}</p>}
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg(p => ({ ...p, enabled: e.target.checked }))} />
              Bật quét tự động
            </label>
            <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5 leading-relaxed">
              Bot bắt real-time mọi tin nhắn <strong>bạn tự gửi HOẶC được @mention</strong>, ở <strong>bất kỳ
              group nào bot có mặt</strong> — không cần chọn 1 group cố định nữa. 2 điều kiện cần có sẵn:
              (1) đã <strong>Kết nối Lark cá nhân</strong> ở Creator Settings, (2) bot đã được <strong>add vào
              các group</strong> liên quan (Sales/PIC hỏi sản phẩm, hỏi giá NCC…) — Lark chỉ gửi được tin của
              group mà bot là thành viên.
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase">Quét ngược N ngày</label>
              <input type="number" min={1} value={cfg.days_back} onChange={e => setCfg(p => ({ ...p, days_back: parseInt(e.target.value) || 3 }))}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="border-t border-slate-100 pt-3">
              <button onClick={scanNow} disabled={scanning}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50">
                <Sparkles className="w-3.5 h-3.5" /> {scanning ? "Đang quét (có thể mất 30-60s)…" : "Quét ngay để test"}
              </button>
              {scanErr && <p className="text-[11px] text-red-600 font-bold mt-2">{scanErr}</p>}
              {scanResult && <ScanResultBox result={scanResult} />}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">Quét lịch sử 1 lần (group cũ)</p>
              <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                Real-time chỉ thấy tin TỪ LÚC bot bắt đầu sống — thread/mention cũ trước đó không tự vào được.
                Chọn 1 group để quét ngược 1 lần, cùng tiêu chí "chỉ tin liên quan Hiếu" như real-time.
              </p>
              <div className="flex gap-1.5">
                {botGroups && botGroups.length > 0 ? (
                  <select value={historyChatId} onChange={e => setHistoryChatId(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-brand-500">
                    <option value="">— chọn group —</option>
                    {botGroups.map(g => <option key={g.chat_id} value={g.chat_id}>{g.name}</option>)}
                  </select>
                ) : (
                  <input type="text" placeholder={botGroups === null ? "Đang tải danh sách group…" : "Không tải được — nhập chat_id (oc_...)"}
                    value={historyChatId} onChange={e => setHistoryChatId(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-brand-500" />
                )}
                <input type="number" min={1} max={120} value={historyDays} onChange={e => setHistoryDays(parseInt(e.target.value) || 30)}
                  className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-brand-500" title="Số ngày ngược" />
              </div>
              <button onClick={scanHistory} disabled={historyScanning}
                className="w-full mt-1.5 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50">
                <Clock className="w-3.5 h-3.5" /> {historyScanning ? "Đang quét lịch sử (có thể mất 1-2 phút)…" : "Quét lịch sử"}
              </button>
              {historyErr && <p className="text-[11px] text-red-600 font-bold mt-2">{historyErr}</p>}
              {historyResult && <ScanResultBox result={historyResult} />}
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">Hủy</button>
              <button onClick={save} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
