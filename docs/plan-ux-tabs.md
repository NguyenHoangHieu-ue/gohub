# Plan UX Update — Tab SP/Hệ thống (2026-07-15)

> Nâng cấp các tab **ngoài analytics** theo tiêu chí: **tiện lợi · tiện ích · thông minh · đầy đủ · cần thiết · dễ tiếp cận · hiện đại**.
> Phạm vi: `skus, ncc, countries, promotions, kb, info, chatbot, admin`. **Gác lại** toàn bộ tab analytics.
> Quyết định của Hiếu: **làm Wave 0 (nền chung) trước**, ưu tiên đào sâu **skus, ncc, kb, chatbot**.

---

## Hiện trạng (khảo sát 2026-07-15)
- Đã có: search/filter/export/modal ở hầu hết tab; `confirm-modal`, `pager`, `dashboard-kit`, `sidebar-main`, `top-bar`.
- **Thiếu nền tảng**: KHÔNG có toast, command palette, skeleton, tooltip dùng chung; **dark mode chưa đồng bộ**; `dashboard-kit` mới dùng ở vài trang analytics → 8 tab SP/hệ thống UX rời rạc.
- Page lớn/monolithic: admin 1836, ncc 1033, kb 992, skus 983, chatbot 758 dòng.

---

## 🅰️ WAVE 0 — Nền tảng dùng chung (làm trước; nâng mọi tab cùng lúc)

> Mỗi mục = 1 component/hook dùng chung + áp dần. Verify tsc/vitest/build mỗi commit.

### 0.1 Toast system  ·  *tiện lợi, hiện đại*
- **Làm**: `components/toast.tsx` (provider + `useToast()`), gắn ở `(dashboard)/layout`. API: `toast.success/error/info(msg)`.
- **Áp**: thay mọi `alert()` / im lặng sau lưu/xoá/import (skus, ncc, promotions, kb, info, admin).
- **Xong khi**: mọi thao tác ghi có phản hồi nổi góc màn hình, tự tắt 3s, stack được.

### 0.2 Skeleton loaders  ·  *tiện lợi, hiện đại*
- **Làm**: `components/skeleton.tsx` (SkeletonRow/Card/Text).
- **Áp**: thay spinner trơ ở skus/ncc/kb/countries/promotions khi loading list.
- **Xong khi**: lúc tải thấy khung xương đúng layout, không nhảy layout (CLS thấp).

### 0.3 Command Palette `Ctrl/⌘+K`  ·  *thông minh, dễ tiếp cận, hiện đại*
- **Làm**: `components/command-palette.tsx` (nghe hotkey toàn cục ở layout). Nguồn:
  - Điều hướng: mọi tab trong sidebar (theo quyền).
  - Hành động nhanh: "Tạo promo", "Upload KB", "Import NCC"…
  - Tra cứu nhanh: gõ mã SKU/nước/wiki → gọi API search hiện có (`/api/skus`, `/api/countries`, `/api/kb/search`) trả kết quả nhảy thẳng.
- **Xong khi**: `⌘K` mở, gõ→lọc realtime, Enter nhảy đúng chỗ; Esc đóng.

### 0.4 URL-state cho filter/search  ·  *tiện lợi*
- **Làm**: hook `useUrlState(key)` (đọc/ghi `searchParams`), debounce.
- **Áp**: skus/ncc/countries/promotions/kb — filter + search + page lưu vào URL.
- **Xong khi**: F5/back-button/chia sẻ link giữ nguyên bộ lọc.

### 0.5 Đồng bộ design-kit + dark mode  ·  *hiện đại, dễ tiếp cận*
- **Làm**: chuẩn hoá token (card/nút/input) từ `dashboard-kit`; bổ sung `dark:` cho 8 tab + kiểm tương phản.
- **Xong khi**: 8 tab cùng ngôn ngữ thị giác; bật dark mode không vỡ.

### 0.6 Keyboard + Empty/Help states  ·  *tiện lợi, đầy đủ, dễ tiếp cận*
- **Làm**: `/` focus ô search, `Esc` đóng modal/drawer, ↑↓/Enter duyệt bảng; `components/empty-state.tsx` + `tooltip.tsx`.
- **Xong khi**: bảng rỗng có gợi ý hành động; icon "?" giải thích cột/quy tắc.

### 0.7 Rà mobile responsive  ·  *dễ tiếp cận*
- **Làm**: table-heavy → card view < md; sidebar off-canvas; nút thao tác không tràn.
- **Xong khi**: 8 tab dùng được trên điện thoại (không scroll ngang vô định).

---

## 🅱️ WAVE 1 — Đào sâu 4 tab ưu tiên

### skus (SP Hệ thống)  ·  *tiện ích, thông minh, đầy đủ*
1. **Detail Drawer** (thay modal): mở panel phải, điều hướng **Product ↔ SKU ↔ Listing ↔ Item** trong 1 luồng (đọc `metadata` JSONB).
2. **Saved Views**: lưu bộ lọc hay dùng (theo vendor/nước/loại) — lưu `app_settings` per-user.
3. **Bulk actions**: chọn nhiều → export/đổi status hàng loạt.
4. **Copy mã** (SKU/Product) 1 click + toast.
5. **Import CSV** SKU (tái dùng luồng NCC import-preview/confirm).

### ncc (NCC + Gap)  ·  *thông minh, cần thiết*
1. **Gap Dashboard**: card đếm `exist='No'` theo NCC/nước/khu vực → thấy ngay cơ hội mở SP.
2. **Tạo SKU 1-click từ gap**: từ dòng gap → prefill template (không tự gõ lại).
3. **Import Wizard** (stepper 3 bước: chọn gói → cấu hình → preview **diff**/lỗi → confirm) thay form phẳng.
4. **Preset template** hay dùng (WM/3HK, eSIM/SIM) lưu lại.

### kb (Knowledge Base)  ·  *thông minh, hiện đại*
1. **Semantic search + filter** (phòng ban/loại/tag) + **preview inline** đoạn khớp (highlight).
2. **Editor markdown live-preview** cho wiki (2 cột) + **diff version** (`kb_wiki_versions`).
3. **"Hỏi AI về tài liệu này"**: nút mở chatbot agent giải-đáp với ngữ cảnh doc.
4. **Drag-drop upload** + progress + trạng thái job (`kb_processing_jobs`).

### chatbot  ·  *tiện lợi, thông minh, hiện đại*
1. **Gợi ý câu hỏi** (chips theo agent/ngữ cảnh) khi mở/khi rảnh.
2. **Sidebar lịch sử hội thoại** (`conversations`/`chat_messages`) — mở lại, đổi tên, xoá.
3. **Copy / 📤 Export** câu trả lời (md) + **👍👎 feedback** (lưu để cải thiện).
4. **Chọn agent thủ công** (override router) + badge agent rõ hơn.
5. Streaming mượt + auto-scroll + "dừng".

---

## Thứ tự triển khai (mỗi bước 1 commit, verify + deploy dần)
1. **Wave 0**: 0.1 Toast → 0.2 Skeleton → 0.6 Empty/Help → 0.5 design-kit/dark → 0.4 URL-state → 0.3 Command Palette → 0.7 mobile.
   *(Toast/Skeleton trước vì nhiều tab dùng ngay; Command Palette sau cùng vì cần các search API ổn định.)*
2. **Wave 1** theo tab: **skus → ncc → kb → chatbot** (hoặc theo mức bận của Hiếu).

## Non-goals / Lưu ý
- KHÔNG đụng tab analytics (gác lại theo yêu cầu).
- Giữ nguyên nghiệp vụ/dữ liệu; đây là lớp UX/tiện ích.
- Mỗi thay đổi cập nhật wiki tab tương ứng (feedback_detailed_wiki) + sync KB.
- Staging-first, verify tsc·vitest·build, rồi merge main.
