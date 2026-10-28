import { describe, expect, it } from "vitest"
import { parseProposals } from "@/lib/argon/proposal-cards"

const MD = `### 1. Chuyển luồng đơn Đài Loan sang BC Singtel Pool — Chắc
- Vì sao: Worldmove vẫn chiếm 86,4% doanh thu Đài Loan dù BC Singtel rẻ hơn.
- Ảnh hưởng: khoảng 142 triệu VND mỗi tháng (GP chênh 10%).
- Nguồn: bod-summary, Removal of Macau
- Liên quan kế hoạch: Datapool 75%

### 2. Nhắc cấu hình roaming dự phòng cho Macau — Có thể
- Vì sao: CTM sắp ngắt roaming 30/11.
- Ảnh hưởng: chưa lượng hoá được
- Nguồn: Removal of Macau
Ghi chú thêm một dòng.`

describe("parseProposals", () => {
  it("tách từng đề xuất thành thẻ có trường", () => {
    const c = parseProposals(MD)!
    expect(c).toHaveLength(2)
    expect(c[0]).toMatchObject({ n: 1, title: "Chuyển luồng đơn Đài Loan sang BC Singtel Pool", certainty: "chac", certaintyLabel: "Chắc chắn" })
    expect(c[0].impact).toContain("142 triệu")
    expect(c[0].sources).toEqual(["bod-summary", "Removal of Macau"])
    expect(c[0].plan).toBe("Datapool 75%")
    expect(c[1]).toMatchObject({ n: 2, certainty: "co_the", impact: "chưa lượng hoá được" })
    expect(c[1].extra).toEqual(["Ghi chú thêm một dòng."])
  })
  it("không theo khuôn → null (trang hiện markdown gốc)", () => {
    expect(parseProposals("1. Việc A\n2. Việc B")).toBeNull()
    expect(parseProposals("")).toBeNull()
  })
  it("tiêu đề không có nhãn chắc chắn vẫn thành thẻ (certainty null)", () => {
    const c = parseProposals("### 1. Làm gì đó\n- Nguồn: a")!
    expect(c[0].certainty).toBeNull()
    expect(c[0].title).toBe("Làm gì đó")
  })
})
