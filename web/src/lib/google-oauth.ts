import { supabaseAdmin } from "@/lib/supabase"

// OAuth Google (Drive/Docs/Sheets) cho Gấu Pro — cùng mô hình Lark OAuth (lark.ts): 1 bộ token của creator lưu
// app_settings, tự refresh. Client "GoHub Intel - Drive" (project GCP "hieu", consent External + In production →
// refresh token không hết hạn 7 ngày). Scope drive = đọc/sửa mọi file Drive/Docs/Sheets của tài khoản đã cấp.
const OAUTH_KEY = "google_oauth_creator"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive"]

interface GoogleOAuthStore {
  email?:            string
  access_token:      string
  refresh_token:     string
  access_expires_at: number   // ms
}

export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/google/oauth/callback`
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<any> {
  const res = await fetch(TOKEN_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams({
      grant_type:    "authorization_code",
      client_id:     process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      code,
      redirect_uri:  redirectUri,
    }),
  })
  return res.json()
}

async function readStore(): Promise<GoogleOAuthStore | null> {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", OAUTH_KEY).maybeSingle()
  if (!data?.value) return null
  try { return JSON.parse(data.value) } catch { return null }
}

// Google chỉ trả refresh_token ở lần consent đầu (hoặc prompt=consent) → lần refresh giữ refresh_token cũ.
export async function saveGoogleToken(tok: any, email?: string): Promise<void> {
  const prev = await readStore()
  const store: GoogleOAuthStore = {
    email:             email ?? prev?.email,
    access_token:      tok.access_token,
    refresh_token:     tok.refresh_token ?? prev?.refresh_token ?? "",
    access_expires_at: Date.now() + ((tok.expires_in || 3600) - 60) * 1000,
  }
  await supabaseAdmin.from("app_settings").upsert(
    { key: OAUTH_KEY, value: JSON.stringify(store), category: "google_oauth" },
    { onConflict: "key" },
  )
}

// email tài khoản vừa cấp quyền — từ id_token (JWT, chỉ decode payload; token vừa nhận thẳng từ Google qua TLS).
export function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"))
    return typeof payload.email === "string" ? payload.email : undefined
  } catch { return undefined }
}

// access_token còn hạn (tự refresh); null nếu chưa kết nối hoặc refresh bị thu hồi.
export async function getGoogleAccessToken(): Promise<string | null> {
  const store = await readStore()
  if (!store) return null
  if (Date.now() < store.access_expires_at) return store.access_token
  if (!store.refresh_token) return null
  try {
    const res = await fetch(TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        grant_type:    "refresh_token",
        client_id:     process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
        refresh_token: store.refresh_token,
      }),
    })
    const tok = await res.json()
    if (!tok.access_token) return null
    await saveGoogleToken(tok)
    return tok.access_token
  } catch { return null }
}

export async function getGoogleConnection(): Promise<{ connected: boolean; email?: string }> {
  const token = await getGoogleAccessToken()
  if (!token) return { connected: false }
  return { connected: true, email: (await readStore())?.email }
}
