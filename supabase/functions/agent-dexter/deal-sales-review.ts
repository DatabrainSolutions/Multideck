type Row = Record<string, unknown>
const row = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
const lossLabels: Record<string,string> = { price: "Price", timing: "Timing", competitor: "Competitor", service_fit: "Service fit", no_response: "No response", cancelled: "Cancelled", other: "Other" }
const actionLabels: Record<string,string> = { call: "Call", email: "Email", meeting: "Meeting", quote: "Quote", follow_up: "Follow up", other: "Other" }

/** Approval is built from the exact authorised deal and people read, not generated names. */
export function dealSalesActionReview(records: Map<string,Row>, args: Row) {
  const deal = records.get(text(args.target_id))
  if (!deal || deal.sourceTable !== "CRM_Opportunities" || !Number.isInteger(deal.editVersion) || deal.editVersion !== args.expected_version || !text(deal.name) || !deal.people) {
    throw new Error("Read this deal from deal_sales before preparing its next action, assignment or outcome.")
  }
  const input = row(args.input)
  const people = row(deal.people)
  const action = row(deal.nextAction)
  const name = (kind: "owners" | "contacts", id: unknown) => {
    if (id === null) return kind === "owners" ? "Unassigned" : "No main contact"
    const found = (Array.isArray(people[kind]) ? people[kind] as Row[] : []).find(person => person.id === id)
    if (!found || !(text(found.name) || text(found.email))) throw new Error("Read the eligible deal owners and contacts before proposing this assignment.")
    return text(found.name) || text(found.email)
  }
  const changes: Array<{ field: string; before: {} | null; after: unknown; value: unknown; beforeKnown: boolean; kind: string }> = []
  const change = (field: string, before: unknown, after: unknown) => { if (before !== after) changes.push({ field, before: before ?? null, after, value: after, beforeKnown: true, kind: before == null ? "added" : after == null ? "removed" : "changed" }) }
  const operation = args.operation
  let title: string, description: string
  if (operation === "set_next_action") {
    if (!text(input.title) || text(input.title).length > 240 || !actionLabels[text(input.type)] || !Number.isFinite(Date.parse(text(input.dueAt)))) throw new Error("Supply an action, type, eligible owner and due date before preparing this change.")
    if (!text(input.ownerId)) throw new Error("Choose an eligible owner before preparing the next action.")
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(text(input.dueAt))) throw new Error("Include the time zone in the next action's due time.")
    const localDueDate = text(input.dueAt).slice(0, 10)
    if (new Date(`${localDueDate}T00:00:00Z`).toISOString().slice(0, 10) !== localDueDate) throw new Error("Choose a valid due date before preparing the next action.")
    const dueDate = new Date(text(input.dueAt)).toISOString().slice(0, 10)
    const taskDate = text(input.taskDate) || dueDate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate) || !Number.isFinite(Date.parse(taskDate)) || new Date(taskDate).toISOString().slice(0, 10) !== taskDate
      || Math.abs(Date.parse(taskDate) - Date.parse(dueDate)) > 86_400_000) throw new Error("The task date must match the chosen due date.")
    const owner = name("owners", input.ownerId)
    title = "Set deal next action"
    description = `Set the next action for ${deal.name}. It will also appear in ${owner}'s Tasks. Any current next action will be replaced and kept in the deal history.`
    change("Next action", action.title, text(input.title)); change("Action type", actionLabels[text(action.type)], actionLabels[text(input.type)])
    change("Assigned to", action.ownerName, owner);change("Due", action.dueAt, input.dueAt)
    change("Task date", action.taskScheduledDate, taskDate)
  } else if (operation === "complete_next_action") {
    if (!action.id || action.id !== input.actionId) throw new Error("Read the current next action before completing it.")
    title = "Complete deal action"; description = `Complete “${text(action.title)}” on ${deal.name}, including its linked task. This does not close the deal.`
    change("Action status", "Open", "Completed"); if(text(input.note))change("Outcome", null, text(input.note))
  } else if (operation === "assign") {
    title = "Update deal ownership"; description = `Update the people responsible for ${deal.name}. An existing next action keeps its own assignee until explicitly changed.`
    if ("ownerId" in input) change("Deal owner", deal.ownerName || "Unassigned", name("owners",input.ownerId))
    if ("primaryContactId" in input) change("Main contact", deal.primaryContactName || "No main contact", name("contacts",input.primaryContactId))
    if (!changes.length) throw new Error("This deal already has those assignments.")
  } else if (operation === "reopen") {
    const destination = records.get(text(input.pipelineStageId))
    if (!deal.isLost || !text(input.reason) || !destination || destination.sourceTable !== "CRM_PipelineStages" || destination.pipelineId !== deal.pipelineId || destination.isConversion || /lost|cancel/i.test(text(destination.name))) {
      throw new Error("Read the lost deal and an open stage in its pipeline, and give a reason before reopening it.")
    }
    title = "Reopen deal"; description = `Reopen ${deal.name} in ${text(destination.name)}. The previous loss remains in its outcome history; choose a new next action after reopening.`
    change("Deal status", "Lost", "Open");change("Stage", deal.pipelineStageName, destination.name);change("Reason", null, text(input.reason))
  } else if (operation === "mark_lost") {
    if (!lossLabels[text(input.reasonCode)] || (input.reasonCode === "other" && !text(input.details))) throw new Error("Choose a loss reason and explain an Other reason before closing this deal.")
    title = "Mark deal lost"; description = `Close ${deal.name} as lost and cancel its current next action.${input.revisitDate ? " A revisit task will be created for the deal owner." : ""}`
    change("Deal status", deal.statusName || "Open", "Lost");change("Loss reason", null, lossLabels[text(input.reasonCode)])
    for(const [key,label] of [["details","Details"],["competitor","Competitor"],["revisitDate","Revisit date"]])if(text(input[key]))change(label,null,text(input[key]))
  } else throw new Error("That deal sales action is not supported.")
  return { title, description, changes }
}
