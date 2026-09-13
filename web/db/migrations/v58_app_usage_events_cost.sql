-- v58: Cost dashboard riêng Gấu Pro (đề xuất D trong roadmap audit s196+5)
--
-- Gấu Pro trước đây KHÔNG ghi app_usage_events cho mỗi lượt chat nào (khác Bé Gấu) — không ai thấy
-- được chi phí Gemini thật. Thêm cột token + ước tính chi phí, ghi khi mỗi lượt chat Gấu Pro hoàn tất.
ALTER TABLE app_usage_events ADD COLUMN IF NOT EXISTS tokens_in    INTEGER;
ALTER TABLE app_usage_events ADD COLUMN IF NOT EXISTS tokens_out   INTEGER;
ALTER TABLE app_usage_events ADD COLUMN IF NOT EXISTS est_cost_usd NUMERIC(10,4);
