"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Laptop, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { DataTable } from "@/components/dashboard-kit"
import { formatDateTime } from "@/lib/analytics-formatters"

// Thiết bị đã kết nối + nhật ký lệnh Bridge — truy vết an toàn (s202): biết máy/IP nào đã chạy lệnh nào.

interface Device {
  id: number; username: string; device_id: string; os?: string; arch?: string; browser_version?: string
  ext_version?: string; timezone?: string; chrome_email?: string; first_ip?: string; last_ip?: string
  first_seen: string; last_seen: string; revoked: boolean; user_agent?: string
}
interface BridgeCommand {
  id: string; owner_username: string; action: string; payload: any; status: string; error?: string
  device_id?: string; claimed_ip?: string; created_at: string; completed_at?: string
}

const shortId = (id?: string) => (id ? id.slice(0, 8) : "—")

function describePayload(action: string, p: any): string {
  if (!p) return ""
  if (action === "navigate") return String(p.url ?? "").slice(0, 120)
  if (action === "click") return `tab ${p.tab_id} · ${String(p.selector ?? "").slice(0, 80)}`
  if (action === "fill") return `tab ${p.tab_id} · ${String(p.selector ?? "").slice(0, 60)} ← "${String(p.value ?? "").slice(0, 40)}"`
  if (p.tab_id) return `tab ${p.tab_id}`
  return ""
}

export function BridgeDevices({ isCreator }: { isCreator: boolean }) {
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [commands, setCommands] = useState<BridgeCommand[]>([])
  const [view, setView] = useState<"mine" | "all">("mine")
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const r = await fetch(`/api/creator-ai/bridge/devices${isCreator && view === "all" ? "?all=1" : ""}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error || "Không tải được"); return }
      setDevices(d.devices ?? [])
      setCommands(d.commands ?? [])
    } catch (e: any) { setError(e?.message || "Không tải được") }
  }, [isCreator, view])
  useEffect(() => { load() }, [load])

  const toggleRevoke = async (dev: Device) => {
    setBusyId(dev.id)
    try {
      await fetch("/api/creator-ai/bridge/devices", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dev.id, revoked: !dev.revoked }),
      })
      await load()
    } finally { setBusyId(null) }
  }

  const showUser = isCreator && view === "all"

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Laptop className="w-4 h-4 text-violet-600" />
          <h2 className="font-bold text-slate-800">Thiết bị đã kết nối</h2>
        </div>
        {isCreator && (
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {([["mine", "Của tôi"], ["all", "Toàn bộ user + nhật ký lệnh"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setView(k)}
                className={cn("px-3 py-1 text-xs font-semibold rounded-md", view === k ? "bg-white text-violet-700 shadow-sm" : "text-slate-500")}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="p-6 space-y-6">
        <p className="flex items-start gap-2 text-xs text-slate-500 leading-relaxed">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          Extension ghi nhận mã máy, hệ điều hành, trình duyệt, email tài khoản Chrome, IP và nhật ký lệnh Gấu Pro để truy vết khi có sự cố an toàn.
          Chrome không cho extension đọc tên máy tính.
        </p>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        {!devices && !error && <p className="text-xs text-slate-400">Đang tải...</p>}
        {devices && devices.length === 0 && (
          <p className="text-xs text-slate-400">Chưa có thiết bị nào. Cập nhật extension lên bản 1.1.0 (Reload trong chrome://extensions) rồi bật Bridge.</p>
        )}
        {devices && devices.length > 0 && (
          <DataTable<Device>
            rows={devices}
            rowKey={r => String(r.id)}
            pageSize={10}
            columns={[
              ...(showUser ? [{ key: "username", label: "User", render: (r: Device) => r.username }] : []),
              { key: "device", label: "Thiết bị", render: (r: Device) => (
                <span title={r.user_agent}>
                  <span className="font-mono text-[11px] text-slate-500">{shortId(r.device_id)}</span> · {r.os ?? "?"}{r.arch ? `/${r.arch}` : ""}
                  <span className="block text-[11px] text-slate-400">Chrome {r.browser_version ?? "?"} · ext {r.ext_version ?? "cũ"}</span>
                </span>
              ) },
              { key: "chrome_email", label: "Tài khoản Chrome", render: (r: Device) => r.chrome_email || "—" },
              { key: "last_ip", label: "IP", render: (r: Device) => (
                <span>{r.last_ip ?? "—"}{r.first_ip && r.first_ip !== r.last_ip ? <span className="block text-[11px] text-slate-400">đầu: {r.first_ip}</span> : null}</span>
              ) },
              { key: "first_seen", label: "Lần đầu", render: (r: Device) => formatDateTime(r.first_seen) },
              { key: "last_seen", label: "Lần cuối", render: (r: Device) => formatDateTime(r.last_seen) },
              { key: "revoked", label: "", align: "center" as const, render: (r: Device) => (
                <button onClick={() => toggleRevoke(r)} disabled={busyId === r.id}
                  className={cn("px-2.5 py-1 text-[11px] font-semibold rounded-lg border disabled:opacity-50",
                    r.revoked ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-rose-200 text-rose-600 hover:bg-rose-50")}>
                  {r.revoked ? "Khôi phục" : "Thu hồi"}
                </button>
              ) },
            ]}
          />
        )}

        {showUser && commands.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-2">Nhật ký lệnh Bridge (gần nhất)</h3>
            <DataTable<BridgeCommand>
              rows={commands}
              rowKey={r => r.id}
              pageSize={15}
              searchBy={r => `${r.owner_username} ${r.action} ${r.claimed_ip ?? ""} ${describePayload(r.action, r.payload)}`}
              columns={[
                { key: "created_at", label: "Giờ", render: r => formatDateTime(r.created_at) },
                { key: "owner_username", label: "User", render: r => r.owner_username },
                { key: "action", label: "Lệnh", render: r => (
                  <span>{r.action}<span className="block text-[11px] text-slate-400 max-w-[360px] truncate">{describePayload(r.action, r.payload)}</span></span>
                ) },
                { key: "device_id", label: "Thiết bị / IP", render: r => (
                  r.device_id
                    ? <span><span className="font-mono text-[11px]">{shortId(r.device_id)}</span> · {r.claimed_ip ?? "—"}</span>
                    : <span className="text-slate-300">chưa nhận</span>
                ) },
                { key: "status", label: "Trạng thái", render: r => (
                  <span className={cn("text-[11px] font-semibold", r.status === "done" ? "text-emerald-600" : r.status === "error" ? "text-rose-600" : "text-slate-500")} title={r.error}>{r.status}</span>
                ) },
              ]}
            />
          </div>
        )}
      </div>
    </div>
  )
}
