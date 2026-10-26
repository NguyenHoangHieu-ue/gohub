"use client"

import { useEffect, useState } from "react"

// Người dùng hiện tại là MEMBER của Trợ lý (được Creator cấp, không phải Creator)? Dùng để ẩn nút/mục chỉ dành cho Creator (cập nhật bối cảnh, nguồn tự động, menu Thêm…).
// Chỉ là ẩn giao diện — quyền thật nằm ở server (access.ts: route nào không dùng requireArgonMember* vẫn chỉ Creator). Dùng chung một lần gọi /api/user/me.
let cached: Promise<{ member: boolean; enabled: boolean }> | null = null
const load = () => (cached ??= fetch("/api/user/me").then(r => (r.ok ? r.json() : null)).then(d => ({ member: d?.argon_member === true, enabled: d?.argon_enabled === true })).catch(() => ({ member: false, enabled: false })))

export function useArgonAccess(): { loading: boolean; member: boolean; enabled: boolean } {
  const [s, setS] = useState<{ loading: boolean; member: boolean; enabled: boolean }>({ loading: true, member: false, enabled: false })
  useEffect(() => { let on = true; void load().then(v => { if (on) setS({ loading: false, ...v }) }); return () => { on = false } }, [])
  return s
}
export const useArgonMember = () => useArgonAccess().member
