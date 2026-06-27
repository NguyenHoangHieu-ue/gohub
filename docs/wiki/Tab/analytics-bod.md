# Board of Directors Report (Báo Cáo Quản Trị BOD)

Báo cáo cấp cao dành riêng cho Ban Giám đốc, phân tích sâu về cơ cấu biên lợi nhuận, chi phí kênh bán hàng và doanh thu thực tế sau khi trừ mọi loại phí.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/bod` (`web/src/app/(dashboard)/analytics/bod/page.tsx`)
- **API BOD Report**: `/api/analytics/bod-report` (`web/src/app/api/analytics/bod-report/route.ts`)
- **API BOD Summary**: `/api/analytics/bod-summary` (`web/src/app/api/analytics/bod-summary/route.ts`)
- **API BOD Channel Performance**: `/api/analytics/bod-channel-performance` (`web/src/app/api/analytics/bod-channel-performance/route.ts`)
- **API BOD Group Margin**: `/api/analytics/bod-group-margin` (`web/src/app/api/analytics/bod-group-margin/route.ts`)

---

## 2. Công Thức Tài Chính & Nghiệp Vụ Cốt Lõi

### A. Lợi Nhuận Gộp 2 (Gross Profit Margin 2 - GPM2)
BOD Report sử dụng chỉ số tài chính nghiêm ngặt **GPM2** (Biên lợi nhuận gộp tầng thứ hai) thay thế cho biên lợi nhuận gộp thông thường nhằm phản ánh chính xác hiệu quả kinh doanh sau khi đã trừ đi chi phí vận hành kênh bán và phí sàn.

$$\text{GPM2} = \text{Doanh thu thực tế} - \text{Giá vốn (COGS)} - \text{Chi phí kênh bán (Channel Costs)} - \text{Phí nền tảng (Platform Fee)}$$
$$\text{GPM2 \%} = \frac{\text{GPM2}}{\text{Doanh thu thực tế}} \times 100\%$$

*Nguồn trích xuất các biến số*:
- **Doanh thu thực tế**: Từ bảng `fact_sales_revenue` (`gohub_dw`).
- **Giá vốn (COGS)**: Trích xuất từ dữ liệu nhập kho của sản phẩm du lịch.
- **Platform Fee (Phí nền tảng/Phí sàn)**: Định nghĩa tại cài đặt kênh bán (ví dụ phí sàn Shopee/Klook).
- **Channel Costs**: Chi phí vận hành, marketing gán trực tiếp cho kênh bán cụ thể.

### B. Month-End Projection (Dự kiến Cuối Tháng của GPM2)
Áp dụng hệ số Projection Factor động của tháng hiện hành để dự đoán giá trị GPM2 thực tế khi kết thúc tháng.

---

## 3. Quy Trình Vận Hành
- Số liệu tài chính nhạy cảm được tính toán trực tiếp trên kho dữ liệu `gohub_dw` và cache lại thông qua bộ nhớ đệm 2 tầng của Supabase để đảm bảo tốc độ phản hồi dưới 1 giây.
- Cho phép xuất báo cáo tài chính BOD Report ra file định dạng PDF chất lượng cao phục vụ họp chiến lược.

---

## 4. Phân Quyền
- **Cực kỳ bảo mật**: Chỉ vai trò **Admin, Creator, BOD, và Manager** mới có quyền truy cập trang này.
- Vai trò **Staff** và **Standard** hoàn toàn bị chặn và tự động chuyển hướng khi truy cập.\n