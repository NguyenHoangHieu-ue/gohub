export interface StandardFilterOptions {
  includeShip?: boolean;
  includeInternalOps?: boolean;
  excludedCustomerNames?: string[];
  excludeInactiveCustomers?: boolean;
}

/**
 * Gói 4 filter chuẩn s132 (shipFilter, internalOpsFilter, excludeOpsByCode,
 * excludeInactiveCustomers) thành 1 class duy nhất, tự quản $N param index.
 * Mọi query gohub_dw trong v2 phải đi qua class này.
 */
export class QueryFilterBuilder {
  private clauses: string[] = [];
  private params: unknown[] = [];
  private nextIndex: number;
  private mainAlias: string;
  private orderSourceAlias: string | null;
  private customerAlias: string | null;

  constructor(opts: {
    startParamIndex?: number;
    mainAlias?: string;
    orderSourceAlias?: string | null;
    customerAlias?: string | null;
  } = {}) {
    this.nextIndex = opts.startParamIndex ?? 1;
    this.mainAlias = opts.mainAlias ?? "f";
    this.orderSourceAlias = opts.orderSourceAlias ?? null;
    this.customerAlias = opts.customerAlias ?? null;
  }

  /** SHIPPINGFEE0 loại bỏ khi includeShip = false */
  shipFilter(includeShip: boolean): this {
    if (!includeShip) {
      this.clauses.push(`${this.mainAlias}.sku != 'SHIPPINGFEE0'`);
    }
    return this;
  }

  /**
   * Loại bỏ đơn nội bộ. Dùng subquery-by-code nếu chưa JOIN dim_order_source
   * (orderSourceAlias null), dùng group_name trực tiếp nếu đã JOIN.
   */
  internalOpsFilter(includeInternalOps: boolean): this {
    if (includeInternalOps) return this;
    if (this.orderSourceAlias) {
      this.clauses.push(
        `UPPER(COALESCE(${this.orderSourceAlias}.group_name, '')) != 'INTERNAL-TRANSACTION'`
      );
    } else {
      this.clauses.push(`${this.mainAlias}.order_source_code NOT IN (
        SELECT code FROM dim_order_source
        WHERE UPPER(COALESCE(group_name, '')) = 'INTERNAL-TRANSACTION'
      )`);
    }
    return this;
  }

  /** Loại bỏ khách hàng Ops/Test theo tên (B2B Ops, B2C Customer US/VN...) */
  excludeOpsByCode(excludedCustomerNames: string[] | undefined): this {
    if (!excludedCustomerNames || excludedCustomerNames.length === 0) return this;
    const placeholders = excludedCustomerNames.map(() => `$${this.nextIndex++}`).join(", ");
    this.params.push(...excludedCustomerNames);
    this.clauses.push(`COALESCE(TRIM(${this.mainAlias}.customer_code), '') NOT IN (
      SELECT TRIM(code) FROM dim_customer WHERE name IN (${placeholders})
    )`);
    return this;
  }

  /** Loại bỏ khách hàng có price_list_name chứa 'INACTIVE' */
  excludeInactiveCustomers(exclude: boolean): this {
    if (!exclude) return this;
    this.clauses.push(`NOT EXISTS (
      SELECT 1 FROM dim_customer ic
      WHERE TRIM(ic.code::text) = TRIM(${this.mainAlias}.customer_code)
        AND UPPER(COALESCE(ic.price_list_name, '')) LIKE '%INACTIVE%'
    )`);
    return this;
  }

  /** Áp toàn bộ 4 filter chuẩn theo StandardFilterOptions trong 1 lần gọi */
  applyStandard(opts: StandardFilterOptions): this {
    this.shipFilter(opts.includeShip ?? true);
    this.internalOpsFilter(opts.includeInternalOps ?? true);
    this.excludeOpsByCode(opts.excludedCustomerNames);
    this.excludeInactiveCustomers(opts.excludeInactiveCustomers ?? false);
    return this;
  }

  /** Vendor 3HK trong dim_sku lưu là '3HK DATAPOOL' (có dấu cách) */
  vendorIs3HkDatapoolSQL(vendorColumn = "vendor"): string {
    return `REPLACE(UPPER(${vendorColumn}), ' ', '') = '3HKDATAPOOL'`;
  }

  build(): { sql: string; params: unknown[] } {
    const sql = this.clauses.length > 0 ? this.clauses.map((c) => `AND ${c}`).join("\n") : "";
    return { sql, params: this.params };
  }

  getNextParamIndex(): number {
    return this.nextIndex;
  }
}
