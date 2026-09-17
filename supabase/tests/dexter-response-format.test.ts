import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateBackgroundOutcome } from '../functions/agent-dexter/background-task.ts'

const options = { phase: 'discover', watchIds: new Set<string>(), hasPending: false }
const outcome = (summary: string) => ({ status: 'ready', outcome: 'deliver_result', summary, run_at: null, watch_id: null })

test('background task results reject collapsed agendas and inline priority lists', () => {
  for (const summary of [
    'Meetings found: 09:30-10:00 Brainstormer; 10:00-10:30 UCN Meeting; 12:00-13:00 GTM.',
    'Three priorities: (1) Review Meridian. (2) Check Horizon. (3) Follow up Northstar.',
  ]) assert.throws(() => validateBackgroundOutcome(outcome(summary), options), /one Markdown bullet or table row/)
})

test('structured answers and source URLs pass unchanged', () => {
  for (const summary of [
    'Tuesday, BST.\n\n## Meetings\n\n- **09:30–10:00** [Brainstormer](/calendar "Brainstormer")\n- **10:00–10:30** UCN Meeting\n\n## Attention\n\nTwo meetings overlap.',
    '## Priorities\n\n1. Review Meridian.\n2. Check Horizon.\n3. Follow up Northstar.',
    'Meetings found: [one meeting](/calendar?filter=slot; 10:00-11:00 "Meeting").',
    'No meetings were found for that date.',
  ]) assert.equal(validateBackgroundOutcome(outcome(summary), options).summary, summary)
})
