import { Type, type FunctionDeclaration } from "@google/genai"
import type { MissionPhase } from "./missions"
import type { ToolLogEntry } from "./tools"

// Sổ dự đoán: Argon GHI lại điều nó dự đoán/đề xuất kèm ngày kiểm tra và cách đo; tới hạn thì tuần tra đêm đo lại và CHẤM (đúng / gần đúng / sai, sai số %).
// Mục đích: Hiếu thấy độ tin cậy thật của Argon theo thời gian, thay vì tin hay không tin cảm tính. Lưu `app_settings.argon_forecasts:<missionId>` (không migration).
export const FORECAST_TOOL_NAME = "ghiDuDoan"
export const SCORE_TOOL_NAME = "chamDuDoan"
export const MAX_OPEN_FORECASTS = 10
const MAX_KEEP = 60, MAX_TEXT = 600, MAX_METHOD = 800, MAX_HORIZON_DAYS = 120
export const RIGHT_PCT = 5, NEAR_PCT = 15   // sai số ≤5% = đúng, ≤15% = gần đúng, hơn = sai

export const FORECAST_TOOL: FunctionDeclaration = {
  name: FORECAST_TOOL_NAME,
  description: "GHI MỘT DỰ ĐOÁN KIỂM CHỨNG ĐƯỢC của bạn vào sổ để sau này được chấm đúng/sai (vd \"nếu chuyển TH, JP, KR sang BC thì %Datapool Q4 lên khoảng 76%\"). Ghi mỗi khi bạn đưa ra ước tính/đề xuất có con số tương lai. " +
    "cachDo phải đủ để đêm tuần tra sau này đo lại KHÔNG cần bạn nhớ (số liệu nào, bằng sql hay layDuLieuHeThong, lọc gì, khoảng ngày nào). ngayKiemTra dạng YYYY-MM-DD (từ ngày mai tới 120 ngày). Chỉ ở pha chạy.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      noiDung: { type: Type.STRING, description: "Dự đoán bằng một câu rõ ràng" },
      giaTriDuKien: { type: Type.NUMBER, description: "Con số dự kiến (nếu có), cùng đơn vị với phép đo" },
      donVi: { type: Type.STRING, description: "Đơn vị, vd %, VND, đơn" },
      ngayKiemTra: { type: Type.STRING, description: "Ngày đo lại, YYYY-MM-DD" },
      cachDo: { type: Type.STRING, description: "Cách đo lại đủ chi tiết (nguồn số liệu, bộ lọc, khoảng ngày)" },
    },
    required: ["noiDung", "ngayKiemTra", "cachDo"],
  },
}
export const SCORE_TOOL: FunctionDeclaration = {
  name: SCORE_TOOL_NAME,
  description: "CHẤM một dự đoán đã đến hạn trong sổ (id lấy từ danh sách đến hạn). Đo lại bằng cachDo của dự đoán rồi gọi với giá trị thực tế. Nếu dự đoán không có con số, chọn ketLuan. Chấm trung thực, kể cả khi bạn sai.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING, description: "Mã dự đoán" },
      giaTriThucTe: { type: Type.NUMBER, description: "Con số đo được (nếu dự đoán có con số)" },
      ketLuan: { type: Type.STRING, description: "dung | gan_dung | sai — bắt buộc khi dự đoán không có con số" },
      nhanXet: { type: Type.STRING, description: "Vì sao đúng/sai, bài học (1-3 câu)" },
    },
    required: ["id"],
  },
}

export type Verdict = "dung" | "gan_dung" | "sai"
export interface Forecast {
  id: string; text: string; expected?: number; unit?: string; checkDate: string; method: string; madeAt: string
  status: "open" | "scored"; actual?: number; errorPct?: number; verdict?: Verdict; note?: string; scoredAt?: string
}

const ymd = /^\d{4}-\d{2}-\d{2}$/
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

export function normalizeForecast(args: Record<string, unknown>, today: string): { text: string; expected?: number; unit?: string; checkDate: string; method: string } | { error: string } {
  const text = String(args.noiDung ?? "").trim().slice(0, MAX_TEXT)
  const method = String(args.cachDo ?? "").trim().slice(0, MAX_METHOD)
  const checkDate = String(args.ngayKiemTra ?? "").trim()
  if (text.length < 10) return { error: "noiDung quá ngắn: nêu dự đoán rõ ràng, kiểm chứng được" }
  if (method.length < 20) return { error: "cachDo quá ngắn: nêu nguồn số liệu, bộ lọc, khoảng ngày để đêm sau đo lại được" }
  if (!ymd.test(checkDate) || Number.isNaN(Date.parse(checkDate))) return { error: "ngayKiemTra phải dạng YYYY-MM-DD" }
  const d = dayDiff(today, checkDate)
  if (d < 1) return { error: "ngayKiemTra phải từ ngày mai trở đi" }
  if (d > MAX_HORIZON_DAYS) return { error: `ngayKiemTra tối đa ${MAX_HORIZON_DAYS} ngày kể từ hôm nay` }
  const expected = typeof args.giaTriDuKien === "number" && Number.isFinite(args.giaTriDuKien) ? args.giaTriDuKien : undefined
  const unit = String(args.donVi ?? "").trim().slice(0, 20) || undefined
  return { text, expected, unit, checkDate, method }
}

export function addForecast(list: Forecast[], f: ReturnType<typeof normalizeForecast> & object, id: string, madeAt: string): { list: Forecast[] } | { error: string } {
  if ("error" in f) return f
  if (list.filter(x => x.status === "open").length >= MAX_OPEN_FORECASTS) return { error: `Đã có ${MAX_OPEN_FORECASTS} dự đoán đang chờ chấm. Chờ chấm bớt rồi mới ghi thêm.` }
  if (list.some(x => x.status === "open" && x.text.toLowerCase() === f.text.toLowerCase())) return { error: "Đã có dự đoán giống hệt đang chờ chấm." }
  return { list: [...list, { id, ...f, madeAt, status: "open" as const }].slice(-MAX_KEEP) }
}

export const dueForecasts = (list: Forecast[], today: string) => list.filter(f => f.status === "open" && f.checkDate <= today)

/** Chấm 1 dự đoán (thuần). Có cả giá trị dự kiến và thực tế → theo sai số %; không thì theo ketLuan của Argon. */
export function scoreForecast(list: Forecast[], id: string, a: { actual?: number; ketLuan?: string; note?: string }, at: string): { list: Forecast[]; forecast: Forecast } | { error: string } {
  const cur = list.find(f => f.id === id)
  if (!cur) return { error: `Không có dự đoán "${id}"` }
  if (cur.status !== "open") return { error: "Dự đoán này đã được chấm rồi" }
  let verdict: Verdict | undefined, errorPct: number | undefined
  if (cur.expected !== undefined && typeof a.actual === "number" && Number.isFinite(a.actual)) {
    const base = Math.abs(cur.expected) > 1e-9 ? Math.abs(cur.expected) : Math.max(Math.abs(a.actual), 1)
    errorPct = Math.round((Math.abs(a.actual - cur.expected) / base) * 10_000) / 100
    verdict = errorPct <= RIGHT_PCT ? "dung" : errorPct <= NEAR_PCT ? "gan_dung" : "sai"
  } else if (a.ketLuan === "dung" || a.ketLuan === "gan_dung" || a.ketLuan === "sai") verdict = a.ketLuan
  else return { error: cur.expected !== undefined ? "Cần giaTriThucTe để chấm dự đoán có con số" : "Dự đoán không có con số: cần ketLuan là dung | gan_dung | sai" }
  const next: Forecast = { ...cur, status: "scored", actual: typeof a.actual === "number" ? a.actual : undefined, errorPct, verdict, note: String(a.note ?? "").trim().slice(0, 600) || undefined, scoredAt: at }
  return { list: list.map(f => (f.id === id ? next : f)), forecast: next }
}

/** Tóm tắt độ đúng: gần đúng tính nửa điểm. */
export function summarize(list: Forecast[]): { scored: number; open: number; right: number; near: number; wrong: number; accuracyPct: number | null; avgErrorPct: number | null } {
  const sc = list.filter(f => f.status === "scored")
  const right = sc.filter(f => f.verdict === "dung").length, near = sc.filter(f => f.verdict === "gan_dung").length, wrong = sc.filter(f => f.verdict === "sai").length
  const errs = sc.map(f => f.errorPct).filter((x): x is number => typeof x === "number")
  return {
    scored: sc.length, open: list.length - sc.length, right, near, wrong,
    accuracyPct: sc.length ? Math.round(((right + near * 0.5) / sc.length) * 100) : null,
    avgErrorPct: errs.length ? Math.round((errs.reduce((n, x) => n + x, 0) / errs.length) * 100) / 100 : null,
  }
}

/** Khối thêm vào câu lệnh tuần tra khi có dự đoán đến hạn. */
export function dueBlock(due: Forecast[]): string {
  if (!due.length) return ""
  return `\n\nCHẤM DỰ ĐOÁN ĐẾN HẠN (${due.length}): với từng dự đoán dưới đây, đo lại đúng theo cachDo (sql/layDuLieuHeThong), rồi gọi chamDuDoan {id, giaTriThucTe hoặc ketLuan, nhanXet}. Chấm trung thực, kể cả khi sai; nêu bài học trong nhanXet.\n${due.map(f => `- id=${f.id} · ${f.text}${f.expected !== undefined ? ` · dự kiến ${f.expected}${f.unit ? " " + f.unit : ""}` : ""} · ghi ngày ${f.madeAt.slice(0, 10)} · hạn ${f.checkDate}\n  cách đo: ${f.method}`).join("\n")}`
}

const key = (missionId: string) => `argon_forecasts:${missionId}`
const db = async () => (await import("@/lib/supabase")).supabaseAdmin
export async function getForecasts(missionId: string): Promise<Forecast[]> {
  const { data } = await (await db()).from("app_settings").select("value").eq("key", key(missionId)).maybeSingle()
  try { return data?.value ? (JSON.parse(data.value) as Forecast[]) : [] } catch { return [] }
}
export async function saveForecasts(missionId: string, list: Forecast[]) {
  await (await db()).from("app_settings").upsert({ key: key(missionId), value: JSON.stringify(list), category: "argon", label: "Sổ dự đoán của Argon", updated_at: new Date().toISOString() }, { onConflict: "key" })
}
export const deleteForecasts = async (missionId: string) => { await (await db()).from("app_settings").delete().eq("key", key(missionId)) }
export async function missionIdsWithDueForecasts(today: string): Promise<string[]> {
  const { data } = await (await db()).from("app_settings").select("key,value").like("key", "argon_forecasts:%")
  return (data ?? []).filter(r => { try { return dueForecasts(JSON.parse(r.value ?? "[]") as Forecast[], today).length > 0 } catch { return false } }).map(r => String(r.key).slice("argon_forecasts:".length))
}

type ForecastDeps = { load: (id: string) => Promise<Forecast[]>; save: (id: string, l: Forecast[]) => Promise<void>; newId: () => string; today: () => string }
const mkDone = (name: string, args: Record<string, unknown>) => (ok: boolean, result: string): ToolLogEntry => ({ name, args, ok, chars: result.length, result, at: new Date().toISOString() })

/** `ghiDuDoan`; không bao giờ ném lỗi. */
export async function execRecord(args: Record<string, unknown>, ctx: { missionId: string; phase: MissionPhase }, deps: ForecastDeps): Promise<ToolLogEntry> {
  const done = mkDone(FORECAST_TOOL_NAME, args)
  if (ctx.phase !== "run") return done(false, `Chỉ ghi dự đoán ở pha chạy (sau khi Hiếu Chốt). Sứ mệnh đang ở pha "${ctx.phase}".`)
  const n = normalizeForecast(args, deps.today())
  if ("error" in n) return done(false, n.error)
  try {
    const r = addForecast(await deps.load(ctx.missionId), n, deps.newId(), new Date().toISOString())
    if ("error" in r) return done(false, r.error)
    await deps.save(ctx.missionId, r.list)
    return done(true, `Đã ghi dự đoán vào sổ, sẽ được đo lại và chấm vào/sau ngày ${n.checkDate} (tuần tra đêm).`)
  } catch (e) { return done(false, `Không lưu được: ${(e as Error).message}`) }
}

/** `chamDuDoan`; không bao giờ ném lỗi. */
export async function execScore(args: Record<string, unknown>, ctx: { missionId: string; phase: MissionPhase }, deps: ForecastDeps): Promise<ToolLogEntry> {
  const done = mkDone(SCORE_TOOL_NAME, args)
  if (ctx.phase !== "run") return done(false, `Chỉ chấm dự đoán ở pha chạy. Sứ mệnh đang ở pha "${ctx.phase}".`)
  try {
    const r = scoreForecast(await deps.load(ctx.missionId), String(args.id ?? ""), { actual: typeof args.giaTriThucTe === "number" ? args.giaTriThucTe : undefined, ketLuan: typeof args.ketLuan === "string" ? args.ketLuan : undefined, note: String(args.nhanXet ?? "") }, new Date().toISOString())
    if ("error" in r) return done(false, r.error)
    await deps.save(ctx.missionId, r.list)
    const s = summarize(r.list)
    const f = r.forecast
    return done(true, `Đã chấm: ${f.verdict === "dung" ? "ĐÚNG" : f.verdict === "gan_dung" ? "GẦN ĐÚNG" : "SAI"}${f.errorPct !== undefined ? ` (sai số ${f.errorPct}%)` : ""}. Độ đúng tích luỹ: ${s.right}/${s.scored} đúng, ${s.near} gần đúng, ${s.wrong} sai.`)
  } catch (e) { return done(false, `Không lưu được: ${(e as Error).message}`) }
}
