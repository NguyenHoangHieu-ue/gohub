import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { createHash } from "crypto"
import type { ParsedWMItem, ParsedDatapoolItem } from "@/types/ncc-import"

export const maxDuration = 60

const BATCH = 500

async function upsertBatches(table: string, items: object[], conflict: string) {
  for (let i = 0; i < items.length; i += BATCH) {
    const { error } = await (supabaseAdmin.from(table) as any)
      .upsert(items.slice(i, i + BATCH), { onConflict: conflict })
    if (error) throw new Error(`${table} upsert: ${error.message}`)
  }
}

async function markInactive(table: string, idCol: string, ids: string[]) {
  for (let i = 0; i < ids.length; i += BATCH) {
    await (supabaseAdmin.from(table) as any)
      .update({ status: "inactive" })
      .in(idCol, ids.slice(i, i + BATCH))
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
    newItems = [],
    changedItems = [],
    discontinuedIds = [],
    dpNewItems = [],
    dpChangedItems = [],
    dpDiscontinuedKeys = [],
    fileName,
  }: {
    newItems: ParsedWMItem[]
    changedItems: ParsedWMItem[]
    discontinuedIds: string[]
    dpNewItems: ParsedDatapoolItem[]
    dpChangedItems: ParsedDatapoolItem[]
    dpDiscontinuedKeys: string[]
    fileName: string
  } = body

  const readyMadeToUpsert = [...newItems, ...changedItems]
  const datapoolToUpsert = [...dpNewItems, ...dpChangedItems]

  try {
    // 1. Upsert ready-made → ncc_worldmove
    if (readyMadeToUpsert.length)
      await upsertBatches("ncc_worldmove", readyMadeToUpsert, "vendor_product_id")

    // 2. Mark discontinued ready-made as inactive
    if (discontinuedIds.length)
      await markInactive("ncc_worldmove", "vendor_product_id", discontinuedIds)

    // 3. Upsert datapool → ncc_datapool
    if (datapoolToUpsert.length)
      await upsertBatches("ncc_datapool", datapoolToUpsert, "vendor_code,zone_id")

    // 4. Mark discontinued datapool as inactive (key = "vendor_code:zone_id")
    for (const key of dpDiscontinuedKeys) {
      const [vc, zi] = key.split(":")
      if (vc && zi) {
        await (supabaseAdmin.from("ncc_datapool") as any)
          .update({ status: "inactive" })
          .eq("vendor_code", vc)
          .eq("zone_id", zi)
      }
    }

    // 5. Log to data_file_registry
    const sha256 = createHash("sha256").update(fileName + Date.now()).digest("hex")
    await (supabaseAdmin.from("data_file_registry") as any).upsert(
      {
        file_key: "ncc/standard",
        file_name: fileName,
        sha256,
        row_count: readyMadeToUpsert.length + datapoolToUpsert.length,
        last_imported: new Date().toISOString(),
        status: "ok",
      },
      { onConflict: "file_key" }
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Import thất bại" }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    upsertedReadyMade: readyMadeToUpsert.length,
    discontinuedReadyMade: discontinuedIds.length,
    upsertedDatapool: datapoolToUpsert.length,
    discontinuedDatapool: dpDiscontinuedKeys.length,
  })
}
