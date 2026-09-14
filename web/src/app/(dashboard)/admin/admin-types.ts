// Type dùng chung giữa ≥2 tab admin (s196+21, tách admin/page.tsx 2120 dòng — Phase 5 pattern).
export interface AppSetting {
  key:        string
  value:      string
  label:      string
  category:   string
  updated_at: string | null
}
