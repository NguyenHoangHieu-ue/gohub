import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { createHash } from "crypto"
import type { ParsedWMItem } from "@/types/ncc-import"

export const maxDuration = 60

const BATCH = 500

async function upsertBatches(items: ParsedWMItem[]) {
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH)
    const { error } = await (supabaseAdmin.from("ncc_worldmove") as any).upsert(
      batch,
      { onConflict: "vendor_product_id" }
    )
    if (error) throw new Error(error.message)
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = (session.user as any).role as string
  if (role !== "admin" && role !== "manager")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const {
    newItems,
    changedItems,
    discontinuedIds,
    fileName,
  }: {
    newItems: ParsedWMItem[]
    changedItems: ParsedWMItem[]
    discontinuedIds: string[]
    fileName: string
  } = body

  if (!Array.isArray(newItems) || !Array.isArray(changedItems) || !Array.isArray(discontinuedIds))
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })

  const toUpsert = [...newItems, ...changedItems]

  try {
    // 1. Upsert new + changed products (APN columns not included → preserved in DB)
    if (toUpsert.length) {
      await upsertBatches(toUpsert)
    }

    // 2. Mark discontinued as inactive
    if (discontinuedIds.length) {
      for (let i = 0; i < discontinuedIds.length; i += BATCH) {
        const batch = discontinuedIds.slice(i, i + BATCH)
        await (supabaseAdmin.from("ncc_worldmove") as any)
          .update({ status: "inactive" })
          .in("vendor_product_id", batch)
      }
    }

    // 3. Log to data_file_registry
    const sha256 = createHash("sha256")
      .update(fileName + Date.now())
      .digest("hex")
    const totalCount = toUpsert.length + discontinuedIds.length
    await (supabaseAdmin.from("data_file_registry") as any).upsert(
      {
        file_key: "ncc/worldmove",
        file_name: fileName,
        sha256,
        row_count: totalCount,
        last_imported: new Date().toISOString(),
        status: "ok",
      },
      { onConflict: "file_key" }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Import failed" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    upserted: toUpsert.length,
    discontinued: discontinuedIds.length,
  })
}
