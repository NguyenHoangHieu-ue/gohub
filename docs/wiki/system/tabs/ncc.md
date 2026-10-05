---
title: "NCC Catalog (Danh Mục Nhà Cung Cấp)"
page_type: tab_guide
is_hidden: true
department: product
tags: [tab, ncc, vendor]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# NCC Catalog (Danh Mục Nhà Cung Cấp)

Hệ thống quản lý catalog sản phẩm của Nhà Cung Cấp (NCC) lớn gồm WorldMove (WM) và 3HK, hỗ trợ so sánh khoảng trống danh mục và tạo sản phẩm hàng loạt.

> **Mục đích & vai trò**: nơi xem "kho hàng" của NCC và phát hiện **Gap** — gói NCC đang bán mà GoHub CHƯA tạo SKU (`exist=No`) → cơ hội mở sản phẩm mới. **Tại sao cần Bulk Import + Template**: tạo SKU thủ công từng cái rất chậm/dễ sai; sinh template Excel (tách trường bắt buộc vs auto-fill) + import hàng loạt giúp mở sản phẩm nhanh, ít lỗi.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/ncc` (`web/src/app/(dashboard)/ncc/page.tsx`)
- **API WorldMove**: `/api/ncc/worldmove` (`web/src/app/api/ncc/worldmove/route.ts`)
- **API 3HK**: `/api/ncc/3hk-zones` (`web/src/app/api/ncc/3hk-zones/route.ts`)
- **API Import Preview**: `/api/ncc/import-preview` (`web/src/app/api/ncc/import-preview/route.ts`)
- **API Import Confirm**: `/api/ncc/import-confirm` (`web/src/app/api/ncc/import-confirm/route.ts`)
- **API Sinh Template**: `/api/ncc/template` (`web/src/app/api/ncc/template/route.ts`)

---

## 2. Kiến Trúc Kỹ Thuật & Cơ Chế Khớp Nối (Gap Analysis)

**Bảng Supabase dùng**: `ncc_worldmove` (catalog WM), `ncc_datapool` (3HK zones), `data_file_registry` (theo dõi file upload), `products` + `skus` (đối chiếu Gap với catalog GoHub).

- **Bảng `ncc_worldmove`**: Chứa hơn `8,921` dòng catalog sản phẩm của đối tác WorldMove. Toàn bộ thông số APN và trạng thái tồn tại (`exist = 'Yes' / 'No'`) được đồng bộ đầy đủ.
- **Bảng `ncc_datapool`**: Chứa thông tin cấu hình 45 Zones của nhà mạng 3HK (giá `price_per_gb_hkd`… — dùng cả trong tính COGS 3HK).
- **Cơ chế so khớp địa danh (`nccCountryScore`)**:
  - Điểm số khớp: `3` (Trực tiếp), `2` (Khu vực - ví dụ: châu Âu khớp với các nước EU), `1` (Toàn cầu - Worldwide), `0` (Không khớp).
- **Gap Analysis**: Thuật toán tự động đối chiếu danh mục sản phẩm đang hoạt động của GoHub với catalog đối tác. Hệ thống phân lọc ra các sản phẩm tiềm năng có trạng thái `exist = No` (WM có bán nhưng GoHub chưa tạo SKU tương ứng) để đề xuất bổ sung sản phẩm mới.

---

## 3. Quy Trình Vận Hành & Nhập Hàng Hàng Loạt (Bulk Import)
Quy trình thêm nhanh sản phẩm từ catalog NCC vào hệ thống GoHub:

1. **Sinh Template (Tạo cấu hình)**:
   - Người dùng lựa chọn gói cước từ WM hoặc 3HK.
   - Trình duyệt hiển thị form cấu hình phân loại rõ: nhóm trường *Bắt buộc nhập thủ công* và nhóm trường *Tự động điền (Auto-fill)* để giảm thiểu sai sót do con người.
   - Hỗ trợ tùy chọn "Top-up SIM" cho 3HK: khi bật, hệ thống tự động sinh 2 dòng Excel tương ứng với eSIM (type C) và SIM vật lý (type E).
2. **Tải lên & Xem trước (Import Preview)**:
   - Người dùng tải tệp Excel cấu hình lên hệ thống.
   - API `/api/ncc/import-preview` thực hiện kiểm tra định dạng và hiển thị bảng xem trước lỗi/cảnh báo trực quan.
3. **Xác nhận lưu (Import Confirm)**:
   - Nhấn "Xác nhận", API `/api/ncc/import-confirm` sẽ ghi nhận hàng loạt bản ghi mới vào Supabase và kích hoạt trạng thái `exist = 'Yes'` cho sản phẩm NCC đó.

---

## 4. Phân Quyền
- **Standard**: Không có quyền truy cập trang này.
- **Staff**: Được phép xem catalog NCC và thực hiện phân tích Gap.
- **Manager / Admin / Creator**: Có toàn quyền vận hành quy trình Import, chỉnh sửa thông tin APN, xuất biểu mẫu và cấu hình tham số NCC.\n
## s220 (2026-10-02) — Cập nhật catalog WM từ `firm_import_c.xlsx` + `apn_WM.xlsx`

- **Kết quả ghi vào `ncc_worldmove`** (làm một lần bằng script, không qua nút import web): 8.921 → **11.025 dòng**; +2.104 sản phẩm mới (eSIM 1.661, Top-Up SIM 443); cập nhật giá nhập/tên/loại gói/`is_lesim` cho 8.575 dòng; **262 gói WM không còn bán → `status=inactive`** (không xoá). Kiểm lại: mọi dòng của file đều có trong DB, giá và tên khớp 100%.
- **Luồng import web (`import-preview`/`import-confirm`) chỉ ghi giá + trường cơ bản, KHÔNG điền APN/nhà mạng/vùng phủ** → sản phẩm mới qua nút import sẽ trống các cột đó. Thông tin này đến từ file APN riêng của WM.
- **File APN** (`apn_WM.xlsx`): bảng theo khối — dòng đầu khối có tên gói (dòng Hán + dòng tiếng Anh), các dòng sau không tên là nhà mạng từng nước. Code: `lib/ncc-wm-apn.ts` (`parseApnFile`, `findApnBlock`), parse file giá tách ra `lib/ncc-wm-parse.ts`. Khớp sản phẩm ↔ khối theo "tên cơ sở" (cắt trước số ngày/dung lượng), khối đặc thù (ngày/Unlimited/Premium) ưu tiên hơn khối chung; có alias South Korea=Korea, khối "Mainland China CT" WM để trống tên, khớp mềm theo bộ từ (Unitel Mongolia, CTE, Three UK).
- **Quy tắc ghi APN**: có khối → lấy giá trị file (apn, network_type, onsite_carrier, providers, coverage, data_reset, notification, prepaid_card, local_source), trường nào file để trống thì giữ giá trị cũ, không bao giờ xoá; không có khối → giữ nguyên dòng cũ / để trống với dòng mới. Cột `coverage` "Same as the telecommunications column" bị bỏ qua. `exist` của dòng mới tính từ SKU WM Active; cron sync vẫn tính lại.
- **Thay đổi APN thật phát hiện** (WM đổi nhà mạng): India CSL→Singtel; Europe A/B/C/E và BICS Wbdata→Orange/KPN/Plus/3HK/BICS; Philippines, Singapore-Malaysia, Australia 3HK→CSL; USA A Plus→3HK; Mainland China A CSL→CMI; Multi-region F/G/H/I/J/TT CSL→Plus; Japan IIJ 3HK→IIJ(Docomo); China-HK-Macao A →China Telecom. Định dạng cột `providers` nay theo file mới ("Nước: nhà mạng/nhà mạng"), khác chút so với bản nạp cũ.
- **Còn trống APN**: 153 sản phẩm mới (150 gói "Singapore, Malaysia, Indonesia" vì file APN không có khối này, MTS Russia, 2 gói Japan KDDI) + 41 sản phẩm cũ không khớp được. Sao lưu bảng trước khi ghi: scratchpad `ncc_worldmove_backup.json` (tạm, mất khi dọn).
