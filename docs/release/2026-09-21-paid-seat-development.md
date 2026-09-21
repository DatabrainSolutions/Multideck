# Development paid-seat deployment

Development project `aqtwypsuijxlnvtxpuxe` is configured for 50 contracted seats
(Ultra), with normal enforcement and no environment exemption. Its existing
workspace policy was updated separately from the migrations; no customer count
or development exception is embedded in the tenant baseline.

The deployed database change `paid_seat_pricing_capacity_preserve_voice` applies
both `20260921120000_paid_seat_pricing_and_capacity.sql` and
`20260921130000_preserve_paid_seat_voice_usage.sql` together. The second preserves
the existing voice category while routing its base categories through paid-seat
allowances. Do not replay these changes against Development based only on the
local filename timestamps; reconcile deployed objects and the migration ledger.

The Team function is version 78 and agent-dexter is version 285, both with JWT
verification enabled. Deployment retained the current live dependency bundles
and newer booking/finance safety instructions, then applied the scoped seat
checks and global subscription boundary. Both deployed entrypoints were read
back and matched the submitted source.

Verified live: 50 paid seats, 13 occupied, 37 available; GBP 11,445 plan price;
GBP 2,000 AI ledger allowance (USD 2,500 at the existing ledger convention);
50,000 document renders and 50,000 extracted pages monthly. Voice remains in
usage reporting. A transaction reduced capacity to current occupancy, confirmed
that the database rejects another active user with paid_seat_limit_reached,
checked browser-role contract privileges, and rolled back. The final read
confirmed 50 seats remained configured. No invitation email was sent by this test.

Validation: all 40 data-access regression tests passed, including real PostgreSQL
paid-seat concurrency and allowance tests. The dedicated voice PostgreSQL test
passed. Four broad Dexter source-contract tests fail identically before this
change (Customs filing copy, watch compilation, Home-email handling and provider
selection); these were not weakened. Authenticated browser invitation/reactivation
and external provider delivery are not claimed by the SQL or deployment checks.

New tenant releases must include both migrations and the matching Edge Functions.
Cloud provisioning must set AIUsagePolicy_PaidSeats from the approved contract;
never infer that count from active users or a marketing bracket. Existing
contracts remain unchanged until explicitly configured. Customer administrators
cannot grant themselves capacity. This deployment does not roll out to other
customer Supabase projects or change their subscriptions.
