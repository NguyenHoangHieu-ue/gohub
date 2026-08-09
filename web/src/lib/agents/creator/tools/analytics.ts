import { runGA4Report, runGSC } from "@/lib/ga4"

export async function runQueryGA4(args: any): Promise<any> {
  try {
    const report = await runGA4Report({
      siteId: args.siteId, startDate: args.startDate, endDate: args.endDate,
      metrics: args.metrics || ["sessions"], dimensions: args.dimensions, limit: args.limit || 50,
    })
    const rows = (report.rows || []).slice(0, 100).map((r: any) => ({
      dimensions: r.dimensionValues?.map((d: any) => d.value),
      metrics:    r.metricValues?.map((m: any) => m.value),
    }))
    return { rows, rowCount: report.rowCount }
  } catch (e: any) { return { error: e.message } }
}

export async function runQueryGSC(args: any): Promise<any> {
  try {
    const rows = await runGSC(args.siteId, args.startDate, args.endDate, args.dimensions || ["query"], args.rowLimit || 20)
    return { rows: rows.slice(0, 100) }
  } catch (e: any) { return { error: e.message } }
}
