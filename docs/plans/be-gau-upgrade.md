# Plan — Nâng cấp toàn diện Bé Gấu, chuyển giao tính năng tốt nhất từ Gấu Pro

> File TẠM (quy ước CLAUDE.md): xong hết mốc (hoặc Hiếu bỏ plan) thì xoá file, chuyển kiến thức còn giá trị sang wiki
> `docs/wiki/system/tabs/chatbot.md` + `analytics-creator-ai.md`. Tạo 2026-10-07 (s227e). **Trạng thái (2026-10-07): Hiếu đã duyệt. Thứ tự làm: U1 → U3 → U2 → U4 → U0. U1 XONG (staging, eval 8,72 → 9,85/10). U3 XONG trên staging (s228, chưa merge): bảng phân quyền, kế hoạch+Dừng, trí nhớ, Live theo vai trò, tool CM1 B2B, lọc lộ tên bảng, chạy nền, TTS, ghi âm→biên bản, việc theo lịch, nghiên cứu sâu, dịch trực tiếp, lỗi §1 (trừ cron trễ ~1h — cấu hình cron-job.org). Bridge/file máy trong Bé Gấu: để Gấu Pro (creator). U2 XONG trên staging (s228): buildReport Word/Excel/PPT/PDF + Lark Docs có biểu đồ, số lấy lại từ SQL, chạy code Python. U4 XONG trên staging (s228): thanh trên chọn hội thoại + ⋯, 🎤 nói thành chữ, cuộn thông minh/thu gọn — Bé Gấu + Gấu Pro (Trực tiếp vẫn là cửa sổ riêng). Tiếp: U0 (ảnh/video Google), rồi U5 bàn riêng.
> Lark mức A + định dạng card Lark đã làm ở s227d (`main` `741e59d0`).**

## 0. Bối cảnh & quyết định đã chốt

Hiếu (2026-10-07): mọi người dùng Bé Gấu, một số người quan trọng dùng Gấu Pro. Gấu Pro vẫn phải nhờ sửa code nhiều (làm file chưa đẹp…),
khả năng đối đáp / phân tích / tóm tắt của cả hai còn hạn chế. Muốn đưa chức năng tốt nhất của Gấu Pro sang Bé Gấu và nâng cấp toàn diện.

Đã chốt:
1. **Chưa khoá Gấu Pro** — chuyển giao và nâng cấp Bé Gấu trước, khoá tính sau (mốc U5).
2. **Lark mức A cho mọi người** — bot tạo Doc/Sheet/Task cho người hỏi theo `users.lark_open_id`, DM báo trước rồi mới làm, luôn kèm link.
   **Đã xong s227d.** Mức B (bot thao tác dưới tên người dùng, đọc/sửa file riêng của họ) chưa làm — rủi ro xem §5.
3. **Hạn mức API Gemini thoải mái** tới hết năm 2026 → được dùng model mạnh/đắt (Pro, Deep Research, Veo, Nano Banana Pro).
4. **Bỏ Pollinations, Stability, Kling** → chuyển hết tạo ảnh/video sang Google.
5. **Thương hiệu** (lấy từ gohub.vn): logo chữ "gohub" xanh đậm + "travel like a local"; màu xanh chủ đạo `#1446A5`, xanh đậm
   `#003A93`, xanh nhạt `#009CE0`, chữ `#0F1012`, nền `#F7F8F8`; phong cách trắng sạch, khối xanh bo góc.

Hiếu duyệt (2026-10-07):
6. **Thứ tự mốc: U1 → U3 → U2 → U4 → U0.**
7. **U3 có trang/bảng phân quyền tính năng theo vai trò, làm giao diện đẹp** (bật/tắt từng tính năng cho từng vai trò, xem nhanh ai dùng được gì).
8. **Bộ câu hỏi eval: em soạn, gửi Hiếu duyệt** → `docs/plans/be-gau-eval-questions.md`.
9. **Trò chuyện trực tiếp mở theo vai trò** (phải được phân quyền trong bảng ở U3).
10. **U5 bàn sau khi xong U4.**

## 1. Hiện trạng (đo trong code + API, 2026-10-07)

- **Bé Gấu** (`lib/agents/be-gau.ts`, 559 dòng): 8 tool gốc (SQL, Supabase, sản phẩm, KB, web, GA4, GSC) + `larkWorkspace` + 6 tool mượn từ
  Gấu Pro (ảnh, xu hướng, Lark Base đọc, so giá vendor, win-rate SKU, tìm KB) + tool admin-only. Còn SDK cũ `@google/generative-ai`.
- **Gấu Pro** (`lib/agents/creator-ai.ts` 720 dòng + `creator/`): 41 tool, SDK mới `@google/genai`, skills nạp khi cần, kế hoạch + Dừng,
  chạy nền theo chặng, trí nhớ 2 tầng, việc theo lịch, phiên Trực tiếp (Gemini Live), cổng duyệt chống prompt injection.
  Trang `/analytics/creator/ai` 1.289 dòng, nhiều nút rải rác (Cuộc trò chuyện mới, 🎙 Trực tiếp, Lịch sử, Trí nhớ, Việc & duyệt, Lượt chạy).
- **Cả hai**: `gemini-3.8-flash`, `temperature 0`, `thinkingLevel "low"` cho MỌI câu → câu phân tích/kế hoạch bị nông. Không phân
  loại độ khó. Câu trả lời không theo khung cố định. QA s227d: Bé Gấu tự nhận xét "Thái Lan cần tối ưu giá vốn/chuyển Datapool" — sai với
  phân tích (Truemove là nguồn rẻ nhất) → thiếu "kết luận nghiệp vụ đã chốt".
- **Xuất file**: model viết markdown + khối ```export → trình duyệt đổi sang Excel/Word/PDF (`components/chat-export.tsx`) — không mẫu,
  không định dạng, không biểu đồ.
- **Tạo ảnh/video**: Pollinations (Flux free) + Stability, video Kling — chưa dùng Nano Banana/Veo dù key đã có quyền.
- **Lỗi còn mở** (wiki `analytics-creator-ai.md` §s223): cổng duyệt chỉ nhớ "nhiễm" trong 1 lượt; Lark DM chưa hiện kế hoạch, chưa tóm tắt
  hội thoại cho `searchPastConversations`; việc theo lịch trễ tới ~1h (cron-job.org `scheduled-messages` trỏ staging).

### Model API key dùng được (ListModels 2026-10-07, 62 model — gọi thử trước khi dùng thật)
| Việc | Model |
|---|---|
| Trả lời nhanh | `gemini-3.8-flash` (đang dùng) |
| Phân tích sâu | `gemini-3.8-flash` thinking high, `gemini-pro-latest`, `gemini-3.1-pro-preview` (so bằng eval) |
| Việc phụ rẻ | `gemini-3.5-flash-lite`, `gemini-flash-lite-latest` |
| Ảnh | Nano Banana 2 / 2.1 (`gemini-3.1-flash-image`, `gemini-nano-banana-2.1`), Nano Banana Pro (`gemini-3-pro-image`) |
| Video | Veo 3.1 (`veo-3.1-generate-preview`, `-fast-`, `-lite-`) |
| Giọng nói | TTS `gemini-3.8-flash-tts`; ghi chép `gemini-3.5-transcribe`; Live `gemini-3.8-live` (+ `-extended-thinking`); dịch `gemini-3.5-live-translate-preview` |
| Nghiên cứu dài | `deep-research-preview-04-2026`, `deep-research-max-preview-04-2026` |
| Điều khiển trình duyệt | `gemini-2.5-computer-use-preview-10-2025` |
| Tìm kiến thức | `gemini-embedding-2` (thay `gemini-embedding-001`) |
| Agent lập trình | `antigravity-preview-latest` (cho mốc U5, cần thử) |

## 2. Hướng tổng: một trợ lý, hai mức quyền
Bé Gấu và Gấu Pro dùng **một lõi agent chung** (vòng lặp function-calling, SDK `@google/genai`, skills, kế hoạch/Dừng, chạy nền, trí nhớ,
cổng duyệt). Khác nhau chỉ ở **bộ tool theo vai trò** (1 bảng policy). Sửa 1 chỗ cả hai cùng có. Trang Gấu Pro = Bé Gấu + tool riêng Creator.

## 3. Các mốc (mỗi mốc: commit + QA staging, Hiếu bảo merge `main`)

### U0 — Ảnh/video sang Google (nhỏ, làm sớm, độc lập)
- Tạo ảnh: Nano Banana 2.1 mặc định, Nano Banana Pro khi cần chất lượng cao / chữ trong ảnh; **sửa ảnh theo ảnh gốc** (banner, ảnh sản
  phẩm, đổi nền) từ ảnh người dùng đính kèm.
- Video: Veo 3.1 (fast mặc định, full khi được yêu cầu), giữ cách chạy nền + kiểm trạng thái.
- Xoá code + env Pollinations / Stability / Kling. Mở tạo ảnh cho mọi vai trò (hạn mức thoải mái); video theo vai trò.
- Xong khi: tạo ảnh/sửa ảnh/video chạy trên staging, không còn gọi dịch vụ cũ.

### U1 — Lõi chung + nâng chất lượng trả lời (quan trọng nhất)
- Gộp lõi: Bé Gấu chuyển sang lõi của Gấu Pro (SDK mới), tool theo bảng policy vai trò. ✅ U1b (2026-10-07): vòng lặp chung `lib/agents/core/agent-loop.ts`; bảng policy vai trò làm ở U3.
- **Chia theo độ khó**: tra cứu → flash/low; phân tích, so sánh, lập kế hoạch → thinking high hoặc Pro; báo cáo dài/nghiên cứu → chạy nền
  (Deep Research khi cần nguồn ngoài). Chọn model bằng eval, không đoán.
- **Quy trình trả lời**: hiểu câu hỏi → lấy số → tính bằng code (U2) → tự kiểm số → trả lời theo khung: **kết luận trước** (1–3 câu),
  số chính (bảng), giải thích ngắn, việc nên làm, nguồn + kỳ dữ liệu. Độ dài theo câu hỏi.
- **Hỏi lại khi mơ hồ** (kỳ nào, B2B/B2C, nước nào) hoặc tự chọn và nói rõ giả định.
- **Kiến thức nghiệp vụ đã chốt**: khối "sự thật đã chốt" nạp theo chủ đề (thứ tự ưu tiên vendor + ngoại lệ, KDDI giữ vì phí quảng cáo,
  Truemove Thái rẻ nhất, mục tiêu %Datapool Q4 75%, định nghĩa CM1/GP/Datapool…), lấy từ wiki business + KB, cập nhật khi wiki đổi.
- **Bộ câu hỏi kiểm tra (eval)**: 40 câu thật (lấy từ `app_usage_events` + Hiếu bổ sung) kèm đáp án/tiêu chí; chạy baseline trước khi
  đổi, chạy lại mỗi lần đổi lõi/model/prompt; lưu điểm.
- 👍/👎 trên câu trả lời (bảng `chat_feedback` đã có) → gom câu bị chê hằng tuần.
- Xong khi: eval tăng rõ so baseline ở nhóm câu phân tích, không tụt ở nhóm tra cứu; Bé Gấu chạy SDK mới.

### U2 — Phân tích dữ liệu & báo cáo đẹp
- **Chạy code Python** (công cụ code execution của Gemini: pandas, matplotlib) để tính toán, bảng chéo, xu hướng, vẽ biểu đồ từ kết quả
  SQL hoặc file người dùng tải lên — thay cho tự nhẩm.
- **Bộ dựng báo cáo ở server**: model trả về *khung báo cáo* (JSON: mục, bảng, biểu đồ, ô số, nhận xét) → server dựng theo mẫu GoHub:
  Word (docx: tiêu đề, mục lục, bảng có khung, số kiểu Việt, biểu đồ), Excel (định dạng số, cố định tiêu đề, bộ lọc, nhiều sheet, biểu đồ
  gốc, công thức), PowerPoint (slide báo cáo), PDF. Biểu đồ vẽ ở server, một bảng màu thương hiệu.
- Ghi thẳng vào Lark Docs/Sheets của người hỏi (mức A) kèm bảng + ảnh biểu đồ; luôn có link.
- Tự kiểm số trước khi trả (đối chiếu lại SQL, như `verifyReportNumbers` của Gấu Pro).
- Xong khi: 1 yêu cầu "làm báo cáo X" ra được file Word/Excel/PPT đẹp + bản Lark Docs, số khớp SQL.

### U3 — Chuyển tính năng Gấu Pro sang Bé Gấu
| Mức | Tính năng |
|---|---|
| Mọi người | Kế hoạch từng bước + Dừng; trí nhớ hội thoại + tìm hội thoại cũ; chạy nền (báo cáo dài); đọc câu trả lời (TTS); ghi âm cuộc họp → biên bản (transcribe); so giá vendor (che giá vốn theo quyền) |
| Theo quyền (Hiếu bật theo vai trò trong bảng phân quyền) | Trò chuyện trực tiếp (Live); duyệt web; Deep Research; việc theo lịch; dịch trực tiếp (CS); video Veo |
| Chỉ Creator | Bridge điều khiển trình duyệt cá nhân (+ computer-use), gửi Lark cho người khác, ghi KB/duyệt bài học, portal vendor, đọc file trên máy |
- Sửa kèm các lỗi còn mở ở §1 (cổng duyệt nhớ qua nhiều lượt, Lark DM hiện kế hoạch + tóm tắt hội thoại, việc theo lịch chạy đúng giờ).
- Trí nhớ cá nhân bật theo người (`gp_personal_features`), mặc định tắt cho tới khi Hiếu duyệt từng nhóm.

### U4 — Giao diện chat mới (Bé Gấu, Gấu Pro dùng chung)
- Thanh trên: tên hội thoại (bấm → danh sách lịch sử; "Cuộc mới" để trong đó) + nút **⋯** (Trí nhớ, Việc & duyệt, Lượt chạy chỉ Creator,
  Cài đặt; chấm đỏ khi có việc chờ duyệt). Thẻ duyệt vẫn hiện ngay trong khung chat.
- Ô nhập: 📎 đính kèm · 🎤 (bấm = đọc thành chữ; chuyển sang **Trò chuyện trực tiếp ngay trong khung**, nút màn hình/camera chỉ hiện khi
  đang trực tiếp) · Gửi/Dừng.
- Hội thoại dài: mở ra tự xuống tin mới nhất; nút "↓ Tin mới nhất" khi cuộn lên; tin cũ thu gọn "Tóm tắt N tin trước"; tải tin cũ theo
  trang khi cuộn lên. Mô hình dùng tóm tắt + tin gần nhất (đã có) → không cần tạo cuộc mới để giữ ngữ cảnh.
- Giữ UI Strict Lock: chỉ đổi khung chat, không đụng các tab analytics.

### U5 — Sau cùng (CHƯA CHỐT, cần Hiếu quyết riêng)
- Khoá Gấu Pro với người không phải Creator (màn hình "Đang cập nhật, mọi chức năng đã chuyển sang Bé Gấu" + nút Mở Bé Gấu), chuyển hội
  thoại + trí nhớ cũ của họ sang Bé Gấu.
- Gấu Pro lập kế hoạch → Claude Code thực hiện: phiếu yêu cầu → Hiếu duyệt (web/Lark) → Gấu Pro soạn plan + prompt → Claude Code chạy
  (đề xuất GitHub Actions, nhánh riêng, chỉ mở PR vào staging) → câu hỏi của Claude chuyển qua Gấu Pro/Lark → kết quả + link staging qua
  Lark → Hiếu bảo merge. Ranh giới: chỉ chạy khi Hiếu duyệt từng phiếu, prompt không lấy từ nội dung ngoài, không khoá bí mật production,
  không push main, không chạy migration, giới hạn thời gian/chi phí.

## 4. Thứ tự (Hiếu chốt)
U1 (lõi + chất lượng) → U3 (chuyển tính năng + bảng phân quyền) → U2 (báo cáo) → U4 (giao diện) → U0 (ảnh/video Google) → U5 (bàn sau U4).

## 5. Rủi ro & chốt chặn
- **Prompt injection** (nội dung web/file/tin nhắn chứa lệnh): giữ cổng duyệt cho mọi hành động gửi/ghi khi lượt đã đọc nội dung ngoài,
  sửa để nhớ qua nhiều lượt; tool nguy hiểm chỉ Creator.
- **Lộ dữ liệu giữa người dùng**: không học vào KB chung từ tài liệu/riêng của một người; trí nhớ cá nhân tách theo người; che giá vốn theo quyền.
- **Mức B Lark** (nếu sau này làm): mã hoá token, quyền tối thiểu, ghi file có sẵn phải duyệt, mặc định chỉ ghi file mới/nối thêm, công tắc
  từng người, thu hồi khi nghỉ việc.
- **Model preview đổi/gỡ**: mọi model qua `lib/ai-models.ts` + env, cron `gemini-model-watch` báo model mới; eval trước khi đổi.
- **Chi phí**: hạn mức thoải mái tới hết 2026 nhưng vẫn ghi token/chi phí theo người (`app_usage_events`) để xem trên dashboard.

## 6. Còn cần Hiếu
- Duyệt bộ câu hỏi eval `be-gau-eval-questions.md` (thêm/bớt/sửa tiêu chí) → em chạy baseline rồi mới đổi lõi.
