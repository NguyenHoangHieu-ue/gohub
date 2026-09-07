// Types dùng chung giữa quarterly/page.tsx và các component tách ra dưới components/quarterly/
// (s183 Phase 5 — tách cơ học, KHÔNG đổi shape/logic, chỉ đổi chỗ định nghĩa để tránh import vòng
// giữa page.tsx và component con).

export interface MonthStats {
  revenue: number; gp: number; gpPct: number
  channelCost: number; groupCost: number; cm1: number; cm1Pct: number
  hk3Pct?: number; hk3Rev?: number
  actualRevenue?: number; actualGp?: number; actualCc?: number; actualGc?: number; actualCm1?: number; actualHk3?: number
}

export interface MonthSummary {
  month: string; isProjected: boolean; factor: number; elapsed: number; dim: number
  hk3Pct: number; hk3Rev: number; actualHk3: number
  total: MonthStats; b2b: MonthStats; b2c: MonthStats
}

export interface ChannelMonth {
  month: string; revenue: number; gp: number
  channelCost: number; cm1: number; cm1Pct: number; momPct: number | null
  three_hk_rev?: number; three_hk_pct?: number
  isProjected?: boolean
  actualRevenue?: number; actualGp?: number; actualCc?: number; actualCm1?: number
}

export interface Channel { name: string; totalRevenue: number; months: ChannelMonth[] }

export interface QReport {
  quarter: string; year: number; months: string[]
  summary: MonthSummary[]
  quarterTotal: MonthStats & { hk3Pct: number; b2b: MonthStats; b2c: MonthStats }
  prevQuarterTotals?: { b2bRevenue: number; b2bGp: number; b2bCm1: number; b2cRevenue: number; b2cGp: number; b2cCm1: number }
  b2bChannels: Channel[]; b2cChannels: Channel[]
  elapsed_days: number; quarter_days: number
}

export interface Targets { b2bRev: number; b2bCm1: number; b2bThk: number; b2cRev: number; b2cCm1: number; b2cThk: number }

export const EMPTY_TARGETS: Targets = { b2bRev: 0, b2bCm1: 0, b2bThk: 0, b2cRev: 0, b2cCm1: 0, b2cThk: 0 }
