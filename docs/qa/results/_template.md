# Kết quả QA: <Tên tab>

- Ngày QA: <YYYY-MM-DD> · Môi trường: staging · Người thực hiện: Claude · Commit đang chạy: <hash>
- Kiểm kê gốc: `../inventory/<tab>.md` · `../queries/<tab>.md`
- Kỳ thử dùng: <mã kỳ trong periods.md>
- Tóm tắt: ĐẠT <n> · LỖI <n> · NGHI <n> · N/A <n> · CHƯA <n>

## A. Tải trang và trạng thái

| ID | Kiểm tra | Cách làm | Mong đợi | Thấy | Trạng thái | Mức độ | Bằng chứng |
|---|---|---|---|---|---|---|---|
| <tab>-A01 | Skeleton khi tải | | | | | | |
| <tab>-A02 | Trạng thái rỗng (EMPTY-PAST) | | | | | | |
| <tab>-A03 | Banner lỗi khi API 500 | | | | | | |
| <tab>-A04 | Quyền xem theo vai trò | | | | | | |

## B. Điều khiển (nút, ô nhập, chọn)

| ID kiểm kê | Điều khiển | Thao tác | Tham số gửi lên (Network) | Hiệu ứng mong đợi | Thấy | Trạng thái | Mức độ |
|---|---|---|---|---|---|---|---|

## C. Con số (đối chiếu với oracle)

| ID | Phần / bảng / cột | Kỳ · biến thể | Nguồn đối chiếu (truy vấn oracle) | Mong đợi | Thấy | Lệch | Trạng thái | Mức độ |
|---|---|---|---|---|---|---|---|---|

## D. Công thức dẫn xuất

| ID | Chỉ số | Công thức | Tính tay | Thấy | Trạng thái | Mức độ |
|---|---|---|---|---|---|---|

## E. Nhất quán trong tab (thẻ, bảng, biểu đồ, dòng cha và con, xuất file)

| ID | So sánh | Số A | Số B | Lệch | Trạng thái | Mức độ |
|---|---|---|---|---|---|---|

## F. Xuất file

| ID | Nút xuất | Nội dung mong đợi | Thấy | Trạng thái | Mức độ |
|---|---|---|---|---|---|

## G. Trường hợp biên

| ID | Trường hợp | Mong đợi | Thấy | Trạng thái | Mức độ |
|---|---|---|---|---|---|

## H. Hiệu năng và cache

| ID | Kiểm tra | Lần đầu (ms) | Lần sau (ms) | `nocache=1` | Ghi chú |
|---|---|---|---|---|---|

## I. Hiển thị

| ID | Mục | Nhận xét | Mức độ |
|---|---|---|---|

## Phát hiện

| # | Mức độ | Mô tả | Bằng chứng | Nguyên nhân gốc (nếu biết) | Đề xuất |
|---|---|---|---|---|---|
