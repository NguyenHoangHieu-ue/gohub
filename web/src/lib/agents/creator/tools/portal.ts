import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { supabaseAdmin } from "@/lib/supabase"

interface PortalCredential {
  name:        string
  url:         string
  username:    string
  password:    string
  login_path?: string
  notes?:      string
  api_base?:      string
  login_api?:     string
  auth_header?:   string
  user_field?:    string
  pass_field?:    string
}

const PORTAL_SETTINGS_KEY = "portal_credentials"
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

const _CRED_KEY = process.env.PORTAL_CRED_KEY
  ? Buffer.from(process.env.PORTAL_CRED_KEY.padEnd(32, "0").slice(0, 32))
  : null

export function encryptPassword(plain: string): string {
  if (!_CRED_KEY || plain.startsWith("enc:")) return plain
  const iv  = randomBytes(12)
  const c   = createCipheriv("aes-256-gcm", _CRED_KEY, iv)
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()])
  return `enc:${iv.toString("hex")}:${c.getAuthTag().toString("hex")}:${enc.toString("hex")}`
}

export function decryptPassword(stored: string): string {
  if (!stored.startsWith("enc:") || !_CRED_KEY) return stored
  try {
    const [, ivH, tagH, encH] = stored.split(":")
    const d = createDecipheriv("aes-256-gcm", _CRED_KEY, Buffer.from(ivH, "hex"))
    d.setAuthTag(Buffer.from(tagH, "hex"))
    return d.update(Buffer.from(encH, "hex")).toString("utf8") + d.final("utf8")
  } catch { return stored }
}

async function loadPortalCreds(): Promise<PortalCredential[]> {
  try {
    const { data } = await supabaseAdmin.from("app_settings")
      .select("value").eq("key", PORTAL_SETTINGS_KEY).maybeSingle()
    if (!data?.value) return []
    const creds: PortalCredential[] = JSON.parse(data.value)
    return creds.map(c => ({ ...c, password: decryptPassword(c.password) }))
  } catch { return [] }
}

async function savePortalCreds(creds: PortalCredential[]): Promise<void> {
  const encrypted = creds.map(c => ({ ...c, password: encryptPassword(c.password) }))
  await supabaseAdmin.from("app_settings").upsert(
    { key: PORTAL_SETTINGS_KEY, value: JSON.stringify(encrypted) },
    { onConflict: "key" }
  )
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim()
}

function parseCookies(raw: string | null, jar: Record<string, string>) {
  if (!raw) return
  const entries = raw.split(/,(?=\s*[a-zA-Z_][a-zA-Z0-9_\-]*=)/)
  for (const entry of entries) {
    const [pair] = entry.trim().split(";")
    const eqIdx = pair.indexOf("=")
    if (eqIdx > 0) {
      const name = pair.slice(0, eqIdx).trim()
      const val  = pair.slice(eqIdx + 1).trim()
      if (name) jar[name] = val
    }
  }
}

function isSPA(html: string): boolean {
  const hasForm  = /<form[\s>]/i.test(html)
  const hasMeta  = /react|vue|angular|vite|webpack|next\.js/i.test(html)
  const bodyEmpty = /<body[^>]*>\s*<div[^>]*>\s*<\/div>\s*<\/body>/i.test(html)
  return !hasForm && (hasMeta || bodyEmpty)
}

async function solveImageCaptcha(imageUrl: string, cookieJar: Record<string, string>): Promise<string> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "Cookie": Object.entries(cookieJar).map(([k,v]) => `${k}=${v}`).join("; "), "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return ""
    const buf    = await res.arrayBuffer()
    const base64 = Buffer.from(buf).toString("base64")
    const mime   = res.headers.get("content-type") || "image/png"
    const genAI  = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
    const model  = genAI.getGenerativeModel({ model: "gemini-3.6-flash" })
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [
        { text: "Read the text/numbers in this CAPTCHA image. Return ONLY the captcha text, nothing else. No spaces." },
        { inlineData: { mimeType: mime, data: base64 } },
      ]}],
    })
    return result.response.text().trim().replace(/\s/g, "")
  } catch { return "" }
}

function extractToken(body: any): string | undefined {
  if (!body || typeof body !== "object") return undefined
  return body.token || body.access_token || body.accessToken ||
         body.data?.token || body.data?.access_token || body.data?.accessToken ||
         body.data?.tokenValue || body.result?.token || undefined
}

async function loginSPAPortal(portal: PortalCredential): Promise<{ token?: string; cookies: Record<string, string>; error?: string }> {
  const baseUrl   = portal.url.replace(/\/$/, "")
  const cookieJar: Record<string, string> = {}
  const apiBase   = (portal.api_base || baseUrl).replace(/\/$/, "")
  const userField = portal.user_field || "username"
  const passField = portal.pass_field || "password"

  if (portal.url.includes("sunspeedy") || portal.url.includes("cardweb")) {
    const adminBase = portal.api_base || "https://cardadmin.sunspeedy.com/card-admin"
    for (let attempt = 0; attempt < 3; attempt++) {
      const uuid        = `gp-${Date.now()}-${attempt}`
      const captchaText = await solveImageCaptcha(`${adminBase}/captcha?uuid=${uuid}`, {})
      if (!captchaText) continue
      const r = await fetch(`${adminBase}${portal.login_api || "/login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": BROWSER_UA, "Origin": portal.url, "Referer": portal.url + "/" },
        body: JSON.stringify({ [userField]: portal.username, [passField]: portal.password, captcha: captchaText, uuid }),
        signal: AbortSignal.timeout(12000),
      })
      const body  = await r.json().catch(() => null)
      const token = extractToken(body)
      if ((body?.code === 0 || r.ok) && token) return { token, cookies: cookieJar }
    }
    return { cookies: cookieJar, error: "SunSpeedy login failed after 3 CAPTCHA attempts" }
  }

  if (portal.url.includes("joytel")) {
    const apiV1  = `${baseUrl}/zyfh/api/v1`
    const pwSha1 = createHash("sha1").update(portal.password).digest("hex")
    for (let attempt = 0; attempt < 4; attempt++) {
      const captchaText = await solveImageCaptcha(`${apiV1}/access/kaptcha?rnd=${Date.now()}-${attempt}`, {})
      if (!captchaText) continue
      const r = await fetch(`${apiV1}/access/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": BROWSER_UA, "Origin": baseUrl, "Referer": baseUrl + "/" },
        body: JSON.stringify({ name: portal.username, password: pwSha1, verifyCode: captchaText, system: portal.username }),
        signal: AbortSignal.timeout(12000),
      })
      const body  = await r.json().catch(() => null)
      const token = body?.data?.info?.authc?.principal?.token || extractToken(body) || body?.data?.token
      if (body?.success && token) return { token, cookies: cookieJar }
      if (body?.code === 4020) return { cookies: cookieJar, error: `JoyTel: account locked — ${body.message}` }
    }
    return { cookies: cookieJar, error: "JoyTel login failed after 4 attempts" }
  }

  if (portal.login_api) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": BROWSER_UA, "Origin": baseUrl, "Referer": baseUrl + "/" }
      if (portal.auth_header) headers["Authorization"] = portal.auth_header
      const r = await fetch(`${apiBase}${portal.login_api}`, {
        method: "POST", headers,
        body: JSON.stringify({ [userField]: portal.username, [passField]: portal.password }),
        signal: AbortSignal.timeout(12000),
      })
      parseCookies(r.headers.get("set-cookie"), cookieJar)
      const body  = await r.json().catch(() => null)
      const token = extractToken(body)
      if ((r.ok || body?.code === 0 || body?.code === 200) && token) return { token, cookies: cookieJar }
      return { cookies: cookieJar, error: `Login API trả về: ${JSON.stringify(body).slice(0, 200)}` }
    } catch (e: any) {
      return { cookies: cookieJar, error: `Login API error: ${e.message}` }
    }
  }

  const loginEndpoints = ["/api/login", "/api/user/login", "/api/auth/login", "/access/login", "/login/api"]
  for (const ep of loginEndpoints) {
    try {
      const r = await fetch(`${apiBase}${ep}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": BROWSER_UA },
        body: JSON.stringify({ [userField]: portal.username, [passField]: portal.password }),
        signal: AbortSignal.timeout(8000),
      })
      parseCookies(r.headers.get("set-cookie"), cookieJar)
      const body  = await r.json().catch(() => null)
      const token = extractToken(body)
      if ((r.ok || body?.code === 0) && token) return { token, cookies: cookieJar }
      if (r.status === 401 && body)
        return { cookies: cookieJar, error: `Endpoint ${ep} tồn tại nhưng cần auth_header (framework như SpringBlade). Hiếu vào DevTools > Network khi login, copy header Authorization và lưu vào portal (managePortalCredentials với auth_header).` }
    } catch { continue }
  }
  return { cookies: cookieJar, error: "Không tìm được login endpoint. Hiếu cần cấu hình login_api + api_base cho portal SPA này (lấy từ DevTools Network tab)." }
}

export async function runBrowsePortal(args: { portal_name: string; path?: string }): Promise<any> {
  const creds  = await loadPortalCreds()
  const portal = creds.find(p =>
    p.name.toLowerCase().includes(args.portal_name.toLowerCase()) ||
    p.url.toLowerCase().includes(args.portal_name.toLowerCase())
  )
  if (!portal) {
    return {
      error:     `Portal "${args.portal_name}" not found in stored credentials.`,
      available: creds.length ? creds.map(c => `${c.name} (${c.url})`).join(", ") : "No portals configured yet.",
      hint:      "Call managePortalCredentials(action:'save', name, url, username, password) to add one.",
    }
  }

  const baseUrl  = portal.url.replace(/\/$/, "")
  const loginUrl = portal.login_path
    ? (portal.login_path.startsWith("http") ? portal.login_path : `${baseUrl}${portal.login_path}`)
    : baseUrl
  const timeout  = (ms: number) => AbortSignal.timeout(ms)

  let loginHtml = ""
  try {
    const r1 = await fetch(loginUrl, { headers: { "User-Agent": BROWSER_UA }, signal: timeout(12000) })
    loginHtml = await r1.text()
  } catch (e: any) {
    return { error: `Cannot reach ${loginUrl}: ${e.message}` }
  }

  const cookieJar: Record<string, string> = {}
  const cookieHeader = () => Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join("; ")
  let authToken: string | undefined

  if (isSPA(loginHtml)) {
    const loginResult = await loginSPAPortal(portal)
    if (loginResult.error && !loginResult.token)
      return { portal: portal.name, login_ok: false, error: loginResult.error, hint: "SPA portal detected. " + loginResult.error }
    Object.assign(cookieJar, loginResult.cookies)
    authToken = loginResult.token
  } else {
    const csrfRe    = /(?:name|id)=["'](?:_token|csrf[_-]?token|csrfmiddlewaretoken|authenticity_token)["'][^>]*value=["']([^"']{8,})["']|value=["']([^"']{8,})["'][^>]*(?:name|id)=["'](?:_token|csrf[_-]?token|csrfmiddlewaretoken)["']/i
    const csrfMatch = loginHtml.match(csrfRe)
    const csrfToken = csrfMatch?.[1] || csrfMatch?.[2]
    const csrfField = loginHtml.match(/name=["'](_token|csrf[_-]?token|csrfmiddlewaretoken|authenticity_token)["']/i)?.[1] || "_token"
    const formAction = (loginHtml.match(/<form[^>]*action=["']([^"']+)["']/i) || [])[1]
    const postUrl    = formAction
      ? (formAction.startsWith("http") ? formAction : `${baseUrl}${formAction.startsWith("/") ? formAction : `/${formAction}`}`)
      : `${baseUrl}/login`
    const userFieldRe = /name=["']([^"']*(?:user|login|email|account)[^"']*)["'][^>]*type=["'](?:text|email)["']|type=["'](?:text|email)["'][^>]*name=["']([^"']*(?:user|login|email|account)[^"']*)["']/i
    const passFieldRe = /name=["']([^"']*(?:pass(?:word|wd)?|pwd)[^"']*)["'][^>]*type=["']password["']|type=["']password["'][^>]*name=["']([^"']*(?:pass|pwd)[^"']*)["']/i
    const userField   = loginHtml.match(userFieldRe)?.[1] || loginHtml.match(userFieldRe)?.[2] || "Username"
    const passField   = loginHtml.match(passFieldRe)?.[1] || loginHtml.match(passFieldRe)?.[2] || "Password"
    parseCookies((await fetch(loginUrl, { headers: { "User-Agent": BROWSER_UA }, signal: timeout(5000) })).headers.get("set-cookie"), cookieJar)
    const formBody = new URLSearchParams()
    formBody.append(userField, portal.username)
    formBody.append(passField, portal.password)
    if (csrfToken) formBody.append(csrfField, csrfToken)
    try {
      const r2 = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Cookie": cookieHeader(), "User-Agent": BROWSER_UA, "Referer": loginUrl },
        body: formBody.toString(), redirect: "manual", signal: timeout(12000),
      })
      parseCookies(r2.headers.get("set-cookie"), cookieJar)
      let loc = r2.headers.get("location")
      for (let i = 0; i < 3 && loc; i++) {
        const url = loc.startsWith("http") ? loc : `${baseUrl}${loc.startsWith("/") ? loc : `/${loc}`}`
        const rr  = await fetch(url, { headers: { "Cookie": cookieHeader(), "User-Agent": BROWSER_UA }, redirect: "manual", signal: timeout(10000) })
        parseCookies(rr.headers.get("set-cookie"), cookieJar)
        loc = rr.headers.get("location")
      }
    } catch (e: any) { return { error: `Login POST failed: ${e.message}` } }
  }

  let apiRoot = baseUrl
  if (authToken) {
    if (portal.api_base) apiRoot = portal.api_base.replace(/\/$/, "")
    else if (portal.url.includes("joytel"))   apiRoot = `${baseUrl}/zyfh/api/v1`
    else if (portal.url.includes("sunspeedy") || portal.url.includes("cardweb")) apiRoot = "https://cardadmin.sunspeedy.com/card-admin"
  }
  const targetUrl = args.path
    ? (args.path.startsWith("http") ? args.path : `${apiRoot}${args.path.startsWith("/") ? args.path : `/${args.path}`}`)
    : (authToken ? apiRoot : baseUrl)

  let pageText = "", pageStatus = 0
  try {
    const headers: Record<string, string> = { "Cookie": cookieHeader(), "User-Agent": BROWSER_UA, "Referer": baseUrl }
    if (authToken) {
      if (portal.url.includes("sunspeedy") || portal.url.includes("cardweb")) headers["token"] = authToken
      else { headers["Authorization"] = `Bearer ${authToken}`; headers["Blade-Auth"] = `bearer ${authToken}` }
    }
    const r5 = await fetch(targetUrl, { headers, signal: timeout(15000) })
    pageStatus = r5.status
    const raw  = await r5.text()
    if (r5.headers.get("content-type")?.includes("application/json")) {
      try { pageText = JSON.stringify(JSON.parse(raw), null, 2) } catch { pageText = raw }
    } else {
      pageText = cleanHtml(raw)
    }
  } catch (e: any) { return { error: `Failed to load ${targetUrl}: ${e.message}` } }

  const truncated    = pageText.length > 15000
  const hasLoginForm = /<input[^>]+type=["']password["']/i.test(pageText)
  return {
    portal: portal.name, url: targetUrl, http_status: pageStatus,
    login_ok: !!authToken || !hasLoginForm,
    portal_type: isSPA(loginHtml) ? "SPA" : "Traditional",
    content: pageText.slice(0, 15000), truncated,
    hint: truncated ? "Content truncated at 15k chars. Request a specific path for more focused data."
      : hasLoginForm ? "Login may have failed — page still shows login form." : null,
  }
}

export async function runManagePortalCredentials(args: {
  action: string; name?: string; url?: string; username?: string; password?: string
  login_path?: string; notes?: string; api_base?: string; login_api?: string
  auth_header?: string; user_field?: string; pass_field?: string
}): Promise<any> {
  const creds = await loadPortalCreds()

  if (args.action === "list") {
    if (!creds.length) return { message: "No portals configured yet.", portals: [] }
    return {
      portals: creds.map(c => ({
        name: c.name, url: c.url, username: c.username, login_path: c.login_path, notes: c.notes,
        spa_configured: !!(c.api_base || c.login_api), has_auth_header: !!c.auth_header,
      })),
      count: creds.length,
    }
  }

  if (args.action === "save") {
    const idx = creds.findIndex(c => c.name.toLowerCase() === (args.name || "").toLowerCase() || c.url === args.url)
    const existing = idx >= 0 ? creds[idx] : null
    if (!existing && (!args.name || !args.url || !args.username || !args.password))
      return { error: "Tạo mới cần: name, url, username, password. (Update portal có sẵn thì chỉ cần name + field muốn đổi)" }
    const cred: PortalCredential = {
      name:        args.name       ?? existing!.name,
      url:         (args.url ?? existing!.url).replace(/\/$/, ""),
      username:    args.username   ?? existing!.username,
      password:    args.password   ?? existing!.password,
      login_path:  args.login_path ?? existing?.login_path,
      notes:       args.notes      ?? existing?.notes,
      api_base:    args.api_base    ?? existing?.api_base,
      login_api:   args.login_api   ?? existing?.login_api,
      auth_header: args.auth_header ?? existing?.auth_header,
      user_field:  args.user_field  ?? existing?.user_field,
      pass_field:  args.pass_field  ?? existing?.pass_field,
    }
    if (idx >= 0) { creds[idx] = cred; await savePortalCreds(creds); return { success: true, message: `Updated portal "${args.name}". Total: ${creds.length}` } }
    creds.push(cred); await savePortalCreds(creds)
    return { success: true, message: `Saved new portal "${args.name}". Total: ${creds.length}` }
  }

  if (args.action === "delete") {
    if (!args.name) return { error: "delete requires: name" }
    const before   = creds.length
    const filtered = creds.filter(c => c.name.toLowerCase() !== args.name!.toLowerCase())
    await savePortalCreds(filtered)
    return { success: true, message: `Deleted ${before - filtered.length} portal(s). Remaining: ${filtered.length}` }
  }

  return { error: `Unknown action "${args.action}". Use: list | save | delete` }
}
