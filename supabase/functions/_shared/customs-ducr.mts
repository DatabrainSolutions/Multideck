// Pure ESM reference rules shared by the editor and submission gate. No services or secrets.
export function ducrFormatError(value: string): string | null {
  if (!value.trim()) return "Add a DUCR.";
  if (value.length > 35) return "DUCR must contain no more than 35 characters.";
  const parts = value.match(/^\d([A-Z]{2})([A-Z0-9]{1,15})-([A-Z0-9-]{1,18})$/);
  if (!parts) return "Use one year digit, the registered EORI, a hyphen and the job reference, in uppercase.";
  if (["GB", "XI"].includes(parts[1]) && !/^\d{12}$/.test(parts[2])) {
    return "A GB or XI DUCR needs the 12 digits of the registered EORI before the hyphen.";
  }
  return null;
}

export function generateDucr(eori: string, jobReference: string, allocationYear: number): string | null {
  const registeredEori = eori.trim().toUpperCase();
  const reference = jobReference.trim().toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{1,15}$/.test(registeredEori) || !Number.isInteger(allocationYear) || allocationYear < 2000 || allocationYear > 9999) return null;
  const value = `${allocationYear % 10}${registeredEori}-${reference}`;
  return ducrFormatError(value) ? null : value;
}

// Keep a generated reference aligned while preparing a draft, but never replace
// a manual/existing reference or an identifier already sent to the provider.
export function ducrToAutoPopulate(input: {
  current: string; previouslyGenerated?: string; eori: string; jobReference: string;
  allocationYear: number; submitted: boolean;
}): string | null {
  if (input.submitted || (input.current && input.current !== input.previouslyGenerated)) return null;
  const next = generateDucr(input.eori, input.jobReference, input.allocationYear) ?? "";
  return next === input.current ? null : next;
}

export function requiredImportReferences(input: { badgeId?: unknown; ducr?: unknown }): string[] {
  const issues: string[] = [];
  if (typeof input.badgeId !== "string" || !input.badgeId.trim()) issues.push("Select a badge code.");
  const error = ducrFormatError(typeof input.ducr === "string" ? input.ducr : "");
  if (error) issues.push(error);
  return issues;
}
