import { ducrFormatError, ducrToAutoPopulate, generateDucr, requiredImportReferences } from "./customs-ducr.mts";
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

Deno.test("DUCR uses the allocation year, complete EORI and job reference without doubling the country", () => {
  assert(generateDucr("GB123456789000", "JC000123", 2026) === "6GB123456789000-JC000123", "Unexpected UK DUCR");
  assert(generateDucr("GB123456789001", "JI000456", 2026) === "6GB123456789001-JI000456", "Office EORI changed");
  assert(generateDucr("DE123456789012345", "JE001", 2026) === "6DE123456789012345-JE001", "Non-UK EORI truncated");
  assert(generateDucr("GB123456789000", "JC001", 2030) === "0GB123456789000-JC001", "Year digit incorrect");
  assert(!ducrFormatError("5GB123456789000-JC001"), "Existing prior-year DUCR must remain usable");
});

Deno.test("invalid EORIs and references are rejected rather than repaired or truncated", () => {
  for (const [eori, job] of [["GB123456789", "JC001"], ["GB123456789000", ""], ["", "JC001"], ["GB123456789000", "JC 001"], ["GB123456789000", "J".repeat(19)], ["DE" + "1".repeat(15), "J".repeat(18)]]) {
    assert(generateDucr(eori, job, 2026) === null, `Invalid inputs accepted: ${eori}, ${job}`);
  }
  for (const value of ["26GB123456789000-JC001", "6GBGB123456789000-JC001", "6GB123456789000JC001", "6gb123456789000-jc001", "6GB123456789000-JC/001"]) {
    assert(Boolean(ducrFormatError(value)), `Invalid DUCR accepted: ${value}`);
  }
});

Deno.test("submission requires both badge and valid DUCR but drafts can remain incomplete", () => {
  assert(requiredImportReferences({}).length === 2, "Both mandatory fields should be reported");
  assert(requiredImportReferences({ badgeId: "GRK", ducr: "6GB123456789000-JC001" }).length === 0, "Valid references blocked");
  assert(requiredImportReferences({ badgeId: " ", ducr: "6GB123456789000-JC001" }).length === 1, "Blank badge accepted");
  assert(requiredImportReferences({ badgeId: "GRK", ducr: "invalid" }).length === 1, "Invalid DUCR accepted");
});

Deno.test("autofill follows a completed job reference and office changes without replacing manual or submitted identifiers", () => {
  const input = { current: "", eori: "GB123456789000", jobReference: "J", allocationYear: 2026, submitted: false };
  const partial = ducrToAutoPopulate(input)!;
  const complete = ducrToAutoPopulate({ ...input, current: partial, previouslyGenerated: partial, jobReference: "JC001" })!;
  assert(complete === "6GB123456789000-JC001", "Partial job reference was retained");
  assert(ducrToAutoPopulate({ ...input, current: complete, previouslyGenerated: complete, jobReference: "JC001", eori: "GB123456789001" }) === "6GB123456789001-JC001", "Office override not reflected");
  assert(ducrToAutoPopulate({ ...input, current: complete, previouslyGenerated: complete, jobReference: "" }) === "", "Stale generated reference retained when job removed");
  assert(ducrToAutoPopulate({ ...input, current: complete, jobReference: "JC002" }) === null, "Manual reference replaced");
  assert(ducrToAutoPopulate({ ...input, current: complete, previouslyGenerated: complete, submitted: true }) === null, "Submitted reference replaced");
  assert(ducrToAutoPopulate({ ...input, current: complete, previouslyGenerated: complete, jobReference: "JC001" }) === null, "Unchanged reference rewritten");
});
