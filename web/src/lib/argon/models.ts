import { GEMINI_MODEL, GEMINI_MODEL_ARGON } from "@/lib/ai-models"
import { estimateArgonCostUsd, estimateCostUsd } from "@/lib/agents/gemini-pricing"

// Mô hình cho lượt chạy của Phòng Argon: "deep" = Gemini 4 Argon (suy luận sâu, ngữ cảnh 1M, chậm ~2,4 lần), "fast" = model nhanh dùng chung của hệ thống (GEMINI_MODEL).
// Lượt lưu id model thật vào argon_runs.model nên "Tiếp tục viết" và việc nền luôn chạy đúng model đã chọn.
export type ModelKey = "deep" | "fast"
export const MODEL_IDS: Record<ModelKey, string> = { deep: GEMINI_MODEL_ARGON, fast: GEMINI_MODEL }
export const isModelKey = (v: unknown): v is ModelKey => v === "deep" || v === "fast"
/** Khoá → id model; khoá lạ/trống → deep (hành vi cũ). */
export const resolveModel = (key?: unknown): string => MODEL_IDS[isModelKey(key) ? key : "deep"]
/** id model đã lưu → khoá (id không biết → deep). */
export const keyOfModel = (id?: string | null): ModelKey => (id && id === MODEL_IDS.fast && MODEL_IDS.fast !== MODEL_IDS.deep ? "fast" : "deep")
/** Giá theo model của lượt (flash không có giảm giá cache riêng, tính như token vào thường). */
export function costOf(model: string | null | undefined, tokensIn: number, tokensOut: number, cachedIn = 0): number {
  return keyOfModel(model) === "fast" ? estimateCostUsd(tokensIn, tokensOut) : estimateArgonCostUsd(tokensIn, tokensOut, cachedIn)
}
