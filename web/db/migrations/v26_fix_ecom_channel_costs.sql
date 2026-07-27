-- Migration v26: Fix source_code cho 3 kênh VN-Ecom đổi tên (Shopee/TikTok/Lazada)
-- Chạy trong Supabase SQL Editor

-- Context:
--   Trước khi rename: VN-Ecom - Shopee (S0042), VN-Ecom - TiktokShop (S0042), VN-Ecom - Lazada (S0042)
--   → Tất cả đều fuzzy-matched về S0042 (VN-Ecom parent) → wrong
--
--   Sau khi rename, gohub_dw có 4 VN-Ecom codes:
--   S0042 = Shopee sub-channel, S0043 = TikTok sub-channel,
--   S0045 = Lazada sub-channel, S0100 = VN-Ecom aggregate
--
--   Fix: Gán đúng source_code để computeChannelCost match được per-sub-channel

UPDATE analytics_channel_costs
  SET source_code = 'S0043'
  WHERE channel = 'VN-Ecom - TiktokShop';

UPDATE analytics_channel_costs
  SET source_code = 'S0045'
  WHERE channel = 'VN-Ecom - Lazada';

-- VN-Ecom - Shopee: giữ S0042 (đúng rồi)
-- VN-Ecom - VN ECO Shopee Malay: giữ S0042 (cùng nhóm Shopee VN-Ecom)
-- VN-Ecom: giữ S0100 (đúng rồi — aggregate chính)
