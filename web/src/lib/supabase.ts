import { createClient } from "@supabase/supabase-js"
import { unstable_cache } from "next/cache"

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

const CACHE_SECS = 30 * 60

async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .range(offset, offset + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }
  return rows
}

export const getProducts = unstable_cache(
  () => fetchAll("products"),
  ["products"],
  { revalidate: CACHE_SECS },
)

export const getSkus = unstable_cache(
  () => fetchAll("skus"),
  ["skus"],
  { revalidate: CACHE_SECS },
)

export const getListings = unstable_cache(
  () => fetchAll("listings"),
  ["listings"],
  { revalidate: CACHE_SECS },
)

export const getActiveItems = unstable_cache(
  async () => {
    const { data } = await supabaseAdmin
      .from("items")
      .select("*")
      .eq("status", "Active")
      .limit(10_000)
    return data ?? []
  },
  ["items-active"],
  { revalidate: CACHE_SECS },
)
