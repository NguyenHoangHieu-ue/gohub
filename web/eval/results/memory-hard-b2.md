# Eval trí nhớ — memory-hard-b2

Giám khảo: gemini-pro-latest · 56 câu · persona tổng hợp · user eval-p0

**Đúng: 98%** · bịa: 18% · lỗi chạy: 0

| Nhóm | Số câu | Đúng | Bịa |
|---|---|---|---|
| single_fact | 5 | 100% | 40% |
| preference | 4 | 100% | 0% |
| update_current | 5 | 100% | 20% |
| history | 5 | 100% | 20% |
| multi_hop | 5 | 100% | 20% |
| abstention | 4 | 100% | 0% |
| conversation_recall | 4 | 75% | 50% |
| stress_current | 5 | 100% | 0% |
| stress_history | 5 | 100% | 60% |
| stress_market | 5 | 100% | 0% |
| stress_count | 3 | 100% | 0% |
| stress_multi | 3 | 100% | 0% |
| stress_reverse | 3 | 100% | 0% |

Mỗi câu: thời gian TB 6.0s · token vào/ra TB 42359/123 · gọi tool: 12/56 câu

Trí nhớ sau khi nạp: 320 mục (0 đã lưu trữ), 2 tóm tắt hội thoại, khối prompt 8764 ký tự

| # | Nhóm | Đúng | Bịa | Ghi chú giám khảo |
|---|---|---|---|---|
| 1 | single_fact | 1 | 0 | Trợ lý trả lời đúng đầu mối thanh toán là chị Hà, thông tin bổ sung về anh Quang cũng có trong bảng sự thật. |
| 2 | single_fact | 1 | 0 | Trợ lý trả lời đúng người liên hệ chính là anh Quang, thông tin bổ sung về chị Hà có trong bảng sự thật. |
| 3 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời gian thử nghiệm và ngày bắt đầu. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 4 | single_fact | 1 | 1 | Trợ lý trả lời đúng thời gian nghỉ phép nhưng tự bịa thêm thông tin 'đợt nghỉ vừa kết thúc vào hôm qua' không có trong bảng sự thật. |
| 5 | single_fact | 1 | 1 | Trợ lý trả lời đúng chức danh nhưng bịa đặt/suy diễn sai rằng người dùng phụ trách các thị trường Mỹ, Nhật Bản, Singapore, Thái Lan... (người dùng chỉ phụ trách Hàn Quốc sau đó chuyển sang Châu Âu, cá |
| 6 | preference | 1 | 0 | Trợ lý trả lời đúng các yêu cầu trình bày dữ liệu của người dùng (ngắn gọn, kết luận trước, dùng bảng, không dùng biểu đồ, thêm cột CM1%) dựa trên bảng sự thật. |
| 7 | preference | 1 | 0 | Trợ lý trả lời đúng thời gian nhận báo cáo và không bịa thông tin. |
| 8 | preference | 1 | 0 | Trợ lý trả lời đúng cột CM1% và các thông tin bổ sung đều có trong bảng sự thật. |
| 9 | preference | 1 | 0 | Trợ lý trả lời đúng khung giờ chiều thứ Sáu và lý do họp với anh Tuấn. |
| 10 | update_current | 1 | 0 | Trợ lý trả lời đúng thị trường Châu Âu và không còn làm Hàn Quốc từ 1/9. Các thông tin mở rộng về khách hàng đều có trong bảng sự thật. |
| 11 | update_current | 1 | 1 | Trả lời đúng tên sếp hiện tại nhưng bịa đặt ngày cập nhật (09/10/2026) không có trong dữ liệu. |
| 12 | update_current | 1 | 0 | Trợ lý trả lời đúng người phụ trách hiện tại là bạn Phúc và thời gian bàn giao. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 13 | update_current | 1 | 0 | Trợ lý trả lời đúng số ngày gói Unlimited mà chị Elena quan tâm (7 ngày, đổi từ 10 ngày) và các thông tin bổ sung đều có trong bảng sự thật. |
| 14 | update_current | 1 | 0 | Trợ lý trả lời đúng mục tiêu hiện tại là 500 SIM/tháng (mục tiêu quý 4) và có nhắc đến 200 SIM/tháng của giai đoạn thử nghiệm, khớp với đáp án tham chiếu và bảng sự thật. |
| 15 | history | 1 | 0 | Trợ lý trả lời đúng thị trường Hàn Quốc và các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 16 | history | 1 | 1 | Trợ lý trả lời đúng là chị Lan nhưng bịa thêm ngày 09/10/2026 không có trong dữ liệu về việc chuyển sếp. |
| 17 | history | 1 | 0 | Trợ lý trả lời đúng số ngày ban đầu là 10 ngày và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 18 | history | 1 | 0 | Trợ lý trả lời đúng mục tiêu 200 SIM/tháng và các thông tin bổ sung đều có trong bảng sự thật. |
| 19 | history | 1 | 0 | Trợ lý trả lời đúng mảng B2C theo thông tin trong bảng sự thật. |
| 20 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên khách hàng và các đầu mối liên hệ, thanh toán theo bảng sự thật. |
| 21 | multi_hop | 1 | 1 | Trợ lý trả lời đúng người xử lý và đầu mối của khách Gamma Holidays, nhưng khẳng định sai (bịa) rằng Beta Tours là khách thị trường Châu Âu (thực tế Beta Tours thuộc thị trường Hàn Quốc). |
| 22 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ 3 thông tin được hỏi dựa trên dữ liệu trong bảng sự thật. |
| 23 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ thông tin về sếp và thời gian họp theo đáp án tham chiếu. |
| 24 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên khách hàng và mục tiêu quý 4, các thông tin giải thích đều có trong bảng sự thật. |
| 25 | abstention | 1 | 0 | Trợ lý trả lời đúng là không có thông tin về số điện thoại và không bịa ra số nào, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 26 | abstention | 1 | 0 | Trợ lý đã trả lời đúng là chưa có thông tin về ngày sinh nhật của người dùng, khớp với đáp án tham chiếu. |
| 27 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về giá bán và các thông tin bổ sung đều chính xác dựa trên bảng sự thật. |
| 28 | abstention | 1 | 0 | Trợ lý đã trả lời đúng là chưa có thông tin về trường đại học của người dùng và không bịa đặt thông tin. |
| 29 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng phương án và điều kiện đi kèm, thông tin bổ sung cũng chính xác theo bảng sự thật. |
| 30 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng các phương án nhưng bịa thêm lý do không chọn và đường link hội thoại không có trong bảng sự thật. |
| 31 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng và đủ các ý chính theo đáp án tham chiếu. Thông tin bổ sung về gói cước có trong bảng sự thật nên không bịa. |
| 32 | conversation_recall | 0 | 1 | Trợ lý bịa đặt ngày tháng, đường link và các chi tiết về định dạng file, quy chuẩn thương hiệu hoàn toàn không có trong bảng sự thật. |
| 100 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu hiện tại, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 101 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu SIM hằng tháng của khách Alfa Holidays theo bảng sự thật. |
| 102 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu của khách Quartz Travel, thông tin thị trường Ý cũng có trong bảng sự thật. |
| 103 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu SIM, thông tin thị trường cũng chính xác theo bảng sự thật. |
| 104 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu SIM của khách Alfa Travel dựa trên bảng sự thật. |
| 105 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 106 | stress_history | 1 | 1 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu, nhưng tự bịa ra mốc thời gian 'ngày 09/10/2026' không có trong bảng sự thật đối với khách Onyx Holidays. |
| 107 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối ban đầu là chị Chi và mục tiêu ban đầu là 800 SIM/tháng. |
| 108 | stress_history | 1 | 1 | Trợ lý trả lời đúng thông tin về đầu mối và mục tiêu, nhưng bịa ra ngày 09/10/2026 không có trong bảng sự thật liên quan đến khách Alfa Tours. |
| 109 | stress_history | 1 | 1 | Trợ lý trả lời đúng thông tin về đầu mối và mục tiêu ban đầu, nhưng bịa ra thông tin 'trước ngày 09/10/2026' không có trong bảng sự thật. |
| 110 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Pháp và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 111 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường Úc và các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 112 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Thái Lan và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 113 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường Pháp và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 114 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Singapore và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 115 | stress_count | 1 | 0 | Trợ lý trả lời đúng số lượng và danh sách 11 khách hàng thuộc thị trường Mỹ, trình bày dưới dạng bảng theo yêu cầu của người dùng. |
| 116 | stress_count | 1 | 0 | Trợ lý trả lời đúng số lượng 22 khách và liệt kê chính xác danh sách các khách hàng thuộc thị trường Nhật Bản cùng với mục tiêu SIM hiện tại. |
| 117 | stress_count | 1 | 0 | Trợ lý trả lời đúng số lượng 13 khách hàng thuộc thị trường Pháp và liệt kê chính xác danh sách cùng mục tiêu SIM/tháng đã được cập nhật từ bảng sự thật. |
| 118 | stress_multi | 1 | 0 | Trợ lý trả lời đúng đầu mối hiện tại của cả hai khách hàng theo bảng sự thật. |
| 119 | stress_multi | 1 | 0 | Trợ lý trả lời đúng đầu mối của cả hai khách hàng theo bảng sự thật. |
| 120 | stress_multi | 1 | 0 | Trợ lý trả lời đúng đầu mối hiện tại của cả hai khách hàng theo bảng sự thật. |
| 121 | stress_reverse | 1 | 0 | Trợ lý trả lời đúng 2 khách hàng theo yêu cầu và các thông tin bổ sung đều chính xác dựa trên bảng sự thật. |
| 122 | stress_reverse | 1 | 0 | Trợ lý trả lời đúng và đủ 2 khách hàng theo yêu cầu, thông tin cung cấp hoàn toàn khớp với bảng sự thật. |
| 123 | stress_reverse | 1 | 0 | Trợ lý trả lời đúng tên khách hàng là Bravo Holidays và không bịa đặt thông tin. |