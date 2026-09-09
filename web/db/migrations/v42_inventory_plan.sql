-- v42: thay tab Fulfillment (theo dõi tồn kho theo kho vật lý cũ) bằng kế hoạch nhập hàng theo tuần
-- + PO tracker, theo file "Plan nhập hàng theo tháng.xlsx" bên Ops dùng. Không xoá bảng cũ
-- inventory_items/inventory_snapshots/vendor_balances (không tạo qua migration nên không DROP ở đây).

CREATE TABLE IF NOT EXISTS inventory_plan_skus (
  sku_code               TEXT        PRIMARY KEY,
  company_code           TEXT        NOT NULL,             -- 'VN' | 'US'
  vendor                 TEXT,                              -- auto-lookup dim_sku nếu để trống khi thêm
  target_weeks_coverage  NUMERIC     NOT NULL DEFAULT 8,     -- số tuần tồn kho mục tiêu khi gợi ý nhập
  safety_weeks           NUMERIC     NOT NULL DEFAULT 3,     -- ngưỡng cảnh báo / kích hoạt gợi ý nhập
  lead_time_weeks        NUMERIC     NOT NULL DEFAULT 4,     -- thời gian vendor giao hàng (tuần)
  note                   TEXT,
  is_active              BOOLEAN     NOT NULL DEFAULT true,
  created_by             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_plan_skus_company ON inventory_plan_skus (company_code);

CREATE TABLE IF NOT EXISTS inventory_plan_weekly (
  id                  BIGSERIAL   PRIMARY KEY,
  sku_code            TEXT        NOT NULL REFERENCES inventory_plan_skus(sku_code) ON DELETE CASCADE,
  week_start_date     DATE        NOT NULL,
  actual_stock        NUMERIC,                               -- Input tay OPS (chưa có nguồn gohub_dw)
  sales_forecast       NUMERIC,                               -- gợi ý auto (velocity 30d) hoặc OPS ghi đè
  sales_forecast_auto  BOOLEAN     NOT NULL DEFAULT true,      -- false = OPS đã ghi đè
  import_qty           NUMERIC,                               -- gợi ý auto (reorder-to-target) hoặc OPS ghi đè
  import_qty_auto      BOOLEAN     NOT NULL DEFAULT true,
  updated_by           TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sku_code, week_start_date)
);
CREATE INDEX IF NOT EXISTS idx_inv_plan_weekly_sku  ON inventory_plan_weekly (sku_code);
CREATE INDEX IF NOT EXISTS idx_inv_plan_weekly_week ON inventory_plan_weekly (week_start_date);

CREATE TABLE IF NOT EXISTS inventory_po (
  id                      BIGSERIAL   PRIMARY KEY,
  vendor                  TEXT        NOT NULL,
  sku_code                TEXT        NOT NULL,
  qty                     NUMERIC     NOT NULL,
  company_code            TEXT,                              -- VN/US, suy từ SKU hoặc nhập tay
  expected_stockout_date  DATE,                               -- Ngày hết hàng dự kiến
  need_by_date            DATE,                               -- Ngày cần có hàng tại kho
  payment_deadline        DATE,                               -- Ngày trễ nhất cần thanh toán
  expected_arrival_date   DATE,                               -- Ngày có hàng dự kiến tại kho
  payment_status          TEXT        NOT NULL DEFAULT 'Chưa thanh toán',
  payment_date            DATE,
  delivery_status         TEXT        NOT NULL DEFAULT 'Chờ thanh toán',
  expected_arrival_week   TEXT,                               -- tuần về hàng dự kiến (freeform)
  note                    TEXT,
  created_by              TEXT,
  updated_by              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_po_sku    ON inventory_po (sku_code);
CREATE INDEX IF NOT EXISTS idx_inv_po_status ON inventory_po (delivery_status);
