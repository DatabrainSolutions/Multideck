/** Public recovery guidance for a rejected prepared write. Keep raw details in audit. */
export function preparedActionErrorMessage(error: {code?: unknown; message?: unknown}) {
  const message = typeof error.message === 'string' ? error.message.trim() : ''
  if (message.startsWith('CRM_CONFLICT:') || error.code === '40001')
    return 'This record changed after the proposal was prepared. Ask Dexter to read it again and prepare a fresh approval. This change was not applied.'
  return message.slice(0, 300) || 'Dexter could not apply that approved change. Ask Dexter to check its current status before retrying.'
}
