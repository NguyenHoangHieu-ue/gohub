---
name: feedback_no_push_sensitive
description: Không commit/push VENDOR, Add_product, TaiLieuCongTy_Chung, .env lên GitHub
metadata:
  type: feedback
---

**Rule**: Những folder/file dưới đây TUYỆT ĐỐI KHÔNG được push lên GitHub (đã trong .gitignore):

- `VENDOR/` — thư viện vendor (tạo bằng composer/npm — re-generate được)
- `Add_product/` — internal scripts cá nhân
- `TaiLieuCongTy_Chung/` — tài liệu nội bộ công ty (COGS template, tỷ giá, quy trình nhập SP...)
- `.env`, `.env.local` — secrets (API keys, database passwords)
- `sync/` — cũ, không dùng nữa (giữ lại nhưng không push)

**Why**: 
- Những file này để lại trên GitHub → lộ secret, IP thương mại
- Team khác nhìn vào GitHub chỉ cần thấy web UI code, không cần backend/internal stuff

**How to apply**:
- Check .gitignore — nó đã có danh sách
- Trước khi push: `git status` xem có file không mong muốn không
- Nếu vô tình stage folder sensitive → `git reset <file>` để bỏ ra
- Khi tạo file mới: nếu là internal/secret → tay thêm vào .gitignore ngay

**Example .gitignore entries** (đã có):
```
VENDOR/
Add_product/
TaiLieuCongTy_Chung/
.env
.env.local
.env.*.local
sync/
```
