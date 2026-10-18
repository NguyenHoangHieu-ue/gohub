# QA tab Analyst — hướng dẫn chung

Plan gốc: `docs/plans/analyst-full-qa.md`. Thư mục này chứa mọi sản phẩm của đợt QA.

```
docs/qa/
  README.md              (file này)
  periods.md             bộ kỳ thử cố định (G0.4)
  oracle.md              bộ đối chứng SQL độc lập (G0.3) — mã ở web/scripts/qa/oracle.js
  inventory/<tab>.md     kiểm kê điều khiển từng tab (G0.1) — sinh bởi web/scripts/qa/inventory.mjs
  queries/<tab>.md       kiểm kê route, bảng nguồn, cache, quyền (G0.2) — sinh bởi web/scripts/qa/queries.mjs
  results/_template.md   khung ghi kết quả (G0.5)
  results/<tab>.md       kết quả QA từng tab (G1 trở đi)
  findings.md            bảng phát hiện tổng hợp, theo mức độ
```

## Quy ước

- **ID ô kiểm**: `<tab>-<nhóm><số>`. Nhóm: `B` nút, `I` ô nhập hoặc hộp tích, `S` danh sách chọn, `W` thao tác ghi, `N` con số, `F` công thức, `E` nhất quán trong tab, `X` xuất file, `G` trường hợp biên, `P` hiệu năng và cache, `U` hiển thị. Ví dụ `bod-N012`.
- **Trạng thái**: `ĐẠT`, `LỖI`, `NGHI` (cần xác nhận với Hiếu), `N/A`, `CHƯA`.
- **Mức độ lỗi**: `P0` sai số tiền hoặc mất dữ liệu · `P1` sai số ở trường hợp thường gặp, hoặc ghi bị 403 câm · `P2` không nhất quán, dễ hiểu lầm, thiếu chức năng · `P3` giao diện, nhãn, tiện dụng.
- **Dung sai**: tổng nguyên 0 đồng; số có làm tròn tối đa 5 đồng; phần trăm 0,05 điểm.
- **Bằng chứng**: tham số, số mong đợi (nguồn đối chiếu), số thấy, ảnh chụp nếu là giao diện.

## Công cụ

| Việc | Cách làm |
|---|---|
| Quét lại kiểm kê sau khi code đổi | `node web/scripts/qa/inventory.mjs` rồi `node web/scripts/qa/queries.mjs` |
| Chạy SQL đối chứng | Mở tab staging đã đăng nhập (Creator), dán `web/scripts/qa/oracle.js` vào console (hoặc `javascript_tool`), gọi `await QA.run("rev_by_group", {start, end})`. Xem `oracle.md` |
| So cặp tab tự động | `cd web && npm run test:consistency` (Bearer `CRON_SECRET` trong `web/.env.local`) |
| Kiểm tra tĩnh | `cd web && npx vitest run src/__tests__/analytics-consistency-static.test.ts` |

## Lưu ý vận hành

- Console trình duyệt bị cắt sau 45 giây (CDP `Runtime.evaluate`). Việc chạy lâu phải chạy nền (`;(async()=>{...})()` ghi kết quả vào `window.__x`) rồi đọc lại.
- API `/api/analytics/query` giới hạn 60 lần mỗi phút mỗi người và cache theo nội dung SQL: `oracle.js` tự thêm chú thích duy nhất ở CUỐI câu lệnh (câu lệnh phải bắt đầu bằng SELECT hoặc WITH).
- Pool gohub_dw chỉ có 3 kết nối: chạy truy vấn đối chứng tuần tự, đừng bắn song song nhiều truy vấn nặng.
- Staging và production dùng chung Supabase và Turso. Mọi thao tác ghi trong QA tuân theo mục 6 của plan (sao lưu, mã `QA_`, khôi phục).

## Độ chính xác của bộ kiểm kê (kiểm chứng thử trên All-Time, 2026-10-18)

So kiểm kê tĩnh (`inventory/all-time.md`) với quét DOM thật (`web/scripts/qa/dom-scan.js`, mở panel Filters):

| Mục | Tĩnh | DOM thật | Kết luận |
|---|---|---|---|
| Nút | 11 | 15 (có 4 preset ngày) | Tĩnh đếm nút tạo bằng `.map()` một lần. Con số tĩnh là **cận dưới** |
| Hộp tích | 1 (`val`) | 2 (Phí ship, Đơn nội bộ, đều tích sẵn) | Cùng nguyên nhân (`.map`) |
| Danh sách chọn | 4 | 2 hiện ra (nhóm, kênh) | Ô "tầng khách" chỉ hiện khi chọn B2B → điều khiển có điều kiện, tĩnh không biết |
| Panel Filters | không biết | đóng mặc định, mở bằng nút Filters | Phải mở các panel ẩn trước khi quét |

→ Quy trình G1: dùng kiểm kê tĩnh làm danh sách gốc (biết cả tham số và route), rồi quét DOM thật ở từng trạng thái (panel mở, từng nhóm kênh, từng tab con) để bổ sung điều khiển có điều kiện và điều khiển sinh bằng vòng lặp.

## Mẹo vận hành đã kiểm chứng (G1)

- Sau khi dán `oracle.js` một lần, lưu vào `localStorage` (`localStorage.setItem("qaSrc", "(" + fn.toString() + ")()")`), các lần sau chỉ cần `(0, eval)(localStorage.getItem("qaSrc"))` sau mỗi lần điều hướng (cùng origin). `eval` từ `javascript_tool` không bị CSP chặn.
- Công cụ trả kết quả chặn chuỗi chứa "?" và "&" của URL: khi cần in tham số request, đổi sang dạng `path ⟨khoá:giá trị · khoá:giá trị⟩`.
- Khớp kênh phải theo cặp `(kênh, nhóm)`: có hai kênh cùng tên "Misc." ở B2B và B2C.
- Oracle theo vendor (`rev_by_vendor`) cần thêm bộ lọc khách loại trừ nếu muốn khớp API.
