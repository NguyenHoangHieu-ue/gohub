# Eval trí nhớ — memory-stress60

Giám khảo: gemini-pro-latest · 47 câu · persona tổng hợp · user eval-p0

**Đúng: 89%** · bịa: 17% · lỗi chạy: 0

| Nhóm | Số câu | Đúng | Bịa |
|---|---|---|---|
| single_fact | 5 | 100% | 0% |
| preference | 4 | 100% | 0% |
| update_current | 5 | 100% | 0% |
| history | 5 | 100% | 0% |
| multi_hop | 5 | 100% | 20% |
| abstention | 4 | 100% | 25% |
| conversation_recall | 4 | 100% | 50% |
| stress_current | 5 | 100% | 0% |
| stress_history | 5 | 0% | 80% |
| stress_market | 5 | 100% | 0% |

Mỗi câu: thời gian TB 6.8s · token vào/ra TB 34593/108 · gọi tool: 14/47 câu

Trí nhớ sau khi nạp: 72 mục (0 đã lưu trữ), 2 tóm tắt hội thoại, khối prompt 8653 ký tự

| # | Nhóm | Đúng | Bịa | Ghi chú giám khảo |
|---|---|---|---|---|
| 1 | single_fact | 1 | 0 | Trợ lý trả lời đúng đầu mối thanh toán là chị Hà và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 2 | single_fact | 1 | 0 | Trợ lý trả lời đúng người liên hệ chính là anh Quang. Các thông tin bổ sung đều có trong bảng sự thật. |
| 3 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời gian thử nghiệm và ngày bắt đầu. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 4 | single_fact | 1 | 0 | Trợ lý trả lời đúng thời gian nghỉ phép từ 6/10 đến 10/10. Việc thêm năm 2026 không tính là bịa theo quy tắc. Thông tin bàn giao công việc cho Phúc cũng có trong bảng sự thật. |
| 5 | single_fact | 1 | 0 | Trợ lý trả lời đúng vị trí công việc theo đáp án tham chiếu và cung cấp thêm các thông tin chính xác dựa trên bảng sự thật. |
| 6 | preference | 1 | 0 | Trợ lý trả lời đầy đủ các ý trong đáp án tham chiếu và bổ sung thêm yêu cầu về cột CM1% có trong bảng sự thật. |
| 7 | preference | 1 | 0 | Trợ lý trả lời đúng thời gian nhận báo cáo là sáng thứ Hai hằng tuần, khớp với đáp án tham chiếu và bảng sự thật. |
| 8 | preference | 1 | 0 | Trợ lý trả lời đúng cột CM1% và không bịa thông tin. |
| 9 | preference | 1 | 0 | Trợ lý trả lời đúng khung giờ không nên đặt lịch nhắc là chiều thứ Sáu và lý do họp với anh Tuấn, khớp với đáp án tham chiếu và bảng sự thật. |
| 10 | update_current | 1 | 0 | Trợ lý trả lời đúng thị trường Châu Âu và việc không còn phụ trách Hàn Quốc từ 1/9. Các thông tin bổ sung về khách hàng đều chính xác theo bảng sự thật. |
| 11 | update_current | 1 | 0 | Trợ lý trả lời đúng sếp trực tiếp hiện tại là anh Tuấn và thông tin chị Lan chuyển sang B2C hoàn toàn khớp với bảng sự thật. |
| 12 | update_current | 1 | 0 | Trợ lý trả lời đúng người phụ trách hiện tại là bạn Phúc từ ngày 1/9, khớp với đáp án tham chiếu và bảng sự thật. |
| 13 | update_current | 1 | 0 | Trợ lý trả lời chính xác số ngày của gói Unlimited hiện tại là 7 ngày (đổi từ 10 ngày), khớp với đáp án tham chiếu và bảng sự thật. |
| 14 | update_current | 1 | 0 | Trợ lý trả lời đúng mục tiêu hiện tại là 500 SIM/tháng và có nhắc đến mục tiêu cũ 200 SIM/tháng. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 15 | history | 1 | 0 | Trợ lý trả lời đúng thị trường Hàn Quốc và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 16 | history | 1 | 0 | Trợ lý trả lời đúng sếp trực tiếp trước anh Tuấn là chị Lan và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 17 | history | 1 | 0 | Trợ lý trả lời đúng số ngày ban đầu là 10 ngày và cung cấp thêm thông tin cập nhật chính xác từ bảng sự thật. |
| 18 | history | 1 | 0 | Trợ lý trả lời đúng mục tiêu 200 SIM/tháng và các thông tin bổ sung đều có trong bảng sự thật. |
| 19 | history | 1 | 0 | Trợ lý trả lời đúng mảng B2C theo thông tin trong bảng sự thật. |
| 20 | multi_hop | 1 | 1 | Trợ lý trả lời đúng thông tin khách hàng và các đầu mối, nhưng bịa ra tên cuộc hội thoại và đường link không có trong bảng sự thật. |
| 21 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ các ý chính theo đáp án tham chiếu, các thông tin bổ sung đều có trong bảng sự thật. |
| 22 | multi_hop | 1 | 0 | Trợ lý trả lời đúng và đủ các thông tin theo đáp án tham chiếu, các thông tin bổ sung đều có trong bảng sự thật. |
| 23 | multi_hop | 1 | 0 | Trợ lý trả lời đúng thời gian họp là chiều thứ Sáu và sếp là anh Tuấn, khớp với đáp án tham chiếu và bảng sự thật. |
| 24 | multi_hop | 1 | 0 | Trợ lý trả lời đúng tên khách hàng và mục tiêu quý 4, các thông tin bổ sung đều có trong bảng sự thật. |
| 25 | abstention | 1 | 1 | Trợ lý trả lời đúng là không có thông tin số điện thoại, nhưng bịa ra đường link hội thoại không hề có trong bảng sự thật. |
| 26 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về ngày sinh nhật và không bịa đặt thông tin. |
| 27 | abstention | 1 | 0 | Trợ lý trả lời đúng là chưa có thông tin về giá bán, các thông tin bổ sung đều chính xác dựa trên bảng sự thật. |
| 28 | abstention | 1 | 0 | Trợ lý trả lời đúng là không có thông tin và các thông tin bổ sung đều có trong bảng sự thật. |
| 29 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng phương án và điều kiện đi kèm, thông tin bổ sung cũng chính xác theo bảng sự thật. |
| 30 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng các phương án được cân nhắc nhưng bịa ra đường link hội thoại không có trong bảng sự thật. |
| 31 | conversation_recall | 1 | 0 | Trợ lý trả lời đúng và đủ thông tin theo đáp án tham chiếu. Việc thêm năm 2026 không bị tính là bịa theo quy tắc. |
| 32 | conversation_recall | 1 | 1 | Trợ lý trả lời đúng ý chính là cần logo của Gamma, nhưng bịa thêm thông tin về thời gian 1 tuần để lên mẫu thiết kế và đường link hội thoại không có trong bảng sự thật. |
| 100 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu hiện tại của Lotus Tours, các thông tin bổ sung đều có trong bảng sự thật. |
| 101 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối hiện tại và mục tiêu SIM, các thông tin bổ sung đều có trong bảng sự thật. |
| 102 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối hiện tại và mục tiêu SIM, các thông tin bổ sung đều có trong bảng sự thật. |
| 103 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu SIM hằng tháng của khách Onyx Journeys theo bảng sự thật. |
| 104 | stress_current | 1 | 0 | Trợ lý trả lời đúng đầu mối và mục tiêu hiện tại, các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 105 | stress_history | 0 | 1 | Trợ lý nói không có thông tin về đầu mối cũ và mục tiêu cũ, nhưng bảng sự thật có ghi rõ đầu mối ban đầu là chị Hạnh và mục tiêu 850 SIM/tháng. Việc khẳng định thông tin không được lưu lại là trái với |
| 106 | stress_history | 0 | 0 | Trợ lý trả lời đúng đầu mối ban đầu nhưng nói sai rằng không có thông tin về mục tiêu ban đầu (thực tế bảng sự thật có ghi là 350 SIM/tháng). |
| 107 | stress_history | 0 | 1 | Trợ lý trả lời sai và bịa đặt rằng không có dữ liệu về mục tiêu trước khi đổi, trong khi bảng sự thật ghi rõ mục tiêu ban đầu là 800 SIM/tháng. |
| 108 | stress_history | 0 | 1 | Trợ lý trả lời sai/thiếu mục tiêu ban đầu và khẳng định không có dữ liệu về mục tiêu trước khi tăng, điều này trái với bảng sự thật (mục tiêu ban đầu là 700 SIM/tháng). |
| 109 | stress_history | 0 | 1 | Trợ lý trả lời sai/thiếu mục tiêu ban đầu (700 SIM/tháng) và khẳng định hệ thống chưa lưu lại con số này, điều này trái với bảng sự thật. |
| 110 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường Thái Lan và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 111 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường là Hàn Quốc và các thông tin bổ sung đều chính xác theo bảng sự thật. |
| 112 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường Hàn Quốc và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 113 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường của khách Sierra Trips là Singapore và cung cấp thêm thông tin chính xác từ bảng sự thật. |
| 114 | stress_market | 1 | 0 | Trợ lý trả lời đúng thị trường Ý và các thông tin bổ sung đều chính xác theo bảng sự thật. |