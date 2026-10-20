import type { MissionPhase, TreeNode } from "@/lib/argon/missions"
import type { Run, Source } from "../argon-types"

export type { MissionPhase, TreeNode }

export interface MissionRowUi {
  id: string; project_id: string; name: string; goal: string; phase: MissionPhase; committed_at: string | null; archived: boolean
  created_at: string; updated_at: string; spent_usd: number; runs: number; files: number; sources: number
}
export interface MissionUi { id: string; project_id: string; name: string; goal: string; phase: MissionPhase; committed_at: string | null; archived: boolean; updated_at: string }
export interface WsFileInfo { id: string; path: string; size_bytes: number; author: "user" | "argon"; version: number; updated_at: string }
export interface MissionDetail { mission: MissionUi; tree: TreeNode[]; files: WsFileInfo[]; sources: Source[]; runs: Run[]; spent_usd: number }
export interface WsFile { id: string; path: string; mime: string | null; content: string | null; storage_path: string | null; size_bytes: number; author: "user" | "argon"; version: number; updated_at: string }

export const PHASE_LABEL: Record<MissionPhase, string> = { clarify: "Làm rõ", plan: "Kế hoạch", run: "Đang chạy", done: "Đã xong", paused: "Tạm dừng" }
export const PHASE_PILL: Record<MissionPhase, string> = {
  clarify: "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200",
  plan: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  run: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  done: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  paused: "bg-gray-200 text-gray-600 dark:bg-slate-600 dark:text-slate-300",
}
export const BRIEF = "brief.md"
export const PROTECTED_FILES = ["brief.md", "decisions.md"]
export const fmtUsd = (n: number) => `$${n.toFixed(n >= 1 ? 2 : 3).replace(".", ",")}`
