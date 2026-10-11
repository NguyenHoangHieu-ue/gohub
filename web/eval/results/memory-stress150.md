# Eval trí nhớ — memory-stress150

Giám khảo: gemini-pro-latest · 47 câu · persona tổng hợp · user eval-p0

**Đúng: 100%** · bịa: 2% · lỗi chạy: 0

| Nhóm | Số câu | Đúng | Bịa |
|---|---|---|---|
| single_fact | 5 | 100% | 0% |
| preference | 4 | 100% | 0% |
| update_current | 5 | 100% | 0% |
| history | 5 | 100% | 0% |
| multi_hop | 5 | 100% | 0% |
| abstention | 4 | 100% | 0% |
| conversation_recall | 4 | 100% | 25% |
| stress_current | 5 | 100% | 0% |
| stress_history | 5 | 100% | 0% |
| stress_market | 5 | 100% | 0% |

Mỗi câu: thời gian TB 6.8s · token vào/ra TB 37109/97 · gọi tool: 20/47 câu

Trí nhớ sau khi nạp: 629 mục (0 đã lưu trữ), 2 tóm tắt hội thoại, khối prompt 8790 ký tự

| # | Nhóm | Đúng | Bịa | Ghi chú giám khảo |
|---|---|---|---|---|
| 1 | single_fact | 1 | 0 | Trợ lý trả lời đúng đầu mối thanh toán là chị Hà, thông tin hoàn toàn khớp với bảng sự thật. |
| 2 | single_fact | 1 | 0 | Trợ lý trả lời đúng người liên hệ chính là anh Quang, thông tin bổ sung về chị Hà cũng có trong bảng sự thật. |
| 3 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời gian thử nghiệm và ngày bắt đầu. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 4 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời gian nghỉ phép. Việc thêm năm 2026 không bị tính là bịa theo quy tắc, và thông tin bàn giao cho Phúc có trong bảng sự thật. |
| 5 | single_fact | 1 | 0 | Trợ lý trả lời đúng chức danh công việc và cung cấp thêm các thông tin chính xác từ bảng sự thật. |
| 6 | preference | 1 | 0 | Trợ lý trả lời đầy đủ các ý trong đáp án tham chiếu và bổ sung thêm yêu cầu về cột CM1% có trong bảng sự thật. |
| 7 | preference | 1 | 0 | Trợ lý trả lời đúng thời gian nhận báo cáo là sáng thứ Hai hằng tuần theo thông tin trong bảng sự thật. |
| 8 | preference | 1 | 0 | Trợ lý trả lời đúng cột CM1% và cung cấp thêm thông tin về thói quen trình bày có trong bảng sự thật. |
| 9 | preference | 1 | 0 | Trợ lý trả lời đúng khung giờ là chiều thứ Sáu và nêu đúng lý do là họp với anh Tuấn. |
| 10 | update_current | 1 | 0 | Trợ lý trả lời đúng thị trường hiện tại là Châu Âu và không còn làm Hàn Quốc, các thông tin bổ sung về khách hàng đều chính xác theo bảng sự thật. |
| 11 | update_current | 1 | 0 | Trợ lý trả lời đúng tên sếp trực tiếp hiện tại là anh Tuấn và giải thích đúng lý do theo bảng sự thật. |
| 12 | update_current | 1 | 0 | Trợ lý trả lời đúng người phụ trách hiện tại là bạn Phúc và thời gian bàn giao từ 1/9, khớp với đáp án tham chiếu và bảng sự thật. |
| 13 | update_current | 1 | 0 | Trợ lý trả lời đúng số ngày gói Unlimited mà chị Elena quan tâm hiện tại là 7 ngày (đổi từ 10 ngày), khớp với đáp án tham chiếu và bảng sự thật. |
| 14 | update_current | 1 | 0 | Trợ lý trả lời đúng mục tiêu hiện tại là 500 SIM/tháng cho Q4 và có nhắc đến mục tiêu cũ là 200 SIM/tháng, hoàn toàn khớp với đáp án tham chiếu và bảng sự thật. |
| 15 | history | 1 | 0 | Trợ lý trả lời đúng thị trường Hàn Quốc và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 16 | history | 1 | 0 | Trợ lý trả lời đúng sếp trực tiếp trước anh Tuấn là chị Lan, thông tin thêm cũng có trong bảng sự thật. |
| 17 | history | 1 | 0 | Trợ lý trả lời đúng số ngày ban đầu là 10 ngày và cung cấp thêm thông tin cập nhật chính xác từ bảng sự thật. |
| 18 | history | 1 | 0 | Trợ lý trả lời đúng mục tiêu 200 SIM/tháng và cung cấp thêm thông tin có trong bảng sự thật. |
| 19 | history | 1 | 0 | Trợ lý trả lời đúng mảng B2C và các thông tin bổ sung đều có trong bảng sự thật. |
| 20 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên khách hàng và các đầu mối liên hệ, thanh toán theo bảng sự thật. Không có thông tin bịa đặt. |
| 21 | multi_hop | 1 | 0 | Trợ lý trả lời đúng người xử lý là Phúc, khách Châu Âu là Gamma Holidays và đầu mối là chị Elena. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 22 | multi_hop | 1 | 0 | Trợ lý trả lời chính xác tên khách hàng, số ngày của gói Unlimited hiện tại và mục tiêu SIM hằng tháng quý 4 theo đúng bảng sự thật. |
| 23 | multi_hop | 1 | 0 | Trợ lý trả lời đúng thời gian họp và tên sếp dựa trên thông tin trong bảng sự thật. |
| 24 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên khách hàng là Beta Tours và mục tiêu quý 4 là giữ không giảm, hoàn toàn khớp với bảng sự thật và đáp án tham chiếu. |
| 25 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin số điện thoại và không bịa số. Các thông tin bổ sung về anh Quang, chị Hà và bạn Phúc đều chính xác theo bảng sự thật. |
| 26 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về ngày sinh nhật và không bịa đặt thông tin. |
| 27 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về giá bán cụ thể và không bịa đặt thông tin trái với bảng sự thật. |
| 28 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về trường đại học và không bịa đặt thông tin nào. |
| 29 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng phương án giảm 5% và điều kiện cam kết 12 tháng, khớp với đáp án tham chiếu và bảng sự thật. |
| 30 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng các phương án được cân nhắc nhưng bịa ra đường link hội thoại không có trong bảng sự thật. |
| 31 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng và đủ các ý chính. Việc thêm năm 2026 vào ngày tháng không bị tính là bịa theo quy tắc. |
| 32 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng ý chính là mẫu logo của Gamma, các thông tin bổ sung đều dựa trên bảng sự thật. |
| 100 | stress_current | 1 | 0 | Trợ lý trả lời chính xác đầu mối hiện tại là chị Giang và mục tiêu là 300 SIM/tháng, khớp với đáp án tham chiếu và bảng sự thật. |
| 101 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu SIM của khách Alfa Holidays dựa trên bảng sự thật. |
| 102 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu SIM của khách Quartz Travel, thông tin thị trường Ý có trong bảng sự thật. |
| 103 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu SIM của khách Yarrow Journeys dựa trên bảng sự thật. |
| 104 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu của Alfa Travel theo bảng sự thật. |
| 105 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu của khách Coral Tours, các thông tin bổ sung cũng hoàn toàn chính xác theo bảng sự thật. |
| 106 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu của khách Onyx Holidays theo bảng sự thật. |
| 107 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối cũ và mục tiêu cũ, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 108 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu, thông tin thêm chính xác theo bảng sự thật. |
| 109 | stress_history | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu ban đầu của khách Mango Travel, thông tin bổ sung cũng chính xác theo bảng sự thật. |
| 110 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Pháp và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 111 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường của khách Birch Holidays theo bảng sự thật. |
| 112 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường của khách Alfa Tours là Thái Lan và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 113 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường của khách Sierra Trips và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 114 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường của khách Mango Travel là Singapore và cung cấp thêm thông tin chính xác từ bảng sự thật. |