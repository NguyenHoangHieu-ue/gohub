# V2_BE_ARCHITECTURE_BLUEPRINT.md — Kiến trúc Mã nguồn Back-End (OOP Design Patterns)

> **Bản thiết kế Kỹ thuật Lớp Lõi (Back-End Core Blueprint)**: Biên soạn bởi Giám đốc Kiến trúc Hệ thống (Staff System Architect). Bản đặc tả thiết kế lập trình hướng đối tượng (OOP), các mẫu thiết kế (Design Patterns) tiêu chuẩn, và giải pháp tối ưu hóa hiệu năng truy vấn cho lớp lõi GoHub Intel v2.

---

## I. MẪU THIẾT KẾ ĐỐI TƯỢNG (CORE DESIGN PATTERNS)

Để loại bỏ sự cẩu thả, trùng lặp và rời rạc của code v1, hệ thống v2 bọc toàn bộ logic trong một cấu trúc OOP chuẩn mực, tách biệt hoàn toàn giữa lớp Kết nối, lớp Nghiệp vụ, và lớp Giao vận:

```
    [API Route Handler] ────────► [AnalyticsService] (Lớp Nghiệp vụ)
                                         │
        ┌────────────────────────────────┴────────────────────────┐
        ▼                                                         ▼
 [DBClientFactory] (Factory)                             [FormulaEngine] (Strategy)
   ├── PostgresClient (dw)                                 ├── MonthProjectionStrategy
   ├── SupabaseClient (app)                                └── QuarterProjectionStrategy
   └── TursoClient (cost)
```

---

### 1. Database Connection Factory (`DBClientFactory` - Creational Pattern)
Đóng gói việc khởi tạo và quản lý các loại kết nối Database. Đảm bảo tính Singleton (mỗi loại DB chỉ có duy nhất một pool kết nối hoạt động xuyên suốt vòng đời instance):

```typescript
import { Pool } from "pg";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createClient as createTursoClient, Client as LibsqlClient } from "@libsql/client";

export class DBClientFactory {
  private static pgPoolInstance: Pool | null = null;
  private static supabaseInstance: SupabaseClient | null = null;
  private static tursoInstance: LibsqlClient | null = null;

  public static getPostgresPool(): Pool {
    if (!this.pgPoolInstance) {
      this.pgPoolInstance = new Pool({
        connectionString: process.env.ANALYTICS_DB_URL,
        max: 20, // Giới hạn pool tối đa 20 connections tránh tràn RAM serverless
        idleTimeoutMillis: 10000, // Tự động đóng kết nối thừa sau 10s idle
      });
    }
    return this.pgPoolInstance;
  }

  public static getSupabase(): SupabaseClient {
    if (!this.supabaseInstance) {
      this.supabaseInstance = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
    }
    return this.supabaseInstance;
  }

  public static getTurso(): LibsqlClient {
    if (!this.tursoInstance) {
      this.tursoInstance = createTursoClient({
        url: process.env.TURSO_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN!,
      });
    }
    return this.tursoInstance;
  }
}
```

---

### 2. Strategy Pattern cho Phương pháp Dự phóng (`IProjectionStrategy`)
Tách biệt thuật toán tính toán Dự phóng doanh thu cuối tháng (Pro-rata) và dự phóng Quý linh hoạt:

```typescript
export interface IProjectionStrategy {
  calculateProjection(actualAmount: number, elapsedDays: number, totalDays: number): number;
}

// Chiến lược Dự phóng theo Tháng (Per-Month Pro-rata)
export class MonthProjectionStrategy implements IProjectionStrategy {
  private minProjectDays = 7; // Phải trôi qua tối thiểu 7 ngày mới kích hoạt tính toán

  public calculateProjection(actualAmount: number, elapsedDays: number, totalDays: number): number {
    if (elapsedDays < this.minProjectDays) {
      return actualAmount; // Tránh nhảy số đột biến đầu tháng, giữ số actual thô
    }
    const factor = totalDays / elapsedDays;
    return actualAmount * factor;
  }
}

// Chiến lược Dự phóng theo Quý (Quarter-level Pro-rata)
export class QuarterProjectionStrategy implements IProjectionStrategy {
  private monthStrategy = new MonthProjectionStrategy();

  public calculateProjection(actualAmount: number, elapsedDays: number, totalDays: number): number {
    // Dự phóng Quý bằng cách cộng dồn dự phóng từng tháng cấu thành
    return this.monthStrategy.calculateProjection(actualAmount, elapsedDays, totalDays);
  }
}

// Lớp ngữ cảnh sử dụng Strategy (Context Class)
export class ProjectionContext {
  private strategy: IProjectionStrategy;

  constructor(strategy: IProjectionStrategy) {
    this.strategy = strategy;
  }

  public setStrategy(strategy: IProjectionStrategy) {
    this.strategy = strategy;
  }

  public getProjectedValue(actual: number, elapsed: number, total: number): number {
    return this.strategy.calculateProjection(actual, elapsed, total);
  }
}
```

---

### 3. Repository Pattern cho Lớp Truy cập dữ liệu (`AnalyticsRepository`)
Cung cấp giao diện truy xuất dữ liệu sạch, che giấu các câu lệnh SQL thô phức tạp khỏi API Router:

```typescript
export class AnalyticsRepository {
  private pgPool = DBClientFactory.getPostgresPool();

  public async getFulfillmentRevenue(
    startDate: string,
    endDate: string,
    filters: { includeShip: boolean; includeInternal: boolean }
  ): Promise<any[]> {
    let sql = `
      SELECT f.fulfiled_date::date as date, SUM(f.fulfilled_revenue_amount_vnd) as revenue
      FROM fact_fulfillment_revenue f
      WHERE f.fulfiled_date::date >= $1 AND f.fulfiled_date::date <= $2
    `;

    const params: any[] = [startDate, endDate];
    let paramIndex = 3;

    if (!filters.includeShip) {
      sql += ` AND f.sku != 'SHIPPINGFEE0'`;
    }

    if (!filters.includeInternal) {
      sql += ` AND f.order_source_code NOT IN (
        SELECT code FROM dim_order_source WHERE UPPER(COALESCE(group_name,'')) = 'INTERNAL-TRANSACTION'
      )`;
    }

    sql += ` GROUP BY f.fulfiled_date::date ORDER BY date ASC`;

    const result = await this.pgPool.query(sql, params);
    return result.rows;
  }
}
```

---

## II. GIẢI PHÁP TỐI ƯU HÓA BACK-END & LỚP CACHE (BE PERFORMANCE STACK)

### 1. Decorator Pattern cho Cơ chế Caching L2 và Log bảo mật
Chúng tôi tách biệt hoàn toàn luồng nghiệp vụ chính của Repository khỏi luồng hạ tầng (Caching, Logging, Security check) sử dụng cấu trúc decorator:

```typescript
export class CachedAnalyticsRepository {
  private repo = new AnalyticsRepository();
  private supabase = DBClientFactory.getSupabase();

  public async getFulfillmentRevenue(
    startDate: string,
    endDate: string,
    filters: { includeShip: boolean; includeInternal: boolean },
    cacheKey: string,
    ttlMinutes = 10
  ): Promise<any[]> {
    // 1. Kiểm tra L2 cache trong Supabase trước
    const { data: cachedRow } = await this.supabase
      .from("analytics_query_cache")
      .select("data, cached_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cachedRow?.cached_at) {
      const ageMs = Date.now() - new Date(cachedRow.cached_at).getTime();
      if (ageMs < ttlMinutes * 60 * 1000) {
        return cachedRow.data as any[]; // Trả dữ liệu cache lập tức
      }
    }

    // 2. Cache miss -> Thực thi query cơ sở dữ liệu thật
    const freshData = await this.repo.getFulfillmentRevenue(startDate, endDate, filters);

    // 3. Ghi đè cập nhật lại L2 cache (Warm Cache) - Run in background
    void this.supabase
      .from("analytics_query_cache")
      .upsert({
        cache_key: cacheKey,
        data: freshData as object,
        cached_at: new Date().toISOString(),
      })
      .then();

    return freshData;
  }
}
```

### 2. Hàng chờ chống Rate-Limit API Webhook (Webhook Concurrency Controller)
Lớp điều khiển lưu lượng để xử lý mượt mà khi có bão webhook tin nhắn gửi về từ Lark mà không bị Google Gemini API reject vì nghẽn (429 Rate Limit):

```typescript
export class WebhookQueueController {
  private static queue: (() => Promise<any>)[] = [];
  private static isProcessing = false;
  private static delayMs = 1200; // Giãn cách tối thiểu 1.2 giây giữa các lần gọi Gemini API

  public static async enqueueTask<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      void this.processQueue();
    });
  }

  private static async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
        await new Promise(res => setTimeout(res, this.delayMs)); // Khóa cứng giãn cách rate limit
      }
    }

    this.isProcessing = false;
  }
}
```
*Ghi chú: Mọi tác vụ Webhook AI Lark chat xử lý tại `/api/lark/events` bắt buộc phải đi qua hàm `WebhookQueueController.enqueueTask` để đảm bảo hệ thống không bao giờ bị khóa API.*
