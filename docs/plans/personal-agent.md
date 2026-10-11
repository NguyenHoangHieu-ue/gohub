# Plan: Agent cá nhân cho từng người (Personal Agent) — trí nhớ v2

> File TẠM. Xong hết mốc (hoặc Hiếu bỏ plan) thì xoá file + xoá dòng trong CLAUDE.md, chuyển kiến thức còn giá trị sang wiki
> `docs/wiki/system/tabs/analytics-creator-ai.md`.
> Lập 2026-10-09 (s229), Hiếu duyệt hướng thu gọn. CHƯA bắt đầu code.

## 1. Mục tiêu
Mỗi người một agent riêng, trí nhớ lớn lên theo thời gian, nhớ đúng cái đang còn hiệu lực. Hiếu test trước, sau đó mở cho mọi người trong công ty muốn dùng.
Ý tưởng lấy từ khoá luận `D:\Khoa_Luan` (PKG-Mem: hybrid retrieval, temporal supersedence, retention) nhưng CHỈ dùng lại thiết kế, prompt, bộ eval —
KHÔNG ghép codebase (khoá luận: Python + Neo4j; sản phẩm: TypeScript + Supabase).

## 2. Hiện trạng đo thật (2026-10-09, chỉ đếm)
- `assistant_memory` 31 mục (cả hệ thống); `gp_conversation_memory` 6 dòng / 537 hội thoại (tầng Recall gần như chưa chạy).
- `conversation_messages` 578 dòng (đầy đủ chỉ từ v68); `app_usage_events` 8.134 dòng giữ phần lớn lịch sử thật; `gp_runs` 196.
- Quy mô mỗi người vài chục → vài trăm mục: graph 2 bước chưa có lợi. Khoá luận cũng ghi graph thuần (F1 0,417) kém vector thuần (0,468).

## 3. Kiến trúc chốt
- **3 tầng kiểu MemGPT/Letta**: Core (luôn trong prompt, ≤1.500 token: hồ sơ, vai trò, dự án đang làm, sở thích) · Recall (tóm tắt hội thoại) · Archival (bảng fact + vector).
- **Postgres (Supabase), KHÔNG Neo4j** (Vercel serverless không có chỗ host). Dùng pgvector (đã có, `gemini-embedding-001` 768 chiều).
- **Bảng fact có 2 mốc thời gian**: `valid_from`/`valid_to` (đúng ngoài đời) + `recorded_at` (lúc ghi nhận), kèm nguồn (tin nhắn nào), độ tin cậy,
  `superseded_by`. Đây là phiên bản tối giản của graph; multi-hop làm kiểu agentic (agent gọi `recallMemory` nhiều lần), không viết truy vấn đệ quy.
- **Tìm kiếm lai**: Postgres full-text (`unaccent`) + vector + RRF. Mã SKU, tên riêng, tiếng Việt không dấu khớp kém nếu chỉ embedding.
- **Tool `recallMemory(query, as_of?)`**; job gộp ban đêm (gộp trùng, đóng mục hết hiệu lực, viết lại khối core).
- **`agent_profiles(username)`**: persona, mục tiêu, kênh (web, Lark DM), tool được dùng (lấy từ bảng tính năng theo vai trò đã có), namespace trí nhớ.
  Agent kế thừa ĐÚNG quyền của người dùng, không rộng hơn. RLS theo `username`; Creator/admin mặc định KHÔNG đọc trí nhớ người khác.
- **Quyền người dùng**: xem, sửa, xoá, xuất, tắt trí nhớ; ghi rõ "nhớ vì sao" (nguồn tin nhắn).
- Giữ nguyên: rút trí nhớ CHỈ từ tin nhắn người dùng (chống đầu độc), cổng duyệt, trace `gp_runs`, `@google/genai`.
- Phương án đo cùng: **trí nhớ dạng markdown** (kiểu memory tool của Claude) — mỗi người 1 tài liệu core tự sửa được; P0 so 2 phương án, chọn cái thắng.

## 4. Bỏ / hoãn (có chủ đích)
Neo4j · truy vấn graph 2 bước + centrality · giao diện đồ thị · MCP · LLM local (Vercel không gọi được máy Hiếu) · agent tự học skill
(skill lưu lâu dài là điểm cài prompt injection). Graph/UI/MCP chỉ vào lại nếu eval chứng minh cần.

## 5. Lộ trình (ước lượng thô)
| Bước | Việc | Cỡ |
|---|---|---|
| P0 | Bộ 30–50 câu hỏi trí nhớ trên dữ liệu của Hiếu (Hiếu duyệt đáp án) + chấm hệ thống hiện tại + so với markdown; đo chi phí thật/lượt (`est_cost_usd`) | 1–2 ngày |
| P1 | Migration v72 (bảng fact), supersedence, tìm kiếm lai, `recallMemory`, job gộp ban đêm | 2–4 ngày |
| P2 | Sửa lỗ hổng nền (Recall chưa chạy, Lark DM chưa tóm tắt, "nhiễm" chỉ tính 1 lượt, cron-job.org trỏ staging) + quyền người dùng | 2–3 ngày |
| P3 | `agent_profiles`, mở cho vài người test rồi cả công ty (cờ `gp_personal_features` theo người, hiện chỉ "all hoặc creator") | 2–3 ngày |
| Sau | Graph, UI đồ thị, MCP — chỉ khi P1 đo ra câu nhiều bước hỏng | — |

**Cổng:** P1 chỉ làm tiếp nếu P0 cho thấy khoảng cải thiện; mỗi bước so A/B với cái cũ trên bộ eval P0.

## 6. Rủi ro cần xử lý
- **Race**: rút trí nhớ chạy trong `waitUntil` có thể đè lên lượt kế tiếp → ghi idempotent, đóng mục cũ trong 1 transaction.
- **Dữ liệu cá nhân của ~47 người** (Nghị định 13/2023): cần thông báo, đồng ý, thời hạn lưu; hỏi pháp chế trước khi mở cho cả công ty.
- **Eval bằng LLM có thiên lệch**: Hiếu tự duyệt đáp án.
- **Chi phí**: thêm 1 lệnh gọi rút trí nhớ mỗi lượt; đo ở P0.
- **Khoá luận**: bảng ở mục 7.5 đề cương là giả thuyết, không phải kết quả; dữ liệu sản phẩm đưa vào khoá luận phải ẩn danh.

## 7. Câu hỏi còn mở
- Tên sản phẩm cho người dùng: lớp agent cá nhân dùng chung lõi với Bé Gấu (Gấu Pro vẫn là bản siêu tập của Hiếu) — chốt khi tới P3.
- Thời hạn lưu trí nhớ và nội dung thông báo cho nhân viên.

## 8. Kết quả P0 (2026-10-09, staging, hệ thống HIỆN TẠI)
Bộ eval: `web/eval/memory-cases.json` (persona tổng hợp "Minh Anh", 32 câu, 7 nhóm) + chế độ `--stress N` (N khách giả, thêm 15 câu); route `/api/admin/eval/memory`;
runner `web/scripts/eval-memory.mjs`; kết quả `web/eval/results/memory-baseline.md`, `memory-stress60.md`. Giám khảo Gemini có bảng sự thật đầy đủ.

| Nhóm | Baseline (12 mục) | Stress 60 khách (72 mục) |
|---|---|---|
| single_fact / preference / update / multi_hop / abstention / conversation_recall | 100% | 100% |
| history (hỏi giá trị CŨ) | 80% | 100% (kịch bản chính) |
| **stress_history** (giá trị cũ của khách giả) | — | **0% (0/5)** |
| stress_current / stress_market | — | 100% / 100% |
| Tổng đúng | 97% | 89% |

Kết luận (một lần chạy, mỗi nhóm 4–5 câu — đủ để định hướng, KHÔNG đủ để kết luận thống kê):
1. **Điểm yếu thật duy nhất là lịch sử**: cập nhật đang GHI ĐÈ nội dung nên giá trị cũ mất (hỏi "trước khi đổi là bao nhiêu" → 0/5; đầu mối cũ còn,
   mục tiêu cũ mất). Đây đúng là supersedence/`valid_to` của P1 — có bằng chứng để làm.
2. **Multi-hop 100%, update hiện tại 100%** ở quy mô này → CHƯA có lý do làm graph. Giữ quyết định hoãn graph.
3. **Trần prompt bắt đầu cắn**: 72 mục = 8.653 ký tự, vượt `MAX_INJECT_CHARS` 8.000. Các câu hỏi vẫn đúng vì model tự gọi `assistantMemory list`/`searchPastConversations`
   (14/47 câu gọi tool) — nhưng đó là cách tốn kém. Chưa thử 200+ mục: cần chạy `--stress 150` trước khi khẳng định retrieval theo ngữ cảnh là bắt buộc.
4. **Chi phí do prompt nền, không do trí nhớ**: token vào TB ~32.000–35.000/câu (tối thiểu ~15.400 cho câu đơn giản; tối đa ~212.000 khi nhiều vòng tool). Khối trí nhớ
   chỉ ~600–2.500 token. → Ưu tiên **context caching phần prompt tĩnh** (lợi lớn hơn mọi thay đổi trí nhớ). Chưa đo chi phí rút trí nhớ (1 lệnh gọi/lượt, ~2–4s).
5. Bỏ qua câu nhiễu tốt: 0 mục sai từ 2 lượt tra cứu số liệu. Rút trí nhớ tối đa 2 mục/lượt chưa bị thử (kịch bản stress ≤ 2 sự kiện/lượt).
6. Giám khảo có nhiễu: cờ "bịa" ~16% phần lớn do thêm năm/diễn giải; chỉ dùng cờ "đúng". Chạy lặp ≥3 lần trước khi so A/B ở P1.

**Quyết định cổng P0:** đi tiếp P1, nhưng đổi thứ tự ưu tiên: (a) lịch sử/supersedence không ghi đè (`valid_to`, giữ bản cũ), (b) nạp trí nhớ theo ngữ cảnh thay vì đổ
tất cả khi vượt trần, (c) context caching prompt tĩnh (đo trước/sau), (d) phương án markdown vẫn chưa đo — làm trong P1 nếu cần so.

## 9. Tiến độ P1
- [x] (a) Lịch sử không ghi đè: v72 `history JSONB` + code + test (commit s229). **Chờ Hiếu chạy v72**, rồi chạy lại `eval-memory.mjs --stress 60` để đo stress_history.
- [x] (b1) Bộ rút trí nhớ lấy mục liên quan thay vì 120 mục đầu (xem mục 11). [ ] (b2) Nạp trí nhớ vào prompt theo ngữ cảnh khi vượt trần; (c) context caching prompt tĩnh; (d) so markdown. Stress 150 chưa chạy được (máy hết RAM, 2026-10-09) — chạy lại khi Hiếu bảo.
- [x] (e)(b2)(c) xong 2026-10-11, (f) hoãn — xem mục 12.

## 10. Kết quả stress 150 (2026-10-09, SAU v72) — đúng 100% nhưng KHÔNG chứng minh v72
`web/eval/results/memory-stress150.md`: 47 câu đúng 100% (kể cả stress_history 5/5, trước v72 ở stress 60 là 0/5), bịa 2%, token vào TB ~37.100/câu, 20/47 câu gọi tool.
Soi dữ liệu nạp (dump) cho thấy KẾT QUẢ BỊ NHIỄU, đừng đọc là "v72 đã sửa lịch sử":
1. **629 mục cho 150 khách** (stress 60 chỉ 72 mục cho 60 khách). Cột `history` chỉ được dùng **4 lần**, cả 4 ở persona chính, 0 lần ở khách giả.
   Nguyên nhân: bộ rút trí nhớ chỉ nhìn **120 mục đầu** của trí nhớ hiện có (`extractMemoriesFromTurn`: `.slice(0, 120)`), vượt 120 thì không thấy mục cũ để `update` →
   chỉ `save` thêm mục mới. Giá trị cũ sống sót nhờ mục trùng lặp, không nhờ lịch sử. → **Lỗi quy mô thật**: vượt ~120 mục thì mất khử trùng + mất supersedence.
2. **Khối prompt đã đầy** (8.790 ký tự cho 629 mục: chỉ ~7% mục lọt vào prompt). Câu vẫn đúng vì model tự gọi `assistantMemory list` có `query` (tìm chuỗi `ilike`),
   nên tìm theo TÊN RIÊNG hiệu quả; chi phí token không tăng đáng kể (37k so với 35k).
3. **Bộ câu hỏi chưa đủ khó** (trần 100% lần nữa): toàn câu có tên khách chính xác. Chưa thử: hỏi không nêu tên, đếm/tổng hợp ("bao nhiêu khách ở Nhật?"), xung đột giữa mục cũ và mới, hỏi nhiều khách một lúc.
Việc tiếp theo: (i) rút trí nhớ phải lấy **mục LIÊN QUAN** tới tin nhắn (tìm theo tên/ý) thay vì 120 mục đầu; (ii) chạy lại `--stress 60` sau v72 để so đúng baseline (stress_history trước 0/5);
(iii) thêm nhóm câu hỏi khó vào `memory-cases.json`; (iv) khi sửa (i), kỳ vọng số mục stress 150 giảm về ~300 và `history` được dùng.

## 11. Kết quả sau sửa bộ rút trí nhớ (stress 150, 2026-10-09) — xác nhận P1(a)+(b)
`web/eval/results/memory-stress150-p1b.md`: bộ rút trí nhớ lấy **mục liên quan (xếp hạng IDF)** thay vì 120 mục đầu (`findRelevantMemories`, `rankMemories`).
| Chỉ số | Trước sửa (stress 150) | Sau sửa |
|---|---|---|
| Số mục trí nhớ cho 150 khách | 629 | **320** |
| Mục có `history` / số bản cũ giữ lại | 4 / 4 | **236 / 317** |
| Đúng (47 câu) | 100% | 98% — 1 câu lỗi mạng "fetch failed", 46/46 câu chạy được đều đúng |
| stress_history | 5/5 (nhờ mục trùng) | 5/5 (nhờ `history` + khử trùng thật) |
| Token vào TB / câu | ~37.100 | ~35.500 |
Kết luận: lỗi quy mô (>120 mục mất khử trùng/supersedence) đã sửa; lịch sử nay được lưu đúng chỗ. Cột `history` được dùng ở khách giả (trước 0 lần).
Hạn chế còn nguyên: một lần chạy; bộ câu hỏi vẫn toàn câu nêu tên chính xác (trần ~100%), chưa có câu không nêu tên / đếm-tổng hợp / xung đột; khối prompt vẫn đầy (8.764 ký tự cho 320 mục)
nên phần lớn mục vẫn phải tra bằng tool (16/47 câu gọi tool). Chưa đo chi phí lệnh rút trí nhớ.
Còn lại của P1: (c) nạp trí nhớ vào prompt theo ngữ cảnh (không đổ theo thời gian); (d) context caching prompt tĩnh; (e) nhóm câu hỏi khó; (f) so markdown.

## 12. Kết quả P1 còn lại (2026-10-11, staging, stress 150 + nhóm câu khó)
Eval nay có thêm 9 câu KHÓ cho stress (`stress_count` đếm khách theo thị trường, `stress_multi` hỏi 2 khách một lúc, `stress_reverse` tra ngược theo thị trường + đầu mối, không nêu tên khách) → 56 câu. Chạy `--skip-ingest --concurrency 2` trên dữ liệu 150 khách sẵn có.
| Lần chạy | Đúng | Token vào TB | Gọi tool | Thời gian TB |
|---|---|---|---|---|
| Trước b2 (`hard-base`) | 100% | 56.597 | 26/56 | 8,6s |
| Sau b2, lần 1 (`hard-b2`) | 98% (1 câu conversation_recall bị cờ bịa — nhiễu giám khảo, câu #32 cũng bị cờ từ baseline) | 42.359 | 12/56 | 6,0s |
| Sau b2, lần 2 (`hard-b2-r2`) | 100% | 45.580 | 13/56 | 7,9s |
- **(e) Nhóm câu khó: bộ trí nhớ HIỆN TẠI vẫn đúng 100%** kể cả đếm 22 khách theo thị trường, tra ngược không nêu tên → vẫn chưa có bằng chứng cần graph; trần eval vẫn ~100% (muốn phân biệt phương án cần câu khó hơn nữa hoặc quy mô lớn hơn).
- **(b2) Nạp trí nhớ theo ngữ cảnh** (`buildMemoryBlock(username, message)`): khi vượt `MAX_INJECT_CHARS`, mục ghim vào trước, còn lại xếp theo độ liên quan (IDF) tới tin nhắn thay vì theo thời gian; giới hạn đọc 200 → 1.000 mục. Hiệu quả: **token vào −20–25%, số câu phải gọi tool giảm một nửa (26→12–13/56), nhanh hơn ~1–2,5s**, đúng không giảm. Áp cho Bé Gấu + Gấu Pro (không đổi gì khi chưa vượt trần).
- **(c) Context caching:** đã đo `cachedContentTokenCount` (stream→loop→eval). Cache NGẦM của Gemini đã phủ **~48% token vào** (23.200/48.500 mỗi câu): phần prompt tĩnh (giới thiệu, quy tắc, partner tiers, GA4, mục lục KB) đứng trước phần đổi mỗi lượt (KB liên quan, trí nhớ) nên tiền tố chung đã tối đa. **Không làm cache tường minh** (không thêm được gì trên phần đã cache). Phần còn lại là KB liên quan + trí nhớ + kết quả tool đổi mỗi câu.
- **(f) So markdown: HOÃN** — hệ thống hiện tại ở trần eval, không có chỗ để phương án khác thắng; chỉ làm nếu có bộ câu khó phân biệt được.
**Kết luận P1:** (a) lịch sử, (b1) khử trùng theo liên quan, (b2) nạp theo ngữ cảnh đã xong; (c) không cần; (d)/(f) hoãn. Còn lại theo plan: P2 (lỗ hổng nền: tầng Recall chưa chạy, Lark DM chưa tóm tắt hội thoại, "nhiễm" chỉ tính 1 lượt, cron-job.org trỏ staging; quyền người dùng xem/sửa/xoá/xuất/tắt trí nhớ) rồi P3 (`agent_profiles`).

## 13. P2 (2026-10-11, staging) — xong phần code
- Recall: gốc lỗi 6/537 tìm ra (tóm tắt chạy trước khi client lưu tin + ngưỡng ≥4 tin) → tóm tắt chuyển sang POST lưu tin trả lời, ngưỡng đầu ≥2. Bé Gấu Lark p2p có trí nhớ + tóm tắt luồng (group không).
- "Nhiễm" gắn theo cuộc chat, 24h (Gấu Pro web + Lark DM); Bé Gấu chưa (cần nút Duyệt) — xem wiki §s230 P2.
- Quyền người dùng: xem/sửa/xoá hẳn/xuất/xoá tất cả/tắt — `/api/chat/memory` + `/api/creator-ai/memory`, menu "Trí nhớ của tôi" ở Bé Gấu.
- Chưa làm / ngoài code: cron-job.org đổi sang production (Hiếu); thông báo + đồng ý + thời hạn lưu (pháp chế) trước khi mở cả công ty; QA giao diện + Lark DM thật (cần Hiếu); chưa đo lại số dòng gp_conversation_memory sau vài ngày chạy.
- P3 còn: `agent_profiles`, mở cho vài người test (cờ `gp_personal_features` theo người).

## 14. P3 (2026-10-11, staging) — xong phần code
- Người dùng thử theo từng người: `assistant_feature_users` + UI ở Creator Settings; mọi cổng tính năng Bé Gấu nhận username.
- Hồ sơ trợ lý: chọn app_settings `agent_profile:<username>` thay vì bảng `agent_profiles` (không cần migration; tool/kênh lấy từ bảng tính năng theo vai trò). Panel Trí nhớ có ô hồ sơ.
- Còn: Hiếu QA (thêm vài username thử Trí nhớ → mở "Trí nhớ của tôi", viết hồ sơ, hỏi vài câu xem giọng/ưu tiên đổi đúng); thông báo + đồng ý + thời hạn lưu trước khi mở cả công ty; đổi cron-job.org sang production; chưa đo bằng eval việc hồ sơ làm đổi hành vi (chỉ có test đơn vị).
- Plan này xong phần code — khi Hiếu QA xong và chốt mở rộng thì xoá file + dòng trong CLAUDE.md, chuyển phần còn lại sang wiki.

## 15. H0 học thói quen ngầm — chạy thử (2026-10-11, staging, CHỈ IN, không lưu)
Code: `lib/habit-learner.ts` (`computeHabits`: chủ đề lặp + nhịp theo thứ, tool hay dùng, khung giờ, kênh, văn phong, yêu cầu định dạng, 👍/👎; ngưỡng ≥4 lần trong ≥3 tuần; loại chủ đề nhạy cảm) + route `POST /api/admin/habit-learn` (CRON_SECRET, `usernames` tường minh ≤10, `days`, `aliases`, `listIdentities`; model chỉ diễn đạt lại số liệu; `saved:false` luôn). Test `habit-learner.test.ts`.
Chạy thử trên danh tính của Hiếu (444 tin, 29 ngày hoạt động, 7 tuần): số liệu ra 15 ứng viên, model giữ 3: hay hỏi giá/gói sản phẩm; chủ yếu dùng Web; hay yêu cầu trả lời ngắn gọn/tóm tắt (29 lần, 4 tuần). **Chất lượng chưa đạt để bật lưu:** (1) từ khoá bị cắt theo âm tiết ("phẩm", "thông", "tin", "lại", "gửi" thành chủ đề); (2) chủ đề quá chung (giá, gói) — cần so với tần suất của cả công ty (IDF) để chỉ giữ chủ đề đặc trưng cho người đó; (3) kênh "Web 98%" và tool lõi (executeSQL/querySupabase) là hiển nhiên, không phải thói quen; (4) dữ liệu của Creator lẫn việc dev/QA nên không đại diện cho nhân viên; (5) chưa có ai 👍/👎 nên nhóm phản hồi trống. Tín hiệu có giá trị thật: yêu cầu trả lời ngắn gọn. Chưa thấy nhịp theo thứ trong tuần nào.
Việc tiếp (H0.5, đề xuất): ghép âm tiết thành từ/cụm (chỉ dùng bigram+, bỏ từ đơn), IDF theo toàn công ty, bỏ kênh trivial + tool lõi, chạy thử lại trên 2–3 người dùng thử bình thường (không phải Creator) rồi mới H1.

## 16. H0.5 — sửa chất lượng trích xuất thói quen (2026-10-11, staging, vẫn CHỈ IN, không lưu)
Thay đổi `lib/habit-learner.ts`: (1) **baseline toàn công ty** (`buildBaseline`): chủ đề phải nhiều gấp ≥3 lần tỉ lệ ở phần còn lại của công ty (lift), tool/định dạng gấp ≥2 lần, kênh chỉ tính khi khác số đông ≥20 điểm %, văn phong "ngắn/dài" so với mức chung; (2) từ đơn chỉ nhận token ASCII (tên riêng, vendor, mã, từ Anh) — âm tiết tiếng Việt có dấu không đứng một mình; cụm toàn âm tiết chung ("thông tin", "sản phẩm") bị loại; âm tiết không dấu (dung, khong...) và từ chỉ cách trả lời (ngắn, tóm tắt, excel...) không thành chủ đề; (3) bỏ tool lõi (executeSQL, querySupabase, loadSkill...); (4) model không được đoán nghĩa từ khoá (chỉ viết `Hay nhắc tới "X"`). 13 test.
So sánh trên cùng dữ liệu Hiếu (444 tin, baseline 1.644 tin toàn công ty): H0 có "giá/gói/phẩm/thông/tin/Web" → H0.5 còn `cmhk`, `vnpt`, `gighub`, `task`, `test`, `cập nhật` (lift 6–11×), tool createLarkTask, và "hay yêu cầu trả lời ngắn gọn/tóm tắt" (29 lần, gấp 13× mức chung). Chủ đề đều là tên riêng/đặc thù thật; riêng `test`/`gighub`/`task` phản ánh việc dev/QA của Creator chứ không phải nhân viên thường.
**Còn hạn chế:** mới thử trên 1 người (Creator, dữ liệu atypical); chủ đề là từ khoá (cmhk, vnpt) chưa có "ý nghĩa" — chỉ hữu ích để dự đoán quan tâm vendor, ít giá trị để chỉnh cách trả lời; nhóm phản hồi 👍/👎 vẫn trống (chưa ai bấm); chưa có nhịp theo thứ nào. Tín hiệu mạnh và an toàn nhất: văn phong/định dạng (ngắn gọn, Excel, bảng).
**Đề xuất H1:** lưu tự động trước chỉ nhóm an toàn (format, style, kênh, khung giờ) + chủ đề là tên riêng đặc trưng (lift ≥3, ≥3 tuần); chạy thử thêm trên 2–3 người dùng thường (cần Hiếu chỉ định username) trước khi bật lưu; H2 đo A/B xem khối thói quen có làm câu trả lời tốt hơn không.

## 17. H1 — tự lưu thói quen (2026-10-11, staging)
Xong code: `lib/habit-store.ts` + `/api/cron/habit-learn` + khối prompt riêng + nhãn panel; 6 test habit-store + 1 test khối prompt. Đã chạy thật cho tài khoản Hiếu (3 mục), idempotent. Chưa merge `main`, chưa đặt cron-job.org. Chi tiết: wiki `analytics-creator-ai.md` §s230 H1.
Còn: H2 — đo A/B xem khối thói quen có làm câu trả lời tốt hơn không (bộ câu eval phong cách); chạy thử/mở cho 2–3 người dùng thường (Hiếu chỉ định) + thông báo nhân viên.

## 18. Kết quả H2 — A/B khối thói quen quan sát (2026-10-11, staging, 1 lần chạy)
`web/scripts/eval-habits.mjs` + action `setHabits` (route eval/memory); kết quả `web/eval/results/habits-h2.md/.json`. 10 câu hỏi trung tính (không nêu yêu cầu về cách trả lời) × 3 profile thói quen; arm A = không có khối thói quen, arm B = có các dòng thói quen (như job ban đêm ghi, `auto-habit:*`); giám khảo gemini-pro so cặp MÙ, đảo thứ tự. Đường Gấu Pro (cùng khối `buildMemoryBlock` với Bé Gấu).
| Profile | Giám khảo chọn B hợp hơn | Thay đổi đo được | Đủ ý (A→B) | Nhắc lộ liễu |
|---|---|---|---|---|
| `short` (hay yêu cầu ngắn gọn) | **10/10** | độ dài còn 72%, bảng 70%→50% | 90%→100% | 0% |
| `table` (hay yêu cầu dạng bảng) | 5/10, hoà 5 (A không thua câu nào) | có bảng 70%→100%, dài 115% | 100%→100% | 0% |
| `control` (thói quen KHÔNG liên quan) | 0/10, hoà 10 | độ dài 99%, bảng 70%→60% | 100%→100% | 0% |
Kết luận: khối thói quen **làm câu trả lời đổi đúng hướng thói quen** (ngắn hơn / nhiều bảng hơn) mà **không giảm độ đủ ý**; thói quen không liên quan **không làm đổi** câu trả lời (đối chứng sạch); **không câu nào nêu lộ liễu "em thấy anh hay…"** (1/10 dính regex ở control là dương tính giả: giám khảo xác nhận không nhắc). Hạn chế: 1 lần chạy, 10 câu, giám khảo LLM, thói quen nạp giả lập (không phải do job ghi), chưa đo tác dụng "gợi ý chủ động" và chưa chạy trên đường Bé Gấu thật (be-gau.ts) — nên chạy lặp ≥3 lần trước khi coi là chắc.
Đề xuất tiếp: chạy lặp 3 lần + thêm profile `excel`/`no_diacritics`; sau đó mở dần cho người dùng thử khác (cần Hiếu chỉ định) + thông báo nhân viên.

## 19. H2 chạy lặp 3 lần × 5 profile (2026-10-11, staging) — `web/eval/results/habits-h2r{1,2,3}.md/.json`
30 cặp mỗi profile (10 câu × 3 lần; user eval-h1/h2/h3 chạy song song). B hợp hơn / A hợp hơn / hoà:
| Profile | B / A / hoà | Độ dài B/A | Có bảng A→B | Đủ ý A→B | Nhắc lộ liễu |
|---|---|---|---|---|---|
| `short` | **29 / 1 / 0** | 64–71% (TB 67%) | 70→57% | 93→100% | 0% |
| `table` | 10 / 1 / 19 | 95–108% | 70→**100%** | 100→97% | 0% |
| `excel` | 0 / 3 / 27 | 99% | 70→70% | 100→97% | 0% |
| `nodiac` | 1 / 1 / 28 | 93% | 70→67% | 97→97% | 0% |
| `control` | 0 / 1 / 29 | 98% | 70→70% | 100→97% | 0% |
Kết luận (ổn định qua 3 lần): thói quen **ngắn gọn** có tác dụng rất rõ và lặp lại (29/30, độ dài còn ~2/3, không mất ý); thói quen **dạng bảng** có tác dụng (bảng 70→100%) nhưng giám khảo hay hoà vì arm A vốn đã 70% có bảng; **excel / không dấu / đối chứng** đúng kỳ vọng là KHÔNG làm đổi câu trả lời (hoà 27–29/30; vài ca A hơn là nhiễu 1/30). Không lần nào lộ liễu "em thấy anh hay…". Đủ ý giữ ở 97–100% (dao động 1/30 là nhiễu giám khảo, không tập trung vào profile nào). Hạn chế còn: giám khảo LLM, thói quen nạp giả lập, câu hỏi kiến thức (chưa đo "excel" lúc có yêu cầu số liệu — nơi thói quen này mới phát huy), đường Gấu Pro (chưa riêng be-gau.ts).
Đánh giá: đủ bằng chứng để giữ H1 bật cho nhóm tín hiệu "cách trả lời" (định dạng/văn phong); chủ đề (cmhk, vnpt…) và gợi ý chủ động chưa được đo.
