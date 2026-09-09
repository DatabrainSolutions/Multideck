import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getWarehousePortalReference } from "@/lib/warehouse";
import {
  listLiveCustomerGrants,
  type LiveCustomerGrant,
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
    [editing, setEditing] = useState<LiveCustomerGrant | null>(null);
  const [id, setId] = useState(""),
    [connectionId, setConnectionId] = useState(""),
    [subjectId, setSubjectId] = useState(""),
    [keyId, setKeyId] = useState(""),
    [reason, setReason] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [enabled, setEnabled] = useState(false),
    [products, setProducts] = useState(false),
    [orders, setOrders] = useState(false),
    [purchase, setPurchase] = useState(false);
  const [revision, setRevision] = useState(0);
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
            : "Customer grants could not be loaded.",
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
    setConnectionId(g?.connection_id ?? "");
    setSubjectId(g?.subject_id ?? "");
    setKeyId("");
    setSelected(g?.facility_ids ?? []);
    setEnabled(g?.enabled ?? false);
    setProducts(g?.products_enabled ?? false);
    setOrders(g?.orders_enabled ?? false);
    setPurchase(g?.purchase_orders_enabled ?? false);
    setReason("");
    setError("");
    setFeedback("");
    setOpen(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await saveLiveCustomerGrant(customerId, {
        id,
        connectionId,
        subjectId,
        keyId,
        facilityIds: selected,
        enabled,
        productsEnabled: products,
        ordersEnabled: orders,
        purchaseOrdersEnabled: purchase,
        expectedVersion: editing?.version ?? null,
        reason,
      });
      setGrants((rows) => [...rows.filter((g) => g.id !== result.id), result]);
      setOpen(false);
      setFeedback(
        "Customer grant saved. Use its reference to verify the customer assignment in Multideck Live.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The grant could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-labelledby="live-grants-title"
      className="space-y-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="live-grants-title" className="text-lg font-medium">
            Multideck Live access
          </h2>
          <p className="mt-1 text-sm text-[var(--md-text)]">
            Choose what this customer's users can do through the central portal.
          </p>
        </div>
        {!open && !loading && !error
          ? <Button onClick={() => edit(null)}>Add customer grant</Button>
          : null}
      </div>
      {loading ? <p role="status">Loading customer grants…</p> : null}
      {error
        ? (
          <div role="alert" className="text-sm text-[var(--md-red)]">
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
          <form onSubmit={save} className="space-y-4">
            <p className="text-sm text-[var(--md-subtle)]">
              Copy the connection and user references from Live administration.
              The integration key itself stays on the server.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[["Connection reference", connectionId, setConnectionId, true], [
                "Live user reference",
                subjectId,
                setSubjectId,
                true,
              ], ["Key identifier", keyId, setKeyId, false]].map((
                [label, value, setter, identity],
              ) => (
                <label key={String(label)} className="grid gap-2 text-sm">
                  {String(label)}
                  <Input
                    value={String(value)}
                    onChange={(e) =>
                      (setter as (v: string) => void)(e.target.value)}
                    required
                    disabled={busy || Boolean(editing && identity)}
                    maxLength={128}
                  />
                </label>
              ))}
            </div>
            <fieldset disabled={busy} className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Warehouses</legend>
              {facilities.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(f.id)}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, f.id]
                          : ids.filter((id) =>
                            id !== f.id
                          )
                      )}
                  />
                  {f.name}
                </label>
              ))}
            </fieldset>
            <fieldset disabled={busy} className="grid gap-2 text-sm">
              <legend className="mb-2 font-medium">Permissions</legend>
              {[
                ["Access enabled", enabled, setEnabled],
                ["Create and rename products", products, setProducts],
                ["Create general orders", orders, setOrders],
                ["Create purchase orders", purchase, setPurchase],
              ].map(([label, value, setter]) => (
                <label key={String(label)} className="flex items-center gap-2">
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
            <label className="grid gap-2 text-sm">
              Reason for change<Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={500}
                disabled={busy}
              />
            </label>
            <div className="flex gap-2">
              <Button disabled={busy || !selected.length}>
                {busy ? "Saving…" : "Save grant"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )
        : (
          <ul className="divide-y divide-[var(--md-line)]">
            {grants.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm">Grant {g.id}</p>
                  <p className="mt-1 text-xs text-[var(--md-subtle)]">
                    {g.enabled ? "Enabled" : "Disabled"} ·{" "}
                    {g.facility_ids.length} warehouses
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => edit(g)}
                >
                  Edit grant
                </Button>
              </li>
            ))}
          </ul>
        )}
      {!loading && !error && !open && !grants.length
        ? (
          <p className="text-sm text-[var(--md-subtle)]">
            No Live customer grants yet.
          </p>
        )
        : null}
    </section>
  );
}
