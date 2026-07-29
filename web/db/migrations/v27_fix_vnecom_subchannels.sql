-- Migration v27: Fix triệt để source_code cho tất cả VN-Ecom sub-channels
-- Chạy trong Supabase SQL Editor
--
-- Vấn đề: "VN-Ecom - Shopee/TiktokShop/Lazada/VN ECO Shopee Malay" có source_code khác nhau
-- (S0042/S0043/S0045) → computeChannelCost chỉ tìm được 1 sub-channel tại 1 thời điểm.
-- Fix: Set source_code = 'S0100' (code tổng hợp của "VN-Ecom") cho TẤT CẢ sub-channels.
--
-- Sau fix: matchChannelCost sẽ tìm bằng sub-channel prefix "VN-Ecom - " (độc lập với source_code)
-- → luôn tìm được tất cả, không bỏ sót kênh nào.

UPDATE analytics_channel_costs
  SET source_code = 'S0100'
  WHERE channel LIKE 'VN-Ecom - %';

-- Verify:
-- SELECT channel, source_code, COUNT(*) as months
-- FROM analytics_channel_costs
-- WHERE channel LIKE 'VN-Ecom%'
-- GROUP BY channel, source_code ORDER BY channel;
