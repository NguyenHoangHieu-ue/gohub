# Products BI (Báo Cáo Hiệu Suất Sản Phẩm BI)

Trang số liệu kinh doanh chuyên sâu về sản phẩm, phân tích sản lượng bán ra, doanh thu mang lại và cơ cấu giá vốn của từng mã sản phẩm/SKU thương mại.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/products` (`web/src/app/(dashboard)/analytics/products/page.tsx`)
- **API Backend**: `/api/analytics/products/report` (`web/src/app/api/analytics/products/report/route.ts`)

---

## 2. Nghiệp Vụ Tính Toán Doanh Số Sản Phẩm
Báo cáo truy vấn kho dữ liệu để trích xuất các thông tin:
- **Doanh số bán ra (Sales Volume)**: Tổng số lượng SIM/eSIM của từng SKU được bán thành công trong kỳ báo cáo.
- **Doanh thu thuần (Net Revenue)**: Tổng số tiền thu về sau khi đã khấu trừ các chương trình ưu đãi, giảm giá trực tiếp trên SKU đó.
- **Cơ cấu giá vốn (COGS Share)**: Tỷ trọng giá vốn của mã sản phẩm để người quản trị đánh giá sản phẩm nào đang mang lại biên lợi nhuận tốt nhất cho GoHub.

---

## 3. Phân Quyền
- Được phân quyền truy cập cho: **Admin, Creator, Manager, BOD, Staff**.\n