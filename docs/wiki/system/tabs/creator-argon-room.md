---
title: "Phòng Argon (Creator)"
page_type: tab_guide
is_hidden: true
department: product
---

# Phòng Argon (`/analytics/creator/argon`)

Tab riêng của Creator: kho tài liệu + trợ lý chạy Gemini 4 Argon (`GEMINI_MODEL_ARGON`, mặc định `gemini-4-argon`). Khác Gấu Pro: **không gọi công cụ**, nạp nguyên tài liệu vào ngữ cảnh (1M token) rồi suy luận/viết dài. Chỉ đọc — không ghi dữ liệu hệ thống, không gửi tin. Kế hoạch, tiến độ: `docs/plans/argon-room.md`.

## Dữ liệu
Bảng `argon_projects`, `argon_sources`, `argon_source_versions`, `argon_runs` (migration v73), bucket Storage riêng tư `argon-room`. Chỉ service_role truy cập; mọi API kiểm `requireArgonUser()` (role creator) và dự án thuộc đúng người.

## Luồng
- Tải file: `POST projects/[id]/sources` action `prepare` (đường ký sẵn) → trình duyệt tải thẳng Storage → action `register` (đọc file, trích chữ, đếm token bằng `countTokens`) · action `note` (dán văn bản).
- Chạy: `POST projects/[id]/runs` (SSE). Ngữ cảnh dựng ở `lib/argon/context.ts`. Mỗi đoạn ≤265s/32.768 token ra; dở thì `partial`, client tự gọi lại với `resumeRunId` (tối đa 6 đoạn).
- Sửa chữ nguồn (`PATCH sources/[id]` `text`) tạo phiên bản mới; `restoreVersion` khôi phục.

## Gotchas
- PDF/ảnh/video/âm thanh (`send_binary`) không sửa chữ được; tổng file gốc nhúng ≤18MB/lượt, vượt thì bỏ + cảnh báo. File >20MB chưa hỗ trợ (cần Gemini Files API — P1).
- `thinkingLevel "minimal"` bị Argon từ chối (chỉ low/medium/high).
- Giá ước lượng `estimateArgonCostUsd` là giá giới thiệu ($2/$10 trên 1M token); Google nói sẽ tăng — cập nhật ở `lib/agents/gemini-pricing.ts`.
- Eval so model: `web/scripts/eval-be-gau.mjs --endpoint gau-pro --model …` và `eval-gau-pro-strength.mjs`; kết quả `web/eval/results/gp-*`, `gps-*`.
