import { describe, it, expect, beforeAll } from "vitest"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

// SO CẶP TAB: cùng một chỉ số (doanh thu / lãi gộp / CM1) ở các tab khác nhau phải ra CÙNG số trên cùng kỳ.
// Lỗi kiểu "chỉ 1–2 chỗ lệch" (thẻ KPI vs bảng cùng tab, BOD vs Channels, snapshot vs trang…) đã xảy ra nhiều lần vì
// mỗi tab tự lọc/tự tính chi phí — test này gọi API thật và bắt lệch ngay.
//
// Chạy:  npm run test:consistency          (mặc định gọi staging)
//        CONSISTENCY_BASE_URL=https://intel-v2.gohub.cloud npm run test:consistency
// Cần CRON_SECRET (env hoặc web/.env.local) — route analytics cho Bearer cron bỏ qua phiên đăng nhập.
// Chỉ dùng kỳ ĐÃ ĐÓNG (quý trước, tháng trước, 1 khoảng vắt tháng) để số không trôi theo dữ liệu mới.
// KHÔNG nằm trong `npm test` (cần mạng + DB thật; xem vitest.consistency.config.ts).

const BASE = (process.env.CONSISTENCY_BASE_URL || "https://stg-intel-v2.gohub.cloud").replace(/\/$/, "")

function loadSecret(): string {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET
  const envFile = join(__dirname, "..", "..", ".env.local")
  if (!existsSync(envFile)) return ""
  const m = readFileSync(envFile, "utf8").split(/\r?\n/).find(l => l.startsWith("CRON_SECRET="))
  return m ? m.slice("CRON_SECRET=".length).replace(/^"|"$/g, "").trim() : ""
}
const SECRET = loadSecret()

async function api<T = any>(path: string): Promise<T> {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}nocache=1`
  let lastErr: unknown
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${SECRET}` } })
      const body = await res.text()
      if (!res.ok) throw new Error(`${res.status} ${path}: ${body.slice(0, 160)}`)
      return JSON.parse(body) as T
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 3000)) }
  }
  throw lastErr
}

// ── Kỳ đã đóng ──────────────────────────────────────────────────────────────
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
function periods() {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const lastMonth = { name: "tháng trước", start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) }
  const qStartMonth = Math.floor(m / 3) * 3 - 3                          // đầu quý TRƯỚC (có thể âm → Date tự lùi năm)
  const lastQuarter = { name: "quý trước", start: iso(new Date(y, qStartMonth, 1)), end: iso(new Date(y, qStartMonth + 3, 0)) }
  const crossMonth = { name: "vắt tháng", start: iso(new Date(y, m - 2, 12)), end: iso(new Date(y, m - 1, 9)) }
  const qNum = Math.floor(((new Date(y, qStartMonth, 1)).getMonth()) / 3) + 1
  return { lastMonth, lastQuarter, crossMonth, quarterParam: `quarter=Q${qNum}&year=${new Date(y, qStartMonth, 1).getFullYear()}` }
}
const P = periods()

const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)
const kpi = (cards: any[], label: string) => Number((cards.find(c => c.label === label) || {}).value)
// Sai số cho phép: làm tròn ở vài route (Math.round) — vài đồng; số tiền VND lớn nên tolerance tuyệt đối nhỏ.
const close = (a: number, b: number, what: string, tol = 5) => {
  expect(Number.isFinite(a) && Number.isFinite(b), `${what}: thiếu số (${a} vs ${b})`).toBe(true)
  expect(Math.abs(a - b), `${what}: ${Math.round(a).toLocaleString("en-US")} vs ${Math.round(b).toLocaleString("en-US")} (lệch ${Math.round(a - b).toLocaleString("en-US")})`).toBeLessThanOrEqual(tol)
}

const describeLive = SECRET ? describe : describe.skip

describeLive("So cặp tab — cùng kỳ, cùng số", () => {
  beforeAll(() => { console.log(`[consistency] ${BASE} | ${P.lastQuarter.start}→${P.lastQuarter.end} | ${P.lastMonth.start}→${P.lastMonth.end} | ${P.crossMonth.start}→${P.crossMonth.end}`) })

  for (const per of [P.lastQuarter, P.lastMonth, P.crossMonth]) {
    describe(`kỳ ${per.name} (${per.start} → ${per.end})`, () => {
      const q = `startDate=${per.start}&endDate=${per.end}`
      let chKpis: any, chPerf: any[], bodGroup: any[], bodChan: any[], bodReport: any, b2cKpis: any[], b2bKpis: any[], staff: any[]

      beforeAll(async () => {
        // Tuần tự theo cụm nhỏ: gohub_dw pool max=3, gọi dồn dập dễ timeout.
        chKpis = await api(`/api/analytics/channels/kpis?${q}`)
        chPerf = await api(`/api/analytics/channels/performance?${q}`)
        bodGroup = await api(`/api/analytics/bod-group-margin?${q}`)
        bodChan = await api(`/api/analytics/bod-channel-performance?${q}`)
        bodReport = await api(`/api/analytics/bod-report?${q}`)
        b2cKpis = await api(`/api/analytics/b2c/kpis?${q}`)
        b2bKpis = await api(`/api/analytics/b2b/kpis?${q}`)
        staff = await api(`/api/analytics/staff-report?${q}`)
      }, 300_000)

      it("Channels: thẻ KPI = Σ bảng Performance (doanh thu, lãi gộp, CM1)", () => {
        close(chKpis.revenue, sum(chPerf, "revenue"), "doanh thu")
        close(chKpis.margin, sum(chPerf, "margin"), "lãi gộp")
        close(chKpis.cm1, sum(chPerf, "gpm2"), "CM1")
      })

      it("Channels = BOD (tổng theo nhóm): doanh thu, lãi gộp, CM1", () => {
        close(chKpis.revenue, sum(bodGroup, "revenue"), "doanh thu")
        close(chKpis.margin, sum(bodGroup, "margin"), "lãi gộp")
        close(chKpis.cm1, sum(bodGroup, "gpm2"), "CM1")
      })

      it("BOD: Σ bảng kênh = Total theo nhóm (doanh thu, lãi gộp, CM1 — đã chia chi phí nhóm)", () => {
        close(sum(bodChan, "revenue"), sum(bodGroup, "revenue"), "doanh thu")
        close(sum(bodChan, "margin"), sum(bodGroup, "margin"), "lãi gộp")
        close(sum(bodChan, "gpm2"), sum(bodGroup, "gpm2"), "CM1")
      })

      it("BOD: biểu đồ ngày (bod-report) cộng lại = doanh thu theo nhóm", () => {
        const daily: any[] = Array.isArray(bodReport) ? bodReport : (bodReport.daily || bodReport.data || bodReport.report || [])
        expect(daily.length, "bod-report không có dòng ngày").toBeGreaterThan(0)
        close(sum(daily, "revenue"), sum(bodGroup, "revenue"), "doanh thu ngày")
      })

      it("B2C: thẻ b2c/kpis = phần B2C của Channels (doanh thu, CM1)", () => {
        const b2c = chPerf.filter(r => /B2C/i.test(r.group_name || ""))
        close(kpi(b2cKpis, "Total Revenue"), sum(b2c, "revenue"), "doanh thu B2C")
        close(kpi(b2cKpis, "CM1"), sum(b2c, "gpm2"), "CM1 B2C")
      })

      it("B2B: thẻ b2b/kpis = phần B2B của Channels (doanh thu, CM1)", () => {
        const b2b = chPerf.filter(r => /^B2B/i.test(r.group_name || ""))
        close(kpi(b2bKpis, "Total Revenue"), sum(b2b, "revenue"), "doanh thu B2B")
        close(kpi(b2bKpis, "CM1"), sum(b2b, "gpm2"), "CM1 B2B")
      })

      it("Staff Report: Σ nhân viên = tổng Channels (doanh thu, lãi gộp, CM1)", () => {
        close(sum(staff, "total_revenue"), chKpis.revenue, "doanh thu")
        close(sum(staff, "gross_profit"), chKpis.margin, "lãi gộp")
        close(sum(staff, "cm1"), chKpis.cm1, "CM1")
      })
    })
  }

  describe(`Quarter Report (${P.quarterParam}) = BOD cùng quý`, () => {
    it("doanh thu / lãi gộp / CM1 tổng công ty; B2B và B2C", async () => {
      const q = `startDate=${P.lastQuarter.start}&endDate=${P.lastQuarter.end}`
      const qr = await api(`/api/analytics/quarterly-report?${P.quarterParam}&companyCode=ALL`)
      const bod = await api(`/api/analytics/bod-group-margin?${q}`)
      const t = qr.quarterTotal
      close(t.revenue, sum(bod, "revenue"), "doanh thu")
      close(t.gp, sum(bod, "margin"), "lãi gộp")
      close(t.cm1, sum(bod, "gpm2"), "CM1")
      const b2bBod = bod.filter((g: any) => /^B2B/.test(g.group))
      const b2cBod = bod.filter((g: any) => g.group === "B2C")
      close(t.b2b.revenue, sum(b2bBod, "revenue"), "doanh thu B2B")
      close(t.b2b.cm1, sum(b2bBod, "gpm2"), "CM1 B2B")
      close(t.b2c.revenue, sum(b2cBod, "revenue"), "doanh thu B2C")
      close(t.b2c.cm1, sum(b2cBod, "gpm2"), "CM1 B2C")
    }, 300_000)
  })

  describe("Dashboard (monthly-kpis) = Channels khi cùng gồm phí ship", () => {
    // monthly-kpis (Dashboard) gồm phí ship; Channels mặc định loại ship → so với includeShip=1.
    it("doanh thu / lãi gộp / CM1 theo tháng, cộng cả kỳ", async () => {
      const q = `startDate=${P.lastQuarter.start}&endDate=${P.lastQuarter.end}`
      const mk = await api(`/api/analytics/monthly-kpis?companyCode=ALL&dateColumn=fulfiled_date&${q}`)
      const ch = await api(`/api/analytics/channels/kpis?${q}&includeShip=1`)
      close(sum(mk.summary, "actualRevenue"), ch.revenue, "doanh thu")
      close(sum(mk.summary, "actualGrossMargin"), ch.margin, "lãi gộp")
      close(sum(mk.summary, "actualCm1"), ch.cm1, "CM1")
    }, 300_000)
  })
  describe("Chế độ Created không được lỗi 500", () => {
    // Từng lỗi: SUM(f.0) → 500 ở 13 route khi dateColumn=created_date (F-01).
    const routes = [
      "channels/performance", "channels/kpis", "channels/trend", "bod-summary", "bod-group-margin",
      "bod-channel-performance", "bod-report", "b2b/kpis", "b2b/performance", "b2b/trend",
      "b2c/kpis", "b2c/performance", "b2c/trend", "b2b/tier-performance", "b2b/strategic-performance",
    ]
    for (const r of routes) {
      it(r, async () => {
        const q = `startDate=${P.lastQuarter.start}&endDate=${P.lastQuarter.end}&dateColumn=created_date`
        await api(`/api/analytics/${r}?${q}`)
      }, 120_000)
    }
    it("monthly-kpis", async () => {
      await api(`/api/analytics/monthly-kpis?companyCode=ALL&dateColumn=created_date&startDate=${P.lastQuarter.start}&endDate=${P.lastQuarter.end}`)
    }, 120_000)
  })
})
