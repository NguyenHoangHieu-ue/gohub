# Eval trí nhớ — memory-stress150-p1b

Giám khảo: gemini-pro-latest · 47 câu · persona tổng hợp · user eval-p0

**Đúng: 98%** · bịa: 9% · lỗi chạy: 1

| Nhóm | Số câu | Đúng | Bịa |
|---|---|---|---|
| single_fact | 5 | 100% | 20% |
| preference | 4 | 100% | 0% |
| update_current | 5 | 100% | 20% |
| history | 5 | 100% | 0% |
| multi_hop | 5 | 100% | 0% |
| abstention | 4 | 100% | 0% |
| conversation_recall | 4 | 100% | 50% |
| stress_current | 5 | 80% | 0% |
| stress_history | 5 | 100% | 0% |
| stress_market | 5 | 100% | 0% |

Mỗi câu: thời gian TB 6.4s · token vào/ra TB 35517/97 · gọi tool: 16/47 câu

Trí nhớ sau khi nạp: 320 mục (0 đã lưu trữ), 2 tóm tắt hội thoại, khối prompt 8764 ký tự

| # | Nhóm | Đúng | Bịa | Ghi chú giám khảo |
|---|---|---|---|---|
| 1 | single_fact | 1 | 0 | Trợ lý trả lời đúng đầu mối thanh toán là chị Hà, thông tin bổ sung về anh Quang cũng có trong bảng sự thật. |
| 2 | single_fact | 1 | 0 | Trợ lý trả lời đúng tên người liên hệ chính là anh Quang, thông tin thêm về chị Hà có trong bảng sự thật. |
| 3 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời hạn và ngày bắt đầu. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 4 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời gian nghỉ phép và cung cấp thêm thông tin chính xác từ bảng sự thật. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 5 | single_fact | 1 | 1 | Trợ lý trả lời đúng chức danh Account Manager nhóm B2B, nhưng bịa thêm các nhiệm vụ định kỳ như 'Theo dõi tiến độ CM cá nhân, reach-out khách hàng mới/chăm sóc khách cũ' không có trong bảng sự thật. |
| 6 | preference | 1 | 0 | Trợ lý trả lời đúng các yêu cầu trình bày dữ liệu (ngắn gọn, kết luận trước, dùng bảng, không dùng biểu đồ) và bổ sung thêm yêu cầu về cột CM1% có trong bảng sự thật. |
| 7 | preference | 1 | 0 | Trợ lý trả lời đúng thời gian nhận báo cáo là sáng thứ Hai hằng tuần, khớp với đáp án tham chiếu và bảng sự thật. |
| 8 | preference | 1 | 0 | Trợ lý trả lời đúng cột CM1% theo yêu cầu của người dùng. |
| 9 | preference | 1 | 0 | Trợ lý trả lời đúng khung giờ không nên đặt lịch nhắc là chiều thứ Sáu vì có lịch họp với anh Tuấn, khớp với đáp án tham chiếu và bảng sự thật. |
| 10 | update_current | 1 | 1 | Trợ lý trả lời đúng thị trường Châu Âu và không còn Hàn Quốc từ 1/9, nhưng bịa đặt rằng người dùng phụ trách Cedar Tours, Harbor Journeys, Coral Tours, Yarrow Travel (các khách này do người khác phụ t |
| 11 | update_current | 1 | 0 | Trợ lý trả lời đúng tên sếp trực tiếp hiện tại là anh Tuấn và thông tin chị Lan chuyển sang mảng B2C hoàn toàn khớp với bảng sự thật. |
| 12 | update_current | 1 | 0 | Trợ lý trả lời đúng người phụ trách hiện tại là bạn Phúc từ 1/9, khớp với đáp án tham chiếu và bảng sự thật. |
| 13 | update_current | 1 | 0 | Trợ lý trả lời đúng số ngày gói Unlimited mà chị Elena quan tâm hiện tại là 7 ngày (đổi từ 10 ngày) dựa trên bảng sự thật. |
| 14 | update_current | 1 | 0 | Trợ lý trả lời đúng mục tiêu 500 SIM/tháng. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 15 | history | 1 | 0 | Trợ lý trả lời đúng thị trường Hàn Quốc và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 16 | history | 1 | 0 | Trợ lý trả lời đúng tên sếp cũ là chị Lan và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 17 | history | 1 | 0 | Trợ lý trả lời đúng số ngày ban đầu là 10 ngày và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 18 | history | 1 | 0 | Trợ lý trả lời đúng mục tiêu 200 SIM/tháng và các thông tin bổ sung đều có trong bảng sự thật. |
| 19 | history | 1 | 0 | Trợ lý trả lời đúng mảng B2C và các thông tin bổ sung đều có trong bảng sự thật. |
| 20 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên khách hàng và các đầu mối liên hệ, thanh toán theo bảng sự thật. |
| 21 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ các thông tin theo đáp án tham chiếu, các thông tin bổ sung đều có trong bảng sự thật. |
| 22 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ các thông tin được hỏi, không có thông tin bịa đặt. |
| 23 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên sếp là anh Tuấn và thời gian họp là chiều thứ Sáu, khớp với bảng sự thật. |
| 24 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên khách hàng là Beta Tours và mục tiêu quý 4 là giữ không giảm, thông tin hoàn toàn khớp với bảng sự thật. |
| 25 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin số điện thoại và không bịa số. Việc thêm năm 2026 vào ngày 1/9 không bị tính là bịa theo quy tắc. |
| 26 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về ngày sinh nhật. |
| 27 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về giá bán và các thông tin bổ sung đều có trong bảng sự thật. |
| 28 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về trường đại học của người dùng, không bịa đặt thông tin. |
| 29 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng phương án và điều kiện đi kèm, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 30 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng các phương án được cân nhắc nhưng đã bịa ra một đường link không có trong bảng sự thật. |
| 31 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng và đủ các ý theo đáp án tham chiếu. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 32 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng ý chính là cần logo của Gamma, nhưng đã bịa thêm nhiều chi tiết không có trong bảng sự thật như định dạng file, brand guidelines, link website và một đường link giả. |
| 100 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu hiện tại, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 101 | stress_current | 0 | 0 | Lỗi khi chạy: fetch failed |
| 102 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu, thông tin thị trường Ý có trong bảng sự thật. |
| 103 | stress_current | 1 | 0 | Trợ lý trả lời chính xác đầu mối và mục tiêu SIM của khách Yarrow Journeys dựa trên bảng sự thật. |
| 104 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu của khách Alfa Travel dựa trên bảng sự thật. |
| 105 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 106 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu của khách Onyx Holidays, đồng thời cung cấp thêm thông tin hiện tại chính xác theo bảng sự thật. |
| 107 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối ban đầu và mục tiêu ban đầu của khách Birch Holidays, các thông tin bổ sung cũng chính xác theo bảng sự thật. |
| 108 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu trước khi đổi của khách Alfa Tours theo đáp án tham chiếu. |
| 109 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu của khách Mango Travel, thông tin bổ sung cũng chính xác theo bảng sự thật. |
| 110 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Pháp và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 111 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Úc và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 112 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường của Alfa Tours là Thái Lan và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 113 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Pháp và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 114 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Singapore và cung cấp thêm thông tin chính xác từ bảng sự thật. |