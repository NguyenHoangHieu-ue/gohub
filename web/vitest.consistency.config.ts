import { defineConfig } from "vitest/config"
import path from "path"

// Config RIÊNG cho test SO CẶP TAB (gọi API staging/production thật, cần CRON_SECRET) — không nằm trong suite unit `npm test`.
// Chạy: npm run test:consistency   (đổi môi trường: CONSISTENCY_BASE_URL=https://intel-v2.gohub.cloud)
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__e2e__/tab-consistency.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
