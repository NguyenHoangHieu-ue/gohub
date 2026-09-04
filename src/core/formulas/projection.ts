export interface IProjectionStrategy {
  calculateProjection(actualAmount: number, elapsedDays: number, totalDays: number): number;
}

/**
 * Dự phóng Pro-rata theo tháng, có "gate" tối thiểu 7 ngày đã trôi qua để
 * tránh nhảy số đột biến đầu tháng. Dùng cho báo cáo tổng (BOD, Quarter).
 */
export class MonthProjectionStrategy implements IProjectionStrategy {
  private minProjectDays = 7;

  calculateProjection(actualAmount: number, elapsedDays: number, totalDays: number): number {
    if (elapsedDays < this.minProjectDays) {
      return actualAmount;
    }
    const factor = totalDays / elapsedDays;
    return actualAmount * factor;
  }
}

/**
 * Dự phóng KHÔNG gate (không có ngưỡng 7 ngày tối thiểu) — dùng riêng cho
 * KPI/PR theo từng khách hàng. Tách biệt khỏi bản gated để né đúng bug v1
 * s182 "nhầm loại factor" giữa 2 use-case khác nhau.
 */
export class UngatedProjectionStrategy implements IProjectionStrategy {
  calculateProjection(actualAmount: number, elapsedDays: number, totalDays: number): number {
    if (elapsedDays <= 0) return actualAmount;
    const factor = totalDays / elapsedDays;
    return actualAmount * factor;
  }
}

export class QuarterProjectionStrategy implements IProjectionStrategy {
  private monthStrategy = new MonthProjectionStrategy();

  calculateProjection(actualAmount: number, elapsedDays: number, totalDays: number): number {
    return this.monthStrategy.calculateProjection(actualAmount, elapsedDays, totalDays);
  }
}

export class ProjectionContext {
  constructor(private strategy: IProjectionStrategy) {}

  setStrategy(strategy: IProjectionStrategy): void {
    this.strategy = strategy;
  }

  getProjectedValue(actual: number, elapsed: number, total: number): number {
    return this.strategy.calculateProjection(actual, elapsed, total);
  }
}

export interface QuarterMonthMeta {
  monthIndex: number; // 1-3 trong quý
  year: number;
  month: number; // 1-12
  totalDays: number;
  elapsedDays: number;
  status: "completed" | "current" | "future";
}

/**
 * Xây danh sách 3 tháng cấu thành 1 quý kèm trạng thái/elapsed-days so với
 * ngày `asOf`, phục vụ Pro-rata Projection Engine (s135).
 */
export function buildQuarterMonthMeta(quarter: number, year: number, asOf: Date): QuarterMonthMeta[] {
  const startMonth = (quarter - 1) * 3 + 1;
  const months: QuarterMonthMeta[] = [];

  for (let i = 0; i < 3; i++) {
    const month = startMonth + i;
    const totalDays = new Date(year, month, 0).getDate();
    const isSameMonth = asOf.getFullYear() === year && asOf.getMonth() + 1 === month;
    const isPastMonth = new Date(year, month - 1, 1) < new Date(asOf.getFullYear(), asOf.getMonth(), 1);

    let status: QuarterMonthMeta["status"];
    let elapsedDays: number;

    if (isSameMonth) {
      status = "current";
      elapsedDays = asOf.getDate();
    } else if (isPastMonth) {
      status = "completed";
      elapsedDays = totalDays;
    } else {
      status = "future";
      elapsedDays = 0;
    }

    months.push({ monthIndex: i + 1, year, month, totalDays, elapsedDays, status });
  }

  return months;
}
