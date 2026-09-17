/** A direct operator request can select connected inbox sources without a mention.
 * Draft bodies and quoted source text do not authorise mailbox searches.
 */
export function requestedInboxProviders(prompt: string): ("gmail" | "outlook")[] {
  const instruction = prompt.split(/\b(?:body|message)\s*:/i)[0]
    .replace(/```[\s\S]*?```|`[^`]*`|"[^"]*"|“[^”]*”|(?<!\w)'[^'\n]*'(?!\w)/g, " ")
  const clauses = instruction.split(/[\n;!?]|\.(?=\s|$)/)
    .filter(clause => !/\b(?:do not|don't|don’t|never|avoid|without)\s+(?:\w+\s+){0,2}(?:search|read|check|access|inspect|open|look)\b/i.test(clause))
  const relevant = clauses.filter(clause =>
    /\b(?:find|search|read|check|look\s+(?:in|through)|show|summari[sz]e|surface)\b[\s\S]{0,180}\b(?:inbox|mailbox|emails?|gmail|outlook)\b/i.test(clause)
    && !/\b(?:where|how)\s+(?:can|do|to|is)\b|\b(?:navigate|navigation|settings|connect)\b/i.test(clause))
  if (!relevant.length) return []
  const text = relevant.join(" ")
  const named: ("gmail" | "outlook")[] = []
  if (/\bgmail\b/i.test(text)) named.push("gmail")
  if (/\boutlook\b/i.test(text)) named.push("outlook")
  return named.length ? named : ["gmail", "outlook"]
}
