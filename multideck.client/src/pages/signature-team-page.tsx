import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/multideck/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/i18n/language-provider";
import { DotGridLoader } from "@/components/multideck/dot-grid-loader";
import { inboxRequest } from "@/lib/inbox-api";
import {
  eligibleSignatures,
  type SignatureTemplate,
  updateSignaturePolicy,
} from "@/lib/email-signatures";

const fields = {
  name: "Name",
  jobTitle: "Job title",
  email: "Signature email",
  phone: "Work phone",
  mobile: "Mobile",
  address: "Office address",
  website: "Website",
  company: "Company",
} as const;
type Field = keyof typeof fields;
type Person = {
  id: string;
  name: string;
  email: string;
  departmentIds: string[];
  allowCustomisation: boolean | null;
  profileValues: Record<Field, string>;
  overrides: Partial<Record<Field, string>>;
  profileRevision: number;
} & Record<Field, string>;
type Workspace = {
  people: Person[];
  departments: { id: string; name: string }[];
  templates: SignatureTemplate[];
  policy: { allow_customisation: boolean; website: string; revision: number; company_details?: Record<string,string> };
};
const request = <T,>(path: string, options: RequestInit = {}) =>
  inboxRequest<T>(path, { ...options, normalize: (payload) => payload as T });

function DetailCell(
  { person, field, onSave }: {
    person: Person;
    field: Field;
    onSave: (
      person: Person,
      field: Field,
      value: string | null,
    ) => Promise<void>;
  },
) {
  const cancelBlur = useRef(false);
  const dirty = useRef(false);
  const value = person[field] || "";
  const [draft, setDraft] = useState(value),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!dirty.current) setDraft(value);
  }, [value]);
  const overridden = Object.hasOwn(person.overrides, field);
  const FieldInput = field === "address" ? Textarea : Input;
  async function save(next: string | null) {
    setBusy(true);
    setError("");
    try {
      await onSave(person, field, next);
      dirty.current = false;
      setDraft(next === null ? person.profileValues[field] : next.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="min-w-[150px] py-2"
      onClick={(e) => e.stopPropagation()}
    >
      <FieldInput
        aria-label={`${fields[field]} for ${person.profileValues.name}`}
        value={draft}
        maxLength={500}
        disabled={busy}
        className={field === "address" ? "min-h-24 whitespace-pre-wrap text-[12px]" : "h-8 text-[12px]"}
        onChange={(e) => {
          dirty.current = true;
          setDraft(e.target.value);
        }}
        onBlur={() => {
          if (cancelBlur.current) {
            cancelBlur.current = false;
            return;
          }
          if (draft !== value) void save(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && field !== "address") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelBlur.current = true;
            dirty.current = false;
            setDraft(value);
            setError("");
            e.currentTarget.blur();
          }
        }}
      />
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[var(--md-subtle)]">
        <span>
          {busy ? "Saving…" : overridden ? "Admin override" : "From profile"}
        </span>
        {overridden
          ? (
            <button
              type="button"
              disabled={busy}
              className="text-[var(--md-accent)] underline underline-offset-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void save(null)}
              aria-label={`Reset ${
                fields[field]
              } for ${person.profileValues.name} to profile`}
            >
              Reset to profile
            </button>
          )
          : null}
      </div>
      {error
        ? (
          <div role="alert" className="mt-1 text-[11px] text-[var(--md-red)]">
            {error}
            <button className="ml-2 underline" onClick={() => void save(draft)}>
              Retry
            </button>
          </div>
        )
        : null}
    </div>
  );
}

export function SignatureTeamPage(
  { navigate }: { navigate: (path: string) => void },
) {
  const { t } = useLanguage();
  const [companyDraft, setCompanyDraft] = useState<Record<string,string> | null>(null);
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companySaved, setCompanySaved] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [department, setDepartment] = useState(""),
    [policyBusy, setPolicyBusy] = useState(false);
  async function load() {
    try {
      setWorkspace(await request<Workspace>("/signatures/team"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const refresh = () => {
      void load();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  async function save(person: Person, field: Field, value: string | null) {
    let updated: Person;
    try {
      updated = await request<Person>("/signatures/team", {
        method: "PATCH",
        body: JSON.stringify({
          userId: person.id,
          field,
          value,
          expectedRevision: person.profileRevision,
        }),
      });
    } catch (e) {
      await load();
      throw e;
    }
    setWorkspace((w) =>
      w
        ? {
          ...w,
          people: w.people.map((p) => p.id === updated.id ? updated : p),
        }
        : w
    );
  }
  async function policy(userId: string | undefined, value: boolean | null) {
    setPolicyBusy(true);
    try {
      await updateSignaturePolicy({
        userId,
        allowCustomisation: value,
        website: workspace?.policy.website,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPolicyBusy(false);
    }
  }
  const columns: DataTableColumn<Person>[] = [
    {
      id: "person",
      label: "Person",
      kind: "identity",
      width: 210,
      canHide: false,
      cell: (p) => (
        <div>
          <div>{p.profileValues.name}</div>
          <div className="text-[11px] text-[var(--md-subtle)]">
            {p.profileValues.email}
          </div>
        </div>
      ),
    },
    ...Object.entries(fields).map(([field, label]) => ({
      id: field,
      label,
      width: 210,
      kind: "custom" as const,
      sortValue: (p: Person) => p[field as Field],
      cell: (p: Person) => (
        <DetailCell person={p} field={field as Field} onSave={save} />
      ),
    })),
    {
      id: "department",
      label: "Department",
      width: 160,
      cell: (p) =>
        workspace?.departments.filter((d) => p.departmentIds.includes(d.id))
          .map((d) => d.name).join(", ") || "—",
    },
    {
      id: "signature",
      label: "Assigned signatures",
      width: 190,
      cell: (p) =>
        workspace
          ? eligibleSignatures(
            workspace.templates,
            p.id,
            p.departmentIds,
            false,
          ).map((t) => t.name).join(", ") || "Unassigned"
          : "—",
    },
    {
      id: "customisation",
      label: t("Personal customisation"),
      width: 200,
      cell: (p) => (
        <Select
          disabled={policyBusy}
          value={p.allowCustomisation === null
            ? "default"
            : String(p.allowCustomisation)}
          onValueChange={(value) =>
            void policy(
              p.id,
              (value === "__empty" ? "" : value) === "default" ? null : (value === "__empty" ? "" : value) === "true",
            )}
>
<SelectTrigger aria-label={`${t("Personal customisation")} for ${p.profileValues.name}`} className="w-full min-w-0 text-[12px]"><SelectValue /></SelectTrigger>
<SelectContent>
          <SelectItem value="default">Company default</SelectItem>
          <SelectItem value="true">Allow personal copy</SelectItem>
          <SelectItem value="false">Company managed</SelectItem>
        </SelectContent></Select>
      ),
    },
  ];
  return (
    <div className="md-page md-page-stack">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/email-signatures")}
          >
            ← Email signatures
          </Button>
          <h1 className="mt-3 text-[22px] font-medium">
            Signature team details
          </h1>
          <p className="mt-2 max-w-[700px] text-[13px] text-[var(--md-subtle)]">
            Profile details stay up to date automatically. Edit a field to
            override it for signatures, or reset it to follow the profile again.
          </p>
          <p className="mt-1 text-[11px] text-[var(--md-subtle)]">
            Enter the full office postal address, including town, postcode and country, on separate lines. These line breaks are kept in signatures.
          </p>
          <p className="mt-1 text-[11px] text-[var(--md-subtle)]">
            Signature email changes the displayed contact address only. Mailbox
            sending permissions stay the same.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Refresh details
        </Button>
      </div>
      {workspace ? <section className="space-y-4 rounded-xl bg-[var(--md-surface)] p-5 shadow-[var(--md-premium-stroke)]" aria-label="Company details">
        <div><h2 className="text-[15px] font-medium">Company details</h2><p className="mt-1 text-[12px] text-[var(--md-subtle)]">Shared details for the Company details signature block. Empty fields are hidden.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries({name:"Company name",website:"Company website",phone:"Company phone",email:"Company email",address:"Company address"}).map(([field,label])=>{const CompanyInput=field === "address" ? Textarea : Input; return <label key={field} className="grid gap-2 text-[12px]">{label}<CompanyInput value={(companyDraft ?? workspace.policy.company_details)?.[field] ?? (field === "website" ? workspace.policy.website : field === "name" ? workspace.people[0]?.company : "") ?? ""} onChange={event=>{setCompanySaved(false);setCompanyDraft(draft=>({...Object.fromEntries(["name","website","phone","email","address"].map(key=>[key,workspace.policy.company_details?.[key] ?? (key === "website" ? workspace.policy.website : key === "name" ? workspace.people[0]?.company : "") ?? ""])),...draft,[field]:event.target.value}));}} /></label>})}
        </div>
        <div className="flex items-center gap-3"><Button disabled={!companyDraft || companyBusy} onClick={async()=>{setCompanyBusy(true);setError("");try{await request("/signatures/company",{method:"PATCH",body:JSON.stringify({...companyDraft,expectedRevision:workspace.policy.revision})});await load();setCompanyDraft(null);setCompanySaved(true);}catch(e){setError((e as Error).message);}finally{setCompanyBusy(false);}}}>{companyBusy ? "Saving…" : "Save company details"}</Button>{companySaved ? <span role="status" className="text-[12px] text-[var(--md-subtle)]">Company details saved</span> : null}</div>
      </section> : null}
      {error
        ? (
          <div role="alert" className="text-[13px] text-[var(--md-red)]">
            {error}
          </div>
        )
        : null}
      {!workspace && !error ? <DotGridLoader /> : workspace
        ? (
          <DataTable
            ariaLabel="Signature team details"
            storageKey="signature-team-details"
            columns={columns}
            rows={workspace.people.filter((p) =>
              (!department || p.departmentIds.includes(department)) &&
              [p.name, p.email, p.profileValues.name].join(" ").toLowerCase()
                .includes(search.toLowerCase())
            )}
            getRowKey={(p) => p.id}
            enableSelectionExport={false}
            toolbarSearch={
              <Input
                aria-label="Search signature team"
                placeholder="Search people…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            }
            toolbarFilters={
              <Select
                value={department || "__empty"}
                onValueChange={(value) => setDepartment((value === "__empty" ? "" : value))}
>
<SelectTrigger aria-label="Filter by department" className="w-full min-w-0 text-[12px]"><SelectValue /></SelectTrigger>
<SelectContent>
                <SelectItem value="__empty">All departments</SelectItem>
                {workspace.departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent></Select>
            }
            toolbarOptions={
              <label className="flex items-center gap-2 text-[12px]">
                <input
                  type="checkbox"
                  disabled={policyBusy}
                  checked={workspace.policy.allow_customisation}
                  onChange={(e) => void policy(undefined, e.target.checked)}
                />Allow personal copies by default
              </label>
            }
            emptyState="No people match these filters."
          />
        )
        : null}
    </div>
  );
}
