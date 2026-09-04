# V2_RULES.md — Quy tắc Vận hành Phiên làm việc & Quy trình CI/CD Chuẩn (GoHub Intel v2)

> **ĐỌC TRƯỚC TIÊN KHI BẮT ĐẦU MỌI SESSION**: File này chứa các nguyên tắc vàng, trình tự kiểm tra đầu phiên, và quy trình CI/CD bắt buộc đối với mọi AI và nhà phát triển tham gia dự án.

---

## I. QUY TRÌNH BẮT ĐẦU PHIÊN LÀM VIỆC (SESSION INITIATION CHECKLIST)

Khi bắt đầu một phiên làm việc mới, nhà phát triển (hoặc AI) bắt buộc phải thực hiện các bước sau theo đúng thứ tự:

1.  **Đọc các tài liệu nền tảng**:
    *   Đọc **`gohub-v2/V2_RULES.md`** (file này) để nắm rõ quy tắc phân nhánh và lưu ý của Hiếu.
    *   Đọc **`gohub-v2/V2_ERRORS_MEM.md`** để rà soát danh sách các lỗi kinh điển đã từng xảy ra trong quá khứ nhằm tuyệt đối không tái phạm.
    *   Đọc **`gohub-v2/ANALYTICS_TABS_SPEC.md`** và **`gohub-v2/FORMULAS.md`** nếu nhiệm vụ liên quan tới sửa đổi báo cáo hoặc công thức tài chính.
2.  **Kiểm tra trạng thái Source Control (Git Status)**:
    *   Chạy `git status` và `git branch` để xác nhận nhánh đang hoạt động.
    *   **Nhánh mặc định để làm việc luôn là `staging`**.

---

## II. NGUYÊN TẮC PHÂN NHÁNH & CAM KẾT (BRANCHING & COMMIT RULES)

### 1. Tuyệt đối không commit thẳng lên `main`
*   Mọi thay đổi, vá lỗi, tính năng mới đều phải được viết trên nhánh `staging` (hoặc các nhánh `feature/*` tách ra từ `staging`).
*   **Chỉ được phép Merge vào `main` khi Hiếu (role `creator`) đưa ra yêu cầu rõ ràng và trực tiếp** trong phiên trò chuyện hiện tại.

### 2. Quy tắc Commit & Đóng gói
*   Không sử dụng `git add .` vô tội vạ để tránh việc đưa nhầm các file rác local (như `Bug.txt`, `WORK.md`, `new_info.txt`, các file nháp Excel, hoặc thông tin credentials) lên GitHub.
*   Chỉ chọn lọc và `git add <file>` cụ thể các file mã nguồn sạch đã được kiểm thử.
*   **Giữ thư mục `gohub-v2/` hoàn toàn ở local**: Thư mục này chứa đặc tả kỹ thuật nội bộ và blueprints thiết kế lại, **nghiêm cấm** commit hoặc push lên bất kỳ repository công khai/bán công khai nào. Thư mục này đã được thêm vào cơ chế bảo mật local.

---

## III. QUY TRÌNH CI/CD CHUẨN HOÁ (AUTOMATED CI/CD WORKFLOW)

Mọi session chỉnh sửa hoặc phát triển code phải tuân thủ nghiêm ngặt quy trình 4 lớp bảo vệ sau:

```
 [Viết code Local] ─► [Husky Pre-commit] ─► [GitHub Action CI (PR)] ─► [Deploy Staging] ─► [Merge Main]
                       - Secret scan          - tsc --noEmit             - Vercel Preview  - Chỉ khi có
                       - Lint check           - Vitest (Unit test)       - QA test tay       chỉ thị rõ
```

### Lớp 1: Husky & Pre-commit Hooks (Local)
*   Tự động chạy linter và quét bảo mật rò rỉ mã khóa (Secret Scanning) trước khi cho phép tạo commit local.
*   Nghiêm cấm đưa API Keys, Token Lark hay Supabase credentials vào bất kỳ tệp tin `.md` hay `.txt` nào trong repo. Tất cả phải nằm ở `.env.local` (local-only).

### Lớp 2: GitHub Actions CI (Pull Request Stage)
*   Khi có PR từ nhánh phát triển vào `staging`, GitHub Runner sẽ tự động dựng môi trường ảo và chạy:
    1.  **Lớp Biên dịch (Type-Check)**: `tsc --noEmit` để đảm bảo khớp kiểu dữ liệu 100%, không cho phép bất kỳ lỗi compile nào trôi qua.
    2.  **Lớp Linter**: `npm run lint` kiểm tra chuẩn viết code sạch (Anti-Slop check).
    3.  **Lớp Unit Test**: `npm run test` chạy kiểm thử các hàm tính toán CM1, CAC, 3HK COGS nằm trong `src/core/formulas/` để xác nhận không bị sai lệch toán học.

### Lớp 3: Triển khai Staging & QA kiểm toán (QA & Verification)
*   Sau khi vượt qua CI, code được merge vào `staging` và tự động deploy lên link Vercel Preview (Staging environment).
*   Người dùng (Hiếu) sẽ thực hiện kiểm thử thực tế (test tay) trên link Staging này để đảm bảo giao diện đẹp mắt và số liệu chính xác trước khi cho phép phát hành.

### Lớp 4: Triển khai Sản xuất (Production Release)
*   Chỉ khi Staging đã ổn định hoàn toàn và có xác nhận từ người quản trị, tiến trình merge `staging` vào `main` mới được thực hiện để Vercel tự động phát hành phiên bản Production thực tế tại `gohub-intel.vercel.app`.
