import { supabaseAdmin } from "@/lib/supabase"

// Ngưỡng cảnh báo hết hàng (DOI = days of inventory = tồn hiện tại / tốc độ bán) cho tab Inventory —
// OPS tự set qua /analytics/settings (không hardcode, xem docs/wiki/system/tabs/analytics-fulfillment.md).
// >= safeDays: An toàn · >= normalDays: Bình thường · >= warningDays: Cần chú ý · < warningDays: Nguy hiểm.

export interface InventoryAlertThresholds {
  safeDays: number
  normalDays: number
  warningDays: number
}

export const DEFAULT_INVENTORY_ALERT_THRESHOLDS: InventoryAlertThresholds = {
  safeDays: 90, normalDays: 60, warningDays: 30,
}

const KEY = "inventory_alert_thresholds"

export async function fetchInventoryAlertThresholds(): Promise<InventoryAlertThresholds> {
  try {
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", KEY).maybeSingle()
    if (!data?.value) return DEFAULT_INVENTORY_ALERT_THRESHOLDS
    const parsed = JSON.parse(data.value)
    return {
      safeDays: Number(parsed.safeDays) || DEFAULT_INVENTORY_ALERT_THRESHOLDS.safeDays,
      normalDays: Number(parsed.normalDays) || DEFAULT_INVENTORY_ALERT_THRESHOLDS.normalDays,
      warningDays: Number(parsed.warningDays) || DEFAULT_INVENTORY_ALERT_THRESHOLDS.warningDays,
    }
  } catch {
    return DEFAULT_INVENTORY_ALERT_THRESHOLDS
  }
}

export async function saveInventoryAlertThresholds(t: InventoryAlertThresholds): Promise<void> {
  await supabaseAdmin.from("app_settings").upsert({
    key: KEY,
    value: JSON.stringify(t),
    category: "analytics",
  }, { onConflict: "key" })
}
