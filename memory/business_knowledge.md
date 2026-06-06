---
name: business_knowledge
description: Kiến thức business — 2 pháp nhân, COGS 3HK formula, tỷ giá T03/2026, data policy codes
metadata:
  type: reference
---

## 2 Pháp Nhân

- **Gohub Inc (US)** — Mua từ vendor ngoài (source A-E: US StockDirect, Internal, MonthlyInvoice, TelcoBalance, Datapool)
  - Tenant=US trong database
  - Bán lại cho Gohub JSC hoặc trực tiếp khách US

- **Gohub JSC (VN)** — Mua từ Gohub Inc hoặc vendor VN (source 1-6: VN StockDirect, Internal GHI, MonthlyInvoice, TelcoBalance, Datapool, Others)
  - Tenant=VN trong database
  - Bán cho khách VN qua App/web

**Ưu tiên**: Chatbot suggest VN trước US (xem [[chatbot_rules]])

---

## COGS 3HK Formula (US Datapool — source_type E)

Dùng giá zone 3HK + assumption data sử dụng → tính COGS USD → convert VND

**Giá 3HK theo khu vực (HKD/GB)**:
- Châu Á 12 nước: 5 HKD
- Châu Âu + US: 7 HKD  
- AU + NZ: 6.5 HKD

**Assumption (theo data thực tế từ 3HK)**:
- Fixed gói: est 55% sử dụng
- Daily gói: est 40% sử dụng
- Unlimited 500MB throttle 10Mbps: 1.8 GB/ngày
- Unlimited 500MB throttle 5Mbps: 1.6 GB/ngày

**Công thức tính COGS USD**:
- Fixed: `GB × giá_HKD/GB × 55% ÷ tỷ_giá_HKD/USD`
- Daily: `GB/ngày × số_ngày × giá_HKD/GB × 40% ÷ tỷ_giá_HKD/USD`
- Unlimited 10Mbps: `1.8 GB/ngày × số_ngày × giá_HKD/GB ÷ tỷ_giá_HKD/USD`
- Unlimited 5Mbps: `1.6 GB/ngày × số_ngày × giá_HKD/GB ÷ tỷ_giá_HKD/USD`

**3HK trong chatbot**: Chỉ thông báo zone/network/giá_HKD/GB/KYC — KHÔNG tự tính gói. Đây là info tham khảo cho Hiếu tạo SP nếu cần. ([[chatbot_rules]] rule #2)

---

## Tỷ Giá Nội Bộ T03/2026

**Nguồn**: D:\Kien_Thuc\Work\gohub\LamViec\HeThong\TaiLieuCongTy_Chung\Tỉ giá nội bộ theo tháng.xlsx  
**Mới nhất**: T03/2026 (T04-T06 chưa cập nhật)

```
Gohub JSC:
  USD/VND = 26,394
  CNY/VND = 3,970
  GBP/VND = 35,957

Gohub Inc:
  HKD/USD = 7.798
  TWD/USD = 31.452
  JPY/USD = 158.916
  THB/USD = 32.204
  CNY/USD = 6.727
```

**Dùng để**: Quy đổi giá COGS WM (gốc TWD) + 3HK (gốc HKD) → USD → VND ([[chatbot_rules]] rule #3)

---

## Product Type & Data Policy Codes

### Product Type (ký tự 2 của product_code)

**US + VN common**:
- C = eSIM Full (eSIM profile + data bundle)
- E = SIM Full (SIM frame + data bundle)
- F = Phí Ship
- G = Quà tặng
- H = Khác

**VN only** (source 1-6):
- 1 = eSIM Full VN
- 2 = SIM Full VN
- 3 = Phí Ship VN
- 4 = Dịch vụ VAT VN

**US only** (source A-E):
- A = SIM/eSIM Data (Datapack chỉ, không có profile)
- B = eSIM Profile (chỉ profile, không data)
- D = SIM Frame (chỉ frame, không data)

**Chatbot**: Chỉ suggest C/E/1/2 (sản phẩm hoàn chỉnh) ([[chatbot_rules]] rule #1)

### Data Policy Code (ký tự cuối product_code)

**Unlimited throttled** (sau khi hết cap → unlimited nhưng throttle):
- A = Daily-cap → Unlimited 5Mbps (reset mỗi ngày)
- B = Daily-cap → Unlimited 10Mbps (reset mỗi ngày)
- E = Fixed-cap → Unlimited 5Mbps (KHÔNG reset, tổng cap cố định)
- G = Fixed-cap → Unlimited 10Mbps (KHÔNG reset)

**Unlimited không throttle** (sau cap → full speed unlimited):
- C = Unlimited 20Mbps cố định
- D = Unlimited 100Mbps cố định
- H = Unlimited 5Mbps cố định
- Y = Fixed no-throttle
- Z = Daily no-throttle

**Throttle sau cap** (sau cap → throttle <2Mbps, không unlimited):
- F = Fixed throttle <2Mbps
- P = Daily throttle <2Mbps

**Đặc biệt**:
- K = Dành cho eSIM profile + SIM frame (không data)

---

## Liên kết

[[chatbot_rules]] — 5 rules dùng knowledge này  
[[feedback_autonomous]] — hoàn toàn tự do implement
