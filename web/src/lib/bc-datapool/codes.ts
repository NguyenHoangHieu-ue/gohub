import type { DataUnit, PlanKind, Pool, SimType } from "./types"

export const VENDOR_CODE: Record<Pool, string> = { CMHK: "WD", SINGTEL: "W1" }
export const POLICY_CODE: Record<PlanKind, string> = { Daily: "T", Fixed: "F", Unlimited: "X" }

/** Ký tự 1 mã SKU/Product: US = E (US Datapool), VN = 3 (VN Monthly Invoice Internal GHI) — theo file mẫu. */
export const TENANT_CHAR = { US: "E", VN: "3" } as const
export const PRODUCT_TYPE_CHAR: Record<SimType, string> = { eSIM: "C", SIM: "E" }

export function productCode(tenant: "US" | "VN", sim: SimType, country3: string, pool: Pool, kind: PlanKind): string {
  return `${TENANT_CHAR[tenant]}${PRODUCT_TYPE_CHAR[sim]}${country3}${VENDOR_CODE[pool]}${POLICY_CODE[kind]}`
}

/** 3 ký tự dung lượng: 500MB→5HM, 1.5GB→1D5, 5GB→005. Trả null nếu không mã hoá được. */
export function dataCode(amount: number, unit: DataUnit): string | null {
  if (!(amount > 0)) return null
  if (unit === "MB") {
    if (amount % 100 !== 0) return null
    const n = amount / 100
    return n >= 1 && n <= 9 ? `${n}HM` : null
  }
  if (Number.isInteger(amount)) return amount <= 999 ? String(amount).padStart(3, "0") : null
  const tenths = Math.round(amount * 10)
  if (Math.abs(tenths - amount * 10) > 1e-9) return null
  const whole = Math.floor(tenths / 10)
  return whole <= 9 ? `${whole}D${tenths % 10}` : null
}

export const dayCode = (days: number): string | null =>
  Number.isInteger(days) && days >= 1 && days <= 99 ? String(days).padStart(2, "0") : null

export function skuCode(productCodeStr: string, amount: number, unit: DataUnit, days: number): string | null {
  const d = dataCode(amount, unit)
  const n = dayCode(days)
  return d && n ? `${productCodeStr}${d}${n}` : null
}
