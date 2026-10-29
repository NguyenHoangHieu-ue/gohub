"use client"

import { useCallback, useRef, useState } from "react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { api, jsonInit, type Source } from "../argon-types"

// Tệp trong khung chat KHÔNG vào "Tài liệu của tôi" ngay khi chọn (hay gửi nhầm): chỉ giữ ở ô nhắn; bấm Gửi mới tải lên (stage) và gửi kèm câu hỏi.
// Máy chủ lưu tài liệu + đưa thẳng vào ngữ cảnh lượt đó, còn bước tóm tắt (digest) chạy song song với lúc Gấu Prime trả lời.
// Nút "Thêm tài liệu" trong Tài liệu của tôi vẫn là lưu chủ động (upload).
export type UploadState = { stage: "idle" } | { stage: "working"; text: string } | { stage: "done"; names: string[]; failed: string[] } | { stage: "error"; text: string }
export interface Staged { path: string; name: string; mime: string; size: number }
export const MAX_FILES = 10

/** Ảnh dán/chụp màn hình luôn tên "image.png": đặt tên duy nhất (và đổi tên mọi tệp trùng) để người dùng, thẻ tệp và mô hình phân biệt được từng tệp. */
export function uniqueFiles(existing: File[], incoming: File[]): File[] {
  const taken = new Set(existing.map(f => f.name))
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "")
  return incoming.map((f, i) => {
    let name = f.name
    if (/^(image|blob|untitled)\.\w+$/i.test(name) || !name) name = `anh-${stamp}-${existing.length + i + 1}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`
    if (taken.has(name)) {
      const dot = name.lastIndexOf("."), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : ""
      let n = 2
      while (taken.has(`${base}-${n}${ext}`)) n++
      name = `${base}-${n}${ext}`
    }
    taken.add(name)
    return name === f.name ? f : new File([f], name, { type: f.type, lastModified: f.lastModified })
  })
}

export function useChatUpload() {
  const [state, setState] = useState<UploadState>({ stage: "idle" })
  const projectRef = useRef<string | null>(null)
  const busy = useRef(false)

  const khoProject = useCallback(async () => {
    if (!projectRef.current) projectRef.current = (await api<{ projectId: string }>("/api/creator/argon/kho")).projectId
    return projectRef.current
  }, [])

  /** Tải các tệp lên Storage song song (chưa tạo tài liệu). */
  const stage = useCallback(async (files: File[]): Promise<{ regs: Staged[]; failed: string[] }> => {
    const list = files.slice(0, MAX_FILES)
    const projectId = await khoProject()
    const prep = await api<{ bucket: string; uploads: { name: string; path: string; token: string }[] }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "prepare", files: list.map(f => ({ name: f.name, size: f.size })) }))
    const sent = await Promise.all(list.map((f, i) => supabaseBrowser.storage.from(prep.bucket).uploadToSignedUrl(prep.uploads[i].path, prep.uploads[i].token, f)))
    const regs: Staged[] = [], failed: string[] = []
    sent.forEach(({ error }, i) => {
      if (error) failed.push(list[i].name)
      else regs.push({ path: prep.uploads[i].path, name: list[i].name, mime: list[i].type, size: list[i].size })
    })
    return { regs, failed }
  }, [khoProject])

  /** Tóm tắt + tự xếp thư mục cho các tài liệu vừa lưu, song song; lỗi tóm tắt không làm mất tài liệu đã lưu. */
  const digest = useCallback(async (ids: string[], names: string[] = [], failed: string[] = []) => {
    setState({ stage: "working", text: "Đang tóm tắt tài liệu…" })
    await Promise.all(ids.map(id => api("/api/creator/argon/kho", jsonInit("POST", { action: "digest", ids: [id], autoFile: true })).catch(() => null)))
    setState({ stage: "done", names: names.length ? names : [`${ids.length} tài liệu`], failed })
  }, [])

  /** Lưu chủ động vào Tài liệu của tôi (không gắn với câu hỏi nào). */
  const upload = useCallback(async (files: File[]) => {
    if (!files.length || busy.current) return
    busy.current = true
    try {
      setState({ stage: "working", text: `Đang lưu ${Math.min(files.length, MAX_FILES)} tài liệu…` })
      const projectId = await khoProject()
      const { regs, failed } = await stage(files)
      if (!regs.length) { setState({ stage: "error", text: "Không tải lên được tài liệu nào. Anh/chị thử lại giúp em." }); return }
      setState({ stage: "working", text: "Đang đọc nội dung…" })
      const r = await api<{ sources: Source[]; errors: string[] }>(`/api/creator/argon/projects/${projectId}/sources`, jsonInit("POST", { action: "register", items: regs }))
      failed.push(...regs.filter(x => !r.sources.some(s => s.storage_path === x.path)).map(x => x.name))
      await digest(r.sources.map(s => s.id), r.sources.map(s => s.name), failed)
    } catch (e) { setState({ stage: "error", text: (e as Error).message }) }
    finally { busy.current = false }
  }, [khoProject, stage, digest])

  const reset = useCallback(() => setState({ stage: "idle" }), [])
  return { state, upload, stage, digest, reset }
}
