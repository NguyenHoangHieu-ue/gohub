export interface ParetoInput {
  key: string;
  revenue: number;
}

export interface ParetoResult extends ParetoInput {
  cumulativeRevenue: number;
  cumulativePct: number;
  isKey: boolean;
}

/**
 * Sắp xếp theo doanh thu giảm dần, tính doanh thu tích lũy và đánh dấu
 * is_key = true cho các phần tử có tỷ lệ tích lũy <= 80%. Dùng chung cho
 * Products tab và My Metrics SKU-scan.
 */
export function classifyPareto80(items: ParetoInput[]): ParetoResult[] {
  const sorted = [...items].sort((a, b) => b.revenue - a.revenue);
  const totalRevenue = sorted.reduce((sum, item) => sum + item.revenue, 0);

  let cumulative = 0;
  return sorted.map((item) => {
    cumulative += item.revenue;
    const cumulativePct = totalRevenue === 0 ? 0 : (cumulative / totalRevenue) * 100;
    return {
      ...item,
      cumulativeRevenue: cumulative,
      cumulativePct,
      isKey: cumulativePct <= 80,
    };
  });
}

export interface WeightedDeltaInput {
  deltaMarginPct: number;
  revenue: number;
}

/** Weighted Delta GM = Σ(ΔMargin%_i × Revenue_i) / ΣRevenue_i */
export function weightedDeltaGrossMargin(items: WeightedDeltaInput[]): number {
  const totalRevenue = items.reduce((sum, item) => sum + item.revenue, 0);
  if (totalRevenue === 0) return 0;
  const weightedSum = items.reduce((sum, item) => sum + item.deltaMarginPct * item.revenue, 0);
  return weightedSum / totalRevenue;
}
