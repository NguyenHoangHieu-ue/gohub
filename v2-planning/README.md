# GoHub Intel v2 — Nền tảng Quản trị & Phân tích Kinh doanh Tối tân

> **Bản thiết kế lại (Rebuilt Specifications)**: Hệ thống hóa toàn bộ quy trình, chuẩn hóa cấu trúc thư mục, thống nhất công thức phân tích và nâng cấp trải nghiệm người dùng tối giản (Apple-style UX).

---

## I. TRIẾT LÝ THIẾT KẾ & SỰ KHÁC BIỆT (V2 PHILOSOPHY)

GoHub Intel v2 là phiên bản tái cấu trúc toàn diện từ phiên bản cũ nhằm loại bỏ sự phức tạp, rời rạc và lộn xộn trong cả mã nguồn lẫn quy trình vận hành. 

| Đặc điểm | Phiên bản cũ (v1) | Phiên bản mới (v2) |
| :--- | :--- | :--- |
| **Cấu trúc thư mục** | Phân mảnh, nhiều file cấu hình rời rạc và các script test nằm rải rác. | Phân vùng rõ ràng, quy chuẩn hóa theo từng module chức năng khép kín. |
| **Lớp dữ liệu (DB)** | DB phân tán (Supabase, Turso, `gohub_dw`) với các kết nối riêng lẻ. | Lớp kết nối hợp nhất (`src/core/db/`), chuẩn hóa luồng kéo dữ liệu. |
| **Công thức & Logic** | Viết trực tiếp (hardcode) tại các API endpoints khác nhau. | Đóng gói tập trung trong **Core Formulas Engine** (`src/core/formulas/`). |
| **Quản lý Chi phí** | Phân mảnh giữa chi phí kênh (Supabase) và chi phí khách hàng (Turso). | Đồng bộ hóa dữ liệu chi phí và cơ chế dọn dẹp cache thông minh theo phạm vi. |
| **Giao diện đồ thị** | Lỗi tràn chữ, nhãn trục đè lấn nhau do độ dài chuỗi biến động. | Đồ thị thông minh tự động cắt chuỗi (ellipsis) và hiển thị tooltip đầy đủ. |

---

## II. QUY HOẠCH CẤU TRÚC THƯ MỤC CHUẨN (FOLDER ARCHITECTURE)

Hệ thống mới sẽ được xây dựng 100% bằng TypeScript và Next.js 14 (App Router) với bố cục tinh gọn như sau:

```
gohub-v2/
├── .github/
│   └── workflows/
│       ├── ci-check.yml       # Tự động Lint, Type-check, và chạy Unit tests khi có PR
│       └── nightly-sync.yml   # Đồng bộ danh mục sản phẩm & tỷ giá định kỳ hàng ngày
├── public/                    # Placeholder tài nguyên & Assets tối giản
├── src/
│   ├── app/                   # App Router (Next.js 14)
│   │   ├── (auth)/            # Luồng đăng nhập đa kênh (NextAuth.js, Lark OAuth)
│   │   ├── (dashboard)/       # Module UI Admin & Toàn bộ 28 Tab Analytics
│   │   │   ├── analytics/
│   │   │   │   ├── bod/       # Báo cáo quản trị BOD
│   │   │   │   ├── b2b/       # Hiệu suất bán sỉ B2B
│   │   │   │   ├── b2c/       # Hiệu suất bán lẻ B2C
│   │   │   │   └── targets/   # Quản lý KPI & Targets
│   │   │   └── products/      # Catalog quản lý SIM/eSIM
│   │   └── api/               # API endpoints phân cấp sạch sẽ
│   ├── components/            # Các React components dùng chung
│   │   ├── ui/                # Apple-style UI elements (Button, Card, Input, Drawer...)
│   │   ├── charts/            # Bộ đồ thị chuẩn hóa (SmartBarChart, SmartLineChart...)
│   │   └── layout/            # Sidebar, Header, Breadcrumbs nhất quán
│   ├── core/                  # TRÁI TIM TOÀN HỆ THỐNG (Khép kín logic nghiệp vụ)
│   │   ├── db/                # Unified DB Clients (Supabase, Turso, gohub_dw client)
│   │   ├── formulas/          # Công thức nghiệp vụ chuẩn hóa (CM1, CAC, 3HK COGS...)
│   │   ├── filters/           # Engine xử lý bộ lọc chuẩn (includeShip, internalOps...)
│   │   └── cache/             # Module quản lý cache L2 thông minh, scoped-flush
│   ├── types/                 # Kiểu dữ liệu TypeScript tĩnh cho toàn hệ thống
│   └── lib/                   # Các tiện ích bổ trợ khác (Lark Bot Client, Gemini SDK)
├── ARCHITECTURE.md            # Tài liệu kiến trúc kỹ thuật chi tiết
├── FORMULAS.md                # Sổ tay công thức & Logic phân tích 1-1
└── README.md                  # Hướng dẫn tổng quan hệ thống v2
```

---

## III. ROADMAP TRIỂN KHAI PHÂN KỲ (ROADMAP)

### Phân kỳ 1: Thiết kế & Thiết lập Hạ tầng (Tuần 1)
*   Khởi tạo cấu trúc dự án Next.js 14, TypeScript và Tailwind CSS sạch.
*   Viết mã nguồn lớp lõi **`src/core/`** (DB clients, Formulas engine, Filters parser, Caching).
*   Xây dựng bộ UI components cơ bản và wrapper đồ thị Recharts thông minh.

### Phân kỳ 2: Tái cấu trúc Toàn bộ Tab Analytics (Tuần 2-3)
*   Triển khai tab báo cáo quản trị **BOD Report** (doanh thu, margin, 3HK%).
*   Xây dựng hệ thống hiệu suất sỉ **B2B Performance** kết hợp chi phí khách hàng động từ Turso.
*   Tái hiện dashboard bán lẻ **B2C Performance** 5 phân vùng, tích hợp luồng leads & GA4.
*   Cài đặt trang **Manage Costs & Targets** hợp nhất.

### Phân kỳ 3: Tích hợp AI Agent & Lark Bot SLA (Tuần 4)
*   Hệ thống hóa 7 Agent AI "Bé Gấu Thông Thái" chạy bằng Google Gemini API.
*   Thiết lập hàng chờ duyệt SLA và Vendor Speed tự động từ Lark Chat real-time.
*   Hoàn thiện OKR Tracking dashboard (My Metrics).

### Phân kỳ 4: Kiểm thử, Tối ưu & Bàn giao (Tuần 5)
*   Chạy kiểm thử tổng thể (Unit test, Type-check pass 100%).
*   Tối ưu hóa hiệu năng tải trang thông qua L2 Cache.
*   Bàn giao hệ thống v2 hoàn thiện, sạch lỗi lộn xộn.
