export interface FxRates {
  usdVnd: number;
  hkdUsd: number;
  twdUsd: number;
}

export type ThreeHkPlanType = "fixed" | "daily" | "unlimited10mbps" | "unlimited5mbps";

export interface ThreeHkPlan {
  type: ThreeHkPlanType;
  /** Tổng GB danh nghĩa (fixed) hoặc GB/ngày (daily) */
  planGb?: number;
  days?: number;
}

export type ThreeHkZone = "asia12" | "europeUs" | "auNz";

const DEFAULT_ZONE_PRICING_HKD_PER_GB: Record<ThreeHkZone, number> = {
  asia12: 5.0,
  europeUs: 7.0,
  auNz: 6.5,
};

/** GB tiêu thụ thực tế theo hệ số mặc định của 3HK (điều chỉnh được qua Admin Panel) */
export function threeHkActualGb(
  plan: ThreeHkPlan,
  coefficients: {
    fixed: number;
    daily: number;
    unlimited10mbpsGbPerDay: number;
    unlimited5mbpsGbPerDay: number;
  } = { fixed: 0.55, daily: 0.4, unlimited10mbpsGbPerDay: 1.8, unlimited5mbpsGbPerDay: 1.6 }
): number {
  switch (plan.type) {
    case "fixed":
      return (plan.planGb ?? 0) * coefficients.fixed;
    case "daily":
      return (plan.planGb ?? 0) * (plan.days ?? 0) * coefficients.daily;
    case "unlimited10mbps":
      return coefficients.unlimited10mbpsGbPerDay * (plan.days ?? 0);
    case "unlimited5mbps":
      return coefficients.unlimited5mbpsGbPerDay * (plan.days ?? 0);
    default:
      return 0;
  }
}

export function zonePriceHkdPerGb(
  zone: ThreeHkZone,
  pricing: Record<ThreeHkZone, number> = DEFAULT_ZONE_PRICING_HKD_PER_GB
): number {
  return pricing[zone];
}

/** Giá nhập (VND) = (GB thực tế × giá vùng HKD/GB / hkdUsd) × usdVnd */
export function threeHkCogsVnd(actualGb: number, zone: ThreeHkZone, fx: FxRates): number {
  const priceHkdPerGb = zonePriceHkdPerGb(zone);
  const priceUsd = (actualGb * priceHkdPerGb) / fx.hkdUsd;
  return priceUsd * fx.usdVnd;
}
