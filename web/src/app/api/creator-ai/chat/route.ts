import { NextRequest, NextResponse } from "next/server"
import { getServerSession }          from "next-auth"
import { authOptions }               from "@/lib/auth"
import { runCreatorAI }              from "@/lib/agents/creator-ai"

// Creator AI: private endpoint for creator role only.
// Quality over speed — allow up to 5 minutes for complex multi-query answers.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== "creator") {
    return NextResponse.json({ error: "Creator only" }, { status: 403 })
  }

  let messages: { role: string; content: string }[] = []
  try {
    const body = await req.json()
    messages   = Array.isArray(body.messages) ? body.messages : []
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 })
  }

  // Convert to Gemini history format (all but last message = history, last = current)
  const history = messages.slice(0, -1).map(m => ({
    role:  m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }))
  const lastMsg = messages[messages.length - 1]?.content || ""

  try {
    const { text, sources } = await runCreatorAI(history, lastMsg)
    return NextResponse.json({ text, sources })
  } catch (e: any) {
    console.error("[CreatorAI] Error:", e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
