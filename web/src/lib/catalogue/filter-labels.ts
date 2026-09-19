// Nhãn TIẾNG ANH cho khối bộ lọc của trang nước (Hiếu yêu cầu 2026-09-19: bộ lọc dùng thuật ngữ tiếng Anh
// — Fixed / Daily / Unlimited — giống tên gọi trong hệ thống quản lý sản phẩm).

export function filterSimLabel(sim: string): string {
  if (sim === "eSIM") return "eSIM"
  if (sim === "SIM") return "SIM (physical)"
  return sim
}

export function filterSimHint(sim: string): string {
  if (sim === "eSIM") return "No plastic card — scan a QR code to install"
  if (sim === "SIM") return "Physical plastic card inserted into the phone"
  return `Type: ${sim}`
}

/** Kiểu tính dung lượng: fixed / daily (đã biết) hoặc chuỗi gốc của kiểu mới. */
export function filterDataLabel(kind: string): string {
  if (kind === "fixed") return "Fixed"
  if (kind === "daily") return "Daily"
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

export function filterDataHint(kind: string): string {
  if (kind === "fixed") return "One data allowance shared across the whole validity period"
  if (kind === "daily") return "A fresh data allowance every day"
  return `Data type: ${kind}`
}

export const UNLIMITED_LABEL = "Unlimited"
export const UNLIMITED_HINT = "Products that include unlimited-data options"
