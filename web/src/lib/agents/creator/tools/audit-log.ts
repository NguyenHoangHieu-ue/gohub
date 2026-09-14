import { supabaseAdmin } from "@/lib/supabase"

// Nhật ký hành động Gấu Pro (s196+6) — chỉ ghi tool có tác dụng phụ ra ngoài
// (ghi KB/Lark/portal/browser thật). Xem AUDITED_TOOLS trong dispatch.ts.

const REDACT_KEY_RE = /password|secret|token|auth_header|api_key/i

function redact(value: any): any {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === "object") {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEY_RE.test(k) ? "[redacted]" : redact(v)
    }
    return out
  }
  return value
}

function summarize(response: any): string {
  if (response == null) return ""
  if (typeof response === "string") return response.slice(0, 300)
  if (response.error) return String(response.error).slice(0, 300)
  try { return JSON.stringify(response).slice(0, 300) } catch { return "" }
}

export async function logGpAction(opts: { username: string; tool: string; args: any; response: any }): Promise<void> {
  try {
    const ok = !(opts.response && typeof opts.response === "object" && "error" in opts.response)
    await supabaseAdmin.from("gp_action_log").insert({
      username: opts.username || null,
      tool_name: opts.tool,
      args: redact(opts.args ?? {}),
      ok,
      summary: summarize(opts.response),
    })
  } catch { /* logging không được làm hỏng kết quả tool thật */ }
}
