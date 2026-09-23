// Model Gemini dùng chung cho toàn hệ thống — đổi model ở ĐÂY (hoặc env Vercel) thay vì sửa từng file.
// GEMINI_MODEL: việc thường (chat, format báo cáo, phân loại). GEMINI_MODEL_PRO: việc nặng nhiều bước (sửa file,
// báo cáo dài) — mặc định trùng GEMINI_MODEL vì 3.8-flash (2026-09) mới hơn bản Pro sẵn có (3.1-pro-preview).
// Cron gau-pro-digest tự DM creator khi API có model mới (lib/gemini-model-watch.ts) → đổi env sau khi thử.
// ⚠️ Model mới có thể từ chối thinkingLevel cũ (vd 3.8-flash không nhận "minimal" khi có tool) — test trước.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash"
export const GEMINI_MODEL_PRO = process.env.GEMINI_MODEL_PRO || GEMINI_MODEL
