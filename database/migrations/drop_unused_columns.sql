-- ============================================================
-- Xóa cột không có trong PM system
-- Chạy trong Supabase SQL Editor TRƯỚC KHI deploy sync.py mới
-- ============================================================

-- products: bỏ product_ref, gc_purchase_type
ALTER TABLE products
  DROP COLUMN IF EXISTS product_ref,
  DROP COLUMN IF EXISTS gc_purchase_type;

-- skus: bỏ sku_ref, parents
ALTER TABLE skus
  DROP COLUMN IF EXISTS sku_ref,
  DROP COLUMN IF EXISTS parents;

-- listings: bỏ các cột raw/backup/highlight/template + cột thừa
ALTER TABLE listings
  DROP COLUMN IF EXISTS listing_ref,
  DROP COLUMN IF EXISTS price_list,
  DROP COLUMN IF EXISTS esim_type_en,
  DROP COLUMN IF EXISTS esim_type_vn,
  DROP COLUMN IF EXISTS raw_unsupported_apps,
  DROP COLUMN IF EXISTS unsupported_apps_highlight_en,
  DROP COLUMN IF EXISTS unsupported_apps_highlight_vn,
  DROP COLUMN IF EXISTS raw_note,
  DROP COLUMN IF EXISTS raw_note_vn,
  DROP COLUMN IF EXISTS note_en_backup,
  DROP COLUMN IF EXISTS note_vn_backup,
  DROP COLUMN IF EXISTS supported_country_name_en,
  DROP COLUMN IF EXISTS supported_country_name_vn,
  DROP COLUMN IF EXISTS category_name_en,
  DROP COLUMN IF EXISTS category_name_vn,
  DROP COLUMN IF EXISTS change_apn_note_en,
  DROP COLUMN IF EXISTS change_apn_note_vn,
  DROP COLUMN IF EXISTS change_apn_links_en,
  DROP COLUMN IF EXISTS change_apn_links_vn,
  DROP COLUMN IF EXISTS kyc_pdf_template_code,
  DROP COLUMN IF EXISTS activation_pdf_template_code;

-- items: bỏ item_ref, price_list, channel, pricelistcode
ALTER TABLE items
  DROP COLUMN IF EXISTS item_ref,
  DROP COLUMN IF EXISTS price_list,
  DROP COLUMN IF EXISTS channel,
  DROP COLUMN IF EXISTS pricelistcode;
