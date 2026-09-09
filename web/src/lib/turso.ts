// Turso (libSQL) read helper qua HTTP API /v2/pipeline.
// Dùng cho dữ liệu intel còn ở Turso (channel costs, spend, config GA4...).
// Env: TURSO_URL (libsql://...), TURSO_AUTH_TOKEN.

function tursoHttpUrl(url: string): string {
  return url.replace(/^libsql:\/\//, "https://").replace(/^http:\/\//, "https://")
}

export function tursoConfigured(): boolean {
  return !!(process.env.TURSO_URL && process.env.TURSO_AUTH_TOKEN)
}

// Query mặc định: dùng TURSO_URL/TURSO_AUTH_TOKEN (DB config intel: country_codes, GA4...).
export async function tursoQuery<T = Record<string, string | number | null>>(
  sql: string,
  args: (string | number | null)[] = [],
): Promise<T[]> {
  const rawUrl = process.env.TURSO_URL || ""
  const token  = process.env.TURSO_AUTH_TOKEN || ""
  if (!rawUrl || !token) throw new Error("Thiếu TURSO_URL hoặc TURSO_AUTH_TOKEN trong env vars")
  return tursoQueryOn<T>(rawUrl, token, sql, args)
}

// Query trên MỘT Turso DB bất kỳ (url/token tường minh). Cho phép nhiều DB Turso khác nhau
// (vd: config intel vs chat-center leads) dùng chung helper mà không đụng env của nhau.
export async function tursoQueryOn<T = Record<string, string | number | null>>(
  rawUrl: string,
  token: string,
  sql: string,
  args: (string | number | null)[] = [],
): Promise<T[]> {
  if (!rawUrl || !token) throw new Error("Thiếu Turso url hoặc auth token")

  const res = await fetch(`${tursoHttpUrl(rawUrl)}/v2/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: {
            sql,
            args: args.map(v =>
              v === null
                ? { type: "null" }
                : typeof v === "number"
                ? { type: "float", value: v }
                : { type: "text", value: String(v) },
            ),
          },
        },
        { type: "close" },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Turso HTTP error ${res.status}: ${await res.text()}`)
  const body = await res.json()
  const result = body.results?.[0]
  if (result?.type !== "ok") throw new Error(`Turso query error: ${JSON.stringify(result)}`)

  const cols: string[] = result.response.result.cols.map((c: { name: string }) => c.name)
  const rows: { value: string | number | null }[][] = result.response.result.rows
  return rows.map(row =>
    Object.fromEntries(cols.map((col, i) => [col, row[i]?.value ?? row[i] ?? null])),
  ) as T[]
}
