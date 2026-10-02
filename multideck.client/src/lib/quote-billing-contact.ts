/** A legacy email in the name slot is not a person's full name. Never derive one from it. */
export function quoteBillingContactName(savedName: string | null | undefined, linkedName?: string | null) {
  return [savedName, linkedName].find(value => value?.trim() && !value.includes('@'))?.trim() ?? ''
}
