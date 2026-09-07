"use client"

import React, { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Plug, RefreshCw, Copy, CheckCircle, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

export default function BridgePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [freshRole, setFreshRole] = useState<string | null>(null)

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/user/me").then(r => r.ok ? r.json() : null).then(d => {
      setFreshRole(d?.role ?? session?.user?.role ?? "staff")
    }).catch(() => setFreshRole(session?.user?.role ?? "staff"))
  }, [status, session])

  useEffect(() => {
    if (freshRole && freshRole !== "creator") router.push("/chatbot")
  }, [freshRole, router])

  if (status !== "authenticated" || !freshRole || freshRole !== "creator") return null
  return <BridgeSettings />
}

function BridgeSettings() {
  const [token, setToken]         = useState<string | null>(null)
  const [lastSeen, setLastSeen]   = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied]       = useState(false)

  const load = async () => {
    try {
      const r = await fetch("/api/creator-ai/bridge/token")
      const d = await r.json()
      setToken(d.token ?? null)
      setLastSeen(d.last_seen ?? null)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const regenerate = async () => {
    setGenerating(true)
    try {
      const r = await fetch("/api/creator-ai/bridge/token", { method: "POST" })
      const d = await r.json()
      if (r.ok) setToken(d.token)
    } finally { setGenerating(false) }
  }

  const copyToken = async () => {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const connected = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) < 60_000 : false

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen max-w-[900px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center shadow-sm">
          <Plug className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bridge — Extension browser cá nhân</h1>
          <p className="text-slate-500 text-sm">Gấu Pro đọc/thao tác trên chính tab Chrome đang mở của Hiếu</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Token pairing</h2>
          {!loading && (
            <span className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg",
              connected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
              <span className={cn("w-1.5 h-1.5 rounded-full", connected ? "bg-emerald-500" : "bg-slate-400")} />
              {connected ? "Extension đã kết nối" : "Chưa thấy extension poll gần đây"}
            </span>
          )}
        </div>
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="text-xs text-slate-400">Đang tải...</div>
          ) : (
            <>
              {!token ? (
                <div className="text-sm text-slate-500">Chưa có token nào — bấm nút bên dưới để tạo.</div>
              ) : (
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2.5 bg-slate-100 rounded-xl text-xs font-mono break-all">{token}</code>
                  <button onClick={copyToken} className="shrink-0 p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl border border-slate-200">
                    {copied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
              <button onClick={regenerate} disabled={generating}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-violet-600 text-white rounded-xl hover:bg-violet-500 disabled:opacity-50">
                {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {token ? "Tạo token mới (extension cũ sẽ mất kết nối)" : "Tạo token"}
              </button>
              {lastSeen && <p className="text-xs text-slate-400">Lần cuối extension poll: {new Date(lastSeen).toLocaleString("vi-VN")}</p>}
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-amber-100 bg-amber-50/50 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <h2 className="font-bold text-slate-800 text-sm">Cách cài Extension</h2>
        </div>
        <div className="p-6 text-sm text-slate-600 space-y-2 leading-relaxed">
          <p>1. Mở Chrome → <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">chrome://extensions</code> → bật <strong>Developer mode</strong> (góc trên phải).</p>
          <p>2. Bấm <strong>Load unpacked</strong> → chọn thư mục <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">browser-extension/</code> trong repo.</p>
          <p>3. Bấm icon extension trên thanh Chrome → dán token phía trên + Server URL (domain đang dùng, vd <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">https://stg-intel-v2.gohub.cloud</code>) → bật toggle <strong>Bridge ON</strong>.</p>
          <p>4. Vào Gấu Pro, thử hỏi "list các tab đang mở" để xác nhận kết nối.</p>
          <p className="text-amber-700 pt-1">⚠️ click/fill/navigate sẽ hiện thông báo xin Duyệt trên Chrome trước khi thực thi — đây là session đăng nhập thật của Hiếu, luôn xem kỹ trước khi bấm Duyệt.</p>
        </div>
      </div>
    </div>
  )
}
