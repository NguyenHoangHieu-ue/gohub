import { GoogleGenerativeAI } from "@google/generative-ai"
import type { AgentId, UserRole, Message, RouterResult } from "./types"

// ─── Rule-based fast path ──────────────────────────────────────────────────────

const SKU_PATTERN = /\b([A-Z0-9]{13})\b/i

const RULES: Array<{ test: (msg: string) => boolean; agentId: AgentId }> = [
  {
    // Direct SKU code or "chi tiết gói X"
    test: msg => SKU_PATTERN.test(msg) || /chi ti[eế]t|th[oô]ng tin g[oó]i|g[oó]i n[aà]y|lookup/i.test(msg),
    agentId: "tra-cuu",
  },
  {
    // Gap analysis: NCC vs system
    test: msg => /gap|ncc c[oó]|ch[uư]a c[oó]|ch[uư]a import|ch[uư]a nh[aậ]p|worldmove c[oó]|3hk c[oó]|so s[aá]nh ncc/i.test(msg),
    agentId: "gap-analysis",
  },
  {
    // Pricing / COGS
    test: msg => /cogs|gi[aá] v[oố]n|gi[aá] nh[aậ]p|l[oợ]i nhu[aậ]n|t[yỷ] gi[aá]|usd|vnd|hkd|twd|chi ph[ií]/i.test(msg),
    agentId: "gia-cogs",
  },
  {
    // System knowledge
    test: msg => /ngh[iĩ]a l[aà]|[lý] gi[aả]i|gi[aả]i th[ií]ch|c[aấ]u tr[uú]c|data policy|source type|kyc l[aà]|throttle l[aà]|vendor l[aà]|m[aã] n[uư][oớ]c/i.test(msg),
    agentId: "giai-dap",
  },
  {
    // Product search / recommendation
    test: msg => /[đd]i |g[oó]i |t[iì]m|c[oó] g[oó]i|[eE][sS][iI][mM]|sim|n[uư][oớ]c|ng[aà]y|gb|unlimited|kh[aô]ng gi[oớ]i h[aạ]n/i.test(msg),
    agentId: "tu-van",
  },
]

const AGENT_NAMES: Record<AgentId, string> = {
  "tu-van":       "Tư Vấn",
  "tra-cuu":      "Tra Cứu",
  "giai-dap":     "Giải Đáp",
  "gia-cogs":     "Giá & COGS",
  "gap-analysis": "Gap Analysis",
}

function ruleBasedRoute(msg: string): AgentId | null {
  const m = msg.toLowerCase()
  for (const rule of RULES) {
    if (rule.test(m)) return rule.agentId
  }
  return null
}

// ─── Gemini fallback ───────────────────────────────────────────────────────────

async function geminiRoute(message: string, history: Message[]): Promise<AgentId> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY!)
  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash",
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 50 },
    systemInstruction: `Classify the user message into exactly one of these agent IDs:
- "tu-van": find/recommend SIM/eSIM products for a trip
- "tra-cuu": look up specific SKU or product details
- "giai-dap": explain system concepts, codes, policies, terminology
- "gia-cogs": pricing, COGS, exchange rates (admin/manager only)
- "gap-analysis": NCC catalog vs GoHub system comparison (admin/manager only)
Respond with JSON: {"agentId": "<id>"}`,
  })

  const hist = history.slice(-4).map(m => ({
    role: m.role === "user" ? "user" as const : "model" as const,
    parts: [{ text: m.content }],
  }))

  try {
    const result = await model.startChat({ history: hist }).sendMessage(message)
    const parsed = JSON.parse(result.response.text())
    return parsed.agentId as AgentId ?? "giai-dap"
  } catch {
    return "giai-dap"
  }
}

// ─── Main router ───────────────────────────────────────────────────────────────

export async function route(
  message: string,
  history: Message[],
  role: UserRole
): Promise<RouterResult> {
  // Fast path: rule-based
  let agentId = ruleBasedRoute(message)

  // Fallback: Gemini classification
  if (!agentId) agentId = await geminiRoute(message, history)

  // Role check: downgrade restricted agents for standard users
  if (role === "standard" && (agentId === "gia-cogs" || agentId === "gap-analysis")) {
    agentId = "giai-dap"
  }

  return { agentId, agentName: AGENT_NAMES[agentId] }
}
