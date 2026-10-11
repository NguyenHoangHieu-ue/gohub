# Eval trí nhớ — memory-cache-base

Giám khảo: gemini-pro-latest · 56 câu · persona tổng hợp · user eval-p0

**Đúng: 100%** · bịa: 20% · lỗi chạy: 0

| Nhóm | Số câu | Đúng | Bịa |
|---|---|---|---|
| single_fact | 5 | 100% | 20% |
| preference | 4 | 100% | 0% |
| update_current | 5 | 100% | 40% |
| history | 5 | 100% | 20% |
| multi_hop | 5 | 100% | 0% |
| abstention | 4 | 100% | 25% |
| conversation_recall | 4 | 100% | 50% |
| stress_current | 5 | 100% | 0% |
| stress_history | 5 | 100% | 80% |
| stress_market | 5 | 100% | 0% |
| stress_count | 3 | 100% | 0% |
| stress_multi | 3 | 100% | 0% |
| stress_reverse | 3 | 100% | 0% |

Mỗi câu: thời gian TB 7.4s · token vào/ra TB 48497/133 · gọi tool: 12/56 câu · token vào từ cache TB 23200 (48%)

Trí nhớ sau khi nạp: 320 mục (0 đã lưu trữ), 2 tóm tắt hội thoại, khối prompt 8764 ký tự

| # | Nhóm | Đúng | Bịa | Ghi chú giám khảo |
|---|---|---|---|---|
| 1 | single_fact | 1 | 0 | Trợ lý trả lời đúng đầu mối thanh toán là chị Hà và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 2 | single_fact | 1 | 0 | Trợ lý trả lời đúng người liên hệ chính là anh Quang, thông tin bổ sung về chị Hà cũng có trong bảng sự thật. |
| 3 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời gian và ngày bắt đầu. Việc thêm năm 2026 và thông tin thừa về mục tiêu sản lượng có trong bảng sự thật nên không bị tính là bịa. |
| 4 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời gian nghỉ phép. Việc thêm năm 2026 không bị tính là bịa theo quy tắc, và thông tin bạn Phúc thay thế có trong bảng sự thật. |
| 5 | single_fact | 1 | 1 | Trợ lý trả lời đúng chức danh nhưng bịa ra danh sách khách hàng do người dùng phụ trách (các khách hàng như Koala Tours, Garnet Journeys... do người khác phụ trách, người dùng hiện chỉ phụ trách Beta  |
| 6 | preference | 1 | 0 | Trợ lý trả lời đúng các yêu cầu trình bày dữ liệu của người dùng và có bổ sung thêm yêu cầu về cột CM1% có trong bảng sự thật. |
| 7 | preference | 1 | 0 | Trợ lý trả lời đúng thời gian nhận báo cáo là sáng thứ Hai hằng tuần, khớp với đáp án tham chiếu và bảng sự thật. |
| 8 | preference | 1 | 0 | Trợ lý trả lời đúng cột CM1% và các thông tin bổ sung đều có trong bảng sự thật. |
| 9 | preference | 1 | 0 | Trợ lý trả lời đúng khung giờ không nên đặt lịch nhắc là chiều thứ Sáu do có lịch họp với anh Tuấn, khớp với đáp án tham chiếu và bảng sự thật. |
| 10 | update_current | 1 | 1 | Trợ lý trả lời đúng thị trường hiện tại là Châu Âu và không còn Hàn Quốc. Tuy nhiên, trợ lý bịa đặt thông tin người dùng phụ trách các khách hàng như Cedar Tours, Harbor Journeys, Amber Tours... (tron |
| 11 | update_current | 1 | 1 | Trợ lý trả lời đúng tên sếp hiện tại là anh Tuấn, nhưng bịa ra ngày cụ thể 09/10/2026 không có trong bảng sự thật. |
| 12 | update_current | 1 | 0 | Trợ lý trả lời đúng người phụ trách hiện tại là bạn Phúc và thời gian bàn giao từ 1/9, khớp với đáp án tham chiếu và bảng sự thật. |
| 13 | update_current | 1 | 0 | Trợ lý trả lời đúng số ngày gói Unlimited mà chị Elena quan tâm hiện tại là 7 ngày (đổi từ 10 ngày), khớp với đáp án tham chiếu và bảng sự thật. |
| 14 | update_current | 1 | 0 | Trợ lý trả lời đúng mục tiêu hiện tại là 500 SIM/tháng và có nhắc đến mục tiêu thử nghiệm 200 SIM/tháng, khớp với đáp án tham chiếu và bảng sự thật. |
| 15 | history | 1 | 0 | Trợ lý trả lời đúng thị trường Hàn Quốc và các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 16 | history | 1 | 1 | Trợ lý trả lời đúng tên sếp cũ là chị Lan, nhưng bịa thêm ngày tháng '09/10/2026' không có trong bảng sự thật. |
| 17 | history | 1 | 0 | Trợ lý trả lời đúng số ngày ban đầu là 10 ngày và cung cấp thêm thông tin cập nhật chính xác từ bảng sự thật. |
| 18 | history | 1 | 0 | Trợ lý trả lời đúng mục tiêu 200 SIM/tháng và các thông tin bổ sung đều có trong bảng sự thật. |
| 19 | history | 1 | 0 | Trợ lý trả lời đúng mảng B2C theo thông tin trong bảng sự thật. |
| 20 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên khách hàng và các đầu mối liên hệ, thanh toán theo bảng sự thật. |
| 21 | multi_hop | 1 | 0 | Trợ lý trả lời đúng người xử lý thay là Phúc, khách Châu Âu là Gamma Holidays và đầu mối là chị Elena. Các thông tin bổ sung đều có trong bảng sự thật. |
| 22 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ các thông tin về khách hàng, số ngày của gói Unlimited và mục tiêu SIM quý 4 theo bảng sự thật. |
| 23 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên sếp là anh Tuấn và thời gian họp là chiều thứ Sáu theo bảng sự thật. |
| 24 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên khách hàng và mục tiêu quý 4, các thông tin bổ sung đều có trong bảng sự thật. |
| 25 | abstention | 1 | 0 | Trợ lý trả lời đúng là không có thông tin số điện thoại của anh Quang và không bịa số. Các thông tin bổ sung đều có trong bảng sự thật (việc thêm năm 2026 không bị tính là bịa). |
| 26 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về ngày sinh nhật, không bịa đặt. |
| 27 | abstention | 1 | 1 | Trợ lý trả lời đúng là chưa có thông tin về giá bán, nhưng bịa ra đường link tham khảo và tên cuộc trao đổi không có trong bảng sự thật. |
| 28 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về trường đại học của người dùng, không bịa đặt thông tin. |
| 29 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng phương án và điều kiện đi kèm, không có thông tin bịa đặt. |
| 30 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng các phương án khác được cân nhắc, nhưng bịa ra thông tin về ngày tháng và đường link chi tiết cuộc thảo luận không có trong bảng sự thật. |
| 31 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng và đủ các ý theo đáp án tham chiếu. Việc thêm năm 2026 và thông tin thừa về gói Unlimited 7 ngày không bị tính là bịa theo quy tắc. |
| 32 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng ý chính là cần logo từ phía Gamma, nhưng đã bịa thêm các chi tiết về định dạng file, quy chuẩn nhận diện thương hiệu và đường link cuộc hội thoại không có trong bảng sự thật. |
| 100 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối hiện tại là chị Giang và mục tiêu là 300 SIM/tháng, các thông tin bổ sung đều có trong bảng sự thật. |
| 101 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu của Alfa Holidays theo bảng sự thật. |
| 102 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu, thông tin bổ sung về thị trường Ý có trong bảng sự thật. |
| 103 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu của khách Yarrow Journeys theo bảng sự thật. |
| 104 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu của khách Alfa Travel theo bảng sự thật. |
| 105 | stress_history | 1 | 1 | Trợ lý trả lời đúng thông tin đầu mối và mục tiêu ban đầu, nhưng bịa ra ngày 09/10/2026 không có trong bảng sự thật. |
| 106 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 107 | stress_history | 1 | 1 | Trả lời đúng thông tin đầu mối và mục tiêu ban đầu, nhưng tự bịa thêm ngày 09/10/2026 không có trong bảng sự thật. |
| 108 | stress_history | 1 | 1 | Trợ lý trả lời đúng đầu mối và mục tiêu cũ, nhưng tự bịa ra ngày cập nhật 09/10/2026 không có trong bảng sự thật. |
| 109 | stress_history | 1 | 1 | Trợ lý trả lời đúng thông tin nhưng bịa thêm ngày 09/10/2026 không có trong bảng sự thật. |
| 110 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Pháp và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 111 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Úc và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 112 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường Thái Lan và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 113 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường Pháp và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 114 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Singapore và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 115 | stress_count | 1 | 0 | Trợ lý trả lời đúng số lượng và danh sách 11 khách hàng thuộc thị trường Mỹ, các thông tin bổ sung về mục tiêu hàng tháng cũng hoàn toàn chính xác theo bảng sự thật. |
| 116 | stress_count | 1 | 0 | Trợ lý trả lời đúng số lượng 22 khách và liệt kê chính xác danh sách các khách hàng thuộc thị trường Nhật Bản, các thông tin bổ sung về mục tiêu hàng tháng cũng hoàn toàn chính xác theo bảng sự thật. |
| 117 | stress_count | 1 | 0 | Trợ lý trả lời đúng số lượng 13 khách hàng thuộc thị trường Pháp và liệt kê chính xác danh sách cùng với mục tiêu sản lượng hiện tại dựa trên bảng sự thật. |
| 118 | stress_multi | 1 | 0 | Trợ lý trả lời đúng đầu mối hiện tại của cả hai khách hàng theo bảng sự thật. |
| 119 | stress_multi | 1 | 0 | Trợ lý trả lời đúng đầu mối của cả hai khách hàng theo bảng sự thật. |
| 120 | stress_multi | 1 | 0 | Trợ lý trả lời đúng đầu mối hiện tại của cả hai khách hàng theo đáp án tham chiếu và bảng sự thật. |
| 121 | stress_reverse | 1 | 0 | Trợ lý trả lời đúng 2 khách hàng theo yêu cầu và các thông tin bổ sung đều chính xác dựa trên bảng sự thật. |
| 122 | stress_reverse | 1 | 0 | Trợ lý trả lời đúng 2 khách hàng theo đáp án tham chiếu và các thông tin bổ sung đều chính xác dựa trên bảng sự thật. |
| 123 | stress_reverse | 1 | 0 | Trợ lý trả lời đúng tên khách hàng là Bravo Holidays và các thông tin bổ sung trong phần ghi chú đều chính xác theo bảng sự thật. |