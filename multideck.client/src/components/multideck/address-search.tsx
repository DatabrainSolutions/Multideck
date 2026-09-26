import { useEffect, useState } from "react"
import { LocationAutocomplete } from "@/components/multideck/location-autocomplete"
import { Button } from "@/components/ui/button"
import type { SuggestedAddress } from "@/lib/location-search"

/** Suggestions live in the real address field; typing remains a manual override. */
export function AddressSearch({ value, onChange, onSelect, disabled = false, label = "Address line 1", confirm = false, onSaveText, field = "line1", hideLabel = false, required = false, id, error, inputClassName }: {
  value: string
  onChange?: (value: string) => void
  onSelect: (address: SuggestedAddress) => void | Promise<void>
  disabled?: boolean
  label?: string
  confirm?: boolean
  onSaveText?: (value: string) => Promise<void>
  field?: "line1" | "postZipCode"
  hideLabel?: boolean
  required?: boolean
  id?: string
  error?: string
  inputClassName?: string
}) {
  const [draft, setDraft] = useState(value)
  const [pending, setPending] = useState<SuggestedAddress | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  useEffect(() => { setDraft(value); setPending(null) }, [value])
  const edited = confirm && (pending || draft !== value)
  return <div className="grid min-w-0 gap-2"><LocationAutocomplete id={id} label={label} hideLabel={hideLabel} required={required} error={error} inputClassName={inputClassName}
    value={confirm ? draft : value} onChange={text => { setDraft(text); setPending(null); setSaveError(""); if (!confirm) onChange?.(text) }} disabled={disabled || saving}
    hint="" placeholder={field === "line1" ? "Start typing an address or place" : label}
    onSelect={suggestion => {
      if (!suggestion.address) return
      setSaveError("")
      if (confirm) { setDraft(suggestion.address[field]); setPending(suggestion.address) }
      else void onSelect(suggestion.address)
    }} />
    {edited ? <div className="grid gap-2">{pending ? <p className="text-[11px] text-[var(--md-subtle)]">{[pending.line1, pending.townCity, pending.countyState, pending.postZipCode, pending.countryCode].filter(Boolean).join(", ")}</p> : null}<div className="flex gap-2"><Button type="button" size="sm" disabled={disabled || saving} onClick={async () => { setSaving(true); setSaveError(""); try { if (pending) await onSelect(pending); else await onSaveText?.(draft); setPending(null) } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "Address could not be saved.") } finally { setSaving(false) } }}>{saving ? "Saving…" : "Save address"}</Button><Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => { setPending(null); setDraft(value); setSaveError("") }}>Cancel</Button></div></div> : null}
    {saveError ? <p role="alert" className="text-[12px] text-[var(--md-red)]">{saveError}</p> : null}
  </div>
}
