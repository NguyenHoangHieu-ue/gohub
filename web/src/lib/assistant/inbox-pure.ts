// "Việc cần duyệt" của Trợ lý: gom MỌI thứ đang chờ anh (hành động Gấu Pro, câu hỏi/đề xuất sửa code của Argon, thay đổi sự việc, mail chờ trả lời, phiếu dev hỏi lại)
// vào MỘT danh sách. Phần THUẦN — kiểu, xếp thứ tự, đếm. Không I/O.
export type InboxKind = "gp_action" | "argon_patch" | "argon_ask" | "fact_review" | "mail" | "dev_ticket"
export type InboxAction = "approve" | "reject" | "confirm" | "done" | "open"

export interface InboxItem {
  key: string                    // `${kind}:${id}` — duy nhất trong danh sách
  kind: InboxKind
  id: string                     // id gốc trong hệ thống của loại đó
  title: string
  detail: string
  at: string                     // ISO — lúc việc này phát sinh
  urgency: 1 | 2 | 3             // 3 = cần quyết sớm
  source: string                 // "Gấu Pro" | "Argon · tên sứ mệnh" | "Sổ sự việc" | "Mail" | "Phiếu sửa code"
  actions: InboxAction[]
  missionId?: string             // argon_*: sứ mệnh chứa việc này (để gọi đúng endpoint)
  href?: string                  // trang để làm tiếp khi cần ("open")
}

export const KIND_LABEL: Record<InboxKind, string> = {
  gp_action: "Hành động chờ duyệt", argon_patch: "Đề xuất sửa code", argon_ask: "Argon hỏi anh", fact_review: "Thay đổi sự việc", mail: "Mail chờ trả lời", dev_ticket: "Phiếu sửa code hỏi lại",
}

/** Việc gấp trước, trong cùng mức thì cũ nhất trước (chờ lâu nhất). */
export function sortInbox(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => b.urgency - a.urgency || a.at.localeCompare(b.at))
}

export function countByKind(items: InboxItem[]): Record<InboxKind, number> {
  const out = { gp_action: 0, argon_patch: 0, argon_ask: 0, fact_review: 0, mail: 0, dev_ticket: 0 } as Record<InboxKind, number>
  for (const i of items) out[i.kind]++
  return out
}

/** Mức gấp theo tuổi: hành động Gấu Pro hết hạn sau 24h nên luôn ≥2 (≥12h → 3); câu hỏi của Argon/phiếu chờ >24h → 3; còn lại >48h → 3, >12h → 2. */
export function urgencyFor(kind: InboxKind, at: string, now = Date.now()): 1 | 2 | 3 {
  const ageH = Math.max(0, (now - Date.parse(at)) / 3_600_000)
  if (kind === "gp_action") return ageH >= 12 ? 3 : 2
  if (kind === "argon_ask" || kind === "dev_ticket") return ageH >= 24 ? 3 : 2
  return ageH >= 48 ? 3 : ageH >= 12 ? 2 : 1
}
