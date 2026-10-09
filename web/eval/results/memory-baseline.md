# Eval trí nhớ — memory-baseline

Giám khảo: gemini-pro-latest · 32 câu · persona tổng hợp · user eval-p0

**Đúng: 97%** · bịa: 16% · lỗi chạy: 0

| Nhóm | Số câu | Đúng | Bịa |
|---|---|---|---|
| single_fact | 5 | 100% | 0% |
| preference | 4 | 100% | 25% |
| update_current | 5 | 100% | 0% |
| history | 5 | 80% | 20% |
| multi_hop | 5 | 100% | 0% |
| abstention | 4 | 100% | 25% |
| conversation_recall | 4 | 100% | 50% |

Mỗi câu: thời gian TB 7.5s · token vào/ra TB 31921/118 · gọi tool: 4/32 câu

Trí nhớ sau khi nạp: 12 mục (0 đã lưu trữ), 2 tóm tắt hội thoại, khối prompt 2062 ký tự

| # | Nhóm | Đúng | Bịa | Ghi chú giám khảo |
|---|---|---|---|---|
| 1 | single_fact | 1 | 0 | Trợ lý trả lời đúng đầu mối thanh toán là chị Hà và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 2 | single_fact | 1 | 0 | Trợ lý trả lời đúng người liên hệ chính là anh Quang. Các thông tin bổ sung về chị Hà và việc bàn giao cho Phúc đều chính xác theo bảng sự thật. |
| 3 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời gian thử nghiệm và ngày bắt đầu. Các thông tin bổ sung đều có trong bảng sự thật hoặc được phép suy luận theo quy tắc. |
| 4 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời gian nghỉ phép và cung cấp thêm thông tin có trong bảng sự thật. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 5 | single_fact | 1 | 0 | Trợ lý trả lời đúng vị trí công việc theo đáp án tham chiếu. Các thông tin bổ sung đều chính xác theo bảng sự thật, việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 6 | preference | 1 | 1 | Trợ lý trả lời đủ các ý chính trong đáp án tham chiếu nhưng tự bịa thêm các quy tắc về làm tròn tiền tệ, tỷ lệ % và việc đề xuất hướng xử lý không có trong bảng sự thật. |
| 7 | preference | 1 | 0 | Trợ lý trả lời đúng thời gian nhận báo cáo là sáng thứ Hai hằng tuần, khớp với đáp án tham chiếu và bảng sự thật. |
| 8 | preference | 1 | 0 | Trợ lý trả lời đúng cột CM1% theo đáp án tham chiếu. Các thông tin bổ sung về văn phong và cách trình bày đều có trong bảng sự thật. |
| 9 | preference | 1 | 0 | Trợ lý trả lời đúng khung giờ chiều thứ Sáu và lý do họp với anh Tuấn, khớp với đáp án tham chiếu. |
| 10 | update_current | 1 | 0 | Trợ lý trả lời đúng thị trường Châu Âu và việc ngừng phụ trách Hàn Quốc từ 1/9, thông tin thêm về khách hàng đều có trong bảng sự thật. |
| 11 | update_current | 1 | 0 | Trợ lý trả lời đúng tên sếp hiện tại là anh Tuấn và thông tin chị Lan chuyển sang mảng B2C hoàn toàn khớp với bảng sự thật. |
| 12 | update_current | 1 | 0 | Trợ lý trả lời đúng người phụ trách hiện tại là bạn Phúc từ 1/9. Các thông tin thêm về đầu mối liên hệ đều có trong bảng sự thật. |
| 13 | update_current | 1 | 0 | Trợ lý trả lời đúng 7 ngày và các thông tin bổ sung đều có trong bảng sự thật. |
| 14 | update_current | 1 | 0 | Trợ lý trả lời đúng mục tiêu 500 SIM/tháng cho Quý 4. Việc thêm năm 2026 không bị tính là bịa theo quy tắc, các thông tin khác đều có trong bảng sự thật. |
| 15 | history | 1 | 0 | Trợ lý trả lời đúng thị trường Hàn Quốc và thông tin bổ sung hoàn toàn khớp với bảng sự thật. |
| 16 | history | 1 | 0 | Trợ lý trả lời đúng tên sếp cũ là chị Lan và thông tin bổ sung có trong bảng sự thật. |
| 17 | history | 0 | 1 | Trợ lý không trả lời được số ngày ban đầu là 10 ngày và khẳng định sai rằng hồ sơ không ghi nhận thông tin này. |
| 18 | history | 1 | 0 | Trợ lý trả lời đúng 200 SIM/tháng. Các thông tin bổ sung đều có trong bảng sự thật, việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 19 | history | 1 | 0 | Trợ lý trả lời đúng mảng B2C và các thông tin bổ sung đều có trong bảng sự thật. |
| 20 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ thông tin về khách hàng Alpha Travel, đầu mối liên hệ và thanh toán theo đáp án tham chiếu và bảng sự thật. |
| 21 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ các ý trong đáp án tham chiếu, thông tin hoàn toàn khớp với bảng sự thật. |
| 22 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ các thông tin theo đáp án tham chiếu. Các thông tin bổ sung đều có trong bảng sự thật, việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 23 | multi_hop | 1 | 0 | Trợ lý trả lời đúng sếp là anh Tuấn và thời gian họp là chiều thứ Sáu, khớp với đáp án tham chiếu và bảng sự thật. |
| 24 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên khách hàng là Beta Tours và mục tiêu quý 4 là giữ không giảm, khớp với đáp án tham chiếu và bảng sự thật. |
| 25 | abstention | 1 | 0 | Trợ lý trả lời chính xác là không có thông tin về số điện thoại của anh Quang và không bịa đặt thông tin nào ngoài bảng sự thật. |
| 26 | abstention | 1 | 0 | Trợ lý trả lời chính xác là chưa có thông tin về ngày sinh nhật, đúng với đáp án tham chiếu và bảng sự thật. |
| 27 | abstention | 1 | 1 | Trợ lý trả lời đúng là chưa có thông tin về giá, nhưng bịa ra một đường link tham chiếu không có trong bảng sự thật. |
| 28 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về trường đại học của người dùng, khớp với đáp án tham chiếu và không bịa đặt thông tin. |
| 29 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng phương án và điều kiện đi kèm theo đáp án tham chiếu. Các thông tin bổ sung đều có trong bảng sự thật. |
| 30 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng các phương án được cân nhắc nhưng bịa ra đường link hội thoại không có trong bảng sự thật. |
| 31 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng và đủ các ý chính về eSIM đồng thương hiệu và hạn gửi trước 30/9, không có thông tin bịa đặt. |
| 32 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng ý chính là logo của Gamma nhưng bịa thêm thông tin về định dạng file (bản gốc/vector) và thời gian hoàn thiện (1 tuần) không có trong bảng sự thật. |