/** Cờ `argon_core_loop`: "1" = bật mọi nơi · "preview" = chỉ bản không phải production (staging chạy thử trước, production vẫn vòng lặp cũ) · khác = tắt. Thuần. */
export function flagValueOn(value: unknown, vercelEnv = process.env.VERCEL_ENV): boolean {
  return value === "1" || (value === "preview" && vercelEnv !== "production")
}
