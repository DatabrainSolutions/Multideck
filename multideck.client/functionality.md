# Multideck Functionality Notes

This file captures intended product behavior that is currently represented as UI practice. Use it when wiring real data, backend actions, or agent workflows.

## Agent Dexter

### First Visit

- Opening `/agent-dexter` should show one centered prompt box.
- The default specialist is `Auto`.
- Auto should route the request to the most relevant specialist based on the user's prompt and attached context.
- Suggested prompts are examples only; selecting one should start a realistic thread and choose the appropriate specialist.

### Specialist Selection

- Clicking the specialist chip inside the prompt opens the specialist selector.
- On the landing state, the selector can expand below the prompt.
- When the prompt is docked at the bottom, the selector should open as a compact vertical list above the prompt, aligned to the prompt's left edge.
- Opening the selector should blur and dim the background content while keeping the prompt and selector readable.
- Selecting a specialist should close the selector immediately and update the chip in the prompt.

### Attachments

- Clicking `Attach` opens a context picker for shipments, customers, and documents.
- Opening the picker should blur and dim the background content.
- The picker should show recommended items based on the active thread before the full grouped result list.
- Recommendations should be driven by the current conversation context:
  - If a customer is mentioned, recommend that customer's active shipments, contacts, and recent documents.
  - If a shipment ID is mentioned, recommend that shipment, its customer, and its document set.
  - If a document is discussed, recommend the linked shipment and customer.
- Selecting a shipment, customer, or document should immediately close the picker.
- The selected item should be added as a context chip in the prompt box.
- Attached context chips should be removable from the prompt before sending.
- Backend implementation should treat attached items as live context, not plain text labels.

### Conversation Start

- Sending the first prompt should smoothly morph the prompt box from the centered landing position to the bottom composer.
- The prompt box should never disappear during this transition.
- The history rail and watcher rail should slide in after the prompt starts moving, not pop in before it.
- The bottom prompt should remain interactive after the conversation starts.

### Watchers

- Watcher cards in the `Watching for you` rail should be clickable.
- The watcher rail can collapse to give the conversation more working width.
- Collapsing the watcher rail should keep the current thread, draft prompt, specialist, and attached context intact.
- Conversation content should never require horizontal scrolling. Tables, result cards, and structured answers should wrap or reflow inside the middle conversation pane.
- Clicking a watcher opens a right-side detail drawer.
- The background should blur and dim while the detail drawer is open.
- The detail drawer should show:
  - Watcher title and status.
  - Trigger condition.
  - Related shipment/customer context.
  - Recent trend or evidence.
  - Activity history.
  - Current conditions.
  - Actions: pause, edit conditions, delete.
- Closing the drawer should return the operator to the thread without losing draft prompt content.

### Approval Principle

- Dexter may draft notes, customer messages, and recommendations.
- Nothing customer-facing should send without explicit operator approval unless a future workspace setting allows it.
