import { DBClientFactory } from "@/core/db";

const L1_TTL_MS = 5 * 60 * 1000; // 5 phút
const L2_TTL_MS = 12 * 60 * 60 * 1000; // 12 giờ
const CACHE_TABLE = "analytics_query_cache";

interface L1Entry {
  data: unknown;
  cachedAt: number;
}

const l1Store = new Map<string, L1Entry>();

/**
 * L1 in-memory (5 phút) + L2 Supabase (12 giờ). Cache-aside: kiểm L1 trước,
 * miss thì kiểm L2, miss cả 2 thì chạy `fetcher` và ghi lại cả 2 tầng.
 */
export async function cachedQuery<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  opts: { l1TtlMs?: number; l2TtlMs?: number } = {}
): Promise<T> {
  const l1Ttl = opts.l1TtlMs ?? L1_TTL_MS;
  const l2Ttl = opts.l2TtlMs ?? L2_TTL_MS;

  const l1Hit = l1Store.get(cacheKey);
  if (l1Hit && Date.now() - l1Hit.cachedAt < l1Ttl) {
    return l1Hit.data as T;
  }

  const supabase = DBClientFactory.getSupabase();
  const { data: l2Row } = await supabase
    .from(CACHE_TABLE)
    .select("data, cached_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (l2Row?.cached_at) {
    const ageMs = Date.now() - new Date(l2Row.cached_at as string).getTime();
    if (ageMs < l2Ttl) {
      const data = l2Row.data as T;
      l1Store.set(cacheKey, { data, cachedAt: Date.now() });
      return data;
    }
  }

  const freshData = await fetcher();
  l1Store.set(cacheKey, { data: freshData, cachedAt: Date.now() });

  void supabase
    .from(CACHE_TABLE)
    .upsert({
      cache_key: cacheKey,
      data: freshData as object,
      cached_at: new Date().toISOString(),
    })
    .then();

  return freshData;
}

/**
 * Xoá cache theo danh sách tiền tố (Scoped Cache Flush). KHÔNG có, và
 * KHÔNG ĐƯỢC thêm, hàm "xoá sạch toàn bộ cache" — thiết kế API cố tình
 * chặn đứt bug v1 s169c (global flush làm chậm toàn app hàng giờ).
 */
export async function flushCacheByPrefixes(prefixes: string[]): Promise<void> {
  if (prefixes.length === 0) return;

  for (const key of Array.from(l1Store.keys())) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      l1Store.delete(key);
    }
  }

  const supabase = DBClientFactory.getSupabase();
  await Promise.all(
    prefixes.map((prefix) =>
      supabase.from(CACHE_TABLE).delete().like("cache_key", `${prefix}%`)
    )
  );
}
