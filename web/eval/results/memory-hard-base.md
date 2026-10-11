# Eval trí nhớ — memory-hard-base

Giám khảo: gemini-pro-latest · 56 câu · persona tổng hợp · user eval-p0

**Đúng: 100%** · bịa: 9% · lỗi chạy: 0

| Nhóm | Số câu | Đúng | Bịa |
|---|---|---|---|
| single_fact | 5 | 100% | 20% |
| preference | 4 | 100% | 0% |
| update_current | 5 | 100% | 20% |
| history | 5 | 100% | 0% |
| multi_hop | 5 | 100% | 0% |
| abstention | 4 | 100% | 0% |
| conversation_recall | 4 | 100% | 50% |
| stress_current | 5 | 100% | 0% |
| stress_history | 5 | 100% | 0% |
| stress_market | 5 | 100% | 0% |
| stress_count | 3 | 100% | 0% |
| stress_multi | 3 | 100% | 33% |
| stress_reverse | 3 | 100% | 0% |

Mỗi câu: thời gian TB 8.6s · token vào/ra TB 56597/138 · gọi tool: 26/56 câu

Trí nhớ sau khi nạp: 320 mục (0 đã lưu trữ), 2 tóm tắt hội thoại, khối prompt 8764 ký tự

| # | Nhóm | Đúng | Bịa | Ghi chú giám khảo |
|---|---|---|---|---|
| 1 | single_fact | 1 | 0 | Trợ lý trả lời đúng đầu mối thanh toán là chị Hà. Các thông tin bổ sung đều có trong bảng sự thật. |
| 2 | single_fact | 1 | 0 | Trợ lý trả lời đúng người liên hệ chính là anh Quang. Các thông tin bổ sung đều có trong bảng sự thật. |
| 3 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời gian thử nghiệm và ngày bắt đầu. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 4 | single_fact | 1 | 1 | Trợ lý trả lời đúng khoảng thời gian nghỉ phép nhưng tự ý thêm thông tin 'đợt nghỉ vừa kết thúc hôm qua' không có trong bảng sự thật. |
| 5 | single_fact | 1 | 0 | Trợ lý trả lời đúng chức danh Account Manager nhóm B2B và cung cấp thêm các thông tin chi tiết chính xác dựa trên bảng sự thật. |
| 6 | preference | 1 | 0 | Trợ lý trả lời đúng các yêu cầu trình bày dữ liệu của người dùng, bao gồm cả việc thêm cột CM1% có trong bảng sự thật. |
| 7 | preference | 1 | 0 | Trợ lý trả lời đúng thời gian nhận báo cáo là sáng thứ Hai hằng tuần, khớp với đáp án tham chiếu và bảng sự thật. |
| 8 | preference | 1 | 0 | Trợ lý trả lời đúng cột CM1% theo yêu cầu của người dùng và không bịa đặt thông tin. |
| 9 | preference | 1 | 0 | Trợ lý trả lời đúng khung giờ chiều thứ Sáu và lý do họp với anh Tuấn, khớp với đáp án tham chiếu và bảng sự thật. |
| 10 | update_current | 1 | 1 | Trợ lý trả lời đúng thị trường hiện tại nhưng tự ý gán các khách hàng tuyến Âu khác (Cedar Tours, Harbor Journeys, Coral Tours, Yarrow Travel) cho người dùng, trong khi bảng sự thật cho thấy các khách |
| 11 | update_current | 1 | 0 | Trợ lý trả lời đúng tên sếp trực tiếp hiện tại là anh Tuấn và thông tin chị Lan chuyển sang mảng B2C hoàn toàn khớp với bảng sự thật. |
| 12 | update_current | 1 | 0 | Trợ lý trả lời đúng người phụ trách hiện tại là bạn Phúc từ 1/9. Các thông tin bổ sung đều có trong bảng sự thật. |
| 13 | update_current | 1 | 0 | Trợ lý trả lời đúng số ngày của gói Unlimited mà chị Elena quan tâm và không bịa thông tin. |
| 14 | update_current | 1 | 0 | Trợ lý trả lời đúng mục tiêu 500 SIM/tháng cho quý 4 và có nhắc đến 200 SIM/tháng của giai đoạn thử nghiệm, khớp với đáp án tham chiếu và bảng sự thật. |
| 15 | history | 1 | 0 | Trợ lý trả lời đúng thị trường Hàn Quốc trước tháng 9. Việc thêm năm 2026 không bị tính là bịa theo quy tắc, các thông tin bổ sung khác đều có trong bảng sự thật. |
| 16 | history | 1 | 0 | Trợ lý trả lời đúng tên sếp cũ là chị Lan và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 17 | history | 1 | 0 | Trợ lý trả lời đúng số ngày ban đầu là 10 ngày và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 18 | history | 1 | 0 | Trợ lý trả lời đúng mục tiêu 200 SIM/tháng và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 19 | history | 1 | 0 | Trợ lý trả lời đúng mảng B2C và các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 20 | multi_hop | 1 | 0 | Trợ lý trả lời đúng khách hàng là Alpha Travel, đầu mối liên hệ là anh Quang và đầu mối thanh toán là chị Hà, các thông tin bổ sung đều có trong bảng sự thật. |
| 21 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ các thông tin về người xử lý thay, tên khách hàng Châu Âu và đầu mối liên hệ theo bảng sự thật. |
| 22 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ các thông tin theo đáp án tham chiếu, các thông tin bổ sung đều có trong bảng sự thật. |
| 23 | multi_hop | 1 | 0 | Trợ lý trả lời đúng thời gian họp và tên sếp hiện tại, các thông tin bổ sung đều có trong bảng sự thật. |
| 24 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên khách hàng là Beta Tours và mục tiêu quý 4 là giữ không giảm, các thông tin giải thích thêm đều chính xác theo bảng sự thật. |
| 25 | abstention | 1 | 0 | Trợ lý trả lời đúng là không có thông tin số điện thoại và không bịa số, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 26 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về ngày sinh nhật, không bịa đặt. |
| 27 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về giá bán và các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 28 | abstention | 1 | 0 | Trợ lý đã trả lời đúng là chưa có thông tin về trường đại học và không bịa đặt thông tin. |
| 29 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng phương án và điều kiện đi kèm, các thông tin bổ sung đều có trong bảng sự thật. |
| 30 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng các phương án được cân nhắc nhưng bịa thêm lý do chọn phương án B và đường link chi tiết cuộc trao đổi ngày 09/10/2026 không có trong bảng sự thật. |
| 31 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng và đủ thông tin về yêu cầu hỗ trợ eSIM đồng thương hiệu và thời hạn gửi mẫu thiết kế. |
| 32 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng ý chính là logo của Gamma, nhưng bịa thêm các chi tiết kỹ thuật (file vector, png), brand guidelines và link website không có trong bảng sự thật. |
| 100 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối hiện tại là chị Giang và mục tiêu là 300 SIM/tháng. Các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 101 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu của khách Alfa Holidays dựa trên bảng sự thật. |
| 102 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu SIM, thông tin thị trường Ý có trong bảng sự thật. |
| 103 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu của khách Yarrow Journeys dựa trên thông tin trong bảng sự thật. |
| 104 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu của Alfa Travel theo bảng sự thật, đồng thời phân biệt rõ với Alpha Travel. |
| 105 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu, đồng thời cung cấp thêm thông tin hiện tại chính xác theo bảng sự thật. |
| 106 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu, thông tin bổ sung cũng chính xác theo bảng sự thật. |
| 107 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu của khách Birch Holidays, đồng thời cung cấp thêm thông tin hiện tại chính xác theo bảng sự thật. |
| 108 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu của khách Alfa Tours, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 109 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu của khách Mango Travel, thông tin bổ sung cũng chính xác theo bảng sự thật. |
| 110 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Pháp và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 111 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường Úc và cung cấp thông tin bổ sung chính xác từ bảng sự thật. |
| 112 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường của khách Alfa Tours và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 113 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường Pháp và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 114 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường của khách Mango Travel và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 115 | stress_count | 1 | 0 | Trợ lý đã liệt kê đúng 11 khách hàng thuộc thị trường Mỹ và chốt lại số lượng là 11 (dù có nhầm lẫn ghi 9 ở đầu nhưng đã đính chính). Các thông tin về mục tiêu SIM đều chính xác theo bảng sự thật. |
| 116 | stress_count | 1 | 0 | Trợ lý trả lời đúng số lượng 22 khách và liệt kê chính xác danh sách các khách hàng thuộc thị trường Nhật Bản, thông tin bổ sung về mục tiêu SIM cũng chính xác theo bảng sự thật. |
| 117 | stress_count | 1 | 0 | Trợ lý trả lời đúng số lượng và danh sách 13 khách hàng thuộc thị trường Pháp, các thông tin bổ sung về mục tiêu SIM cũng chính xác theo bảng sự thật. |
| 118 | stress_multi | 1 | 1 | Trợ lý trả lời đúng đầu mối hiện tại nhưng bịa ra thông tin ngày 09/10 không có trong bảng sự thật. |
| 119 | stress_multi | 1 | 0 | Trợ lý trả lời đúng đầu mối hiện tại của cả hai khách hàng theo bảng sự thật. |
| 120 | stress_multi | 1 | 0 | Trợ lý trả lời đúng đầu mối hiện tại của cả hai khách hàng theo bảng sự thật. |
| 121 | stress_reverse | 1 | 0 | Trợ lý trả lời đúng 2 khách hàng thuộc thị trường Hàn Quốc có đầu mối hiện tại là anh Bảo, thông tin hoàn toàn khớp với bảng sự thật. |
| 122 | stress_reverse | 1 | 0 | Trợ lý trả lời đúng 2 khách hàng là Indigo Holidays và Raven Trips, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 123 | stress_reverse | 1 | 0 | Trợ lý trả lời đúng tên khách hàng theo đáp án tham chiếu và các thông tin bổ sung đều chính xác theo bảng sự thật. |