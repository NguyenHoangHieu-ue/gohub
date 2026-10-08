// Model Gemini dùng chung cho toàn hệ thống — đổi model ở ĐÂY (hoặc env Vercel) thay vì sửa từng file.
// GEMINI_MODEL: việc thường (chat, format báo cáo, phân loại). GEMINI_MODEL_PRO: việc nặng nhiều bước (sửa file,
// báo cáo dài) — mặc định trùng GEMINI_MODEL vì 3.8-flash (2026-09) mới hơn bản Pro sẵn có (3.1-pro-preview).
// Cron gau-pro-digest tự DM creator khi API có model mới (lib/gemini-model-watch.ts) → đổi env sau khi thử.
// ⚠️ Model mới có thể từ chối thinkingLevel cũ (vd 3.8-flash không nhận "minimal" khi có tool) — test trước.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash"
export const GEMINI_MODEL_PRO = process.env.GEMINI_MODEL_PRO || GEMINI_MODEL
// G5 Gấu Pro phiên giọng nói/màn hình (Gemini Live API, bidiGenerateContent). Kiểm model có sẵn: ListModels lọc bidiGenerateContent.
export const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live"
// U3 Bé Gấu đọc câu trả lời (TTS) — 3.8-flash-tts trả thẳng audio/wav (đo 2026-10-08: ~4s cho 1 câu).
export const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts"
// U3 ghi âm cuộc họp → biên bản: chép lời (trả part audioTranscription.text, không tách người nói; đo ~2s cho 1 câu).
export const GEMINI_TRANSCRIBE_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe"
// U3 dịch trực tiếp (CS): Live + translationConfig (đo 2026-10-08: Việt→Anh đúng; echoTargetLanguage=false VẪN phát âm thanh khi nghe đúng
// ngôn ngữ đích → giao diện chỉ gửi mic vào chiều đang chọn, không mở 2 chiều nghe cùng lúc).
export const GEMINI_TRANSLATE_MODEL = process.env.GEMINI_TRANSLATE_MODEL || "gemini-3.5-live-translate-preview"
// U3 nghiên cứu sâu: agent Deep Research (Interactions API, background). Đo 2026-10-08: câu giá eSIM Nhật 136s, ~114k token, có nguồn.
export const GEMINI_DEEP_RESEARCH_AGENT = process.env.GEMINI_DEEP_RESEARCH_AGENT || "deep-research-preview-04-2026"
