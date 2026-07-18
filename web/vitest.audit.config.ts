import { defineConfig } from "vitest/config"
import path from "path"

// Config RIÊNG cho harness AUDIT + GRADE agent (introspect DB thật + LLM-judge).
// Chạy: npx vitest run --config vitest.audit.config.ts
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/__e2e__/agent-audit.test.ts", "src/__e2e__/agent-grade.test.ts", "src/__e2e__/chatbot-routing.test.ts"],
    setupFiles: ["./src/__e2e__/replay-setup.ts"],
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
