type PresentedMessage = {
  id: string
  role: string
  renderKey?: string
  responseToUserMessageId?: string | null
}

/** Keep the live DOM mounted when the server acknowledges its saved IDs. */
export function retainDexterRenderKeys<T extends { messages: PresentedMessage[] }>(
  completed: T,
  previous: T | null,
  streamingId: string,
  pendingUserId?: string,
): T {
  const previousKeys = new Map(previous?.messages.map(message => [message.id, message.renderKey ?? message.id]))
  const response = [...completed.messages].reverse().find(message => message.role === "assistant")
  const user = pendingUserId && response
    ? completed.messages.find(message => message.id === response.responseToUserMessageId)
      ?? [...completed.messages].reverse().find(message => message.role === "user")
    : undefined
  return {
    ...completed,
    messages: completed.messages.map(message => ({
      ...message,
      renderKey: message === response ? streamingId
        : message === user ? pendingUserId
        : previousKeys.get(message.id) ?? message.id,
    })),
  }
}

export function dexterArtifactReferences(content: string, hasRecordTable: boolean) {
  if (!hasRecordTable) return content
  // Native record tables follow the response, including in saved conversations.
  return content.replace(/\b(tables?)\s+above\b/gi, "$1 below")
}

/** Recover explicit, semicolon-separated agendas without rewriting their evidence. */
export function structureDexterMeetingBrief(content: string) {
  // Code and existing structured Markdown are authored content, not repair targets.
  if (/```|~~~|\u0000/.test(content)) return content
  let changed = false
  const result = content.split(/\n\s*\n/).map(paragraph => {
    if (/\n|^\s*(?:#{1,6}\s|[-*+]\s|>|\|)/.test(paragraph)) return paragraph
    const intro = paragraph.match(/^(.*?)\s*Meetings found:\s*/)
    if (!intro) return paragraph
    // Hide links before looking for separators: URLs and titles may contain times
    // or semicolons, and must remain byte-for-byte intact.
    const links: string[] = []
    const agenda = paragraph.slice(intro[0].length).replace(/\[[^\]\n]+\]\((?:[^()\n]|\([^()\n]*\))*\)/g, link => {
      links.push(link)
      return `\u0000${links.length - 1}\u0000`
    })
    const time = /^\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\b/
    const items = agenda.split(/;\s*(?=\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}\b)/)
    if (items.length < 2 || items.some(item => !time.test(item))) return paragraph
    changed = true
    const restore = (text: string) => text.replace(/\u0000(\d+)\u0000/g, (_, index) => links[Number(index)])
    const last = items.at(-1)!
    const noteStart = last.search(/\.\s+(?=(?:There is|There are|Focus blocks|CRM searches|No changes (?:were )?made)\b)/)
    const notes = noteStart >= 0 ? restore(last.slice(noteStart + 1).trim().replace(/(?<=\.)\s+(?=(?:Focus blocks|CRM searches)\b)/g, '\n\n')) : ''
    if (noteStart >= 0) items[items.length - 1] = last.slice(0, noteStart + 1)
    const rows = items.map(item => {
      let text = restore(item.trim())
      // Move a repeated trailing citation onto the same name already in the row.
      const citation = text.match(/:\s*(\[([^\]\n]+)\]\((?:[^()\n]|\([^()\n]*\))*\))\s*[.;]?$/)
      if (citation) {
        const prefix = text.slice(0, citation.index)
        const nameIndex = prefix.indexOf(citation[2])
        if (nameIndex >= 0 && !prefix.includes('](')) {
          text = prefix.slice(0, nameIndex) + citation[1] + prefix.slice(nameIndex + citation[2].length)
        }
      }
      return `- ${text.replace(time, match => `**${match}**`)}`
    })
    return [intro[1].trim(), '## Meetings', rows.join('\n'), notes].filter(Boolean).join('\n\n')
  }).join('\n\n')
  return changed ? result : content
}
