import { runWebSearch as _runWebSearch, type WebSource } from "@/lib/web-search"

export async function runWebSearchTool(query: string, collectedSources: WebSource[]): Promise<any> {
  console.log(`[CreatorAI] webSearch: ${query}`)
  const { result, sources } = await _runWebSearch(query)
  collectedSources.push(...sources)
  const sourcesText = sources.length
    ? "\n\nSources:\n" + sources.map((s, i) => `[${i + 1}] ${s.title}: ${s.url}`).join("\n")
    : ""
  return {
    result: result + sourcesText,
    instruction: "MUST cite the source URLs listed above when using this information.",
  }
}
