# Data Folder — GoHub Reference Data

Thư mục này chứa các file dữ liệu tham chiếu (reference data) không lấy từ API hệ thống.
Khi bạn cập nhật/thêm file mới vào đây và push lên GitHub, GitHub Actions sẽ tự động sync vào Supabase.

## Cấu trúc thư mục

```
Data/
├── ref/                    ← Reference data (ít thay đổi)
│   ├── countries.xlsx      → ref_countries
│   ├── support_countries.xlsx → ref_support_countries
│   ├── vendors.xlsx        → ref_vendors
│   ├── categories.xlsx     → ref_categories (B2C country display codes)
│   └── fx_rates.xlsx       → app_settings (FX rates)
│
└── ncc/                    ← NCC product catalogs
    ├── worldmove.xlsx      → ncc_worldmove  (chạy import_worldmove_v2.py)
    └── 3hk_zones.xlsx      → ncc_3hk        (chạy import_3hk.py)
```

## Quy tắc đặt tên file

| File mới | Tên chuẩn |
|---|---|
| countries-2026-06-05.xlsx | `countries.xlsx` |
| support-countries-2026-06-05.xlsx | `support_countries.xlsx` |
| vendors-2026-06-05.xlsx | `vendors.xlsx` |
| Tỉ giá nội bộ theo tháng.xlsx | `fx_rates.xlsx` |

> **Ghi chú**: Đặt tên file không có ngày tháng. File cũ có date suffix vẫn hoạt động nhưng khuyến khích dùng tên chuẩn.

## Cách update data

1. Export file từ GoHub system → đặt tên theo chuẩn bên trên
2. Copy vào đúng thư mục (`ref/` hoặc `ncc/`)
3. Commit + push lên GitHub → Actions tự động chạy
4. Hoặc chạy thủ công: `python database/import/sync_data_files.py`

## Format từng file

### countries.xlsx
| Column | Mô tả |
|---|---|
| code | ISO 2-char (JP, KR, VN...) |
| name | Tên tiếng Anh |
| nameVn | Tên tiếng Việt |

### support_countries.xlsx
| Column | Mô tả |
|---|---|
| code | GoHub group code (JPN, EU1, W04...) |
| name | Alias (thường = code) |
| supportCountry | Mô tả nước thuộc nhóm (EN) |
| supportCountryVn | Mô tả nước thuộc nhóm (VN) |
| countryCodes | ISO codes cách nhau bởi dấu phẩy (JP, KR, TW...) |

### vendors.xlsx
| Column | Mô tả |
|---|---|
| Vendor Code | WM, 3H, BC... |
| Name | WORLDMOVE, 3HK... |
| Description | Ghi chú thêm |

### categories.xlsx (mới — user export từ GoHub)
| Column | Mô tả |
|---|---|
| category_code | Mã danh mục (dùng trong listings/items) |
| name_en | Tên EN |
| name_vn | Tên VN |
| iso_code | ISO 2-char tương ứng |
| region_type | country / multi_country / global |

### fx_rates.xlsx
File tỷ giá nội bộ hàng tháng (sheet "FX" hoặc "Tỷ giá").
Script tự động đọc tháng gần nhất có dữ liệu.

## Cơ chế phát hiện thay đổi

Script dùng **SHA-256 hash** để so sánh:
- Hash của file hiện tại vs hash lần import trước (lưu trong bảng `data_file_registry`)
- Chỉ import nếu file thay đổi → tránh import thừa

Để force re-import tất cả:
```bash
python database/import/sync_data_files.py --force
```
Hoặc trigger GitHub Actions với option `force=true`.
