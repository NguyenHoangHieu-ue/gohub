import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import * as XLSX from "xlsx"

function generateTemplate(): Buffer {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Goi co san (Ready-made packages) ──────────────────────────────
  const s1Headers = [
    "vendor_code", "vendor_id", "product_name", "region",
    "sim_type", "days", "data_gb", "is_daily", "is_unlimited", "throttle_mbps",
    "cost_price", "currency", "apn", "network_type", "is_kyc", "is_lesim", "notes",
  ]
  const s1Guide = [
    "WM / BC / SS / VT / TM",
    "ID gốc của vendor",
    "Tên sản phẩm đầy đủ",
    "Khu vực / nước",
    "eSIM / SIM / Top-Up SIM",
    "Số ngày",
    "GB (để trống nếu unlimited)",
    "Y / N — daily cap?",
    "Y / N — unlimited?",
    "Mbps sau giới hạn (để trống = không giới hạn tốc độ)",
    "Giá mua",
    "TWD / USD / HKD / SGD / JPY / EUR / AUD",
    "APN setting string",
    "4G/LTE / 5G / 3G",
    "Y / N — KYC?",
    "Y / N — leSIM / QR?",
    "Ghi chú thêm",
  ]
  const s1Ex = [
    ["WM", "WM-e-JP-2GB-30D",  "Japan 30 Days 2GB/day 5Mbps",  "Japan",  "eSIM", 30,  2,   "Y", "N", 5,   250,  "TWD", "jp.co.ntt.docomo.mopera", "4G/LTE", "N", "N", ""],
    ["WM", "WM-e-KR-10GB-7D",  "Korea 7 Days 10GB",             "Korea",  "eSIM", 7,   10,  "N", "N", "",  120,  "TWD", "",                       "4G/LTE", "N", "N", ""],
    ["WM", "WM-e-TW-UNLIM-30D","Taiwan 30 Days Unlimited 5Mbps","Taiwan", "eSIM", 30,  "",  "Y", "Y", 5,   180,  "TWD", "",                       "4G/LTE", "N", "N", ""],
    ["BC", "BC-EU-3GB-30D",    "Europe 30 Days 3GB",            "Europe", "eSIM", 30,  3,   "N", "N", "",  5.5,  "USD", "",                       "4G/LTE", "N", "N", ""],
  ]

  const ws1 = XLSX.utils.aoa_to_sheet([s1Headers, s1Guide, ...s1Ex])
  ws1["!cols"] = [
    { wch: 12 }, { wch: 22 }, { wch: 38 }, { wch: 14 },
    { wch: 14 }, { wch: 6 },  { wch: 8 },  { wch: 9 },  { wch: 12 }, { wch: 14 },
    { wch: 11 }, { wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 7 },  { wch: 8 },  { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, "Goi co san")

  // ── Sheet 2: Datapool ──────────────────────────────────────────────────────
  const s2Headers = [
    "vendor_code", "zone_id", "zone_name", "countries",
    "sim_type", "price_per_gb", "currency", "network_type", "is_kyc", "notes",
  ]
  const s2Guide = [
    "3HK / WM / ...",
    "ID zone (unique trong vendor)",
    "Tên zone hiển thị",
    "Danh sách nước, ngăn bằng dấu phẩy",
    "eSIM / SIM",
    "Giá mua mỗi GB",
    "HKD / USD / ...",
    "4G/LTE / 5G",
    "Y / N",
    "Ghi chú",
  ]
  const s2Ex = [
    ["3HK", "A",  "Asia Standard",  "Japan, Korea, Taiwan, Hong Kong, Singapore, Thailand, Malaysia", "eSIM", 5,   "HKD", "4G/LTE", "N", ""],
    ["3HK", "E1", "Europe Zone 1",  "UK, France, Germany, Italy, Spain, Netherlands, Switzerland",    "eSIM", 7,   "HKD", "4G/LTE", "N", ""],
    ["3HK", "AU", "Australia & NZ", "Australia, New Zealand",                                          "eSIM", 6.5, "HKD", "4G/LTE", "N", ""],
  ]

  const ws2 = XLSX.utils.aoa_to_sheet([s2Headers, s2Guide, ...s2Ex])
  ws2["!cols"] = [
    { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 60 },
    { wch: 10 }, { wch: 13 }, { wch: 10 }, { wch: 12 }, { wch: 7 }, { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, "Datapool")

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const buf = generateTemplate()
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="GoHub_NCC_Template.xlsx"`,
    },
  })
}
