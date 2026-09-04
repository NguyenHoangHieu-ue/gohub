export const COUNTABLE_LEAD_STATUSES = [
  "New Lead",
  "New Lead EC",
  "Sales Consulting",
  "Waiting Payment",
  "Need Sales Follow-up",
  "Purchased",
] as const;

export function grossProfit(revenue: number, cogs: number): number {
  return revenue - cogs;
}

export function grossProfitMargin(revenue: number, cogs: number): number {
  if (revenue === 0) return 0;
  return (grossProfit(revenue, cogs) / revenue) * 100;
}

export function contributionMargin1(grossProfitAmount: number, opCost: number): number {
  return grossProfitAmount - opCost;
}

export function contributionMargin1Pct(cm1: number, revenue: number): number {
  if (revenue === 0) return 0;
  return (cm1 / revenue) * 100;
}

export function threeHkContributionPct(revenue3hk: number, totalRevenue: number): number {
  if (totalRevenue === 0) return 0;
  return (revenue3hk / totalRevenue) * 100;
}

/**
 * Phân bổ chi phí cấp nhóm kênh (Group Cost) xuống một phần tử con theo tỷ
 * trọng doanh thu, tránh cộng trùng 2 lần.
 */
export function allocateGroupCost(
  totalGroupCost: number,
  revenueOfEntity: number,
  totalRevenueOfGroup: number
): number {
  if (totalRevenueOfGroup === 0) return 0;
  return totalGroupCost * (revenueOfEntity / totalRevenueOfGroup);
}

export function cac(totalMarketingSpend: number, newCustomers: number): number {
  if (newCustomers === 0) return 0;
  return totalMarketingSpend / newCustomers;
}

export function roas(retailRevenue: number, totalMarketingSpend: number): number {
  if (totalMarketingSpend === 0) return 0;
  return retailRevenue / totalMarketingSpend;
}

export function cpl(totalMarketingSpend: number, totalLeads: number): number {
  if (totalLeads === 0) return 0;
  return totalMarketingSpend / totalLeads;
}

export function spendPace(actualSpend: number, approvedBudget: number): number {
  if (approvedBudget === 0) return 0;
  return (actualSpend / approvedBudget) * 100;
}

export function conversionRate(completedOrders: number, sessions: number): number {
  if (sessions === 0) return 0;
  return (completedOrders / sessions) * 100;
}
