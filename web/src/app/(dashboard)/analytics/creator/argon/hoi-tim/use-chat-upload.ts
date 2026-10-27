"use client"

import { useCallback, useRef, useState } from "react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { api, jsonInit, type Source } from "../argon-types"

// Tải tài liệu NGAY TRONG khung chat (người dùng ít rành công nghệ: không cần vào tab Kho): chọn hoặc kéo thả file → lưu vào "Tài liệu của tôi" (Kho của chính họ) → tóm tắt nhanh.
// Cùng đường tải lên của Kho: chuẩn bị đường tải → tải thẳng lên Storage → đăng ký (đọc nội dung) → digest.
export type UploadState = { stage: "idle" } | { stage: "working"; text: string } | { stage: "done"; names: string[]; failed: string[] } | { stage: "error"; text: string }
const MAX_FILES = 10

export function useChatUpload() {
  const [state, setState] = useState<UploadState>({ stage: "idle" })
  const projectRef = useRef<string | null>(null)
  const busy = useRef(false)

  const upload = useCallback(async (files: File[]) => {
    const list = files.slice(0, MAX_FILES)
    if (!list.length || busy.current) return
    busy.current = true
    try {
      setState({ stage: "working", text: `Đang lưu ${list.length} tài liệu…` })
      if (!projectRef.current) projectRef.current = (await api<{ projectId: string }>("/api/creator/argon/kho")).projectId
      const projectId = projectRef.current
      const prep = await api<{ bucket: string; uploads: { name: string; path: string; token: string }[] }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "prepare", files: list.map(f => ({ name: f.name, size: f.size })) }))
      const regs: { path: string; name: string; mime: string; size: number }[] = [], failed: string[] = []
      for (let i = 0; i < list.length; i++) {
        const { error } = await supabaseBrowser.storage.from(prep.bucket).uploadToSignedUrl(prep.uploads[i].path, prep.uploads[i].token, list[i])
        if (error) { failed.push(list[i].name); continue }
        regs.push({ path: prep.uploads[i].path, name: list[i].name, mime: list[i].type, size: list[i].size })
      }
      if (!regs.length) { setState({ stage: "error", text: "Không tải lên được tài liệu nào. Anh/chị thử lại giúp em." }); return }
      setState({ stage: "working", text: "Đang đọc nội dung…" })
      const r = await api<{ sources: Source[]; errors: string[] }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "register", items: regs }))
      failed.push(...regs.filter(x => !r.sources.some(s => s.name === x.name)).map(x => x.name))
      const ids = r.sources.map(s => s.id)
      for (let i = 0; i < ids.length; i += 4) {
        setState({ stage: "working", text: "Đang tóm tắt…" })
        try { await api("/api/creator/argon/kho", jsonInit("POST", { action: "digest", ids: ids.slice(i, i + 4), autoFile: true })) } catch { /* tóm tắt lỗi không làm mất tài liệu đã lưu */ }
      }
      setState({ stage: "done", names: r.sources.map(s => s.name), failed })
    } catch (e) { setState({ stage: "error", text: (e as Error).message }) }
    finally { busy.current = false }
  }, [])

  const reset = useCallback(() => setState({ stage: "idle" }), [])
  return { state, upload, reset }
}
