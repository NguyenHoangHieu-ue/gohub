"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Check, Copy, Plus, Trash2 } from "lucide-react"

// Tách khỏi page.tsx (s196+21, tách admin/page.tsx 2120 dòng — cùng nguyên tắc Phase 5: chỉ move
// nguyên khung JSX/logic, KHÔNG đổi hành vi). Nạp qua next/dynamic ở page.tsx.

interface ExternalApiKey {
  id: string
  label: string
  created_by: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export default function ApiKeysTab({ onNotify }: {
  onNotify: (type: "success" | "error", text: string) => void
}) {
  const [keys, setKeys]         = useState<ExternalApiKey[]>([])
  const [loading, setLoading]   = useState(true)
  const [label, setLabel]       = useState("")
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey]     = useState<string | null>(null)
  const [copied, setCopied]     = useState(false)

  const load = () => {
    fetch("/api/admin/external-api-keys")
      .then(r => r.json())
      .then(d => { setKeys(d.keys ?? []); setLoading(false) })
      .catch(() => { onNotify("error", "Hiếu đang fix, vui lòng đợi"); setLoading(false) })
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!label.trim()) { onNotify("error", "Nhập label để nhận biết key (vd: 'Manager - CRM tool')"); return }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/external-api-keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { onNotify("error", data.error || "Tạo key thất bại"); return }
      setNewKey(data.key)
      setLabel("")
      load()
    } finally { setCreating(false) }
  }

  const revoke = async (id: string, keyLabel: string) => {
    const res = await fetch(`/api/admin/external-api-keys?id=${id}`, { method: "DELETE" })
    if (res.ok) { onNotify("success", `Đã thu hồi key "${keyLabel}"`); load() }
    else onNotify("error", "Thu hồi thất bại")
  }

  const copyKey = async () => {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 space-y-4">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-slate-100">API sản phẩm cho hệ thống bên ngoài</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Cấp key để hệ thống khác đọc <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">/api/external/products</code> +{" "}
            <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">/api/external/skus</code> (bao gồm giá vốn/COGS) — server-to-server, không dùng session.
          </p>
        </div>

        {newKey && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 text-sm font-bold">
              <AlertTriangle size={15} /> Copy ngay — key chỉ hiện 1 lần, không xem lại được
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-white rounded-lg text-xs font-mono break-all border border-amber-200">{newKey}</code>
              <button onClick={copyKey} className="shrink-0 p-2 text-amber-700 hover:bg-amber-100 rounded-lg border border-amber-200">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <button onClick={() => setNewKey(null)} className="text-xs text-amber-700 hover:underline">Đã copy, đóng</button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Label nhận biết key, vd: Manager - CRM tool"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <button onClick={create} disabled={creating || !label.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-brand-600 text-white rounded-xl hover:bg-brand-500 disabled:opacity-40 transition-colors">
            <Plus size={14} />{creating ? "Đang tạo…" : "Tạo key"}
          </button>
        </div>

        {loading ? (
          <div className="text-xs text-gray-400 py-2">Đang tải...</div>
        ) : keys.length === 0 ? (
          <div className="text-xs text-gray-400 py-4 text-center">Chưa có key nào.</div>
        ) : (
          <div className="space-y-2">
            {keys.map(k => (
              <div key={k.id} className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-slate-700/50 rounded-xl border border-gray-100 dark:border-slate-700">
                <div className="text-sm">
                  <span className="font-medium text-gray-800 dark:text-slate-200">{k.label}</span>
                  <span className="ml-2 text-xs text-gray-400">bởi @{k.created_by} · {new Date(k.created_at).toLocaleDateString("vi-VN")}</span>
                  {k.last_used_at && <span className="ml-2 text-xs text-gray-400">· dùng lần cuối {new Date(k.last_used_at).toLocaleString("vi-VN")}</span>}
                  {k.revoked_at && <span className="ml-2 text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded">Đã thu hồi</span>}
                </div>
                {!k.revoked_at && (
                  <button onClick={() => revoke(k.id, k.label)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
