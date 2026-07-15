import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { promises as fs } from "fs"
import path from "path"

// Creator-only: liệt kê TỰ ĐỘNG mọi API route của app (để tab API Tester luôn cập nhật khi thêm route mới).
// Nguồn chính: Next build manifest (.next/server/app-paths-manifest.json) — có mặt lúc runtime trên Vercel.
// Fallback: quét source src/app/api (chạy được ở dev khi manifest chưa đầy).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "creator") {
    return NextResponse.json({ error: "Forbidden — Creator only" }, { status: 403 })
  }
  try {
    const routes = (await fromManifest()) ?? (await fromSource())
    return NextResponse.json({ routes: routes.sort((a, b) => a.localeCompare(b)) })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function fromManifest(): Promise<string[] | null> {
  try {
    const p = path.join(process.cwd(), ".next/server/app-paths-manifest.json")
    const manifest = JSON.parse(await fs.readFile(p, "utf8")) as Record<string, string>
    const routes = Object.keys(manifest)
      .filter(k => k.startsWith("/api/") && k.endsWith("/route"))
      .map(k => k.slice(0, -"/route".length))
    return routes.length > 0 ? routes : null
  } catch { return null }
}

async function fromSource(): Promise<string[]> {
  const base = path.join(process.cwd(), "src/app/api")
  const out: string[] = []
  async function walk(dir: string, rel: string) {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isDirectory()) await walk(path.join(dir, e.name), `${rel}/${e.name}`)
      else if (e.name === "route.ts" || e.name === "route.js") out.push(`/api${rel}`)
    }
  }
  await walk(base, "")
  return out
}
