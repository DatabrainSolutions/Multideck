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

## Release and hosted repeat

Source `e1869086bc36b563a9afaeb52abba2902dd13049` is verified on origin/dev.
Only Dexter changed: version 165, ACTIVE, JWT retained, bundle SHA-256
`53666e403b252a0e1d5cc7e564fd8ea77270cf6f4c6d5cb77ed4758080ba3be5`.
All 23 downloaded files match the checkout; other function metadata is unchanged.
Git deployment `dpl_EagcbfGi96JD8PdnyipSPE1W1aGY` is READY for that exact SHA
on the approved dev alias, without alias error or shared setup changes. The
frontend source is unchanged; no redundant client test/build is claimed here.

Fresh conversation `e73ddcf5-0209-422b-a818-4988c72a37d7` proposed the original
em-dash source text exactly in both visible review and stored arguments. Action
`11fefea8-54f5-4ebd-9bca-f106fd6e1552` remained prepared/unapproved while the DG
row count stayed one. Normal approval succeeded and created exact supplied
evidence `aecd5dc4-3058-4c0d-ab1a-6d2d1acd4d60` with operator attribution,
unknown flags and unchanged punctuation. See the
[approval/watch evidence](2026-09-07-dangerous-goods-approval-watch-evidence.md).
The earlier denied action stays declined and is not retried. Wider freight
acceptance, earlier approval requirements and exclusions remain intact.
