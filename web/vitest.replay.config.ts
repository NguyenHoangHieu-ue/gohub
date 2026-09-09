import { defineConfig } from "vitest/config"
import path from "path"

// Config RIÊNG cho harness replay chatbot (không nằm trong suite unit test thường).
// Chạy: npx vitest run --config vitest.replay.config.ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__e2e__/chatbot-replay.test.ts"],
    setupFiles: ["./src/__e2e__/replay-setup.ts"],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
