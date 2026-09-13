// Giá gemini-3.8-flash — verify trực tiếp ai.google.dev/gemini-api/docs/pricing (2026-09-13, không đoán):
// $0.75/1M token input · $3.75/1M token output (bao gồm thinking tokens) — áp dụng tới 2026-12-31.
// Từ 2027-01-01 tăng lên $1.5/$7.5 — nhớ cập nhật 2 hằng số dưới nếu còn dùng model này sau mốc đó.
export const GEMINI_FLASH_PRICE_PER_1M_USD = { input: 0.75, output: 3.75 }

export function estimateCostUsd(tokensIn: number, tokensOut: number): number {
  const cost = (tokensIn / 1_000_000) * GEMINI_FLASH_PRICE_PER_1M_USD.input
             + (tokensOut / 1_000_000) * GEMINI_FLASH_PRICE_PER_1M_USD.output
  return Math.round(cost * 10_000) / 10_000
}
