# Plan — Sửa cách tính "Tasks via Bé Gấu" (My Metrics) sau đợt nâng cấp Bé Gấu

> File TẠM (quy ước CLAUDE.md): xong hết mốc (hoặc Hiếu bỏ plan) thì xoá file, chuyển kiến thức sang wiki
> `docs/wiki/system/tabs/analytics-my-metrics.md`. Tạo 2026-10-08 (s228), Hiếu dặn: kiểm, đề xuất, lập plan — làm hôm sau.
> **Trạng thái: CHỜ HIẾU CHỐT 5 câu ở §4, rồi làm T0 → T4.**

## 1. Cách tính hiện tại (đọc code + wiki, 2026-10-08)

- KPI "Tasks via Bé Gấu" (target 450/quý, trọng số 30%) = số dòng `app_usage_events` có `event_type='chat'`, `ai_response` khác rỗng,
  `used_db_tool = true` và câu trả lời ≥ 15 ký tự (`MIN_TASK_RESPONSE_LEN`). Code: `lib/my-metrics-auto.ts` (thẻ KPI), cùng bộ lọc ở
  `api/analytics/my-metrics/conversations` (danh sách được tính) và `begau-insights` (+ `topics-ai`).
- `used_db_tool` được quyết lúc GHI: `usedDbTaskTool(toolsUsed)` — chỉ 4 tool `executeSQL`, `querySupabase`, `queryProduct`,
  `listSupabaseTables` (`DB_TASK_TOOLS`, `lib/okr-helpers.ts`).
- Nơi ghi: Bé Gấu web (`api/chat/route.ts` → `logChat`), Bé Gấu Lark (`api/lark/events`), Gấu Pro web (`creator-ai/chat`, câu của Creator luôn
  `false`). Breakdown Web/Lark theo `user_email` bắt đầu bằng `lark:`, breakdown vai trò theo `user_role`.

## 2. Số thật (Supabase, 2026-10-08)

| | Q3-2026 | Q4-2026 (tới 08/10) |
|---|---|---|
| Event chat có câu trả lời | 1.161 | 384 (cả không trả lời) |
| Task đúng định nghĩa hiện tại | **235** | 135 (Bé Gấu 98 + Gấu Pro 37) |
| Task của chính Creator (Hiếu) bị tính | 13 | 6 |
| Câu có gọi GA4/GSC/Lark Base nhưng KHÔNG tính | 23 | 11 |

## 3. Vấn đề tìm thấy

**A. Lỗi thật — thẻ KPI đếm thiếu khi quý > 1.000 câu.** Ba route đọc `app_usage_events` không phân trang; Supabase trả tối đa 1.000 dòng
→ Q3 có 1.161 câu có trả lời, đọc 1.000 dòng đầu chỉ được ~196 task thay vì **235** (thiếu ~17%, tuỳ thứ tự trả về). Q4 sẽ dính khi vượt
1.000 câu. Không phụ thuộc đợt nâng cấp — sửa bắt buộc.

**B. Tool mới đọc dữ liệu thật nhưng không được tính** (vì không nằm trong `DB_TASK_TOOLS`):
- `buildReport` (báo cáo Word/Excel/PPT/PDF/Lark — tự chạy SQL bên trong), `b2bCustomerCm1` (CM1 B2B theo khách — gọi route quý),
  `compareVendorQuotes`, `trackSKUWinRate` (đọc DB). Một yêu cầu "làm báo cáo X" chỉ gọi `buildReport` sẽ KHÔNG được tính.
- `queryGA4`, `queryGSC`, `queryLarkBase`: truy vấn dữ liệu có cấu trúc thật nhưng xưa nay không tính (Q3 23 câu, Q4 11 câu) — cần Hiếu chốt.

**C. Việc Bé Gấu làm nhưng không ghi log nên không bao giờ được tính:**
- Chạy nền (⏳, `gp_jobs` agent `be-gau`) — câu dài nhất, thường có SQL, chạy nhiều chặng.
- Việc theo lịch (`gp_scheduled_tasks`, chạy tự động).
- Nghiên cứu sâu (Deep Research — chỉ web, không đọc DB).
- Trò chuyện trực tiếp 🎙 (tool gọi qua `/api/chat/live/tool`, có thể chạy SQL).
- Ghi âm → biên bản, dịch trực tiếp, đọc to: không phải "task dữ liệu" → đề xuất KHÔNG tính.

**D. Câu của Creator đang được tính ở Bé Gấu** (Q3 13, Q4 6) nhưng bị loại ở Gấu Pro (s223) → lệch luật. Staging và production dùng
chung Supabase nên câu Hiếu QA trên staging cũng cộng vào KPI.

**E. Gấu Pro chỉ còn Creator (U5a)** → từ 08/10 Gấu Pro không còn đóng góp task (Q4 đã có 37 task Gấu Pro của bod, giữ nguyên). Người dùng
chuyển sang Bé Gấu — tổng không mất, chỉ đổi cột "agent". Hiển thị nên gộp "Bé Gấu + Gấu Pro (cũ)" để biểu đồ không tụt giả.

**F. Chất lượng câu trả lời ở Insights** đang chấm heuristic (độ dài/có số/có cấu trúc). Nay đã có 👍/👎 thật (`chat_feedback`, v59) và
khung trả lời mới (kết luận trước) — heuristic cũ có thể chấm sai câu ngắn gọn đúng.

## 4. Cần Hiếu chốt

1. **GA4/GSC/Lark Base** có tính là task không? (Đề xuất: CÓ — đều là truy vấn dữ liệu thật của công ty.)
2. **Việc chạy nền** tính mấy task? (Đề xuất: 1 việc nền = 1 task khi xong và có đọc dữ liệu, dù chạy nhiều chặng.)
3. **Việc theo lịch**: tính mỗi lần tự chạy, hay chỉ tính lần tạo? (Đề xuất: KHÔNG tính lần chạy tự động — 1 lịch hằng ngày sẽ thổi
   thêm ~90 task/quý mà không ai hỏi; lần tạo lịch đã là 1 câu chat.)
4. **Trò chuyện trực tiếp**: 1 phiên có đọc dữ liệu = 1 task? (Đề xuất: CÓ, 1 phiên = 1 task.)
5. **Loại câu của Creator** khỏi task Bé Gấu như Gấu Pro? Có tính lại Q3 (đã đóng) không? (Đề xuất: loại từ nay; Q3 tính lại bằng dữ liệu
   có sẵn — chỉ áp được luật A, D, và GA4/GSC nếu chọn CÓ ở câu 1, vì cột `tools_used` đã có từ s195+18-B.)

## 5. Các mốc (làm theo thứ tự, mỗi mốc commit + QA staging, Hiếu bảo merge `main`)

### T0 — Sửa lỗi 1.000 dòng (không cần chốt, làm trước)
- `lib/my-metrics-auto.ts`, `conversations`, `begau-insights`, `topics-ai`: đọc theo trang (`.range()` lặp tới hết) hoặc đếm bằng
  `count: "exact"` + lọc ở DB. Gom 1 hàm đọc dùng chung (vd `loadTaskEvents(start, end)` trong `lib/okr-helpers.ts`) để 4 nơi cùng 1 luật.
- Test: dữ liệu giả 2.500 dòng → đếm đủ. Verify sống: Q3 ra 235 (hoặc số theo luật mới).

### T1 — Một định nghĩa task duy nhất
- Đổi `DB_TASK_TOOLS` thành `DATA_TASK_TOOLS`: 4 tool cũ + `buildReport`, `b2bCustomerCm1`, `compareVendorQuotes`, `trackSKUWinRate`
  (+ `queryGA4`, `queryGSC`, `queryLarkBase` nếu câu 1 = CÓ). Một hàm `isDataTask(tools, role)` dùng chung cho mọi nơi ghi.
- Loại Creator ở Bé Gấu (câu 5) — cùng chỗ với Gấu Pro.
- Vì cờ `used_db_tool` quyết lúc GHI, đổi luật không áp cho dữ liệu cũ → T1 cũng tính lại cờ cho các dòng đã có từ `tools_used`
  (script 1 lần, chạy theo quý Hiếu chốt).

### T2 — Ghi log cho đường chưa ghi
- Chạy nền: gộp `toolsUsed` qua các chặng (lưu trong checkpoint `gp_jobs.state`), khi việc xong ghi 1 event `agent_id: "be-gau"`,
  `source: "job"`.
- Trò chuyện trực tiếp: route `/api/chat/live/log` (đã lưu transcript) ghi 1 event/phiên kèm tool đã gọi (`source: "live"`).
- Việc theo lịch / nghiên cứu sâu: theo câu 3 (đề xuất không ghi task; vẫn ghi chi phí cho dashboard).
- Phân biệt nguồn bằng cột có sẵn hoặc thêm cột `source` (web | lark | job | live) — kiểm cột thật bằng SQL trước khi dùng; nếu cần
  thêm cột thì viết migration v72 cho Hiếu chạy.

### T3 — Hiển thị
- Thẻ KPI + biểu đồ tháng: tách theo nguồn (Web / Lark / Chạy nền / Trực tiếp) thay vì chỉ Web/Lark; gộp Gấu Pro (cũ) vào Bé Gấu.
- Danh sách "hội thoại được tính": hiện nguồn + tool (đã có badge tool).
- Insights: thêm cột 👍/👎 thật từ `chat_feedback` cạnh điểm heuristic; xem lại heuristic với khung trả lời mới (câu ngắn có kết luận
  + bảng không bị chấm thấp).
- Giữ UI Strict Lock: chỉ thêm cột/nhãn trong khối Bé Gấu, không đổi màu/bố cục các khối khác.

### T4 — Kiểm & ghi tài liệu
- Đối chiếu: thẻ KPI = số dòng danh sách "được tính" = tổng breakdown (3 số khớp nhau) cho Q3 và Q4.
- Cập nhật wiki `analytics-my-metrics.md` (mục mới + bảng 5 KPI dòng "Tasks via Bé Gấu" ghi đúng định nghĩa mới — bảng hiện còn ghi
  định nghĩa cũ "≥15 ký tự").
- Ghi trong wiki: đổi luật làm số Q4 nhảy (tăng do tính thêm tool/chạy nền, giảm do loại Creator) — không phải lỗi.

## 6. Rủi ro
- Đổi định nghĩa giữa quý → số Q4 thay đổi so với hôm trước; ghi rõ ngày đổi luật trên thẻ KPI (tooltip) để không bị hiểu nhầm.
- Tính lại cờ cũ là GHI hàng loạt vào `app_usage_events` → chạy thử (đếm trước/sau) rồi mới ghi; chỉ đổi `used_db_tool`.
- N+1: ghi log việc nền/phiên trực tiếp là 1 insert/việc, không lặp theo tool.
