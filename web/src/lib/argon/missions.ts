// Phòng Argon — Sứ mệnh + workspace (plan docs/plans/argon-missions.md). File này CHỈ chứa hàm thuần (không đụng DB) để test được.

export const PHASES = ["clarify", "plan", "run", "done", "paused"] as const
export type MissionPhase = typeof PHASES[number]

export const MAX_WORKSPACE_FILES = 300
export const MAX_TEXT_FILE_BYTES = 1024 * 1024
export const MAX_PATH_LEN = 200
export const BRIEF_PATH = "brief.md"
export const DECISIONS_PATH = "decisions.md"
export const TOP_FOLDERS = ["data", "scripts", "reports", "notes"] as const

// Pha chuyển được. "run" chỉ từ "plan" hoặc "paused" (nút Chốt / Tiếp tục); không nhảy thẳng clarify→run.
const NEXT: Record<MissionPhase, MissionPhase[]> = {
  clarify: ["plan", "paused"],
  plan: ["clarify", "run", "paused"],
  run: ["done", "paused", "plan"],
  paused: ["clarify", "plan", "run"],
  done: ["run", "plan"],
}
export const canTransition = (from: MissionPhase, to: MissionPhase) => from !== to && NEXT[from].includes(to)

export const isPhase = (v: unknown): v is MissionPhase => typeof v === "string" && (PHASES as readonly string[]).includes(v)

/** Chuẩn hoá đường dẫn file workspace. Trả null nếu không hợp lệ (đường tuyệt đối, "..", ký tự lạ, quá dài, thư mục lạ ở cấp 1). */
export function cleanPath(raw: string): string | null {
  const p = String(raw ?? "").trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\.\//, "")
  if (!p || p.length > MAX_PATH_LEN || p.startsWith("/") || p.endsWith("/")) return null
  const parts = p.split("/")
  if (parts.some(s => !s || s === "." || s === ".." || s.startsWith(".") || /[\u0000-\u001f<>:"|?*]/.test(s))) return null
  if (parts.length > 5) return null
  if (parts.length === 1) return p
  return (TOP_FOLDERS as readonly string[]).includes(parts[0]) ? p : null
}

/** Chỉ ghi được brief.md ở pha làm rõ (Argon chưa được Chốt); người dùng (Hiếu) ghi được mọi lúc. */
export function canArgonWrite(phase: MissionPhase, path: string): boolean {
  if (phase === "clarify") return path === BRIEF_PATH
  if (phase === "plan") return path === BRIEF_PATH || path.startsWith("notes/")
  return phase === "run"
}

export interface WsFileRow { path: string; size_bytes: number; author: string; updated_at: string }
export interface TreeNode { name: string; path: string; type: "dir" | "file"; size?: number; author?: string; updatedAt?: string; children?: TreeNode[] }

/** Dựng cây thư mục ảo từ danh sách path. Thư mục cấp 1 chuẩn luôn hiện (kể cả rỗng); thư mục trước, tên A→Z. */
export function buildTree(files: WsFileRow[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] }
  const dir = (parent: TreeNode, name: string): TreeNode => {
    let d = parent.children!.find(c => c.type === "dir" && c.name === name)
    if (!d) { d = { name, path: parent.path ? `${parent.path}/${name}` : name, type: "dir", children: [] }; parent.children!.push(d) }
    return d
  }
  for (const f of TOP_FOLDERS) dir(root, f)
  for (const f of files) {
    const parts = f.path.split("/")
    let cur = root
    for (const seg of parts.slice(0, -1)) cur = dir(cur, seg)
    cur.children!.push({ name: parts[parts.length - 1], path: f.path, type: "file", size: f.size_bytes, author: f.author, updatedAt: f.updated_at })
  }
  const sort = (n: TreeNode) => {
    n.children?.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "vi") : a.type === "dir" ? -1 : 1))
    n.children?.forEach(sort)
  }
  sort(root)
  return root.children!
}

export const briefTemplate = (name: string, goal: string) =>
  `# ${name}\n\n## Mục tiêu\n${goal.trim() || "(chưa có — Argon sẽ hỏi để làm rõ)"}\n\n## Thước đo\n(chưa có)\n\n## Phạm vi và ràng buộc\n(chưa có)\n\n## Xong khi\n(chưa có)\n`

export const decisionsTemplate = () => "# Quyết định đã chốt\n\n(chưa có mục nào. Mỗi mục: ngày, ai chốt, nội dung, lý do.)\n"

/** Khối đầu ngữ cảnh mỗi lượt của sứ mệnh: mục tiêu + pha + brief/decisions nguyên văn + danh sách file (tên + kích thước; nội dung đọc qua công cụ). */
export function missionContextBlock(m: { name: string; goal: string; phase: MissionPhase }, brief: string, decisions: string, files: WsFileRow[]): string {
  const list = files.filter(f => f.path !== BRIEF_PATH && f.path !== DECISIONS_PATH).map(f => `- ${f.path} (${f.size_bytes} byte, ${f.author === "argon" ? "Argon" : "Hiếu"} ghi)`).join("\n")
  return [
    `<su_menh ten="${m.name.replace(/"/g, "'")}" pha="${m.phase}">`,
    `Mục tiêu: ${m.goal.trim() || "(chưa ghi)"}`,
    `<brief.md>\n${brief.trim()}\n</brief.md>`,
    `<decisions.md>\n${decisions.trim()}\n</decisions.md>`,
    `<file_workspace>\n${list || "(chưa có file nào khác)"}\n</file_workspace>`,
    `</su_menh>`,
  ].join("\n")
}

/** Chỉ dẫn thêm vào system prompt theo pha. */
export function phaseInstruction(phase: MissionPhase): string {
  switch (phase) {
    case "clarify":
      return "PHA LÀM RÕ: chỉ hỏi và làm rõ với Hiếu (mục tiêu, thước đo, phạm vi, ràng buộc, thế nào là xong). Mỗi lượt tối đa 3 câu hỏi, có gợi ý đáp án. Cập nhật brief.md bằng công cụ ghiFile khi đã rõ thêm. KHÔNG đưa kết luận, KHÔNG chạy việc dài. Khi brief đủ rõ, đề nghị Hiếu chuyển sang pha Kế hoạch."
    case "plan":
      return "PHA KẾ HOẠCH: soạn kế hoạch từng bước (nguồn dữ liệu, việc làm, đầu ra, rủi ro, ước tính thời gian). Chưa làm việc thật. Chờ Hiếu bấm Chốt. Mọi chỗ còn mơ hồ phải hỏi ngay."
    case "run":
      return "PHA CHẠY (Hiếu đã Chốt): làm theo kế hoạch đã chốt và brief.md. Gặp chỗ mơ hồ ngoài brief thì dừng và hỏi, không đoán. Ghi kết quả vào workspace (reports/, data/, notes/) và ghi quyết định vào decisions.md."
    case "paused":
      return "SỨ MỆNH ĐANG TẠM DỪNG: chỉ trả lời câu hỏi, không làm việc mới."
    case "done":
      return "SỨ MỆNH ĐÃ XONG: trả lời câu hỏi về kết quả; việc mới cần Hiếu mở lại sứ mệnh."
  }
}
