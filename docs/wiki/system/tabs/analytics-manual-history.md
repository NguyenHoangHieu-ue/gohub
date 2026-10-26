---
title: "Lịch sử nhập liệu (sửa tay)"
page_type: tab_guide
is_hidden: true
department: product
---

# Lịch sử nhập liệu (`/analytics/manual-history`)

Mọi lần người dùng **sửa tay** target, chi phí, tỷ giá, công thức, kế hoạch, tồn kho… được ghi lại để xem lại số cũ và (admin/creator) khôi phục. Trước s241 các bảng này chỉ `upsert` đè lên dòng cũ, chỉ còn `updated_by`/`updated_at` — sửa xong là mất số cũ.

## Dữ liệu và chống phình
- Lưu ở **Turso** bảng `manual_edit_history` (KHÔNG ở Supabase — Hobby gần đầy 500MB; bảng tự tạo lần ghi đầu): `tbl`, `row_key`, `action` (create|update|delete), `changes` (JSON `{trường: [cũ, mới]}`), `truncated`, `label`, `by_user`, `at`, `source`.
- Code: `lib/manual-history/` — `pure.ts` (so sánh/giới hạn/gộp, có test), `store.ts` (ghi/đọc/dọn), `wire.ts` (gắn vào route lưu), `registry.ts` (danh mục bảng + cách khôi phục), `restore.ts`. Test `manual-history.test.ts`.
- **Quy tắc chống phình (tất cả bắt buộc):**
  1. Chỉ ghi khi giá trị **thật sự đổi** (`sameValue`: rỗng = null, `"5"` = `5`, JSON so theo nội dung) — lưu lại y nguyên thì bỏ qua.
  2. Chỉ lưu các **trường đổi** dạng `[cũ, mới]`, không chụp cả dòng; bỏ trường kỹ thuật (`updated_at`, `updated_by`, `created_*`).
  3. Mỗi giá trị ≤ 500 ký tự, mỗi lần ≤ 4.000 ký tự (cắt thì đánh dấu `truncated`, khi đó không khôi phục tự động).
  4. Cùng người sửa cùng dòng trong **10 phút** → gộp vào một mục (giữ số cũ đầu tiên + số mới cuối cùng; sửa rồi quay về như cũ thì xoá mục).
  5. Dọn hằng ngày trong cron `log-archive` (`pruneHistory`): mục cũ hơn **24 tháng** bị xoá (trừ mục mới nhất của mỗi dòng); mỗi dòng giữ tối đa **100** mục; toàn bảng quá **150.000** mục thì xoá cũ nhất còn 120.000.
  6. Khoá nghi là bí mật (`token`, `secret`, `password`, `api_key`…) trong `app_settings` KHÔNG lưu nội dung, chỉ ghi nhận "đã đổi".
  7. Ghi lỗi chỉ `console.error`, **không bao giờ** làm hỏng việc lưu của người dùng.

## Đã gắn (route → bảng/khoá)
Target: `b2b-customer-targets` (b2b_customer_targets), `quarterly-targets` (target_planning_quarter, Turso), `planning/targets` (analytics_target_planning), `staff-targets`, `squad-targets` + `company-monthly-targets` (cục JSON trong app_settings, so theo đường dẫn lồng `Squad.cm1`), `my-metrics/manual` (okr_manual_targets). Chi phí: `b2b-customer-costs` + `b2b/ecom-costs` (Turso, cả POST lẫn DELETE), `channel-costs`, `channel-group-costs`, `channel-cost-settings`. Tồn kho: `inventory-plan/weekly`, `inventory-plan/skus`, `inventory-po` (thêm/sửa/xoá). Kế hoạch: `my-metrics/plan`, `my-metrics/sku-tags`. Cấu hình: `admin/fx` (tỷ giá, từng ô + nhập file), `admin/settings` (công thức Datapool, quyền, ngưỡng…), `analytics/quarterly-settings`.
Chưa gắn (không phải số nhập tay hoặc đã có lịch sử riêng): wiki/KB (có phiên bản riêng), bảng giá BC Datapool + Portal (có `lastDiff` mỗi lần upload), khuyến mãi, người dùng, vendor-quotes, cấu hình Lark. Thêm route mới: gọi `recordEdit`/`logRowEdits`/`logSettingChanges` (xem route mẫu `b2b-customer-targets`) và khai báo trong `registry.ts`.

## Trang xem + khôi phục
- Menu **Quản trị › Lịch sử nhập liệu**: lọc theo loại dữ liệu, tìm theo mã khách/SKU/tên/người sửa; mỗi mục hiện loại, thời điểm (giờ VN), người sửa, `trường: cũ → mới`. API `GET /api/analytics/manual-history` (admin/creator/bod/manager).
- **Khôi phục số cũ** (admin/creator, `POST {action:"restore", id}`): ghi lại các giá trị CŨ của đúng các trường đã đổi (sửa) hoặc dựng lại dòng đã xoá; việc khôi phục cũng được ghi vào lịch sử (nguồn "khôi phục mục #id") nên hoàn tác được; sau đó xoá cache analytics. Không khôi phục tự động: mục "tạo mới" (xoá dòng bằng tay), mục bị cắt bớt, xoá SKU tồn kho (dữ liệu tuần đi kèm đã mất theo).
- Lịch sử **bắt đầu từ lúc tính năng chạy** — những lần sửa trước đó không còn số cũ.

## Gotchas
- `logRowEdits` gộp `{...bản cũ, ...bản mới}` khi so sánh nên upsert một phần (chỉ gửi vài trường) không bị tính là xoá các trường còn lại.
- Giá trị số và chuỗi số coi là giống nhau (`"00123"` = `123`) — đủ cho target/chi phí; mã định danh nên có chữ.
- Cache: restore gọi `flushAnalyticsCache()` (xoá cả cache) vì phạm vi ảnh hưởng nhiều tab; hiếm khi dùng nên chấp nhận.
