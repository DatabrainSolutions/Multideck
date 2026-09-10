import assert from "node:assert/strict"
import test from "node:test"
import { readableWatchEvent, readableWatchSummary } from "../src/lib/dexter-watch-copy.ts"

const t = (text: string) => text

test("turns email watch rule syntax into an operator-facing description", () => {
  assert.equal(readableWatchSummary({
    title: "Invoice email from hazphillips@outlook.com",
    summary: "Detect an email from hazphillips@outlook.com containing invoice.",
    capability: "email",
    rule: { field: "searchText", operator: "contains_all", value: "hazphillips@outlook.com invoice" },
  }, t), "Emails from hazphillips@outlook.com that mention “invoice”.")
})

test("turns a technical record event into the change an operator needs to know", () => {
  assert.equal(readableWatchEvent({
    title: "Horizon robotics expansion becomes qualified",
    summary: "Watch this deal.",
    capability: "deals",
    targetLabel: "Horizon robotics expansion",
    rule: { field: "stage", operator: "eq", value: "Qualified" },
    latestEvent: {
      body: "Horizon robotics expansion: stage changed from New enquiry to Qualified.",
      changed: { field: "stage", before: "New enquiry", after: "Qualified" },
    },
  }, t), "Horizon robotics expansion moved from New enquiry to Qualified.")
})

test("makes a matching email update direct and readable", () => {
  assert.equal(readableWatchEvent({
    title: "Invoice email",
    summary: "Watch invoice emails.",
    capability: "email",
    rule: { field: "searchText", operator: "contains_all", value: "invoice" },
    latestEvent: {
      body: "New matching email from Harry Phillips: Fw: Update on booking ref 123.",
      changed: { senderName: "Harry Phillips", subject: "Fw: Update on booking ref 123" },
    },
  }, t), "Email from Harry Phillips: Fw: Update on booking ref 123")
})

test("address alerts show changed business fields without raw JSON or unchanged contact details", () => {
  const before = {Org_ID:"company-id",OrgAdd_PostZipCode:"B4 6QF",OrgAdd_MainEmail:"unchanged@example.test"}
  const watch = {title:"Address watch",summary:"",capability:"customers",targetLabel:"Demo company",rule:{field:"addresses",operator:"changed"},latestEvent:{body:"Raw fallback",changed:{field:"addresses",before:JSON.stringify(before),after:JSON.stringify({...before,OrgAdd_PostZipCode:"B4 6QE"})}}}
  assert.equal(readableWatchEvent(watch,t),"Demo company: Postcode changed from B4 6QF to B4 6QE.")
  watch.latestEvent.changed.after="{}"
  assert.equal(readableWatchEvent(watch,t),"Demo company: Address removed.")
  watch.latestEvent.changed.after="invalid"
  assert.equal(readableWatchEvent(watch,t),"Demo company: Address details changed.")
})


test("aggregate address alerts name only changed collections without exposing row JSON", () => {
  const before = {Org_ID:"company",purposes:[{type:"Main",isDefault:true}],weeklyHours:[],openingOverrides:[]}
  const after = {...before,weeklyHours:[{dayOfWeek:1,opensAt:"09:00",closesAt:"18:00"}],openingOverrides:[{date:"2026-12-25",isClosed:true}]}
  assert.equal(readableWatchEvent({title:"Address watch",summary:"",capability:"customers",targetLabel:"Demo company",rule:{field:"addresses",operator:"changed"},latestEvent:{body:"",changed:{field:"addresses",before:JSON.stringify(before),after:JSON.stringify(after)}}},t),"Demo company: Opening hours updated; Dated opening exceptions updated.")
})


test("company setup alerts use product field names", () => {
  assert.equal(readableWatchEvent({title:"Company watch",summary:"",capability:"customers",targetLabel:"Demo",rule:{field:"accountCode",operator:"changed"},latestEvent:{body:"",changed:{field:"accountCode",before:"CUS001",after:"CUS002"}}},t),"Demo: Company code changed from CUS001 to CUS002.")
})


test("office assignment alerts keep internal identifiers out of visible copy", () => {
  assert.equal(readableWatchEvent({title:"Company watch",summary:"",capability:"customers",targetLabel:"Demo",rule:{field:"responsibleOffices",operator:"changed"},latestEvent:{body:"",changed:{field:"responsibleOffices",before:'[]',after:'[{"officeId":"private-id","isPrimary":true}]'}}},t),"Demo: Responsible offices updated.")
})


test("related-party alerts do not print internal rule identifiers", () => {
  assert.equal(readableWatchEvent({title:"Company watch",summary:"",capability:"customers",targetLabel:"Demo",rule:{field:"relatedPartyDefaults",operator:"changed"},latestEvent:{body:"",changed:{field:"relatedPartyDefaults",before:'{}',after:'{"OrgRelatedDefault_TargetOrgID":"private-id"}'}}},t),"Demo: Related-party defaults updated.")
})

test("contact employment alerts do not print internal rule identifiers", () => {
  assert.equal(readableWatchEvent({title:"Company watch",summary:"",capability:"customers",targetLabel:"Demo",rule:{field:"contactEmployment",operator:"changed"},latestEvent:{body:"",changed:{field:"contactEmployment",before:'{}',after:'{"CRMContactOrg_ContactID":"private-id"}'}}},t),"Demo: Contact employment updated.")
})

test("contact email alerts do not print internal rule identifiers", () => {
  assert.equal(readableWatchEvent({title:"Company watch",summary:"",capability:"customers",targetLabel:"Demo",rule:{field:"contactEmails",operator:"changed"},latestEvent:{body:"",changed:{field:"contactEmails",before:'{}',after:'{"emailFingerprint":"private-id"}'}}},t),"Demo: Contact email details updated.")
})
