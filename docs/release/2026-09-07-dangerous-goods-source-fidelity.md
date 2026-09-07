# Dangerous-goods source fidelity correction

Hosted Dexter proposal in conversation `15576d91-1749-4103-9e56-d9e86ad33362`
correctly read JE0991134 cargo 1 and waited for approval, but rewrote an em dash
inside the supplied source reference to a colon. Prepared action
`41531339-f60a-4c3b-aa49-3c76fdee80fd` was denied through the normal UI. It was
never approved; no new DG record was created. The prior voided record remains.

Concrete cause: both response paths call `sanitiseArguments`, whose recursive
string rewrite applies Dexter's prose punctuation rule to structured action
data. The proposed stored arguments, not just display text, contain the changed
source. An executable test of the actual parsing blocks reproduces the rewrite.

The correction exempts only `record_booking_dangerous_goods` from that prose
formatter in both paths. Its exact parsed values still pass through the existing
source-backed review, allowlisted action, mandatory approval and canonical SQL
validation. Prompt guidance explicitly treats these values as supplied data,
including punctuation, Unicode and line breaks. No generic SQL/tool writer,
approval relaxation, schema change or Customs/iCustoms path change is introduced.
Other action formatting remains unchanged and has an explicit regression check;
its broader source-fidelity implications are not claimed resolved by this scope.

54 focused tests pass (including existing source contracts), plus full Dexter
import-graph Deno checking and diff validation. The new behavioural check covers
both actual response parsers through the source review. Its first harness run
needed a function wrapper for TypeScript parsing; the corrected harness then
failed on the real data rewrite before the fix and passed afterwards.

Deployment and a fresh exact-text hosted proposal/approval remain required.
Hosted DG watch lifecycle and wider freight acceptance remain open. No approved
test record or watch exists from this attempt; do not approve/retry the denied
action. All earlier approval requirements and exclusions remain intact.
