import { useState } from "react"
import { LocationAutocomplete } from "@/components/multideck/location-autocomplete"
import { Button } from "@/components/ui/button"
import type { SuggestedAddress } from "@/lib/location-search"

/** Search once for a structured address; keep every populated field editable. */
export function AddressSearch({ onSelect, disabled = false, label = "Find an address", confirm = false }: {
  onSelect: (address: SuggestedAddress) => void | Promise<void>
  disabled?: boolean
  label?: string
  confirm?: boolean
}) {
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState<SuggestedAddress | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const select = (address: SuggestedAddress) => { setError(""); if (confirm) setPending(address); else void onSelect(address) }
  return <div className="grid gap-2"><LocationAutocomplete label={label} value={query} onChange={value => { setQuery(value); setPending(null) }} disabled={disabled || saving}
    hint="Search by place, address or postcode, or fill in the fields below. Review the details before saving."
    onUseText={line1 => select({ line1, line2: "", townCity: "", countyState: "", postZipCode: "", countryCode: "" })}
    onSelect={suggestion => { setQuery(suggestion.value); if (suggestion.address) select(suggestion.address) }} />
    {pending ? <div className="grid gap-2"><p className="text-[12px] text-[var(--md-text)]">{[pending.line1, pending.townCity, pending.countyState, pending.postZipCode, pending.countryCode].filter(Boolean).join(", ")}</p><div className="flex gap-2"><Button type="button" disabled={disabled || saving} onClick={async () => { setSaving(true); setError(""); try { await onSelect(pending); setPending(null); setQuery("") } catch (cause) { setError(cause instanceof Error ? cause.message : "Address could not be saved.") } finally { setSaving(false) } }}>{saving ? "Saving…" : "Use this address"}</Button><Button type="button" variant="ghost" disabled={saving} onClick={() => { setPending(null); setQuery("") }}>Cancel</Button></div></div> : null}
    {error ? <p role="alert" className="text-[12px] text-[var(--md-red)]">{error}</p> : null}
  </div>
}
