# B2C Performance (Hiệu Suất Bán Lẻ B2C)

Giao diện báo cáo hiệu suất bán lẻ B2C được thiết kế theo tiêu chuẩn thẩm mỹ cao (Apple-style 5 sections), tích hợp nguồn dữ liệu chi phí marketing thực tế và lượng khách hàng mới từ Chatwoot.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/b2c` (`web/src/app/(dashboard)/analytics/b2c/page.tsx`)
- **API Monthly Rolling**: `/api/analytics/b2c/monthly` (`web/src/app/api/analytics/b2c/monthly/route.ts`)
- **API KPIs**: `/api/analytics/b2c/kpis` (`web/src/app/api/analytics/b2c/kpis/route.ts`)
- **API Trend**: `/api/analytics/b2c/trend` (`web/src/app/api/analytics/b2c/trend/route.ts`)
- **API Loss SKUs**: `/api/analytics/b2c/loss-skus` (`web/src/app/api/analytics/b2c/loss-skus/route.ts`)

---

## 2. Cấu Trúc Giao Diện 5 Sections Chuẩn Hóa
Báo cáo B2C được tổ chức thành 5 phân hệ chuyên sâu giảm tải nhận thức người dùng (Anti-Slop Design):

- **Section 1: Revenue Rolling**: Biểu đồ cột doanh thu 6 tháng gần nhất phân tách theo thị trường VN/US/Total và hiển thị tiến độ chạy mục tiêu MTD/MoM/Prorata.
- **Section 2: Customers**: Biểu đồ phân bổ lượng khách hàng mới (New) và khách quay lại (Returning).
- **Section 3: CAC & Leads (Omni Chatwoot)**: Phân tích hiệu quả chuyển đổi từ Leads Chatwoot sang đơn hàng thực tế.
- **Section 4: Website Conversion Rate**: Biểu đồ tỉ lệ mua hàng trực tiếp trên Website từ nguồn dữ liệu GA4.
- **Section 5: Marketing Cost & ROAS**: Tổng hợp ngân sách, chi phí thực tế và chỉ số hoàn vốn chi tiêu quảng cáo (ROAS).

---

## 3. Các Công Thức Tài Chính & Tích Hợp Hệ Hệ Thống

### A. Chi phí Thu hút Khách hàng mới (Customer Acquisition Cost - CAC)
$$\text{CAC} = \frac{\text{Chi phí Marketing thực tế}}{\text{Số lượng Khách hàng mới}}$$

### B. Chỉ số Hoàn vốn Chi tiêu Quảng cáo (Return on Ad Spend - ROAS)
$$\text{ROAS} = \frac{\text{Doanh thu kênh B2C}}{\text{Chi phí Marketing thực tế}}$$

### C. Tiến độ Tiêu hao Ngân sách (Spend Pace)
$$\text{Spend Pace} = \frac{\text{Chi phí Marketing thực tế}}{\text{Ngân sách Marketing được duyệt (B2C Budget)}} \times 100\%$$

### D. Tỷ lệ Chốt đơn (Conversion Rate - CR)
$$\text{CR} = \frac{\text{Số lượng Khách mua hàng thực tế (Báo cáo đơn)}}{\text{Tổng số lượng Leads nhận được}}$$

---

## 4. Tích hợp Hệ thống Ngoại vi (Chatwoot & GA4 & Turso)
- **Leads từ Chatwoot**: Kết nối thông qua helper `lib/chatwoot.ts` trực tiếp đến API của tài khoản CS GoHub (Account 87064) thu thập số lượng hội thoại theo từng Inbox (Web, Facebook, Zalo, WhatsApp, Tiktok Shop).
- **Marketing Spend**: Đọc từ bảng cấu hình chi phí marketing nhập tay trong cơ sở dữ liệu Turso (`channel_group_costs`).

---

## 5. Phân Quyền
- Vai trò xem mặc định: **Admin, Creator, Manager, BOD, Staff**.
- **Gating Note**: Phần công thức chi chiết, ghi chú nghiệp vụ và nút thay đổi ngân sách B2C chỉ hiển thị đối với vai trò **Admin** để đảm bảo bảo mật dữ liệu.\n