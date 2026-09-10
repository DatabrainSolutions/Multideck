import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWarehousePortalReference } from "@/lib/warehouse";
import {
  listLiveCustomerGrants,
  type LiveCustomerGrant,
  lookupLiveCustomer,
  saveLiveCustomerGrant,
} from "@/lib/live-customer-grants";

export function CustomerLiveGrantWorkspace(
  { customerId }: { customerId: string },
) {
  const [grants, setGrants] = useState<LiveCustomerGrant[]>([]),
    [facilities, setFacilities] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<LiveCustomerGrant | null>(null),
    [id, setId] = useState("");
  const [email, setEmail] = useState(""),
    [checkedEmail, setCheckedEmail] = useState(""),
    [profiles, setProfiles] = useState<{ id: number; name: string }[]>([]),
    [profileId, setProfileId] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [enabled, setEnabled] = useState(true),
    [products, setProducts] = useState(false),
    [orders, setOrders] = useState(false),
    [purchase, setPurchase] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      listLiveCustomerGrants(customerId),
      getWarehousePortalReference(),
    ]).then(([rows, reference]) => {
      if (active) {
        setGrants(rows);
        setFacilities(reference.facilities);
      }
    }).catch((e) => {
      if (active) {
        setError(
          e instanceof Error
            ? e.message
            : "Customer access could not be loaded.",
        );
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [customerId, revision]);
  function edit(g: LiveCustomerGrant | null) {
    setEditing(g);
    setId(g?.id ?? crypto.randomUUID());
    setEmail(g?.email ?? "");
    setCheckedEmail(g?.email ?? "");
    setProfiles([]);
    setProfileId(g?.live_customer_id ?? null);
    setSelected(g?.facility_ids ?? []);
    setEnabled(g?.enabled ?? true);
    setProducts(g?.products_enabled ?? false);
    setOrders(g?.orders_enabled ?? false);
    setPurchase(g?.purchase_orders_enabled ?? false);
    setError("");
    setFeedback("");
    setOpen(true);
  }
  async function checkEmail(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const target = await lookupLiveCustomer(customerId, email);
      setEmail(target.email);
      setCheckedEmail(target.email);
      setProfiles(target.profiles);
      setProfileId(target.profiles.length === 1 ? target.profiles[0].id : null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The customer could not be found.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await saveLiveCustomerGrant(customerId, {
        action: "save",
        id,
        email,
        liveCustomerId: profileId,
        facilityIds: selected,
        enabled,
        productsEnabled: products,
        ordersEnabled: orders,
        purchaseOrdersEnabled: purchase,
        expectedVersion: editing?.version ?? null,
      });
      setGrants((rows) => [...rows.filter((g) => g.id !== result.id), result]);
      setOpen(false);
      setFeedback(
        result.syncMessage ??
          (result.enabled
            ? "Customer access saved in App and Multideck Live."
            : "Customer access disabled."),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Customer access could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  const ready = Boolean(checkedEmail && profileId);
  return (
    <section
      aria-labelledby="live-access-title"
      className="space-y-5 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="live-access-title" className="text-lg font-medium">
            Customer access
          </h2>
          <p className="mt-1 text-sm text-[var(--md-text)]">
            Choose who can access this company's warehouse through Multideck
            Live.
          </p>
        </div>
        {!open && !loading && !error
          ? <Button onClick={() => edit(null)}>Add customer access</Button>
          : null}
      </div>
      {loading ? <p role="status">Loading customer access…</p> : null}
      {error
        ? (
          <div role="alert" className="space-y-2 text-sm text-[var(--md-red)]">
            <p>{error}</p>
            {!open
              ? (
                <Button
                  variant="outline"
                  onClick={() => setRevision((v) => v + 1)}
                >
                  Try again
                </Button>
              )
              : null}
          </div>
        )
        : null}
      {feedback ? <p role="status" className="text-sm">{feedback}</p> : null}
      {open
        ? (
          <div className="max-w-2xl space-y-5">
            {!ready
              ? (
                <form onSubmit={checkEmail} className="space-y-3">
                  <label className="grid gap-2 text-sm">
                    Customer email<Input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setCheckedEmail("");
                        setProfileId(null);
                        setProfiles([]);
                      }}
                      required
                      maxLength={254}
                      disabled={busy}
                    />
                  </label>
                  <p className="text-sm text-[var(--md-subtle)]">
                    Use their existing Multideck Live customer login. New
                    customers can be invited in{" "}
                    <a
                      className="underline"
                      href="https://multideck.live/admin"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Live Admin
                    </a>.
                  </p>
                  {!checkedEmail
                    ? (
                      <Button disabled={busy}>
                        {busy ? "Checking…" : "Continue"}
                      </Button>
                    )
                    : null}
                  {checkedEmail && profiles.length > 1
                    ? (
                      <label className="grid gap-2 text-sm">
                        Customer profile<select
                          className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-3"
                          value={profileId ?? ""}
                          onChange={(e) =>
                            setProfileId(Number(e.target.value) || null)}
                          disabled={busy}
                        >
                          <option value="">Choose a customer profile</option>
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </label>
                    )
                    : null}
                </form>
              )
              : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{email}</p>
                    {profiles.find((p) => p.id === profileId)
                      ? (
                        <p className="text-sm text-[var(--md-subtle)]">
                          {profiles.find((p) => p.id === profileId)?.name}
                        </p>
                      )
                      : null}
                  </div>
                  {!editing
                    ? (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setCheckedEmail("");
                          setProfileId(null);
                        }}
                      >
                        Change customer
                      </Button>
                    )
                    : null}
                </div>
              )}
            {ready || (editing && !enabled)
              ? (
                <form onSubmit={save} className="space-y-5">
                  <fieldset disabled={busy} className="space-y-2">
                    <legend className="mb-2 text-sm font-medium">
                      Warehouses they can see
                    </legend>
                    {facilities.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(f.id)}
                          onChange={(e) =>
                            setSelected((ids) =>
                              e.target.checked
                                ? [...ids, f.id]
                                : ids.filter((id) => id !== f.id)
                            )}
                        />
                        {f.name}
                      </label>
                    ))}
                    {!facilities.length
                      ? (
                        <p className="text-sm text-[var(--md-subtle)]">
                          No warehouses are available to your account.
                        </p>
                      )
                      : null}
                    <p className="text-sm text-[var(--md-subtle)]">
                      Stock visibility is included. Warehouses must already be
                      assigned to this company.
                    </p>
                  </fieldset>
                  <fieldset disabled={busy} className="grid gap-2 text-sm">
                    <legend className="mb-2 font-medium">
                      What they can do
                    </legend>
                    {[["Create and rename products", products, setProducts], [
                      "Create general orders",
                      orders,
                      setOrders,
                    ], ["Create purchase orders", purchase, setPurchase]].map((
                      [label, value, setter],
                    ) => (
                      <label
                        key={String(label)}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(e) =>
                            (setter as (v: boolean) => void)(e.target.checked)}
                        />
                        {String(label)}
                      </label>
                    ))}
                  </fieldset>
                  {editing
                    ? (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => setEnabled(e.target.checked)}
                          disabled={busy}
                        />Access enabled
                      </label>
                    )
                    : null}
                  <Button disabled={busy || !selected.length}>
                    {busy
                      ? "Saving…"
                      : enabled
                      ? editing?.live_sync_status === "pending"
                        ? "Finish Live setup"
                        : "Save access"
                      : "Disable access"}
                  </Button>
                </form>
              )
              : null}
            {editing && !ready && enabled
              ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEnabled(false)}
                >
                  Disable existing access
                </Button>
              )
              : null}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        )
        : (
          <ul className="divide-y divide-[var(--md-line)]">
            {grants.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">
                    {g.email || "Existing customer access"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--md-subtle)]">
                    {!g.enabled
                      ? "Disabled"
                      : g.live_sync_status === "ready"
                      ? "Enabled"
                      : "Live setup pending"} · {g.facility_ids.map((id) =>
                        facilities.find((f) => f.id === id)?.name ??
                          "Assigned warehouse"
                      ).join(", ")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => edit(g)}
                >
                  {g.enabled && g.live_sync_status !== "ready"
                    ? "Finish Live setup"
                    : "Edit access"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      {!loading && !error && !open && !grants.length
        ? (
          <p className="text-sm text-[var(--md-subtle)]">
            No customers have been given Live access to this company yet.
          </p>
        )
        : null}
    </section>
  );
}
