# Elite Mobile (SIMply) — Toàn bộ sản phẩm GoHub

> Nguồn: Web portal https://simply.elitemobile.com (AJAX endpoints)
> Account: goh002 | Ngày lấy: 2026-07-31
> API doc: SIMply Retailer API VER 3.00.docx

---

## 1. Quyền truy cập

| Loại                        | Trạng thái                 |
| ---------------------------- | ---------------------------- |
| Topup UK (8 mạng)           | ✅ Đầy đủ                |
| Network eSIM UK (O2 + Three) | ✅ Đầy đủ (via REST API) |
| eSIM quốc tế               | ❌ Chưa được cấp quyền |

---

## 2. TopUp UK — 8 mạng

### Vodafone — TopUp E-Voucher

| Sản phẩm             | Giá (£) | SKU     | Barcode       |
| ---------------------- | --------- | ------- | ------------- |
| Vodafone Pay as you go | £5.00    | E-VOD5  | 5055015201367 |
| Vodafone Pay as you go | £10.00   | E-VOD10 | 5055015201374 |
| Vodafone Pay as you go | £15.00   | E-VOD15 | 5055015201381 |
| Vodafone Pay as you go | £20.00   | E-VOD20 | 5055015207130 |
| Vodafone Pay as you go | £25.00   | E-VOD25 | 5055015201398 |
| Vodafone Pay as you go | £30.00   | E-VOD30 | 5055015207147 |
| Vodafone Pay as you go | £40.00   | E-VOD40 | 5055015207154 |
| Vodafone Pay as you go | £50.00   | E-VOD50 | 5055015207161 |

**Bundles:**

| Bundle           | Giá (£) | Barcode       |
| ---------------- | --------- | ------------- |
| Big Value Bundle | £10.00   | 5033901078842 |
| Big Value Bundle | £20.00   | 5033901078866 |
| Big Value Bundle | £30.00   | 5055015235836 |

---

### O2 — TopUp E-Voucher

| Sản phẩm  | Giá (£) | SKU    | Barcode       |
| ----------- | --------- | ------ | ------------- |
| O2 PAY & GO | £10.00   | E-O210 | 5038262001621 |
| O2 PAY & GO | £15.00   | E-O215 | 5038262001638 |
| O2 PAY & GO | £20.00   | E-O220 | 5038262001645 |
| O2 PAY & GO | £25.00   | E-O225 | 5038262001652 |
| O2 PAY & GO | £30.00   | E-O230 | 5038262004929 |
| O2 PAY & GO | £35.00   | E-O235 | 5038262001669 |
| O2 PAY & GO | £50.00   | E-O250 | 5038262001676 |

*(No bundles)*

---

### Three UK — TopUp E-Voucher

| Sản phẩm      | Giá (£) | SKU         | Barcode       |
| --------------- | --------- | ----------- | ------------- |
| TopUp E-Voucher | £10.00   | E-THREE10   | 5050553800393 |
| TopUp E-Voucher | £15.00   | E-THREE15   | 5050553800409 |
| TopUp E-Voucher | £20.00   | E-THREE20   | 5050553800416 |
| TopUp E-Voucher | £27.50   | E-THREE27.5 | 5050553890196 |
| TopUp E-Voucher | £30.00   | E-THREE30   | 5050553800430 |
| TopUp E-Voucher | £35.00   | E-THREE35   | 5050553802175 |
| TopUp E-Voucher | £40.00   | E-THREE40   | 5050553800447 |
| TopUp E-Voucher | £50.00   | E-THREE50   | 5050553800454 |
| TopUp E-Voucher | £90.00   | E-THREE90   | 5050553890158 |

*(No bundles — Three bundles loaded từ GetESIMTopupBundles, xem mục 3)*

---

### Lebara — TopUp E-Voucher

| Sản phẩm     | Giá (£) | SKU     | Barcode       |
| -------------- | --------- | ------- | ------------- |
| Lebara E-Topup | £5.00    | E-LEB5  | 5060296406530 |
| Lebara E-Topup | £10.00   | E-LEB10 | 5060296406554 |
| Lebara E-Topup | £15.00   | E-LEB15 | 5060296406561 |
| Lebara E-Topup | £20.00   | E-LEB20 | 5060296406578 |
| Lebara E-Topup | £30.00   | E-LEB30 | 5060296406592 |
| Lebara E-Topup | £50.00   | E-LEB50 | 5060296406622 |

*(No bundles)*

---

### Lyca — TopUp E-Voucher

| Sản phẩm | Giá (£) | SKU      | Barcode       |
| ---------- | --------- | -------- | ------------- |
| Lyca TopUp | £5.00    | E-LYCA5  | 5060172540075 |
| Lyca TopUp | £10.00   | E-LYCA10 | 5060172540037 |
| Lyca TopUp | £15.00   | E-LYCA15 | 5060172540402 |
| Lyca TopUp | £20.00   | E-LYCA20 | 5060172540044 |
| Lyca TopUp | £30.00   | E-LYCA30 | 5060172540556 |
| Lyca TopUp | £40.00   | E-LYCA40 | 5060172540112 |
| Lyca TopUp | £50.00   | E-LYCA50 | 5060172540136 |

*(No bundles)*

---

### EE — TopUp E-Voucher

| Sản phẩm | Giá (£) | SKU    | Barcode       |
| ---------- | --------- | ------ | ------------- |
| EE e-TopUp | £10.00   | E-EE10 | 5025743888222 |
| EE e-TopUp | £15.00   | E-EE15 | 5025743888239 |
| EE e-TopUp | £20.00   | E-EE20 | 5025743888253 |
| EE e-TopUp | £25.00   | E-EE25 | 5025743888246 |
| EE e-TopUp | £30.00   | E-EE30 | 5025743888260 |
| EE e-TopUp | £35.00   | E-EE35 | 5025743888277 |
| EE e-TopUp | £40.00   | E-EE40 | 5025743888284 |
| EE e-TopUp | £45.00   | E-EE45 | 5025743888291 |
| EE e-TopUp | £50.00   | E-EE50 | 5025743888307 |

*(No bundles)*

---

### GIFF GAFF — TopUp E-Voucher

| Sản phẩm | Giá (£) | SKU    | Barcode       |
| ---------- | --------- | ------ | ------------- |
| Giff Gaff  | £10.00   | E-GG10 | 5060236220011 |
| Giff Gaff  | £15.00   | E-GG15 | 5060236220028 |
| Giff Gaff  | £20.00   | E-GG20 | 5060236220035 |

*(No bundles)*

---

### Voxi — TopUp E-Voucher

| Sản phẩm | Giá (£) | SKU      | Barcode       |
| ---------- | --------- | -------- | ------------- |
| Voxi TopUp | £10.00   | E-VOXI10 | 5060380639202 |
| Voxi TopUp | £12.00   | E-VOXI12 | 5060380639219 |
| Voxi TopUp | £15.00   | E-VOXI15 | 5060380639226 |
| Voxi TopUp | £20.00   | E-VOXI20 | 5060380639233 |
| Voxi TopUp | £30.00   | E-VOXI30 | 5060380639240 |
| Voxi TopUp | £35.00   | E-VOXI35 | 5060380639257 |

*(No bundles)*

---

## 3. Network eSIM UK (O2 + Three)

### O2 eSIM

| Sản phẩm                | Data   | Giá (£) | Loại |
| ------------------------- | ------ | --------- | ----- |
| O2 P&G 8GB DATA BB eSIM   | 8 GB   | £10.00   | TopUp |
| O2 P&G 25GB DATA BB eSIM  | 25 GB  | £15.00   | TopUp |
| O2 P&G 40GB DATA BB eSIM  | 40 GB  | £20.00   | TopUp |
| O2 P&G 125GB DATA BB eSIM | 125 GB | £30.00   | TopUp |

> O2 eSIM: Topup = tự kèm bundle data (không cần chọn bundle riêng).

### Three UK eSIM

**TopUp E-Voucher** (nạp vào tài khoản Three trước):

| Mệnh giá      | Giá (£) |
| --------------- | --------- |
| TopUp E-Voucher | £10.00   |
| TopUp E-Voucher | £15.00   |
| TopUp E-Voucher | £20.00   |
| TopUp E-Voucher | £27.50   |
| TopUp E-Voucher | £30.00   |
| TopUp E-Voucher | £35.00   |
| TopUp E-Voucher | £40.00   |
| TopUp E-Voucher | £50.00   |
| TopUp E-Voucher | £90.00   |

**Data Bundles** (chọn sau khi nạp TopUp):

| Bundle                 | Data                 | Giá Bundle (£) | Product Code |
| ---------------------- | -------------------- | ---------------- | ------------ |
| 40GB Data-Pack         | 40 GB                | £10.00          | 14598892     |
| 100GB Data-Pack        | 100 GB               | £15.00          | 14598992     |
| 200GB Data-Pack        | 200 GB               | £20.00          | 14599092     |
| Unlimited Data Pack    | Unlimited            | £35.00          | 312057       |
| Unlimited Data Pack 3M | Unlimited (3 tháng) | £90.00          | 4181859      |

---

## 4. Three UK — Pricing & Commission (từ GO HUB.xlsx)

### Three UK - Physical SIM

| Data Plan | TopUp Req. | Minutes   | Texts     | EU Roaming | Validity | Commission (£) | Net Cost (£) |
| --------- | ---------- | --------- | --------- | ---------- | -------- | --------------- | ------------- |
| 40GB      | UNLIMITED  | Unlimited | Unlimited | 6GB        | 30 ngày | £4.70          | £5.30        |
| 100GB     | 40GB       | Unlimited | Unlimited | 12GB       | 30 ngày | £7.50          | £7.50        |
| 200GB     | £20       | Unlimited | Unlimited | 18GB       | 30 ngày | £9.50          | £11.50       |
| Unlimited | £35       | Unlimited | Unlimited | 30GB       | 30 ngày | £18.50         | £16.50       |

### Three UK - eSIM

| Data Plan | TopUp Req. | Minutes   | Texts     | ROW Roaming | Validity | Commission (£) | Net Cost (£) |
| --------- | ---------- | --------- | --------- | ----------- | -------- | --------------- | ------------- |
| 40GB      | UNLIMITED  | Unlimited | Unlimited | 6GB         | 30 ngày | £4.25          | £5.75        |
| 100GB     | 40GB       | Unlimited | Unlimited | 12GB        | 30 ngày | £6.25          | £8.75        |
| 200GB     | £20       | Unlimited | Unlimited | 18GB        | 30 ngày | £8.25          | £11.75       |
| Unlimited | £35       | Unlimited | Unlimited | 30GB        | 30 ngày | £14.25         | £20.75       |

**EU Roaming (Physical + eSIM — Calls+Texts+Data):** Austria, Azores, Balearic Islands, Belgium, Bulgaria, Canary Islands, Croatia, Czech Republic, Denmark, Estonia, Finland, France, French Guiana, Germany, Gibraltar, Greece, Guadeloupe, Guernsey, Hungary, Iceland, Ireland, Isle of Man, Italy, Jersey, Latvia, Liechtenstein, Lithuania, Luxembourg, Madeira, Martinique, Mayotte, Netherlands, Norway, Poland, Portugal, Romania, Saint Barthelemy, Saint Martin, San Marino, Slovakia, Slovenia, Spain, Sweden, Switzerland, Vatican City.

**REST OF WORLD Roaming (Data only):** Australia, Brazil, Chile, Colombia, Costa Rica, El Salvador, Guatemala, Hong Kong, Indonesia, Israel, Macau, New Zealand, Nicaragua, Panama, Peru, Puerto Rico, Singapore, Sri Lanka, Uruguay, US Virgin Islands, Vietnam, USA.


![1785468813667](image/elite_products/1785468813667.png)

---

## 5. API & Portal Reference

```
Web Portal:  https://simply.elitemobile.com  (ASP.NET form login)
REST API:    https://api.simply.elitemobile.com  (OAuth2 password grant)

AUTH (Web): POST /Login
  body: Username=goh002&Password=***&ShowCaptcha=False&RememberMe=false&hdnProjectUrl=https://simply.elitemobile.com

AUTH (API): POST /GenerateToken
  body: grant_type=password&username=goh002&password=***&client_id=ac7c1ffb-4528-46c9-9a58-62b15460519e&client_secret=BzTGooMS0QXhgQmz9iWkJ4dpUrdbQx
  Token hết hạn: 15 phút

WEB AJAX (sau khi login):
  GET  /CorporateTopUp/GetNetworkWiseTopUps/{networkId}   → Topup list per network
  GET  /CorporateTopUp/GetNetworkWiseBundles/{networkId}  → Bundle list per network

REST API ENDPOINTS:
  GET  /GetESIMNetworks                          → O2 + Three
  POST /GetESIMTopupBundles  {NetworkName}       → Three bundles + O2 topups
  POST /PurchaseNetworkESIM                      → Mua Network eSIM
  GET  /GetNetworks                              → 8 topup networks
  POST /ConfirmContact  {NetworkName, ContactNumber} → Validate + get topups cho số cụ thể
  POST /RechargeTopup                            → Nạp tiền

Network IDs (web portal): Vodafone=1, O2=2, Three=3, Lebara=7, Lyca=8, EE=11, GIFF GAFF=13, Voxi=14
```

---

## 6. Tổng kết sản phẩm

| Danh mục                    | Số lượng                         |
| ---------------------------- | ----------------------------------- |
| Vodafone TopUp               | 8 mệnh giá + 3 bundles            |
| O2 TopUp                     | 7 mệnh giá                        |
| Three UK TopUp               | 9 mệnh giá                        |
| Lebara TopUp                 | 6 mệnh giá                        |
| Lyca TopUp                   | 7 mệnh giá                        |
| EE TopUp                     | 9 mệnh giá                        |
| GIFF GAFF TopUp              | 3 mệnh giá                        |
| Voxi TopUp                   | 6 mệnh giá                        |
| **Tổng TopUp UK**     | **55 sản phẩm + 3 bundles** |
| O2 Network eSIM              | 4 gói data                         |
| Three Network eSIM           | 9 TopUp + 5 Data Bundles            |
| **Tổng Network eSIM** | **18 sản phẩm**             |
| **TỔNG CỘNG**        | **~76 sản phẩm**            |

> **eSIM quốc tế**: Account goh002 hiện chưa có quyền. Liên hệ Elite để mở nếu cần.
