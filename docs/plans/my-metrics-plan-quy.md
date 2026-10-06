# Plan — My Metrics: Kế hoạch quý tự đo + Duyệt case Lark tự động + Đánh giá hằng ngày

> File TẠM (theo quy ước CLAUDE.md): xong hết mốc (hoặc Hiếu bỏ plan) thì xoá file, chuyển kiến thức còn giá trị sang wiki
> `docs/wiki/system/tabs/analytics-my-metrics.md`. Tạo 2026-10-06 (s225). **Trạng thái: CHỜ HIẾU DUYỆT — chưa code.**

Yêu cầu Hiếu (2026-10-06):
1. Kế hoạch quý: đổi vendor / giảm COGS ở 1 thị trường, mở sản phẩm hoặc nước mới, đạt KPI My Metrics, việc không đo bằng số, theo dõi báo
   giá vendor đang chào, destination nào nổi trội và trội ở vendor nào… — "trong vai người nhiều kinh nghiệm, list ra và làm".
2. Duyệt case Lark: case đã có emoji YES vẫn bị tính; bot không biết khi nào vấn đề thật sự xong; thread ban đầu không tag, giữa chừng mới
   tag Hiếu; Hiếu trả lời nhiều lần; bị tag chỉ để nắm tin/xem vẫn ra case → bot phải đọc cả thread, hiểu ngữ cảnh.
3. Đánh giá tự động: hiện trên trang + Lark DM hằng ngày.
4. Trước tiên: chỉ ra vấn đề, đề xuất hướng, làm plan để xem trước.

---

## A. Vấn đề — đo trên dữ liệu thật (Supabase `okr_lark_events`, 2026-10-06)

### A1. Bot Lark (SLA / Vendor Speed)
| # | Vấn đề | Bằng chứng | Gốc ở code |
|---|---|---|---|
| 1 | **Bot không thấy nội dung tin gốc** | `request_snippet` RỖNG ở mọi case đọc ra (rejected/pending/confirmed) — bot chỉ đoán từ các reply | Tin gốc dạng rich-text/thẻ/ảnh không được đọc ra chữ (cần xác minh `parseLarkContent` với tin gốc lấy qua `fetchMessageById`) |
| 2 | **Emoji không được dùng** | Anh báo case có YES vẫn bị tính | `lark-thread-scan.ts` có lấy `reaction_emojis` nhưng CHỈ của tin gốc, và `okr-lark-classify.ts` KHÔNG đưa emoji vào cho AI — bot không hề biết có YES |
| 3 | **Bot không biết ai là Hiếu** | Case "xong" bởi Tri Trong, Thanh My, Bao, Buck, Huy Lê… vẫn tính; anh từ chối nhiều case dạng này | Prompt chỉ nói "Product Ops trả lời", không đánh dấu tin nào của Hiếu, không có giờ gửi, không có ai bị tag |
| 4 | **Tính giờ sai khi bị tag giữa chừng** | Có case 102,7h, 78,9h, 112,6h — đếm từ lúc mở thread chứ không phải lúc Hiếu được tag | `request_time` = giờ tin gốc |
| 5 | **Phân loại 1 lần rồi thôi** | Case "chưa xong" (completion null) nằm im mãi; vẫn có case null mà bị xác nhận (không ra được số giờ) | Thread đã có trong bảng thì lần quét sau bỏ qua (dedupe theo `message_id`), reply mới không được đọc lại |
| 6 | **Bị tag để nắm tin vẫn ra case** | Anh báo; nhiều case từ chối là "thông báo/thảo luận" | Prompt không phân biệt "nhờ xử lý" với "tag để biết" |
| 7 | **Thread anh tự đăng vẫn bị phân loại** | Có case `request_sender = Nguyễn Hoàng Hiếu` trong danh sách đã từ chối | Kiểm tra "tự đăng" so `open_id` — có thể lệch giữa open_id app với open_id cá nhân, cần xác minh |
| 8 | **Tên người hiện mã `ou_…`** | Nhiều case pending hiện `ou_725bd…` thay vì tên | Tên chỉ lấy từ danh sách @mention, người không bị tag thì không có tên |
| 9 | **Mất case khi khoá quý** | Q3: 34 case treo không duyệt → khoá quý là mất; bot sai ~57% (25/44 đã xem) nên phải duyệt tay nhiều | `isQuarterLocked` khoá ngay ngày đầu quý sau, không có thời gian ân hạn |

### A2. Kế hoạch & đánh giá
- Không có chỗ ghi kế hoạch quý; không có cách nối "việc định làm" với số đo được.
- Target Q4 chưa nhập (đang dùng số mặc định code); KPI chỉ có số thực tế, không có "đáng lẽ phải đạt bao nhiêu tới hôm nay".
- Các số đã có ở tab Thị trường & Báo giá (đổi vendor, báo giá đang chào, destination chưa bán) chưa nối sang kế hoạch.

---

## B. Hướng giải quyết

### B1. Bot Lark v2 — đọc cả thread, hiểu ngữ cảnh, có ký hiệu cho anh đánh dấu
1. **Sửa dữ liệu đầu vào** (vấn đề 1, 7, 8): đọc được chữ của tin gốc mọi dạng (text, rich-text, thẻ; ảnh/file ghi "[ảnh]"/"[file tên…]"); tên
   người gửi lấy theo danh bạ Lark; sửa kiểm tra "tự đăng".
2. **Đưa đủ ngữ cảnh cho AI** (2, 3, 6): mỗi tin kèm giờ gửi, người gửi đánh dấu **[HIẾU]** / [người khác], ai bị @tag, emoji trên TỪNG tin
   (kể cả reply) và ai thả. AI trả về: có phải việc nhờ Hiếu xử lý không, **loại** (nhờ xử lý / tag để biết / thảo luận / tự đăng), **mốc bắt
   đầu** (lần đầu Hiếu được tag hoặc được nhờ), **mốc xong**, **độ chắc chắn 0–100**, lý do.
3. **Ký hiệu anh đánh dấu ngay trên Lark** (luật cứng, đè lên AI — không cần duyệt):
   - Thả **✅ (DONE)** vào tin trả lời cuối của anh → mốc xong = tin đó.
   - Thả **👀 (hoặc emoji anh chọn)** vào tin gốc / tin tag anh → "chỉ để biết", không tính.
   - **YES**: cần anh xác nhận nghĩa (xem C1) — hiện bot hoàn toàn bỏ qua emoji này.
   - Hoặc gõ cuối thread `#done` / `#skip` cho trường hợp không tiện thả emoji.
4. **Tính giờ đúng** (4): bắt đầu = lúc Hiếu được tag/được nhờ lần đầu (không phải lúc mở thread); xong = mốc ✅ hoặc mốc AI chọn trong các tin của
   **người được tính** (xem C2).
5. **Đọc lại thread đang mở** (5): case chưa xong được đọc lại mỗi lần quét (tối đa 14 ngày) cho tới khi có mốc xong/ký hiệu; thread có reply mới
   thì phân loại lại.
6. **Học từ quyết định của anh** (giảm duyệt tay): đưa 44 lần xác nhận/từ chối + ghi chú của anh làm ví dụ cho AI; mỗi lần anh sửa, ví dụ được
   bổ sung. Case **chắc ≥ ngưỡng** (vd 85) thì tự tính/tự bỏ, có nhãn "tự động" và sửa lại được; case lưng chừng mới vào hàng chờ.
7. **Duyệt nhanh trên Lark**: DM hằng ngày liệt kê case lưng chừng, anh trả lời `ok 12 15` / `bỏ 13` là xong, không cần mở web.
8. **Không mất case khi khoá quý** (9): ân hạn 7 ngày sau cuối quý mới khoá; trước khoá 3 ngày nhắc DM; hết ân hạn mà còn treo thì áp quyết
   định của bot (đánh dấu "tự quyết khi khoá quý"). Mở lại Q3 (một lần) để anh xử lý 34 case treo nếu anh muốn.

### B2. Kế hoạch quý tự đo — danh mục việc (theo kinh nghiệm Product Ops)
Mỗi việc trong kế hoạch = **loại việc + phạm vi + chỉ số + mốc đầu + mục tiêu + hạn**. Hệ thống tự lấy số, tự tính tiến độ, không nhập tay.

| Nhóm | Loại việc (mẫu có sẵn để chọn) | Chỉ số tự đo | Nguồn |
|---|---|---|---|
| **Giá vốn & vendor** | Đổi vendor ở 1 thị trường (vd China 3HK → BC CMHK) | % doanh thu thị trường qua vendor mới; số SKU đã chuyển; GM% thị trường trước/sau | tab Thị trường (`market-data`) |
| | Giảm COGS 1 nhóm gói / thị trường | Giá vốn TB mỗi gói (đ) trước/sau; % gói còn có nơi rẻ hơn | so giá vendor (`quote-compare`) |
| | Giảm phụ thuộc 1 vendor | Tỷ trọng doanh thu vendor lớn nhất (vd 3HK 67% → ≤ 60%) | `market-data` |
| **Sản phẩm & destination** | Mở nước / destination mới | Số nước mới có product Active; doanh thu SKU mới trong quý | `products`, `market-data` |
| | Mở sản phẩm mới (SKU) | Số SKU mới Active; doanh thu + GM% của SKU mới | `skus`, fact |
| | Dọn danh mục | Số SKU Active 90 ngày không bán; số SKU biên lãi < X% hoặc âm | `skus`, fact |
| **Báo giá vendor** | Đánh giá hết báo giá đang chào | Số báo giá chờ xem / đã quyết; số ngày từ lúc nhận tới quyết | `vendor_quotes` |
| | Chốt vendor cho destination nổi trội | Với mỗi destination top doanh thu: vendor rẻ nhất hiện tại vs đang dùng, % chênh | tab Thị trường |
| **KPI My Metrics** | Đạt SLA, Vendor Speed, SKU GM, %Datapool, Task Bé Gấu | Thực tế vs **mức lẽ ra phải đạt hôm nay** (theo số ngày đã qua) | My Metrics hiện có |
| **Không đo bằng số** | Quy trình, đào tạo, tài liệu… | Tick xong/chưa + hạn + ghi chú; nhắc khi gần hạn | nhập tay |

Ngoài kế hoạch, thêm **cảnh báo tự động** (không cần anh đặt mục tiêu) — những thứ người làm Product Ops nhiều năm luôn canh:
- Báo giá mới / vendor mới rẻ hơn ≥ X% cho thị trường top 10.
- SKU bán nhiều có biên lãi tụt mạnh so tháng trước (giá vốn tăng / giá bán giảm).
- Thị trường top 10 doanh thu giảm ≥ 20% so cùng kỳ tháng trước.
- SKU Temporary (sắp hết hàng) đang bán chạy.
- Destination khách hỏi/đặt nhiều mà chưa có sản phẩm riêng (từ danh sách "nước chưa có gói riêng").

### B3. Đánh giá tự động — trên trang + Lark DM hằng ngày
- Đầu My Metrics: khối **"Đánh giá hôm nay"** viết bằng lời: điểm OKR dự kiến cuối quý, KPI nào đúng tiến độ / chậm (kèm "cần thêm bao nhiêu mỗi
  tuần để kịp"), việc kế hoạch nào trễ hạn, case Lark cần anh xem, cảnh báo mới.
- **Lark DM 8:30 sáng** (giờ VN) cùng nội dung tóm gọn + link; chỉ gửi phần có thay đổi so hôm qua để không thành spam. Chạy bằng cron hiện có
  (cron-job.org gọi mỗi giờ) — không cần Vercel Pro.

---

## C. Câu hỏi cần Hiếu chốt (trước khi code)
1. **Emoji YES nghĩa là gì?** (a) "đã xong" — lấy làm mốc hoàn thành; (b) "không tính case này"; (c) khác. Ai thả mới có hiệu lực — chỉ anh, hay
   cả người hỏi?
2. **Ai trả lời thì tính cho KPI của anh?** Hiện có case xong bởi Thanh My, Tri Trong, Bao, Buck… — anh xác nhận một số, từ chối một số. Chốt: chỉ
   tin của anh / anh + team Product Ops (liệt kê tên) / ai cũng được miễn đúng việc.
3. **Ký hiệu đánh dấu**: dùng ✅ (xong) + 👀 (chỉ để biết) + `#done`/`#skip` được không, hay anh muốn emoji khác?
4. **Ngưỡng tự quyết**: bot chắc ≥ 85 thì tự tính — được không? Muốn khởi đầu an toàn hơn (chỉ tự BỎ case rõ ràng không phải việc, còn tự TÍNH
   thì vẫn hỏi) không?
5. **Mở lại Q3** để xử lý 34 case treo? (ảnh hưởng số SLA Q3 đã khoá)
6. **Giờ gửi Lark DM** hằng ngày (đề xuất 8:30).
7. Danh mục việc ở B2: thêm/bớt gì? Ngưỡng cảnh báo (X% rẻ hơn, biên lãi tụt bao nhiêu) muốn đặt bao nhiêu?

---

## D. Lộ trình (mỗi mốc commit + QA trên staging, xong mốc nào báo mốc đó)
| Mốc | Nội dung | Cần migration | Ước lượng |
|---|---|---|---|
| **M0** | Sửa dữ liệu bot: đọc chữ tin gốc, tên người, kiểm "tự đăng", emoji mọi tin; ân hạn khoá quý 7 ngày | không | nhỏ |
| **M1** | Bot v2: ngữ cảnh đầy đủ (HIẾU/giờ/tag/emoji), mốc bắt đầu = lúc được tag, ký hiệu ✅/👀/#done/#skip, đọc lại thread đang mở, độ chắc chắn | v70: thêm cột `start_reason`, `confidence`, `auto_decided`, `last_checked_at` vào `okr_lark_events` | vừa |
| **M2** | Học từ quyết định cũ + tự quyết theo ngưỡng + duyệt nhanh qua Lark DM | không | vừa |
| **M3** | Kế hoạch quý: bảng `okr_plan_items`, mẫu việc ở B2, tự tính tiến độ từ tab Thị trường/So giá/sản phẩm | v71: `okr_plan_items` | lớn |
| **M4** | Đánh giá hôm nay + cảnh báo tự động + Lark DM hằng ngày | không (dùng `app_settings`) | vừa |
| **M5** | Đối chiếu sau 2 tuần chạy thật: tỷ lệ bot đúng, số case anh còn phải duyệt, chỉnh ngưỡng | không | nhỏ |

Thứ tự đề xuất: M0 → M1 → M2 (giải quyết nỗi đau duyệt tay trước, Q4 đã có case chờ) → M3 → M4 → M5.
