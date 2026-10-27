"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Loader2, X } from "lucide-react"
import { api, jsonInit } from "../argon-types"
import type { InboxItem } from "@/lib/assistant/inbox-pure"

// Thẻ XÁC NHẬN ngay trong khung chat cho người ít rành công nghệ: thay cho tab "Việc cần duyệt". Chỉ các việc của CHÍNH họ: đề xuất ghi nhớ, thay đổi thông tin (sự việc) và việc Gấu Prime xin làm (tạo task, đặt lịch…).
// Hai nút lớn "Đồng ý" / "Không" gọi đúng endpoint của Việc cần duyệt. Làm mới khi mở trang và sau mỗi lượt trả lời xong.
const KINDS = new Set(["memory_proposal", "fact_review", "gp_action"])
const strip = (t: string) => t.replace(/^(Nhớ|Thay đổi sự việc|Sự việc|Giá|Hạn)\s*:\s*/i, "")

function ask(it: InboxItem): string {
  if (it.kind === "gp_action") return `Em xin phép làm việc này: ${it.title}${it.detail ? ` (${it.detail})` : ""}. Anh/chị đồng ý chứ?`
  return it.kind === "memory_proposal"
    ? `Em có nên ghi nhớ điều này không: “${strip(it.title)}”?`
    : `Em thấy thông tin này có thay đổi: “${strip(it.title)}”. Anh/chị xác nhận giúp em nhé?`
}

export function InlineConfirm({ refreshKey, onError }: { refreshKey: unknown; onError: (m: string) => void }) {
  const [items, setItems] = useState<InboxItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => api<{ items: InboxItem[] }>("/api/creator/assistant/inbox").then(r => setItems((r.items ?? []).filter(i => KINDS.has(i.kind)).slice(0, 3))).catch(() => undefined), [])
  useEffect(() => { void load() }, [load, refreshKey])

  async function decide(it: InboxItem, yes: boolean) {
    setBusy(it.key)
    try {
      if (it.kind === "gp_action") { const r = await api<{ ok?: boolean; error?: string }>("/api/creator-ai/approve", jsonInit("POST", { id: it.id, approve: yes })); if (r.ok === false && r.error) onError(r.error) }
      else if (it.kind === "memory_proposal") await api("/api/creator/assistant/memory-proposals", jsonInit("POST", { id: it.id, action: yes ? "approve" : "reject" }))
      else await api("/api/creator/argon/facts", jsonInit("PATCH", yes ? { id: it.id, confirm: true } : { id: it.id, status: "rejected" }))
      setItems(list => list.filter(x => x.key !== it.key))
    } catch (e) { onError((e as Error).message) } finally { setBusy(null) }
  }

  if (!items.length) return null
  return (
    <div className="mb-2 space-y-2" aria-label="Cần xác nhận">
      {items.map(it => (
        <div key={it.key} className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-3">
          <p className="text-[14px] leading-snug text-gray-900 dark:text-slate-100">{ask(it)}</p>
          <div className="mt-2.5 flex gap-2">
            <button type="button" disabled={busy === it.key} onClick={() => void decide(it, true)} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-[14px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
              {busy === it.key ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />}Đồng ý
            </button>
            <button type="button" disabled={busy === it.key} onClick={() => void decide(it, false)} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-[14px] font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-60">
              <X size={16} />Không
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
