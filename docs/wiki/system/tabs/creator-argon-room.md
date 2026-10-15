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

## Nguồn Lark (P1a)
`lib/argon/lark.ts` (đọc, token Creator `getLarkUserToken()`), `lib/argon/lark-sync.ts` (thêm link, thư mục, đồng bộ). `POST projects/[id]/sources` action `lark` ({url, mode: snapshot|live}) và `sync`; `POST sources/[id]` đồng bộ 1 nguồn; cron `GET/POST /api/cron/argon-sync` (Bearer CRON_SECRET) đồng bộ mọi nguồn Lark ban đêm. Đồng bộ chỉ tạo phiên bản mới khi hash nội dung đổi; nguồn có `meta.edited` (Hiếu sửa tay) thì bỏ qua để không ghi đè. Chế độ `live` đọc lại ngay trước mỗi lượt chạy (lỗi thì dùng bản đã lưu). Thiếu scope → Lark 99991679, thông báo kèm tên scope cần.

## Sửa tài liệu
`POST sources/[id]/revise` trả BẢN NHÁP (không lưu); giao diện so khác biệt theo dòng (`lib/argon/diff.ts`) rồi Hiếu duyệt → `PATCH text` tạo phiên bản mới. Bản nháp bị cắt vì quá dài (`truncated`) không áp dụng được. `GET sources/[id]/export?format=docx|xlsx|md` xuất phiên bản hiện tại (`lib/argon/export.ts`) — chỉ chữ, KHÔNG giữ định dạng của file Word/Excel gốc.

## Gói dữ liệu (số liệu hệ thống mới nhất)
`lib/argon/data-packs.ts` (danh mục `PACKS` + `buildPack`), `lib/argon/digest.ts` (JSON → văn bản gọn: giá trị đơn "đường.dẫn: giá trị", mảng object → bảng markdown, ít dòng nhiều cột → khối từng dòng), API `GET /api/creator/argon/data-packs` (danh mục + 4 quý gần nhất) và `POST projects/[id]/sources` action `data` ({pack, quarter, mode}). Phòng Argon tự gọi endpoint analytics của CHÍNH server bằng `Authorization: Bearer CRON_SECRET` (xem `analyticsGuard`/`isCronReq`) nên số liệu giống hệt các tab; chỉ gọi endpoint trong danh mục (chỉ đọc). Nguồn lưu `kind='note'` + `meta.dataPack` + `external_id=datapack:<gói>:<quý>` (không cần migration vì CHECK `kind` không có 'data'). Đồng bộ: so hash PHẦN SAU dòng "Lấy lúc …" (dòng này đổi mỗi lần); cron `/api/cron/argon-sync` và chế độ live dùng chung `syncMany`/`syncSource`. Quý đang chạy: dữ liệu đến HÔM QUA; gói `market` cảnh báo %QoQ vô nghĩa khi quý chưa hết. Mỗi gói ~0,5–6k token (b2b-tiers ~6k, market ~2k); quarter-report/squad-progress chậm (~26s) vì endpoint tính nặng.

## Mail Lark (P2, chỉ đọc)
`lib/argon/mail.ts` (đọc: thư mục, danh sách thư mới→cũ, nội dung base64url → chữ, đính kèm), `lib/argon/mail-sync.ts` (quy tắc + đồng bộ), API `projects/[id]/mail` (GET quy tắc + thư mục · POST {rule} lưu + nạp ngay, {action:"sync"} nạp lại tất cả · DELETE ?ruleId). Quy tắc lưu `app_settings` key `argon_mail_rules:<projectId>` (xoá cùng dự án). Quét tối đa 150 thư từ mới → cũ, dừng khi quá `sinceDays`; lọc theo người gửi/từ khoá; gom theo `thread_id`, giữ `maxThreads` luồng mới nhất. Luồng đổi (hash) → phiên bản mới; đính kèm tải về qua `download_url` rồi `ingestBuffer` (`lib/argon/ingest.ts`). Cần scope `mail:user_mailbox.folder:read` + `mail:user_mailbox.message:readonly` (+ `.body/.subject/.address` đã xin ở `LARK_OAUTH_SCOPES`); thiếu → Lark 99991679, báo tên scope. Mail chứa thông tin bên thứ ba và được gửi tới Gemini API khi chạy (Hiếu chốt 2026-10-14: không cần báo pháp chế). Cron `/api/cron/argon-sync` cũng nạp lại các quy tắc.

## s234 — P1b + P3 phần còn lại
- **Thư mục Lark đệ quy** (≤3 cấp, ≤300 file liệt kê, ≤30 file mới/lần): nguồn con mang `meta.rootFolder`; `syncFolders(projectId)` (nút "Đồng bộ" + cron `argon-sync`, mục `folders` trong kết quả) quét lại thư mục gốc và thêm file mới.
- **Gói dữ liệu mới:** `channels` (Channel Performance từ đầu quý đến hôm qua) và `wiki-business` (các trang `kb_wiki_pages` `is_hidden=false`, ~87k ký tự; không theo quý, quý giả `all`; trang kỹ thuật theo tab ẩn bị bỏ vì ~800k ký tự).
- **Sửa ô xlsx tại chỗ:** `source-viewer.tsx` chế độ Sửa hiện lưới ô (500 dòng đầu, còn lại giữ nguyên); parse CSV đủ dòng + escape ngoặc kép; công thức/định dạng file gốc không giữ. Có nút chuyển "Sửa dạng CSV".
- **Soát lại:** nút trong khung chat — dán kết quả Gấu Pro/AI khác → Argon đối chiếu với nguồn dự án (ĐÚNG/SAI/THIẾU/KHÔNG CÓ CĂN CỨ + trích nguồn).

## s234b — Việc nền, công cụ số liệu, video/họp (không cần migration)
- **Việc nền:** `POST projects/[id]/runs` `{background:true}` tạo lượt `queued` + `argon_bg:<runId>` (app_settings: người giao, nhịp tim) rồi gọi worker `POST /api/creator/argon/worker` (Bearer CRON_SECRET, 300s). Worker (`lib/argon/bg-worker.ts`) chạy 1 đoạn ≤265s, hết giờ thì lưu câu trả lời dở, đặt lại `queued` và tự gọi đoạn kế; tối đa `MAX_BG_SEGMENTS` 40 đoạn / `MAX_BG_COST_USD` $10, chạm trần → `partial` ("Tiếp tục viết"). Xong/lỗi/dừng → DM Lark cho Creator. Việc kẹt (đoạn chết, nhịp tim >6 phút) được quét lại bởi cron `scheduled-messages` (mỗi giờ) và `argon-sync` (`resumedBackground`). Dừng: `PATCH runs {runId, action:"cancel"}`. Giao diện: hai ô tích dưới khung chat ("Chạy nền", "Cho Argon tự lấy số liệu hệ thống"); trang tự hỏi lại trạng thái mỗi 5s khi có lượt `queued/running`.
- **Lõi chạy chung:** `lib/argon/run-engine.ts` `runSegment` (SSE và worker dùng chung; retry lỗi tạm, vòng gọi công cụ, token cộng dồn mọi vòng).
- **Công cụ lấy số liệu (`lib/argon/tools.ts`):** MỘT công cụ `layDuLieuHeThong` chỉ đọc, chỉ gọi các báo cáo trong danh mục gói dữ liệu (cùng endpoint/cùng số với tab); `channels` và `period-overview` nhận thêm `startDate/endDate` (≤400 ngày, cắt tại hôm qua). Tối đa 8 lần/lượt, kết quả ≤60.000 ký tự, tham số kiểm trước (`validateToolArgs`, có test), nhật ký đầy đủ lưu ở `argon_run_tools:<runId>` (xem `GET runs?runId=`, nút "Số liệu đã lấy"); đoạn sau của cùng lượt nạp lại kết quả cũ, không gọi lại. Mặc định TẮT (ô tích). Không có SQL tự do, không ghi, không gửi tin.
- **Video/họp:** link YouTube công khai (dán ở ô "Thêm link") thành nguồn `note` có `meta.youtubeUrl`, Gemini xem hình + tiếng qua `fileData.fileUri` (`lib/argon/video.ts`; video riêng tư/giới hạn tuổi báo lỗi lúc đếm token). Link Lark Minutes `/minutes/<token>` đọc biên bản + bản ghi lời có người nói (`readMinutes` trong `lark.ts`; cần scope Minutes — chưa thử với biên bản thật). Video/ghi âm tải lên đã hỗ trợ từ trước (file >8MB qua Files API).

## Gotchas
- Client component KHÔNG import `@/lib/supabase` (tạo client admin cần `SUPABASE_SERVICE_KEY`, không có ở trình duyệt → trắng cả trang; sự cố 2026-10-14). Dùng `@/lib/supabase-browser`; test `argon-client-imports` chặn lại.
- PDF/ảnh/video/âm thanh (`send_binary`) không sửa chữ được; tổng file gốc nhúng ≤18MB/lượt, vượt thì bỏ + cảnh báo. File gốc >8MB (`INLINE_MAX_FILE`) không nhúng base64 mà tải lên Gemini Files API (`ensureGeminiFile` trong `context.ts`, tham chiếu lưu `meta.geminiFile`, dùng lại tới khi còn <2h trước hạn 48h); trần tải lên 45MB (Supabase Storage free 50MB). Đã thử sống: file text 17,5MB = 857k token, Argon trả đúng mã trong file.
- `thinkingLevel "minimal"` bị Argon từ chối (chỉ low/medium/high).
- Giá ước lượng `estimateArgonCostUsd` là giá giới thiệu ($2/$10 trên 1M token); Google nói sẽ tăng — cập nhật ở `lib/agents/gemini-pricing.ts`.
- Eval so model: `web/scripts/eval-be-gau.mjs --endpoint gau-pro --model …` và `eval-gau-pro-strength.mjs`; kết quả `web/eval/results/gp-*`, `gps-*`.

### s233e — Dự án "Tri thức công ty GoHub"
Dự án dùng cho câu hỏi nghiệp vụ (vendor, giá vốn, mã SKU, quy trình CS, KPI): 1 nguồn docx dựng từ Wiki nghiệp vụ + ghi chú Gấu Pro (`creator_kb`) + mục giả định hiện hành. Dựng lại bằng `web/scripts/argon-knowledge/` (README trong thư mục). Không tự đồng bộ; không chứa mật khẩu portal (loại bởi `sanitize()`); ghi chú KB tháng 08 có thể lỗi thời — tài liệu dặn Argon ưu tiên mục "Giả định HIỆN HÀNH".
