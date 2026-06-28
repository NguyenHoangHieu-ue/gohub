# Fulfillment Report (Báo Cáo Hoàn Thành Đơn)

Phân tích chất lượng vận hành cấp phát SIM/eSIM tự động: tỷ lệ thành công, thời gian hoàn thành, phân bổ đối tác giao.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: đo chất lượng khâu giao hàng/kích hoạt — đơn có được cấp eSIM/SIM thành công & nhanh không.
- **Tại sao quan trọng**: doanh thu chỉ "thật" khi đơn được fulfil; tỷ lệ lỗi cao = mất tiền + mất uy tín.

## 2. Đường dẫn & file
- **Web**: `/analytics/fulfillment` — `web/src/app/(dashboard)/analytics/fulfillment/page.tsx`
- **API**: `/api/analytics/fulfillment-report`

## 3. Nguồn dữ liệu & chỉ số
- **Nguồn**: bảng vận hành đơn trong `gohub_dw` (`fact_fulfilment_*`).
- **Success Rate** = số eSIM/SIM gửi thành công / tổng đơn thanh toán.
- **Mean Fulfillment Time** = thời gian trung bình từ nhận đơn → kích hoạt thành công.
- **Phân bổ đối tác giao**: hiệu quả giao SIM vật lý theo từng đơn vị vận chuyển.

## 4. Lưu ý
- Bảng fact fulfillment ~585k dòng, cột ngày kiểu TEXT không index → query nặng; hưởng lợi từ cache 12h + prewarm chung của phân hệ analytics.

## 5. Phân quyền
- **Admin, Creator, Manager, BOD, Staff**. **Standard** bị loại trừ.
