---
title: "Quy Trình Vận Hành Chuẩn — GoHub Intel"
audience: system
visibility: admin-only
page_type: reference
department: tech
tags: [workflow, pipeline, system, devops, quy-trinh]
aliases: ["Workflow Pipeline", "Vận hành chuẩn", "Standard Pipeline"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-08-22
status: active
---

# Quy Trình Vận Hành Chuẩn (Workflow Standard Pipeline)

> Tài liệu hướng dẫn thiết lập, triển khai, tự động hóa kiểm thử và bảo mật hệ thống GoHub Intel.
> Áp dụng cho toàn bộ đội ngũ kỹ thuật và các AI Assistant làm việc trên dự án.

---

```
                                  [ QUY TRÌNH VẬN HÀNH 4 LỚP TỰ ĐỘNG ]

   [Local Code] ───────► [Pre-Commit Hooks] ───────► [GitHub Pull Request (CI)]
                               (Husky, Secret Scan)         (Build, Lint, Unit Test)
                                                                       │
   [Production Deploy] ◄─── [Staging Deploy & QA] ◄────────────────────┘
   (gohub-intel.vercel.app)    (Playwright, DB verify)
```

---

## LỚP 1: TIÊU CHUẨN CODE & BẢO MẬT (DEVELOPMENT & GIT GUARD)

Mục tiêu chính là kiểm soát chất lượng mã nguồn và ngăn chặn rò rỉ thông tin nhạy cảm ngay tại máy phát triển cá nhân (Local) trước khi đẩy lên GitHub.

### 1. Chiến lược Phân nhánh Git (Branching Strategy)

Tuyệt đối không thực hiện commit trực tiếp lên nhánh `main`. Dự án quy hoạch thành 3 tầng nhánh chính:

- **`feature/*`** hoặc **`bugfix/*`**: Các nhánh phát triển tính năng mới hoặc sửa lỗi lẻ của lập trình viên.
- **`staging`**: Nhánh tích hợp và kiểm thử chung trước khi chuyển giao.
- **`main`**: Nhánh Production ổn định nhất, phản ánh đúng trạng thái đang chạy thực tế trên sản phẩm.

### 2. Sử dụng Pre-Commit Hooks (Husky & Secret-Lint)

Để tự động hóa quy trình kiểm tra mã nguồn tại local, dự án thiết lập Husky và lint-staged:

- **Cài đặt Husky**:
  ```bash
  cd web
  npm install husky lint-staged --save-dev
  npx husky install
  ```
- **Secret Scanning (Quét mã bảo mật)**:
  Tích hợp `gitleaks` hoặc `secret-lint` vào pre-commit hook. Nếu lập trình viên vô tình viết mật khẩu cơ sở dữ liệu, API key của Gemini, hoặc App Secret của Lark vào file code/markdown, tiến trình commit sẽ tự động bị chặn và đưa ra cảnh báo khẩn cấp.

### 3. Nguyên tắc Quản lý Biến Môi trường (.env)

- **Tuyệt đối một file duy nhất (.env.local)**: Toàn bộ cấu hình nhạy cảm được tích hợp tại một tệp tin duy nhất là `web/.env.local`. Các tệp tin dư thừa khác ở thư mục gốc hoặc các tệp tin đính kèm nhà mạng (`.env`, `.env.netlify.local`, `.env.vercel.local`) đều bị xóa bỏ hoàn toàn để tránh xung đột cấu hình.
- **Đóng băng trong Repository**: Tệp `web/.env.local` đã được cấu hình trong `.gitignore` để đảm bảo không bao giờ bị đẩy lên GitHub.
- **Isolate Environments**: Cấu hình biến môi trường trên Vercel tách biệt hoàn toàn giữa hai môi trường Development/Staging và Production.

---

## LỚP 2: KIỂM THỬ TỰ ĐỘNG (AUTOMATED TESTING)

Để hạn chế tối đa việc phát hiện lỗi thủ công sau khi deploy, toàn bộ các chức năng cốt lõi bắt buộc phải có test suite tự động kiểm soát.

### 1. Unit Tests (Kiểm thử Đơn vị)

- **Thư viện đề xuất**: `Vitest` (Phù hợp và chạy cực nhanh với dự án Next.js/Vite stack).
- **Phạm vi áp dụng**: Viết unit test cho các hàm xử lý dữ liệu độc lập như:
  - `stripSuperlativeNhat()`: Kiểm tra loại bỏ từ đồng âm tiếng Việt.
  - `wordMatch()`: Xác nhận cơ chế nhận diện từ khóa ranh giới cho quốc gia.
  - `convertCogs()`: Xác nhận quy đổi tỷ giá và giá vốn chính xác.
  - `decodeSkuCode()`: Kiểm tra bóc tách mã SKU chuẩn.

### 2. Integration Tests (Kiểm thử Tích hợp API)

- **Phạm vi áp dụng**:
  - Mô phỏng gửi request mẫu tới AI Router tại `/api/chat` để kiểm soát xem AI Classifier có nhận diện đúng 9 loại Intent và phân tách đúng Data Source (`gohub_system` hay `ncc_catalog`) hay không.
  - Kiểm tra tính toàn vẹn của dữ liệu trả về từ các đầu API BI (`/api/analytics/*`) trước khi kết xuất lên giao diện biểu đồ.

### 3. End-to-End (E2E) Testing (Kiểm thử Giao diện Thực tế)

- **Công cụ áp dụng**: `Playwright` hoặc `Cypress`.
- **Kịch bản tự động hóa**:
  1. Trình duyệt tự khởi động, mở trang `/login` và thực hiện đăng nhập bằng tài khoản mẫu.
  2. Tự động click chuyển hướng đến trang `/analytics/bod` và chụp ảnh giao diện (Screenshot) để đối chiếu trực quan.
  3. Mở khung Chatbot, nhập câu hỏi mẫu *"Doanh thu B2C tháng này là bao nhiêu"* $\rightarrow$ Kiểm tra xem AI Analyst có chạy câu lệnh SQL và render biểu đồ Recharts thành công không.
  4. Xác nhận không có lỗi treo biểu đồ (NaN) hoặc màn hình trắng xảy ra tại bất kỳ tab nào.

### 4. Database Smoke Tests

- Viết kịch bản tự động thực hiện truy vấn `EXPLAIN` trên 18 câu lệnh SQL BI để đảm bảo cấu trúc bảng trong PostgreSQL `gohub_dw` không bị drift/thay đổi phá hỏng ứng dụng trước khi build.

---

## LỚP 3: TÍCH HỢP & TRIỂN KHAI LIÊN TỤC (CI/CD PIPELINE)

Hệ thống CI/CD được xây dựng bằng GitHub Actions giúp đồng nhất hóa quy trình triển khai:

```
[Mở Pull Request] ──► [CI Run: Lint & Type-check] ──► [CI Run: Unit/Int Tests] ──► [Cho phép Merge]
```

### 1. Giai đoạn Tích hợp Liên tục (GitHub Actions PR Pipeline)

Mỗi khi lập trình viên tạo Pull Request (PR) từ nhánh `feature/*` vào `staging` hoặc `main`, hệ thống tự động kích hoạt pipeline kiểm tra nghiêm ngặt:

1. **Lint Stage (`npm run lint`)**: Quét toàn bộ mã nguồn để đảm bảo không vi phạm các quy tắc coding style.
2. **Type-Check Stage (`tsc --noEmit`)**: Biên dịch thử nghiệm TypeScript. **Nếu có bất kỳ lỗi kiểu dữ liệu hoặc import sai đường dẫn nào, pipeline sẽ báo đỏ và khóa nút Merge trên GitHub**.
3. **Test Stage**: Thực thi toàn bộ Unit test và Integration test tự động trên môi trường ảo hóa Ubuntu headless.

### 2. Giai đoạn Triển khai Liên tục (CD với Vercel Integration)

- **Môi trường Staging (Thử nghiệm)**:
  - Khi code được duyệt và merge vào nhánh `staging`, Vercel tự động triển khai bản thử nghiệm lên tên miền phụ (Staging URL).
  - Đội ngũ Tech & Product thực hiện kiểm thử E2E và nghiệm thu tính năng thực tế tại đây.
- **Môi trường Production (Sản phẩm thực tế)**:
  - Khi code từ `staging` được merge sang `main`, Vercel tự động deploy bản ổn định cao lên môi trường thực tế tại: **`https://gohub-intel.vercel.app`**.

---

## LỚP 4: QUẢN TRỊ DATABASE & GIÁM SÁT ĐỒNG BỘ

### 1. Quy tắc Sửa đổi Cơ sở Dữ liệu (Database Schema Migrations)

- **Nghiêm cấm tuyệt đối can thiệp thủ công DDL**: Không chạy trực tiếp các câu lệnh `ALTER TABLE`, `DROP`, hoặc `CREATE TABLE` trên môi trường Production bằng các giao diện UI hoặc CLI ngoài luồng.
- **Quy trình chuẩn**:
  - Mọi thay đổi cấu trúc bảng bắt buộc phải tạo dưới dạng file `.sql` tuần tự lưu trữ tại thư mục `database/migrations/` (Ví dụ: `v21_add_new_column.sql`).
  - Sử dụng Supabase CLI hoặc các công cụ CI/CD để áp dụng (Apply) tự động các file migration này đồng hành cùng tiến trình deploy mã nguồn mới.

### 2. Hệ thống Giám sát & Cảnh báo Tự động (Operations Monitoring)

- Các kịch bản đồng bộ dữ liệu tự động (`sync.yml`, `data_sync.yml`, `neo4j_sync.yml`) chạy hàng ngày trên GitHub Actions bắt buộc phải tích hợp webhook thông báo.
- **Webhook thông báo**: Kết nối tới API `/api/notify/lark` của hệ thống.
- **Nội dung gửi**: Khi cron job hoàn tất hoặc gặp sự cố, Chatbot `Bé Gấu Thông Thái` sẽ tự động biên soạn thông điệp Markdown gửi trực tiếp vào nhóm Vận hành nội bộ của công ty trên Lark Chat:
  - Trạng thái chạy (Thành công / Thất bại).
  - Số dòng dữ liệu đã được cập nhật hoặc đồng bộ mới.
  - Chi tiết lỗi phát sinh (Traceback) để lập trình viên click xem và sửa đổi tức thì ngay trong ngày.

---

## VII. CHỈ THỊ BẮT BUỘC TỪ QUẢN TRỊ VIÊN

### 1. Quy trình Phát triển Staging-first

Mọi hoạt động phát triển tính năng, sửa đổi cấu hình hoặc vá lỗi từ nay về sau bắt buộc tuân theo luồng phân nhánh:
`Feature Branch / Bugfix Branch` -> `staging` (Triển khai & Kiểm thử 100%) -> `main` (Production).
*Tuyệt đối không push trực tiếp lên main!*

### 2. Khóa Cứng Giao Diện Analytics (UI Lock)

Tất cả các giao diện người dùng (UI) hiện tại của các tab báo cáo BI/Analytics phải được giữ nguyên vẹn. Mọi hoạt động nâng cấp (kiểm thử, tối ưu truy vấn, đồng bộ hóa) chỉ được can thiệp vào tầng logic backend, cơ sở dữ liệu hoặc kịch bản chạy ngầm, không được phép thay đổi giao diện frontend trừ khi có chỉ đạo trực tiếp từ anh Bảo.
