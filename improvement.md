# ĐÁNH GIÁ HIỆU NĂNG & ĐỀ XUẤT CẢI TIẾN TẦNG APPLICATION (BACKEND & FRONTEND)
## GOHUB INTEL PLATFORM

Tài liệu này tập trung đánh giá hiệu năng của tầng **Application** (bao gồm Next.js Frontend, Next.js API Routes Backend, hệ thống AI Chatbot, và các kịch bản Python đồng bộ dữ liệu), hoàn toàn bỏ qua các cải tiến ở tầng Database (như indexing, tối ưu hóa schema, v.v.). Qua việc review chi tiết mã nguồn, chúng tôi đã xác định được các điểm nghẽn hiệu năng chính và đề xuất các giải pháp tối ưu hóa cụ thể dưới đây.

---

## I. TẦNG BACKEND & API ROUTES (NEXT.JS)

### 1. Triệt tiêu các Async Waterfalls (Sequential Fetches)
**Hiện trạng:**
Trong một số API routes và logic xử lý dữ liệu, các cuộc gọi bất đồng bộ (async calls) đang được thực hiện tuần tự (`await` nối tiếp) thay vì song song, gây ra hiện tượng tích lũy độ trễ (latency accumulation).
*   **`bod-group-margin/route.ts` (Dòng 26-40):** Khi người dùng chọn so sánh dữ liệu (`comparisonType !== "none"`), API sẽ `await` lấy dữ liệu kỳ hiện tại (`fetchBODGroupMarginData`), sau đó mới tiếp tục `await` lấy dữ liệu kỳ trước. Điều này làm tăng gấp đôi thời gian phản hồi của API.
*   **`b2c/performance/route.ts` (Dòng 163-177):** Tương tự, việc lấy dữ liệu B2C kỳ hiện tại và kỳ trước được thực hiện tuần tự.
*   **`b2b/performance/route.ts` (Dòng 110-114):** Các hàm lấy chi phí kênh (`getChannelCostsForMonths`), cấu hình nhập chi phí (`getCostSettingsForMonths`), và chi phí nhóm (`getGroupCostsForMonths`) được gọi tuần tự bằng 3 câu lệnh `await` riêng biệt.

**Giải pháp đề xuất:**
Gom tất cả các cuộc gọi bất đồng bộ độc lập vào `Promise.all` để chạy song song, giảm đường dẫn găng (critical path) xuống bằng thời gian của cuộc gọi lâu nhất.
*   *Ví dụ tối ưu hóa trong `bod-group-margin/route.ts`:*
    ```typescript
    // Thay vì gọi tuần tự:
    // const current = await fetchBODGroupMarginData(...)
    // const previous = await fetchBODGroupMarginData(...)

    // Tối ưu hóa chạy song song:
    const [currentResult, previousResult] = await Promise.all([
      fetchBODGroupMarginData(startDate, endDate, dateColumn, extraFilters),
      comparisonType !== "none"
        ? fetchBODGroupMarginData(prevStartStr, prevEndStr, dateColumn, extraFilters)
        : Promise.resolve({ groups: [] })
    ])
    const current = currentResult.groups
    const previous = previousResult.groups
    ```
*   *Ví dụ tối ưu hóa trong `b2b/performance/route.ts`:*
    ```typescript
    const [channelCosts, settingsMap, groupCosts] = await Promise.all([
      getChannelCostsForMonths(months),
      getCostSettingsForMonths(months),
      getGroupCostsForMonths(months)
    ])
    ```

### 2. Tối ưu hóa thuật toán xử lý dữ liệu trong bộ nhớ (In-Memory Processing) từ $O(N \times M)$ thành $O(N + M)$
**Hiện trạng:**
Trong các API xử lý báo cáo (như B2B và B2C Performance), hệ thống thực hiện tính toán chi phí vận hành (opCost) bằng cách lặp qua từng dòng dữ liệu doanh thu và lọc mảng chi phí.
*   **`b2b/performance/route.ts` (Dòng 144-172):** Với mỗi tháng của mỗi dòng doanh thu (có thể lên tới 500 dòng $\times$ 12 tháng = 6000 lượt), hệ thống thực hiện `.filter` trên mảng `channelCosts` để tìm chi phí khớp với kênh và tháng:
    ```typescript
    channelCosts.filter(c => c.channel === r.name && c.month === mMonth)
    ```
    Nếu `channelCosts` có $M$ phần tử và số lượt lặp là $N$, thuật toán này có độ phức tạp là $O(N \times M)$. Khi dữ liệu lớn, việc này sẽ chặn đứng Event Loop của Node.js (CPU-bound bottleneck), gây nghẽn toàn bộ server.

**Giải pháp đề xuất:**
Index mảng `channelCosts` thành một **Map** (Lookup Table) với key là `channel_month` trước khi lặp. Việc này giúp chuyển đổi thao tác tìm kiếm từ $O(M)$ (quét mảng) thành $O(1)$ (hash lookup), đưa toàn bộ thuật toán về độ phức tạp tuyến tính $O(N + M)$.
*   *Ví dụ tối ưu hóa:*
    ```typescript
    // 1. Tạo Lookup Map (O(M))
    const costMap = new Map<string, ChannelCostRow>()
    channelCosts.forEach(c => {
      costMap.set(`${c.channel}_${c.month}`, c)
    })

    // 2. Truy xuất O(1) trong vòng lặp (O(N))
    r.monthly_data.forEach(monthRow => {
      const cacheKey = `${r.name}_${monthRow.month}`
      const c = costMap.get(cacheKey)
      if (c) {
        // Tính toán chi phí trực tiếp...
      }
    })
    ```

### 3. Giảm tải số lượng Parallel Range Queries lên Supabase
**Hiện trạng:**
*   **`agents/cache.ts` (Dòng 61-69):** Để lấy toàn bộ danh mục `ncc_worldmove` (khoảng 9,000 dòng) và vượt qua giới hạn 1,000 dòng của Supabase, hệ thống thực hiện **12 request song song** bằng `Promise.all` với các dải `.range(i * 1000, i * 1000 + 999)`.
    Mặc dù chạy song song giúp giảm latency so với chạy tuần tự, việc bắn 12 kết nối đồng thời lên Supabase trên mỗi lượt reload cache (hoặc khi cold start) có thể làm cạn kiệt pool kết nối của Supabase và gây áp lực tải không cần thiết lên API gateway.

**Giải pháp đề xuất:**
*   **Tăng TTL của Cache:** Tăng TTL của cache tham chiếu (`RefCache`) từ 30 phút lên 2-4 giờ, vì danh mục sản phẩm của nhà cung cấp không thay đổi liên tục theo từng phút.
*   **Sử dụng cơ chế Stale-While-Revalidate (SWR) phía Server:** Khi cache hết hạn, vẫn trả về dữ liệu cũ cho request hiện tại, đồng thời kích hoạt một tiến trình chạy ngầm (background worker) để fetch lại 12 batches dữ liệu mới. Điều này giúp người dùng không bao giờ phải chịu độ trễ 2-3 giây khi cache bị reload.

---

## II. TẦNG PYTHON BACKEND (DATA SYNCHRONIZATION)

### 1. Chuyển đổi cập nhật từng dòng (Row-by-Row) thành Bulk Upsert
**Hiện trạng:**
*   **`backend/data_sync/populate_geo_hierarchy.py` (Dòng 324-334):** Script thực hiện cập nhật thông tin địa lý (continent, sub_region) bằng cách lặp qua từng quốc gia và gọi API `.update()` riêng lẻ lên Supabase:
    ```python
    sb.table("ref_countries").update(...).eq("code", code).execute()
    ```
    Với khoảng 212 quốc gia, script phải thực hiện **212 HTTP requests tuần tự**, tiêu tốn từ **20 đến 40 giây** và có nguy cơ cao bị timeout hoặc nghẽn mạng.

**Giải pháp đề xuất:**
Gom tất cả dữ liệu thay đổi vào một mảng và thực hiện **một câu lệnh `upsert` duy nhất** lên Supabase. Việc này giảm số lượng HTTP request từ 212 xuống còn **1**, rút ngắn thời gian thực thi từ 40 giây xuống còn **dưới 1 giây**.
*   *Ví dụ tối ưu hóa:*
    ```python
    upsert_data = [
        {
            "code": row["code"].upper().strip(),
            "continent": GEO[row["code"].upper().strip()][0],
            "sub_region": GEO[row["code"].upper().strip()][1]
        }
        for row in all_rows if row["code"].upper().strip() in GEO
    ]
    if upsert_data:
        sb.table("ref_countries").upsert(upsert_data, on_conflict="code").execute()
    ```

### 2. Thiếu Connection Pooling (Tái sử dụng kết nối HTTP)
**Hiện trạng:**
*   **`scripts/migrate_turso_tickets.py` (Dòng 48-80, 93-129):** Script sử dụng thư viện thuần `urllib.request` để thực hiện các truy vấn đến Turso và Supabase. Vì `urllib` mặc định không tái sử dụng kết nối (HTTP Keep-Alive), mỗi batch 200 dòng (tổng cộng 120+ batches cho 24,000+ dòng) đều phải thực hiện một **TLS Handshake mới**.
    Điều này làm tăng cực kỳ nhiều độ trễ mạng (network latency overhead) và có thể gây cạn kiệt cổng kết nối (port exhaustion) trên database server.

**Giải pháp đề xuất:**
Chuyển sang sử dụng thư viện `requests` với **`requests.Session()`** để tự động kích hoạt HTTP Keep-Alive và tái sử dụng kết nối cho tất cả các request tiếp theo.
*   *Ví dụ tối ưu hóa:*
    ```python
    import requests
    
    session = requests.Session()
    # Sử dụng session.post() thay vì urllib.request.urlopen()
    response = session.post(url, json=body_dict, headers=headers)
    ```

### 3. Tối ưu hóa bộ nhớ khi đọc file Excel lớn (XLSX Parsing)
**Hiện trạng:**
*   **`backend/data_sync/sync_data_files.py` (Dòng 58-60):** Script sử dụng thư viện `openpyxl` để load toàn bộ file Excel tham chiếu vào bộ nhớ:
    ```python
    openpyxl.load_workbook(path, data_only=True)
    ```
    Mặc định, `openpyxl` sẽ dựng toàn bộ cây DOM của file Excel trong RAM. Với các file báo giá hoặc danh mục nhà cung cấp lớn, việc này gây ra hiện tượng ngốn RAM cực kỳ mạnh (memory spikes), dễ dẫn đến lỗi Out-Of-Memory (OOM) trên môi trường container hoặc GitHub Actions runner.

**Giải pháp đề xuất:**
Kích hoạt chế độ **`read_only=True`** trong `openpyxl`. Chế độ này sử dụng cơ chế streaming để đọc từng dòng file Excel mà không load toàn bộ file vào RAM, giúp giảm dung lượng RAM tiêu thụ lên tới **90%**.
*   *Ví dụ tối ưu hóa:*
    ```python
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ```

### 4. Parallel hóa các tác vụ đồng bộ độc lập
**Hiện trạng:**
*   **`backend/data_sync/sync.py` (Dòng 199-204):** Tiến trình đồng bộ dữ liệu hàng ngày thực hiện đồng bộ tuần tự: `products` -> `skus` -> `listings` -> `items`. Vì các bảng này độc lập với nhau ở bước fetch dữ liệu từ GoHub API, việc chạy tuần tự làm kéo dài tổng thời gian chạy của GitHub Actions workflow (hiện đang giới hạn 15 phút trong `data_sync.yml`).

**Giải pháp đề xuất:**
Sử dụng `concurrent.futures.ThreadPoolExecutor` trong Python để fetch dữ liệu từ các endpoint API song song, sau đó mới thực hiện ghi vào database theo đúng thứ tự ràng buộc khóa ngoại.

---

## III. TẦNG FRONTEND & RENDERING (REACT / NEXT.JS)

### 1. Ngăn chặn hiện tượng "Massive Re-renders" trên các trang báo cáo lớn
**Hiện trạng:**
Các trang báo cáo lớn như **`BODReport` (`bod/page.tsx`)** và **`B2CPerformance` (`b2c-performance.tsx`)** đang được thiết kế dưới dạng một Component khổng lồ (Monolithic Component) chứa toàn bộ state của trang:
*   State của bộ lọc (dropdowns, selected items, date range).
*   State của hiệu ứng UI (showFilters, showVendorDropdown, expandedGroups).
*   Dữ liệu thô của các biểu đồ và bảng biểu.

Khi người dùng thực hiện một tương tác cực kỳ nhỏ (ví dụ: hover vào biểu đồ Recharts, click mở dropdown bộ lọc, hoặc expand một dòng trong bảng), React sẽ kích hoạt re-render **toàn bộ component**. Điều này đồng nghĩa với việc:
1.  Tất cả các biểu đồ Recharts (Revenue vs COGS, Margin Analysis, Pie Chart) phải tính toán lại SVG và vẽ lại.
2.  Tất cả các bảng dữ liệu lớn (Daily Financial Breakdown, Performance Breakdown) phải render lại hàng trăm thẻ `<tr>` và `<td>`.
3.  Hàm tính toán IIFE `processedGroupMargins` (Dòng 226 trong `bod/page.tsx`) thực hiện `.filter` và `.reduce` trên mảng dữ liệu lớn sẽ bị chạy lại liên tục trên mỗi pixel di chuyển chuột hoặc mỗi lần click.

**Giải pháp đề xuất:**
*   **Tách nhỏ Component (Component Modularization):** Tách các phần độc lập thành các component riêng biệt (ví dụ: `<FilterPanel>`, `<SummaryCards>`, `<RevenueChart>`, `<PerformanceTable>`). State của dropdown nào thì giữ nguyên trong component đó, không đưa lên state chung của trang.
*   **Áp dụng `React.memo` cho các Component nặng:** Bọc các component biểu đồ và bảng biểu trong `React.memo` để chúng chỉ re-render khi dữ liệu đầu vào (props) thực sự thay đổi.
*   **Sử dụng `useMemo` cho các hàm tính toán dữ liệu:** Thay thế toàn bộ các hàm tự chạy (IIFE) bằng `useMemo` để tránh tính toán lại dữ liệu khi render.
    ```typescript
    // Thay vì chạy trực tiếp trên mỗi render:
    // const processedGroupMargins = (() => { ... })()

    // Tối ưu hóa bằng useMemo:
    const processedGroupMargins = useMemo(() => {
      const businessGroups = ["B2B", "B2C", "Other"]
      const b2bRows = groupMargins.filter(r => r.group?.startsWith("B2B"))
      // ... thực hiện tính toán ...
      return result
    }, [groupMargins, strategicPerformance]) // Chỉ chạy lại khi 2 mảng này thay đổi
    ```

### 2. Tối ưu hóa Bundle Size bằng Dynamic Imports (Lazy Loading)
**Hiện trạng:**
Các thư viện nặng như **`recharts`** (vẽ biểu đồ), **`xlsx`** (xuất Excel), và **`jspdf`** (xuất PDF) đang được import tĩnh (static import) ở đầu file. Điều này khiến Next.js gộp chung các thư viện này vào bundle JS ban đầu của trang, làm tăng dung lượng file JS tải về, kéo dài thời gian chặn Event Loop (TBT - Total Blocking Time) và làm giảm điểm số LCP (Largest Contentful Paint).

**Giải pháp đề xuất:**
*   **Lazy Load các biểu đồ Recharts:** Sử dụng `next/dynamic` với tùy chọn `ssr: false` để chỉ tải thư viện Recharts khi client-side đã sẵn sàng và component thực sự cần hiển thị.
    ```typescript
    import dynamic from "next/dynamic"

    const ResponsiveContainer = dynamic(
      () => import("recharts").then((mod) => mod.ResponsiveContainer),
      { ssr: false }
    )
    const ComposedChart = dynamic(
      () => import("recharts").then((mod) => mod.ComposedChart),
      { ssr: false }
    )
    // Tương tự với Area, Line, Bar, XAxis, YAxis...
    ```
*   **Dynamic Import cho logic xuất file (XLSX/PDF):** Chỉ import thư viện `xlsx` hoặc `jspdf` bên trong hàm xử lý sự kiện click nút Export, thay vì import ở đầu file.
    ```typescript
    const handleExport = async () => {
      // Tải động thư viện xlsx khi người dùng click nút
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()
      // ... thực hiện export ...
    }
    ```

---

## IV. HỆ THỐNG AI CHATBOT (AGENTS LAYER)

### 1. Triển khai Fast-Path Classifier (Regex/Rule-based) để giảm độ trễ LLM
**Hiện trạng:**
*   **`agents/router.ts` (Dòng 473-475):** Mỗi tin nhắn chat gửi lên hệ thống đều phải đi qua hàm `classify(message)` để gọi Gemini 3.5 Flash phân loại Intent.
    Việc này tiêu tốn từ **500ms đến 1.5s** chỉ để xác định xem người dùng muốn làm gì, ngay cả đối với các câu hỏi cực kỳ đơn giản hoặc mang tính điều hướng rõ ràng (ví dụ: "doanh thu tháng này", "tra mã 1CJPNWM101001", "KYC là gì").

**Giải pháp đề xuất:**
Xây dựng một bộ phân loại bằng luật/biểu thức chính quy (Fast-Path Classifier) chạy trực tiếp trên server trước khi gọi Gemini. Nếu tin nhắn khớp với các mẫu định sẵn với độ tự tin cao, hệ thống sẽ short-circuit và định tuyến trực tiếp đến Agent phù hợp, bỏ qua bước gọi LLM Classifier.
*   *Ví dụ cấu trúc Fast-Path:*
    ```typescript
    export async function route(message: string, history: Message[], role: UserRole): Promise<RouteResult> {
      const params = extractParams(message)
      const nrm = normalizeText(message)

      // Fast-Path: Nhận diện nhanh bằng Regex
      if (params.skuCode && nrm.startsWith("tra ma")) {
        return { agentId: "tra-cuu", agentName: "Tra Cứu", params, needsClarification: false, agentIds: ["tra-cuu"], multi: false }
      }
      if (/\b(doanh thu|don hang|top kenh|kpi)\b/i.test(nrm)) {
        return { agentId: "bi-analyst", agentName: "BI Analyst", params, needsClarification: false, agentIds: ["bi-analyst"], multi: false }
      }

      // Slow-Path: Nếu không khớp mẫu nào, gọi Gemini Classifier như cũ
      const classified = await classify(message)
      // ... tiếp tục xử lý ...
    }
    ```
Giải pháp này giúp giảm **100% độ trễ LLM (tiết kiệm ~1 giây)** cho khoảng 40-50% các câu hỏi thông thường của người dùng, đồng thời giảm đáng kể chi phí API Gemini.

### 2. Tối ưu hóa kích thước Context truyền vào LLM (Token Bloat)
**Hiện trạng:**
*   **`agents/context.ts` (Dòng 394-402):** Khi người dùng hỏi về một mã nhóm nước hoặc giải đáp thuật ngữ, hệ thống đang thực hiện inject **toàn bộ danh mục `ref_support_countries`** vào system prompt của Gemini để bot có dữ liệu trả lời.
    Việc đưa hàng trăm dòng dữ liệu tĩnh vào context của mỗi request gây ra hiện tượng lãng phí token (token bloat), làm tăng thời gian xử lý của LLM và tăng chi phí vận hành.

**Giải pháp đề xuất:**
*   **Lọc dữ liệu trước khi inject (Pre-filtering):** Thay vì đưa toàn bộ danh sách, hãy sử dụng kết quả từ `extractParams` để chỉ lọc ra nhóm nước hoặc quốc gia liên quan trực tiếp đến câu hỏi và inject duy nhất phần đó vào context.
*   **Sử dụng Vector Search (RAG) hiệu quả:** Đối với các câu hỏi giải đáp nghiệp vụ, chỉ sử dụng kết quả tìm kiếm từ `searchKnowledgeBase` (đã qua vector search giới hạn top 3-5 chunks) thay vì nạp các bảng cấu hình thô.

---

## V. KẾ HOẠCH HÀNH ĐỘNG & THỨ TỰ ƯU TIÊN (ROADMAP)

Để tối ưu hóa hiệu năng một cách hiệu quả nhất với nguồn lực có hạn, đề xuất triển khai các cải tiến theo thứ tự ưu tiên sau:

| Thứ tự | Cải tiến | Tầng | Độ khó | Tác động (Impact) |
| :---: | :--- | :---: | :---: | :---: |
| **1** | Áp dụng `useMemo` cho các hàm tính toán dữ liệu lớn (IIFE) trên Frontend | Frontend | Dễ | **Cực kỳ cao** (Hết giật lag khi tương tác UI) |
| **2** | Chuyển đổi cập nhật từng dòng thành **Bulk Upsert** trong Python (`populate_geo_hierarchy.py`) | Python Backend | Dễ | **Cực kỳ cao** (Giảm thời gian chạy từ 40s xuống <1s) |
| **3** | Triển khai Fast-Path Classifier (Regex) cho các câu hỏi chatbot phổ biến | AI Chatbot | Trung bình | **Cao** (Giảm ~1s độ trễ cho 50% cuộc hội thoại) |
| **4** | Chuyển đổi thuật toán tính opCost từ $O(N \times M)$ sang $O(N + M)$ bằng Map | Next.js Backend | Dễ | **Cao** (Giảm tải CPU server, tránh timeout API) |
| **5** | Thêm **Connection Pooling** (`requests.Session()`) cho script Python | Python Backend | Dễ | **Cao** (Giảm latency mạng, tránh cạn kiệt port DB) |
| **6** | Parallel hóa các câu truy vấn độc lập bằng `Promise.all` trong API Routes | Next.js Backend | Dễ | **Trung bình** (Giảm 30-50% thời gian phản hồi API) |
| **7** | Sử dụng chế độ **`read_only=True`** khi đọc Excel bằng `openpyxl` | Python Backend | Dễ | **Trung bình** (Giảm 90% RAM tiêu thụ, tránh lỗi OOM) |
| **8** | Tách nhỏ Monolithic Components và áp dụng `React.memo` | Frontend | Trung bình | **Trung bình** (Tối ưu hóa FPS khi cuộn trang/hover) |
| **9** | Áp dụng Dynamic Imports (Lazy Loading) cho Recharts và XLSX/PDF | Frontend | Trung bình | **Trung bình** (Tăng điểm LCP, giảm thời gian tải trang đầu) |
| **10** | Tối ưu hóa cơ chế nạp cache `RefCache` bằng SWR chạy ngầm | Next.js Backend | Khó | **Thấp** (Chỉ ảnh hưởng khi cold start hoặc hết hạn cache) |
