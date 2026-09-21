import { runPerfProbe } from "@/lib/perf-probe"

export const dynamic = "force-dynamic"

export async function GET() { return runPerfProbe() }
