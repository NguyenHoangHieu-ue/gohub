# System SKUs (Danh Mục Sản Phẩm Hệ Thống)

Quản lý cấu trúc catalog sản phẩm cốt lõi của GoHub bao gồm 4 tầng phân cấp dữ liệu: Products, SKUs, Listings và Items.

> **Mục đích & vai trò**: nguồn sự thật (single source of truth) về sản phẩm GoHub — mọi tab khác (Products BI, chatbot, NCC gap) đều tham chiếu mã/cấu trúc ở đây. **Tại sao 4 tầng Product→SKU→Listing→Item**: tách "gói thương mại" (Product) khỏi "mã kho bán" (SKU), "đăng bán trên sàn" (Listing) và "mã sim vật lý từ NCC" (Item) → 1 gói có thể bán nhiều kênh, nhiều nguồn sim mà không trộn dữ liệu.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/skus` (`web/src/app/(dashboard)/skus/page.tsx`)
- **API SKUs**: `/api/skus` (`web/src/app/api/skus/route.ts`)
- **API Products**: `/api/products` (`web/src/app/api/products/route.ts`)
- **API Listings**: `/api/listings` (`web/src/app/api/listings/route.ts`)
- **API Items**: `/api/items` (`web/src/app/api/items/route.ts`)

---

## 2. Cấu Trúc Catalog 4 Tầng (Product Hierarchy)
Catalog sản phẩm được lưu trữ trên Supabase với mối quan hệ chặt chẽ:

```
[Product] (Gói cước thương mại, ví dụ: Gói Indo-Singapore 7 ngày)
   │
   └───► [SKU] (Mã kho bán, ví dụ: INDOSG-7D-1GB)
           │
           └───► [Listing] (Sản phẩm đăng bán trên các sàn/kênh bán lẻ)
                   │
                   └───► [Item] (Mã sim vật lý/mã kích hoạt chi tiết từ NCC)
```

### Các bảng dữ liệu chính:
- **`products`**: Định nghĩa tên gói, số ngày, khu vực địa lý áp dụng. (Lưu ý: cột rác `data_plan_type` đã được loại bỏ từ session 35).
- **`skus`**: Lưu trữ dung lượng hàng ngày, loại SIM (SIM hay eSIM), chính sách sử dụng dữ liệu.
- **`listings`**: Cầu nối hiển thị sản phẩm trên các sàn thương mại điện tử như Shopee, Lazada, Tiktok Shop hoặc website.
- **`items`**: Bản ghi vật lý của eSIM/SIM thô, liên kết trực tiếp tới nhà mạng đối tác.

---

## 3. Quy Trình Vận Hành & Tính Năng Nổi Bật
- **Tra cứu và Phân trang**: Danh sách SKU và Item hỗ trợ phân trang tự động `20 hàng/bảng` thông qua component `pager.tsx` để tối ưu thời gian tải trang.
- **Trực quan hóa cấu trúc tên**: Tự động rút gọn các chuỗi tên tiếng Việt quá dài (`item_name_vn > 40 kí tự` hoặc `SKU note > 60 kí tự`) để giữ giao diện luôn gọn gàng và dễ theo dõi.
- **Xem chi tiết sản phẩm**: Nút "Chi tiết" trên ItemsTable cho phép mở Modal hiển thị toàn bộ 19 trường dữ liệu chuyên sâu từ nhà mạng.
- **Đồng bộ tự động**: Chạy lệnh GitHub Actions `sync.yml` định kỳ hàng ngày lúc 01:00 UTC để kéo danh mục sản phẩm mới nhất từ GoHub Core API về Supabase.
- **Xuất tệp tin**: Hỗ trợ xuất dữ liệu toàn bộ danh sách Products/SKUs/Items ra định dạng Excel (XLSX).

---

## 4. Phân Quyền Truy Cập
- Chỉ hiển thị với người dùng được cấp quyền qua `allowed_tabs` chứa khóa `skus`.
- **Standard / Staff**: Chỉ được phép đọc và tra cứu dữ liệu.
- **Manager / Admin / Creator**: Có toàn quyền thêm, sửa, xóa cấu hình sản phẩm và thực hiện các thao tác quản trị nâng cao.\n