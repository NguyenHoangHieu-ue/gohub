import { runPerfProbe } from "@/lib/perf-probe"

export const dynamic = "force-dynamic"
// Bản thử vùng Singapore để so với perf-probe (mặc định iad1) — quyết định có đổi vùng chạy function không.
export const preferredRegion = "sin1"

export async function GET() { return runPerfProbe() }
