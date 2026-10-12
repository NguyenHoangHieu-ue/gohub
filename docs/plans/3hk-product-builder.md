# Plan: tab Admin "Tạo sản phẩm" — thêm vendor 3HK Datapool (file TẠM — xong thì xoá + xoá dòng ở CLAUDE.md)

Hiếu yêu cầu 2026-10-11: tab hiện chỉ tạo gói BC Datapool (`admin/product-builder-tab.tsx`, `lib/bc-datapool/`), làm thêm 3HK Datapool.
**Trạng thái (2026-10-12): CODE XONG trên `staging` (`403ff6e3`), chọn phương án (a) vendorSku US để trống. Chưa QA UI, chưa merge `main`.** Còn: Hiếu QA UI (vd Thái Lan eSIM Fixed/Daily/X, SIM full), chốt hệ số Unlimited (DB 3HK cũ ~2.0 GB/ngày, Công Thức Datapool hiện 1.8), nước chưa có Product 3HK. Xong QA thì xoá file này + dòng ở CLAUDE.md. Kiến thức đã ghi: wiki `admin-product.md` §s231.

## Hiếu đã chốt
- Loại gói: **Fixed (F), Daily (P hoặc T), Unlimited X (3GB→10Mbps)**. KHÔNG làm Unlimited A/B kiểu cũ.
- Nguồn giá/GB: **bảng `ncc_3hk`** hiện có (47 dòng: zone, country, network, price_per_gb_hkd, is_kyc), không upload bảng giá riêng.
- Giao diện: **thêm ô chọn Vendor ở đầu tab** (BC Datapool / 3HK Datapool), dùng lại phần Xem trước + Xuất Excel 4 sheet.
- Thông tin Product/SKU: **lấy khuôn từ sản phẩm 3HK ĐÃ TẠO trong hệ thống** (không nhập tay).

## Khuôn rút ra từ hệ thống (496 Product, 8.205 SKU `3D`; scratchpad dump đã mất khi hết phiên, dựng lại bằng REST `products?vendor_code=eq.3D` + `skus?sku_code=like.*3D*`, lọc ký tự 6-7 = `3D`; dùng `SUPABASE_SECRET_KEY`)
- Product: operator `3HK`, vendor `3D`, purchase `API Purchase`, import `Official`, hotspot Yes, local phone No, top-up No, apn_original `mobile.three.com.hk`, apn `gohub.com`.
- Mã: Product VN = `3`+loại+nước+`3D`+policy; US = `E`+loại+nước+`3D`+policy (SIM full US = `CE…`). Loại: `A` datapack, `C` eSIM full, `E` SIM full. SKU = Product + dung lượng 3 ký tự + ngày 2 ký tự.
- Policy: `F` Fixed `Count 24h`; `P` Daily `Count 24h`; `T` Daily `GMT +8` (reset nửa đêm); `X` Unlimited 3GB→10Mbps `GMT + 8` (có cả `GMT +8` lẫn `GMT + 8` trong DB — chuẩn hoá 1 kiểu).
- Throttle: F/P/T = `256 kbps`; X = "3GB of high-speed data per day, then unlimited data at 10Mbps" (VN ghi tiếng Việt). Cột data/speed của X: data=3072, speed=10.
- Dung lượng/ngày phổ biến: Fixed 1,2,3,5,10,20,30,50GB (+`3HM`); Daily 1,2,3GB (+`1D5`); ngày 1,2,3,5,7,10,15,20,30; X ngày 2–10, 15.
- Trường theo nước (copy từ Product cùng nước đã có, VN + EN): supported_countries (ISO), network_type, onsite_carrier, kyc_needed/kyc_code(1=No, 6=Yes)/kyc_links, note (VN/EN, vd "TikTok/ChatGPT 95%"; Thailand + nhóm AS4/AS5 có thêm vùng không có sóng), activation_time (VN/EN), activation (chỉ Russia). 41 nhóm nước; `ncc_3hk` chỉ 47 dòng, nhóm đa nước (W22, W24, AP1, EAS, CHM...) không có trong đó.
- eSIM full trỏ khung `AB0003DK00000` (US, 0,51 USD) + datapack `EA…`; SIM full VN khung `1D0003DK00000` (11.061 VND), US `CD0003DK00000` (0,34 USD).
- Công thức giá (đã kiểm Thailand Fixed 5GB 7 ngày: US EA 1,77; EC = 1,77+0,51 = 2,28): dùng `datapool.*` chung (Fixed 0.55, Daily 0.38, X 1.7 GB/ngày) × giá HKD/GB ÷ tỷ giá HKD/USD, MỌI công thức ROUNDUP; VN theo tỷ giá tháng.

## ĐIỂM CHẶN — cần Hiếu chọn (a hay b)
`vendorSku` US của SKU datapack `EA…` là mã DUY NHẤT từng SKU của 3HK (`CDOF…`/`TDOF…`, 1.675 mã, không SKU nào dùng chung, KHÔNG theo quy tắc nước/dung lượng/ngày) → không suy ra được.
- (a) Để trống ô vendorSku US + ô nhập tay (giống BC), Hiếu điền sau. **Em đề xuất làm trước.**
- (b) Hiếu có file 3HK mã theo gói → upload, tool tự tra (làm sau khi có file).
VN `vendorSku` = mã SKU US tương ứng (đã đúng quy ước hiện tại).

## Việc cần làm (đề xuất)
1. Tách builder thành theo vendor: `lib/threehk-datapool/` (pricing từ `ncc_3hk` + `datapool.*`, codes, builder dùng lại `PRODUCT_HEADERS`/`SKU_HEADERS`, export 4 sheet + sheet "Tính giá" công thức ROUNDUP).
2. Dựng "khuôn Product" từ bảng `products` theo nước (fallback + cảnh báo khi nước chưa có Product nào).
3. UI: ô Vendor đầu tab, form 3HK (nước/nhóm nước từ `ncc_3hk` + nhóm đa nước đã có, loại gói F/P-T/X, dung lượng, ngày), Xem trước, Xuất; bỏ qua SKU/Product đã có như BC (`dedupe.ts`).
4. Test đối chiếu SKU 3HK thật trong DB (cùng kiểu `bc-datapool.test.ts`), wiki `admin-product.md`, `docs/session_summary.txt`.
