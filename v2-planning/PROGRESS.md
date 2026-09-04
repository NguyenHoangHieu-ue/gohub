# GoHub Intel v2 — Nhật ký tiến độ rebuild

> File này ghi lại đã làm gì, quyết định gì, còn thiếu gì — đọc file này trước khi tiếp
> tục bất kỳ session nào về v2. Spec đầy đủ nằm ở các file `V2_*.md`/`ARCHITECTURE.md`/
> `FORMULAS.md`/`ANALYTICS_TABS_SPEC.md` cùng thư mục — file này chỉ log trạng thái build,
> không lặp lại nội dung spec.

---

## Trạng thái hiện tại (2026-09-04)

| | |
|---|---|
| Vị trí | `D:\Gohub_v2` — đây là repo git thật của v2, **KHÔNG** phải worktree tách từ `D:\gohub` |
| Branch | `master` (repo mới `git init`, chưa commit) |
| Code v2 | nằm ngay **root** repo (không có subfolder `v2/`) — không có cây v1 nào cần né trong repo này |
| Blueprint (13 file) | `v2-planning/*.md` cùng cấp root, giữ nguyên tại chỗ (không di chuyển) |
| Phase 0 | ✅ **XONG** — chưa commit (xem mục "Còn lại" bên dưới) |
| Phase 1+ | ⏳ Chưa bắt đầu |

## Lịch sử reset (đừng lặp lại nhầm lẫn này)

Session trước đã hiểu sai "làm lại từ đầu" thành tách git worktree riêng
(`D:\gohub-v2`, branch `v2-rebuild` trong repo `D:\gohub`) giống cấu trúc cũ đã mất. Hiếu
chỉnh lại: **không cần worktree/branch trong repo v1, làm thẳng tại `D:\Gohub_v2`** (thư
mục làm việc hiện tại, độc lập hoàn toàn với `D:\gohub`). Đã dọn sạch worktree/branch tạo
nhầm (`git worktree remove`, `git branch -D v2-rebuild` tại `D:\gohub`), rồi `git init` ngay
tại `D:\Gohub_v2` và scaffold từ đây.

## Đã làm — Phase 0 (Bootstrap hạ tầng)

- **Scaffold**: `create-next-app@14` sạch tại root (App Router, TypeScript strict, Tailwind,
  ESLint, import alias `@/*` → `./src/*`). Scaffold vào thư mục tạm trước (npm cấm tên
  package có chữ hoa, trùng tên thư mục `Gohub_v2`) rồi move file vào root, đổi
  `package.json` name → `gohub-intel-v2`.
- **`src/core/db/index.ts`** — `DBClientFactory` (Singleton): Postgres pool cho gohub_dw
  (`ANALYTICS_DB_URL`, SSL conditional theo `ANALYTICS_DB_SSL_CA`), Supabase client
  (`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`), Turso client
  (`TURSO_URL`/`TURSO_AUTH_TOKEN`). Throw rõ ràng nếu thiếu env, không fallback hardcode.
- **`src/core/filters/index.ts`** — `QueryFilterBuilder`: gói cả 4 filter chuẩn s132
  (`shipFilter`, `internalOpsFilter` 2 biến thể JOIN/subquery, `excludeOpsByCode`,
  `excludeInactiveCustomers`) thành 1 class, tự quản `$N` param index. Có sẵn
  `vendorIs3HkDatapoolSQL()` xử lý gotcha `'3HK DATAPOOL'` (dấu cách trong DB thật).
- **`src/core/formulas/`**:
  - `financial.ts` — GP/GPM%/CM1/CM1%/3HK%/allocateGroupCost (theo tỷ trọng doanh thu)/
    CAC/ROAS/CPL/Spend Pace/CR + `COUNTABLE_LEAD_STATUSES`.
  - `fx.ts` — hệ số GB thực tế 3HK (fixed/daily/unlimited 10-5 Mbps) + zone pricing +
    `threeHkCogsVnd()` quy đổi HKD→USD→VND.
  - `projection.ts` — Strategy pattern: `MonthProjectionStrategy` (gated, min 7 ngày),
    `UngatedProjectionStrategy` (không gate — dùng riêng cho KPI/PR per-customer, né bug v1
    s182 "nhầm loại factor"), `QuarterProjectionStrategy`, `buildQuarterMonthMeta()`.
  - `pareto.ts` — `classifyPareto80()` dùng chung cho Products tab + My Metrics SKU-scan,
    `weightedDeltaGrossMargin()`.
  - `sku-geo.ts` — `getDestinationSQL()` (SQL) + `decodeSkuDestination()` (JS mirror).
  - Test: `financial.test.ts` (4 test) + `projection.test.ts` (5 test) — **9/9 PASS**.
- **`src/core/cache/index.ts`** — `cachedQuery()` (L1 in-memory 5 phút + L2 Supabase
  `analytics_query_cache` 12h) + `flushCacheByPrefixes()` — chỉ xoá theo prefix, không có
  hàm "xoá sạch toàn cache" nào tồn tại trong module (né cứng bug v1 s169c bằng thiết kế
  API, không phải bằng kỷ luật lúc gọi).
- **UI kit**: `components/ui/{card,button}.tsx` theo bảng màu Apple-style
  (`V2_UI_UX_BLUEPRINT.md` §I: brand `#2563eb`, brand-pro `#7c3aed`, success/warning/danger,
  thêm token vào `tailwind.config.ts`). `components/charts/smart-bar-chart.tsx` — YAxis
  width cố định 92px + `tickFormatter` ellipsis 11 ký tự + Tooltip đầy đủ (né cứng bug v1
  s176 chart lấn chữ).
- **CI**: `.github/workflows/ci-check.yml` ở root — trigger PR/push vào `staging`/`main`,
  chạy `npm ci && lint && typecheck && test`. Không cần scope `paths:` vì repo này chỉ chứa
  code v2, không có cây v1 song song.
- **Verify**: `npx tsc --noEmit` PASS, `npx next lint` PASS (0 warning/error),
  `npx vitest run` **9/9 PASS**.

## Đã làm — Phase 1 (một phần: RBAC + NextAuth/Lark OAuth khung sườn)

- **`src/core/rbac/index.ts`** — `Role` = **7 giá trị thật** `admin | creator | bod | staff |
  b2c | saleb2c | hr` (Hiếu chốt giữ nguyên role legacy v1, KHÔNG co về model 4-role của
  blueprint gốc). `ROLE_PERMISSIONS` tĩnh suy luận theo ý nghĩa từng role — `admin`/
  `creator`/`staff` chắc chắn (tên khớp định nghĩa gốc), còn `bod` (xem COGS, không sửa
  config — đúng mục đích BOD Report), `b2c`/`saleb2c`/`hr` (không thấy COGS, không sửa
  config) là suy đoán an toàn **chưa được Hiếu duyệt từng dòng**, cần xác nhận lại khi có
  người dùng role đó test thật. Role lạ ngoài 7 giá trị này fallback least-privilege qua
  `permissionsFor()` thay vì crash. `getFreshRole(username)` đọc role **tươi từ DB** mỗi lần
  (không tin JWT cũ — bake lesson v1 s165), `canWrite()`/`canSeeCogs()`,
  `analyticsGuard(req, sessionUser, opts)` cho API route, `stripCogsFields()` lột cột
  COGS/GP/GPM khỏi response cho role không có `canSeeCogs`.
  Test: `index.test.ts` (6 test — cover đủ 7 role + role lạ + stripCogsFields) — **6/6 PASS**.
- **`src/lib/lark.ts`** — `exchangeLarkCode()`, `getLarkUserInfo()` (gọi riêng
  `/authen/v1/user_info` lấy `open_id` — né bug v1 s175 open_id undefined),
  `verifyLarkSignature()` (SHA256 thường + `LARK_ENCRYPT_KEY`, ĐÚNG spec — né bug v1 s159→
  s176 dùng nhầm HMAC + VERIFICATION_TOKEN).
- **`src/lib/auth.ts`** — NextAuth config, provider Lark viết tay (không có provider dựng
  sẵn), JWT session strategy, `session.user.username`/`role` (không dùng `email` — né bug
  v1 s163 identity collision).
- **`src/app/api/auth/[...nextauth]/route.ts`** — handler chuẩn App Router.
- **`src/types/next-auth.d.ts`** — module augmentation `Session.user.{username, role}`.
- **Đã đọc schema thật từ Supabase** (qua PostgREST OpenAPI spec + query trực tiếp, dùng
  `SUPABASE_SERVICE_ROLE_KEY` trong `.env.local`) — không đoán nữa:
  - Bảng đúng tên là **`users`** (không phải `app_users` như đoán ban đầu, đã sửa lại trong
    `auth.ts`/`rbac/index.ts`). Cột: `username` (PK, dạng `"lark_ou_..."`), `name`, `email`
    (44/45 hàng `NULL`), `role`, `password`, `lark_open_id`, `department`,
    `allowed_analytics`, `allowed_tabs`, `created_at`/`updated_at`.
  - `users.role` thật có **7 giá trị**: `bod` (19), `staff` (18), `admin` (4), `b2c` (1),
    `saleb2c` (1), `creator` (1), `hr` (1) — lệch với model 4-role mô tả ở `ARCHITECTURE.md`
    §III. **Hiếu đã chốt: giữ nguyên 7 role thật**, không co về 4-role blueprint. Đã cập
    nhật `Role` type + `ROLE_PERMISSIONS` trong `rbac/index.ts` theo quyết định này (xem
    chi tiết mục Phase 1 phía trên).
  - Xác nhận đúng bug v1 s163 bằng dữ liệu thật: 44/45 user có `email = NULL`, đúng mô tả
    "43 tài khoản Lark OAuth không có email" trong `V2_ERRORS_MEM.md` mục 4 — càng khẳng
    định quyết định dùng `username` làm định danh duy nhất là đúng.
  - 79 bảng/view khác đang tồn tại trong Supabase project này (nhiều hơn 13 file blueprint
    liệt kê) — chưa audit hết, sẽ đọc thêm khi build từng tab chạm tới.
- **`vitest.config.ts`** — thêm resolve alias `@` → `./src` (vitest không tự đọc
  `tsconfig.json` paths, thiếu file này thì mọi test import `@/core/...` fail load module).
- **Verify**: `npx tsc --noEmit` PASS, `npx next lint` PASS, `npx vitest run` **15/15 PASS**
  (9 formulas + 6 rbac), `npx next build` PASS (route `/api/auth/[...nextauth]` build ra
  dynamic function, 0 lỗi).

## Còn lại trước khi coi Phase 0 xong hẳn

- **Chưa có commit nào** — repo mới `git init`, toàn bộ ở trạng thái untracked. Cần Hiếu xác
  nhận trước khi commit lần đầu (chọn file, viết message).
- **`.env.local` hiện tại thiếu/khác tên so với code cần**:
  - Có: `ADMIN_GOHUB_API_*`, `CHATWOOT_*`, `GEMINI_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXTAUTH_*`, `OMNI_*`, `SUPABASE_SERVICE_ROLE_KEY`
    (đã đổi tên từ `SUPABASE_SERVICE_KEY` cho khớp code), `TURSO_AUTH_TOKEN`, `TURSO_URL`.
  - **Thiếu hoàn toàn** (cần cho `core/db` Postgres pool): `ANALYTICS_DB_URL` (hoặc
    `ANALYTICS_DB_HOST/NAME/USER/PASSWORD/PORT` để tự dựng). Chưa cần cho Phase 0 (core +
    test không chạm DB thật) nhưng cần trước khi build tab BOD Report thật.
  - **Chưa có `LARK_*`** (APP_ID/APP_SECRET/ENCRYPT_KEY/VERIFICATION_TOKEN/CREATOR_USER_ID)
    — cần cho Phase 1 (Lark OAuth) trở đi. Nhớ né bug kinh điển #1: `LARK_ENCRYPT_KEY` và
    `LARK_VERIFICATION_TOKEN` là 2 field RIÊNG BIỆT trên Lark Developer Console, đừng điền
    trùng nhau (xem `V2_ERRORS_MEM.md` mục 1).

## Tiếp theo (Phase 1 — còn lại)

1. Điền `LARK_APP_ID`/`LARK_APP_SECRET`/`LARK_ENCRYPT_KEY`/`LARK_VERIFICATION_TOKEN`/
   `LARK_CREATOR_USER_ID` vào `.env.local` (nhớ ENCRYPT_KEY ≠ VERIFICATION_TOKEN) — cần để
   test luồng Lark OAuth end-to-end thật (bảng `users` đã có sẵn, sẵn sàng dùng ngay).
2. Điền `ANALYTICS_DB_URL` (hoặc 5 field HOST/NAME/USER/PASSWORD/PORT) — cần trước khi build
   tab BOD Report thật.
3. Build tab BOD Report đầu tiên — chạm đủ pipeline thật (gohub_dw + Turso B2B cost + CM1 +
   3HK%) để validate toàn bộ `core/` trước khi nhân rộng 26 tab còn lại.
4. Xem chi tiết 27 tab ở `ANALYTICS_TABS_SPEC.md`, AI merge ở `V2_AI_MERGE_BLUEPRINT.md`.
