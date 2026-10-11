"use client"

import { useCallback, useEffect, useState } from "react"
import { Pin, Trash2, X, Loader2, Download } from "lucide-react"

// Panel "Trí nhớ" (G3 + P2): người dùng tự xem/sửa/ghim/xoá điều trợ lý nhớ về mình (kể cả mục tự rút), xuất file, xoá tất cả, tắt/bật trí nhớ.
// Dùng chung cho Gấu Pro (/api/creator-ai/memory, dạng dropdown) và Bé Gấu (/api/chat/memory, dạng cửa sổ giữa màn hình).
interface Mem { id: number; kind: string; content: string; pinned: boolean; source: string | null; updated_at: string }
const KIND_LABEL: Record<string, string> = {
  profile: "Hồ sơ", preference: "Sở thích", project: "Dự án", person: "Người", decision: "Quyết định", other: "Khác",
}

export function MemoryPanel({ onClose, api = "/api/creator-ai/memory", floating = false }: { onClose: () => void; api?: string; floating?: boolean }) {
  const [rows, setRows] = useState<Mem[] | null>(null)
  const [err, setErr] = useState("")
  const [off, setOff] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState("")
  const [newText, setNewText] = useState("")
  const [busy, setBusy] = useState(false)
  const [persona, setPersona] = useState("")
  const [goals, setGoals] = useState("")
  const [profileSaved, setProfileSaved] = useState(false)

  const load = useCallback(async () => {
    const d = await fetch(api).then(r => r.json()).catch(e => ({ error: e.message }))
    setRows(d.memories ?? []); setOff(!!d.off)
    setPersona(d.profile?.persona ?? ""); setGoals(d.profile?.goals ?? "")
    setErr(d.error ?? (d.enabled === false ? "Trí nhớ cá nhân chưa bật cho tài khoản này." : ""))
  }, [api])
  useEffect(() => { load() }, [load])

  const act = async (body: Record<string, unknown>) => {
    setBusy(true)
    const d = await fetch(api, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).catch(e => ({ error: e.message }))
    setBusy(false)
    if (d.error) setErr(d.error)
    await load()
  }

  const saveProfile = async () => {
    await act({ action: "profile", persona, goals })
    setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2000)
  }

  const erase = async () => {
    if (!window.confirm("Xoá HẲN toàn bộ trí nhớ và tóm tắt hội thoại đã lưu về bạn? Không khôi phục được (nội dung các cuộc chat vẫn giữ).")) return
    await act({ action: "erase" })
  }

  const box = floating
    ? "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(520px,92vw)] max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl z-[70] text-xs"
    : "absolute right-0 top-full mt-1 w-[440px] max-h-[70vh] overflow-y-auto bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg z-50 text-xs"

  return (
    <div className={box}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Trí nhớ {rows ? `(${rows.length})` : ""}</span>
        <div className="flex items-center gap-1">
          {busy && <Loader2 size={12} className="animate-spin text-gray-400" />}
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={12} /></button>
        </div>
      </div>
      {err && <div className="px-3 py-2 text-amber-600">{err}</div>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-b border-gray-100 dark:border-slate-800 text-gray-500">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={off} disabled={busy} onChange={e => act({ action: "off", off: e.target.checked })} />
          Tắt trí nhớ (không nhớ, không dùng điều đã nhớ)
        </label>
        <a href={`${api}?export=1`} className="ml-auto flex items-center gap-1 hover:text-violet-600"><Download size={11} /> Xuất</a>
        <button onClick={erase} disabled={busy} className="hover:text-rose-500">Xoá tất cả</button>
      </div>
      <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-800 space-y-1.5">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Hồ sơ trợ lý của bạn</div>
        <textarea value={persona} onChange={e => setPersona(e.target.value.slice(0, 800))} rows={2}
          placeholder="Bạn muốn trợ lý làm việc thế nào? (vd: gọi mình là Minh, trả lời ngắn, kết luận trước, số liệu để trong bảng)"
          className="w-full px-2 py-1 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent" />
        <textarea value={goals} onChange={e => setGoals(e.target.value.slice(0, 800))} rows={2}
          placeholder="Mục tiêu / việc bạn đang theo (vd: Q4 tập trung khách B2B Châu Âu, theo dõi %Datapool)"
          className="w-full px-2 py-1 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent" />
        <div className="flex items-center gap-2">
          <button disabled={busy} onClick={saveProfile} className="px-2.5 py-1 rounded-md bg-violet-600 text-white disabled:opacity-40">Lưu hồ sơ</button>
          {profileSaved && <span className="text-emerald-600">Đã lưu</span>}
          <span className="ml-auto text-[10px] text-gray-400">Chỉ chỉnh cách làm việc — không mở thêm quyền.</span>
        </div>
      </div>
      <div className="flex gap-2 px-3 py-2 border-b border-gray-100 dark:border-slate-800">
        <input value={newText} onChange={e => setNewText(e.target.value)} placeholder="Thêm điều nên nhớ..."
          className="flex-1 px-2 py-1 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent" />
        <button disabled={!newText.trim() || busy} onClick={async () => { await act({ action: "save", content: newText.trim() }); setNewText("") }}
          className="px-2.5 py-1 rounded-md bg-violet-600 text-white disabled:opacity-40">Thêm</button>
      </div>
      {rows === null ? <div className="p-4 text-center text-gray-400">Đang tải...</div>
        : rows.length === 0 ? <div className="p-4 text-center text-gray-400">Chưa nhớ gì.</div> : (
        <div className="divide-y divide-gray-100 dark:divide-slate-800">
          {rows.map(m => (
            <div key={m.id} className="px-3 py-2">
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <span>{KIND_LABEL[m.kind] ?? m.kind}</span>
                {m.source?.startsWith("auto") && <span className="text-violet-500">Tự nhớ từ chat</span>}
                <span className="ml-auto">{new Date(m.updated_at).toLocaleDateString("vi-VN")}</span>
                <button title={m.pinned ? "Bỏ ghim" : "Ghim (luôn nạp trước)"} onClick={() => act({ action: "update", id: m.id, pinned: !m.pinned })}
                  className={m.pinned ? "text-violet-600" : "hover:text-violet-600"}><Pin size={11} /></button>
                <button title="Xoá hẳn" onClick={() => act({ action: "delete", id: m.id })} className="hover:text-rose-500"><Trash2 size={11} /></button>
              </div>
              {editing === m.id ? (
                <div className="flex gap-2 mt-1">
                  <input value={draft} onChange={e => setDraft(e.target.value)} className="flex-1 px-2 py-1 rounded-md border border-gray-200 dark:border-slate-700 bg-transparent" />
                  <button onClick={async () => { await act({ action: "update", id: m.id, content: draft }); setEditing(null) }} className="text-violet-600">Lưu</button>
                  <button onClick={() => setEditing(null)} className="text-gray-400">Huỷ</button>
                </div>
              ) : (
                <div onClick={() => { setEditing(m.id); setDraft(m.content) }} title="Bấm để sửa"
                  className="mt-0.5 text-gray-700 dark:text-slate-200 cursor-text break-words">{m.content}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
