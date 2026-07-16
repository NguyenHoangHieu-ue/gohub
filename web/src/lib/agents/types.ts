export type AgentId = 'tu-van' | 'tra-cuu' | 'giai-dap' | 'gap-analysis' | 'tao-template' | 'bi-analyst' | 'data-explorer'

// Vai trò người dùng — đầy đủ theo gohub-intel (admin = toàn quyền; còn lại gate theo ma trận quyền).
export type UserRole =
  | 'creator' | 'admin' | 'bod' | 'staff'
  | 'b2b' | 'b2c' | 'saleb2c' | 'ops-&-cs' | 'hr' | 'product'

// Roles cấu hình được trong ma trận quyền (admin/creator bypass nên không liệt kê)
export const CONFIGURABLE_ROLES = ['bod', 'staff', 'b2b', 'b2c', 'saleb2c', 'ops-&-cs', 'hr', 'product'] as const
// Tất cả role (cho dropdown chọn role + gate API) — creator bị ẩn nếu đã có creator (xử lý ở FE)
export const ALL_ROLES = ['creator', 'admin', 'bod', 'staff', 'b2b', 'b2c', 'saleb2c', 'ops-&-cs', 'hr', 'product'] as const
// Nhãn hiển thị
export const ROLE_LABELS: Record<string, string> = {
  creator: 'Creator', admin: 'Admin', bod: 'BOD', staff: 'Staff',
  b2b: 'B2B', b2c: 'B2C', saleb2c: 'Sale B2C', 'ops-&-cs': 'Ops & CS', hr: 'HR', product: 'Product',
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentContext {
  role:        UserRole
  userName:    string
  messages:    Message[]   // full history
  lastMessage: string
}

export interface RouterResult {
  agentId:   AgentId
  agentName: string
}
