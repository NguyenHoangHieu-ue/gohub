# V2_UI_UX_BLUEPRINT.md — Đặc tả Mỹ thuật & Trải nghiệm Người dùng (Apple-style UX)

> **Bản thiết kế Trực quan & Wireframes**: Được lập bởi Chuyên gia Thiết kế UI/UX Cao cấp. Bản thiết kế định nghĩa hệ thống bảng màu tối giản, quy chuẩn "Anti-Slop UX" (chống cẩu thả), cấu trúc bố cục trang Dashboard và giao diện Chatbot Bé Gấu trực quan sinh động dưới dạng sơ đồ ký tự.

---

## I. THỐNG NHẤT BẢNG MÀU CHỦ ĐẠO (UNIFIED COLOR PALETTE)

Hệ thống v2 hướng tới một phong cách thiết kế tối giản, tinh tế kiểu Apple (Apple-style Minimalism). Chúng tôi loại bỏ các đường viền dày đen, các màu neon chói mắt, chuyển sang sử dụng khoảng trắng thoáng đãng, bóng mờ mịn màng và dải màu dịu mắt:

### 1. Dải màu Hệ thống (System Palette)

| Loại màu | Mã màu Hex | Tên màu / Sử dụng thực tế |
| :--- | :--- | :--- |
| **Primary (Gấu Blue)** | `#2563eb` (Blue 600) | Màu thương hiệu của Bé Gấu, các nút hành động chính, tab hoạt động. |
| **Secondary (Gấu Violet)**| `#7c3aed` (Violet 600)| Màu thương hiệu độc quyền của Gấu Pro (AI Workspace cá nhân). |
| **Success (Green)** | `#10b981` (Emerald 500)| Trạng thái đạt Target, tăng trưởng dương, hoàn thành tốt. |
| **Warning (Yellow)** | `#f59e0b` (Amber 500) | Trạng thái cần chú ý, đạt từ 75% - 99% kế hoạch, sắp hết hạn. |
| **Danger (Red)** | `#ef4444` (Rose 500)   | Trạng thái nguy hiểm, giảm sút biên lợi nhuận, dưới 75% kế hoạch. |
| **Neutral Dark** | `#0f172a` (Slate 900)  | Văn bản chính (Body text), tiêu đề trang, thành phần nổi bật. |
| **Neutral Light** | `#f8fafc` (Slate 50)  | Nền trang tổng thể (Page Background), thẻ phụ, ô nhập liệu. |
| **Border Color** | `#e2e8f0` (Slate 200)  | Đường phân cách siêu mảnh (`border-[1px]`), tinh tế. |

### 2. Nguyên tắc Thiết kế tối giản "Anti-Slop UX"
*   **Khoảng trắng (Spacing)**: Sử dụng hệ lưới 8px (`p-4`, `p-6`, `space-y-4`). Thẻ thông tin bắt buộc phải có khoảng thở thoáng, không nhồi nhét.
*   **Bóng mờ (Shadows)**: Sử dụng duy nhất một lớp bóng mờ siêu dịu (`shadow-sm` hoặc `shadow-[0_2px_8px_rgba(0,0,0,0.04)]`) trên nền trắng (`bg-white`) để thẻ trông như "nổi nhẹ" trên mặt bàn.
*   **Bo góc (Border Radius)**: Sử dụng thống nhất bo góc vừa phải (`rounded-xl` tương đương 12px) cho toàn bộ Cards, Modals, và Buttons để tạo cảm giác mềm mại, hiện đại.

---

## II. WIREFRAME GIAO DIỆN BI DASHBOARD (PHÂN KHÚC)

Sơ đồ bố cục cấu trúc trang **BI Dashboard** (/analytics) tối giản, hiển thị bộ lọc chuẩn s132 và dải chọn thị trường:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Bear-Icon  GoHub Intel v2  [ Thư mục Wiki ]  [ Chatbot Bé Gấu ]                      (🐻 Admin) │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Home / Analytics / Dashboard                                                                   │
│                                                                                                 │
│  ┌─ HỆ THỐNG PHÂN TÍCH TỔNG QUAN ─────────────────────────────────────────────────────────────┐ │
│  │                                                                                             │ │
│  │  Thị trường:  [ [All] ]  [ VN ]  [ US ]                                                      │ │
│  │                                                                                             │ │
│  │  Khoảng ngày: [ 2026-08-01 ] tới [ 2026-08-31 ]   Nguồn ngày: (•) Ngày giao  ( ) Ngày tạo    │ │
│  │                                                                                             │ │
│  │  Bộ lọc s132:  [x] Gồm Phí Ship    [ ] Gồm Đơn Nội Bộ    [ ] Gồm Khách Ops                   │ │
│  │                                                                                             │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                 │
│  ┌─ KPI STRIP ────────────────────────────────────────────────────────────────────────────────┐ │
│  │ ┌──────────────────────┐ ┌──────────────────────┐ ┌───────────────────┐ ┌──────────────────┐ │ │
│  │ │ Doanh Thu            │ │ Lợi Nhuận Gộp (GP)   │ │ CM1               │ │ Tỷ Trọng 3HK%    │ │ │
│  │ │ 152,480,000 VND      │ │ 56,120,000 VND       │ │ 43,200,000 VND    │ │ 74.2%            │ │ │
│  │ │ ▲ +12.4% (kỳ trước)  │ │ ▲ +8.2% (kỳ trước)   │ │ ▼ -2.1% (kỳ trước)│ │ Target: 74.0% ✅ │ │ │
│  │ └──────────────────────┘ └──────────────────────┘ └───────────────────┘ └──────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                 │
│  ┌─ XU HƯỚNG DOANH THU THEO NGÀY ──────────────────────────────────────────────────────────────┐ │
│  │  (Biểu đồ Line Chart mềm mại - Smooth Curve)                                                 │ │
│  │                                                                                              | │
│  │   Doanh thu (VND)                                                                            │ │
│  │    │      *--*                                                                               │ │
│  │    │     /    \      *--*                                                                    │ │
│  │    │    /      \    /    \                                                                   │ │
│  │    │   /        *--*      \                                                                  │ │
│  │    └──/────────────────────\──────────► Ngày                                                 │ │
│  │      01    05    10    15   20   30                                                          │ │
│  │      Legend: ── B2B Strategic (Blue)  ── B2B Non-Strategic (Slate)  ── B2C (Emerald)         │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                 │
│  ┌─ PHÂN BỔ QUỐC GIA ĐÍCH (REGION) ──────────┐ ┌─ ĐƠN HÀNG MỚI PHÁT SINH ──────────────────────┐ │
│  │  (Smart YAxis Recharts - Cắt chuỗi ...)   │ │  Mã Đơn  │ Khách Hàng      │ Tổng Tiền (VND)  │ │
│  │  Japan (JPN)      ██████████ 45tr         │ │  DH9081  │ Momo Agent      │ 12,500,000       │ │
│  │  Thailand (THA)   ████████ 32tr           │ │  DH9082  │ Klook US        │  8,400,000       │ │
│  │  Singapore (SGP)  █████ 18tr              │ │  DH9083  │ Divui VN        │  3,200,000       │ │
│  │  Taiwan (TWN)     ███ 12tr                │ │  DH9084  │ Khách Lẻ Web    │    450,000       │ │
│  └───────────────────────────────────────────┘ └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## III. WIREFRAME GIAO DIỆN CHATBOT BÉ GẤU THÔNG THÁI

Thiết kế giao diện hội thoại thông minh, hiển thị bong bóng chat sinh động và tích hợp trạng thái "Agent đang suy nghĩ/truy xuất dữ liệu":

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Bear-Icon  GoHub Intel v2  [ Thư mục Wiki ]  [ Chatbot Bé Gấu ]                      (🐻 Admin) │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                 │
│  🐻 BÉ GẤU THÔNG THÁI — Trợ lý AI Đa Tác Nhân                                                    │
│  ─────────────────────────────────────────────────────────────────────────────────────────────  │
│                                                                                                 │
│  ┌─ TIN NHẮN USER ──────────────────────────────────────────────────────────────────────────┐   │
│  │ "Báo cáo cho tôi doanh thu và biên lợi nhuận của 3HK trong tháng này với"                 │   │
│  └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                 │
│  ┌─ BÓNG CHÁT BÉ GẤU (LOADING STATE) ─────────────────────────────────────────────────────────┐   │
│  │  🐻 Bé Gấu [Agent: BI Analyst] đang suy nghĩ ...                                          │   │
│  │  🔍 Đang thực thi: "SELECT SUM(fulfilled_revenue_amount_vnd)... ON gohub_dw"              │   │
│  │  Typing dots:  ●  •  •                                                                    │   │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                 │
│  ┌─ PHẢN HỒI HOÀN TẤT TỪ BÉ GẤU ──────────────────────────────────────────────────────────────┐   │
│  │  🐻 Chào anh! Dưới đây là báo cáo doanh thu và biên lợi nhuận của nhà mạng 3HK trong tháng  │   │
│  │  8/2026 thực thi trực tiếp từ Kho dữ liệu gohub_dw:                                       │   │
│  │                                                                                           │   │
│  │  - Tổng doanh thu 3HK: 45,280,000 VND (Chiếm 29.7% tổng doanh thu toàn hệ thống).          │   │
│  │  - Lợi nhuận gộp 3HK: 11,540,000 VND.                                                     │   │
│  │  - Biên lợi nhuận gộp (GPM%): 25.48%.                                                     │   │
│  │                                                                                           │   │
│  │  ┌─ DOANH THU 3HK VS KHÁC ─────────────────────────────────────────────────────────────┐  │   │
│  │  │  3HK Datapool  ██████████ 45.2tr (29.7%)                                            │  │   │
│  │  │  Nhà mạng khác  ████████████████████████ 107.2tr (70.3%)                              │  │   │
│  │  └─────────────────────────────────────────────────────────────────────────────────────┘  │   │
│  │                                                                                           │   │
│  │  * Lưu ý: Toàn bộ số liệu trên đã được loại trừ phí ship và đơn nội bộ theo bộ lọc chuẩn.   │   │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                                 │
│  ┌─ Ô NHẬP LIỆU CHAT CHUẨN ────────────────────────────────────────────────────────────────────┐ │
│  │  [ Hỏi Bé Gấu về gói cước, tra cứu SKU, viết SQL hoặc quy trình...              ]  [ Gửi ]   │ │
│  └─────────────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```
