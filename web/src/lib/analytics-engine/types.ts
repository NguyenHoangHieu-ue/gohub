/**
 * Shared response types — thêm vào mọi analytics route sau OOP refactor.
 * FE đọc các field này thay vì tự tính (arithmetic chỉ ở BE).
 */

/** Fields BE thêm vào response sau migrate (thêm vào, không thay thế field cũ). */
export interface AnalyticsComputedFields {
  ch_cost?: number          // customer-level CH.Cost (chỉ B2B groupBy=customer)
  cm1: number               // GP - channel_cost - group_cost [- ch_cost]
  cm1_percent: number       // cm1 / revenue × 100
  projection_factor: number // 1 = không project; >1 = MTD tháng hiện tại
}

/** Shape tối thiểu mọi analytics route cần trả (để FE không tự tính). */
export interface AnalyticsKpiResult {
  revenue: number
  margin: number
  margin_percent: number
  cm1: number
  cm1_percent: number
  projection_factor: number
}
