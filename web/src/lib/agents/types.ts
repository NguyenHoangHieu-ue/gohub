export type AgentId = 'tu-van' | 'tra-cuu' | 'giai-dap' | 'gia-cogs' | 'gap-analysis'
export type UserRole = 'admin' | 'manager' | 'standard'

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
