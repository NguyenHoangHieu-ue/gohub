export type AgentId = 'tu-van' | 'tra-cuu' | 'giai-dap' | 'gap-analysis' | 'tao-template' | 'bi-analyst'
export type UserRole = 'admin' | 'bod' | 'staff'

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
