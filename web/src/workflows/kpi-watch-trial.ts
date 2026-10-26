import { sleep } from "workflow"

// THỬ NGHIỆM (nhánh exp/wdk-trial): workflow bền cho luồng "KPI lệch kế hoạch" — mỗi bước thử lại được, có thể ngủ giữa chừng.
async function checkStep(username: string, origin: string) {
  "use step"
  const { runKpiWatch } = await import("@/lib/argon/kpi-watch")
  return runKpiWatch(username, origin)
}

async function notifyStep(summary: string) {
  "use step"
  return `ok: ${summary}`
}

export async function kpiWatchWorkflow(username: string, origin: string) {
  "use workflow"
  const r = await checkStep(username, origin)
  await sleep("5s")   // minh hoạ: ngủ không tốn compute
  return notifyStep(JSON.stringify(r))
}
